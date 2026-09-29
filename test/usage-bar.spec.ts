/**
 * One signed-in profile, one fetch router, the real plugin.
 *
 * The usage bar is a single roster: OAuth sessions, the Cursor credential,
 * and the OpenCode Go and Kimi keys are read together, then each account's
 * usage endpoint is called. This file stands all of those up at once and
 * checks the bar text. Copilot is signed in too, and stays off the bar,
 * because the plugin has no Copilot usage fetcher.
 *
 * The usage URLs below are literals. They are not imported from `src/`, so
 * a renamed production constant that the fetcher no longer calls fails here.
 */
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mock, test } from 'node:test'
import type { ProviderId } from '../src/auth/store.js'
import type { BadgeProvider, ProviderUsageDisplay } from '../src/client/SubscriptionUsageBadge.js'

process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'dsh-usage-bar-'))

const FAR = Date.now() + 24 * 60 * 60_000

/** Distinct percents so a swapped endpoint fails the pill text. */
const USED = {
  codex: 11,
  claude: 22,
  grok: 33,
  antigravity: 44,
  cursor: 55,
  opencode: 66,
  kimi: 77,
} as const

const CODEX_URL = 'https://chatgpt.com/backend-api/wham/usage'
const CLAUDE_URL = 'https://api.anthropic.com/api/oauth/usage'
const GROK_URL = 'https://cli-chat-proxy.grok.com/v1/billing?format=credits'
const ANTIGRAVITY_MODELS_URL = 'https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels'
const ANTIGRAVITY_TIER_URL = 'https://daily-cloudcode-pa.googleapis.com/v1internal:loadCodeAssist'
const CURSOR_SUMMARY_URL = 'https://cursor.com/api/usage-summary'
const OPENCODE_URL = 'https://opencode.ai/zen/go/v1/usage'
const KIMI_URL = 'https://api.kimi.com/coding/v1/usages'

interface SeenCall {
  url: string
  authorization: string | null
}

