/** Usage readers for subscriptions whose model adapters are built into DSH. */

import type { ProviderUsage, UsageWindow } from './common.js'

type HttpFetch = typeof fetch

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : undefined
}

function percent(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100
    ? value
    : undefined
}

function resetTime(value: unknown): number | undefined {
  if (typeof value !== 'string') return undefined
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : undefined
}

async function getUsage(url: string, apiKey: string, http: HttpFetch, signal?: AbortSignal): Promise<unknown> {
  const response = await http(url, {
    headers: { accept: 'application/json', authorization: `Bearer ${apiKey}` },
    ...(signal === undefined ? {} : { signal }),
  })
  if (!response.ok) throw new Error(`Usage endpoint returned HTTP ${response.status}`)
  return response.json()
}

/** Read the three account-wide OpenCode Go windows from its Go gateway. */
export async function fetchOpenCodeGoUsage(
  apiKey: string,
  http: HttpFetch = fetch,
  signal?: AbortSignal,
): Promise<ProviderUsage> {
  const body = record(await getUsage('https://opencode.ai/zen/go/v1/usage', apiKey, http, signal))
  const usage = record(body?.usage)
  if (usage === undefined) throw new Error('OpenCode Go usage response has no usage object')

  const windows: UsageWindow[] = []
  for (const [field, kind, scope] of [
    ['rolling', 'session', undefined],
    ['weekly', 'weekly', undefined],
    ['monthly', 'other', 'Monthly'],
  ] as const) {
    const value = record(usage[field])
    const usedPercent = percent(value?.percent)
    if (usedPercent === undefined) continue
    const resetsAt = resetTime(value?.resetsAt)
    windows.push({
      kind,
      ...(scope === undefined ? {} : { scope }),
      usedPercent,
      ...(resetsAt === undefined ? {} : { resetsAt }),
    })
  }
  if (windows.length === 0) throw new Error('OpenCode Go usage response has no valid windows')
  return { supported: true, windows, plan: 'OpenCode Go' }
}

/** Read the Kimi Code plan windows using the same API as the Kimi Code CLI. */
export async function fetchKimiCodeUsage(
  apiKey: string,
  http: HttpFetch = fetch,
  signal?: AbortSignal,
): Promise<ProviderUsage> {
  const body = record(await getUsage('https://api.kimi.com/coding/v1/usages', apiKey, http, signal))
  if (body === undefined) throw new Error('Kimi Code usage response is not an object')
  const usages = record(body.usages)
  if (usages === undefined) throw new Error('Kimi Code usage response has no usages object')

  const windows: UsageWindow[] = []
  for (const [field, kind, scope] of [
    ['limit_5h', 'session', undefined],
    ['limit_7d', 'weekly', undefined],
    ['limit_month_total', 'other', 'Monthly'],
  ] as const) {
    const value = record(usages[field])
    const ratio = value?.used_ratio ?? value?.usedRatio
    if (typeof ratio !== 'number' || !Number.isFinite(ratio) || ratio < 0 || ratio > 1) continue
    const resetsAt = resetTime(value?.reset_time ?? value?.resetAt)
    windows.push({
      kind,
      ...(scope === undefined ? {} : { scope }),
      usedPercent: ratio * 100,
      ...(resetsAt === undefined ? {} : { resetsAt }),
    })
  }
  return { supported: true, windows, plan: 'Kimi Code' }
}
