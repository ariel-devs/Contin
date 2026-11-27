import { useEffect, useMemo, useState } from 'react'
import { apiRequest } from '../services/accountingApi'
import type {
  Book,
  Company,
  LibroIvaCompra,
  LibroIvaData,
  LibroIvaVenta,
  LoginSession,
} from '../types/accounting'
import { formatDate, formatMoney, formatNumber } from '../utils/format'
import { Icon } from './Icon'
import './LibroIvaModule.css'

type Tab = 'ventas' | 'compras'

function LibroIvaModule({
  session,
  company,
  book,
}: {
  session: LoginSession
  company: Company
  book: Book
}) {
  const [tab, setTab] = useState<Tab>('ventas')
  const [data, setData] = useState<LibroIvaData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')

  useEffect(() => {
    let active = true
    apiRequest<LibroIvaData>(
      session,
      `/api/companies/${company.id}/books/${book.id}/libro-iva`,
    )
      .then((result) => {
        if (active) {
          setData(result)
          setLoadError('')
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(
            error instanceof Error
              ? error.message
              : 'No fue posible consultar el libro de IVA.',
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
  }, [book.id, company.id, session])

  const totals = useMemo(() => {
    if (!data) {
      return {
        ventasGravado: 0,
        ventasIva: 0,
        ventasTotal: 0,
        comprasGravado: 0,
        comprasIva: 0,
        comprasTotal: 0,
        ivaNeto: 0,
      }
    }
    const ventasGravado = data.ventas.reduce((s, v) => s + (v.baseGravada ?? 0), 0)
    const ventasIva = data.ventas.reduce((s, v) => s + v.ivaDebito, 0)
    const ventasTotal = data.ventas.reduce((s, v) => s + v.total, 0)
    const comprasGravado = data.compras.reduce((s, c) => s + (c.baseGravada ?? 0), 0)
    const comprasIva = data.compras.reduce((s, c) => s + c.ivaCredito, 0)
    const comprasTotal = data.compras.reduce((s, c) => s + c.total, 0)
    return {
      ventasGravado,
      ventasIva,
      ventasTotal,
      comprasGravado,
      comprasIva,
      comprasTotal,
      ivaNeto: ventasIva - comprasIva,
    }
  }, [data])

  function exportCsv() {
    if (!data) return
    const rows: string[][] = []
    if (tab === 'ventas') {
      rows.push([
        'Fecha',
        'N.º Partida',
        'Concepto',
        'Tercero',
        'NIT',
        'Base Gravada',
        'IVA Débito',
        'Total',
      ])
      for (const v of data.ventas) {
        rows.push([
          v.fecha.slice(0, 10),
          String(v.numeroPartida),
          v.concepto,
          v.tercero,
          v.nit,
          (v.baseGravada ?? 0).toFixed(2),
          v.ivaDebito.toFixed(2),
          v.total.toFixed(2),
        ])
      }
      rows.push([
        '',
        '',
        '',
        '',
        'TOTALES',
        totals.ventasGravado.toFixed(2),
        totals.ventasIva.toFixed(2),
        totals.ventasTotal.toFixed(2),
      ])
    } else {
      rows.push([
        'Fecha',
        'N.º Partida',
        'Concepto',
        'Tercero',
        'NIT',
        'N.º Control DTE',
        'Código Generación',
        'Base Gravada',
        'IVA Crédito',
        'Total',
      ])
      for (const c of data.compras) {
        rows.push([
          c.fecha.slice(0, 10),
          String(c.numeroPartida),
          c.concepto,
          c.tercero,
          c.nit,
          c.numeroControl ?? '',
          c.codigoGeneracion ?? '',
          (c.baseGravada ?? 0).toFixed(2),
          c.ivaCredito.toFixed(2),
          c.total.toFixed(2),
        ])
      }
      rows.push([
        '',
        '',
        '',
        '',
        '',
        '',
        'TOTALES',
        totals.comprasGravado.toFixed(2),
        totals.comprasIva.toFixed(2),
        totals.comprasTotal.toFixed(2),
      ])
    }
    const csv = rows
      .map((row) =>
        row
          .map((cell) => {
            const text = String(cell ?? '')
            return /[",\n;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
          })
          .join(','),
      )
      .join('\r\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `libro-iva-${tab}-${book.nombre.replace(/\s+/g, '_')}.csv`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  const ventasCount = data?.ventas.length ?? 0
  const comprasCount = data?.compras.length ?? 0

  return (
    <section className="libro-iva-module">
      <header className="page-heading libro-iva-heading">
        <div>
          <span className="section-eyebrow">LIBRO TRIBUTARIO</span>
          <h1>Libro de IVA</h1>
          <p>
            <strong>{company.nombre}</strong> · {book.nombre} ·{' '}
            {formatDate(book.fechaInicio)} – {formatDate(book.fechaFin)}
          </p>
        </div>
      </header>

      {loadError && (
        <div className="libro-iva-notice" role="alert">
          <Icon name="warning" size={17} />
          <span>{loadError}</span>
          <button aria-label="Cerrar mensaje" onClick={() => setLoadError('')}>
            <Icon name="close" size={15} />
          </button>
        </div>
      )}

      <section className="libro-iva-summary" aria-label="Resumen de IVA">
        <article className="libro-iva-summary-card">
          <span>IVA Débito Fiscal</span>
          <strong>{formatMoney(totals.ventasIva)}</strong>
        </article>
        <article className="libro-iva-summary-card">
          <span>IVA Crédito Fiscal</span>
          <strong>{formatMoney(totals.comprasIva)}</strong>
        </article>
        <article
          className={`libro-iva-summary-card ${totals.ivaNeto >= 0 ? 'libro-iva-summary-card--positive' : 'libro-iva-summary-card--negative'}`}
        >
          <span>{totals.ivaNeto >= 0 ? 'IVA a pagar' : 'Remanente'}</span>
          <strong>{formatMoney(Math.abs(totals.ivaNeto))}</strong>
        </article>
        <article className="libro-iva-summary-card">
          <span>Total operaciones</span>
          <strong>{ventasCount + comprasCount}</strong>
        </article>
      </section>

      <nav className="libro-iva-tabs" aria-label="Tipo de libro">
        <button
          className={`libro-iva-tab${tab === 'ventas' ? ' libro-iva-tab--active' : ''}`}
          onClick={() => setTab('ventas')}
        >
          Ventas
          <span className="libro-iva-tab-count">{ventasCount}</span>
        </button>
        <button
          className={`libro-iva-tab${tab === 'compras' ? ' libro-iva-tab--active' : ''}`}
          onClick={() => setTab('compras')}
        >
          Compras
          <span className="libro-iva-tab-count">{comprasCount}</span>
        </button>
      </nav>

      <div className="libro-iva-card">
        <div className="libro-iva-toolbar">
          <p>
            {tab === 'ventas' ? (
              <>
                <strong>{ventasCount}</strong>{' '}
                {ventasCount === 1 ? 'operación de venta' : 'operaciones de venta'} en el período
              </>
            ) : (
              <>
                <strong>{comprasCount}</strong>{' '}
                {comprasCount === 1 ? 'operación de compra' : 'operaciones de compra'} en el período
              </>
            )}
          </p>
          <button onClick={exportCsv} disabled={!data || (tab === 'ventas' ? ventasCount === 0 : comprasCount === 0)}>
            Exportar CSV
          </button>
        </div>

        {isLoading ? (
          <div className="libro-iva-loading" role="status">
            <span className="loading-spinner" />
            Cargando libro de IVA...
          </div>
        ) : tab === 'ventas' ? (
          ventasCount === 0 ? (
            <div className="libro-iva-empty">
              <span className="libro-iva-empty-icon">
                <Icon name="vat" size={22} />
              </span>
              <h2>Sin ventas en el período</h2>
              <p>
                Las partidas con tipo de operación «VENTA» y cuenta de IVA Débito (210801)
                aparecerán aquí.
              </p>
            </div>
          ) : (
            <VentasTable ventas={data?.ventas ?? []} totals={totals} />
          )
        ) : comprasCount === 0 ? (
          <div className="libro-iva-empty">
            <span className="libro-iva-empty-icon">
              <Icon name="vat" size={22} />
            </span>
            <h2>Sin compras en el período</h2>
            <p>
              Las partidas con tipo de operación «COMPRA» y cuenta de IVA Crédito (110801)
              aparecerán aquí.
            </p>
          </div>
        ) : (
          <ComprasTable compras={data?.compras ?? []} totals={totals} />
        )}
      </div>
    </section>
  )
}

function VentasTable({
  ventas,
  totals,
}: {
  ventas: LibroIvaVenta[]
  totals: {
    ventasGravado: number
    ventasIva: number
    ventasTotal: number
  }
}) {
  return (
    <div className="libro-iva-table-scroll">
      <table className="libro-iva-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>N.º Partida</th>
            <th>Concepto</th>
            <th>Tercero</th>
            <th>NIT</th>
            <th className="libro-iva-amount">Base Gravada</th>
            <th className="libro-iva-amount">IVA Débito</th>
            <th className="libro-iva-amount">Total</th>
          </tr>
        </thead>
        <tbody>
          {ventas.map((v) => (
            <tr key={v.idPartida}>
              <td>{formatDate(v.fecha)}</td>
              <td>#{v.numeroPartida}</td>
              <td>{v.concepto}</td>
              <td>{v.tercero}</td>
              <td>{v.nit || '—'}</td>
              <td className="libro-iva-amount">{formatNumber(v.baseGravada ?? 0)}</td>
              <td className="libro-iva-amount">{formatNumber(v.ivaDebito)}</td>
              <td className="libro-iva-amount">{formatNumber(v.total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={5}>TOTALES</td>
            <td className="libro-iva-amount">{formatNumber(totals.ventasGravado)}</td>
            <td className="libro-iva-amount">{formatNumber(totals.ventasIva)}</td>
            <td className="libro-iva-amount">{formatNumber(totals.ventasTotal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

function ComprasTable({
  compras,
  totals,
}: {
  compras: LibroIvaCompra[]
  totals: {
    comprasGravado: number
    comprasIva: number
    comprasTotal: number
  }
}) {
  return (
    <div className="libro-iva-table-scroll">
      <table className="libro-iva-table">
        <thead>
          <tr>
            <th>Fecha</th>
            <th>N.º Partida</th>
            <th>Concepto</th>
            <th>Tercero</th>
            <th>NIT</th>
            <th>N.º Control DTE</th>
            <th className="libro-iva-amount">Base Gravada</th>
            <th className="libro-iva-amount">IVA Crédito</th>
            <th className="libro-iva-amount">Total</th>
          </tr>
        </thead>
        <tbody>
          {compras.map((c) => (
            <tr key={c.idPartida}>
              <td>{formatDate(c.fecha)}</td>
              <td>#{c.numeroPartida}</td>
              <td>{c.concepto}</td>
              <td>{c.tercero}</td>
              <td>{c.nit || '—'}</td>
              <td>{c.numeroControl ?? '—'}</td>
              <td className="libro-iva-amount">{formatNumber(c.baseGravada ?? 0)}</td>
              <td className="libro-iva-amount">{formatNumber(c.ivaCredito)}</td>
              <td className="libro-iva-amount">{formatNumber(c.total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={6}>TOTALES</td>
            <td className="libro-iva-amount">{formatNumber(totals.comprasGravado)}</td>
            <td className="libro-iva-amount">{formatNumber(totals.comprasIva)}</td>
            <td className="libro-iva-amount">{formatNumber(totals.comprasTotal)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  )
}

export default LibroIvaModule
