// =============================================================================
// Knowledge Base public API — Supabase Edge Function (Deno).
//
// The ONLY component that touches the database. Clients call these HTTP
// endpoints; they never see Postgres/PostgREST. The function authenticates to
// the DB with the service_role key (injected by Supabase, never shipped to
// clients) and delegates to the SQL RPCs defined in the migrations.
//
// Authorization
// -------------
// Every data endpoint requires a logged-in user (Supabase Auth email+password).
// The caller sends the project anon key plus a user access token:
//     apikey: <anon key>
//     Authorization: Bearer <user access token>
// The anon key alone (no user) is rejected with 401. Only `GET /` is open.
//
// For a server-to-server integration (e.g. a mobile app's own backend), the
// backend signs in as a dedicated Supabase "service account" user, obtains a
// JWT, and calls these endpoints the same way. See docs/MOBILE_INTEGRATION.md.
//
// Locale resolution (per request)
// -------------------------------
//   1. explicit ?locale=  (ru|en|es|de; anything else → en)
//   2. the user's stored profile.default_locale
//   3. 'ru' (project default)
//
// Routes (base = /functions/v1/kb):
//   GET  /                       → API descriptor (open)
//   GET  /me                     → current user + default_locale
//   PUT  /me  {default_locale}   → update default locale
//   GET  /topics                 → list topics
//   GET  /topics/:topicId/cards  → cards in a topic (?category= to filter, e.g. advice)
//   GET  /search                 → ranked search (?q, ?topic, ?limit, ?offset)
//   GET  /cards/:cardId          → single card (incl. keywords/subtopics/glossary/entities)
//   GET  /version                → current deployed data version
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const SUPPORTED_LOCALES = ['ru', 'en', 'es', 'de'];
const DEFAULT_LOCALE = 'ru';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' },
  });
}

function clampInt(raw: string | null, def: number, min: number, max: number): number {
  const n = Number.parseInt(raw ?? '', 10);
  if (Number.isNaN(n)) return def;
  return Math.min(Math.max(n, min), max);
}

function isLocale(l: string | null | undefined): l is string {
  return !!l && SUPPORTED_LOCALES.includes(l.toLowerCase());
}

