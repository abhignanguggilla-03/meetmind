import { createBrowserClient } from "@supabase/ssr";

export function getSupabaseBrowserClient() {
    const url = import.meta.env['VITE_SUPABASE_URL'];
const anonKey = import.meta.env['VITE_SUPABASE_ANON_KEY'];

  if (!url || !anonKey) {
    throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  }

  return createBrowserClient(url, anonKey);
}