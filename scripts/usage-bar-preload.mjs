// Fetch interceptor for the usage-bar boot check. Loaded with
// `node --import` into the dsh web process.
//
// It answers the usage URLs this plugin calls with canned JSON, and it
// refuses every other request to a provider host. A request that does not
// carry the fixture credential is rejected here and is not forwarded.
// Nothing in this file is a real provider credential.
import { appendFileSync } from 'node:fs'

const seenPath = process.env.USAGE_BAR_SEEN
const original = globalThis.fetch.bind(globalThis)

const CODEX_URL = 'https://chatgpt.com/backend-api/wham/usage'
const CLAUDE_URL = 'https://api.anthropic.com/api/oauth/usage'
const GROK_URL = 'https://cli-chat-proxy.grok.com/v1/billing?format=credits'
const ANTIGRAVITY_MODELS_URL = 'https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels'
const ANTIGRAVITY_TIER_URL = 'https://daily-cloudcode-pa.googleapis.com/v1internal:loadCodeAssist'
const CURSOR_SUMMARY_URL = 'https://cursor.com/api/usage-summary'
const OPENCODE_URL = 'https://opencode.ai/zen/go/v1/usage'
const KIMI_URL = 'https://api.kimi.com/coding/v1/usages'
const CURSOR_ACCESS = 'fake.eyJzdWIiOiJhdXRoMHx1c2VyX2JhciIsImV4cCI6NDEwMjQ0NDgwMH0.sig'

const BEARER = {
  [CODEX_URL]: 'Bearer fake-codex-access',
  [CLAUDE_URL]: 'Bearer fake-claude-access',
  [GROK_URL]: 'Bearer fake-grok-access',
  [ANTIGRAVITY_MODELS_URL]: 'Bearer fake-antigravity-access',
  [ANTIGRAVITY_TIER_URL]: 'Bearer fake-antigravity-access',
  [OPENCODE_URL]: 'Bearer fake-opencode-key',
  [KIMI_URL]: 'Bearer fake-kimi-key',
}

const BLOCKED_HOSTS = [
  'chatgpt.com',
  'openai.com',
  'api.anthropic.com',
  'anthropic.com',
  'cli-chat-proxy.grok.com',
  'grok.com',
  'x.ai',
  'googleapis.com',
  'cursor.com',
  'cursor.sh',
  'opencode.ai',
  'kimi.com',
  'githubcopilot.com',
  'github.com',
]

function record(entry) {
  if (seenPath === undefined || seenPath.length === 0) return
  appendFileSync(seenPath, `${JSON.stringify(entry)}\n`)
}

function fixtureFor(url) {
  if (url === CODEX_URL) {
    return {
      plan_type: 'plus',
      rate_limit: { primary_window: { used_percent: 11, limit_window_seconds: 18_000 } },
    }
  }
  if (url === CLAUDE_URL) return { five_hour: { utilization: 22 } }
  if (url === GROK_URL) return { config: { creditUsagePercent: 33, subscriptionTier: 'SuperGrok' } }
  if (url === ANTIGRAVITY_MODELS_URL) {
    return { models: { 'gemini-bar': { quotaInfo: { remainingFraction: 0.56 } } } }
  }
  if (url === ANTIGRAVITY_TIER_URL) return { paidTier: { name: 'Pro' } }
  if (url.startsWith(CURSOR_SUMMARY_URL)) {
    return { membershipType: 'pro', individualUsage: { plan: { totalPercentUsed: 55 } } }
  }
  if (url.startsWith('https://cursor.com/api/usage')) return { 'gpt-4': { numRequests: 0 } }
  if (url === OPENCODE_URL) return { usage: { rolling: { percent: 66 } } }
  if (url === KIMI_URL) return { usages: { limit_5h: { used_ratio: 0.77 } } }
  if (url === 'https://registry.npmjs.org/@anthropic-ai%2fclaude-code/latest'
    || url === 'https://registry.npmjs.org/@openai%2fcodex/latest') {
    return { version: '9.9.9' }
  }
  return undefined
}

function blocked(url) {
  let hostname
  try {
    hostname = new URL(url).hostname
  } catch {
    return false
  }
  return BLOCKED_HOSTS.some(host => hostname === host || hostname.endsWith(`.${host}`))
}

function fixtureAuth(url, headers) {
  if (url.startsWith('https://cursor.com/api/')) {
    return (headers.get('cookie') ?? '').includes(CURSOR_ACCESS)
  }
  const expected = BEARER[url]
  if (expected === undefined) return true
  return headers.get('authorization') === expected
}

globalThis.fetch = async (input, init) => {
  const url = String(input instanceof Request ? input.url : input)
  const headers = new Headers(input instanceof Request ? input.headers : undefined)
  if (init?.headers !== undefined) {
    new Headers(init.headers).forEach((value, key) => { headers.set(key, value) })
  }
  const body = fixtureFor(url)
  if (body !== undefined) {
    const ok = fixtureAuth(url, headers)
    record({ url, fixtureAuth: ok })
    if (!ok) return new Response('fixture credential required', { status: 401 })
    return Response.json(body)
  }
  if (blocked(url)) {
    record({ url, fixtureAuth: false, blocked: true })
    return new Response('provider host blocked by usage-bar preload', { status: 404 })
  }
  return original(input, init)
}
