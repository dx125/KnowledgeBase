// HTTP client for the Knowledge Base API (Supabase Edge Function `kb`).
// The browser talks ONLY to this API for data — never to the database directly.
// Every request carries the signed-in user's access token (the API requires auth).

import { API_BASE, ANON_KEY, authClient, isConfigured } from './auth';

export { isConfigured };

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await authClient.auth.getSession();
  const token = data.session?.access_token ?? ANON_KEY; // no session → anon (API will 401)
  return { apikey: ANON_KEY, Authorization: `Bearer ${token}` };
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = '';
    try {
      detail = (await res.json())?.message ?? '';
    } catch {
      /* ignore */
    }
    const err = new Error(`API ${res.status}${detail ? `: ${detail}` : ''}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

async function apiGet<T>(path: string, params?: Record<string, unknown>): Promise<T> {
  const url = new URL(API_BASE + path);
  for (const [k, v] of Object.entries(params ?? {})) {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  }
  const res = await fetch(url.toString(), { headers: await authHeaders() });
  return handle<T>(res);
}

async function apiPut<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(API_BASE + path, {
    method: 'PUT',
    headers: { ...(await authHeaders()), 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return handle<T>(res);
}

// --- Types -------------------------------------------------------------------
export interface Profile {
  user_id: string;
  email: string | null;
  default_locale: string;
}

export type CardType = 'summary' | 'how_to' | 'public_overview';
export type CardStatus = 'active' | 'needs_review' | 'needs_expert_review';
export type Visibility = 'public' | 'internal';

export interface Topic {
  topic_id: string;
  card_count: number | null;
  clean_message_count: number | null;
  sensitivity: string | null;
  title: string | null;
  description: string | null;
}

export interface TopicCard {
  card_id: string;
  card_type: CardType;
  status: CardStatus;
  visibility: Visibility;
  title: string | null;
  short_body: string | null;
  body: string | null;
  confidence: string | null;
  staleness_risk: string | null;
  needs_review: boolean;
  sensitivity_tags: string[] | null;
  quality_score: number | null;
  alignment_score: number | null;
  last_updated: string | null;
}

export interface SearchCard {
  card_id: string;
  topic_id: string;
  card_type: CardType;
  status: CardStatus;
  visibility: Visibility;
  title: string | null;
  short_body: string | null;
  body: string | null;
  confidence: string | null;
  staleness_risk: string | null;
  needs_review: boolean;
  sensitivity_tags: string[] | null;
  quality_score: number | null;
  alignment_score: number | null;
  last_updated: string | null;
  topic_title: string | null;
  rank: number;
}

export interface SearchResult {
  cards: SearchCard[];
  total: number;
}

export interface GlossaryTerm {
  term: string | null;
  definition: string | null;
}
export interface EntityRef {
  name: string | null;
  type: string | null;
}
export interface ResourceRef {
  name: string | null;
  url: string | null;
  type: string | null;
  description: string | null;
}
export interface CardDetail {
  card_id: string;
  glossary: GlossaryTerm[];
  entities: EntityRef[];
  resources?: ResourceRef[];
}

// --- Profile -----------------------------------------------------------------
export async function getMe(): Promise<Profile> {
  return apiGet<Profile>('/me');
}

// --- Card detail (related context) -------------------------------------------
export async function getCard(cardId: string, locale: string): Promise<CardDetail> {
  const data = await apiGet<{ card: CardDetail }>(
    `/cards/${encodeURIComponent(cardId)}`,
    { locale },
  );
  return data.card;
}

export async function setDefaultLocale(locale: string): Promise<Profile> {
  return apiPut<Profile>('/me', { default_locale: locale });
}

// --- Data --------------------------------------------------------------------
const internalFlag = (includeInternal?: boolean) => (includeInternal ? '1' : undefined);

export async function listTopics(locale: string, includeInternal?: boolean): Promise<Topic[]> {
  const data = await apiGet<{ topics: Topic[] }>('/topics', {
    locale,
    internal: internalFlag(includeInternal),
  });
  return data.topics;
}

export async function getTopicCards(
  topicId: string,
  locale: string,
  includeInternal?: boolean,
): Promise<TopicCard[]> {
  const data = await apiGet<{ cards: TopicCard[] }>(
    `/topics/${encodeURIComponent(topicId)}/cards`,
    { locale, internal: internalFlag(includeInternal) },
  );
  return data.cards;
}

export async function searchCards(params: {
  query: string;
  locale: string;
  topicId?: string | null;
  category?: string | null;
  limit?: number;
  offset?: number;
  includeInternal?: boolean;
}): Promise<SearchResult> {
  const data = await apiGet<{ results: SearchCard[]; total: number }>('/search', {
    q: params.query,
    locale: params.locale,
    topic: params.topicId ?? undefined,
    category: params.category ?? undefined,
    limit: params.limit ?? 20,
    offset: params.offset ?? 0,
    internal: internalFlag(params.includeInternal),
  });
  // The API gained ?category=faq later; until that Edge Function build is live the
  // param is ignored server-side, so we also filter client-side. FAQ cards are
  // exactly the cards under topic.faq_* topics.
  let cards = data.results;
  if (params.category === 'faq') cards = cards.filter((c) => isFaqTopic(c.topic_id));
  return { cards, total: params.category === 'faq' ? cards.length : data.total };
}

/** FAQ (Q&A) content lives in dedicated topic.faq_* topics. */
export const isFaqTopic = (topicId: string | null | undefined): boolean =>
  !!topicId && topicId.startsWith('topic.faq_');
