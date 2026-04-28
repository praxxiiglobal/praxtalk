export function Mark({
  className,
  size = 22,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 22 22"
      className={className}
      aria-hidden="true"
    >
      <rect width="22" height="22" rx="6" fill="currentColor" />
      <circle cx="11" cy="11" r="6" fill="var(--color-accent)" />
      <path d="M16 16 L21 16 L21 21 Z" fill="currentColor" />
    </svg>
  );
}
