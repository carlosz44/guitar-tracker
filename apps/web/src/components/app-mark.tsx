export function AppMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={className}>
      <rect width="64" height="64" rx="14" className="fill-brand" />
      <path
        d="M32 52c-7-6-15-15-15-25 0-6 6-10 15-10s15 4 15 10c0 10-8 19-15 25Z"
        className="fill-brand-foreground"
      />
      <path
        d="M24 26h16M23 31h18M25 36h14"
        className="stroke-brand"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
