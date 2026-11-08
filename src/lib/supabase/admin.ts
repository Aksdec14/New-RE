import { createClient } from "@supabase/supabase-js";

import type { Database } from "@/lib/types/database";

/**
 * Service-role client. Bypasses RLS.
 *
 * Use only for jobs that genuinely need cross-tenant access: manual
 * subscription renewals from the operator panel, reconciliation jobs, and
 * exports.
 *
 * This key must never reach the browser. It is deliberately not prefixed with
 * NEXT_PUBLIC_, and this module refuses to load in a client bundle.
 */
export function createAdminClient() {
  if (typeof window !== "undefined") {
    throw new Error("createAdminClient() must never be called in the browser.");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. " +
        "Service-role access is only available in server environments.",
    );
  }

  return createClient<Database>(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
