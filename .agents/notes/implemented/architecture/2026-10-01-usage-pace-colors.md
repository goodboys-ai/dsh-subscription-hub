# Agent Note: Usage pace colors

Status: implemented

## Problem

Absolute usage bars cannot show whether quota consumption leads time progress. Watchdog's used/elapsed ratio highlights early bursts but can label low usage red, conflicting with red meaning near exhaustion. A flexible threshold editor would add complexity the user explicitly rejects.

## Decision

One browser-local Usage coloring dropdown selects Standard (default, 10-point allowance), Relaxed (15 points), or Remaining quota only (no yellow). All meters use the same preset. Persistence validates values, falls back to Standard and synchronizes same-origin tabs. Display preferences never change routing or enforcement.

Validity and freshness precede colors. Invalid percentages, failed refreshes, observations older than five minutes and readings whose known reset has passed are neutral. Cached numbers remain visible with an accessible stale explanation. The pool cache preserves the original observation timestamp and explicitly reports stale fallback after failures; successful RPC receipt is not sufficient evidence of freshness.

Fresh valid usage at least 90% is red in every preset. Below that, remaining-only is green. Pace presets require reliable time progress: yellow when unrounded used minus elapsed is at least the preset allowance, otherwise green. Unknown timing is neutral in pace presets, not expired by itself. Compare unrounded values and round only labels.

The marker uses explicit valid start/end intervals, currently supplied by Grok periods and Cursor billing cycles. A duration enables inferred starts only with explicit provider verification (`fixedWindow`). No adapter currently asserts this flag: Codex duration metadata remains available but is not sufficient evidence by itself. Claude, Kimi, OpenCode and other reset-only windows do not acquire invented five-hour/seven-day starts. Genuine rolling quotas have no linear pace marker.

Settings reuse the neighboring native select, label, spacing, hint and theme tokens. Short preset-specific hints explain yellow and red; meter tooltips expose the applicable warning, remaining quota, elapsed progress and reset countdown. Labels do not rely on color alone.

## Alternatives considered

**Watchdog pressure ratio.** Rejected because small early bursts can produce red at low usage. Percentage-point allowances tolerate bursts without presenting a constant-consumption forecast.

**Any usage above elapsed turns yellow.** Normal bursts and rounding make this noisy. Standard permits a 10-point lead before warning.

**15-point default.** More forgiving for batch work but delays short-window warnings. Keep it as Relaxed rather than the default.

**Absolute colors only.** Cannot communicate pace; retained as the remaining-only opt-out.

**Separate mode/allowance controls, numeric inputs and per-provider overrides.** Rejected after the user's simple-configuration request. Three presets cover two tolerances and a distinct opt-out without an extra control.

## Verification and limits

Kimi K3-256K and Grok 4.7 (xhigh) independently flagged stale/invalid coloring and kind-based interval inference. Their findings informed the implementation; Grok supported all three simplified presets. Its lengthy helper suggestion was not adopted, particularly the blanket unknown-timing wording that contradicted fresh red and remaining-only green.

Unit tests cover unrounded boundaries, all presets, invalid/unknown/expired timing, observation aging, failure-cache timestamps, localized meter labels and preference synchronization. Real DSH 0.2.0-rc.2 host-e2e exercises baseline and candidate with the same isolated provider fixtures and viewport, captures usage-dialog/settings screenshots, and verifies the coloring dropdown's values, saved selection and reload persistence. These fixtures prove rendering and host integration, not live provider interval semantics. No new fixed-duration assumption is enabled without provider evidence.

Both locales render in server-side component tests; actual host screenshots cover English/light at the driver's default viewport. Chinese, dark-theme and narrow-layout host screenshots remain a verification limit.

## Consequences

Yellow describes pace and red describes little remaining quota; neither predicts interruption. Freshness handling prevents cached numbers from becoming reassuring solely as time advances. Conservative interval handling means some providers have neutral pace bars and no marker until reliable timing is available. One additional dropdown, localized labels and observation metadata buy clearer semantics without provider-specific tuning. Revisit the defaults only if real usage shows frequent unactionable or late yellow warnings.
