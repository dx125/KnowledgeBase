import { t, type Locale } from '../i18n';
import type { Topic } from '../lib/api';

export function TopicGrid({
  topics,
  locale,
  onSelect,
}: {
  topics: Topic[];
  locale: Locale;
  onSelect: (topic: Topic) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {topics.map((topic) => (
        <button
          key={topic.topic_id}
          type="button"
          onClick={() => onSelect(topic)}
          className="flex flex-col rounded-xl border border-slate-200 bg-white p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md"
        >
          <h3 className="mb-1 text-lg font-semibold text-slate-900">{topic.title}</h3>
          {topic.description && (
            <p className="mb-3 line-clamp-3 grow text-sm text-slate-600">{topic.description}</p>
          )}
          <div className="mt-auto flex gap-3 text-xs text-slate-500">
            {topic.card_count != null && (
              <span>
                {topic.card_count} {t(locale, 'cards')}
              </span>
            )}
            {topic.clean_message_count != null && (
              <span>
                {topic.clean_message_count.toLocaleString()} {t(locale, 'messages')}
              </span>
            )}
          </div>
        </button>
      ))}
    </div>
  );
}
