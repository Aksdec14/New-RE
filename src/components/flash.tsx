export function Flash({
  error,
  ok,
}: {
  error?: string | null;
  ok?: string | null;
}) {
  if (!error && !ok) return null;

  return (
    <div className="space-y-2">
      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-bad/20 bg-bad-soft px-3.5 py-3 text-sm text-bad"
        >
          {error}
        </p>
      ) : null}
      {ok ? (
        <p
          role="status"
          className="rounded-xl border border-good/20 bg-good-soft px-3.5 py-3 text-sm text-good"
        >
          {ok}
        </p>
      ) : null}
    </div>
  );
}