test('every signed-in usage account shows up in the bar', async (t) => {
  const seen: SeenCall[] = []
  mock.method(globalThis, 'fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input)
    const authorization = new Headers(init?.headers).get('authorization')
    seen.push({ url, authorization })
    const body = fixtureFor(url)
    if (body === undefined) return new Response('not a usage fixture', { status: 404 })
    return Response.json(body)
  })
  t.after(() => { mock.restoreAll() })

  const { saveAccountSession } = await import('../src/auth/store.js')
  await saveAccountSession('codex', 'codex-acct', {
    accessToken: 'codex-access',
    refreshToken: 'refresh',
    expiresAt: FAR,
    accountId: 'codex-acct',
  })
  await saveAccountSession('claude', 'claude@example.invalid', {
    accessToken: 'claude-access',
    refreshToken: 'refresh',
    expiresAt: FAR,
    scopes: 'user:inference',
    emailAddress: 'claude@example.invalid',
  })
  await saveAccountSession('grok', 'grok@example.invalid', {
    accessToken: 'grok-access',
    refreshToken: 'refresh',
    expiresAt: FAR,
    tokenEndpoint: 'https://auth.grok.example/token',
    account: 'grok@example.invalid',
  })
  await saveAccountSession('antigravity', 'anti@example.invalid', {
    accessToken: 'antigravity-access',
    refreshToken: 'refresh',
    expiresAt: FAR,
    projectId: 'project-bar',
    account: 'anti@example.invalid',
  })
  await saveAccountSession('copilot', 'copilot-user', {
    accessToken: 'copilot-access',
    refreshToken: 'refresh',
    expiresAt: FAR,
    account: 'copilot-user',
  })

  const plugin = await import('../src/index.js')
  const { Context } = await import('@deepseek-ai/cordis')
  const { createFakeConnection } = await import('./fake-connection.js')
  const ctx = new Context()
  const fake = createFakeConnection()
  ctx.provide('llm', {
    registerAdapter() {
      return { replace() { /* the bar never calls the model */ } }
    },
  } as never)
  ctx.provide('connection', fake.connection)
  ctx.provide('credentials', {
    resolve: async (ref: string) => {
      if (ref === 'OPENCODE_GO_API_KEY') return { value: 'go-secret' }
      if (ref === 'KIMI_CODING_API_KEY') return { value: 'kimi-secret' }
      if (ref === 'CURSOR_SUBSCRIPTION_OAUTH') {
        return { value: cursorCredential() }
      }
      return undefined
    },
  } as never)
  ctx.plugin(plugin, {
    providers: ['codex', 'claude', 'grok', 'copilot', 'antigravity'] satisfies ProviderId[],
  })
  await new Promise((resolve) => { setTimeout(resolve, 50) })
  assert.ok(fake.registered(), 'the subscriptions-auth routes were registered')
  t.after(() => ctx.fiber.dispose())

  // The badge module imports host UI primitives that pull browser-only
  // packages. This test only uses the roster and pill helpers.
  const primitivesStub = `data:text/javascript,${encodeURIComponent(`
    export const IconDataOutlineRegular = () => null
    export const useAnchoredPosition = () => ({})
    export const useDismissOnOutsidePointer = () => {}
  `)}`
  const { registerHooks } = await import('node:module')
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      return specifier === '@deepseek-ai/dsh-client-ui-primitives'
        ? { url: primitivesStub, shortCircuit: true }
        : nextResolve(specifier, context)
    },
    load(url, context, nextLoad) {
      return url.endsWith('.css')
        ? { format: 'module', source: 'export default {}', shortCircuit: true }
        : nextLoad(url, context)
    },
  })
  t.after(() => { hooks.deregister() })

  const {
    collapsedDisplays,
    compactSegment,
    expandedDisplays,
    loadBadgeRoster,
    usageOf,
  } = await import('../src/client/SubscriptionUsageBadge.js')
  const rpc = {
    call: async (_channel: string, method: string, payload: unknown) => (
      fake.handler(method.replace(/^subscriptions-auth\./, ''), payload, new AbortController().signal)
    ),
  }
  const { roster, refreshed } = await loadBadgeRoster(rpc as never)
  assert.deepEqual([...refreshed].sort(), [
    'antigravity',
    'claude',
    'codex',
    'copilot',
    'cursor-subscription',
    'grok',
    'kimi-coding',
    'opencode-go',
  ])
  assert.deepEqual(roster.map((entry) => entry.provider), [
    'codex',
    'claude',
    'grok',
    'copilot',
    'antigravity',
    'cursor-subscription',
    'opencode-go',
    'kimi-coding',
  ])

  const displays: ProviderUsageDisplay[] = []
  for (const entry of roster) {
    const usage = await usageOf(rpc as never, entry)
    if (!usage.supported || usage.windows === undefined || usage.windows.length === 0) continue
    displays.push({
      provider: entry.provider,
      name: BAR_NAMES[entry.provider],
      accounts: [{
        key: entry.account.key,
        isDefault: entry.account.isDefault,
        windows: usage.windows,
        ...(entry.account.account === undefined ? {} : { account: entry.account.account }),
        ...(usage.plan === undefined ? {} : { plan: usage.plan }),
      }],
    })
  }

  assert.deepEqual(displays.map((row) => row.provider), [
    'codex',
    'claude',
    'grok',
    'antigravity',
    'cursor-subscription',
    'opencode-go',
    'kimi-coding',
  ])
  assert.equal(displays.some((row) => row.provider === 'copilot'), false)
  assert.deepEqual(displays.map((row) => Math.round(row.accounts[0]?.windows[0]?.usedPercent ?? NaN)), [
    USED.codex,
    USED.claude,
    USED.grok,
    USED.antigravity,
    USED.cursor,
    USED.opencode,
    USED.kimi,
  ])

  assert.deepEqual(collapsedDisplays(displays, 'claude').map((row) => row.provider), ['claude'])
  assert.deepEqual(expandedDisplays(displays, 'claude').map((row) => row.provider), [
    'claude',
    'codex',
    'grok',
    'antigravity',
    'cursor-subscription',
    'opencode-go',
    'kimi-coding',
  ])
  assert.deepEqual(displays.map((row) => compactSegment(
    row,
    row.provider === 'antigravity' ? 'gemini-bar' : undefined,
  )), [
    `Codex 5h ${USED.codex}%`,
    `Claude 5h ${USED.claude}%`,
    `Grok W ${USED.grok}%`,
    `Antigravity Window ${USED.antigravity}%`,
    `Cursor Included ${USED.cursor}%`,
    `OpenCode Go 5h ${USED.opencode}%`,
    `Kimi Code 5h ${USED.kimi}%`,
  ])

  const rendered = JSON.stringify(displays)
  for (const secret of ['codex-access', 'claude-access', 'grok-access', 'antigravity-access', 'copilot-access', 'go-secret', 'kimi-secret', 'cursor-access']) {
    assert.equal(rendered.includes(secret), false, secret)
  }
  assert.equal(authorizationFor(seen, CODEX_URL), 'Bearer codex-access')
  assert.equal(authorizationFor(seen, CLAUDE_URL), 'Bearer claude-access')
  assert.equal(authorizationFor(seen, GROK_URL), 'Bearer grok-access')
  assert.equal(authorizationFor(seen, ANTIGRAVITY_MODELS_URL), 'Bearer antigravity-access')
  assert.equal(authorizationFor(seen, OPENCODE_URL), 'Bearer go-secret')
  assert.equal(authorizationFor(seen, KIMI_URL), 'Bearer kimi-secret')
  assert.equal(seen.some((call) => call.url === ANTIGRAVITY_TIER_URL), true)
  assert.equal(seen.some((call) => call.url.startsWith(CURSOR_SUMMARY_URL)), true)
  assert.equal(seen.some((call) => call.url.includes('githubcopilot.com')), false)
})

