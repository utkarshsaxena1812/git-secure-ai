import { HashRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom'
import Landing from './components/Landing'
import AppLayout from './app/AppLayout'
import Dashboard from './app/Dashboard'
import RepoDetail from './app/RepoDetail'
import ScanHistory from './app/ScanHistory'
import Fixes from './app/Fixes'
import Settings from './app/Settings'
import { SettingsProvider } from './app/SettingsContext'
import { connectGitHub } from './app/api'

function LandingRoute() {
  const navigate = useNavigate()
  // Live mode → GitHub OAuth; mock mode → straight into the app.
  return <Landing onLaunch={() => connectGitHub(() => navigate('/app'))} />
}

export default function App() {
  return (
    <SettingsProvider>
      <HashRouter>
        <Routes>
          <Route path="/" element={<LandingRoute />} />
          <Route path="/app" element={<AppLayout />}>
            <Route index element={<Dashboard />} />
            <Route path="repos/:repoId" element={<RepoDetail />} />
            <Route path="scans" element={<ScanHistory />} />
            <Route path="fixes" element={<Fixes />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </SettingsProvider>
  )
}
