export function FootballLogo({ size = 24 }: { size?: number }) {
  return <svg width={size} height={size} viewBox="0 0 42 40" fill="none" aria-hidden="true" focusable="false">
    <path d="M2.5 13h5M1 20h4.5M2.5 27h5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    <circle cx="24" cy="20" r="14.5" stroke="currentColor" strokeWidth="1.7" />
    <path d="m24 11.5 6.1 4.4-2.3 7.2h-7.6l-2.3-7.2 6.1-4.4Z" fill="currentColor" />
    <path d="M24 11.5V5.5m6.1 10.4 7-2.3m-9.3 9.5 4.3 6m-11.9-6-4.3 6m-2.1-13.2-7-2.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
}
