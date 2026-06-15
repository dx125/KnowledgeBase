import { LOCALE_LABELS, SUPPORTED_LOCALES, t, type Locale } from '../i18n';

export function LocaleSwitcher({
  locale,
  onChange,
}: {
  locale: Locale;
  onChange: (l: Locale) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="hidden text-slate-300 sm:inline">{t(locale, 'language')}:</span>
      <select
        value={locale}
        onChange={(e) => onChange(e.target.value as Locale)}
        className="rounded-md border border-white/20 bg-white/10 px-2 py-1 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/40"
        aria-label={t(locale, 'language')}
      >
        {SUPPORTED_LOCALES.map((l) => (
          <option key={l} value={l} className="text-slate-900">
            {LOCALE_LABELS[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
