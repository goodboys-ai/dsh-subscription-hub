import { useCallback, useEffect, useState } from 'react'
import type { ConnectionHandle } from '@deepseek-ai/dsh-api-remotes/client'
import type { ProviderUsage, SubscriptionsSectionInjected } from './SubscriptionsSection.js'
import { callSubscriptionsAuth } from './subscriptions-rpc.js'

type Source = 'opencode-go' | 'kimi-code'
type Translate = SubscriptionsSectionInjected['t']

const SOURCES: readonly { id: Source; name: string }[] = [
  { id: 'opencode-go', name: 'OpenCode Go' },
  { id: 'kimi-code', name: 'Kimi Code' },
]

type Status = Record<Source, { configured: boolean }>

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function barColor(percent: number): string {
  if (percent >= 95) return 'var(--dsw-alias-state-error-primary)'
  if (percent >= 80) return 'var(--dsw-alias-state-warn-label)'
  return 'var(--dsw-alias-state-success-primary)'
}

/** Quota cards for API-key providers already available through DSH itself. */
export function ExternalUsageCards({ rpc, t }: { rpc: ConnectionHandle['rpc']; t: Translate }) {
  const [status, setStatus] = useState<Status>()
  const [statusError, setStatusError] = useState<string>()
  const [usage, setUsage] = useState<Partial<Record<Source, ProviderUsage>>>({})
  const [errors, setErrors] = useState<Partial<Record<Source, string>>>({})
  const [loading, setLoading] = useState<Partial<Record<Source, boolean>>>({})

  const refresh = useCallback(async (source: Source) => {
    setLoading(prev => ({ ...prev, [source]: true }))
    setErrors(prev => ({ ...prev, [source]: undefined }))
    try {
      const value = await callSubscriptionsAuth<ProviderUsage>(rpc, 'externalUsage', { source })
      setUsage(prev => ({ ...prev, [source]: value }))
    } catch (error) {
      setErrors(prev => ({ ...prev, [source]: errorText(error) }))
    } finally {
      setLoading(prev => ({ ...prev, [source]: false }))
    }
  }, [rpc])

  useEffect(() => {
    let cancelled = false
    void callSubscriptionsAuth<Status>(rpc, 'externalStatus', {}).then(value => {
      if (cancelled) return
      setStatus(value)
      for (const { id } of SOURCES) if (value[id]?.configured) void refresh(id)
    }, error => {
      if (!cancelled) setStatusError(errorText(error))
    })
    return () => { cancelled = true }
  }, [rpc, refresh])

  return <section style={{ display: 'grid', gap: 12 }}>
    <strong style={{ color: 'var(--dsw-alias-label-primary)' }}>{t('externalUsageTitle')}</strong>
    {statusError !== undefined && <p style={{ color: 'var(--dsw-alias-state-error-primary)' }}>
      {t('externalUsageUnavailable', { message: statusError })}
    </p>}
    {SOURCES.map(({ id, name }) => {
      const configured = status?.[id]?.configured === true
      const snapshot = usage[id]
      return <div key={id} style={{
        border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 12, padding: '12px 14px',
        color: 'var(--dsw-alias-label-primary)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <strong>{name}</strong>
          {configured && <button type="button" style={{ marginLeft: 'auto' }}
            disabled={loading[id] === true} onClick={() => { void refresh(id) }}>
            {t('usageRefresh')}
          </button>}
        </div>
        {status === undefined && statusError === undefined && <p>{t('usageLoading')}</p>}
        {status !== undefined && !configured && <p>{t('externalUsageConfigure')}</p>}
        {configured && loading[id] === true && snapshot === undefined && <p>{t('usageLoading')}</p>}
        {errors[id] !== undefined && <p style={{ color: 'var(--dsw-alias-state-error-primary)' }}>
          {t('usageError', { message: errors[id] })}
        </p>}
        {configured && snapshot?.windows?.length === 0 && <p>{t('usageEmpty')}</p>}
        {snapshot?.windows?.map((window, index) => {
          const percent = Math.min(100, Math.max(0, window.usedPercent))
          const label = window.kind === 'session' ? t('usageSession')
            : window.kind === 'weekly' ? t('usageWeekly') : window.scope ?? t('usageWindow')
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
      </div>
    })}
  </section>
}
