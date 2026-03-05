#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) continue;
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function usage() {
  console.log(`Usage:
  node scripts/doublecheck_api_compare.js \\
    --baseline <baseline_snapshot.json> \\
    --candidate <candidate_snapshot.json> \\
    [--out compare_report.json]
`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function stableStringify(value) {
  return JSON.stringify(sortKeysDeep(value));
}

function sortKeysDeep(value) {
  if (Array.isArray(value)) {
    return value.map((item) => sortKeysDeep(item));
  }
  if (value && typeof value === 'object') {
    const out = {};
    Object.keys(value).sort().forEach((key) => {
      out[key] = sortKeysDeep(value[key]);
    });
    return out;
  }
  return value;
}

function deepEqual(a, b) {
  return stableStringify(a) === stableStringify(b);
}

function toRecordMap(snapshot) {
  const map = new Map();
  (snapshot.records || []).forEach((item) => {
    map.set(String(item.id || ''), item);
  });
  return map;
}

function compareApiInfoRecord(base, cand) {
  const failures = [];
  const baseNorm = (base && base.normalized) || {};
  const candNorm = (cand && cand.normalized) || {};
  const baseData = (baseNorm && baseNorm.data) || {};
  const candData = (candNorm && candNorm.data) || {};

  const baseNoActions = JSON.parse(JSON.stringify(baseNorm));
  const candNoActions = JSON.parse(JSON.stringify(candNorm));
  if (baseNoActions.data) delete baseNoActions.data.supportedActions;
  if (candNoActions.data) delete candNoActions.data.supportedActions;
  if (!deepEqual(baseNoActions, candNoActions)) {
    failures.push('apiInfo 구조가 허용 범위를 벗어나 변경되었습니다(지원 액션/버전 외 차이).');
  }

  const baseActions = Array.isArray(baseData.supportedActions) ? baseData.supportedActions : [];
  const candActions = Array.isArray(candData.supportedActions) ? candData.supportedActions : [];
  const baseSet = new Set(baseActions.map((v) => String(v || '').trim()).filter((v) => !!v));
  const candSet = new Set(candActions.map((v) => String(v || '').trim()).filter((v) => !!v));

  baseSet.forEach((action) => {
    if (!candSet.has(action)) {
      failures.push(`apiInfo.supportedActions 누락: ${action}`);
    }
  });

  const allowedExtras = new Set([
    'fortuneVersionList',
    'fortuneVersionGet',
    'fortuneUploadBegin',
    'fortuneUploadChunk',
    'fortuneUploadFinalize',
    'fortuneUploadAbort'
  ]);
  candSet.forEach((action) => {
    if (baseSet.has(action)) return;
    if (!allowedExtras.has(action)) {
      failures.push(`허용되지 않은 supportedActions 추가: ${action}`);
    }
  });

  return failures;
}

function compareRecord(base, cand) {
  if (!cand) {
    return ['candidate 스냅샷에 요청 레코드가 없습니다.'];
  }
  if (base.failedToParse || cand.failedToParse) {
    const baseFlag = !!base.failedToParse;
    const candFlag = !!cand.failedToParse;
    if (baseFlag !== candFlag) {
      return ['baseline/candidate 파싱 성공 여부가 다릅니다.'];
    }
    if (baseFlag && candFlag) {
      return [];
    }
  }

  const failures = [];
  if (base.api === 'apiInfo') {
    return compareApiInfoRecord(base, cand);
  }

  const baseNorm = base.normalized;
  const candNorm = cand.normalized;
  if (!deepEqual(baseNorm, candNorm)) {
    failures.push('정규화 응답이 다릅니다.');
  }
  return failures;
}

function main() {
  const args = parseArgs(process.argv);
  const baselinePath = String(args.baseline || '').trim();
  const candidatePath = String(args.candidate || '').trim();
  const outPath = String(args.out || '').trim();
  if (!baselinePath || !candidatePath) {
    usage();
    process.exit(1);
  }

  const baseline = readJson(path.resolve(process.cwd(), baselinePath));
  const candidate = readJson(path.resolve(process.cwd(), candidatePath));
  const baseMap = toRecordMap(baseline);
  const candMap = toRecordMap(candidate);

  const findings = [];
  baseMap.forEach((baseRecord, id) => {
    const candRecord = candMap.get(id);
    const failures = compareRecord(baseRecord, candRecord);
    if (failures.length > 0) {
      findings.push({
        id,
        api: baseRecord.api,
        failures
      });
    }
  });

  const extraIds = [];
  candMap.forEach((_candRecord, id) => {
    if (!baseMap.has(id)) {
      extraIds.push(id);
    }
  });

  const report = {
    generatedAt: new Date().toISOString(),
    baselinePath: path.resolve(process.cwd(), baselinePath),
    candidatePath: path.resolve(process.cwd(), candidatePath),
    baselineCount: baseMap.size,
    candidateCount: candMap.size,
    extraCandidateRequestIds: extraIds,
    failureCount: findings.length,
    findings
  };

  if (outPath) {
    const absoluteOut = path.resolve(process.cwd(), outPath);
    fs.mkdirSync(path.dirname(absoluteOut), { recursive: true });
    fs.writeFileSync(absoluteOut, JSON.stringify(report, null, 2), 'utf8');
    console.log(`Saved compare report: ${absoluteOut}`);
  }

  if (extraIds.length > 0) {
    console.log(`WARN  candidate에 baseline 대비 추가 요청 ID가 있습니다: ${extraIds.join(', ')}`);
  }

  if (findings.length > 0) {
    console.error('\n=== API Contract Regression: FAIL ===');
    findings.forEach((item) => {
      console.error(`- ${item.id} (${item.api})`);
      item.failures.forEach((reason) => {
        console.error(`  - ${reason}`);
      });
    });
    process.exit(1);
  }

  console.log('\n=== API Contract Regression: PASS ===');
}

main();
