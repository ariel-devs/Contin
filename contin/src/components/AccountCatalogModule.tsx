import { useEffect, useMemo, useState, type CSSProperties, type FormEvent } from 'react'
import { apiRequest } from '../services/accountingApi'
import type {
  Account,
  AccountClassification,
  AccountNature,
  Company,
  LoginSession,
} from '../types/accounting'
import { Icon } from './Icon'
import './AccountCatalogModule.css'

type AccountDraft = {
  parentKey: string
  nombre: string
  codigo: string
  clasificacion: AccountClassification | ''
  naturaleza: AccountNature | ''
  permiteMovimientos: boolean
}

const classifications: AccountClassification[] = [
  'ACTIVO',
  'PASIVO',
  'PATRIMONIO',
  'INGRESO',
  'COSTO',
  'GASTO',
]

const emptyDraft: AccountDraft = {
  parentKey: '',
  nombre: '',
  codigo: '',
  clasificacion: '',
  naturaleza: '',
  permiteMovimientos: true,
}

/**
 * Sugiere el siguiente código disponible bajo una cuenta padre.
 * El catálogo predeterminado usa prefijo sin punto (ej. 1101 → 110101, 110102).
 * Los códigos personalizados pueden usar punto (ej. 1101.01).
 */
function suggestCode(parent: Account, accounts: Account[]): string {
  const siblings = accounts.filter((account) => account.parentKey === parent.key)
  if (siblings.length === 0) {
    // Sin hermanos: usar prefijo sin punto (consistente con catálogo predeterminado)
    return `${parent.codigo}01`
  }

  const usesDot = siblings.some((account) => account.codigo.startsWith(`${parent.codigo}.`))
  const prefix = usesDot ? `${parent.codigo}.` : parent.codigo
  const suffixes = siblings
    .map((account) =>
      account.codigo.startsWith(prefix) ? account.codigo.slice(prefix.length) : '',
    )
    .filter((suffix) => /^\d+$/.test(suffix))

  if (suffixes.length === 0) {
    return usesDot ? `${parent.codigo}.01` : `${parent.codigo}01`
  }

  const nextNumber = suffixes.reduce((highest, suffix) => Math.max(highest, Number(suffix)), 0) + 1
  const width = Math.max(...suffixes.map((suffix) => suffix.length))
  const nextSuffix = String(nextNumber).padStart(width, '0')
  return usesDot ? `${parent.codigo}.${nextSuffix}` : `${parent.codigo}${nextSuffix}`
}