/** Labels the badge prints. Kept here so the pill assertion is the bar text. */
const BAR_NAMES: Record<BadgeProvider, string> = {
  codex: 'Codex',
  claude: 'Claude',
  grok: 'Grok',
  copilot: 'Copilot',
  antigravity: 'Antigravity',
  'cursor-subscription': 'Cursor',
  'opencode-go': 'OpenCode Go',
  'kimi-coding': 'Kimi Code',
}

/** Cursor's credential is a JWT whose `sub` is the dashboard user id. */
function cursorCredential(): string {
  const payload = Buffer.from(JSON.stringify({ sub: 'auth0|user_bar' })).toString('base64url')
  return JSON.stringify({
    type: 'oauth',
    access: `header.${payload}.cursor-access`,
    refresh: 'cursor-refresh',
    expires: FAR,
  })
}

/**
 * Canned usage body for one fixture URL.
 * @param url - the request URL the plugin asked for.
 * @returns the JSON body, or undefined when this URL is not a usage fixture.
 */
function fixtureFor(url: string): unknown {
  if (url === CODEX_URL) {
    return {
      plan_type: 'plus',
      rate_limit: {
        primary_window: { used_percent: USED.codex, limit_window_seconds: 18_000 },
      },
    }
  }
  if (url === CLAUDE_URL) {
    return { five_hour: { utilization: USED.claude } }
  }
  if (url === GROK_URL) {
    return { config: { creditUsagePercent: USED.grok, subscriptionTier: 'SuperGrok' } }
  }
  if (url === ANTIGRAVITY_MODELS_URL) {
    return {
      models: {
        'gemini-bar': { quotaInfo: { remainingFraction: 1 - USED.antigravity / 100 } },
      },
    }
  }
  if (url === ANTIGRAVITY_TIER_URL) return { paidTier: { name: 'Pro' } }
  if (url.startsWith(CURSOR_SUMMARY_URL)) {
    return {
      membershipType: 'pro',
      individualUsage: { plan: { totalPercentUsed: USED.cursor } },
    }
  }
  if (url.startsWith('https://cursor.com/api/usage')) return { 'gpt-4': { numRequests: 0 } }
  if (url === OPENCODE_URL) return { usage: { rolling: { percent: USED.opencode } } }
  if (url === KIMI_URL) return { usages: { limit_5h: { used_ratio: USED.kimi / 100 } } }
  return undefined
}

/**
 * The bearer token sent to one usage URL.
 * @param seen - recorded fetch calls.
 * @param url - the fixture URL.
 * @returns the Authorization header, which is absent only when the call never happened.
 */
function authorizationFor(seen: SeenCall[], url: string): string | null {
  const call = seen.find((entry) => entry.url === url)
  assert.ok(call, url)
  return call.authorization
}
