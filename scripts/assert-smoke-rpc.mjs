#!/usr/bin/env node
// Check one boot-smoke RPC body. The web profile posts the same
// client-request envelope the browser uses; this script checks the
// server-response for a logged-out install.
//
//   node scripts/assert-smoke-rpc.mjs <file> <endpoint> <expect>
//
// expect: status | external-status | cursor-status | external-usage
import { readFileSync } from 'node:fs'

const [file, endpoint, expect] = process.argv.slice(2)

function fail(message) {
  console.error(message)
  process.exit(1)
}

if (file === undefined || endpoint === undefined || expect === undefined) {
  fail('usage: assert-smoke-rpc.mjs <file> <endpoint> <expect>')
}

let body
try {
  body = JSON.parse(readFileSync(file, 'utf8'))
} catch {
  fail(`subscriptions-auth.${endpoint} body is not JSON`)
}

if (body?.type !== 'server-response' || body.rpcId !== `smoke-${endpoint}`) {
  fail(`subscriptions-auth.${endpoint} returned an unexpected envelope`)
}

const serialized = JSON.stringify(body)
if (/"accessToken"|"refreshToken"|Bearer /.test(serialized)) {
  fail(`subscriptions-auth.${endpoint} response includes credential material`)
}

const result = body.result
if (expect === 'external-usage') {
  const message = result?.error?.message ?? ''
  if (result?.ok !== false || result?.error?.code !== 'internal' || !message.includes('API key is not configured')) {
    fail(`subscriptions-auth.${endpoint} did not refuse an unconfigured key (${JSON.stringify(result?.error ?? result)})`)
  }
  process.exit(0)
}

if (result?.ok !== true) {
  fail(`subscriptions-auth.${endpoint} result was not ok (${JSON.stringify(result)})`)
}

const value = result.value
if (expect === 'status') {
  const ids = ['codex', 'claude', 'grok', 'copilot', 'antigravity']
  const providers = value?.providers ?? {}
  const got = Object.keys(providers).sort().join(',')
  if (got !== [...ids].sort().join(',')) {
    fail(`status providers were ${got || '(none)'}`)
  }
  for (const id of ids) {
    const accounts = providers[id]?.accounts
    if (!Array.isArray(accounts) || accounts.length !== 0) {
      fail(`status.${id} was not an empty logged-out account list`)
    }
  }
} else if (expect === 'external-status') {
  if (value?.['opencode-go']?.configured !== false || value?.['kimi-code']?.configured !== false) {
    fail(`externalStatus was ${JSON.stringify(value)}`)
  }
} else if (expect === 'cursor-status') {
  if (value?.authenticated !== false) {
    fail(`cursorStatus was ${JSON.stringify(value)}`)
  }
} else {
  fail(`unknown expectation ${expect}`)
}
