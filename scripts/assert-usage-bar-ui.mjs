#!/usr/bin/env node
// Open the booted dsh web UI and check that the usage bar rendered.
//
// The composer dock, which is where the bar is registered, mounts only after
// a conversation leaves the hero layout. This script selects the fixture
// Codex model, sends one message, and waits for the pill. The message only
// mounts the dock. Usage fetches are answered by scripts/usage-bar-preload.mjs.
//
//   node scripts/assert-usage-bar-ui.mjs <origin> <cookie-jar> <seen-log>
import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const [origin, jarPath, seenPath] = process.argv.slice(2)

function fail(message) {
  console.error(`USAGE BAR FAIL: ${message}`)
  process.exit(1)
}

if (origin === undefined || jarPath === undefined || seenPath === undefined) {
  fail('usage: assert-usage-bar-ui.mjs <origin> <cookie-jar> <seen-log>')
}

const cookies = readCookies(readFileSync(jarPath, 'utf8'))
if (cookies.length === 0) fail('session cookie jar is empty')

await waitForFixture(origin, cookies)
const dump = await openAndCheck(origin, cookies)
if (dump !== undefined) {
  console.error(dump)
  fail('the usage bar did not render in the composer')
}
assertFixtureCalls(seenPath)
console.log('ok: usage bar rendered from fixture credentials')

function readCookies(text) {
  const cookies = []
  for (const line of text.split('\n')) {
    if (line.length === 0 || line.startsWith('# ')) continue
    const httpOnly = line.startsWith('#HttpOnly_')
    const fields = (httpOnly ? line.slice('#HttpOnly_'.length) : line).split('\t')
    if (fields.length < 7) continue
    cookies.push({
      domain: fields[0],
      path: fields[2],
      secure: fields[3] === 'TRUE',
      name: fields[5],
      value: fields[6],
      httpOnly,
    })
  }
  return cookies
}

async function rpc(origin, cookies, endpoint, payload) {
  const response = await fetch(`${origin}/api/subscriptions-auth.${endpoint}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      cookie: cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; '),
    },
    body: JSON.stringify({
      type: 'client-request',
      rpcId: `bar-${endpoint}`,
      method: `subscriptions-auth.${endpoint}`,
      payload,
    }),
  })
  if (!response.ok) throw new Error(`${endpoint} HTTP ${response.status}`)
  return response.json()
}

async function waitForFixture(origin, cookies) {
  let last = 'fixture not visible yet'
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      const status = await rpc(origin, cookies, 'status', {})
      const external = await rpc(origin, cookies, 'externalStatus', {})
      const cursor = await rpc(origin, cookies, 'cursorStatus', {})
      const providers = status?.result?.value?.providers ?? {}
      const signedIn = ['codex', 'claude', 'grok', 'copilot', 'antigravity']
        .every(id => Array.isArray(providers[id]?.accounts) && providers[id].accounts.length === 1)
      const keys = external?.result?.value?.['opencode-go']?.configured === true
        && external?.result?.value?.['kimi-code']?.configured === true
      const cursorIn = cursor?.result?.value?.authenticated === true
      if (signedIn && keys && cursorIn) return
      last = `status=${signedIn} keys=${keys} cursor=${cursorIn}`
    } catch (error) {
      last = error instanceof Error ? error.message : String(error)
    }
    await delay(500)
  }
  fail(`fixture profile was not visible to the running server (${last})`)
}

async function openAndCheck(origin, cookies) {
  const chrome = findChrome()
  const port = await freePort()
  const profile = mkdtempSync(join(tmpdir(), 'usage-bar-chrome-'))
  const child = spawn(chrome, [
    '--headless=new',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--lang=en-US',
    '--window-size=1280,900',
    'about:blank',
  ], { stdio: 'ignore' })
  try {
    await waitForJson(`http://127.0.0.1:${port}/json/version`)
    const list = await waitForJson(`http://127.0.0.1:${port}/json/list`)
    const page = list.find(target => target.type === 'page')
    if (page?.webSocketDebuggerUrl === undefined) fail('headless Chrome opened no page')
    const cdp = await connect(page.webSocketDebuggerUrl)
    await cdp.send('Network.enable')
    await cdp.send('Page.enable')
    await cdp.send('Runtime.enable')
    for (const cookie of cookies) {
      await cdp.send('Network.setCookie', {
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain,
        path: cookie.path,
        secure: cookie.secure,
        httpOnly: cookie.httpOnly,
      })
    }
    const loaded = cdp.waitEvent('Page.loadEventFired')
    await cdp.send('Page.navigate', { url: origin })
    await loaded
    return await drive(cdp)
  } catch (error) {
    return error instanceof Error ? error.stack ?? error.message : String(error)
  } finally {
    await stopChrome(child)
    try {
      rmSync(profile, { recursive: true, force: true })
    } catch {
      // Chrome can still be releasing the profile directory.
    }
  }
}

