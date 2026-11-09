"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@/lib/supabase/client";

/**
 * Subscribes to `postgres_changes` for one table row set and triggers a server
 * re-render on any change. RLS scopes the subscription to rows the signed-in
 * member can read, and money math still happens in Postgres — this only
 * refreshes the view.
 *
 * Refreshes are throttled so a burst of changes (a whole order entering at
 * once) causes at most one re-render per second.
 */
export function LiveRefresh({
  table,
  column,
  value,
}: {
  table: string;
  column: string;
  value: string;
}) {
  const router = useRouter();
  const lastRefresh = useRef(0);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`live-${table}-${value}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `${column}=eq.${value}`,
        },
        () => {
          const now = Date.now();
          if (now - lastRefresh.current < 1000) return;
          lastRefresh.current = now;
          router.refresh();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [table, column, value, router]);

  return null;
}
