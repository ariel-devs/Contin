import { useState, type FormEvent } from 'react'
import './Login.css'

type AuthenticatedUser = {
  id: number
  nombre: string
  correo: string
}

type LoginSession = {
  token: string
  user: AuthenticatedUser
}

function isLoginSession(value: unknown): value is LoginSession {
  if (typeof value !== 'object' || value === null) return false

  const session = value as Record<string, unknown>
  if (typeof session.token !== 'string' || typeof session.user !== 'object' || session.user === null) {
    return false
  }

  const user = session.user as Record<string, unknown>
  return (
    typeof user.id === 'number' &&
    typeof user.nombre === 'string' &&
    typeof user.correo === 'string'
  )
}

function Login({
  onAuthenticated,
}: {
  onAuthenticated: (session: LoginSession) => void
}) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [session, setSession] = useState<LoginSession | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setIsSubmitting(true)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correo: email, contrasena: password }),
      })

      if (!response.ok) {
        setError(
          response.status === 401
            ? 'El correo o la contraseña no son correctos.'
            : response.status === 429
              ? 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.'
              : 'No fue posible iniciar sesión. Inténtalo más tarde.',
        )
        return
      }

      const result: unknown = await response.json()
      if (!isLoginSession(result)) {
        throw new Error('El servidor devolvió una respuesta de inicio de sesión inválida.')
      }

      setSession(result)
      onAuthenticated(result)
    } catch (requestError) {
      console.error('Error al comunicarse con el servicio de inicio de sesión:', requestError)
      setError('No fue posible conectar con el servidor. Inténtalo de nuevo.')
    } finally {
      setIsSubmitting(false)
    }
  }

  function handleLogout() {
    setSession(null)
    setEmail('')
    setPassword('')
  }

  return (
    <div className="login-page">
      <section className="brand-panel" aria-label="Acerca de Contin">
        <a className="brand" href="/" aria-label="Contin, inicio">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none">
              <path d="M25.5 9.5a12 12 0 1 0 0 13" />
              <path d="M22 13.5h-9m0 0 3.5-3.5M13 13.5 16.5 17" />
              <path d="M10 20h12" />
            </svg>
          </span>
          <span>contin</span>
        </a>

        <div className="brand-copy">
          <span className="eyebrow">TU NEGOCIO, EN ORDEN</span>
          <h1>
            Las cuentas claras.
            <br />
            El camino, <span>más fácil.</span>
          </h1>
          <p>
            Una forma más simple de llevar el control de tus finanzas y tomar
            mejores decisiones.
          </p>
        </div>

        <div className="finance-card" aria-hidden="true">
          <div className="finance-card-heading">
            <div>
              <span className="finance-label">DATOS DE EJEMPLO</span>
              <strong>Tu negocio en movimiento</strong>
            </div>
            <span className="finance-dots">•••</span>
          </div>
          <div className="finance-amount">
            <span>$ 24,580.00</span>
            <span className="finance-change">↗ 12.8%</span>
          </div>
          <div className="chart">
            <div className="chart-grid">
              <span />
              <span />
              <span />
            </div>
            <svg viewBox="0 0 420 104" preserveAspectRatio="none">
              <defs>
                <linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1">
                  <stop offset="0%" stopColor="#7cc9a5" stopOpacity=".32" />
                  <stop offset="100%" stopColor="#7cc9a5" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M0 78C28 74 34 48 67 56s38 29 69 12 34-28 62-15 33 12 59-5 37-30 65-19 38 14 57-3 31-15 41-18v96H0Z"
                fill="url(#chartFill)"
              />
              <path
                d="M0 78C28 74 34 48 67 56s38 29 69 12 34-28 62-15 33 12 59-5 37-30 65-19 38 14 57-3 31-15 41-18"
                fill="none"
                stroke="#91d9b8"
                strokeLinecap="round"
                strokeWidth="3"
              />
            </svg>
          </div>
          <div className="chart-months">
            <span>ENE</span>
            <span>FEB</span>
            <span>MAR</span>
            <span>ABR</span>
            <span>MAY</span>
            <span>JUN</span>
          </div>
        </div>

        <span className="brand-footer">MENOS VUELTAS. MÁS CLARIDAD.</span>
      </section>

      <section className="form-panel">
        <div className="login-content">
          {session ? (
            <div className="success-state" role="status">
              <span className="success-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none">
                  <path
                    d="m5 12.5 4.5 4.5L19 7"
                    stroke="currentColor"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                  />
                </svg>
              </span>
              <span className="form-eyebrow">SESIÓN INICIADA</span>
              <h2>¡Qué bueno verte!</h2>
              <p className="form-description">
                Hola, <strong>{session.user.nombre}</strong> ({session.user.correo}).
                Tu espacio de trabajo está listo.
              </p>
              <button
                className="submit-button"
                type="button"
                onClick={handleLogout}
              >
                Cerrar sesión
                <span aria-hidden="true">→</span>
              </button>
            </div>
          ) : (
            <>
              <div className="mobile-brand" aria-label="Contin">
                <span className="brand-mark" aria-hidden="true">
                  <svg viewBox="0 0 32 32" fill="none">
                    <path d="M25.5 9.5a12 12 0 1 0 0 13" />
                    <path d="M22 13.5h-9m0 0 3.5-3.5M13 13.5 16.5 17" />
                    <path d="M10 20h12" />
                  </svg>
                </span>
                <span>contin</span>
              </div>
              <div className="form-heading">
                <span className="form-eyebrow">BIENVENIDO DE NUEVO</span>
                <h2>Inicia sesión</h2>
                <p className="form-description">
                  Ingresa tus datos para continuar con tu negocio.
                </p>
              </div>

              <form className="login-form" onSubmit={handleSubmit}>
                <label className="field-label" htmlFor="email">
                  Correo electrónico
                </label>
                <div className="input-wrap">
                  <span className="input-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none">
                      <circle cx="12" cy="8" r="3.5" />
                      <path d="M5 20v-1.5a7 7 0 0 1 14 0V20H5Z" />
                    </svg>
                  </span>
                  <input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="nombre@empresa.com"
                    value={email}
                    onChange={(event) => {
                      setEmail(event.target.value)
                      setError('')
                    }}
                    required
                  />
                </div>

                <label className="field-label password-label" htmlFor="password">
                  Contraseña
                </label>
                <div className="input-wrap">
                  <span className="input-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" fill="none">
                      <rect x="5" y="10" width="14" height="11" rx="2" />
                      <path d="M8 10V7a4 4 0 1 1 8 0v3" />
                    </svg>
                  </span>
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    placeholder="Escribe tu contraseña"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value)
                      setError('')
                    }}
                    required
                  />
                  <button
                    className="visibility-button"
                    type="button"
                    onClick={() => setShowPassword((visible) => !visible)}
                    aria-label={
                      showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'
                    }
                    aria-pressed={showPassword}
                  >
                    {showPassword ? (
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="m3 3 18 18M10.6 10.7a2 2 0 0 0 2.7 2.7" />
                        <path d="M9.9 5.2A10.7 10.7 0 0 1 12 5c5.5 0 9 7 9 7a15 15 0 0 1-3.1 3.8M6.2 6.2C3.9 7.8 3 12 3 12s3.5 7 9 7a10 10 0 0 0 3-.5" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M3 12s3.5-7 9-7 9 7 9 7-3.5 7-9 7-9-7-9-7Z" />
                        <circle cx="12" cy="12" r="2.5" />
                      </svg>
                    )}
                  </button>
                </div>

                {error && (
                  <p className="form-error" role="alert">
                    <span aria-hidden="true">!</span>
                    {error}
                  </p>
                )}

                <button className="submit-button" type="submit" disabled={isSubmitting}>
                  {isSubmitting ? 'Ingresando...' : 'Ingresar'}
                  <span aria-hidden="true">→</span>
                </button>
              </form>
            </>
          )}
        </div>

        <footer className="form-footer">
          <span>© 2026 Contin</span>
          <span>Hecho para llevar tus cuentas con claridad.</span>
        </footer>
      </section>
    </div>
  )
}

export default Login
