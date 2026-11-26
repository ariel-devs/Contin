import { useEffect, useState, type FormEvent } from 'react'
import { getPartidasCierre, type CierreData } from '../services/accountingApi'
import type { Book, Company, LoginSession } from '../types/accounting'
import { formatMoney } from '../utils/format'
import { Icon } from './Icon'
import './CierreModule.css'

function CierreModule({
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
  const [data, setData] = useState<CierreData | null>(null)
  const [isLoading, setIsLoading] = useState(Boolean(initialDesde && initialHasta))
  const [error, setError] = useState('')

  useEffect(() => {
    if (!initialDesde || !initialHasta) return

    let active = true
    getPartidasCierre(session.token, {
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
              : 'No fue posible consultar las partidas de cierre.',
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
      const result = await getPartidasCierre(session.token, {
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
          : 'No fue posible consultar las partidas de cierre.',
      )
    } finally {
      setIsLoading(false)
    }
  }

  const utilidad = data?.resumen.utilidadPerdida ?? 0

  return (
    <section className="cierre-module">
      <header className="page-heading cierre-heading">
        <div>
          <span className="section-eyebrow">REPORTES CONTABLES</span>
          <h1>Partidas de cierre</h1>
          <p>
            Estado de resultados de <strong>{company.nombre}</strong> para el período seleccionado.
          </p>
        </div>
      </header>

      <form className="cierre-filters" onSubmit={(event) => void handleGenerate(event)}>
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
        <div className="cierre-error" role="alert">
          <Icon name="warning" size={16} />
          <span>{error}</span>
        </div>
      )}

      <section className="cierre-summary" aria-label="Resumen del estado de resultados">
        <article className="cierre-summary-card">
          <span className="cierre-summary-label">Total Ingresos</span>
          <strong className="cierre-summary-value">{formatMoney(data?.resumen.totalIngresos ?? 0)}</strong>
          <small>Cuentas de resultado acreedor</small>
        </article>
        <article className="cierre-summary-card">
          <span className="cierre-summary-label">Total Gastos</span>
          <strong className="cierre-summary-value">{formatMoney(data?.resumen.totalGastos ?? 0)}</strong>
          <small>Costos y gastos del período</small>
        </article>
        <article
          className={`cierre-summary-card cierre-summary-card--result${utilidad >= 0 ? ' cierre-summary-card--positive' : ' cierre-summary-card--negative'}`}
        >
          <span className="cierre-summary-label">Utilidad / Pérdida</span>
          <strong className="cierre-summary-value">{formatMoney(utilidad)}</strong>
          <small>{utilidad >= 0 ? 'Resultado positivo' : 'Resultado negativo'}</small>
        </article>
      </section>

      <div className="cierre-card">
        {isLoading ? (
          <div className="cierre-empty">
            <span className="loading-spinner" />
            Generando cierre...
          </div>
        ) : !data || data.partidas.length === 0 ? (
          <div className="cierre-empty">
            <span className="cierre-empty-icon">
              <Icon name="closing" size={22} />
            </span>
            <h2>No hay partidas de cierre en este período</h2>
            <p>Prueba con otro rango de fechas.</p>
          </div>
        ) : (
          <div className="cierre-table-scroll">
            <table className="cierre-table">
              <thead>
                <tr>
                  <th>Partida</th>
                  <th>Fecha</th>
                  <th>Concepto</th>
                  <th>Monto</th>
                </tr>
              </thead>
              <tbody>
                {data.partidas.map((partida) => (
                  <tr key={partida.id}>
                    <td className="cierre-code">{partida.numero}</td>
                    <td className="cierre-date">{partida.fecha}</td>
                    <td className="cierre-concept">{partida.concepto}</td>
                    <td
                      className={`cierre-amount${partida.monto >= 0 ? ' cierre-amount--positive' : ' cierre-amount--negative'}`}
                    >
                      {formatMoney(partida.monto)}
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

export default CierreModule
