/**
 * Package identity consistency: the npm package name, the plugin's exported
 * name, the client bundle's module-loader id, and the cordis patch insert
 * name must all agree. A drift between any of these silently breaks install,
 * client-module registration, or the cordis bundle patch (see the banner-id
 * fix that restored the Settings page after the dsh-subscriptions rename).
 */

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const read = (rel: string): string => readFileSync(join(repoRoot, rel), 'utf8')

function matchFirst(pattern: RegExp, text: string, file: string): string {
  const m = pattern.exec(text)
  assert.ok(m, `${file} does not declare a package identity where expected`)
  return m[1]
}

test('npm name, plugin name, client bundle id, and cordis insert name agree', () => {
  const packageName: string = JSON.parse(read('package.json')).name
  assert.ok(packageName, 'package.json has no name')

  const pluginName = matchFirst(
    /^export const name = '([^']+)'/m,
    read('src/index.ts'),
    'src/index.ts',
  )
  const bannerId = matchFirst(
    /window\.__ModuleLoader__\.load\(\{ id: "([^"]+)",/,
    read('tsdown.config.ts'),
    'tsdown.config.ts',
  )
  const insertName = matchFirst(
    /^\s+name: '([^']+)'/m,
    read('cordis.patch.yml'),
    'cordis.patch.yml',
  )

  for (const [label, value] of [
    ['plugin export const name', pluginName],
    ['tsdown client banner id', bannerId],
    ['cordis.patch.yml insert name', insertName],
  ] as const) {
    assert.equal(value, packageName, `${label} (${value}) !== package.json name (${packageName})`)
  }
})
