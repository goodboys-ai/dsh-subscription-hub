import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fetchMiniMaxUsage } from '../src/providers/minimax-usage.js'

const row = { model_name: 'MiniMax-M*', start_time: 2_000_000_000_000, end_time: 2_000_018_000_000,
  current_interval_total_count: 100, current_interval_usage_count: 25 }
const http = (model: object, status_code = 0) => (async () => Response.json({ base_resp: { status_code }, model_remains: [model] })) as typeof fetch

test('MiniMax legacy remaining counts retain model scope and explicit millisecond bounds', async () => {
  const usage = await fetchMiniMaxUsage('subscription-key', 'global', http(row))
  assert.deepEqual(usage.windows, [{ kind: 'session', scope: 'MiniMax-M*', usedPercent: 75,
    startsAt: row.start_time, resetsAt: row.end_time }])
})
test('MiniMax explicit percentages win over ambiguous count semantics', async () => {
  const usage = await fetchMiniMaxUsage('key', 'cn', http({ ...row, current_interval_remaining_percent: 25 }))
  assert.equal(usage.windows![0]!.usedPercent, 75)
})
test('MiniMax does not fabricate finite bars for boosted/unlimited pools', async () => {
  await assert.rejects(fetchMiniMaxUsage('key', 'global', http({ ...row, current_interval_total_count: 0, current_interval_remaining_percent: 0 })), /no supported finite/)
  await assert.rejects(fetchMiniMaxUsage('key', 'global', http({ ...row, current_interval_status: 3 })), /no supported finite/)
  await assert.rejects(fetchMiniMaxUsage('key', 'global', http({ ...row, current_interval_remaining_percent: 150 })), /no supported finite/)
})
test('MiniMax rejects business errors and pay-as-you-go keys without leaking credentials', async () => {
  await assert.rejects(fetchMiniMaxUsage('key', 'global', http(row, 1001)), /failed/)
  await assert.rejects(fetchMiniMaxUsage('sk-api-secret', 'global', http(row)), /subscription key/)
})
test('MiniMax accepts the official bare response and resolves weekly boosts', async () => {
  const weekly = { ...row, current_weekly_total_count: 100, current_weekly_remaining_percent: 50,
    weekly_boost_permille: 1500, weekly_start_time: row.start_time, weekly_end_time: row.start_time + 604_800_000 }
  const bare = (async () => Response.json({ model_remains: [weekly] })) as typeof fetch
  const usage = await fetchMiniMaxUsage('key', 'global', bare)
  assert.equal(usage.windows![1]!.usedPercent, 25)
  const over = await fetchMiniMaxUsage('key', 'global', http({ ...weekly, current_weekly_remaining_percent: 80 }))
  assert.equal(over.windows!.length, 1)
})

test('MiniMax region controls a fixed allowlisted endpoint', async () => {
  const fetcher = (async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(url, 'https://www.minimax.cn/v1/token_plan/remains')
    assert.equal((init!.headers as Record<string, string>).authorization, 'Bearer secret')
    return Response.json({ base_resp: { status_code: 0 }, model_remains: [row] })
  }) as typeof fetch
  await fetchMiniMaxUsage('secret', 'cn', fetcher)
})
