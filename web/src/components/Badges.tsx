import { t } from '../i18n';

const CONFIDENCE_STYLE: Record<string, string> = {
  high: 'bg-emerald-100 text-emerald-800',
  medium_high: 'bg-teal-100 text-teal-800',
  medium: 'bg-amber-100 text-amber-800',
  low: 'bg-rose-100 text-rose-800',
};

const STALENESS_STYLE: Record<string, string> = {
  low: 'bg-emerald-100 text-emerald-800',
  medium: 'bg-amber-100 text-amber-800',
  high: 'bg-rose-100 text-rose-800',
};

function Pill({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${className}`}>
      {children}
    </span>
  );
}

const STATUS_STYLE: Record<string, string> = {
  active: 'bg-emerald-100 text-emerald-800',
  needs_review: 'bg-amber-100 text-amber-800',
  needs_expert_review: 'bg-rose-100 text-rose-800',
};

export function StatusBadge({
  locale,
  status,
  visibility,
}: {
  locale: string;
  status: string;
  visibility: string;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {visibility === 'internal' && (
        <Pill className="bg-slate-200 text-slate-700">{t(locale, 'internalBadge')}</Pill>
      )}
      {status && status !== 'active' && (
        <Pill className={STATUS_STYLE[status] ?? 'bg-slate-100 text-slate-700'}>
          {t(locale, status === 'needs_expert_review' ? 'statusExpert' : 'statusReview')}
        </Pill>
      )}
    </div>
  );
}

export function MetaBadges({
  locale,
  confidence,
  staleness,
  needsReview,
}: {
  locale: string;
  confidence: string | null;
  staleness: string | null;
  needsReview: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {confidence && (
        <Pill className={CONFIDENCE_STYLE[confidence] ?? 'bg-slate-100 text-slate-700'}>
          {t(locale, 'confidence')}: {confidence.replace('_', ' ')}
        </Pill>
      )}
      {staleness && (
        <Pill className={STALENESS_STYLE[staleness] ?? 'bg-slate-100 text-slate-700'}>
          {t(locale, 'staleness')}: {staleness}
        </Pill>
      )}
      {needsReview && (
        <Pill className="bg-rose-50 text-rose-700 ring-1 ring-inset ring-rose-200">
          ⚠ {t(locale, 'needsReview')}
        </Pill>
      )}
    </div>
  );
}