function AccountCatalogModule({
  session,
  company,
}: {
  session: LoginSession
  company: Company
}) {
  const [accounts, setAccounts] = useState<Account[]>([])
  const [loadError, setLoadError] = useState('')
  const [loadVersion, setLoadVersion] = useState(0)
  const [settledLoadKey, setSettledLoadKey] = useState('')
  const [tab, setTab] = useState<'predeterminadas' | 'personalizadas'>('predeterminadas')
  const [search, setSearch] = useState('')
  const [classification, setClassification] = useState('')
  const [isFormOpen, setIsFormOpen] = useState(false)
  const [editingAccount, setEditingAccount] = useState<Account | null>(null)
  const [draft, setDraft] = useState<AccountDraft>(emptyDraft)
  const [formError, setFormError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [busyAccountId, setBusyAccountId] = useState<number | null>(null)
  const [notice, setNotice] = useState('')
  const [actionError, setActionError] = useState('')
  const loadKey = `${company.id}:${loadVersion}`
  const isLoading = settledLoadKey !== loadKey

  // Efecto único de carga: evita la doble petición anterior.
  useEffect(() => {
    let active = true
    apiRequest<Account[]>(session, `/api/companies/${company.id}/accounts`)
      .then((result) => {
        if (active) {
          setAccounts(result)
          setLoadError('')
          setSettledLoadKey(loadKey)
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(
            error instanceof Error ? error.message : 'No fue posible consultar el catálogo.',
          )
          setSettledLoadKey(loadKey)
        }
      })
    return () => {
      active = false
    }
  }, [company.id, loadKey, session])

  // Alias de la función de recarga para reutilizar en guardar/desactivar.
  async function reloadAccounts() {
    setLoadError('')
    try {
      const result = await apiRequest<Account[]>(
        session,
        `/api/companies/${company.id}/accounts`,
      )
      setAccounts(result)
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : 'No fue posible consultar el catálogo.',
      )
      throw error
    }
  }

  const accountByKey = useMemo(
    () => new Map(accounts.map((account) => [account.key, account])),
    [accounts],
  )

  const visibleAccounts = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase()
    const matchingAccounts = accounts.filter((account) => {
      if (tab === 'predeterminadas' && account.tipo !== 'PREDETERMINADA') return false
      if (tab === 'personalizadas' && account.tipo !== 'PERSONALIZADA') return false
      if (classification && account.clasificacion !== classification) return false
      return (
        !normalizedSearch ||
        account.codigo.toLocaleLowerCase().includes(normalizedSearch) ||
        account.nombre.toLocaleLowerCase().includes(normalizedSearch)
      )
    })
    const included = new Set(matchingAccounts.map((account) => account.key))
    matchingAccounts.forEach((account) => {
      let parentKey = account.parentKey
      while (parentKey && !included.has(parentKey)) {
        const parent = accountByKey.get(parentKey)
        if (!parent) break
        included.add(parent.key)
        parentKey = parent.parentKey
      }
    })
    return accounts.filter((account) => included.has(account.key))
  }, [accountByKey, accounts, classification, search, tab])

  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, Account[]>()
    visibleAccounts.forEach((account) => {
      const children = map.get(account.parentKey) ?? []
      children.push(account)
      map.set(account.parentKey, children)
    })
    map.forEach((children) => {
      children.sort((left, right) =>
        left.codigo.localeCompare(right.codigo, 'es', { numeric: true }),
      )
    })
    return map
  }, [visibleAccounts])

  const parentOptions = useMemo(() => {
    const excluded = new Set<string>()
    if (editingAccount) {
      excluded.add(editingAccount.key)
      let changed = true
      while (changed) {
        changed = false
        accounts.forEach((account) => {
          if (account.parentKey && excluded.has(account.parentKey) && !excluded.has(account.key)) {
            excluded.add(account.key)
            changed = true
          }
        })
      }
    }
    return accounts
      .filter(
        (account) =>
          account.estado === 'ACTIVA' &&
          !account.permiteMovimientos &&
          !excluded.has(account.key),
      )
      .sort((left, right) =>
        left.codigo.localeCompare(right.codigo, 'es', { numeric: true }),
      )
  }, [accounts, editingAccount])

  function openCreateForm() {
    setEditingAccount(null)
    setDraft(emptyDraft)
    setFormError('')
    setIsSaving(false)
    setIsFormOpen(true)
  }

  function openEditForm(account: Account) {
    setEditingAccount(account)
    setDraft({
      parentKey: account.parentKey ?? '',
      nombre: account.nombre,
      codigo: account.codigo,
      clasificacion: account.clasificacion,
      naturaleza: account.naturaleza,
      permiteMovimientos: account.permiteMovimientos,
    })
    setFormError('')
    setIsFormOpen(true)
  }

  function closeForm() {
    setIsFormOpen(false)
    setEditingAccount(null)
    setFormError('')
  }

  function handleParentChange(parentKey: string) {
    const parent = accountByKey.get(parentKey)
    setDraft((current) => ({
      ...current,
      parentKey,
      codigo: current.codigo || (parent ? suggestCode(parent, accounts) : ''),
      clasificacion: parent?.clasificacion ?? '',
      naturaleza: parent?.naturaleza ?? '',
    }))
  }

  async function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setFormError('')
    if (!draft.parentKey || !draft.nombre.trim() || !draft.codigo.trim()) {
      setFormError('Completa el nombre, el código y selecciona una cuenta padre.')
      return
    }
    if (draft.nombre.trim().length > 150 || draft.codigo.trim().length > 20) {
      setFormError('El nombre admite hasta 150 caracteres y el código hasta 20.')
      return
    }
    if (!draft.clasificacion || !draft.naturaleza) {
      setFormError('Selecciona una cuenta padre válida para heredar clasificación y naturaleza.')
      return
    }

    setIsSaving(true)
    try {
      const path = editingAccount
        ? `/api/companies/${company.id}/accounts/${editingAccount.id}`
        : `/api/companies/${company.id}/accounts`
      await apiRequest<Account>(session, path, {
        method: editingAccount ? 'PATCH' : 'POST',
        body: JSON.stringify({
          ...draft,
          nombre: draft.nombre.trim(),
          codigo: draft.codigo.trim(),
        }),
      })
      setNotice(
        editingAccount
          ? 'La cuenta se actualizó correctamente.'
          : 'La cuenta se creó correctamente.',
      )
      setActionError('')
      closeForm()
      setTab('personalizadas')
      try {
        await reloadAccounts()
      } catch (error) {
        setActionError(
          error instanceof Error
            ? `La cuenta se guardó, pero no se pudo actualizar la lista: ${error.message}`
            : 'La cuenta se guardó, pero no se pudo actualizar la lista.',
        )
      }
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'No fue posible guardar la cuenta.')
    } finally {
      setIsSaving(false)
    }
  }

  async function deactivateAccount(account: Account) {
    if (
      !window.confirm(
        `¿Desactivar «${account.nombre}»? No se podrá usar en nuevas partidas.`,
      )
    ) {
      return
    }
    setBusyAccountId(account.id)
    setActionError('')
    setNotice('')
    try {
      await apiRequest<{ id: number; estado: string }>(
        session,
        `/api/companies/${company.id}/accounts/${account.id}/deactivate`,
        { method: 'POST' },
      )
      setNotice(`La cuenta «${account.nombre}» fue desactivada.`)
      try {
        await reloadAccounts()
      } catch (error) {
        setActionError(
          error instanceof Error
            ? `La cuenta se desactivó, pero no se pudo actualizar la lista: ${error.message}`
            : 'La cuenta se desactivó, pero no se pudo actualizar la lista.',
        )
      }
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'No fue posible desactivar la cuenta.')
    } finally {
      setBusyAccountId(null)
    }
  }

  function renderAccount(account: Account, depth: number, ancestry: Set<string>) {
    if (ancestry.has(account.key)) return null
    const nextAncestry = new Set(ancestry)
    nextAncestry.add(account.key)
    const children = childrenByParent.get(account.key) ?? []
    const isCustom = account.tipo === 'PERSONALIZADA'
    return (
      <li className="account-tree-item" key={account.key}>
        <div
          className={`account-tree-row${account.estado === 'INACTIVA' ? ' account-tree-row--inactive' : ''}`}
          style={{ '--account-depth': depth } as CSSProperties}
        >
          <span className={`account-kind${account.permiteMovimientos ? ' account-kind--detail' : ''}`}>
            {account.permiteMovimientos ? 'Detalle' : 'Agrupadora'}
          </span>
          <span className="account-code">{account.codigo}</span>
          <span className="account-name">{account.nombre}</span>
          <span className="account-classification">{account.clasificacion}</span>
          <span className={`account-nature account-nature--${account.naturaleza.toLocaleLowerCase()}`}>
            {account.naturaleza === 'DEUDORA' ? 'Deudora' : 'Acreedora'}
          </span>
          <span className="account-row-trailing">
            {account.estado === 'INACTIVA' && <span className="account-status">Inactiva</span>}
            {isCustom && (
              <span className="account-actions">
                <button type="button" onClick={() => openEditForm(account)}>Editar</button>
                <button
                  type="button"
                  disabled={account.estado === 'INACTIVA' || busyAccountId === account.id}
                  onClick={() => void deactivateAccount(account)}
                >
                  {busyAccountId === account.id ? 'Desactivando…' : 'Desactivar'}
                </button>
              </span>
            )}
          </span>
        </div>
        {children.length > 0 && (
          <ul className="account-tree-children">
            {children.map((child) => renderAccount(child, depth + 1, nextAncestry))}
          </ul>
        )}
      </li>
    )
  }

  const roots = visibleAccounts.filter(
    (account) => !account.parentKey || !visibleAccounts.some((item) => item.key === account.parentKey),
  )

  return (
    <section className="account-catalog">
      <header className="page-heading account-catalog-heading">
        <div>
          <span className="section-eyebrow">ADMINISTRACIÓN CONTABLE</span>
          <h1>Catálogo de cuentas</h1>
          <p>Consulta la estructura contable y administra las cuentas de <strong>{company.nombre}</strong>.</p>
        </div>
        <button className="primary-button" onClick={openCreateForm}>
          <Icon name="plus" size={17} />
          Nueva cuenta
        </button>
      </header>

      {notice && (
        <div className="account-notice account-notice--success" role="status">
          <Icon name="check" size={17} />
          <span>{notice}</span>
          <button aria-label="Cerrar mensaje" onClick={() => setNotice('')}><Icon name="close" size={15} /></button>
        </div>
      )}
      {actionError && (
        <div className="account-notice account-notice--error" role="alert">
          <Icon name="warning" size={17} />
          <span>{actionError}</span>
          <button aria-label="Cerrar mensaje" onClick={() => setActionError('')}><Icon name="close" size={15} /></button>
        </div>
      )}

      <div className="account-catalog-card">
        <nav className="account-tabs" aria-label="Tipo de catálogo">
          <button
            className={tab === 'predeterminadas' ? 'account-tab account-tab--active' : 'account-tab'}
            onClick={() => setTab('predeterminadas')}
          >
            Catálogo predeterminado
          </button>
          <button
            className={tab === 'personalizadas' ? 'account-tab account-tab--active' : 'account-tab'}
            onClick={() => setTab('personalizadas')}
          >
            Mis cuentas personalizadas
          </button>
        </nav>

        <div className="account-filters">
          <label className="account-search">
            <Icon name="search" size={17} />
            <input
              aria-label="Buscar cuenta por código o nombre"
              placeholder="Buscar por código o nombre"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label className="account-class-filter">
            <span>Clasificación</span>
            <select value={classification} onChange={(event) => setClassification(event.target.value)}>
              <option value="">Todas</option>
              {classifications.map((item) => (
                <option key={item} value={item}>{item}</option>
              ))}
            </select>
            <Icon name="chevron" size={15} />
          </label>
        </div>

        {isLoading ? (
          <div className="account-empty-message">Cargando catálogo de cuentas…</div>
        ) : loadError ? (
          <div className="account-empty-message account-empty-message--error" role="alert">
            {loadError}
            <button
              className="text-button"
              onClick={() => {
                setLoadError('')
                setLoadVersion((version) => version + 1)
              }}
            >
              Reintentar
            </button>
          </div>
        ) : roots.length === 0 ? (
          <div className="account-empty-message">
            {tab === 'personalizadas' && accounts.every((account) => account.tipo !== 'PERSONALIZADA')
              ? 'Aún no hay cuentas personalizadas en esta empresa.'
              : 'No se encontraron cuentas con esos criterios.'}
          </div>
        ) : (
          <div className="account-tree-scroll">
            <div className="account-tree-heading">
              <span>TIPO</span>
              <span>CÓDIGO</span>
              <span>NOMBRE DE LA CUENTA</span>
              <span>CLASIFICACIÓN</span>
              <span>NATURALEZA</span>
              <span><span className="visually-hidden">Acciones</span></span>
            </div>
            <ul className="account-tree">
              {roots.map((root) => renderAccount(root, 0, new Set()))}
            </ul>
          </div>
        )}
        <footer className="account-legend">
          <span><i className="account-legend-dot account-legend-dot--group" /> Agrupadora: organiza otras cuentas y no recibe movimientos.</span>
          <span><i className="account-legend-dot account-legend-dot--detail" /> Detalle: puede recibir movimientos contables.</span>
        </footer>
      </div>

      {isFormOpen && (
        <div
          className="account-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !isSaving) closeForm()
          }}
        >
          <section className="account-modal" role="dialog" aria-modal="true" aria-labelledby="account-form-title">
            <header className="account-modal-heading">
              <div>
                <span className="section-eyebrow">CUENTA PERSONALIZADA</span>
                <h2 id="account-form-title">{editingAccount ? 'Editar cuenta' : 'Nueva cuenta'}</h2>
                <p>La cuenta se agregará al catálogo de {company.nombre}.</p>
              </div>
              <button className="account-modal-close" aria-label="Cerrar formulario" onClick={closeForm} disabled={isSaving}>
                <Icon name="close" size={18} />
              </button>
            </header>
            <form className="account-form" onSubmit={(event) => void saveAccount(event)}>
              <label>
                Cuenta padre
                <select
                  required
                  value={draft.parentKey}
                  onChange={(event) => handleParentChange(event.target.value)}
                >
                  <option value="">Selecciona una cuenta agrupadora</option>
                  {parentOptions.map((parent) => (
                    <option key={parent.key} value={parent.key}>
                      {parent.codigo} · {parent.nombre}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Nombre de la cuenta
                <input
                  autoFocus
                  required
                  maxLength={150}
                  value={draft.nombre}
                  onChange={(event) => setDraft({ ...draft, nombre: event.target.value })}
                  placeholder="Ej. Caja chica"
                />
              </label>
              <label>
                Código contable
                <input
                  required
                  maxLength={20}
                  value={draft.codigo}
                  onChange={(event) => setDraft({ ...draft, codigo: event.target.value })}
                  placeholder="Se sugiere según la cuenta padre"
                />
                <small>Debe ser único dentro de la empresa.</small>
              </label>
              <div className="account-form-pair">
                <label>
                  Clasificación
                  <select
                    value={draft.clasificacion}
                    disabled
                    aria-readonly="true"
                  >
                    {draft.clasificacion && (
                      <option value={draft.clasificacion}>{draft.clasificacion}</option>
                    )}
                  </select>
                </label>
                <label>
                  Naturaleza
                  <select
                    value={draft.naturaleza}
                    disabled
                    aria-readonly="true"
                  >
                    {draft.naturaleza && (
                      <option value={draft.naturaleza}>
                        {draft.naturaleza === 'DEUDORA' ? 'Deudora' : 'Acreedora'}
                      </option>
                    )}
                  </select>
                </label>
              </div>
              <label className="account-movement-option">
                <input
                  type="checkbox"
                  checked={draft.permiteMovimientos}
                  disabled={Boolean(
                    editingAccount &&
                    accounts.some((account) => account.parentKey === editingAccount.key),
                  )}
                  onChange={(event) => setDraft({ ...draft, permiteMovimientos: event.target.checked })}
                />
                <span>
                  <strong>Permite movimientos</strong>
                  <small>Actívalo solo para cuentas de detalle.</small>
                </span>
              </label>
              {formError && <p className="account-form-error" role="alert">{formError}</p>}
              <footer className="account-form-actions">
                <button type="button" className="secondary-button" onClick={closeForm} disabled={isSaving}>
                  Cancelar
                </button>
                <button type="submit" className="primary-button" disabled={isSaving || !draft.parentKey}>
                  {isSaving ? 'Guardando…' : editingAccount ? 'Guardar cambios' : 'Crear cuenta'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}
    </section>
  )
}

export default AccountCatalogModule
