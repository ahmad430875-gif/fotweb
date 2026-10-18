export function FootballLogo({ size = 24 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 42 42" fill="none" aria-hidden="true" focusable="false">
    <circle cx="21" cy="21" r="17" fill="#fff" stroke="#111" strokeWidth="1.5" />
    <path d="m21 14.5 5.6 4.1-2.1 6.6h-7l-2.1-6.6 5.6-4.1Z" fill="#111" />
    <path d="m21 14.5 0-9m5.6 13.1 8.1-2.6m-10.2 9.2 3.1 8.5m-13-8.5-3.1 8.5m1-15.1-8.1-2.6" stroke="#111" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
}
