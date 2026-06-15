import { createClient } from '@supabase/supabase-js';

// supabase-js is used ONLY for authentication (Supabase Auth / GoTrue).
// It never queries the database — all data goes through the Edge Function API.
const url = import.meta.env.VITE_SUPABASE_URL ?? '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? '';

export const isConfigured = Boolean(url && anonKey);

if (!isConfigured) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. Copy .env.example to .env.');
}

export const authClient = createClient(url, anonKey, {
  auth: { persistSession: true, autoRefreshToken: true },
});

// Shared config the API client also needs.
export const SUPABASE_URL = url.replace(/\/$/, '');
export const ANON_KEY = anonKey;
export const API_BASE = `${SUPABASE_URL}/functions/v1/kb`;
