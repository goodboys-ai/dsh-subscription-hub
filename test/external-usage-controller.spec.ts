import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ExternalUsageController } from '../src/providers/external-usage-controller.js'

test('usage-only status reports configured refs without returning their values', async () => {
  const refs = new Map([['OPENCODE_GO_API_KEY', 'go-secret']])
  const controller = new ExternalUsageController(async name => {
    const value = refs.get(name)
    return value === undefined ? undefined : { value }
  })
  assert.deepEqual(await controller.status(), {
    'opencode-go': { configured: true },
    'kimi-code': { configured: false },
  })
  assert.ok(!JSON.stringify(await controller.status()).includes('go-secret'))
  await assert.rejects(() => controller.usage('kimi-code'), /not configured/)
})

test('Kimi Code resolves the credential name used by the DSH base install', async () => {
  const seen: string[] = []
  const controller = new ExternalUsageController(async name => {
    seen.push(name)
    return name === 'KIMI_CODING_API_KEY' ? { value: 'kimi-secret' } : undefined
  })
  assert.deepEqual((await controller.status())['kimi-code'], { configured: true })
  assert.ok(seen.includes('KIMI_CODING_API_KEY'))
  assert.ok(!JSON.stringify(await controller.status()).includes('kimi-secret'))
})

test('usage-only keys are resolved on every read so DSH credential changes take effect', async () => {
  let key = 'first'
  const headers: string[] = []
  const http = (async (_url: string | URL | Request, init?: RequestInit) => {
    headers.push((init?.headers as Record<string, string>).authorization)
    return Response.json({ usage: { rolling: { percent: 10 } } })
  }) as typeof fetch
  const controller = new ExternalUsageController(async () => ({ value: key }), http)
  await controller.usage('opencode-go')
  key = 'second'
  await controller.usage('opencode-go')
  assert.deepEqual(headers, ['Bearer first', 'Bearer second'])
})
