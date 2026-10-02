import type { ProviderUsage, UsageWindow } from './common.js'

/** MiniMax subscription quota, not the balance API for sk-api-* inference keys. */
export async function fetchMiniMaxUsage(
  key: string, region: 'global' | 'cn', http: typeof fetch = fetch, signal?: AbortSignal,
): Promise<ProviderUsage> {
  if (key.startsWith('sk-api-')) throw new Error('MiniMax requires a subscription key, not a pay-as-you-go key')
  const response = await http(`https://www.minimax.${region === 'cn' ? 'cn' : 'io'}/v1/token_plan/remains`, {
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    ...(signal === undefined ? {} : { signal }),
  })
  if (!response.ok) throw new Error(`MiniMax usage endpoint returned HTTP ${response.status}`)
  const body = await response.json() as { base_resp?: { status_code?: number }; model_remains?: unknown[] }
  if ((body?.base_resp?.status_code !== undefined && body.base_resp.status_code !== 0) || !Array.isArray(body?.model_remains)) {
    throw new Error('MiniMax usage response failed or has no quota records')
  }
  const windows: UsageWindow[] = []
  for (const raw of body.model_remains) {
    if (raw === null || typeof raw !== 'object') continue
    const row = raw as Record<string, unknown>
    if (typeof row.model_name !== 'string') continue
    for (const [prefix, startKey, endKey, fallback] of [
      ['current_interval', 'start_time', 'end_time', 'session'],
      ['current_weekly', 'weekly_start_time', 'weekly_end_time', 'weekly'],
    ] as const) {
      const status = row[`${prefix}_status`]
      if (status === 3) continue // Unlimited pools cannot have a finite percentage.
      const remaining = row[`${prefix}_remaining_percent`]
      const boost = prefix === 'current_weekly' ? row.weekly_boost_permille ?? 1000 : 1000
      if (typeof boost !== 'number' || !Number.isFinite(boost) || boost <= 0) continue
      const total = row[`${prefix}_total_count`]
      const count = row[`${prefix}_usage_count`]
      if (typeof total !== 'number' || !Number.isFinite(total) || total <= 0) continue
      // Official CLI compatibility: absent percentages use legacy remaining counts.
      const usedPercent = typeof remaining === 'number' ? 100 - remaining * boost / 1000
        : typeof total === 'number' && total > 0 && typeof count === 'number' ? (1 - count / total) * 100 : undefined
      if (usedPercent === undefined || !Number.isFinite(usedPercent) || usedPercent < 0 || usedPercent > 100) continue
      const start = row[startKey]
      const end = row[endKey]
      const validBounds = typeof start === 'number' && Number.isFinite(start) && start > 0
        && typeof end === 'number' && Number.isFinite(end) && end > start
      windows.push({ kind: fallback === 'session' && validBounds && end - start !== 18_000_000 ? 'other' : fallback,
        scope: row.model_name, usedPercent,
        ...(validBounds ? { startsAt: start, resetsAt: end } : {}),
      })
    }
  }
  if (!windows.length) throw new Error('MiniMax has no supported finite quota windows')
  return { supported: true, plan: 'MiniMax', windows }
}
