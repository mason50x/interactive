/** Shared crown for site-wide admin badges. */
export function AdminCrown({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="currentColor"
      className={className}
      aria-hidden="true"
    >
      <path d="M3.5 14 2 5.5 6.5 9 10 3l3.5 6L18 5.5 16.5 14h-13Zm0 1.5h13V17h-13v-1.5Z" />
    </svg>
  );
}
