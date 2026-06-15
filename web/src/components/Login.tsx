import { useState } from 'react';
import { t, type Locale } from '../i18n';
import { LocaleSwitcher } from './LocaleSwitcher';

export function Login({
  locale,
  onLocaleChange,
  onSignIn,
  onSignUp,
}: {
  locale: Locale;
  onLocaleChange: (l: Locale) => void;
  onSignIn: (email: string, password: string) => Promise<{ error: { message: string } | null }>;
  onSignUp: (email: string, password: string) => Promise<{ error: { message: string } | null }>;
}) {
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    const fn = mode === 'signIn' ? onSignIn : onSignUp;
    const { error } = await fn(email.trim(), password);
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    if (mode === 'signUp') {
      // If email confirmation is enabled, there is no session yet.
      setNotice(t(locale, 'signUpCheckEmail'));
    }
  }

  return (
    <div className="flex min-h-screen flex-col bg-gradient-to-br from-indigo-700 to-violet-800">
      <div className="flex items-center justify-between px-4 py-4">
        <span className="font-semibold text-white">{t(locale, 'appTitle')}</span>
        <LocaleSwitcher locale={locale} onChange={onLocaleChange} />
      </div>

      <div className="flex flex-1 items-center justify-center px-4 pb-16">
        <form
          onSubmit={submit}
          className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl"
        >
          <h1 className="mb-1 text-xl font-bold text-slate-900">
            {t(locale, mode === 'signIn' ? 'signIn' : 'signUp')}
          </h1>
          <p className="mb-5 text-sm text-slate-500">{t(locale, 'authSubtitle')}</p>

          <label className="mb-3 block">
            <span className="mb-1 block text-sm font-medium text-slate-700">{t(locale, 'email')}</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </label>

          <label className="mb-4 block">
            <span className="mb-1 block text-sm font-medium text-slate-700">{t(locale, 'password')}</span>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signIn' ? 'current-password' : 'new-password'}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-indigo-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
            />
          </label>

          {error && (
            <p className="mb-3 rounded-md bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
          )}
          {notice && (
            <p className="mb-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{notice}</p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-indigo-600 py-2.5 font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60"
          >
            {busy ? t(locale, 'loading') : t(locale, mode === 'signIn' ? 'signIn' : 'signUp')}
          </button>

          <button
            type="button"
            onClick={() => {
              setMode((m) => (m === 'signIn' ? 'signUp' : 'signIn'));
              setError(null);
              setNotice(null);
            }}
            className="mt-4 w-full text-center text-sm text-indigo-600 hover:text-indigo-800"
          >
            {t(locale, mode === 'signIn' ? 'switchToSignUp' : 'switchToSignIn')}
          </button>
        </form>
      </div>
    </div>
  );
}
