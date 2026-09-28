import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CURSOR_CREDENTIAL_REF, CursorAuth } from '../src/providers/cursor-auth.js'
import type { CursorCredentialService } from '../src/providers/cursor-auth.js'

function jwt(exp: number): string {
  return `header.${Buffer.from(JSON.stringify({ sub: 'user_123', exp })).toString('base64url')}.signature`
}

function memoryStore(initial?: string): CursorCredentialService & { value: string | undefined } {
  return {
    value: initial,
    async resolve(ref) { assert.equal(ref, CURSOR_CREDENTIAL_REF); return this.value === undefined ? undefined : { value: this.value } },
    async set(ref, value) { assert.equal(ref, CURSOR_CREDENTIAL_REF); this.value = value },
    async unset(ref) { assert.equal(ref, CURSOR_CREDENTIAL_REF); this.value = undefined },
  }
}

test('Cursor auth refreshes an expiring session once and never returns stored tokens in status', async () => {
  const store = memoryStore(JSON.stringify({ type: 'oauth', access: jwt(1001), refresh: 'refresh-secret', expires: 1001_000 }))
  let requests = 0
  const http = (async (url: string | URL | Request, init?: RequestInit) => {
    requests++
    assert.equal(url, 'https://api2.cursor.sh/auth/exchange_user_api_key')
    assert.equal((init?.headers as Record<string, string>).authorization, 'Bearer refresh-secret')
    return Response.json({ accessToken: jwt(2000), refreshToken: 'next-refresh' })
  }) as typeof fetch
  const auth = new CursorAuth(store, http, () => 1000_000)
  assert.deepEqual(await Promise.all([auth.accessToken(), auth.accessToken()]), [jwt(2000), jwt(2000)])
  assert.equal(requests, 1)
  const status = await auth.status()
  assert.deepEqual(status, { authenticated: true, busy: false, expiresAt: 2000_000 })
  assert.ok(!JSON.stringify(status).includes('refresh-secret'))
  await auth.logout()
  assert.deepEqual(await auth.status(), { authenticated: false, busy: false })
})

test('Cursor browser login creates only a cursor.com URL and can be cancelled', async () => {
  const store = memoryStore()
  const auth = new CursorAuth(store, (async () => { throw new Error('poll should not run before cancellation') }) as typeof fetch)
  const { authorizeUrl } = await auth.login()
  const url = new URL(authorizeUrl)
  assert.equal(url.origin, 'https://cursor.com')
  assert.equal(url.pathname, '/loginDeepControl')
  assert.equal(url.searchParams.get('mode'), 'login')
  assert.ok(url.searchParams.has('challenge'))
  assert.equal((await auth.status()).busy, true)
  await auth.cancel()
  assert.equal((await auth.status()).busy, false)
  assert.equal(store.value, undefined)
})

test('an in-flight refresh cannot return a token after sign-out', async () => {
  const store = memoryStore(JSON.stringify({ type: 'oauth', access: jwt(1001), refresh: 'old-refresh', expires: 1001_000 }))
  let answer: ((response: Response) => void) | undefined
  const http = (async () => new Promise<Response>(resolve => { answer = resolve })) as typeof fetch
  const auth = new CursorAuth(store, http, () => 1000_000)
  const pending = auth.accessToken()
  await new Promise(resolve => setTimeout(resolve, 0))
  await auth.logout()
  assert.ok(answer)
  answer(Response.json({ accessToken: jwt(2000), refreshToken: 'new-refresh' }))
  await assert.rejects(pending, /signed out during token refresh/)
  assert.equal(store.value, undefined)
})
