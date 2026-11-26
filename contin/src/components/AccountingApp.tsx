import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  Link,
  NavLink,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom'
import { apiRequest } from '../services/accountingApi'
import type {
  Book,
  Company,
  DashboardData,
  LoginSession,
  TipoContribuyente,
} from '../types/accounting'
import { formatDate, formatMoney } from '../utils/format'
import { Icon, type IconName } from './Icon'
import AccountCatalogModule from './AccountCatalogModule'
import JournalModule from './JournalModule'
import PeriodsModule from './PeriodsModule'
import TercerosModule from './TercerosModule'
import DteModule from './DteModule'
import LibroIvaModule from './LibroIvaModule'
import MayorModule from './MayorModule'
import DeclaracionIvaModule from './DeclaracionIvaModule'
import './AccountingApp.css'

const menuItems: { label: string; slug: string; icon: IconName }[] = [
  { label: 'Dashboard', slug: 'dashboard', icon: 'dashboard' },
  { label: 'Libro diario', slug: 'diario', icon: 'journal' },
  { label: 'Libro mayor', slug: 'mayor', icon: 'ledger' },
  { label: 'Balance', slug: 'balance', icon: 'balance' },
  { label: 'Libro de IVA', slug: 'libro-iva', icon: 'vat' },
  { label: 'Declaración IVA', slug: 'declaracion-iva', icon: 'closing' },
  { label: 'Terceros', slug: 'terceros', icon: 'building' },
  { label: 'DTE', slug: 'dte', icon: 'journal' },
  { label: 'Catálogo de cuentas', slug: 'cuentas', icon: 'accounts' },
  { label: 'Períodos contables', slug: 'periodos', icon: 'periods' },
  { label: 'Configuración', slug: 'configuracion', icon: 'settings' },
]

function selectedBookStorageKey(companyId: number) {
  return `contin.selectedBook.${companyId}`
}

function initials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase() ?? '')
    .join('')
}

