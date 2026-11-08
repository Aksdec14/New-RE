"use client";

import { useCallback, useEffect, useState } from "react";

import { offlineQueueSupported, pendingCount } from "@/lib/offline/queue";

/**
 * Shows connectivity and how many writes are waiting to sync. The actual
 * flush is wired up with the order-taking screen in Phase 3.
 */
export function SyncStatus() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState<number | null>(null);

  const refresh = useCallback(async () => {
    if (!offlineQueueSupported()) {
      setPending(null);
      return;
    }

    try {
      setPending(await pendingCount());
    } catch {
      setPending(null);
    }
  }, []);

  useEffect(() => {
    setOnline(navigator.onLine);
    void refresh();

    const handleOnline = () => {
      setOnline(true);
      void refresh();
    };
    const handleOffline = () => setOnline(false);
    const handleVisible = () => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    document.addEventListener("visibilitychange", handleVisible);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      document.removeEventListener("visibilitychange", handleVisible);
    };
  }, [refresh]);

  const label = online ? "Online" : "Offline";
  const tone = online
    ? "border-good/20 bg-good-soft text-good"
    : "border-warn/20 bg-warn-soft text-warn";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`badge ${tone}`}>
        <span
          className={`size-1.5 rounded-full ${
            online ? "bg-good" : "bg-warn"
          }`}
          aria-hidden
        />
        {label}
      </span>

      <span className="muted text-xs">
        {pending === null
          ? "Offline queue unavailable in this browser"
          : pending === 0
            ? "No queued writes"
            : `${pending} write${pending === 1 ? "" : "s"} queued`}
      </span>
    </div>
  );
}
