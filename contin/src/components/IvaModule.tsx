import { useEffect, useState, type FormEvent } from 'react'
import { getLibroIva, type IvaReporteData } from '../services/accountingApi'
import type { Book, Company, LoginSession } from '../types/accounting'
import { formatMoney } from '../utils/format'
import { Icon } from './Icon'
import './IvaModule.css'

function IvaModule({
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
  const [data, setData] = useState<IvaReporteData | null>(null)
  const [isLoading, setIsLoading] = useState(Boolean(initialDesde && initialHasta))
  const [error, setError] = useState('')

  useEffect(() => {
    if (!initialDesde || !initialHasta) return

    let active = true
    getLibroIva(session.token, {
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
              : 'No fue posible consultar el libro de IVA.',
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
      const result = await getLibroIva(session.token, {
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
          : 'No fue posible consultar el libro de IVA.',
      )
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <section className="iva-module">
      <header className="page-heading iva-heading">
        <div>
          <span className="section-eyebrow">REPORTES CONTABLES</span>
          <h1>Libros de IVA</h1>
          <p>
            Movimientos de <strong>{company.nombre}</strong> en cuentas de IVA (versión 1).
          </p>
        </div>
      </header>

      <form className="iva-filters" onSubmit={(event) => void handleGenerate(event)}>
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
        <div className="iva-error" role="alert">
          <Icon name="warning" size={16} />
          <span>{error}</span>
        </div>
      )}

      <div className="iva-card">
        {isLoading ? (
          <div className="iva-empty">
            <span className="loading-spinner" />
            Generando libro de IVA...
          </div>
        ) : !data || data.movimientos.length === 0 ? (
          <div className="iva-empty">
            <span className="iva-empty-icon">
              <Icon name="vat" size={22} />
            </span>
            <h2>No hay movimientos de IVA en este período</h2>
            <p>Prueba con otro rango de fechas.</p>
          </div>
        ) : (
          <div className="iva-table-scroll">
            <table className="iva-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Partida</th>
                  <th>Cuenta</th>
                  <th>Concepto</th>
                  <th>Debe</th>
                  <th>Haber</th>
                </tr>
              </thead>
              <tbody>
                {data.movimientos.map((movimiento, index) => (
                  <tr key={`${movimiento.fecha}-${movimiento.partida}-${index}`}>
                    <td className="iva-date">{movimiento.fecha}</td>
                    <td className="iva-code">{movimiento.partida}</td>
                    <td className="iva-account">{movimiento.cuenta}</td>
                    <td className="iva-concept">{movimiento.concepto}</td>
                    <td className="iva-amount">{formatMoney(movimiento.debe)}</td>
                    <td className="iva-amount">{formatMoney(movimiento.haber)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <section className="iva-summary" aria-label="Resumen de IVA">
        <article className="iva-summary-card">
          <span>IVA Debe</span>
          <strong className="iva-amount">{formatMoney(data?.totales.ivaDebe ?? 0)}</strong>
        </article>
        <article className="iva-summary-card">
          <span>IVA Haber</span>
          <strong className="iva-amount">{formatMoney(data?.totales.ivaHaber ?? 0)}</strong>
        </article>
      </section>
    </section>
  )
}

export default IvaModule
