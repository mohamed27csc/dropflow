/** Logo provisoire : pastille turquoise + vague. À remplacer par le vrai logo. */
export function Logo({ size = 36 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" aria-hidden>
      <circle cx="20" cy="20" r="20" fill="#5FD0EB" />
      <path d="M8 22c4-9 13-11 24-6-5 1-8 3-10 6 3-1 6-1 9 1-5 7-14 8-23-1z" fill="#fff" />
      <path d="M8 22c5 3 10 3 14 0" fill="none" stroke="#111827" strokeWidth="2" strokeLinecap="round" opacity=".25" />
    </svg>
  );
}
