import { useEffect, useState, type FormEvent } from 'react'
import {
  getLibroMayor,
  type LibroMayorData,
} from '../services/accountingApi'
import type { Book, Company, LoginSession } from '../types/accounting'
import { formatDate, formatMoney } from '../utils/format'
import { Icon } from './Icon'
import './MayorModule.css'

function MayorModule({
  session,
  company,
  book,
}: {
  session: LoginSession
  company: Company
  book?: Book
}) {
  const initialDesde = book?.fechaInicio.slice(0, 10) ?? ''
  const initialHasta = book?.fechaFin.slice(0, 10) ?? ''
  const [desde, setDesde] = useState(initialDesde)
  const [hasta, setHasta] = useState(initialHasta)
  const [data, setData] = useState<LibroMayorData | null>(null)
  const [isLoading, setIsLoading] = useState(Boolean(initialDesde && initialHasta))
  const [error, setError] = useState('')

  useEffect(() => {
    if (!initialDesde || !initialHasta) return

    let active = true
    getLibroMayor(session.token, {
      fecha_inicio: initialDesde,
      fecha_fin: initialHasta,
      id_empresa: company.id,
    })
      .then((result) => {
        if (active) {
          setError('')
          setData(result)
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setData(null)
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'No fue posible consultar el libro mayor.',
          )
        }
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })

    return () => {
      active = false
    }
  }, [company.id, session.token, initialDesde, initialHasta])

  async function handleGenerate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!desde || !hasta) {
      setError('Selecciona las fechas de inicio y fin.')
      return
    }
    if (desde > hasta) {
      setError('La fecha de inicio no puede ser mayor que la fecha de fin.')
      return
    }

    setIsLoading(true)
    setError('')
    try {
      const result = await getLibroMayor(session.token, {
        fecha_inicio: desde,
        fecha_fin: hasta,
        id_empresa: company.id,
      })
      setData(result)
    } catch (loadError) {
      setData(null)
      setError(
        loadError instanceof Error
          ? loadError.message
          : 'No fue posible consultar el libro mayor.',
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <section className="mayor-module">
      <header className="page-heading mayor-heading">
        <div>
          <span className="section-eyebrow">REPORTES CONTABLES</span>
          <h1>Libro mayor</h1>
          <p>
            Movimientos contabilizados agrupados por cuenta de{' '}
            <strong>{company.nombre}</strong>.
          </p>
        </div>
      </header>

      <form className="mayor-filters" onSubmit={(event) => void handleGenerate(event)}>
        <label>
          Fecha inicio
          <input
            aria-label="Fecha de inicio"
            type="date"
            value={desde}
            onChange={(event) => setDesde(event.target.value)}
          />
        </label>
        <label>
          Fecha fin
          <input
            aria-label="Fecha de fin"
            type="date"
            value={hasta}
            onChange={(event) => setHasta(event.target.value)}
          />
        </label>
        <button className="primary-button" type="submit" disabled={isLoading}>
          <Icon name="search" size={16} />
          {isLoading ? 'Generando...' : 'Generar'}
        </button>
      </form>

      {error && (
        <div className="mayor-error" role="alert">
          <Icon name="warning" size={16} />
          <span>{error}</span>
        </div>
      )}

      {data && !error && (
        <p className="mayor-period">
          Período: {formatDate(data.fechaInicio)} — {formatDate(data.fechaFin)}
        </p>
      )}

      <div className="mayor-card">
        {isLoading ? (
          <div className="mayor-empty">
            <span className="loading-spinner" />
            Generando libro mayor...
          </div>
        ) : !data || data.cuentas.length === 0 ? (
          <div className="mayor-empty">
            <span className="mayor-empty-icon">
              <Icon name="ledger" size={22} />
            </span>
            <h2>No hay movimientos en este período</h2>
            <p>Prueba con otro rango de fechas.</p>
          </div>
        ) : (
          <div className="mayor-table-scroll">
            <table className="mayor-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Cuenta</th>
                  <th>Naturaleza</th>
                  <th>Saldo inicial</th>
                  <th>Total debe</th>
                  <th>Total haber</th>
                  <th>Saldo final</th>
                </tr>
              </thead>
              <tbody>
                {data.cuentas.map((cuenta) => (
                  <tr key={`${cuenta.tipoCuenta}-${cuenta.idCuenta}`}>
                    <td className="mayor-code">{cuenta.codigo}</td>
                    <td className="mayor-name">{cuenta.nombre}</td>
                    <td>
                      <span
                        className={`mayor-nature mayor-nature--${cuenta.naturaleza === 'DEUDORA' ? 'deudora' : 'acreedora'}`}
                      >
                        {cuenta.naturaleza === 'DEUDORA' ? 'Deudora' : 'Acreedora'}
                      </span>
                    </td>
                    <td className="mayor-amount">{formatMoney(cuenta.saldoInicial)}</td>
                    <td className="mayor-amount">{formatMoney(cuenta.totalDebe)}</td>
                    <td className="mayor-amount">{formatMoney(cuenta.totalHaber)}</td>
                    <td className="mayor-amount mayor-amount--final">
                      {formatMoney(cuenta.saldoFinal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}

export default MayorModule