function AccountingApp({
  session,
  onSignOut,
}: {
  session: LoginSession
  onSignOut: () => void
}) {
  const [companies, setCompanies] = useState<Company[]>([])
  const [loadedBooks, setLoadedBooks] = useState<Book[]>([])
  const [booksForCompanyId, setBooksForCompanyId] = useState<number | null>(null)
  const [booksSettledCompanyId, setBooksSettledCompanyId] = useState<number | null>(null)
  const [booksRefreshVersion, setBooksRefreshVersion] = useState(0)
  const [selectedBookId, setSelectedBookId] = useState('')
  const [loadedDashboard, setLoadedDashboard] = useState<DashboardData | null>(null)
  const [dashboardKey, setDashboardKey] = useState('')
  const [dashboardFetchKey, setDashboardFetchKey] = useState('')
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(true)
  const [isLoadingBooks, setIsLoadingBooks] = useState(false)
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(false)
  const [error, setError] = useState('')
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const navigate = useNavigate()
  const location = useLocation()

  const companyIdFromPath = location.pathname.match(/^\/companies\/(\d+)/)?.[1]
  const currentCompany = companies.find((company) => company.id === Number(companyIdFromPath))
  const activeSection = location.pathname.split('/').filter(Boolean).at(-1)
  const books = currentCompany && booksForCompanyId === currentCompany.id ? loadedBooks : []
  const currentBook = books.find((book) => String(book.id) === selectedBookId)
  const currentDashboardKey =
    currentCompany && currentBook ? `${currentCompany.id}:${currentBook.id}` : ''
  const dashboard =
    currentDashboardKey && dashboardKey === currentDashboardKey ? loadedDashboard : null
  const isCurrentBooksLoading =
    isLoadingBooks ||
    Boolean(currentCompany && booksSettledCompanyId !== currentCompany.id)
  const isCurrentDashboardLoading =
    isCurrentBooksLoading ||
    Boolean(
      currentBook &&
      activeSection === 'dashboard' &&
      (isLoadingDashboard || dashboardFetchKey !== currentDashboardKey),
    )

  useEffect(() => {
    let active = true
    apiRequest<Company[]>(session, '/api/companies')
      .then((result) => {
        if (active) {
          setCompanies(result)
          setIsLoadingCompanies(false)
        }
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'No fue posible cargar las empresas.',
          )
          setIsLoadingCompanies(false)
        }
      })
    return () => {
      active = false
    }
  }, [session])

  useEffect(() => {
    if (isLoadingCompanies || location.pathname !== '/') return
    if (companies.length === 0) navigate('/companies/new', { replace: true })
    else if (companies.length === 1)
      navigate(`/companies/${companies[0].id}/dashboard`, { replace: true })
    else navigate('/companies', { replace: true })
  }, [companies, isLoadingCompanies, location.pathname, navigate])

  useEffect(() => {
    if (!currentCompany) return
    let active = true
    const savedBookId = sessionStorage.getItem(selectedBookStorageKey(currentCompany.id))
    apiRequest<Book[]>(session, `/api/companies/${currentCompany.id}/books`)
      .then((result) => {
        if (active) {
          setError('')
          setLoadedBooks(result)
          setBooksForCompanyId(currentCompany.id)
          setBooksSettledCompanyId(currentCompany.id)
          const preferredBookId = result.some((book) => String(book.id) === savedBookId)
            ? savedBookId!
            : result[0]
              ? String(result[0].id)
              : ''
          setSelectedBookId(preferredBookId)
          if (preferredBookId) {
            sessionStorage.setItem(selectedBookStorageKey(currentCompany.id), preferredBookId)
          } else {
            sessionStorage.removeItem(selectedBookStorageKey(currentCompany.id))
          }
          setIsLoadingBooks(false)
        }
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'No fue posible cargar los libros.',
          )
          setBooksSettledCompanyId(currentCompany.id)
          setIsLoadingBooks(false)
        }
      })
    return () => {
      active = false
    }
  }, [booksRefreshVersion, currentCompany, session])

  useEffect(() => {
    if (!currentCompany || !currentBook || activeSection !== 'dashboard') return
    let active = true
    apiRequest<DashboardData>(
      session,
      `/api/companies/${currentCompany.id}/books/${currentBook.id}/dashboard`,
    )
      .then((result) => {
        if (active) {
          setError('')
          setLoadedDashboard(result)
          setDashboardKey(`${currentCompany.id}:${currentBook.id}`)
          setDashboardFetchKey(`${currentCompany.id}:${currentBook.id}`)
          setIsLoadingDashboard(false)
        }
      })
      .catch((requestError: unknown) => {
        if (active) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'No fue posible cargar el dashboard.',
          )
          setDashboardFetchKey(`${currentCompany.id}:${currentBook.id}`)
          setIsLoadingDashboard(false)
        }
      })
    return () => {
      active = false
    }
  }, [activeSection, currentBook, currentCompany, session])

  function handleCompanyChange(value: string) {
    if (!value) {
      navigate('/companies')
      return
    }
    navigate(`/companies/${value}/dashboard`)
  }

  function handleBooksChanged(preferredBookId?: number) {
    if (currentCompany && preferredBookId) {
      const bookId = String(preferredBookId)
      sessionStorage.setItem(selectedBookStorageKey(currentCompany.id), bookId)
      setSelectedBookId(bookId)
    }
    setBooksRefreshVersion((version) => version + 1)
  }

  function handlePeriodSelect(book: Book) {
    if (!currentCompany) return
    const bookId = String(book.id)
    sessionStorage.setItem(selectedBookStorageKey(currentCompany.id), bookId)
    setSelectedBookId(bookId)
    navigate(`/companies/${currentCompany.id}/diario`)
  }

  const pageTitle = useMemo(
    () => menuItems.find((item) => item.slug === activeSection)?.label ?? 'Dashboard',
    [activeSection],
  )

  return (
    <div
      className={`workspace${sidebarCollapsed ? ' workspace--collapsed' : ''}${mobileMenuOpen ? ' workspace--mobile-open' : ''}`}
    >
      {mobileMenuOpen && (
        <button
          aria-label="Cerrar menú"
          className="mobile-backdrop"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
      <aside className="sidebar">
        <div className="sidebar-brand">
          <Link className="sidebar-logo" to="/" aria-label="Contin, inicio">
            <span className="sidebar-logo-mark">c</span>
            {!sidebarCollapsed && <span>contin</span>}
          </Link>
          <button
            aria-label={sidebarCollapsed ? 'Expandir menú' : 'Contraer menú'}
            className="sidebar-collapse"
            onClick={() => setSidebarCollapsed((collapsed) => !collapsed)}
          >
            <Icon name="menu" size={18} />
          </button>
        </div>

        <div className="sidebar-company-label">
          {!sidebarCollapsed && <span>ESPACIO DE TRABAJO</span>}
        </div>
        <nav className="sidebar-nav" aria-label="Navegación principal">
          {menuItems.map((item) => {
            const target =
              item.slug === 'mayor'
                ? '/app/mayor'
                : currentCompany
                  ? `/companies/${currentCompany.id}/${item.slug}`
                  : '/companies'
            return (
              <NavLink
                key={item.slug}
                to={target}
                title={sidebarCollapsed ? item.label : undefined}
                className={({ isActive }) =>
                  `sidebar-link${isActive ? ' sidebar-link--active' : ''}`
                }
                onClick={() => setMobileMenuOpen(false)}
              >
                <Icon name={item.icon} size={19} />
                {!sidebarCollapsed && <span>{item.label}</span>}
              </NavLink>
            )
          })}
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-user">
            <span className="user-avatar">{initials(session.user.nombre)}</span>
            {!sidebarCollapsed && (
              <span className="sidebar-user-copy">
                <strong>{session.user.nombre}</strong>
                <span>{session.user.correo}</span>
              </span>
            )}
          </div>
          <button
            className="sidebar-logout"
            onClick={onSignOut}
            title={sidebarCollapsed ? 'Cerrar sesión' : undefined}
          >
            <Icon name="logout" size={18} />
            {!sidebarCollapsed && <span>Cerrar sesión</span>}
          </button>
        </div>
      </aside>

      <div className="workspace-main">
        <header className="topbar">
          <button
            className="mobile-menu-button"
            aria-label="Abrir menú"
            onClick={() => setMobileMenuOpen(true)}
          >
            <Icon name="menu" />
          </button>
          <div className="topbar-context">
            <span className="topbar-label">Empresa</span>
            {companies.length ? (
              <label className="topbar-select-wrap">
                <Icon name="building" size={17} />
                <select
                  aria-label="Seleccionar empresa"
                  value={currentCompany ? String(currentCompany.id) : ''}
                  onChange={(event) => handleCompanyChange(event.target.value)}
                >
                  {!currentCompany && <option value="">Selecciona una empresa</option>}
                  {companies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.nombre}
                    </option>
                  ))}
                </select>
                <Icon name="chevron" size={16} />
              </label>
            ) : (
              <span className="topbar-empty">Sin empresas registradas</span>
            )}
          </div>

          <div className="topbar-context topbar-period">
            <span className="topbar-label">Período contable</span>
            <label className="topbar-select-wrap">
              <Icon name="calendar" size={17} />
              <select
                aria-label="Seleccionar período contable"
                value={selectedBookId}
                disabled={!books.length || isCurrentBooksLoading}
                onChange={(event) => {
                  const bookId = event.target.value
                  setSelectedBookId(bookId)
                  if (currentCompany) {
                    sessionStorage.setItem(
                      selectedBookStorageKey(currentCompany.id),
                      bookId,
                    )
                  }
                }}
              >
                {!books.length && (
                  <option value="">
                    {isCurrentBooksLoading ? 'Cargando períodos...' : 'Sin períodos disponibles'}
                  </option>
                )}
                {books.map((book) => (
                  <option key={book.id} value={book.id}>
                    {book.nombre} · {formatDate(book.fechaInicio)} – {formatDate(book.fechaFin)} ·{' '}
                    {book.estado === 'ABIERTO' ? 'Abierto' : 'Cerrado'}
                  </option>
                ))}
              </select>
              <Icon name="chevron" size={16} />
            </label>
          </div>

          <div className="topbar-right">
            <button className="notification-button" aria-label="Notificaciones">
              <Icon name="bell" size={19} />
            </button>
            <span className="topbar-divider" />
            <span className="topbar-user-name">{session.user.nombre}</span>
            <span className="user-avatar user-avatar--small">{initials(session.user.nombre)}</span>
          </div>
        </header>

        <main className="page-content">
          {error && (
            <div className="app-alert" role="alert">
              <span>{error}</span>
              <button aria-label="Cerrar mensaje" onClick={() => setError('')}>
                <Icon name="close" size={16} />
              </button>
            </div>
          )}
          <Routes>
            <Route
              path="/"
              element={
                isLoadingCompanies ? (
                  <LoadingMessage text="Cargando tus empresas..." />
                ) : companies.length === 0 ? (
                  <Navigate to="/companies/new" replace />
                ) : companies.length === 1 ? (
                  <Navigate to={`/companies/${companies[0].id}/dashboard`} replace />
                ) : (
                  <Navigate to="/companies" replace />
                )
              }
            />
            <Route
              path="/companies"
              element={
                <CompanyPicker
                  companies={companies}
                  loading={isLoadingCompanies}
                  onSelect={(company) => navigate(`/companies/${company.id}/dashboard`)}
                  onCreate={() => navigate('/companies/new')}
                />
              }
            />
            <Route
              path="/companies/new"
              element={
                <NewCompany
                  session={session}
                  onCreated={(company) => {
                    setCompanies((existing) => [...existing, company])
                    navigate(`/companies/${company.id}/dashboard`)
                  }}
                  onCancel={() => navigate(companies.length > 1 ? '/companies' : '/')}
                />
              }
            />
            <Route
              path="/app/mayor"
              element={
                isLoadingCompanies ? (
                  <LoadingMessage text="Cargando empresa..." />
                ) : companies.length === 0 ? (
                  <Navigate to="/companies/new" replace />
                ) : (
                  <MayorModule session={session} company={companies[0]} />
                )
              }
            />
            <Route
              path="/companies/:companyId/:section"
              element={
                currentCompany ? (
                  activeSection === 'dashboard' ? (
                    <Dashboard
                      company={currentCompany}
                      book={currentBook}
                      data={dashboard}
                      loading={isCurrentBooksLoading || isCurrentDashboardLoading}
                      onNavigate={(section) =>
                        navigate(`/companies/${currentCompany.id}/${section}`)
                      }
                    />
                  ) : activeSection === 'diario' ? (
                    currentBook ? (
                      <JournalModule
                        session={session}
                        company={currentCompany}
                        book={currentBook}
                      />
                    ) : isCurrentBooksLoading ? (
                      <LoadingMessage text="Cargando períodos contables..." />
                    ) : books.length === 0 ? (
                      <NoPeriods company={currentCompany} navigate={navigate} />
                    ) : (
                      <SelectPeriod />
                    )
                  ) : activeSection === 'mayor' ? (
                    <MayorModule
                      session={session}
                      company={currentCompany}
                      book={currentBook}
                    />
                  ) : activeSection === 'periodos' ? (
                    isCurrentBooksLoading ? (
                      <LoadingMessage text="Cargando períodos contables..." />
                    ) : (
                      <PeriodsModule
                        session={session}
                        company={currentCompany}
                        books={books}
                        onBooksChanged={handleBooksChanged}
                        onSelectBook={handlePeriodSelect}
                      />
                    )
                  ) : activeSection === 'cuentas' ? (
                    <AccountCatalogModule session={session} company={currentCompany} />
                  ) : activeSection === 'terceros' ? (
                    <TercerosModule session={session} company={currentCompany} />
                  ) : activeSection === 'dte' ? (
                    <DteModule session={session} company={currentCompany} />
                  ) : activeSection === 'libro-iva' ? (
                    currentBook ? (
                      <LibroIvaModule
                        session={session}
                        company={currentCompany}
                        book={currentBook}
                      />
                    ) : (
                      <SelectPeriod />
                    )
                  ) : activeSection === 'declaracion-iva' ? (
                    currentBook ? (
                      <DeclaracionIvaModule
                        session={session}
                        company={currentCompany}
                        book={currentBook}
                      />
                    ) : (
                      <SelectPeriod />
                    )
                  ) : (
                    <ComingSoon title={pageTitle} />
                  )
                ) : isLoadingCompanies ? (
                  <LoadingMessage text="Cargando empresa..." />
                ) : (
                  <Navigate to="/companies" replace />
                )
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

function LoadingMessage({ text }: { text: string }) {
  return (
    <div className="loading-message" role="status">
      <span className="loading-spinner" />
      {text}
    </div>
  )
}

function NoPeriods({
  company,
  navigate,
}: {
  company: Company
  navigate: ReturnType<typeof useNavigate>
}) {
  return (
    <section className="coming-page">
      <span className="coming-icon">
        <Icon name="calendar" size={24} />
      </span>
      <span className="section-eyebrow">PERÍODO CONTABLE</span>
      <h1>Esta empresa aún no tiene períodos</h1>
      <p>
        Registra un período contable para consultar o registrar partidas en el Libro diario.
      </p>
      <button
        className="primary-button"
        onClick={() => navigate(`/companies/${company.id}/periodos`)}
      >
        <Icon name="plus" size={17} />
        Crear período
      </button>
    </section>
  )
}

function SelectPeriod() {
  return (
    <section className="coming-page">
      <span className="coming-icon">
        <Icon name="calendar" size={24} />
      </span>
      <span className="section-eyebrow">PERÍODO CONTABLE</span>
      <h1>Selecciona un período</h1>
      <p>Elige un período en el selector superior para continuar.</p>
    </section>
  )
}

function CompanyPicker({
  companies,
  loading,
  onSelect,
  onCreate,
}: {
  companies: Company[]
  loading: boolean
  onSelect: (company: Company) => void
  onCreate: () => void
}) {
  if (loading) return <LoadingMessage text="Cargando tus empresas..." />

  return (
    <section className="company-page">
      <div className="page-heading">
        <div>
          <span className="section-eyebrow">ESPACIOS DE TRABAJO</span>
          <h1>Selecciona una empresa</h1>
          <p>Elige la empresa que deseas administrar.</p>
        </div>
        <button className="primary-button" onClick={onCreate}>
          <Icon name="plus" size={18} />
          Registrar empresa
        </button>
      </div>
      {companies.length === 0 ? (
        <div className="empty-card company-empty">
          <span className="empty-icon">
            <Icon name="building" size={24} />
          </span>
          <h2>Aún no tienes empresas</h2>
          <p>Registra tu primera empresa para comenzar a organizar tu contabilidad.</p>
          <button className="primary-button" onClick={onCreate}>
            <Icon name="plus" size={18} /> Registrar primera empresa
          </button>
        </div>
      ) : (
        <div className="company-grid">
          {companies.map((company) => (
            <button className="company-card" key={company.id} onClick={() => onSelect(company)}>
              <span className="company-card-icon">
                <Icon name="building" size={22} />
              </span>
              <span className="company-card-copy">
                <strong>{company.nombre}</strong>
                <span>{company.nit ? `NIT ${company.nit}` : 'Empresa'}</span>
              </span>
              <Icon name="arrow" size={18} />
            </button>
          ))}
        </div>
      )}
    </section>
  )
}

function NewCompany({
  session,
  onCreated,
  onCancel,
}: {
  session: LoginSession
  onCreated: (company: Company) => void
  onCancel: () => void
}) {
  const [name, setName] = useState('')
  const [nit, setNit] = useState('')
  const [nrc, setNrc] = useState('')
  const [tipoContribuyente, setTipoContribuyente] = useState<TipoContribuyente>('PEQUENO')
  const [inscritoDte, setInscritoDte] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const nitPattern = /^\d{4}-\d{6}-\d{3}-\d{1}$/
  const nitValido = nit.trim() === '' || nitPattern.test(nit.trim())

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (!nitValido) {
      setError('El NIT debe tener el formato ####-######-###-#.')
      return
    }
    setSubmitting(true)
    try {
      const company = await apiRequest<Company>(session, '/api/companies', {
        method: 'POST',
        body: JSON.stringify({
          nombre: name.trim(),
          nit: nit.trim() || null,
          nrc: nrc.trim() || null,
          tipoContribuyente,
          inscritoDte,
        }),
      })
      onCreated(company)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No fue posible registrar la empresa.',
      )
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <section className="company-page">
      <div className="page-heading">
        <div>
          <span className="section-eyebrow">CONFIGURACIÓN INICIAL</span>
          <h1>Registra tu empresa</h1>
          <p>Comienza creando el espacio de trabajo de tu organización.</p>
        </div>
      </div>
      <form className="company-form-card" onSubmit={handleSubmit}>
        <div className="company-form-icon">
          <Icon name="building" size={22} />
        </div>
        <h2>Datos de la empresa</h2>
        <p>Podrás administrar sus libros contables desde un mismo lugar.</p>

        <label htmlFor="company-name">
          Nombre de la empresa <span aria-hidden="true">*</span>
        </label>
        <input
          id="company-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={150}
          autoComplete="organization"
          placeholder="Ej. Mi Empresa, S.A. de C.V."
          required
        />

        <label htmlFor="company-nit">
          NIT <span className="optional-label">Opcional</span>
        </label>
        <input
          id="company-nit"
          value={nit}
          onChange={(event) => setNit(event.target.value)}
          maxLength={20}
          placeholder="####-######-###-#"
        />
        {!nitValido && (
          <p className="form-error" role="alert">
            El NIT debe tener el formato ####-######-###-#.
          </p>
        )}

        <label htmlFor="company-nrc">
          NRC <span className="optional-label">Opcional</span>
        </label>
        <input
          id="company-nrc"
          value={nrc}
          onChange={(event) => setNrc(event.target.value)}
          maxLength={20}
          placeholder="Número de registro de contribuyente"
        />

        <label htmlFor="company-tipo">
          Tipo de contribuyente <span aria-hidden="true">*</span>
        </label>
        <select
          id="company-tipo"
          value={tipoContribuyente}
          onChange={(event) => setTipoContribuyente(event.target.value as TipoContribuyente)}
          required
          style={{
            width: '100%',
            height: '41px',
            padding: '0 12px',
            border: '1px solid #e0e5eb',
            borderRadius: '6px',
            outline: 'none',
            color: '#35465a',
            background: '#fff',
            fontSize: '11px',
          }}
        >
          <option value="GRAN_CONTRIBUYENTE">Gran Contribuyente</option>
          <option value="MEDIANO">Mediano Contribuyente</option>
          <option value="PEQUENO">Pequeño Contribuyente</option>
          <option value="EXENTO">Exento</option>
        </select>

        <label
          htmlFor="company-dte"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            marginTop: '16px',
            fontSize: '11px',
            fontWeight: 600,
            color: '#485a70',
          }}
        >
          <input
            id="company-dte"
            type="checkbox"
            checked={inscritoDte}
            onChange={(event) => setInscritoDte(event.target.checked)}
            style={{ width: '15px', height: '15px', accentColor: '#385f86' }}
          />
          La empresa está inscrita en DTE
        </label>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <button className="secondary-button" type="button" onClick={onCancel}>
            Cancelar
          </button>
          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? 'Guardando...' : 'Crear empresa'}
          </button>
        </div>
      </form>
    </section>
  )
}

