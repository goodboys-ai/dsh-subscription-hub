import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'

process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'cursor-registration-'))
const plugin = await import('../src/index.js')

test('a DSH credential service mounts the Cursor provider route', async () => {
  const routes: string[] = []
  const ctx = new Context()
  ctx.provide('llm', { registerAdapter: (names: string[]) => {
    routes.push(...names)
    return Object.assign(() => {}, { replace: () => {} })
  } })
  ctx.provide('credentials', {
    resolve: async () => undefined,
    set: async () => undefined,
    unset: async () => undefined,
  } as never)
  ctx.plugin(plugin, { providers: [] })
  await new Promise(resolve => setTimeout(resolve, 50))
  assert.ok(routes.includes('cursor-subscription'))
})
