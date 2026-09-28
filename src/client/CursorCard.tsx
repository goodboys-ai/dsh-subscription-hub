import { useCallback, useEffect, useId, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
import type { ProviderUsage, SubscriptionsSectionInjected } from './SubscriptionsSection.js'
import { callSubscriptionsAuth } from './subscriptions-rpc.js'

type Translate = SubscriptionsSectionInjected['t']
type CursorStatus = { authenticated: boolean; busy: boolean; expiresAt?: number; error?: string }
type CursorModel = { id: string; name: string }
const buttonStyle: CSSProperties = {
  height: 28, padding: '0 10px', borderRadius: 14,
  border: '1px solid var(--dsw-alias-border-l2)', background: 'transparent',
  color: 'var(--dsw-alias-label-primary)', font: 'inherit', fontSize: 12,
  lineHeight: '18px', cursor: 'pointer',
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function barColor(percent: number): string {
  if (percent >= 95) return 'var(--dsw-alias-state-error-primary)'
  if (percent >= 80) return 'var(--dsw-alias-state-warn-label)'
  return 'var(--dsw-alias-state-success-primary)'
}

/** Cursor sign-in and dashboard quota, backed by the host's DSH credential service. */
export function CursorCard({ rpc, t }: { rpc: ConnectionHandle['rpc']; t: Translate }) {
  const [status, setStatus] = useState<CursorStatus>()
  const [usage, setUsage] = useState<ProviderUsage>()
  const [authorizeUrl, setAuthorizeUrl] = useState<string>()
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(false)
  const [manage, setManage] = useState(false)

  const refreshStatus = useCallback(async () => {
    try {
      const value = await callSubscriptionsAuth<CursorStatus>(rpc, 'cursorStatus', {})
      setStatus(value)
      if (value.authenticated) setAuthorizeUrl(undefined)
      if (value.error) setError(value.error)
    } catch (failure) { setError(message(failure)) }
  }, [rpc])

  const refreshUsage = useCallback(async () => {
    setLoading(true)
    try {
      setUsage(await callSubscriptionsAuth<ProviderUsage>(rpc, 'cursorUsage', {}))
      setError(undefined)
    } catch (failure) { setError(message(failure)) }
    finally { setLoading(false) }
  }, [rpc])

  useEffect(() => { void refreshStatus() }, [refreshStatus])
  useEffect(() => {
    if (status?.busy !== true) return
    const timer = setInterval(() => { void refreshStatus() }, 2000)
    return () => clearInterval(timer)
  }, [status?.busy, refreshStatus])
  useEffect(() => { if (status?.authenticated === true) void refreshUsage() }, [status?.authenticated, refreshUsage])

  const login = async () => {
    setError(undefined)
    try {
      const value = await callSubscriptionsAuth<{ authorizeUrl: string }>(rpc, 'cursorLogin', {})
      setAuthorizeUrl(value.authorizeUrl)
      window.open(value.authorizeUrl, '_blank', 'noopener')
      await refreshStatus()
    } catch (failure) { setError(message(failure)) }
  }
  const cancel = async () => {
    try {
      await callSubscriptionsAuth(rpc, 'cursorCancel', {})
      setAuthorizeUrl(undefined)
      await refreshStatus()
    } catch (failure) { setError(message(failure)) }
  }
  const logout = async () => {
    try {
      await callSubscriptionsAuth(rpc, 'cursorLogout', {})
      setUsage(undefined)
      await refreshStatus()
    } catch (failure) { setError(message(failure)) }
  }

  return <div style={{ border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 12, padding: '12px 14px',
    display: 'flex', flexDirection: 'column', gap: 6, color: 'var(--dsw-alias-label-primary)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: status?.authenticated
        ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-label-dimmed)' }} />
      <strong>{t('cursorTitle')}</strong>
    </div>
    {status === undefined && <p>{t('usageLoading')}</p>}
    {status !== undefined && <p style={{ margin: 0, fontSize: 12,
      color: 'var(--dsw-alias-label-tertiary)' }}>{status.authenticated ? t('cursorConnected') : t('notLoggedIn')}
      {status.expiresAt === undefined ? '' : ` · ${t('accountExpires', { date: new Date(status.expiresAt).toLocaleString() })}`}</p>}
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {status?.authenticated === false && status.busy === false && <button type="button" style={buttonStyle}
        onClick={() => { void login() }}>{t('login')}</button>}
      {status?.authenticated === true && <button type="button" style={buttonStyle} onClick={() => { void logout() }}>{t('logout')}</button>}
      <button type="button" style={buttonStyle} aria-haspopup="dialog" onClick={() => setManage(true)}>{t('accountsManage')}</button>
    </div>
    {status?.busy === true && <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      <span>{t('cursorWaiting')}</span>
      {authorizeUrl !== undefined && <a href={authorizeUrl} target="_blank" rel="noopener noreferrer">
        {t('cursorOpenLogin')}
      </a>}
      <button type="button" style={buttonStyle} onClick={() => { void cancel() }}>{t('cancel')}</button>
    </div>}
    {error !== undefined && <p style={{ color: 'var(--dsw-alias-state-error-primary)' }}>
      {t('usageError', { message: error })}
    </p>}
    {status?.authenticated === true && <div style={{ marginTop: 12 }}>
      <button type="button" style={buttonStyle} disabled={loading} onClick={() => { void refreshUsage() }}>{t('usageRefresh')}</button>
      {loading && usage === undefined && <p>{t('usageLoading')}</p>}
      {usage?.windows?.length === 0 && <p>{t('usageEmpty')}</p>}
      {usage?.windows?.map((window, index) => {
        const percent = Math.min(100, Math.max(0, window.usedPercent))
        const label = window.scope === 'Included' ? t('cursorIncluded')
          : window.scope === 'Cursor Models' ? t('cursorModels')
            : window.scope === 'Other Models' ? t('cursorOtherModels')
              : window.scope === 'Included requests' ? t('cursorIncludedRequests')
                : window.scope ?? t('usageWindow')
        return <div key={index} style={{ marginTop: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
            <span>{label}</span>
            <span>{Math.round(percent)}%{window.resetsAt === undefined ? ''
              : ` · ${t('usageResets', { date: new Date(window.resetsAt).toLocaleString() })}`}</span>
          </div>
          <div style={{ height: 6, marginTop: 5, borderRadius: 3, background: 'var(--dsw-alias-bg-layer-1)' }}>
            <div style={{ width: `${percent}%`, height: '100%', borderRadius: 3, background: barColor(percent) }} />
          </div>
        </div>
      })}
    </div>}
    {manage && <CursorManager rpc={rpc} t={t} authenticated={status?.authenticated === true}
      onClose={() => setManage(false)} />}
  </div>
}

function CursorManager({ rpc, t, authenticated, onClose }: {
  rpc: ConnectionHandle['rpc']; t: Translate; authenticated: boolean; onClose: () => void
}) {
  const dialog = useRef<HTMLDialogElement>(null)
  const title = useId()
  const [models, setModels] = useState<CursorModel[]>()
  const [filter, setFilter] = useState('')
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(false)
  const refresh = useCallback(async (force = false) => {
    if (!authenticated) return
    setLoading(true)
    setError(undefined)
    try {
      setModels(await callSubscriptionsAuth<CursorModel[]>(rpc, 'cursorModels', { force }))
    } catch (failure) { setError(message(failure)); setModels(undefined) }
    finally { setLoading(false) }
  }, [authenticated, rpc])
  useEffect(() => {
    const element = dialog.current!
    const previous = document.activeElement
    element.showModal()
    return () => { element.close(); if (previous instanceof HTMLElement && previous.isConnected) previous.focus() }
  }, [])
  useEffect(() => { void refresh() }, [refresh])
  const shown = models?.filter(model => `${model.name} ${model.id}`.toLowerCase().includes(filter.toLowerCase())) ?? []
  return <dialog ref={dialog} aria-labelledby={title} onClose={onClose}
    style={{ width: 620, maxWidth: 'calc(100vw - 32px)', maxHeight: 'calc(100dvh - 32px)',
      boxSizing: 'border-box', border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 16,
      padding: 20, color: 'var(--dsw-alias-label-primary)', background: 'var(--dsw-alias-bg-layer-1)' }}>
    <div style={{ display: 'grid', gap: 12 }}>
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <h2 id={title} style={{ margin: 0, fontSize: 18 }}>{t('cursorManageTitle')}</h2>
        <button type="button" style={buttonStyle} autoFocus onClick={onClose}>{t('imageClose')}</button>
      </header>
      {!authenticated && <p style={{ margin: 0 }}>{t('cursorManageSignIn')}</p>}
      {authenticated && <>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' }}>{t('cursorManageHint')}</p>
        <div style={{ display: 'flex', gap: 8 }}>
          <input aria-label={t('cursorFilterModels')} placeholder={t('cursorFilterModels')}
            value={filter} onChange={event => setFilter(event.target.value)}
            style={{ flex: 1, minWidth: 0 }} />
          <button type="button" style={buttonStyle} disabled={loading} onClick={() => { void refresh(true) }}>{t('usageRefresh')}</button>
        </div>
        {loading && <p role="status" style={{ margin: 0 }}>{t('cursorModelsLoading')}</p>}
        {error && <p role="alert" style={{ margin: 0, color: 'var(--dsw-alias-state-error-primary)' }}>
          {t('cursorModelsError', { message: error })}</p>}
        {models && <p style={{ margin: 0, fontSize: 12 }}>{t('cursorModelsCount', { count: models.length })}</p>}
        <div style={{ display: 'grid', gap: 6, maxHeight: 420, overflowY: 'auto' }}>
          {shown.map(model => <div key={model.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12,
            padding: '6px 0', borderBottom: '1px solid var(--dsw-alias-border-l2)' }}>
            <span>{model.name}</span><code style={{ overflowWrap: 'anywhere' }}>{model.id}</code>
          </div>)}
        </div>
      </>}
    </div>
  </dialog>
}
