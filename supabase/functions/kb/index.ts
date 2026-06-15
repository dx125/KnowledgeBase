// =============================================================================
// Knowledge Base public API — Supabase Edge Function (Deno).
//
// The ONLY component that touches the database. Clients call these HTTP
// endpoints; they never see Postgres/PostgREST. The function authenticates to
// the DB with the service_role key (injected by Supabase, never shipped to
// clients) and delegates to the SQL RPCs defined in the migrations.
//
// Authorization — two ways to authenticate (everything except GET / requires it)
// ------------------------------------------------------------------------------
//   1. Per-app token (machine-to-machine, e.g. a mobile app). Send the token in
//      `X-API-Key: <token>` OR `Authorization: Bearer <token>` (tokens start with
//      "kb_"). Issued out-of-band via scripts/issue-token.mjs; only its hash is
//      stored. The token's row sets the app's default locale and whether it may
//      see internal/unreviewed cards.
//   2. End-user login (Supabase Auth email+password). Send the user's access
//      token in `Authorization: Bearer <jwt>`. Used by the web app.
// No valid token/JWT → 401.
//
// This function is deployed with verify_jwt = false (see supabase/config.toml):
// the Supabase gateway does NOT pre-check a JWT, so an app can authenticate with
// only its own token. All authorization is enforced here.
//
// Locale resolution (per request)
// -------------------------------
//   1. explicit ?locale=  (ru|en|es|de; anything else → en)
//   2. the caller's default locale (user profile, or the app token's locale)
//   3. 'ru' (project default)
//
// Routes (base = /functions/v1/kb):
//   GET  /                       → API descriptor (open)
//   GET  /me                     → current principal (user or app) + default_locale
//   PUT  /me  {default_locale}   → update default locale (end users only)
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
const APP_TOKEN_PREFIX = 'kb_'; // per-app tokens look like kb_live_<random>

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
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

/** Resolve the effective locale for a request: explicit → caller default → 'ru'. */
function resolveLocale(param: string | null, callerLocale: string | null): string {
  if (param) return isLocale(param) ? param.toLowerCase() : 'en';
  if (isLocale(callerLocale)) return callerLocale!.toLowerCase();
  return DEFAULT_LOCALE;
}

async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

type Principal =
  | { kind: 'app'; id: string; name: string; defaultLocale: string; allowInternal: boolean }
  | { kind: 'user'; id: string; email: string | null; defaultLocale: string | null; allowInternal: boolean };

/** Authenticate a request via app token (preferred) or end-user JWT. null = anonymous. */
async function authenticate(req: Request): Promise<Principal | null> {
  const apiKeyHeader = (req.headers.get('X-API-Key') ?? '').trim();
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();

  // 1) Per-app token: X-API-Key, or an Authorization bearer that looks like a token.
  const appToken = apiKeyHeader || (bearer.startsWith(APP_TOKEN_PREFIX) ? bearer : '');
  if (appToken) {
    const hash = await sha256Hex(appToken);
    const { data } = await db.rpc('kb_authenticate_client', { p_token_hash: hash });
    const client = (data ?? [])[0];
    if (!client) return null;
    // Best-effort "last seen"; never block the request on it.
    db.rpc('kb_touch_client', { p_client_id: client.client_id }).then(() => {}).catch(() => {});
    return {
      kind: 'app',
      id: client.client_id,
      name: client.name,
      defaultLocale: client.default_locale,
      allowInternal: client.allow_internal,
    };
  }

  // 2) End-user JWT.
  if (bearer) {
    const { data: userData } = await db.auth.getUser(bearer);
    const user = userData?.user ?? null;
    if (!user) return null;
    const { data: profile } = await db
      .from('profiles')
      .select('default_locale')
      .eq('id', user.id)
      .maybeSingle();
    return {
      kind: 'user',
      id: user.id,
      email: user.email ?? null,
      defaultLocale: profile?.default_locale ?? null,
      allowInternal: true, // any signed-in user may opt into internal cards
    };
  }

  return null;
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
      auth: 'Per-app token in `X-API-Key` or `Authorization: Bearer kb_…`, or an end-user JWT in `Authorization: Bearer <jwt>`. Required on all routes except GET /.',
      default_locale: DEFAULT_LOCALE,
      supported_locales: SUPPORTED_LOCALES,
      endpoints: {
        me: 'GET /me · PUT /me {default_locale} (end users only)',
        topics: 'GET /topics?locale&internal',
        topic_cards: 'GET /topics/:topicId/cards?locale&internal&category',
        search: 'GET /search?q&locale&topic&limit&offset&internal',
        card: 'GET /cards/:cardId?locale',
        version: 'GET /version',
      },
    });
  }

  // --- Authenticate (app token or end-user JWT) ------------------------------
  const principal = await authenticate(req);
  if (!principal) return json({ error: 'unauthorized', message: 'A valid app token or user login is required.' }, 401);

  try {
    const localeParam = url.searchParams.get('locale');
    const locale = resolveLocale(localeParam, principal.defaultLocale);

    // GET /me · PUT /me
    if (segments.length === 1 && segments[0] === 'me') {
      if (req.method === 'GET') {
        if (principal.kind === 'app') {
          return json({ principal: 'app', app: principal.name, default_locale: principal.defaultLocale, allow_internal: principal.allowInternal });
        }
        return json({ principal: 'user', user_id: principal.id, email: principal.email, default_locale: principal.defaultLocale ?? DEFAULT_LOCALE });
      }
      if (req.method === 'PUT') {
        if (principal.kind !== 'user') {
          return json({ error: 'forbidden', message: 'Only end-user sessions can change a stored default locale. Set an app token\'s locale at issuance, or pass ?locale= per request.' }, 403);
        }
        let body: { default_locale?: string };
        try {
          body = await req.json();
        } catch {
          return json({ error: 'bad_request', message: 'Invalid JSON body.' }, 400);
        }
        const next = body?.default_locale?.toLowerCase();
        if (!isLocale(next)) {
          return json({ error: 'bad_request', message: `default_locale must be one of ${SUPPORTED_LOCALES.join(', ')}.` }, 400);
        }
        const { data: updated, error } = await db
          .from('profiles')
          .upsert({ id: principal.id, default_locale: next }, { onConflict: 'id' })
          .select('default_locale')
          .single();
        if (error) throw error;
        return json({ principal: 'user', user_id: principal.id, email: principal.email, default_locale: updated.default_locale });
      }
      return json({ error: 'method_not_allowed' }, 405);
    }

    // All remaining routes are GET-only.
    if (req.method !== 'GET') return json({ error: 'method_not_allowed' }, 405);

    // Internal/unreviewed cards: only when requested AND the principal is allowed.
    const wantInternal = ['1', 'true', 'yes'].includes((url.searchParams.get('internal') ?? '').toLowerCase());
    const includeInternal = wantInternal && principal.allowInternal;

    // GET /topics
    if (segments.length === 1 && segments[0] === 'topics') {
      const { data, error } = await db.rpc('list_topics', { p_locale: locale, p_include_internal: includeInternal });
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

    // GET /search
    if (segments.length === 1 && segments[0] === 'search') {
      const query = url.searchParams.get('q') ?? '';
      const topicId = url.searchParams.get('topic');
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

      const rows = (data ?? []) as Array<Record<string, unknown>>;
      const total = rows.length ? Number(rows[0].total_count) : 0;
      const results = rows.map((row) => {
        const item = { ...row };
        delete item.total_count;
        return item;
      });
      return json({ locale, query, topic_id: topicId, include_internal: includeInternal, limit, offset, total, count: results.length, results });
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
