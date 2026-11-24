import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react'
import { apiRequest } from '../services/accountingApi'
import type { Book, Company, LoginSession } from '../types/accounting'
import { Icon } from './Icon'
import './JournalModule.css'
import type { Account } from '../types/accounting'

type JournalLine = {
  id: number
  accountKey: string
  tipoCuenta: 'PREDETERMINADA' | 'PERSONALIZADA'
  cuentaId: number
  codigo: string
  cuenta: string
  parentKey: string | null
  parcial: number | null
  debe: number
  haber: number
}

type JournalEntry = {
  id: number
  numero: number
  fecha: string
  concepto: string
  lines: JournalLine[]
}

type JournalData = {
  book: {
    id: number
    nombre: string
    fechaInicio: string
    fechaFin: string
    estado: string
    empresa: string
  }
  entries: JournalEntry[]
  totals: {
    partidas: number
    debe: number
    haber: number
  }
}

type JournalFilters = {
  desde: string
  hasta: string
  numero: string
}

type EntryPage = {
  entries: (JournalEntry & { folio: string })[]
  vienen?: { debe: number; haber: number }
  pasan?: { debe: number; haber: number }
  final?: { debe: number; haber: number }
}

type EntryLineDraft = {
  key: number
  cuenta: string
  parcial: string
  debe: string
  haber: string
}

type SubmissionResult = {
  id: number
  numero: number
  fecha: string
  concepto: string
  totalDebe: number
  totalHaber: number
  estado: string
}

const emptyFilters: JournalFilters = { desde: '', hasta: '', numero: '' }

function isoDate(value: string) {
  return value.slice(0, 10)
}

function displayDate(value: string) {
  const date = new Date(`${isoDate(value)}T00:00:00`)
  return new Intl.DateTimeFormat('es', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  }).format(date)
}

function displayShortDate(value: string) {
  const date = new Date(`${isoDate(value)}T00:00:00`)
  return new Intl.DateTimeFormat('es', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  }).format(date)
}

