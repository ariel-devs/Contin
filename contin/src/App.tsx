import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import AccountingApp from './components/AccountingApp'
import { ErrorBoundary } from './components/ErrorBoundary'
import Login from './components/Login'
import { setUnauthorizedHandler } from './services/accountingApi'
import type { LoginSession } from './types/accounting'
import './App.css'

const sessionStorageKey = 'contin.session'

function isLoginSession(value: unknown): value is LoginSession {
  if (typeof value !== 'object' || value === null) return false
  const session = value as Record<string, unknown>
  if (
    typeof session.token !== 'string' ||
    typeof session.user !== 'object' ||
    session.user === null
  ) {
    return false
  }
  const user = session.user as Record<string, unknown>
  return (
    typeof user.id === 'number' &&
    typeof user.nombre === 'string' &&
    typeof user.correo === 'string'
  )
}

function readStoredSession(): LoginSession | null {
  const stored = sessionStorage.getItem(sessionStorageKey)
  if (!stored) return null
  try {
    const parsed: unknown = JSON.parse(stored)
    if (isLoginSession(parsed)) return parsed
  } catch (error) {
    console.error('No fue posible recuperar la sesión guardada:', error)
  }
  sessionStorage.removeItem(sessionStorageKey)
  return null
}

function App() {
  const [session, setSession] = useState<LoginSession | null>(readStoredSession)

  function signIn(nextSession: LoginSession) {
    sessionStorage.setItem(sessionStorageKey, JSON.stringify(nextSession))
    setSession(nextSession)
  }

  function signOut() {
    sessionStorage.removeItem(sessionStorageKey)
    setSession(null)
  }

  useEffect(() => {
    setUnauthorizedHandler(() => {
      signOut()
    })
    return () => setUnauthorizedHandler(null)
  }, [])

  return (
    <ErrorBoundary>
      <BrowserRouter>
        <Routes>
          <Route
            path="/login"
            element={
              session ? <Navigate to="/" replace /> : <Login onAuthenticated={signIn} />
            }
          />
          <Route
            path="/*"
            element={
              session ? (
                <AccountingApp session={session} onSignOut={signOut} />
              ) : (
                <Navigate to="/login" replace />
              )
            }
          />
        </Routes>
      </BrowserRouter>
    </ErrorBoundary>
  )
}

export default App
