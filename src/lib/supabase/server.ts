import "@tanstack/react-start/server-only";
import type { SetAllCookies } from "@supabase/ssr";
import { createServerClient } from "@supabase/ssr";
import { getCookies, setCookie } from "@tanstack/react-start/server";

export function getSupabaseServerClient() {
const url = import.meta.env['VITE_SUPABASE_URL'];
const anonKey = import.meta.env['VITE_SUPABASE_ANON_KEY'];

  if (!url || !anonKey) {
    throw new Error("Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.");
  }

  return createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return Object.entries(getCookies()).map(([name, value]) => ({ name, value }));
      },
      setAll: (cookiesToSet: Parameters<SetAllCookies>[0]) => {
  cookiesToSet.forEach(({ name, value, options }) => setCookie(name, value, options));
    },
    },
  });
}