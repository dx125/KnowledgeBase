import { useEffect, useState } from 'react';
import { t } from '../i18n';
import { MetaBadges, StatusBadge } from './Badges';
import { getCard, type CardDetail, type CardStatus, type CardType, type Visibility } from '../lib/api';

export interface CardView {
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
  quality_score?: number | null;
  alignment_score?: number | null;
  last_updated: string | null;
  topic_title?: string | null;
}

function formatDate(value: string | null): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export function CardItem({ card, locale }: { card: CardView; locale: string }) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = Boolean(card.body && card.body !== card.short_body);
  const isLanding = card.card_type === 'summary' || card.card_type === 'public_overview';
  const isInternal = card.visibility === 'internal';
  const lowEvidence = card.alignment_score != null && card.alignment_score < 0.5;

  // Related context (glossary terms + entities), lazy-loaded on first open.
  const [related, setRelated] = useState<CardDetail | null>(null);
  const [relatedOpen, setRelatedOpen] = useState(false);
  const [relatedLoading, setRelatedLoading] = useState(false);

  // Re-fetch on locale/card change.
  useEffect(() => {
    setRelated(null);
    setRelatedOpen(false);
  }, [locale, card.card_id]);

  async function toggleRelated() {
    if (!relatedOpen && !related) {
      setRelatedLoading(true);
      try {
        setRelated(await getCard(card.card_id, locale));
      } catch {
        setRelated({ card_id: card.card_id, glossary: [], entities: [] });
      }
      setRelatedLoading(false);
    }
    setRelatedOpen((v) => !v);
  }

  const hasRelated = Boolean((related?.glossary?.length ?? 0) || (related?.entities?.length ?? 0));

  return (
    <article
      className={`rounded-xl border p-4 shadow-sm transition hover:shadow-md ${
        isInternal
          ? 'border-amber-200 bg-amber-50/40'
          : isLanding
            ? 'border-indigo-200 bg-indigo-50/40'
            : 'border-slate-200 bg-white'
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold leading-snug text-slate-900">{card.title}</h3>
        {card.topic_title && (
          <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            {card.topic_title}
          </span>
        )}
      </div>

      <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">
        {expanded && card.body ? card.body : card.short_body}
      </p>

      {hasMore && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-2 text-sm font-medium text-indigo-600 hover:text-indigo-800"
        >
          {expanded ? t(locale, 'readLess') : t(locale, 'readMore')}
        </button>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <StatusBadge locale={locale} status={card.status} visibility={card.visibility} />
        <MetaBadges
          locale={locale}
          confidence={card.confidence}
          staleness={card.staleness_risk}
          needsReview={card.needs_review}
        />
        {lowEvidence && (
          <span
            className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600"
            title={t(locale, 'limitedEvidenceNote')}
          >
            {t(locale, 'limitedEvidence')}
          </span>
        )}
        {card.last_updated && (
          <span className="text-xs text-slate-400">
            {t(locale, 'updated')}: {formatDate(card.last_updated)}
          </span>
        )}
      </div>

      {card.needs_review && (
        <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {t(locale, card.status === 'needs_expert_review' ? 'needsExpertNote' : 'needsReviewNote')}
        </p>
      )}

      <button
        type="button"
        onClick={toggleRelated}
        className="mt-3 text-xs font-medium text-indigo-600 hover:text-indigo-800"
      >
        {relatedOpen ? '▾ ' : '▸ '}
        {t(locale, 'relatedInfo')}
      </button>

      {relatedOpen && (
        <div className="mt-2 rounded-lg border border-slate-100 bg-slate-50 p-3">
          {relatedLoading ? (
            <p className="text-xs text-slate-400">{t(locale, 'loading')}</p>
          ) : !hasRelated ? (
            <p className="text-xs text-slate-400">{t(locale, 'noRelated')}</p>
          ) : (
            <div className="space-y-3">
              {related!.entities.length > 0 && (
                <div>
                  <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {t(locale, 'entitiesLabel')}
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {related!.entities.map((e, i) => (
                      <span key={i} className="rounded-md bg-white px-2 py-0.5 text-xs text-slate-700 ring-1 ring-slate-200">
                        {e.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {related!.glossary.length > 0 && (
                <div>
                  <h4 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {t(locale, 'glossaryLabel')}
                  </h4>
                  <dl className="space-y-1">
                    {related!.glossary.map((g, i) => (
                      <div key={i} className="text-xs leading-relaxed">
                        <dt className="inline font-medium text-slate-800">{g.term}</dt>
                        {g.definition && <dd className="inline text-slate-600"> — {g.definition}</dd>}
                      </div>
                    ))}
                  </dl>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
