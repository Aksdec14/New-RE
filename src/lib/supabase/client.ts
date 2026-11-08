"use client";

import { createBrowserClient } from "@supabase/ssr";

import type { Database } from "@/lib/types/database";
import { supabaseEnv } from "./env";

let client: ReturnType<typeof createBrowserClient<Database>> | undefined;

/**
 * Browser client. A single instance is reused so auth state and realtime
 * sockets are shared across components.
 */
export function createClient() {
  if (!client) {
    const { url, anonKey } = supabaseEnv();
    client = createBrowserClient<Database>(url, anonKey);
  }

  return client;
}
