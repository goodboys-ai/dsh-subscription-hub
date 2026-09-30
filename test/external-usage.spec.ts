import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fetchKimiCodeUsage, fetchOpenCodeGoUsage } from '../src/providers/external-usage.js'

test('OpenCode Go usage maps all three windows and sends the key only upstream', async () => {
  const http = (async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(url, 'https://opencode.ai/zen/go/v1/usage')
    assert.equal((init?.headers as Record<string, string>).authorization, 'Bearer secret')
    return Response.json({ usage: {
      rolling: { status: 'ok', percent: 25, resetsAt: '2026-09-28T08:00:00Z' },
      weekly: { status: 'ok', percent: 50, resetsAt: '2026-10-01T00:00:00Z' },
      monthly: { status: 'ok', percent: 75, resetsAt: '2026-10-28T00:00:00Z' },
    } })
  }) as typeof fetch
  assert.deepEqual(await fetchOpenCodeGoUsage('secret', http), {
    supported: true,
    plan: 'OpenCode Go',
    windows: [
      { kind: 'session', usedPercent: 25, resetsAt: Date.parse('2026-09-28T08:00:00Z') },
      { kind: 'weekly', usedPercent: 50, resetsAt: Date.parse('2026-10-01T00:00:00Z') },
      { kind: 'other', scope: 'Monthly', usedPercent: 75, resetsAt: Date.parse('2026-10-28T00:00:00Z') },
    ],
  })
})

test('OpenCode Go HTTP errors do not disclose the key', async () => {
  const http = (async () => new Response('', { status: 401 })) as typeof fetch
  await assert.rejects(() => fetchOpenCodeGoUsage('go-secret', http), error => {
    assert.ok(error instanceof Error)
    assert.match(error.message, /HTTP 401/)
    assert.ok(!error.message.includes('go-secret'))
    return true
  })
})

test('OpenCode Go rejects a malformed response instead of showing empty quota', async () => {
  const http = (async () => Response.json({ usage: { rolling: { percent: '25' } } })) as typeof fetch
  await assert.rejects(() => fetchOpenCodeGoUsage('secret', http), /no valid windows/)
})

test('Kimi Code usage maps present ratio pools and tolerates absent windows', async () => {
  const http = (async (url: string | URL | Request, init?: RequestInit) => {
    assert.equal(url, 'https://api.kimi.com/coding/v1/usages')
    assert.equal((init?.headers as Record<string, string>).authorization, 'Bearer sk-kimi-secret')
    return Response.json({ usages: {
      limit_5h: { used_ratio: 0, reset_time: '2026-09-28T08:00:00Z' },
      limit_month_total: { used_ratio: 0.42, reset_time: '2026-10-17T00:00:00Z' },
      limit_month_code: { used_ratio: 0.7, reset_time: '2026-10-17T00:00:00Z' },
    } })
  }) as typeof fetch
  assert.deepEqual(await fetchKimiCodeUsage('sk-kimi-secret', http), {
    supported: true,
    plan: 'Kimi Code',
    windows: [
      { kind: 'session', usedPercent: 0, resetsAt: Date.parse('2026-09-28T08:00:00Z') },
      { kind: 'other', scope: 'Monthly', usedPercent: 42, resetsAt: Date.parse('2026-10-17T00:00:00Z') },
    ],
  })
})

test('Kimi Code HTTP errors do not disclose the key', async () => {
  const http = (async () => new Response('', { status: 401 })) as typeof fetch
  await assert.rejects(() => fetchKimiCodeUsage('sk-kimi-secret', http), error => {
    assert.ok(error instanceof Error)
    assert.match(error.message, /HTTP 401/)
    assert.ok(!error.message.includes('secret'))
    return true
  })
})
