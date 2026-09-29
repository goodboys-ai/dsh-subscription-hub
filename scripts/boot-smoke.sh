#!/usr/bin/env bash
# L2 boot smoke test (see docs/testing.md).
#
# Boots a real DeepSeek Harness web profile with this plugin installed and
# asserts the mount-time contract:
#   - the profile boots and the web UI answers HTTP,
#   - the plugin is registered in the profile,
#   - the log shows no cordis patch skips ("name mismatch" style silent
#     skips) and no module-load failures.
#
# It deliberately does NOT test RPC behavior (the /subscriptions-auth channel
# has no stable HTTP form to curl) or any provider login — those are L3
# (virtual) plus the manual pre-release canary.
#
# Usage:
#   DSH_VERSION=0.2.0-rc.1 bash scripts/boot-smoke.sh
#   PLUGIN_SOURCE=/path/to/checkout bash scripts/boot-smoke.sh   # default: this repo
#   DSH_BIN=/path/to/dsh bash scripts/boot-smoke.sh              # default: npx @deepseek-ai/dsh@<v>
#   KEEP_SMOKE_HOME=1 bash scripts/boot-smoke.sh                  # keep the temp profile for inspection
#
# Env:
#   DSH_VERSION   - harness version to boot (default: newest in dsh-versions.txt)
#   PLUGIN_SOURCE - what `dsh plugin add` installs (default: this repo dir)
#   DSH_BIN       - dsh binary (default: npx -y @deepseek-ai/dsh@<version>)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

DSH_VERSION="${DSH_VERSION:-$(grep -v '^#' "$REPO_ROOT/dsh-versions.txt" | grep -v '^[[:space:]]*$' | tail -1)}"
PLUGIN_SOURCE="${PLUGIN_SOURCE:-$REPO_ROOT}"
DSH_CLI="${DSH_BIN:-npx --yes @deepseek-ai/dsh@$DSH_VERSION}"

SMOKE_HOME="$(mktemp -d "${TMPDIR:-/tmp}/dsh-smoke-XXXXXX")"
export DSH_HOME="$SMOKE_HOME"
WEB_LOG="$SMOKE_HOME/web.log"
WEB_PID=""

cleanup() {
  if [[ -n "$WEB_PID" ]] && kill -0 "$WEB_PID" 2>/dev/null; then
    kill "$WEB_PID" 2>/dev/null || true
    wait "$WEB_PID" 2>/dev/null || true
  fi
  if [[ "${KEEP_SMOKE_HOME:-0}" != "1" ]]; then
    rm -rf "$SMOKE_HOME"
  else
    echo "KEEP_SMOKE_HOME=1: profile kept at $SMOKE_HOME"
  fi
}
trap cleanup EXIT

fail() {
  echo "SMOKE FAIL: $1" >&2
  if grep -qi "incompatible with dsh" "$SMOKE_HOME/plugin-add.log" 2>/dev/null; then
    echo "hint: the plugin's @deepseek-ai/* peer pins don't match DSH $DSH_VERSION." >&2
    echo "hint: bump the pins per docs/compatibility.md, or test against the DSH version they pin." >&2
  fi
  echo "--- web.log tail ---" >&2
  tail -40 "$WEB_LOG" >&2 || true
  exit 1
}

echo "== boot smoke: DSH $DSH_VERSION, plugin from $PLUGIN_SOURCE =="

# 1. Install the plugin into an isolated web profile.
# `dsh plugin` is a pnpm scoped to the profile dir; `add <dir>` installs local checkouts.
$DSH_CLI plugin --profile web add "$PLUGIN_SOURCE" > "$SMOKE_HOME/plugin-add.log" 2>&1 \
  || fail "plugin install failed (see $SMOKE_HOME/plugin-add.log)"
if ! $DSH_CLI plugin --profile web list 2>/dev/null | grep -qi "dsh-subscription-hub"; then
  fail "plugin not listed after install"
fi
echo "ok: plugin installed and listed in the web profile"

# 2. Boot the web UI headless on an OS-picked port.
$DSH_CLI --profile web --no-open --port 0 > "$WEB_LOG" 2>&1 &
WEB_PID=$!

URL=""
for _ in $(seq 1 60); do
  if ! kill -0 "$WEB_PID" 2>/dev/null; then
    fail "web UI exited during boot"
  fi
  URL="$(grep -oE 'http://[^[:space:]"'\'']+' "$WEB_LOG" 2>/dev/null | head -1 || true)"
  if [[ -n "$URL" ]]; then break; fi
  sleep 2
done
[[ -n "$URL" ]] || fail "no serving URL appeared in web.log after 120s"
echo "ok: web UI serving at $URL"

# 3. The trust handshake works, the UI serves, and the plugin's client
# bundle is wired in. The printed ?token= URL is single-use: first GET
# answers 303 and sets a session cookie; the app page (200) then references
# subscription-hub/client.js, proving the plugin mounted for real.
JAR="$SMOKE_HOME/cookies.txt"
CODE1="$(curl -s -c "$JAR" -o /dev/null -w '%{http_code}' --max-time 15 "$URL" || true)"
[[ "$CODE1" == "303" ]] || fail "token handshake answered HTTP $CODE1, expected 303"
APP_HTML="$SMOKE_HOME/app.html"
CODE="$(curl -s -b "$JAR" -o "$APP_HTML" -w '%{http_code}' --max-time 15 "${URL%%\?*}" || true)"
[[ "$CODE" == "200" ]] || fail "web UI answered HTTP $CODE, expected 200"
grep -q "subscription-hub/client.js" "$APP_HTML" \
  || fail "served UI does not reference the plugin's client bundle"
echo "ok: web UI serves the app (HTTP 200) with the plugin's client bundle wired in"

# 4. No silent mount failures in the log.
if grep -qiE "name mismatch|failed to load plugin|plugin failed|Cannot find module|ERR_MODULE_NOT_FOUND" "$WEB_LOG"; then
  fail "log shows plugin load/patch failures"
fi
echo "ok: no patch skips or module-load failures in the log"

echo "SMOKE PASS: DSH $DSH_VERSION boots with the plugin"