function displayMoney(value: number) {
  return new Intl.NumberFormat('es', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

function cents(value: string): number | null {
  if (!/^\d{1,10}(?:\.\d{1,2})?$/.test(value)) return null
  const [whole, fraction = ''] = value.split('.')
  return Number(whole) * 100 + Number(fraction.padEnd(2, '0'))
}

function manualDateToIso(value: string): string | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{2})$/.exec(value)
  if (!match) return null
  const day = Number(match[1])
  const month = Number(match[2])
  const year = 2000 + Number(match[3])
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function accountOptions(accounts: Account[]) {
  const accountByKey = new Map(accounts.map((account) => [account.key, account]))
  const children = new Map<string, Account[]>()
  for (const account of accounts) {
    if (account.parentKey && accountByKey.has(account.parentKey)) {
      const current = children.get(account.parentKey) ?? []
      current.push(account)
      children.set(account.parentKey, current)
    }
  }

  const compareAccounts = (left: Account, right: Account) =>
    left.codigo.localeCompare(right.codigo, 'es', { numeric: true }) ||
    left.tipo.localeCompare(right.tipo)
  const ordered: Account[] = []
  const visited = new Set<string>()
  const visit = (account: Account, depth: number) => {
    if (visited.has(account.key)) return
    visited.add(account.key)
    ordered.push({ ...account, profundidad: depth })
    for (const child of (children.get(account.key) ?? []).sort(compareAccounts)) {
      visit(child, depth + 1)
    }
  }
  const roots = accounts.filter(
    (account) => !account.parentKey || !accountByKey.has(account.parentKey),
  )
  for (const account of roots.sort(compareAccounts)) visit(account, 0)
  for (const account of [...accounts].sort(compareAccounts)) visit(account, 0)
  return ordered
}

function buildPages(
  entries: JournalEntry[],
  heights: number[],
  capacity: number,
  vienenHeight: number,
  pasanHeight: number,
  finalHeight: number,
): EntryPage[] {
  if (entries.length === 0) return []

  const pages: EntryPage[] = []
  let index = 0
  let previousTotals = { debe: 0, haber: 0 }

  while (index < entries.length) {
    const pageNumber = pages.length + 1
    const startIndex = index
    const pageEntries: JournalEntry[] = []
    let used = pageNumber === 1 ? 0 : vienenHeight

    while (index < entries.length) {
      const entry = entries[index]
      const isLast = index === entries.length - 1
      const footerHeight = isLast ? finalHeight : pasanHeight
      const entryHeight = heights[index] ?? 0
      const wouldOverflow =
        used + entryHeight + footerHeight > capacity

      if (wouldOverflow && pageEntries.length > 0) break

      pageEntries.push(entry)
      used += entryHeight
      index += 1

      if (wouldOverflow) break
    }

    if (pageEntries.length === 0) {
      pageEntries.push(entries[index])
      index += 1
    }

    const pageTotals = pageEntries.reduce(
      (totals, entry) => ({
        debe: totals.debe + entry.lines.reduce((sum, line) => sum + line.debe, 0),
        haber: totals.haber + entry.lines.reduce((sum, line) => sum + line.haber, 0),
      }),
      previousTotals,
    )
    const isFinalPage = index === entries.length
    const page: EntryPage = {
      entries: pageEntries.map((entry) => ({
        ...entry,
        folio: `${entry.numero}/${pageNumber}`,
      })),
      ...(pageNumber > 1 ? { vienen: previousTotals } : {}),
      ...(isFinalPage ? { final: pageTotals } : { pasan: pageTotals }),
    }
    pages.push(page)
    previousTotals = pageTotals

    if (index === startIndex) break
  }

  return pages
}

function JournalModule({
  session,
  company,
  book,
}: {
  session: LoginSession
  company: Company
  book: Book
}) {
  const [filters, setFilters] = useState(emptyFilters)
  const [appliedFilters, setAppliedFilters] = useState(emptyFilters)
  const [refreshVersion, setRefreshVersion] = useState(0)
  const [loadedJournal, setLoadedJournal] = useState<{
    key: string
    data: JournalData
  } | null>(null)
  const [loadedAccounts, setLoadedAccounts] = useState<{
    key: string
    accounts: Account[]
  } | null>(null)
  const [loadError, setLoadError] = useState<{ key: string; message: string } | null>(null)
  const [successMessage, setSuccessMessage] = useState('')
  const [isFormOpen, setIsFormOpen] = useState(false)

  const filterKey = `${appliedFilters.desde}|${appliedFilters.hasta}|${appliedFilters.numero}`
  const requestKey = `${company.id}:${book.id}:${filterKey}`
  const accountKey = `${company.id}:${book.id}`
  const journal = loadedJournal?.key === requestKey ? loadedJournal.data : null
  const accounts =
    loadedAccounts?.key === accountKey ? loadedAccounts.accounts : []
  const error = loadError?.key === requestKey ? loadError.message : ''
  const isLoading = !journal && !error
  const canPost = book.estado === 'ABIERTO'

  useEffect(() => {
    let active = true
    const search = new URLSearchParams()
    if (appliedFilters.desde) search.set('desde', appliedFilters.desde)
    if (appliedFilters.hasta) search.set('hasta', appliedFilters.hasta)
    if (appliedFilters.numero) search.set('numero', appliedFilters.numero)
    const query = search.size ? `?${search.toString()}` : ''

    Promise.all([
      apiRequest<Account[]>(
        session,
        `/api/companies/${company.id}/books/${book.id}/accounts`,
      ),
      apiRequest<JournalData>(
        session,
        `/api/companies/${company.id}/books/${book.id}/journal${query}`,
      ),
    ])
      .then(([accountResult, journalResult]) => {
        if (active) {
          setLoadedAccounts({ key: accountKey, accounts: accountResult })
          setLoadedJournal({ key: requestKey, data: journalResult })
          setLoadError(null)
        }
      })
      .catch((requestError: unknown) => {
        if (active) {
          setLoadError({
            key: requestKey,
            message:
              requestError instanceof Error
                ? requestError.message
                : 'No fue posible cargar el libro diario.',
          })
        }
      })

    return () => {
      active = false
    }
  }, [
    accountKey,
    appliedFilters.desde,
    appliedFilters.hasta,
    appliedFilters.numero,
    book.id,
    company.id,
    refreshVersion,
    requestKey,
    session,
  ])

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (
      filters.desde &&
      filters.hasta &&
      filters.desde > filters.hasta
    ) {
      setLoadError({
        key: requestKey,
        message: 'La fecha inicial no puede ser posterior a la fecha final.',
      })
      return
    }
    setLoadError(null)
    setAppliedFilters(filters)
  }

  function clearFilters() {
    setFilters(emptyFilters)
    setLoadError(null)
    setAppliedFilters(emptyFilters)
  }

  function onEntryCreated(result: SubmissionResult) {
    setIsFormOpen(false)
    setSuccessMessage(`La partida N.º ${result.numero} fue contabilizada correctamente.`)
    setRefreshVersion((value) => value + 1)
  }

  return (
    <section className="journal-module">
      <header className="journal-module-heading">
        <div>
          <span className="section-eyebrow">REGISTRO CONTABLE</span>
          <h1>Libro diario</h1>
          <p>
            <strong>{company.nombre}</strong>
            <span className="journal-heading-separator">·</span>
            {book.nombre}
            <span className={`journal-book-status${canPost ? '' : ' is-closed'}`}>
              {canPost ? 'Abierto' : 'Cerrado'}
            </span>
          </p>
          <span className="journal-date-range">
            {displayDate(book.fechaInicio)} – {displayDate(book.fechaFin)}
          </span>
        </div>
        <button
          className="primary-button"
          disabled={!canPost}
          onClick={() => setIsFormOpen(true)}
        >
          <Icon name="plus" size={18} />
          Nueva partida
        </button>
      </header>

      {successMessage && (
        <div className="journal-alert journal-alert--success" role="status">
          <Icon name="check" size={18} />
          <span>{successMessage}</span>
          <button
            aria-label="Cerrar confirmación"
            onClick={() => setSuccessMessage('')}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}
      {error && (
        <div className="journal-alert journal-alert--error" role="alert">
          <Icon name="warning" size={18} />
          <span>{error}</span>
          <button
            aria-label="Cerrar mensaje"
            onClick={() => setLoadError(null)}
          >
            <Icon name="close" size={16} />
          </button>
        </div>
      )}

      <div className="journal-summary" aria-label="Totales del libro diario">
        <article className="journal-summary-card">
          <span>Partidas contabilizadas</span>
          <strong>{journal ? journal.totals.partidas : '—'}</strong>
        </article>
        <article className="journal-summary-card">
          <span>Total Debe</span>
          <strong>{journal ? displayMoney(journal.totals.debe) : '—'}</strong>
        </article>
        <article className="journal-summary-card">
          <span>Total Haber</span>
          <strong>{journal ? displayMoney(journal.totals.haber) : '—'}</strong>
        </article>
      </div>

      <form className="journal-filters" onSubmit={applyFilters}>
        <div className="journal-filter-title">
          <Icon name="search" size={17} />
          <strong>Filtrar partidas</strong>
        </div>
        <label>
          <span>Desde</span>
          <input
            type="date"
            value={filters.desde}
            min={isoDate(book.fechaInicio)}
            max={isoDate(book.fechaFin)}
            onChange={(event) =>
              setFilters((current) => ({ ...current, desde: event.target.value }))
            }
          />
        </label>
        <label>
          <span>Hasta</span>
          <input
            type="date"
            value={filters.hasta}
            min={isoDate(book.fechaInicio)}
            max={isoDate(book.fechaFin)}
            onChange={(event) =>
              setFilters((current) => ({ ...current, hasta: event.target.value }))
            }
          />
        </label>
        <label className="journal-number-filter">
          <span>N.º de partida</span>
          <input
            type="number"
            min="1"
            step="1"
            placeholder="Todas"
            value={filters.numero}
            onChange={(event) =>
              setFilters((current) => ({ ...current, numero: event.target.value }))
            }
          />
        </label>
        <div className="journal-filter-actions">
          <button className="secondary-button" type="button" onClick={clearFilters}>
            Limpiar
          </button>
          <button className="primary-button" type="submit">
            <Icon name="search" size={16} />
            Aplicar
          </button>
        </div>
      </form>

      {journal && journal.entries.length > 0 && (
        <div className="journal-result-toolbar">
          <div>
            <h2>Presentación del libro</h2>
            <p>
              {journal.entries.length} {journal.entries.length === 1 ? 'partida' : 'partidas'}
              {appliedFilters.desde || appliedFilters.hasta || appliedFilters.numero
                ? ' · resultados filtrados'
                : ' · ordenadas por fecha y número'}
            </p>
          </div>
          <button
            className="secondary-button journal-print-button"
            onClick={() => window.print()}
          >
            <Icon name="print" size={17} />
            Imprimir libro
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="journal-loading" role="status">
          <span className="loading-spinner" />
          Cargando partidas y catálogo de cuentas...
        </div>
      ) : journal?.entries.length ? (
        <>
          <JournalPresentation
            key={requestKey}
            company={company}
            book={book}
            entries={journal.entries}
            totals={journal.totals}
            accounts={accounts}
          />
          <p className="journal-pagination-note">
            La distribución de páginas y los folios se calculan con la altura real de las partidas.
          </p>
        </>
      ) : (
        <div className="journal-empty">
          <span className="journal-empty-icon"><Icon name="journal" size={25} /></span>
          <h2>
            {appliedFilters.desde || appliedFilters.hasta || appliedFilters.numero
              ? 'No hay partidas para estos filtros'
              : 'Aún no hay partidas contabilizadas'}
          </h2>
          <p>
            {appliedFilters.desde || appliedFilters.hasta || appliedFilters.numero
              ? 'Prueba con otros criterios o limpia los filtros.'
              : 'Cuando registres una partida y se contabilice correctamente, aparecerá aquí.'}
          </p>
          {appliedFilters.desde || appliedFilters.hasta || appliedFilters.numero ? (
            <button className="secondary-button" onClick={clearFilters}>
              Limpiar filtros
            </button>
          ) : (
            <button
              className="primary-button"
              disabled={!canPost || accounts.length === 0}
              onClick={() => setIsFormOpen(true)}
            >
              <Icon name="plus" size={17} />
              Registrar primera partida
            </button>
          )}
          {canPost && accounts.length === 0 && (
            <span className="journal-empty-hint">
              No hay cuentas disponibles para movimientos en el catálogo de esta empresa.
            </span>
          )}
        </div>
      )}

      {isFormOpen && (
        <NewEntryForm
          session={session}
          company={company}
          book={book}
          accounts={accounts}
          onCancel={() => setIsFormOpen(false)}
          onSuccess={onEntryCreated}
        />
      )}
    </section>
  )
}

function JournalPresentation({
  company,
  book,
  entries,
  totals,
  accounts,
}: {
  company: Company
  book: Book
  entries: JournalEntry[]
  totals: JournalData['totals']
  accounts: Account[]
}) {
  const [pages, setPages] = useState<EntryPage[]>([])
  const [measuredKey, setMeasuredKey] = useState('')
  const measurementRef = useRef<HTMLDivElement>(null)
  const layoutKey = `${company.id}:${book.id}:${entries.length}:${entries[0]?.id}:${entries.at(-1)?.id}`
  const displayPages =
    measuredKey === layoutKey
      ? pages
      : [{ entries: entries.map((entry) => ({ ...entry, folio: `${entry.numero}/1` })), final: totals }]
  const depthByKey = useMemo(
    () => new Map(accounts.map((account) => [account.key, account.profundidad])),
    [accounts],
  )

  useLayoutEffect(() => {
    const root = measurementRef.current
    if (!root) return
    const tableArea = root.querySelector<HTMLElement>('.journal-table-area')
    if (!tableArea) return

    const measure = () => {
      const tableHead = root.querySelector<HTMLElement>('.journal-page-table thead')
      if (!tableHead) return
      const entryElements = [...root.querySelectorAll<HTMLElement>('[data-measure-entry]')]
      const heights = entryElements.map((element) => element.getBoundingClientRect().height)
      const startHeight =
        root.querySelector<HTMLElement>('[data-measure-row="vienen"]')?.getBoundingClientRect().height ?? 0
      const passHeight =
        root.querySelector<HTMLElement>('[data-measure-row="pasan"]')?.getBoundingClientRect().height ?? 0
      const finalHeight =
        root.querySelector<HTMLElement>('[data-measure-row="final"]')?.getBoundingClientRect().height ??
        passHeight
      const available =
        tableArea.clientHeight - tableHead.getBoundingClientRect().height
      if (available <= 0) return

      setPages(
        buildPages(
          entries,
          heights,
          available,
          startHeight,
          passHeight,
          finalHeight,
        ),
      )
      setMeasuredKey(layoutKey)
    }

    const frame = window.requestAnimationFrame(measure)
    const observer = new ResizeObserver(measure)
    observer.observe(root)
    observer.observe(tableArea)
    return () => {
      window.cancelAnimationFrame(frame)
      observer.disconnect()
    }
  }, [entries, layoutKey, totals])

  return (
    <div className="journal-presentation">
      <div className="journal-print-area">
        {displayPages.map((page, index) => (
          <JournalSheet
            key={`${layoutKey}:page:${index}`}
            company={company}
            book={book}
            page={page}
            pageNumber={index + 1}
            depthByKey={depthByKey}
          />
        ))}
      </div>
      <div className="journal-measurement" ref={measurementRef} aria-hidden="true">
        <JournalSheet
          company={company}
          book={book}
          page={{
            entries: entries.map((entry) => ({ ...entry, folio: `${entry.numero}/1` })),
            vienen: { debe: 0, haber: 0 },
            pasan: totals,
            final: totals,
          }}
          pageNumber={1}
          depthByKey={depthByKey}
          measure
        />
      </div>
    </div>
  )
}

function JournalSheet({
  company,
  book,
  page,
  pageNumber,
  depthByKey,
  measure = false,
}: {
  company: Company
  book: Book
  page: EntryPage
  pageNumber: number
  depthByKey: Map<string, number>
  measure?: boolean
}) {
  return (
    <article className="journal-sheet">
      <header className="journal-sheet-heading">
        <span className="journal-sheet-company">{company.nombre}</span>
        <h2>Libro diario</h2>
        <p>{book.nombre}</p>
        <span className="journal-sheet-period">
          {displayShortDate(book.fechaInicio)} – {displayShortDate(book.fechaFin)}
        </span>
      </header>
      <div className="journal-table-area">
        <table className={`journal-page-table${measure ? ' journal-page-table--measure' : ''}`}>
          <colgroup>
            <col className="journal-col-date" />
            <col className="journal-col-detail" />
            <col className="journal-col-folio" />
            <col className="journal-col-partial" />
            <col className="journal-col-debit" />
            <col className="journal-col-credit" />
          </colgroup>
          <thead>
            <tr>
              <th>FECHA</th>
              <th>DETALLE</th>
              <th>F</th>
              <th>PARCIAL</th>
              <th>DEBE</th>
              <th>HABER</th>
            </tr>
          </thead>
          {page.vienen && (
            <tbody>
              <JournalTotalRow
                label="Vienen"
                totals={page.vienen}
                dataMeasure={measure ? 'vienen' : undefined}
                className="journal-carry-row"
              />
            </tbody>
          )}
          {page.entries.map((entry) => (
            <tbody
              key={entry.id}
              className="journal-entry-group"
              data-measure-entry={measure ? 'true' : undefined}
            >
              <tr className="journal-entry-title">
                <td />
                <td colSpan={5}>PARTIDA N.º {entry.numero}</td>
              </tr>
              {entry.lines.map((line, index) => (
                <tr className="journal-movement-row" key={line.id}>
                  <td>{index === 0 ? displayShortDate(entry.fecha) : ''}</td>
                  <td>
                    <span
                      className="journal-account-name"
                      style={{
                        paddingInlineStart: `${Math.min(depthByKey.get(line.accountKey) ?? 0, 12) * 12}px`,
                      }}
                    >
                      <span className="journal-account-code">{line.codigo}</span>
                      {line.cuenta}
                    </span>
                  </td>
                  <td>{index === 0 ? entry.folio : ''}</td>
                  <td className="journal-amount">{line.parcial === null ? '' : displayMoney(line.parcial)}</td>
                  <td className="journal-amount">{line.debe > 0 ? displayMoney(line.debe) : ''}</td>
                  <td className="journal-amount">{line.haber > 0 ? displayMoney(line.haber) : ''}</td>
                </tr>
              ))}
              <tr className="journal-concept-row">
                <td />
                <td colSpan={5}>Concepto: {entry.concepto}</td>
              </tr>
            </tbody>
          ))}
          {(page.pasan || page.final) && (
            <tfoot>
              <JournalTotalRow
                label={page.pasan ? 'Pasan' : 'Totales'}
                totals={page.pasan ?? page.final!}
                dataMeasure={measure ? (page.pasan ? 'pasan' : 'final') : undefined}
                className="journal-total-row"
              />
            </tfoot>
          )}
        </table>
      </div>
      <footer className="journal-sheet-footer">
        <span>{company.nombre} · {book.nombre}</span>
        <span>Página {pageNumber}</span>
      </footer>
    </article>
  )
}

function JournalTotalRow({
  label,
  totals,
  dataMeasure,
  className,
}: {
  label: string
  totals: { debe: number; haber: number }
  dataMeasure?: string
  className: string
}) {
  return (
    <tr
      className={className}
      data-measure-row={dataMeasure}
    >
      <td />
      <th scope="row">{label}</th>
      <td />
      <td />
      <td className="journal-amount">{displayMoney(totals.debe)}</td>
      <td className="journal-amount">{displayMoney(totals.haber)}</td>
    </tr>
  )
}

function NewEntryForm({
  session,
  company,
  book,
  accounts,
  onCancel,
  onSuccess,
}: {
  session: LoginSession
  company: Company
  book: Book
  accounts: Account[]
  onCancel: () => void
  onSuccess: (result: SubmissionResult) => void
}) {
  const [fecha, setFecha] = useState('')
  const [concepto, setConcepto] = useState('')
  const [lineas, setLineas] = useState<EntryLineDraft[]>([
    { key: 1, cuenta: '', parcial: '', debe: '', haber: '' },
    { key: 2, cuenta: '', parcial: '', debe: '', haber: '' },
  ])
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const nextLineKey = useRef(3)

  const totalDebeCents = lineas.reduce(
    (total, line) => total + (cents(line.debe) ?? 0),
    0,
  )
  const totalHaberCents = lineas.reduce(
    (total, line) => total + (cents(line.haber) ?? 0),
    0,
  )
  const difference = totalDebeCents - totalHaberCents
  const isBalanced = totalDebeCents > 0 && difference === 0
  const accountMap = useMemo(
    () => new Map(accounts.map((account) => [account.key, account])),
    [accounts],
  )
  const options = useMemo(() => accountOptions(accounts), [accounts])
  const parsedDate = manualDateToIso(fecha)
  const dateInPeriod =
    parsedDate !== null &&
    parsedDate >= isoDate(book.fechaInicio) &&
    parsedDate <= isoDate(book.fechaFin)
  const linesAreValid =
    lineas.length >= 2 &&
    lineas.every((line) => {
      const account = accountMap.get(line.cuenta)
      const debitCents = cents(line.debe)
      const creditCents = cents(line.haber)
      const partialCents = line.parcial === '' ? null : cents(line.parcial)
      return (
        account?.estado === 'ACTIVA' &&
        account.permiteMovimientos &&
        debitCents !== null &&
        creditCents !== null &&
        (line.parcial === '' || partialCents !== null) &&
        ((debitCents > 0) !== (creditCents > 0))
      )
    })

  function updateLine(key: number, patch: Partial<EntryLineDraft>) {
    setLineas((current) =>
      current.map((line) => (line.key === key ? { ...line, ...patch } : line)),
    )
  }

  function addLine() {
    const key = nextLineKey.current
    nextLineKey.current += 1
    setLineas((current) => [
      ...current,
      { key, cuenta: '', parcial: '', debe: '', haber: '' },
    ])
  }

  function removeLine(key: number) {
    setLineas((current) => current.filter((line) => line.key !== key))
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    if (!parsedDate) {
      setError('Ingresa una fecha válida con formato DD/MM/AA.')
      return
    }
    if (!dateInPeriod) {
      setError('La fecha debe estar dentro del período contable seleccionado.')
      return
    }
    if (!concepto.trim() || concepto.trim().length > 250) {
      setError('El concepto es obligatorio y admite hasta 250 caracteres.')
      return
    }
    if (lineas.length < 2) {
      setError('La partida debe tener al menos dos movimientos.')
      return
    }

    const normalizedLines = []
    for (const [index, line] of lineas.entries()) {
      const account = accountMap.get(line.cuenta)
      const debitCents = cents(line.debe)
      const creditCents = cents(line.haber)
      const partialCents = line.parcial === '' ? null : cents(line.parcial)
      if (!account || !account.permiteMovimientos || account.estado !== 'ACTIVA') {
        setError(`Selecciona una cuenta disponible en el movimiento ${index + 1}.`)
        return
      }
      if (
        debitCents === null ||
        creditCents === null ||
        (line.parcial !== '' && partialCents === null) ||
        ((debitCents > 0) === (creditCents > 0))
      ) {
        setError(
          `El movimiento ${index + 1} debe tener un importe válido en Debe o Haber, pero no en ambos.`,
        )
        return
      }

      normalizedLines.push({
        cuentaId: account.id,
        tipoCuenta: account.tipo,
        parcial: line.parcial,
        debe: line.debe || '0',
        haber: line.haber || '0',
      })
    }

    if (totalDebeCents !== totalHaberCents) {
      setError('La partida no está cuadrada. El Debe y el Haber deben ser iguales.')
      return
    }

    setIsSubmitting(true)
    try {
      const result = await apiRequest<SubmissionResult>(
        session,
        `/api/companies/${company.id}/books/${book.id}/entries`,
        {
          method: 'POST',
          body: JSON.stringify({
            fecha: parsedDate,
            concepto: concepto.trim(),
            lineas: normalizedLines,
          }),
        },
      )
      onSuccess(result)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No fue posible registrar la partida.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div
      className="journal-modal-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !isSubmitting) onCancel()
      }}
    >
      <section
        aria-labelledby="new-journal-entry-title"
        aria-modal="true"
        className="journal-entry-dialog"
        role="dialog"
      >
        <header className="journal-dialog-heading">
          <div>
            <span className="section-eyebrow">LIBRO DIARIO · {book.nombre}</span>
            <h2 id="new-journal-entry-title">Nueva partida</h2>
            <p>La partida se contabilizará al guardarse.</p>
          </div>
          <button
            className="journal-dialog-close"
            aria-label="Cerrar formulario"
            disabled={isSubmitting}
            onClick={onCancel}
          >
            <Icon name="close" size={19} />
          </button>
        </header>

        <form className="journal-entry-form" onSubmit={submit}>
          <div className="journal-entry-meta">
            <label>
              <span>Fecha <b>*</b></span>
              <input
                autoComplete="off"
                inputMode="numeric"
                maxLength={8}
                onChange={(event) =>
                  setFecha(event.target.value.replace(/[^\d/]/g, '').slice(0, 8))
                }
                placeholder="DD/MM/AA"
                value={fecha}
                aria-invalid={Boolean(fecha && !parsedDate)}
              />
              <small>
                Período: {displayShortDate(book.fechaInicio)} – {displayShortDate(book.fechaFin)}
              </small>
              {fecha && parsedDate && !dateInPeriod && (
                <small className="journal-field-error">Fecha fuera del período seleccionado.</small>
              )}
            </label>
            <div className="journal-number-preview">
              <span>N.º de partida</span>
              <strong>Automático</strong>
              <small>Consecutivo en este período</small>
            </div>
          </div>

          <label className="journal-concept-field">
            <span>Concepto o descripción <b>*</b></span>
            <input
              maxLength={250}
              onChange={(event) => setConcepto(event.target.value)}
              placeholder="Describe brevemente la operación"
              value={concepto}
              required
            />
            <small>{concepto.length}/250 caracteres</small>
          </label>

          <div className="journal-lines-heading">
            <div>
              <h3>Detalle contable</h3>
              <p>Selecciona las cuentas del catálogo e ingresa los importes.</p>
            </div>
            <button className="secondary-button" type="button" onClick={addLine}>
              <Icon name="plus" size={16} /> Agregar línea
            </button>
          </div>

          <div className="journal-lines-scroll">
            <div className="journal-lines-grid journal-lines-grid--header" aria-hidden="true">
              <span>Cuenta contable</span>
              <span>Parcial</span>
              <span>Debe</span>
              <span>Haber</span>
              <span />
            </div>
            <div className="journal-lines-list">
              {lineas.map((line, index) => (
                <div className="journal-lines-grid journal-draft-line" key={line.key}>
                  <label>
                    <span className="visually-hidden">Cuenta del movimiento {index + 1}</span>
                    <select
                      value={line.cuenta}
                      onChange={(event) =>
                        updateLine(line.key, { cuenta: event.target.value })
                      }
                      required
                    >
                      <option value="">Selecciona una cuenta</option>
                      {options.map((account) => (
                        <option
                          key={account.key}
                          value={account.key}
                          disabled={
                            account.estado !== 'ACTIVA' ||
                            !account.permiteMovimientos
                          }
                        >
                          {`${'　'.repeat(Math.min(account.profundidad, 8))}${account.codigo} · ${account.nombre}${account.permiteMovimientos ? '' : ' (agrupadora)'}`}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="visually-hidden">Parcial del movimiento {index + 1}</span>
                    <input
                      inputMode="decimal"
                      min="0"
                      placeholder="—"
                      step="0.01"
                      type="number"
                      value={line.parcial}
                      onChange={(event) =>
                        updateLine(line.key, { parcial: event.target.value })
                      }
                    />
                  </label>
                  <label>
                    <span className="visually-hidden">Debe del movimiento {index + 1}</span>
                    <input
                      inputMode="decimal"
                      min="0"
                      placeholder="0.00"
                      step="0.01"
                      type="number"
                      value={line.debe}
                      onChange={(event) =>
                        updateLine(line.key, {
                          debe: event.target.value,
                          ...(event.target.value && Number(event.target.value) > 0
                            ? { haber: '0' }
                            : {}),
                        })
                      }
                    />
                  </label>
                  <label>
                    <span className="visually-hidden">Haber del movimiento {index + 1}</span>
                    <input
                      inputMode="decimal"
                      min="0"
                      placeholder="0.00"
                      step="0.01"
                      type="number"
                      value={line.haber}
                      onChange={(event) =>
                        updateLine(line.key, {
                          haber: event.target.value,
                          ...(event.target.value && Number(event.target.value) > 0
                            ? { debe: '0' }
                            : {}),
                        })
                      }
                    />
                  </label>
                  <button
                    className="journal-remove-line"
                    type="button"
                    aria-label={`Eliminar movimiento ${index + 1}`}
                    disabled={lineas.length <= 2}
                    onClick={() => removeLine(line.key)}
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {accounts.length === 0 && (
            <div className="journal-form-warning" role="status">
              No hay cuentas disponibles para movimientos en el catálogo de esta empresa.
            </div>
          )}

          <div className="journal-entry-totals">
            <div>
              <span>Total Debe</span>
              <strong>{displayMoney(totalDebeCents / 100)}</strong>
            </div>
            <div>
              <span>Total Haber</span>
              <strong>{displayMoney(totalHaberCents / 100)}</strong>
            </div>
            <div className={`journal-balance-indicator${isBalanced ? ' is-balanced' : ' is-unbalanced'}`}>
              <Icon name={isBalanced ? 'check' : 'warning'} size={17} />
              <span>
                {isBalanced
                  ? 'Partida cuadrada'
                  : `Diferencia: ${displayMoney(Math.abs(difference) / 100)}`}
              </span>
            </div>
          </div>

          {error && <p className="journal-form-error" role="alert">{error}</p>}

          <footer className="journal-form-actions">
            <button
              className="secondary-button"
              type="button"
              disabled={isSubmitting}
              onClick={onCancel}
            >
              Cancelar
            </button>
            <button
              className="primary-button"
              type="submit"
              disabled={
                isSubmitting ||
                !linesAreValid ||
                !isBalanced ||
                !dateInPeriod ||
                !concepto.trim() ||
                accounts.length === 0
              }
            >
              {isSubmitting ? 'Contabilizando...' : 'Guardar y contabilizar'}
            </button>
          </footer>
        </form>
      </section>
    </div>
  )
}

export default JournalModule