/** Resolve the effective locale for a request: explicit → profile default → 'ru'. */
function resolveLocale(param: string | null, profileLocale: string | null): string {
  if (param) return isLocale(param) ? param.toLowerCase() : 'en';
  if (isLocale(profileLocale)) return profileLocale!.toLowerCase();
  return DEFAULT_LOCALE;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });

  const url = new URL(req.url);
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments[0] === 'kb') segments.shift();

  // --- Open route: descriptor ------------------------------------------------
  if (segments.length === 0 && req.method === 'GET') {
    return json({
      name: 'uruguay-knowledge-base-api',
      version: 1,
      auth: 'anon key (apikey header) + Bearer <user access token> required on all routes except GET /',
      default_locale: DEFAULT_LOCALE,
      supported_locales: SUPPORTED_LOCALES,
      endpoints: {
        me: 'GET /me · PUT /me {default_locale}',
        topics: 'GET /topics?locale&internal',
        topic_cards: 'GET /topics/:topicId/cards?locale&internal&category',
        questions: 'GET /questions?locale&topic&limit&internal  (ranked by ask_frequency; resolves to answer card)',
        search: 'GET /search?q&locale&topic&category&limit&offset&internal',
        card: 'GET /cards/:cardId?locale',
        version: 'GET /version',
      },
    });
  }

  // --- Require an authenticated user for everything else ---------------------
  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  const { data: userData } = await db.auth.getUser(token);
  const user = userData?.user ?? null;
  if (!user) return json({ error: 'unauthorized', message: 'Sign in required.' }, 401);

  try {
    // Load the user's stored default locale (lazily; row may not exist yet).
    const { data: profile } = await db
      .from('profiles')
      .select('default_locale')
      .eq('id', user.id)
      .maybeSingle();
    const profileLocale: string | null = profile?.default_locale ?? null;
    const localeParam = url.searchParams.get('locale');
    const locale = resolveLocale(localeParam, profileLocale);

    // GET /me · PUT /me
    if (segments.length === 1 && segments[0] === 'me') {
      if (req.method === 'GET') {
        return json({
          user_id: user.id,
          email: user.email,
          default_locale: profileLocale ?? DEFAULT_LOCALE,
        });
      }
      if (req.method === 'PUT') {
        let body: { default_locale?: string };
        try {
          body = await req.json();
        } catch {
          return json({ error: 'bad_request', message: 'Invalid JSON body.' }, 400);
        }
        const next = body?.default_locale?.toLowerCase();
        if (!isLocale(next)) {
          return json(
            { error: 'bad_request', message: `default_locale must be one of ${SUPPORTED_LOCALES.join(', ')}.` },
            400,
          );
        }
        const { data: updated, error } = await db
          .from('profiles')
          .upsert({ id: user.id, default_locale: next }, { onConflict: 'id' })
          .select('default_locale')
          .single();
        if (error) throw error;
        return json({ user_id: user.id, email: user.email, default_locale: updated.default_locale });
      }
      return json({ error: 'method_not_allowed' }, 405);
    }

    // All remaining routes are GET-only.
    if (req.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);

    // Signed-in users may opt into internal/unreviewed cards (?internal=1).
    const includeInternal = ['1', 'true', 'yes'].includes(
      (url.searchParams.get('internal') ?? '').toLowerCase(),
    );

    // GET /topics
    if (segments.length === 1 && segments[0] === 'topics') {
      const { data, error } = await db.rpc('list_topics', {
        p_locale: locale,
        p_include_internal: includeInternal,
      });
      if (error) throw error;
      return json({ locale, include_internal: includeInternal, count: data?.length ?? 0, topics: data ?? [] });
    }

    // GET /topics/:topicId/cards  (?category= filters by editorial category, e.g. advice)
    if (segments.length === 3 && segments[0] === 'topics' && segments[2] === 'cards') {
      const topicId = decodeURIComponent(segments[1]);
      const category = url.searchParams.get('category');
      const { data, error } = await db.rpc('get_topic_cards', {
        p_topic_id: topicId,
        p_locale: locale,
        p_include_internal: includeInternal,
      });
      if (error) throw error;
      let cards = (data ?? []) as Array<Record<string, unknown>>;
      if (category) cards = cards.filter((c) => c.content_category === category);
      return json({ locale, topic_id: topicId, category: category ?? null, include_internal: includeInternal, count: cards.length, cards });
    }

    // GET /questions  — Q&A questions ranked by ask_frequency (global "most asked"),
    // optionally scoped to one topic. Each row resolves to its answer card.
    if (segments.length === 1 && segments[0] === 'questions') {
      const topicId = url.searchParams.get('topic');
      const limit = clampInt(url.searchParams.get('limit'), 100, 1, 500);
      const { data, error } = await db.rpc('list_questions', {
        p_locale: locale,
        p_topic_id: topicId,
        p_limit: limit,
        p_include_internal: includeInternal,
      });
      if (error) throw error;
      const questions = (data ?? []) as Array<Record<string, unknown>>;
      return json({ locale, topic_id: topicId, include_internal: includeInternal, count: questions.length, questions });
    }

    // GET /search   (?category=faq restricts to the Q&A section)
    if (segments.length === 1 && segments[0] === 'search') {
      const query = url.searchParams.get('q') ?? '';
      const topicId = url.searchParams.get('topic');
      const category = url.searchParams.get('category');
      const limit = clampInt(url.searchParams.get('limit'), 20, 1, 100);
      const offset = clampInt(url.searchParams.get('offset'), 0, 0, 100000);

      const { data, error } = await db.rpc('search_cards', {
        p_query: query,
        p_locale: locale,
        p_topic_id: topicId,
        p_limit: limit,
        p_offset: offset,
        p_include_internal: includeInternal,
      });
      if (error) throw error;

      let rows = (data ?? []) as Array<Record<string, unknown>>;
      const total = rows.length ? Number(rows[0].total_count) : 0;
      // The Q&A section is the dedicated topic.faq_* topics. search_cards doesn't
      // expose content_category, but every (and only) FAQ card lives under a faq
      // topic, so a topic-prefix filter is exactly a content_category='faq' filter.
      if (category === 'faq') rows = rows.filter((r) => String(r.topic_id ?? '').startsWith('topic.faq_'));
      const results = rows.map((row) => {
        const item = { ...row };
        delete item.total_count;
        return item;
      });
      return json({ locale, query, topic_id: topicId, category: category ?? null, include_internal: includeInternal, limit, offset, total: category === 'faq' ? results.length : total, count: results.length, results });
    }

    // GET /cards/:cardId
    if (segments.length === 2 && segments[0] === 'cards') {
      const cardId = decodeURIComponent(segments[1]);
      const { data, error } = await db.rpc('get_card', { p_card_id: cardId, p_locale: locale });
      if (error) throw error;
      if (!data) return json({ error: 'not_found', card_id: cardId }, 404);
      return json({ locale, card: data });
    }

    // GET /version
    if (segments.length === 1 && segments[0] === 'version') {
      const { data, error } = await db.rpc('current_data_version');
      if (error) throw error;
      return json({ version: data ?? null });
    }

    return json({ error: 'not_found', path: url.pathname }, 404);
  } catch (e) {
    console.error('kb-api error:', e);
    return json({ error: 'internal_error', message: (e as Error)?.message ?? String(e) }, 500);
  }
});
