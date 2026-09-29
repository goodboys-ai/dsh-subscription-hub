#!/usr/bin/env node
/**
 * L1 host-export contract check.
 *
 * Verifies that this plugin's `src/` type-checks against a given DSH
 * version's `@deepseek-ai/*` type declarations — without booting anything.
 * This catches the link-time failure class (host renamed/removed an export
 * and the whole plugin tree would fail to load in the GUI) across many DSH
 * versions cheaply; the CI matrix build covers only the support window.
 *
 * Method: install the host packages at version V into a temp dir, then run
 * the repo's own `tsc --noEmit` with `@deepseek-ai/*` redirected there. It is
 * the real compiler doing the check, so there are no regex heuristics to go
 * stale.
 *
 * Usage:
 *   node scripts/check-host-exports.mjs --dsh 0.2.0-rc.1
 *   node scripts/check-host-exports.mjs --all            # every version in dsh-versions.txt
 *
 * Exit 0 when src compiles against every requested version, 1 otherwise.
 * Installs are cached under the OS temp dir per version.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

/** Whether a version string is a DSH prerelease (the packages that track DSH). */
function isDshPrerelease(version) {
  return /^\d+\.\d+\.\d+-(alpha|beta|rc)(\.|$)/.test(version.replace(/^[~^]/, ''))
}

/**
 * Whether a host package tracks DSH releases: by name (`dsh-*`), or by
 * carrying a DSH prerelease pin (covers future @deepseek-ai/* packages that
 * track DSH under a different name).
 */
function isDshPackage(name) {
  return name.startsWith('@deepseek-ai/dsh-') || isDshPrerelease(currentVersion(name) ?? '')
}

/** @deepseek-ai/* dependency names from package.json (dev + peer). */
function hostPackages() {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  const names = new Set()
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const name of Object.keys(pkg[section] ?? {})) {
      if (name.startsWith('@deepseek-ai/')) names.add(name)
    }
  }
  return [...names].sort()
}

/** Current version string of a host package in package.json (any section). */
function currentVersion(name) {
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'))
  for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const current = pkg[section]?.[name]
    if (typeof current === 'string') return current
  }
  return undefined
}

/**
 * Install spec for one host package. DSH-tracking packages always install at
 * the exact target version being checked — the range in package.json (e.g.
 * `>=0.1.7-rc.2 <0.3.0`) is a deployment concern; this check needs that one
 * version's type declarations. Independently-versioned packages (cordis,
 * schemastery) install at their own package.json version.
 */
function installSpec(name, version) {
  if (isDshPackage(name)) return `${name}@${version}`
  const current = currentVersion(name)
  return current === undefined ? `${name}@${version}` : `${name}@${current}`
}

/** Install the host packages at one DSH version into a cached temp dir. */
function installHost(version) {
  const dir = join(tmpdir(), 'dsh-host-exports', version)
  const marker = join(dir, '.installed')
  if (!existsSync(marker)) {
    mkdirSync(dir, { recursive: true })
    const specs = hostPackages().map(name => installSpec(name, version))
    console.log(`installing ${specs.length} @deepseek-ai/* packages for DSH ${version} ...`)
    execFileSync('npm', ['install', '--no-save', '--no-audit', '--no-fund', '--legacy-peer-deps', '--prefix', dir, ...specs],
      { stdio: 'inherit' })
    writeFileSync(marker, `${version}\n`)
  }
  return dir
}

/** Type-check src/ against one DSH version's host packages. Returns true on success. */
function checkVersion(version) {
  const dir = installHost(version)
  const cacheDir = join(root, '.cache', 'host-exports')
  mkdirSync(cacheDir, { recursive: true })
  const tsconfigPath = join(cacheDir, `tsconfig.${version}.json`)
  writeFileSync(tsconfigPath, JSON.stringify({
    extends: join(root, 'tsconfig.json'),
    compilerOptions: {
      noEmit: true,
      baseUrl: root,
      paths: {
        '@deepseek-ai/*': [join(dir, 'node_modules', '@deepseek-ai', '*')],
      },
    },
    include: [join(root, 'src/**/*.ts'), join(root, 'src/**/*.tsx')],
  }, null, 2))
  try {
    execFileSync(join(root, 'node_modules', '.bin', 'tsc'), ['-p', tsconfigPath], { stdio: 'pipe' })
    console.log(`DSH ${version}: ok — src/ compiles against this version's host APIs`)
    return true
  } catch (error) {
    console.log(`DSH ${version}: FAIL — src/ does not compile against this version's host APIs`)
    const out = (error.stdout?.toString() ?? '') + (error.stderr?.toString() ?? '')
    // Show at most the first 30 diagnostics; the full output is in the CI log.
    console.log(out.split('\n').slice(0, 30).join('\n'))
    return false
  }
}

function main() {
  const args = process.argv.slice(2)
  let versions
  if (args.includes('--all')) {
    versions = readFileSync(join(root, 'dsh-versions.txt'), 'utf8')
      .split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))
  } else {
    const i = args.indexOf('--dsh')
    if (i === -1 || !args[i + 1]) {
      console.error('usage: check-host-exports.mjs --dsh <version> | --all')
      process.exit(2)
    }
    versions = [args[i + 1]]
  }
  const failed = versions.filter(v => !checkVersion(v))
  if (failed.length > 0) {
    console.error(`\n${failed.length} DSH version(s) break the host contract: ${failed.join(', ')}`)
    process.exit(1)
  }
  console.log('\nAll requested DSH versions satisfy the host contract.')
}

main()
