#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <apps_script_exec_url>"
  echo "Example: $0 https://script.google.com/macros/s/AKfycb.../exec"
  exit 1
fi

EXEC_URL="$1"
TS="$(date +%s)"

build_url() {
  local base="$1"
  local query="$2"
  local sep='?'
  if [[ "$base" == *\?* ]]; then
    sep='&'
  fi
  printf '%s%s%s' "$base" "$sep" "$query"
}

extract_payload() {
  # JSONP 형태: cb({...});
  sed -E 's/^[^(]*\((.*)\);?$/\1/' <<<"$1"
}

extract_code() {
  grep -oE '"code":"[^"]+"' <<<"$1" | head -n1 | sed -E 's/"code":"([^"]+)"/\1/' || true
}

extract_success_flag() {
  if grep -q '"ok":true' <<<"$1"; then
    echo "true"
  else
    echo "false"
  fi
}

CONFIG_URL="$(build_url "$EXEC_URL" "api=authGoogleConfig&callback=cb&_=${TS}")"
LOGIN_URL="$(build_url "$EXEC_URL" "api=authGoogleLogin&idToken=dummy&callback=cb&_=${TS}")"

CONFIG_RAW="$(curl -fsSL "$CONFIG_URL")"
LOGIN_RAW="$(curl -fsSL "$LOGIN_URL")"

CONFIG_JSON="$(extract_payload "$CONFIG_RAW")"
LOGIN_JSON="$(extract_payload "$LOGIN_RAW")"

CONFIG_OK="$(extract_success_flag "$CONFIG_JSON")"
LOGIN_OK="$(extract_success_flag "$LOGIN_JSON")"
LOGIN_CODE="$(extract_code "$LOGIN_JSON")"

echo "=== Auth Canary Snapshot ==="
echo "timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "exec_url: ${EXEC_URL}"
echo
echo "[authGoogleConfig]"
echo "ok: ${CONFIG_OK}"
echo "${CONFIG_JSON}"
echo
echo "[authGoogleLogin(dummy)]"
echo "ok: ${LOGIN_OK}"
echo "code: ${LOGIN_CODE:-<none>}"
echo "${LOGIN_JSON}"
echo

if [[ "${LOGIN_CODE:-}" == "AUTH_SERVER_SCOPE_MISSING" ]]; then
  echo "RESULT: FAIL (AUTH_SERVER_SCOPE_MISSING)"
  exit 2
fi

if [[ "${LOGIN_CODE:-}" =~ ^AUTH_ID_TOKEN_ ]]; then
  echo "RESULT: PASS (token validation stage reached: ${LOGIN_CODE})"
  exit 0
fi

echo "RESULT: WARN (unexpected code: ${LOGIN_CODE:-<none>})"
exit 3
