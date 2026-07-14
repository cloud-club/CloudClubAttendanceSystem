#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

BASELINE_URL=""
CANDIDATE_URL=""
SEASON="${SEASON:-}"
VALID_PHONE="${VALID_PHONE:-}"
INVALID_PHONE="${INVALID_PHONE:-}"
ADMIN_TOKEN="${ADMIN_TOKEN:-}"
SUPER_TOKEN="${SUPER_TOKEN:-}"
INCLUDE_ATTENDANCE="false"
INCLUDE_SEASON_IMPORT_DRY="false"
OUT_DIR="${OUT_DIR:-$ROOT_DIR/.artifacts/doublecheck-$(date +%Y%m%d-%H%M%S)}"

usage() {
  cat <<'USAGE'
Usage:
  ./scripts/run_doublecheck.sh \
    [--baseline-url <apps_script_exec_url>] \
    [--candidate-url <apps_script_exec_url>] \
    [--season season_09] \
    [--valid-phone 01012345678] \
    [--invalid-phone 01000000000] \
    [--admin-token <token>] \
    [--super-token <token>] \
    [--include-attendance] \
    [--include-season-import-begin-dry] \
    [--out-dir <dir>]

Notes:
  - URL을 둘 다 넣으면 API baseline/candidate 비교까지 자동 실행됩니다.
  - URL이 없으면 정적 가드(static guard)만 실행됩니다.
  - attendance 호출은 데이터 변경이 발생할 수 있으므로 기본값은 비활성입니다.
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --baseline-url)
      BASELINE_URL="${2:-}"
      shift 2
      ;;
    --candidate-url)
      CANDIDATE_URL="${2:-}"
      shift 2
      ;;
    --season)
      SEASON="${2:-}"
      shift 2
      ;;
    --valid-phone)
      VALID_PHONE="${2:-}"
      shift 2
      ;;
    --invalid-phone)
      INVALID_PHONE="${2:-}"
      shift 2
      ;;
    --admin-token)
      ADMIN_TOKEN="${2:-}"
      shift 2
      ;;
    --super-token)
      SUPER_TOKEN="${2:-}"
      shift 2
      ;;
    --include-attendance)
      INCLUDE_ATTENDANCE="true"
      shift
      ;;
    --include-season-import-begin-dry)
      INCLUDE_SEASON_IMPORT_DRY="true"
      shift
      ;;
    --out-dir)
      OUT_DIR="${2:-}"
      shift 2
      ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      usage
      exit 1
      ;;
  esac
done

mkdir -p "$OUT_DIR"

echo "== Gate 0: Static Invariance Guard =="
node "$ROOT_DIR/scripts/doublecheck_static_guard.js"

echo
echo "== Gate 0-B: Admin Compact Layout Contract =="
node --test "$ROOT_DIR/scripts/admin_compact_layout_test.js"

if [[ -z "$BASELINE_URL" || -z "$CANDIDATE_URL" ]]; then
  echo
  echo "INFO: baseline/candidate URL이 없어 API 계약 비교는 건너뜁니다."
  echo "INFO: 실행 결과 경로 -> $OUT_DIR"
  exit 0
fi

echo
echo "== Gate A: API Baseline Snapshot =="
BASELINE_JSON="$OUT_DIR/api-baseline.json"
BASELINE_ARGS=(
  --base-url "$BASELINE_URL"
  --out "$BASELINE_JSON"
)
[[ -n "$SEASON" ]] && BASELINE_ARGS+=(--season "$SEASON")
[[ -n "$VALID_PHONE" ]] && BASELINE_ARGS+=(--valid-phone "$VALID_PHONE")
[[ -n "$INVALID_PHONE" ]] && BASELINE_ARGS+=(--invalid-phone "$INVALID_PHONE")
[[ -n "$ADMIN_TOKEN" ]] && BASELINE_ARGS+=(--admin-token "$ADMIN_TOKEN")
[[ -n "$SUPER_TOKEN" ]] && BASELINE_ARGS+=(--super-token "$SUPER_TOKEN")
[[ "$INCLUDE_ATTENDANCE" == "true" ]] && BASELINE_ARGS+=(--include-attendance)
[[ "$INCLUDE_SEASON_IMPORT_DRY" == "true" ]] && BASELINE_ARGS+=(--include-season-import-begin-dry)
node "$ROOT_DIR/scripts/doublecheck_api_snapshot.js" "${BASELINE_ARGS[@]}"

echo
echo "== Gate A: API Candidate Snapshot =="
CANDIDATE_JSON="$OUT_DIR/api-candidate.json"
CANDIDATE_ARGS=(
  --base-url "$CANDIDATE_URL"
  --out "$CANDIDATE_JSON"
)
[[ -n "$SEASON" ]] && CANDIDATE_ARGS+=(--season "$SEASON")
[[ -n "$VALID_PHONE" ]] && CANDIDATE_ARGS+=(--valid-phone "$VALID_PHONE")
[[ -n "$INVALID_PHONE" ]] && CANDIDATE_ARGS+=(--invalid-phone "$INVALID_PHONE")
[[ -n "$ADMIN_TOKEN" ]] && CANDIDATE_ARGS+=(--admin-token "$ADMIN_TOKEN")
[[ -n "$SUPER_TOKEN" ]] && CANDIDATE_ARGS+=(--super-token "$SUPER_TOKEN")
[[ "$INCLUDE_ATTENDANCE" == "true" ]] && CANDIDATE_ARGS+=(--include-attendance)
[[ "$INCLUDE_SEASON_IMPORT_DRY" == "true" ]] && CANDIDATE_ARGS+=(--include-season-import-begin-dry)
node "$ROOT_DIR/scripts/doublecheck_api_snapshot.js" "${CANDIDATE_ARGS[@]}"

echo
echo "== Gate A: API Contract Compare =="
COMPARE_REPORT="$OUT_DIR/api-compare-report.json"
node "$ROOT_DIR/scripts/doublecheck_api_compare.js" \
  --baseline "$BASELINE_JSON" \
  --candidate "$CANDIDATE_JSON" \
  --out "$COMPARE_REPORT"

echo
echo "All automated gates passed."
echo "Artifacts: $OUT_DIR"
