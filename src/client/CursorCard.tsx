import { useCallback, useEffect, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
import type { ProviderUsage, SubscriptionsSectionInjected } from './SubscriptionsSection.js'
import { callSubscriptionsAuth } from './subscriptions-rpc.js'
import { ProviderAccountManager } from './ProviderAccountManager.js'
import { USAGE_BADGE_REFRESH_EVENT } from './usage-badge-preferences.js'

type Translate = SubscriptionsSectionInjected['t']
type CursorStatus = { authenticated: boolean; busy: boolean; expiresAt?: number; error?: string }

const styles: Record<string, CSSProperties> = {
  card: { border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 12, padding: '12px 14px',
    display: 'flex', flexDirection: 'column', gap: 6, color: 'var(--dsw-alias-label-primary)' },
  header: { display: 'flex', alignItems: 'center', gap: 8 },
  dot: { width: 8, height: 8, borderRadius: '50%', flexShrink: 0 },
  name: { fontWeight: 500, fontSize: 14, lineHeight: '22px' },
  status: { margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)' },
  error: { margin: 0, fontSize: 12, lineHeight: '18px', color: 'var(--dsw-alias-state-error-primary)' },
  actions: { display: 'flex', gap: 8, marginTop: 4, alignItems: 'center', flexWrap: 'wrap' },
  button: { boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    height: 28, padding: '0 10px', borderRadius: 14, border: '1px solid var(--dsw-alias-border-l2)',
    background: 'transparent', color: 'var(--dsw-alias-label-primary)', font: 'inherit',
    fontSize: 12, lineHeight: '18px', cursor: 'pointer' },
  account: { display: 'flex', flexDirection: 'column', gap: 6, border: '1px solid var(--dsw-alias-border-l2)',
    borderRadius: 8, padding: '8px 10px', marginTop: 4 },
  accountHeader: { display: 'flex', alignItems: 'center', gap: 8 },
  accountName: { fontSize: 13, lineHeight: '20px' },
  usage: { display: 'flex', flexDirection: 'column', gap: 6, marginTop: 4,
    borderTop: '1px solid var(--dsw-alias-border-l2)', paddingTop: 8 },
  usageHeader: { display: 'flex', alignItems: 'center', gap: 8 },
  usageTitle: { fontSize: 12, lineHeight: '18px', fontWeight: 500, color: 'var(--dsw-alias-label-secondary)' },
  usageRefresh: { boxSizing: 'border-box', height: 22, padding: '0 8px', borderRadius: 11, marginLeft: 'auto',
    border: '1px solid var(--dsw-alias-border-l2)', background: 'transparent',
    color: 'var(--dsw-alias-label-secondary)', font: 'inherit', fontSize: 12, cursor: 'pointer' },
  usageRow: { display: 'flex', flexDirection: 'column', gap: 3 },
  usageMeta: { display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12,
    lineHeight: '18px', color: 'var(--dsw-alias-label-tertiary)' },
  usageTrack: { height: 6, borderRadius: 3, overflow: 'hidden', background: 'var(--dsw-alias-bg-layer-1)',
    border: '1px solid var(--dsw-alias-border-l2)' },
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function barColor(percent: number): string {
  if (percent >= 95) return 'var(--dsw-alias-state-error-primary)'
  if (percent >= 80) return 'var(--dsw-alias-state-warn-label)'
  return 'var(--dsw-alias-state-success-primary)'
}

/** Cursor's single connected account, rendered with the same card and Manage dialog as the other providers. */
export function CursorCard({ rpc, t }: { rpc: ConnectionHandle['rpc']; t: Translate }) {
  const [status, setStatus] = useState<CursorStatus>()
  const [usage, setUsage] = useState<ProviderUsage>()
  const [authorizeUrl, setAuthorizeUrl] = useState<string>()
  const [error, setError] = useState<string>()
  const [loading, setLoading] = useState(false)
  const [manage, setManage] = useState(false)
  const authenticated = useRef<boolean>()

  const refreshStatus = useCallback(async () => {
    try {
      const value = await callSubscriptionsAuth<CursorStatus>(rpc, 'cursorStatus', {})
      setStatus(value)
      if (authenticated.current !== value.authenticated) {
        authenticated.current = value.authenticated
        window.dispatchEvent(new Event(USAGE_BADGE_REFRESH_EVENT))
      }
      if (value.authenticated) setAuthorizeUrl(undefined)
      if (value.error) setError(value.error)
    } catch (failure) { setError(message(failure)) }
  }, [rpc])

  const refreshUsage = useCallback(async () => {
    setLoading(true)
    try {
      setUsage(await callSubscriptionsAuth<ProviderUsage>(rpc, 'cursorUsage', {}))
      setError(undefined)
      window.dispatchEvent(new Event(USAGE_BADGE_REFRESH_EVENT))
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
    if (!window.confirm(t('logoutAccountConfirm', { account: 'Cursor', provider: 'Cursor' }))) return
    try {
      await callSubscriptionsAuth(rpc, 'cursorLogout', {})
      setUsage(undefined)
      await refreshStatus()
    } catch (failure) { setError(message(failure)) }
  }

  const connected = status?.authenticated === true
  return <div style={styles.card}>
    <div style={styles.header}>
      <span style={{ ...styles.dot, background: status?.busy ? 'var(--dsw-alias-state-warn-label)'
        : connected ? 'var(--dsw-alias-state-success-primary)' : 'var(--dsw-alias-label-dimmed)' }} />
      <span style={styles.name}>{t('cursorTitle')}</span>
    </div>
    <p style={styles.status}>{status === undefined ? t('checking') : status.busy ? t('loginInProgress')
      : connected ? t('loggedInCount', { count: 1 }) : t('notLoggedIn')}</p>
    {error !== undefined && <p style={styles.error}>{error}</p>}
    {connected && <div style={styles.account}>
      <div style={styles.accountHeader}>
        <span style={{ color: 'var(--dsw-alias-state-warn-label)' }} title={t('defaultBadge')}>★</span>
        <span style={styles.accountName}>Cursor</span>
        {status.expiresAt !== undefined && <span style={styles.status}>
          {t('accountExpires', { date: new Date(status.expiresAt).toLocaleString() })}</span>}
        <button type="button" style={{ ...styles.button, marginLeft: 'auto', flexShrink: 0 }}
          onClick={() => { void logout() }}>{t('logout')}</button>
      </div>
      <div style={styles.usage}>
        <div style={styles.usageHeader}>
          <span style={styles.usageTitle}>{t('usageTitle')}</span>
          {usage?.plan !== undefined && <span style={styles.status}>{t('usagePlan', { plan: usage.plan })}</span>}
          <button type="button" style={styles.usageRefresh} disabled={loading}
            onClick={() => { void refreshUsage() }}>{t('usageRefresh')}</button>
        </div>
        {loading && usage === undefined && <p style={styles.status}>{t('usageLoading')}</p>}
        {usage?.windows?.length === 0 && <p style={styles.status}>{t('usageEmpty')}</p>}
        {usage?.windows?.map((window, index) => {
          const percent = Math.min(100, Math.max(0, window.usedPercent))
          const label = window.scope === 'Included' ? t('cursorIncluded')
            : window.scope === 'Cursor Models' ? t('cursorModels')
              : window.scope === 'Other Models' ? t('cursorOtherModels')
                : window.scope === 'Included requests' ? t('cursorIncludedRequests')
                  : window.scope ?? t('usageWindow')
          return <div key={index} style={styles.usageRow}>
            <div style={styles.usageMeta}>
              <span>{label}</span>
              <span>{Math.round(percent)}%{window.resetsAt === undefined ? ''
                : ` · ${t('usageResets', { date: new Date(window.resetsAt).toLocaleString() })}`}</span>
            </div>
            <div style={styles.usageTrack}>
              <div style={{ width: `${percent}%`, height: '100%', borderRadius: 3, background: barColor(percent) }} />
            </div>
          </div>
        })}
      </div>
    </div>}
    <div style={styles.actions}>
      {status?.authenticated === false && !status.busy && <button type="button" style={styles.button}
        onClick={() => { void login() }}>{t('login')}</button>}
      <button type="button" style={styles.button} aria-haspopup="dialog" onClick={() => setManage(true)}>
        {t('accountsManage')}
      </button>
      {status?.busy === true && <button type="button" style={styles.button}
        onClick={() => { void cancel() }}>{t('cancel')}</button>}
    </div>
    {status?.busy === true && authorizeUrl !== undefined && <a href={authorizeUrl}
      target="_blank" rel="noopener noreferrer">{t('cursorOpenLogin')}</a>}
    {manage && <ProviderAccountManager provider="cursor-subscription" name="Cursor" rpc={rpc} t={t}
      onClose={() => setManage(false)} />}
  </div>
}
