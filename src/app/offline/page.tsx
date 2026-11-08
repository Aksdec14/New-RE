export const metadata = { title: "Offline" };

export default function OfflinePage() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-6">
      <div className="card max-w-md text-center">
        <span className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-warn-soft text-warn">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
            <path
              d="M2 8.5a15 15 0 0 1 20 0M5.5 12.5a10 10 0 0 1 13 0M9 16.5a5 5 0 0 1 6 0"
              stroke="currentColor"
              strokeWidth="1.7"
              strokeLinecap="round"
            />
            <circle cx="12" cy="20" r="1.2" fill="currentColor" />
          </svg>
        </span>

        <h1 className="mt-5 text-xl font-semibold">You are offline</h1>
        <p className="mt-2 text-sm leading-relaxed muted">
          This page is cached so the app can still open. Orders taken now are queued on
          the device and sync automatically when the connection returns. Retries use
          idempotency keys, so nothing is duplicated.
        </p>
        <p className="mt-4 text-xs muted">
          Reconnect and reload to return to the workspace.
        </p>
      </div>
    </div>
  );
}