function stopChrome(child) {
  return new Promise(resolve => {
    if (child.exitCode !== null || child.signalCode !== null) {
      resolve()
      return
    }
    child.once('exit', () => resolve())
    child.kill('SIGTERM')
    setTimeout(() => {
      child.kill('SIGKILL')
      resolve()
    }, 2_000)
  })
}

async function drive(cdp) {
  if (!await waitFor(cdp, hasText('Send message'), 30_000)) {
    return `web UI did not show a composer\n${await snapshot(cdp)}`
  }
  await dismissOnboarding(cdp)
  // The composer stays inert until a session exists, and a session needs a
  // workspace. The host opens its own directory browser (not a native file
  // chooser). Type a temp path and Open it; do not adopt the home folder.
  if (!await editorReady(cdp, 1_000)) {
    const workspace = mkdtempSync(join(tmpdir(), 'usage-bar-workspace-'))
    mkdirSync(workspace, { recursive: true })
    if (!await clickLabel(cdp, ['Choose workspace'])) {
      return `workspace picker did not open\n${await snapshot(cdp)}`
    }
    if (!await clickLabel(cdp, ['Edit path'])) {
      return `workspace path field did not open\n${await snapshot(cdp)}`
    }
    if (!await waitFor(cdp, `(() => document.querySelector('input[aria-label="Edit path"]') !== null)()`, 5_000)) {
      return `workspace path field did not focus\n${await snapshot(cdp)}`
    }
    const folder = workspace.split('/').at(-1)
    const typed = await cdp.evaluate(`(() => {
      const input = document.querySelector('input[aria-label="Edit path"]')
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set
      if (input === null || setter === undefined) return false
      setter.call(input, ${JSON.stringify(workspace)})
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.focus()
      return input.value
    })()`)
    if (typed !== workspace) {
      return `workspace path was not entered\n${await snapshot(cdp)}`
    }
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 })
    if (!await waitFor(cdp, hasText(folder), 15_000)) {
      return `workspace directory was not listed\n${await snapshot(cdp)}`
    }
    if (!await clickExact(cdp, 'Open')) {
      return `workspace Open was not available for ${workspace}\n${await snapshot(cdp)}`
    }
    if (!await editorReady(cdp)) {
      return `composer did not become editable\n${await snapshot(cdp)}`
    }
  }
  if (!await clickLabel(cdp, ['Select model', '选择模型'])) {
    return `model menu did not open\n${await snapshot(cdp)}`
  }
  if (!await clickLabel(cdp, ['Model', '模型'])) {
    return `model list did not open\n${await snapshot(cdp)}`
  }
  if (!await waitFor(cdp, hasText('GPT-5.1 Codex'), 20_000)) {
    return `Codex model was not offered\n${await snapshot(cdp)}`
  }
  if (!await clickLabel(cdp, ['GPT-5.1 Codex'])) {
    return `Codex model could not be selected\n${await snapshot(cdp)}`
  }
  await dismissOnboarding(cdp)
  await pressKey(cdp, 'Escape', 27)
  const draft = 'usage bar check'
  if (!await typeDraft(cdp, draft)) {
    return `composer did not accept the draft\n${await snapshot(cdp)}`
  }
  if (!await clickEnabled(cdp, ['Send message', '发送消息'])) {
    return `composer send control was not available\n${await snapshot(cdp)}`
  }
  if (!await waitFor(cdp, '(() => document.querySelector(\'[data-phase="active"]\') !== null)()', 15_000)) {
    return `composer stayed on the hero layout\n${await snapshot(cdp)}`
  }
  const pill = 'Codex 5h 11%'
  if (!await waitFor(cdp, hasText(pill), 30_000)) {
    return `usage pill ${pill} was not rendered\n${await snapshot(cdp)}`
  }
  if (!await clickLabel(cdp, [pill])) return `usage pill could not be opened\n${await snapshot(cdp)}`
  if (!await waitFor(cdp, '(() => document.querySelector(\'[role="dialog"]\') !== null)()', 10_000)) {
    return `usage dialog did not open\n${await snapshot(cdp)}`
  }
  // Antigravity quotas stay behind the preview disclosure unless the current
  // model is an Antigravity model. Open every disclosure before reading.
  await cdp.evaluate(`(() => {
    for (const summary of document.querySelectorAll('[role="dialog"] summary')) summary.click()
    return true
  })()`)
  const dialog = await cdp.evaluate('document.querySelector(\'[role="dialog"]\')?.innerText ?? ""')
  const required = [
    'Codex', '11%', 'Claude', '22%', 'Grok', '33%', 'Antigravity', '44%',
    'Cursor', '55%', 'OpenCode Go', '66%', 'Kimi Code', '77%',
  ]
  const absent = required.filter(part => !dialog.includes(part))
  if (absent.length > 0 || dialog.includes('Copilot')) {
    return `usage dialog was ${JSON.stringify(dialog).slice(0, 2000)}`
  }
  return undefined
}

