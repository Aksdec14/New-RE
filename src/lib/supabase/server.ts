import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

import type { Database } from "@/lib/types/database";
import { supabaseEnv } from "./env";

/**
 * Server client for Server Components, Server Actions and Route Handlers.
 *
 * Always create a new instance per request: it is bound to that request's
 * cookie jar. Never cache it in a module-level variable.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, anonKey } = supabaseEnv();

  return createServerClient<Database>(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // The middleware refreshes the session instead.
        }
      },
    },
  });
}
