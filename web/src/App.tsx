import { useCallback, useEffect, useMemo, useState } from 'react';
import { t, type Locale } from './i18n';
import { useLocale } from './useLocale';
import { useAuth } from './useAuth';
import {
  getMe,
  getTopicCards,
  isConfigured,
  isFaqTopic,
  listTopics,
  searchCards,
  setDefaultLocale,
  type SearchCard,
  type Topic,
  type TopicCard,
} from './lib/api';
import { LocaleSwitcher } from './components/LocaleSwitcher';
import { Login } from './components/Login';
import { SearchBar } from './components/SearchBar';
import { TopicGrid } from './components/TopicGrid';
import { CardItem, type CardView } from './components/CardItem';
import { FaqItem, type FaqView } from './components/FaqItem';

type Mode = 'kb' | 'faq';

function Spinner({ label }: { label: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-slate-500">
      <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-300 border-t-indigo-500" />
      {label}
    </div>
  );
}

export default function App() {
  const { locale, setLocale } = useLocale();
  const { user, loading: authLoading, signIn, signUp, signOut } = useAuth();

  // Locale changes persist to the user's profile (so the param can be omitted later).
  const handleLocaleChange = useCallback(
    (l: Locale) => {
      setLocale(l);
      if (user) setDefaultLocale(l).catch(() => undefined);
    },
    [user, setLocale],
  );

  // On sign-in, adopt the user's stored default locale.
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    getMe()
      .then((me) => {
        if (!cancelled && me.default_locale) setLocale(me.default_locale as Locale);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const [mode, setMode] = useState<Mode>('kb');
  const [topics, setTopics] = useState<Topic[]>([]);
  const [topicsLoading, setTopicsLoading] = useState(true);

  const [selectedTopic, setSelectedTopic] = useState<Topic | null>(null);

  const [globalQuery, setGlobalQuery] = useState('');
  const [topicQuery, setTopicQuery] = useState('');

  const [results, setResults] = useState<SearchCard[]>([]);
  const [topicCards, setTopicCards] = useState<TopicCard[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [includeInternal, setIncludeInternal] = useState(false);

  const isFaq = mode === 'faq';
  const faqCategory = isFaq ? 'faq' : undefined;

  // Knowledge-base topics and Q&A topics share the topics table; split by id prefix.
  const shownTopics = useMemo(
    () => topics.filter((t) => isFaqTopic(t.topic_id) === isFaq),
    [topics, isFaq],
  );

  // --- Load topics whenever the locale / scope changes -----------------------
  useEffect(() => {
    if (!isConfigured || !user) return;
    let cancelled = false;
    setTopicsLoading(true);
    listTopics(locale, includeInternal)
      .then((data) => !cancelled && setTopics(data))
      .catch((e) => !cancelled && setError(String(e?.message ?? e)))
      .finally(() => !cancelled && setTopicsLoading(false));
    return () => {
      cancelled = true;
    };
  }, [locale, user, includeInternal]);

  // --- Global search (home view) ---------------------------------------------
  useEffect(() => {
    if (!isConfigured || !user || selectedTopic) return;
    const q = globalQuery.trim();
    if (!q) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setBusy(true);
    setError(null);
    searchCards({ query: q, locale, limit: 50, includeInternal, category: faqCategory })
      .then((r) => !cancelled && setResults(r.cards))
      .catch((e) => !cancelled && setError(String(e?.message ?? e)))
      .finally(() => !cancelled && setBusy(false));
    return () => {
      cancelled = true;
    };
  }, [globalQuery, locale, selectedTopic, user, includeInternal, faqCategory]);

  // --- Topic view: browse all cards, or search within the topic --------------
  useEffect(() => {
    if (!isConfigured || !user || !selectedTopic) return;
    const q = topicQuery.trim();
    let cancelled = false;
    setBusy(true);
    setError(null);

    const load = q
      ? searchCards({
          query: q,
          locale,
          topicId: selectedTopic.topic_id,
          category: faqCategory,
          limit: 100,
          includeInternal,
        }).then((r) =>
          r.cards.map(
            (c): TopicCard => ({
              card_id: c.card_id,
              card_type: c.card_type,
              status: c.status,
              visibility: c.visibility,
              title: c.title,
              short_body: c.short_body,
              body: c.body,
              confidence: c.confidence,
              staleness_risk: c.staleness_risk,
              needs_review: c.needs_review,
              sensitivity_tags: c.sensitivity_tags,
              quality_score: c.quality_score,
              alignment_score: c.alignment_score,
              last_updated: c.last_updated,
            }),
          ),
        )
      : getTopicCards(selectedTopic.topic_id, locale, includeInternal);

    load
      .then((data) => !cancelled && setTopicCards(data))
      .catch((e) => !cancelled && setError(String(e?.message ?? e)))
      .finally(() => !cancelled && setBusy(false));
    return () => {
      cancelled = true;
    };
  }, [selectedTopic, topicQuery, locale, user, includeInternal, faqCategory]);

  const openTopic = useCallback((topic: Topic) => {
    setSelectedTopic(topic);
    setTopicQuery('');
    setTopicCards([]);
  }, []);

  const goHome = useCallback(() => {
    setSelectedTopic(null);
    setTopicQuery('');
  }, []);

  const switchMode = useCallback((next: Mode) => {
    setMode(next);
    setSelectedTopic(null);
    setTopicQuery('');
    setGlobalQuery('');
    setResults([]);
    setTopicCards([]);
    setError(null);
  }, []);

  const toCardView = (c: SearchCard): CardView => ({ ...c });
  const topicCardToView = (c: TopicCard): CardView => ({ ...c, topic_title: null });
  const toFaqView = (c: TopicCard | SearchCard): FaqView => ({
    card_id: c.card_id,
    title: c.title,
    short_body: c.short_body,
    body: c.body,
    needs_review: c.needs_review,
    topic_title: (c as SearchCard).topic_title ?? null,
  });

  if (!isConfigured) {
    return (
      <div className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center gap-3 p-6 text-center">
        <h1 className="text-xl font-semibold text-slate-900">{t(locale, 'configError')}</h1>
        <p className="text-sm text-slate-600">{t(locale, 'configErrorHint')}</p>
      </div>
    );
  }

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner label={t(locale, 'sessionLoading')} />
      </div>
    );
  }

  if (!user) {
    return (
      <Login
        locale={locale}
        onLocaleChange={setLocale}
        onSignIn={(e, p) => signIn(e, p)}
        onSignUp={(e, p) => signUp(e, p)}
      />
    );
  }

  const showingGlobalSearch = !selectedTopic && globalQuery.trim().length > 0;

  return (
    <div className="min-h-screen">
      {/* Header */}
      <header className="bg-gradient-to-r from-indigo-700 to-violet-700 text-white shadow">
        <div className="mx-auto max-w-5xl px-4 py-5">
          <div className="flex items-center justify-between gap-4">
            <button type="button" onClick={goHome} className="text-left">
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{t(locale, 'appTitle')}</h1>
              <p className="hidden text-sm text-indigo-100 sm:block">
                {isFaq ? t(locale, 'faqSubtitle') : t(locale, 'appSubtitle')}
              </p>
            </button>
            <div className="flex items-center gap-3">
              <LocaleSwitcher locale={locale} onChange={handleLocaleChange} />
              <span className="hidden max-w-[12rem] truncate text-sm text-indigo-100 md:inline">
                {user.email}
              </span>
              <button
                type="button"
                onClick={() => signOut()}
                className="rounded-md border border-white/20 bg-white/10 px-3 py-1 text-sm text-white transition hover:bg-white/20"
              >
                {t(locale, 'signOut')}
              </button>
            </div>
          </div>

          {/* Section nav: Knowledge base | Q&A */}
          <nav className="mt-4 flex gap-1 rounded-lg bg-white/10 p-1 text-sm font-medium sm:w-fit">
            {(['kb', 'faq'] as Mode[]).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => switchMode(m)}
                className={`flex-1 rounded-md px-4 py-1.5 transition sm:flex-none ${
                  mode === m ? 'bg-white text-indigo-700 shadow' : 'text-indigo-100 hover:bg-white/10'
                }`}
              >
                {t(locale, m === 'kb' ? 'navKnowledge' : 'navFaq')}
              </button>
            ))}
          </nav>

          <label className="mt-3 flex items-center gap-2 text-sm text-indigo-100">
            <input
              type="checkbox"
              checked={includeInternal}
              onChange={(e) => setIncludeInternal(e.target.checked)}
              className="h-4 w-4 rounded border-white/30 bg-white/10"
            />
            {t(locale, 'showInternal')}
          </label>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        {/* Topic view ------------------------------------------------------- */}
        {selectedTopic ? (
          <section>
            <button
              type="button"
              onClick={goHome}
              className="mb-4 text-sm font-medium text-indigo-600 hover:text-indigo-800"
            >
              {t(locale, isFaq ? 'backToFaqTopics' : 'backToTopics')}
            </button>
            <h2 className="mb-1 text-2xl font-bold text-slate-900">{selectedTopic.title}</h2>
            {selectedTopic.description && (
              <p className="mb-4 max-w-3xl text-slate-600">{selectedTopic.description}</p>
            )}
            <div className="mb-6 max-w-xl">
              <SearchBar
                value={topicQuery}
                onChange={setTopicQuery}
                placeholder={t(locale, isFaq ? 'searchInFaqTopic' : 'searchInTopic')}
                autoFocus
              />
            </div>

            {error && <ErrorBox locale={locale} message={error} />}
            {busy ? (
              <Spinner label={t(locale, 'loading')} />
            ) : topicCards.length === 0 ? (
              <EmptyState locale={locale} />
            ) : isFaq ? (
              <div className="grid gap-2.5">
                {topicCards.map((c) => (
                  <FaqItem key={c.card_id} card={toFaqView(c)} locale={locale} />
                ))}
              </div>
            ) : (
              <div className="grid gap-4">
                {topicCards.map((c) => (
                  <CardItem key={c.card_id} card={topicCardToView(c)} locale={locale} />
                ))}
              </div>
            )}
          </section>
        ) : (
          /* Home view ------------------------------------------------------ */
          <section>
            <div className="mx-auto mb-8 max-w-2xl">
              <SearchBar
                value={globalQuery}
                onChange={setGlobalQuery}
                placeholder={t(locale, isFaq ? 'searchFaqPlaceholder' : 'searchPlaceholder')}
                autoFocus
              />
            </div>

            {error && <ErrorBox locale={locale} message={error} />}

            {showingGlobalSearch ? (
              busy ? (
                <Spinner label={t(locale, 'searching')} />
              ) : results.length === 0 ? (
                <EmptyState locale={locale} />
              ) : (
                <>
                  <p className="mb-3 text-sm text-slate-500">
                    {results.length} {t(locale, 'results')}
                  </p>
                  {isFaq ? (
                    <div className="grid gap-2.5">
                      {results.map((c) => (
                        <FaqItem key={c.card_id} card={toFaqView(c)} locale={locale} />
                      ))}
                    </div>
                  ) : (
                    <div className="grid gap-4">
                      {results.map((c) => (
                        <CardItem key={c.card_id} card={toCardView(c)} locale={locale} />
                      ))}
                    </div>
                  )}
                </>
              )
            ) : (
              <>
                <h2 className="mb-4 text-lg font-semibold text-slate-700">
                  {t(locale, isFaq ? 'faqTopicsHeading' : 'topicsHeading')}
                </h2>
                {topicsLoading ? (
                  <Spinner label={t(locale, 'loading')} />
                ) : (
                  <TopicGrid
                    topics={shownTopics}
                    locale={locale}
                    onSelect={openTopic}
                    countKey={isFaq ? 'questions' : 'cards'}
                  />
                )}
              </>
            )}
          </section>
        )}
      </main>

      <footer className="mx-auto max-w-5xl px-4 py-8 text-center text-xs text-slate-400">
        {shownTopics.length} {t(locale, isFaq ? 'faqTopicsHeading' : 'topicsHeading').toLowerCase()}
      </footer>
    </div>
  );
}

function EmptyState({ locale }: { locale: string }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <p className="text-lg font-medium text-slate-700">{t(locale, 'noResults')}</p>
      <p className="mt-1 text-sm text-slate-500">{t(locale, 'noResultsHint')}</p>
    </div>
  );
}

function ErrorBox({ locale, message }: { locale: string; message: string }) {
  return (
    <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
      <strong>{t(locale, 'errorTitle')}:</strong> {message}
    </div>
  );
}