async function dismissOnboarding(cdp) {
  // Exact labels, and the confirmation actions before Skip. Skip is also the
  // footer control that opens the confirmation, so matching it first would
  // click the footer again and never confirm.
  const labels = ['Continue', 'Configure later', 'Open app', 'Got it', 'Skip', 'Get started', 'Next']
  for (let step = 0; step < 8; step++) {
    let clicked = false
    for (const label of labels) {
      if (await clickExact(cdp, label, 1)) {
        clicked = true
        break
      }
    }
    if (!clicked) return
    await delay(400)
  }
}

async function pressKey(cdp, key, windowsVirtualKeyCode) {
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key, windowsVirtualKeyCode })
  await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key, windowsVirtualKeyCode })
}

async function typeDraft(cdp, text) {
  const box = await cdp.evaluate(`(() => {
    const el = document.querySelector('[data-composer-input]')
    if (el === null) return null
    const rect = el.getBoundingClientRect()
    return { x: rect.x + Math.min(24, rect.width / 2), y: rect.y + Math.min(16, rect.height / 2) }
  })()`)
  if (box === null || box === undefined) return false
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 })
  await cdp.send('Input.insertText', { text })
  if (await draftHas(cdp, text)) return true
  await cdp.evaluate(`(() => {
    const el = document.querySelector('[data-composer-input]')
    el?.focus()
    document.execCommand('insertText', false, ${JSON.stringify(text)})
    return true
  })()`)
  return draftHas(cdp, text)
}

function draftHas(cdp, text) {
  return cdp.evaluate(`(() => (document.querySelector('[data-composer-input]')?.innerText || '').includes(${JSON.stringify(text)}))()`)
    .then(value => value === true)
}

function editorReady(cdp, timeoutMs = 15_000) {
  return waitFor(
    cdp,
    '(() => document.querySelector(\'[data-composer-input][contenteditable="true"]\') !== null)()',
    timeoutMs,
  )
}

function hasText(text) {
  return `(() => [...document.querySelectorAll('button,[role="menuitem"],[role="menuitemradio"]')].some(node => ((node.getAttribute('aria-label') || '') + ' ' + (node.innerText || '')).includes(${JSON.stringify(text)})))()`
}

async function clickExact(cdp, label, attempts = 10) {
  const expression = `(() => {
    const node = [...document.querySelectorAll('button')].find(item => (item.innerText || '').trim() === ${JSON.stringify(label)} && !item.disabled)
    if (node === undefined) return false
    node.click()
    return true
  })()`
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (await cdp.evaluate(expression) === true) return true
    await delay(300)
  }
  return false
}

async function clickLabel(cdp, labels, attempts = 10) {
  const expression = `(() => {
    const labels = ${JSON.stringify(labels)}
    const nodes = [...document.querySelectorAll('button,[role="menuitem"],[role="menuitemradio"]')]
    const node = nodes.find(item => {
      const text = (item.getAttribute('aria-label') || '') + ' ' + (item.innerText || '')
      return labels.some(label => text.includes(label))
    })
    if (node === undefined) return false
    node.click()
    return true
  })()`
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (await cdp.evaluate(expression) === true) return true
    await delay(300)
  }
  return false
}

async function waitFor(cdp, expression, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    if (await cdp.evaluate(expression) === true) return true
    await delay(300)
  }
  return false
}

async function clickEnabled(cdp, labels, attempts = 10) {
  const expression = `(() => {
    const labels = ${JSON.stringify(labels)}
    const node = [...document.querySelectorAll('button')].find(item => {
      if (item.disabled) return false
      const text = (item.getAttribute('aria-label') || '') + ' ' + (item.innerText || '')
      return labels.some(label => text.includes(label))
    })
    if (node === undefined) return false
    node.click()
    return true
  })()`
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (await cdp.evaluate(expression) === true) return true
    await delay(300)
  }
  return false
}

