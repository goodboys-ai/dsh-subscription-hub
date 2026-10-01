import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { displayUsedPercent, elapsedPercent, isUsageFresh, resetCountdownParts, usageColorState, USAGE_FRESHNESS_MS } from '../src/client/usage-pace.js'
import { UsageMeter } from '../src/client/UsageMeter.js'
import { en, zh } from '../src/client/locales.js'

const now = 2_000_000_000_000

test('elapsed time requires an explicit interval or verified fixed duration, never kind alone', () => {
  for (const kind of ['session', 'weekly', 'other'] as const) {
    assert.equal(elapsedPercent({ kind, usedPercent: 20, resetsAt: now + 100 }, now), undefined)
    assert.equal(elapsedPercent({ kind, usedPercent: 20, windowDurationMs: 200, resetsAt: now + 100 }, now), undefined)
  }
  assert.equal(elapsedPercent({ kind: 'other', usedPercent: 20, startsAt: now - 100, resetsAt: now + 300 }, now), 25)
  assert.equal(elapsedPercent({ kind: 'session', usedPercent: 20, fixedWindow: true, windowDurationMs: 1000, resetsAt: now + 250 }, now), 75)
})

test('missing, invalid and expired intervals omit the marker', () => {
  for (const timing of [{}, { resetsAt: NaN }, { resetsAt: now }, { resetsAt: now - 1 },
    { resetsAt: now + 100 }, { startsAt: now + 200, resetsAt: now + 100 },
    { startsAt: now + 50, resetsAt: now + 100 }, { startsAt: NaN, resetsAt: now + 100 },
    { resetsAt: now + 100, fixedWindow: true, windowDurationMs: -1 }]) {
    assert.equal(elapsedPercent({ kind: 'other', usedPercent: 20, ...timing }, now), undefined)
  }
})

test('three presets compare unrounded points; exhaustion takes precedence', () => {
  const color = (used: number, elapsed: number | undefined, preset: 'standard' | 'relaxed' | 'remaining' = 'standard') => usageColorState(used, elapsed, preset, true)
  assert.equal(color(40, 25), 'yellow')
  assert.equal(color(40, 35), 'green')
  assert.equal(color(30, 20), 'yellow')
  assert.equal(color(30, 20, 'relaxed'), 'green')
  assert.equal(color(35, 20, 'relaxed'), 'yellow')
  assert.equal(color(40, 20, 'remaining'), 'green')
  assert.equal(color(29.6, 20), 'green')
  assert.equal(color(89.6, 85), 'green')
  assert.equal(color(10, 0), 'yellow')
  assert.equal(color(0, 0), 'green')
  assert.equal(color(2, 1), 'green')
  for (const preset of ['standard', 'relaxed', 'remaining'] as const) {
    assert.equal(color(90, 95, preset), 'red')
    assert.equal(color(95, undefined, preset), 'red')
    assert.equal(usageColorState(95, 0, preset, false), 'neutral')
    for (const invalid of [NaN, Infinity, -1, 101]) assert.equal(color(invalid, 0, preset), 'neutral')
  }
  assert.equal(color(40, undefined), 'neutral')
  assert.equal(color(40, undefined, 'remaining'), 'green')
})

test('failed, aged, reset and invalid observations cannot imply current usage', () => {
  const quota = { kind: 'session' as const, usedPercent: 95 }
  assert.equal(isUsageFresh(quota, { observedAt: now }, now), true)
  assert.equal(isUsageFresh(quota, {}, now), false)
  assert.equal(isUsageFresh(quota, { observedAt: now, stale: true }, now), false)
  assert.equal(isUsageFresh(quota, { observedAt: now - USAGE_FRESHNESS_MS - 1 }, now), false)
  assert.equal(isUsageFresh(quota, { observedAt: now + 1 }, now), false)
  assert.equal(isUsageFresh({ ...quota, resetsAt: now }, { observedAt: now }, now), false)
  assert.equal(isUsageFresh({ ...quota, usedPercent: -1 }, { observedAt: now }, now), false)
})

test('display percentages round valid shares and refuse invalid ones instead of clamping', () => {
  assert.equal(displayUsedPercent(40.4), 40)
  assert.equal(displayUsedPercent(0), 0)
  assert.equal(displayUsedPercent(100), 100)
  for (const invalid of [NaN, Infinity, -Infinity, -1, 100.1]) {
    assert.equal(displayUsedPercent(invalid), undefined)
  }
})

