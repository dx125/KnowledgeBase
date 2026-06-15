import { useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { authClient } from './lib/auth';

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    authClient.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data: sub } = authClient.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const user: User | null = session?.user ?? null;

  return {
    session,
    user,
    loading,
    signIn: (email: string, password: string) =>
      authClient.auth.signInWithPassword({ email, password }),
    signUp: (email: string, password: string) => authClient.auth.signUp({ email, password }),
    signOut: () => authClient.auth.signOut(),
  };
}
