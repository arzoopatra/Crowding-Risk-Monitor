import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AppStateProvider } from './state/AppState'
import { Sidebar } from './components/Shell'
import { MonitorPage } from './pages/MonitorPage'
import { SignalDetailPage } from './pages/SignalDetailPage'
import { AlertHistoryPage } from './pages/AlertHistoryPage'
import { WatchlistPage } from './pages/WatchlistPage'
import { MethodPage } from './pages/MethodPage'

export default function App() {
  return (
    <AppStateProvider>
      <HashRouter>
        <div className="app">
          <Sidebar />
          <main className="main">
            <Routes>
              <Route path="/" element={<MonitorPage />} />
              <Route path="/signal/:ticker" element={<SignalDetailPage />} />
              <Route path="/alerts" element={<AlertHistoryPage />} />
              <Route path="/watchlist" element={<WatchlistPage />} />
              <Route path="/method" element={<MethodPage />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </HashRouter>
    </AppStateProvider>
  )
}