test('reset countdown uses whole days/hours/minutes, rounded up, two largest units', () => {
  assert.deepEqual(resetCountdownParts(18 * 3_600_000), [{ unit: 'hour', count: 18 }])
  assert.deepEqual(resetCountdownParts(65 * 60_000), [{ unit: 'hour', count: 1 }, { unit: 'minute', count: 5 }])
  assert.deepEqual(resetCountdownParts(30_000), [{ unit: 'minute', count: 1 }])
  assert.deepEqual(resetCountdownParts(60_000), [{ unit: 'minute', count: 1 }])
  assert.deepEqual(resetCountdownParts(2 * 86_400_000 + 3 * 3_600_000 + 40 * 60_000), [{ unit: 'day', count: 2 }, { unit: 'hour', count: 3 }])
  assert.deepEqual(resetCountdownParts(2 * 86_400_000 + 30 * 60_000), [{ unit: 'day', count: 2 }, { unit: 'minute', count: 30 }])
  assert.equal(resetCountdownParts(0)[0]?.unit, 'minute')
})

test('localized meter labels distinguish fresh, unknown and stale readings', () => {
  const realNow = Date.now()
  for (const dictionary of [en, zh]) {
    const t = (key: keyof typeof en, params?: Record<string, unknown>) => dictionary[key]
      .replace(/\{(\w+)\}/g, (_, name: string) => String(params?.[name] ?? ''))
    const props = { t, observedAt: realNow, window: {
      kind: 'session' as const, usedPercent: 20, startsAt: realNow - 100_000, resetsAt: realNow + 100_000,
    } }
    const html = renderToStaticMarkup(createElement(UsageMeter, props))
    assert.match(html, /data-usage-time-marker/)
    assert.match(html, /role="img"/)
    assert.match(html, /50%/)
    assert.match(html, /data-usage-color="green"/)
    // A negative lead is behind pace, not a negative lead.
    assert.ok(html.includes(t('usageMeterPaceBehind', { points: 30 })), html)
    assert.ok(!html.includes('-30'), html)
    // The reset countdown is humanized and pluralized, never raw minutes.
    assert.ok(html.includes(t('usageMeterReset', { duration: t('usageUnitMinutes', { count: 2 }) })), html)
    const stale = renderToStaticMarkup(createElement(UsageMeter, { ...props, stale: true }))
    assert.doesNotMatch(stale, /data-usage-time-marker/)
    assert.match(stale, /data-usage-color="neutral"/)
    const noTime = renderToStaticMarkup(createElement(UsageMeter, { t, observedAt: realNow, window: { kind: 'other', usedPercent: 80 } }))
    assert.doesNotMatch(noTime, /data-usage-time-marker/)
    assert.match(noTime, /data-usage-color="neutral"/)
    // A singular unit is not pluralized.
    const oneMinute = renderToStaticMarkup(createElement(UsageMeter, { t, observedAt: realNow, window: {
      kind: 'session' as const, usedPercent: 10, startsAt: realNow - 100_000, resetsAt: realNow + 59_000,
    } }))
    assert.ok(oneMinute.includes(t('usageMeterReset', { duration: t('usageUnitMinute', { count: 1 }) })), oneMinute)
    // An invalid percentage shows the unavailable state, never a clamped number or NaN.
    const invalid = renderToStaticMarkup(createElement(UsageMeter, { t, observedAt: realNow, window: {
      kind: 'other' as const, usedPercent: 150, resetsAt: realNow + 3_600_000,
    } }))
    assert.ok(invalid.includes(t('usageMeterInvalid')), invalid)
    assert.ok(!invalid.includes(t('usageMeterStale')), invalid)
    assert.match(invalid, /data-usage-color="neutral"/)
    assert.doesNotMatch(invalid, /NaN|150%/)
    // A lead beyond the allowance names pace in the warning and the detail.
    const ahead = renderToStaticMarkup(createElement(UsageMeter, { t, observedAt: realNow, window: {
      kind: 'session' as const, usedPercent: 80, startsAt: realNow - 100_000, resetsAt: realNow + 100_000,
    } }))
    assert.ok(ahead.includes(t('usageMeterAhead')), ahead)
    assert.ok(ahead.includes(t('usageMeterPaceAhead', { points: 30 })), ahead)
    assert.match(ahead, /data-usage-color="yellow"/)
  }
})