function Dashboard({
  company,
  book,
  data,
  loading,
  onNavigate,
}: {
  company: Company
  book?: Book
  data: DashboardData | null
  loading: boolean
  onNavigate: (section: string) => void
}) {
  const stats = [
    { label: 'Total de activos', icon: 'assets' as const, value: data ? formatMoney(data.assets) : '—' },
    { label: 'Total de pasivos', icon: 'liabilities' as const, value: data ? formatMoney(data.liabilities) : '—' },
    { label: 'Patrimonio', icon: 'equity' as const, value: data ? formatMoney(data.equity) : '—' },
    { label: 'Partidas contabilizadas', icon: 'entry' as const, value: data ? String(data.entryCount) : '—' },
  ]

  const iva = data?.iva

  return (
    <div className="dashboard-page">
      <section className="dashboard-heading">
        <div>
          <span className="section-eyebrow">RESUMEN CONTABLE</span>
          <h1>Dashboard</h1>
          <p>
            Bienvenido, aquí tienes el resumen de <strong>{company.nombre}</strong>.
          </p>
        </div>
        <button className="primary-button" onClick={() => onNavigate('diario')}>
          <Icon name="plus" size={18} />
          Nueva partida
        </button>
      </section>

      <section className="stats-grid" aria-label="Indicadores financieros">
        {stats.map((stat) => (
          <article className="stat-card" key={stat.label}>
            <div className="stat-topline">
              <span>{stat.label}</span>
              <span className="stat-icon">
                <Icon name={stat.icon} size={19} />
              </span>
            </div>
            <strong className="stat-value">
              {loading ? <span className="value-skeleton" /> : stat.value}
            </strong>
            <span className="stat-caption">
              {stat.label === 'Partidas contabilizadas'
                ? book
                  ? `En ${book.nombre}`
                  : 'Selecciona un período'
                : 'Según movimientos contabilizados'}
            </span>
          </article>
        ))}
      </section>

      {iva && (
        <section className="stats-grid" aria-label="Posición de IVA">
          <article className="stat-card">
            <div className="stat-topline">
              <span>IVA Débito Fiscal</span>
              <span className="stat-icon">
                <Icon name="vat" size={19} />
              </span>
            </div>
            <strong className="stat-value">{loading ? <span className="value-skeleton" /> : formatMoney(iva.debito)}</strong>
            <span className="stat-caption">Ventas del período</span>
          </article>
          <article className="stat-card">
            <div className="stat-topline">
              <span>IVA Crédito Fiscal</span>
              <span className="stat-icon">
                <Icon name="vat" size={19} />
              </span>
            </div>
            <strong className="stat-value">{loading ? <span className="value-skeleton" /> : formatMoney(iva.credito)}</strong>
            <span className="stat-caption">Compras del período</span>
          </article>
          <article className="stat-card">
            <div className="stat-topline">
              <span>{iva.aPagar > 0 ? 'IVA a pagar' : 'Remanente IVA'}</span>
              <span className="stat-icon">
                <Icon name="closing" size={19} />
              </span>
            </div>
            <strong className="stat-value">
              {loading
                ? <span className="value-skeleton" />
                : formatMoney(iva.aPagar > 0 ? iva.aPagar : iva.remanente)}
            </strong>
            <span className="stat-caption">
              {iva.aPagar > 0 ? 'Según F-07 del período' : 'A favor del período siguiente'}
            </span>
          </article>
          <article className="stat-card">
            <div className="stat-topline">
              <span>IVA Percibido 1%</span>
              <span className="stat-icon">
                <Icon name="entry" size={19} />
              </span>
            </div>
            <strong className="stat-value">{loading ? <span className="value-skeleton" /> : formatMoney(iva.percibido)}</strong>
            <span className="stat-caption">Retenciones a favor</span>
          </article>
        </section>
      )}

      <div className="dashboard-columns">
        <section className="content-card recent-card">
          <div className="card-heading">
            <div>
              <h2>Actividad reciente</h2>
              <p>Últimas partidas contabilizadas</p>
            </div>
            <button className="text-button" onClick={() => onNavigate('diario')}>
              Ver libro diario <Icon name="arrow" size={16} />
            </button>
          </div>
          {loading ? (
            <LoadingMessage text="Cargando actividad..." />
          ) : !book ? (
            <EmptyActivity
              title="Sin período disponible"
              message="Cuando la empresa tenga libros contables, aparecerán aquí sus partidas."
            />
          ) : !data?.recentEntries.length ? (
            <EmptyActivity
              title="Aún no hay partidas contabilizadas"
              message="Las partidas que se contabilicen en este período aparecerán aquí."
            />
          ) : (
            <div className="activity-list">
              {data.recentEntries.map((entry) => (
                <article className="activity-row" key={entry.id}>
                  <span className="activity-date">{formatDate(entry.fecha)}</span>
                  <span className="activity-entry-number">#{entry.numero}</span>
                  <span className="activity-description">{entry.concepto}</span>
                  <span className="activity-status">Contabilizada</span>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="content-card quick-card">
          <div className="card-heading">
            <div>
              <h2>Accesos rápidos</h2>
              <p>Ve directamente a una sección</p>
            </div>
          </div>
          <div className="quick-links">
            <button onClick={() => onNavigate('diario')}>
              <span className="quick-icon">
                <Icon name="plus" size={19} />
              </span>
              <span>
                <strong>Nueva partida</strong>
                <small>Ir al libro diario</small>
              </span>
              <Icon name="arrow" size={17} />
            </button>
            <button onClick={() => onNavigate('libro-iva')}>
              <span className="quick-icon">
                <Icon name="vat" size={19} />
              </span>
              <span>
                <strong>Libro de IVA</strong>
                <small>Ventas y compras</small>
              </span>
              <Icon name="arrow" size={17} />
            </button>
            <button onClick={() => onNavigate('declaracion-iva')}>
              <span className="quick-icon">
                <Icon name="closing" size={19} />
              </span>
              <span>
                <strong>Declaración IVA</strong>
                <small>Generar F-07</small>
              </span>
              <Icon name="arrow" size={17} />
            </button>
          </div>
        </section>
      </div>

      {data && data.entryCount > 0 && (
        <section
          className={`content-card accounting-status${data.balanced ? ' accounting-status--balanced' : ' accounting-status--warning'}`}
        >
          <div className="status-indicator" />
          <div className="status-copy">
            <h2>{data.balanced ? 'Partidas en equilibrio' : 'Se detectó una diferencia'}</h2>
            <p>
              {data.balanced
                ? `Las partidas contabilizadas están cuadradas: debe ${formatMoney(data.totalDebe)} y haber ${formatMoney(data.totalHaber)}.`
                : `Debe ${formatMoney(data.totalDebe)} · Haber ${formatMoney(data.totalHaber)} · Diferencia ${formatMoney(Math.abs(data.balanceDifference))}.`}
            </p>
          </div>
          <span className="status-count">{data.entryCount} contabilizadas</span>
        </section>
      )}

      {!book && !loading && (
        <section className="content-card no-period-note">
          <span className="note-icon">
            <Icon name="calendar" size={18} />
          </span>
          <div>
            <strong>Esta empresa todavía no tiene períodos contables.</strong>
            <p>
              Los indicadores financieros se mostrarán cuando existan libros y partidas
              contabilizadas.
            </p>
          </div>
          <button className="text-button" onClick={() => onNavigate('periodos')}>
            Ver períodos <Icon name="arrow" size={16} />
          </button>
        </section>
      )}
    </div>
  )
}

function EmptyActivity({ title, message }: { title: string; message: string }) {
  return (
    <div className="empty-activity">
      <span className="empty-activity-icon">
        <Icon name="journal" size={21} />
      </span>
      <strong>{title}</strong>
      <p>{message}</p>
    </div>
  )
}

function ComingSoon({ title }: { title: string }) {
  return (
    <section className="coming-page">
      <span className="coming-icon">
        <Icon name="ledger" size={24} />
      </span>
      <span className="section-eyebrow">MÓDULO CONTABLE</span>
      <h1>{title}</h1>
      <p>
        Esta sección estará disponible próximamente. Por ahora puedes consultar el resumen en
        tu Dashboard.
      </p>
      <Link className="secondary-button" to="../dashboard">
        Volver al Dashboard
      </Link>
    </section>
  )
}

export default AccountingApp
