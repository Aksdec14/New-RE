export function BrandMark({ inverted = false }: { inverted?: boolean }) {
  return (
    <span
      className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${
        inverted ? "bg-white text-ink" : "bg-ink text-white"
      }`}
      aria-hidden
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="8.25" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="12" cy="12" r="3.25" fill="currentColor" />
      </svg>
    </span>
  );
}
