import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { AuthProvider } from './context/AuthContext'
import { ToastProvider } from './components/ui/Toast'
import { ConfirmProvider } from './components/ui/ConfirmDialog'
import Layout     from './components/layout/Layout'
import Home       from './pages/Home'
import Login      from './pages/Login'
import Results    from './pages/Results'
import Students   from './pages/Students'
import Teachers   from './pages/Teachers'
import Dashboard  from './pages/Dashboard'

const queryClient = new QueryClient()

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
      <ConfirmProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* No layout — own full-page design */}
            <Route path="/login"      element={<Login />} />
            <Route path="/dashboard"  element={<Dashboard />} />

            {/* Public pages with top navbar */}
            <Route path="/*" element={
              <Layout>
                <Routes>
                  <Route path="/"          element={<Home />} />
                  <Route path="/results"   element={<Results />} />
                  <Route path="/students"  element={<Students />} />
                  <Route path="/teachers"  element={<Teachers />} />
                </Routes>
              </Layout>
            } />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
      </ConfirmProvider>
      </ToastProvider>
    </QueryClientProvider>
  )
}
