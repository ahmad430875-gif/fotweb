import { FootballLogo } from './FootballLogo'

export function LoadingScreen({ label }: { label: string }) {
  return <main className="loading-screen"><span className="brand-mark"><FootballLogo size={26} /></span><span className="loading-pulse" /><span>{label}</span></main>
}
