import { useState } from 'react';
import { t } from '../i18n';

// One question/answer entry rendered as an accordion row: the question is the
// clickable header, the answer (full body, falling back to the short answer)
// expands below. Used both in a Q&A topic and in Q&A search results.
export interface FaqView {
  card_id: string;
  title: string | null; // the question
  short_body: string | null; // one-line answer
  body: string | null; // full answer
  needs_review?: boolean;
  topic_title?: string | null;
}

export function FaqItem({
  card,
  locale,
  defaultOpen = false,
}: {
  card: FaqView;
  locale: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const answer = card.body || card.short_body || '';

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition hover:bg-slate-50"
      >
        <span className="flex items-start gap-2.5">
          <span className={`mt-0.5 shrink-0 text-indigo-500 transition-transform ${open ? 'rotate-90' : ''}`}>▸</span>
          <span className="text-sm font-semibold leading-snug text-slate-900">{card.title}</span>
        </span>
        {card.topic_title && (
          <span className="shrink-0 rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
            {card.topic_title}
          </span>
        )}
      </button>

      {open && (
        <div className="border-t border-slate-100 px-4 py-3 pl-11">
          <p className="whitespace-pre-line text-sm leading-relaxed text-slate-700">{answer}</p>
          {card.needs_review && (
            <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {t(locale, 'needsReviewNote')}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
