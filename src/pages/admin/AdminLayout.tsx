import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Building2, ChevronDown, Command, LayoutDashboard, LogOut, Menu, Newspaper, ShieldCheck } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../../auth/AuthProvider'
import { FootballLogo } from '../../components/FootballLogo'
import { PwaInstallButton } from '../../components/PwaInstallPrompt'

function currentTitle(pathname: string) {
  if (pathname.startsWith('/admin/news')) return 'News Center'
  if (pathname.startsWith('/admin/universities/new')) return 'Add university'
  if (pathname.startsWith('/admin/universities/')) return 'University overview'
  if (pathname.startsWith('/admin/universities')) return 'Universities'
  return 'Overview'
}

export function AdminLayout() {
  const { profile, session, signOut } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  const [mobileNavOpen, setMobileNavOpen] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  async function handleSignOut() {
    setSigningOut(true)
    await signOut()
    navigate('/admin/login', { replace: true })
  }

  return <div className="admin-shell">
    {mobileNavOpen && <button className="sidebar-scrim" type="button" aria-label="Close menu" onClick={() => setMobileNavOpen(false)} />}
    <aside className={`admin-sidebar ${mobileNavOpen ? 'sidebar-mobile-open' : ''}`}>
      <a className="sidebar-brand" href="/admin"><span className="brand-mark"><FootballLogo size={24} /></span><span>FOTWEB<span>.</span><small>PLATFORM CONTROL</small></span></a>
      <div className="workspace-switch"><span className="workspace-emblem"><Command size={16} /></span><span><strong>Platform workspace</strong><small>Super Admin</small></span><ChevronDown size={14} /></div>
      <span className="nav-label">WORKSPACE</span>
      <nav className="admin-nav" aria-label="Admin navigation">
        <NavLink to="/admin" end className={({ isActive }) => `admin-nav-link ${isActive ? 'admin-nav-active' : ''}`} onClick={() => setMobileNavOpen(false)}><LayoutDashboard size={17} /><span>Dashboard</span></NavLink>
        <NavLink to="/admin/universities" className={({ isActive }) => `admin-nav-link ${isActive ? 'admin-nav-active' : ''}`} onClick={() => setMobileNavOpen(false)}><Building2 size={17} /><span>Universities</span></NavLink>
        <NavLink to="/admin/news" className={({ isActive }) => `admin-nav-link ${isActive ? 'admin-nav-active' : ''}`} onClick={() => setMobileNavOpen(false)}><Newspaper size={17} /><span>News Center</span></NavLink>
      </nav>
      <div className="sidebar-coming"><span className="nav-label">PLATFORM DATA</span><p>Manage institutions and published football news across the network.</p></div>
      <div className="sidebar-account"><span className="account-avatar">{(profile?.display_name || session?.user.email || 'S').slice(0, 1).toUpperCase()}</span><span className="account-copy"><strong>{profile?.display_name || 'Platform admin'}</strong><small>{session?.user.email}</small></span></div>
    </aside>
    <div className="admin-main"><header className="admin-topbar"><div className="topbar-leading"><button className="icon-button mobile-menu-button" type="button" aria-label="Open menu" onClick={() => setMobileNavOpen(true)}><Menu size={19} /></button><div className="breadcrumbs"><span>Platform</span><span>/</span><strong>{currentTitle(location.pathname)}</strong></div></div><div className="topbar-status"><span><ShieldCheck size={15} /> Super Admin</span><span className="secure-indicator"><i /> Secure session</span><PwaInstallButton /><button className="button button-secondary portal-logout" type="button" disabled={signingOut} onClick={() => void handleSignOut()}><LogOut size={15} /><span>{signingOut ? 'Signing out…' : 'Log out'}</span></button></div></header><div className="admin-content"><Outlet /></div></div>
  </div>
}
