import { useEffect, useState } from 'react'
import { apiRequest } from '../services/accountingApi'
import type { Book, Company, DeclaracionIva, LoginSession } from '../types/accounting'
import { formatDate, formatMoney } from '../utils/format'
import { Icon } from './Icon'
import './DeclaracionIvaModule.css'

type DeclaracionResponse = DeclaracionIva & { calculada?: boolean; id?: number }

const estadoLabel: Record<DeclaracionIva['estado'], string> = {
  BORRADOR: 'Borrador',
  PRESENTADA: 'Presentada',
  PAGADA: 'Pagada',
}

const estadoClass: Record<DeclaracionIva['estado'], string> = {
  BORRADOR: 'borrador',
  PRESENTADA: 'presentada',
  PAGADA: 'pagada',
}

function DeclaracionIvaModule({
  session,
  company,
  book,
}: {
  session: LoginSession
  company: Company
  book: Book
}) {
  const [declaracion, setDeclaracion] = useState<DeclaracionResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)

  useEffect(() => {
    let active = true
    apiRequest<DeclaracionResponse>(
      session,
      `/api/companies/${company.id}/books/${book.id}/declaracion-iva`,
    )
      .then((result) => {
        if (active) {
          setDeclaracion(result)
          setLoadError('')
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(
            error instanceof Error
              ? error.message
              : 'No fue posible consultar la declaración de IVA.',
          )
        }
      })
      .finally(() => {
        if (active) {
          setIsLoading(false)
        }
      })
    return () => {
      active = false
    }
  }, [book.id, company.id, session, refreshKey])

  async function generarDeclaracion() {
    setIsSaving(true)
    setNotice('')
    setActionError('')
    try {
      await apiRequest<DeclaracionIva>(
        session,
        `/api/companies/${company.id}/books/${book.id}/declaracion-iva`,
        { method: 'POST' },
      )
      setNotice('La declaración de IVA se generó correctamente.')
      setIsLoading(true)
      setRefreshKey((key) => key + 1)
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : 'No fue posible generar la declaración de IVA.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  async function presentarDeclaracion() {
    if (
      !window.confirm(
        '¿Marcar la declaración como PRESENTADA? Esto asume que ya fue enviada a Hacienda.',
      )
    ) {
      return
    }
    setIsSaving(true)
    setNotice('')
    setActionError('')
    try {
      await apiRequest<DeclaracionIva>(
        session,
        `/api/companies/${company.id}/books/${book.id}/declaracion-iva/presentar`,
        { method: 'POST' },
      )
      setNotice('La declaración fue marcada como presentada.')
      setIsLoading(true)
      setRefreshKey((key) => key + 1)
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : 'No fue posible presentar la declaración.',
      )
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <section className="declaracion-iva-module">
        <header className="page-heading declaracion-iva-heading">
          <div>
            <span className="section-eyebrow">DECLARACIÓN TRIBUTARIA</span>
            <h1>Declaración de IVA (F-07)</h1>
            <p>
              <strong>{company.nombre}</strong> · {book.nombre}
            </p>
          </div>
        </header>
        <div className="declaracion-iva-loading" role="status">
          <span className="loading-spinner" />
          Cargando declaración de IVA...
        </div>
      </section>
    )
  }

  if (loadError) {
    return (
      <section className="declaracion-iva-module">
        <header className="page-heading declaracion-iva-heading">
          <div>
            <span className="section-eyebrow">DECLARACIÓN TRIBUTARIA</span>
            <h1>Declaración de IVA (F-07)</h1>
            <p>
              <strong>{company.nombre}</strong> · {book.nombre}
            </p>
          </div>
        </header>
        <div className="declaracion-iva-empty">
          <span className="declaracion-iva-empty-icon">
            <Icon name="warning" size={22} />
          </span>
          <h2>No se pudo cargar la declaración</h2>
          <p>{loadError}</p>
          <button
            className="secondary-button"
            onClick={() => {
              setIsLoading(true)
              setRefreshKey((key) => key + 1)
            }}
          >
            Reintentar
          </button>
        </div>
      </section>
    )
  }

  if (!declaracion) {
    return (
      <section className="declaracion-iva-module">
        <header className="page-heading declaracion-iva-heading">
          <div>
            <span className="section-eyebrow">DECLARACIÓN TRIBUTARIA</span>
            <h1>Declaración de IVA (F-07)</h1>
            <p>
              <strong>{company.nombre}</strong> · {book.nombre}
            </p>
          </div>
        </header>
        <div className="declaracion-iva-empty">
          <span className="declaracion-iva-empty-icon">
            <Icon name="vat" size={22} />
          </span>
          <h2>Sin declaración para este período</h2>
          <p>
            Genera la declaración para calcular el IVA del período a partir de las partidas
            contabilizadas.
          </p>
          <button
            className="primary-button"
            onClick={() => void generarDeclaracion()}
            disabled={isSaving}
          >
            {isSaving ? 'Generando…' : 'Generar declaración'}
          </button>
        </div>
      </section>
    )
  }

  const esCalculo = declaracion.calculada === true
  const ivaNeta = declaracion.debitoFiscal - declaracion.creditoFiscal - declaracion.ivaPercibido
  const aPagar = ivaNeta > 0 ? ivaNeta : 0
  const remanente = ivaNeta < 0 ? Math.abs(ivaNeta) : 0

  return (
    <section className="declaracion-iva-module">
      <header className="page-heading declaracion-iva-heading">
        <div>
          <span className="section-eyebrow">DECLARACIÓN TRIBUTARIA</span>
          <h1>Declaración de IVA (F-07)</h1>
          <p>
            <strong>{company.nombre}</strong> · {book.nombre} · Período{' '}
            {declaracion.periodo}
          </p>
        </div>
      </header>

      <div className="declaracion-iva-info" role="note">
        <Icon name="warning" size={18} />
        <div>
          Esta declaración se calcula a partir de las partidas contabilizadas del período.{' '}
          <strong>No se transmite automáticamente a Hacienda.</strong> Una vez revisada, debes
          presentarla en el portal de Hacienda y luego marcar el estado aquí como{' '}
          <strong>PRESENTADA</strong>.
        </div>
      </div>

      {notice && (
        <div className="declaracion-iva-notice declaracion-iva-notice--success" role="status">
          <Icon name="check" size={17} />
          <span>{notice}</span>
          <button aria-label="Cerrar mensaje" onClick={() => setNotice('')}>
            <Icon name="close" size={15} />
          </button>
        </div>
      )}
      {actionError && (
        <div className="declaracion-iva-notice declaracion-iva-notice--error" role="alert">
          <Icon name="warning" size={17} />
          <span>{actionError}</span>
          <button aria-label="Cerrar mensaje" onClick={() => setActionError('')}>
            <Icon name="close" size={15} />
          </button>
        </div>
      )}

      <div className="declaracion-iva-grid">
        <article className="declaracion-iva-card">
          <h2>Resumen del período</h2>
          <div className="declaracion-iva-row">
            <span>IVA Débito Fiscal (ventas)</span>
            <strong>{formatMoney(declaracion.debitoFiscal)}</strong>
          </div>
          <div className="declaracion-iva-row">
            <span>IVA Crédito Fiscal (compras)</span>
            <strong>{formatMoney(declaracion.creditoFiscal)}</strong>
          </div>
          <div className="declaracion-iva-row">
            <span>IVA Percibido (retenciones 1%)</span>
            <strong>{formatMoney(declaracion.ivaPercibido)}</strong>
          </div>
          <div className="declaracion-iva-row">
            <span>IVA Retenido a terceros</span>
            <strong>{formatMoney(declaracion.ivaRetenido)}</strong>
          </div>
          <div className="declaracion-iva-row">
            <span>Remanente del período anterior</span>
            <strong>{formatMoney(declaracion.remanenteAnterior)}</strong>
          </div>
          <div
            className={`declaracion-iva-row declaracion-iva-row--total ${ivaNeta >= 0 ? 'declaracion-iva-row--positive' : 'declaracion-iva-row--negative'}`}
          >
            <span>{ivaNeta >= 0 ? 'IVA a pagar' : 'Remanente para el siguiente período'}</span>
            <strong>{formatMoney(ivaNeta >= 0 ? aPagar : remanente)}</strong>
          </div>
        </article>

        <article className="declaracion-iva-card declaracion-iva-status-card">
          <div>
            <h2>Estado de la declaración</h2>
            <span
              className={`declaracion-iva-status-badge declaracion-iva-status-badge--${estadoClass[declaracion.estado]}`}
            >
              <span />
              {estadoLabel[declaracion.estado]}
            </span>
            <p
              style={{
                margin: '14px 0 0',
                color: '#7d8998',
                fontSize: '10px',
                lineHeight: 1.6,
              }}
            >
              {esCalculo
                ? 'Este es un cálculo preliminar. Genera la declaración para guardarla en el sistema.'
                : declaracion.estado === 'BORRADOR'
                  ? 'La declaración está guardada en borrador. Preséntala en Hacienda y luego márcala como presentada.'
                  : declaracion.estado === 'PRESENTADA'
                    ? `Declaración presentada el ${formatDate(declaracion.fechaPresentacion ?? '')}.`
                    : 'La declaración fue pagada.'}
            </p>
          </div>
          <div className="declaracion-iva-actions">
            {esCalculo && (
              <button
                className="primary-button"
                onClick={() => void generarDeclaracion()}
                disabled={isSaving}
              >
                {isSaving ? 'Generando…' : 'Generar declaración'}
              </button>
            )}
            {!esCalculo && declaracion.estado === 'BORRADOR' && (
              <button
                className="primary-button"
                onClick={() => void presentarDeclaracion()}
                disabled={isSaving}
              >
                {isSaving ? 'Procesando…' : 'Marcar como presentada'}
              </button>
            )}
            {!esCalculo && declaracion.estado !== 'BORRADOR' && (
              <p className="declaracion-iva-actions-note">
                No hay acciones pendientes para esta declaración.
              </p>
            )}
          </div>
        </article>
      </div>
    </section>
  )
}

export default DeclaracionIvaModule
