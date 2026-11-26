import { useEffect, useState, type FormEvent } from 'react'
import {
  getBalanceComprobacion,
  type BalanceData,
} from '../services/accountingApi'
import type { Book, Company, LoginSession } from '../types/accounting'
import { formatMoney } from '../utils/format'
import { Icon } from './Icon'
import './BalanceModule.css'

function BalanceModule({
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
  const [data, setData] = useState<BalanceData | null>(null)
  const [isLoading, setIsLoading] = useState(Boolean(initialDesde && initialHasta))
  const [error, setError] = useState('')

  useEffect(() => {
    if (!initialDesde || !initialHasta) return

    let active = true
    getBalanceComprobacion(session.token, {
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
              : 'No fue posible consultar el balance de comprobación.',
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
      const result = await getBalanceComprobacion(session.token, {
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
          : 'No fue posible consultar el balance de comprobación.',
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <section className="balance-module">
      <header className="page-heading balance-heading">
        <div>
          <span className="section-eyebrow">REPORTES CONTABLES</span>
          <h1>Balance de comprobación</h1>
          <p>
            Saldos por cuenta de <strong>{company.nombre}</strong> y verificación de partida doble.
          </p>
        </div>
      </header>

      <form className="balance-filters" onSubmit={(event) => void handleGenerate(event)}>
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
        <div className="balance-error" role="alert">
          <Icon name="warning" size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="balance-card">
        {isLoading ? (
          <div className="balance-empty">
            <span className="loading-spinner" />
            Generando balance...
          </div>
        ) : !data || data.cuentas.length === 0 ? (
          <div className="balance-empty">
            <span className="balance-empty-icon">
              <Icon name="balance" size={22} />
            </span>
            <h2>No hay movimientos en este período</h2>
            <p>Prueba con otro rango de fechas.</p>
          </div>
        ) : (
          <div className="balance-table-scroll">
            <table className="balance-table">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Cuenta</th>
                  <th>Debe</th>
                  <th>Haber</th>
                </tr>
              </thead>
              <tbody>
                {data.cuentas.map((cuenta) => (
                  <tr key={`${cuenta.tipoCuenta}-${cuenta.idCuenta}`}>
                    <td className="balance-code">{cuenta.codigo}</td>
                    <td className="balance-name">{cuenta.nombre}</td>
                    <td className="balance-amount">{formatMoney(cuenta.debe)}</td>
                    <td className="balance-amount">{formatMoney(cuenta.haber)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr
                  className={`balance-totals${data.totales.cuadra ? ' balance-totals--ok' : ' balance-totals--error'}`}
                >
                  <td colSpan={2}>
                    <span className="balance-totals-label">
                      <Icon name={data.totales.cuadra ? 'check' : 'warning'} size={15} />
                      {data.totales.cuadra
                        ? 'Totales · ✓ Cuadrado'
                        : `Totales · ✗ Descuadrado (${formatMoney(data.totales.diferencia)})`}
                    </span>
                  </td>
                  <td className="balance-amount">{formatMoney(data.totales.totalDebe)}</td>
                  <td className="balance-amount">{formatMoney(data.totales.totalHaber)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </section>
  )
}

export default BalanceModule
