import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  apiRequest,
  getLibroMayor,
  type LibroMayorResponse,
} from '../services/accountingApi'
import type { Company, LoginSession } from '../types/accounting'
import { Icon } from './Icon'
import './MayorModule.css'

type AccountOption = {
  key: string
  codigo: string
  nombre: string
}

function toIsoDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function defaultDates() {
  const today = new Date()
  return {
    fechaInicio: `${today.getFullYear()}-01-01`,
    fechaFin: toIsoDate(today),
  }
}

function formatAmount(value: number) {
  return new Intl.NumberFormat('es', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
}

export default function MayorModule({
  session,
  company,
}: {
  session: LoginSession
  company: Company
}) {
  const initialDates = useMemo(() => defaultDates(), [])
  const [fechaInicio, setFechaInicio] = useState(initialDates.fechaInicio)
  const [fechaFin, setFechaFin] = useState(initialDates.fechaFin)
  const [cuentaKey, setCuentaKey] = useState('')
  const [accounts, setAccounts] = useState<AccountOption[]>([])
  const [accountsError, setAccountsError] = useState('')
  const [result, setResult] = useState<LibroMayorResponse | null>(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    let active = true
    apiRequest<AccountOption[]>(session, `/api/companies/${company.id}/accounts`)
      .then((response) => {
        if (active) setAccounts(response)
      })
      .catch(() => {
        if (active) setAccountsError('No fue posible cargar el catálogo de cuentas.')
      })
    return () => {
      active = false
    }
  }, [company.id, session])

  async function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setResult(null)

    if (!fechaInicio || !fechaFin || fechaInicio > fechaFin) {
      setError('Revisa el rango de fechas seleccionado.')
      return
    }

    setIsLoading(true)
    try {
      const response = await getLibroMayor(session.token, {
        id_empresa: company.id,
        fecha_inicio: fechaInicio,
        fecha_fin: fechaFin,
        ...(cuentaKey ? { id_cuenta: cuentaKey } : {}),
      })
      setResult(response)
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : 'No fue posible generar el libro mayor.',
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <section className="mayor-module">
      <header className="mayor-heading">
        <div>
          <span className="section-eyebrow">REPORTES CONTABLES</span>
          <h1>Libro mayor</h1>
          <p>
            Movimientos contabilizados de <strong>{company.nombre}</strong>
          </p>
        </div>
        <span className="mayor-heading-icon">
          <Icon name="ledger" size={22} />
        </span>
      </header>

      <form className="mayor-filters" onSubmit={handleGenerate}>
        <label>
          <span>Fecha de inicio</span>
          <input
            required
            type="date"
            value={fechaInicio}
            onChange={(event) => setFechaInicio(event.target.value)}
          />
        </label>
        <label>
          <span>Fecha de fin</span>
          <input
            required
            type="date"
            value={fechaFin}
            onChange={(event) => setFechaFin(event.target.value)}
          />
        </label>
        <label className="mayor-account-filter">
          <span>Cuenta (opcional)</span>
          <select
            value={cuentaKey}
            onChange={(event) => setCuentaKey(event.target.value)}
          >
            <option value="">Todas las cuentas</option>
            {accounts.map((account) => (
              <option key={account.key} value={account.key}>
                {account.codigo} · {account.nombre}
              </option>
            ))}
          </select>
          {accountsError && <small>{accountsError}</small>}
        </label>
        <button className="primary-button mayor-generate" disabled={isLoading} type="submit">
          <Icon name="search" size={16} />
          {isLoading ? 'Generando...' : 'Generar'}
        </button>
      </form>

      {error && (
        <div className="mayor-alert mayor-alert--error" role="alert">
          <Icon name="warning" size={17} />
          <span>{error}</span>
          <button aria-label="Cerrar mensaje" onClick={() => setError('')} type="button">
            <Icon name="close" size={15} />
          </button>
        </div>
      )}

      {isLoading && (
        <div className="mayor-loading" role="status">
          <span className="loading-spinner" />
          Generando libro mayor...
        </div>
      )}

      {!isLoading && result && (
        <>
          <div className="mayor-summary" aria-label="Totales del libro mayor">
            <article>
              <span>Saldo inicial</span>
              <strong>{formatAmount(result.totales.saldoInicial)}</strong>
            </article>
            <article>
              <span>Total debe</span>
              <strong>{formatAmount(result.totales.totalDebe)}</strong>
            </article>
            <article>
              <span>Total haber</span>
              <strong>{formatAmount(result.totales.totalHaber)}</strong>
            </article>
            <article>
              <span>Saldo final</span>
              <strong>{formatAmount(result.totales.saldoFinal)}</strong>
            </article>
          </div>

          {result.cuentas.length === 0 ? (
            <div className="mayor-empty">
              <span className="mayor-empty-icon">
                <Icon name="ledger" size={23} />
              </span>
              <h2>No hay movimientos en este período</h2>
              <p>Prueba con otro rango de fechas o selecciona otra cuenta.</p>
            </div>
          ) : (
            <div className="mayor-table-card">
              <div className="mayor-table-heading">
                <div>
                  <h2>Detalle por cuenta</h2>
                  <p>
                    {result.cuentas.length}{' '}
                    {result.cuentas.length === 1 ? 'cuenta con movimientos' : 'cuentas con movimientos'}
                  </p>
                </div>
                <span>
                  {result.fechaInicio} – {result.fechaFin}
                </span>
              </div>
              <div className="mayor-table-scroll">
                <table className="mayor-table">
                  <thead>
                    <tr>
                      <th>CÓDIGO</th>
                      <th>CUENTA</th>
                      <th>NATURALEZA</th>
                      <th>SALDO INICIAL</th>
                      <th>DEBE</th>
                      <th>HABER</th>
                      <th>SALDO FINAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.cuentas.map((cuenta) => (
                      <tr key={cuenta.cuentaKey}>
                        <td className="mayor-code">{cuenta.codigo}</td>
                        <td>{cuenta.nombre}</td>
                        <td>
                          <span className="mayor-nature">
                            {cuenta.naturaleza === 'DEUDORA' ? 'Deudora' : 'Acreedora'}
                          </span>
                        </td>
                        <td className="mayor-amount">{formatAmount(cuenta.saldoInicial)}</td>
                        <td className="mayor-amount">{formatAmount(cuenta.totalDebe)}</td>
                        <td className="mayor-amount">{formatAmount(cuenta.totalHaber)}</td>
                        <td className="mayor-amount mayor-amount--final">
                          {formatAmount(cuenta.saldoFinal)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr>
                      <th colSpan={3}>Totales</th>
                      <td className="mayor-amount">{formatAmount(result.totales.saldoInicial)}</td>
                      <td className="mayor-amount">{formatAmount(result.totales.totalDebe)}</td>
                      <td className="mayor-amount">{formatAmount(result.totales.totalHaber)}</td>
                      <td className="mayor-amount">{formatAmount(result.totales.saldoFinal)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}
        </>
      )}

      {!isLoading && !result && !error && (
        <div className="mayor-initial">
          <Icon name="ledger" size={20} />
          <span>Selecciona un rango de fechas y presiona Generar para consultar el libro mayor.</span>
        </div>
      )}
    </section>
  )
}