async function snapshot(cdp) {
  const text = await cdp.evaluate(`(() => {
    const phase = document.querySelector('[data-phase]')?.getAttribute('data-phase') ?? ''
    const draft = (document.querySelector('[data-composer-input]')?.innerText || '').slice(0, 80)
    const send = [...document.querySelectorAll('button')].find(node => (node.getAttribute('aria-label') || '').includes('Send message'))
    const buttons = [...document.querySelectorAll('button')].map(node => (node.getAttribute('aria-label') || node.innerText || '').trim().slice(0, 160)).filter(Boolean).slice(0, 40)
    return ['phase: ' + phase, 'draft: ' + JSON.stringify(draft), 'sendDisabled: ' + (send === undefined ? 'missing' : String(send.disabled)), 'buttons:', ...buttons].join('\\n')
  })()`)
  return text
}

function assertFixtureCalls(path) {
  let lines
  try {
    lines = readFileSync(path, 'utf8').split('\n').filter(line => line.length > 0).map(line => JSON.parse(line))
  } catch {
    fail('usage interceptor wrote no call log')
  }
  const wanted = [
    'https://chatgpt.com/backend-api/wham/usage',
    'https://api.anthropic.com/api/oauth/usage',
    'https://cli-chat-proxy.grok.com/v1/billing?format=credits',
    'https://daily-cloudcode-pa.googleapis.com/v1internal:fetchAvailableModels',
    'https://cursor.com/api/usage-summary',
    'https://opencode.ai/zen/go/v1/usage',
    'https://api.kimi.com/coding/v1/usages',
  ]
  for (const url of wanted) {
    const calls = lines.filter(entry => entry.url === url || (url.endsWith('/usage-summary') && String(entry.url).startsWith(url)))
    if (calls.length === 0) fail(`usage interceptor did not see ${url}`)
    if (!calls.some(entry => entry.fixtureAuth === true)) fail(`usage call to ${url} did not present the fixture credential`)
  }
}

function findChrome() {
  const names = [process.env.CHROME_BIN, 'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser']
    .filter(name => name !== undefined && name.length > 0)
  for (const name of names) {
    try {
      execFileSync(name, ['--version'], { stdio: 'ignore' })
      return name
    } catch { /* try the next name */ }
  }
  fail('Chrome is not installed; set CHROME_BIN to a Chromium binary')
}

function freePort() {
  return new Promise((resolve, reject) => {
    const server = createServer()
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address !== null ? address.port : 0
      server.close(() => resolve(port))
    })
  })
}

function waitForJson(url) {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const tick = () => {
      fetch(url).then(async response => {
        if (!response.ok) throw new Error(String(response.status))
        resolve(await response.json())
      }).catch(error => {
        if (Date.now() - started > 15_000) reject(error)
        else setTimeout(tick, 200)
      })
    }
    tick()
  })
}

function connect(url) {
  const ws = new WebSocket(url)
  let next = 0
  const pending = new Map()
  const events = new Map()
  const ready = new Promise((resolve, reject) => {
    ws.addEventListener('open', () => resolve())
    ws.addEventListener('error', () => reject(new Error('Chrome DevTools socket failed')))
  })
  ws.addEventListener('message', event => {
    const message = JSON.parse(String(event.data))
    if (message.id !== undefined) {
      const waiter = pending.get(message.id)
      if (waiter === undefined) return
      pending.delete(message.id)
      if (message.error !== undefined) waiter.reject(new Error(JSON.stringify(message.error)))
      else waiter.resolve(message.result)
      return
    }
    const queue = events.get(message.method)
    if (queue === undefined) return
    for (const waiter of queue) waiter(message.params)
    events.set(message.method, [])
  })
  return ready.then(() => ({
    send(method, params) {
      const id = ++next
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject })
        ws.send(JSON.stringify({ id, method, params }))
      })
    },
    waitEvent(method) {
      return new Promise(resolve => {
        const queue = events.get(method) ?? []
        queue.push(resolve)
        events.set(method, queue)
      })
    },
    async evaluate(expression) {
      const result = await this.send('Runtime.evaluate', { expression, returnByValue: true })
      if (result.exceptionDetails !== undefined) {
        throw new Error(result.exceptionDetails.text ?? 'page expression failed')
      }
      return result.result?.value
    },
  }))
}

function delay(ms) {
  return new Promise(resolve => { setTimeout(resolve, ms) })
}
