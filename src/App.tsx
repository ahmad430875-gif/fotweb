import { Navigate, Route, Routes, useNavigate } from 'react-router-dom'
import { useEffect } from 'react'
import './App.css'
import { RequireSuperAdmin } from './auth/RequireSuperAdmin'
import { RequireUniversityAdmin } from './auth/RequireUniversityAdmin'
import { AdminLayout } from './pages/admin/AdminLayout'
import { DashboardPage } from './pages/admin/DashboardPage'
import { LoginPage } from './pages/admin/LoginPage'
import { UniversityCreatePage, UniversityDetailPage, UniversityListPage } from './pages/admin/UniversityPages'
import { UniversityManagementPortal } from './pages/admin/UniversityManagementPortal'
import { AcceptInvitationPage, ResetPasswordPage } from './pages/admin/ResetPasswordPage'
import { PublicCompetitionsPage, PublicHomePage, PublicUniversitiesPage } from './pages/PublicPages'
import { PublicPlayerDetailPage, PublicSquadDetailPage, PublicTeamDetailPage, PublicUniversityDetailPage } from './pages/PublicDetailPages'
import { CompetitionCentrePage } from './pages/CompetitionCentrePage'
import { MatchDetailPage } from './pages/MatchDetailPage'
import { OAuthConsentPage } from './pages/OAuthConsentPage'
import { NewsManagementPage } from './pages/admin/NewsManagementPage'
import { SecretaryDashboardPage, SecretaryLayout, SecretaryRecordsPage } from './pages/secretary/SecretaryPortal'
import { SecretaryAnnouncementsPage, SecretaryClassTeamsPage, SecretaryLiveMatchPage, SecretarySettingsPage, SecretaryStatisticsPage, SecretaryStandingsPage, SecretaryUniversityTeamPage } from './pages/secretary/SecretaryAdvancedPages'
import { SecretaryControlCenter } from './pages/secretary/SecretaryControlCenter'
import { SecretaryLeaguePortal } from './pages/secretary/SecretaryLeaguePortal'
import { initialAuthCallbackType } from './lib/supabase'
import { PwaInstallPrompt } from './components/PwaInstallPrompt'

function App() {
  const navigate = useNavigate()

  useEffect(() => {
    if (initialAuthCallbackType === 'invite' || initialAuthCallbackType === 'recovery') {
      navigate(initialAuthCallbackType === 'invite' ? '/admin/accept-invitation' : '/admin/reset-password', { replace: true })
    }
  }, [navigate])

  return (
    <>
      <Routes>
        <Route path="/" element={<PublicHomePage />} />
        <Route path="/competitions" element={<PublicCompetitionsPage />} />
        <Route path="/competitions/:id" element={<CompetitionCentrePage />} />
        <Route path="/matches/:id" element={<MatchDetailPage />} />
        <Route path="/universities" element={<PublicUniversitiesPage />} />
        <Route path="/universities/:id" element={<PublicUniversityDetailPage />} />
        <Route path="/teams/:id" element={<PublicTeamDetailPage />} />
        <Route path="/players/:id" element={<PublicPlayerDetailPage />} />
        <Route path="/squads/:id" element={<PublicSquadDetailPage />} />
        <Route path="/admin/login" element={<LoginPage />} />
        <Route path="/admin/accept-invitation" element={<AcceptInvitationPage />} />
        <Route path="/admin/reset-password" element={<ResetPasswordPage />} />
        <Route path="/oauth/consent" element={<OAuthConsentPage />} />

        <Route element={<RequireUniversityAdmin />}>
          <Route path="/secretary" element={<SecretaryLayout />}>
            <Route index element={<SecretaryDashboardPage />} />
            <Route path="team" element={<SecretaryUniversityTeamPage />} />
            <Route path="class-teams" element={<SecretaryClassTeamsPage />} />
            <Route path="announcements" element={<SecretaryAnnouncementsPage />} />
            <Route path="leagues" element={<SecretaryLeaguePortal />} />
            <Route path="competitions" element={<SecretaryRecordsPage kind="competitions" />} />
            <Route path="teams" element={<SecretaryRecordsPage kind="teams" />} />
            <Route path="players" element={<SecretaryRecordsPage kind="players" />} />
            <Route path="matches" element={<SecretaryRecordsPage kind="matches" />} />
            <Route path="control-center/*" element={<SecretaryControlCenter />} />
            <Route path="news" element={<NewsManagementPage scope="university" />} />
            <Route path="live" element={<SecretaryLiveMatchPage />} />
            <Route path="standings" element={<SecretaryStandingsPage />} />
            <Route path="statistics" element={<SecretaryStatisticsPage />} />
            <Route path="settings" element={<SecretarySettingsPage />} />
          </Route>
        </Route>

        <Route element={<RequireSuperAdmin />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="universities" element={<UniversityListPage />} />
            <Route path="universities/new" element={<UniversityCreatePage />} />
            <Route path="universities/:id" element={<UniversityDetailPage />} />
            <Route path="news" element={<NewsManagementPage scope="platform" />} />
          </Route>
          <Route path="/admin/universities/:id/manage" element={<UniversityManagementPortal />}>
            <Route element={<SecretaryLayout />}>
              <Route index element={<SecretaryDashboardPage />} />
              <Route path="team" element={<SecretaryUniversityTeamPage />} />
              <Route path="class-teams" element={<SecretaryClassTeamsPage />} />
              <Route path="announcements" element={<SecretaryAnnouncementsPage />} />
              <Route path="leagues" element={<SecretaryLeaguePortal />} />
              <Route path="competitions" element={<SecretaryRecordsPage kind="competitions" />} />
              <Route path="teams" element={<SecretaryRecordsPage kind="teams" />} />
              <Route path="players" element={<SecretaryRecordsPage kind="players" />} />
              <Route path="matches" element={<SecretaryRecordsPage kind="matches" />} />
              <Route path="control-center/*" element={<SecretaryControlCenter />} />
              <Route path="news" element={<NewsManagementPage scope="university" />} />
              <Route path="live" element={<SecretaryLiveMatchPage />} />
              <Route path="standings" element={<SecretaryStandingsPage />} />
              <Route path="statistics" element={<SecretaryStatisticsPage />} />
              <Route path="settings" element={<SecretarySettingsPage />} />
            </Route>
          </Route>
        </Route>

        <Route path="/forbidden" element={<main className="access-state"><span className="eyebrow">UNIVERSITY ACCESS</span><h1>This portal is for platform administrators.</h1><p>University Sports Secretaries must sign in with an authorized university account.</p></main>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      <PwaInstallPrompt />
    </>
  )
}

export default App
