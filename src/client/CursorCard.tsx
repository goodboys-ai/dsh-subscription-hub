import { useCallback, useEffect, useState } from 'react'
import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
import type { ProviderUsage, SubscriptionsSectionInjected } from './SubscriptionsSection.js'
import { callSubscriptionsAuth } from './subscriptions-rpc.js'

type Translate = SubscriptionsSectionInjected['t']
type CursorStatus = { authenticated: boolean; busy: boolean; expiresAt?: number; error?: string }

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
    color: 'var(--dsw-alias-label-primary)' }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <strong>{t('cursorTitle')}</strong>
      {status?.authenticated === true && <span style={{ color: 'var(--dsw-alias-state-success-primary)' }}>
        {t('cursorConnected')}
      </span>}
      {status?.authenticated === true && <button type="button" style={{ marginLeft: 'auto' }}
        onClick={() => { void logout() }}>{t('cursorDisconnect')}</button>}
    </div>
    {status === undefined && <p>{t('usageLoading')}</p>}
    {status?.authenticated === false && status.busy === false && <button type="button"
      onClick={() => { void login() }}>{t('cursorConnect')}</button>}
    {status?.busy === true && <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
      <span>{t('cursorWaiting')}</span>
      {authorizeUrl !== undefined && <a href={authorizeUrl} target="_blank" rel="noopener noreferrer">
        {t('cursorOpenLogin')}
      </a>}
      <button type="button" onClick={() => { void cancel() }}>{t('cancel')}</button>
    </div>}
    {error !== undefined && <p style={{ color: 'var(--dsw-alias-state-error-primary)' }}>
      {t('usageError', { message: error })}
    </p>}
    {status?.authenticated === true && <div style={{ marginTop: 12 }}>
      <button type="button" disabled={loading} onClick={() => { void refreshUsage() }}>{t('usageRefresh')}</button>
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
  </div>
}
