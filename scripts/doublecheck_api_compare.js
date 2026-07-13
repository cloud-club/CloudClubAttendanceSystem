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
  ['summarizeAttendanceComparison', 'resolveGraduationCriteria', 'buildGraduationAssessment'].forEach((key) => {
    if (baseNoActions.data && baseNoActions.data.runtimeChecks) delete baseNoActions.data.runtimeChecks[key];
    if (candNoActions.data && candNoActions.data.runtimeChecks) delete candNoActions.data.runtimeChecks[key];
  });
  if (baseNoActions.data && baseNoActions.data.capabilities) delete baseNoActions.data.capabilities.studentInsightsV1;
  if (candNoActions.data && candNoActions.data.capabilities) delete candNoActions.data.capabilities.studentInsightsV1;
  if (!deepEqual(baseNoActions, candNoActions)) {
    failures.push('apiInfo 구조가 허용 범위를 벗어나 변경되었습니다(지원 액션/버전 외 차이).');
  }

  const requiredRuntimeChecks = ['summarizeAttendanceComparison', 'resolveGraduationCriteria', 'buildGraduationAssessment'];
  requiredRuntimeChecks.forEach((key) => {
    if (!candData.runtimeChecks || candData.runtimeChecks[key] !== true) {
      failures.push(`apiInfo.runtimeChecks.${key}가 true가 아닙니다.`);
    }
  });
  if (!candData.capabilities || candData.capabilities.studentInsightsV1 !== true) {
    failures.push('apiInfo.capabilities.studentInsightsV1가 true가 아닙니다.');
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

function validateStatusInsights(insights) {
  const failures = [];
  if (insights === undefined) return failures;
  if (!insights || typeof insights !== 'object' || Array.isArray(insights)) {
    return ['status.data.insights가 객체가 아닙니다.'];
  }

  const comparison = insights.comparison;
  const completion = insights.completion;
  const allowedInsightKeys = new Set(['comparison', 'completion']);
  Object.keys(insights).forEach((key) => {
    if (!allowedInsightKeys.has(key)) failures.push(`status.data.insights에 허용되지 않은 필드(${key})가 있습니다.`);
  });
  if (!comparison || typeof comparison !== 'object' || Array.isArray(comparison)) {
    failures.push('status.data.insights.comparison 객체가 없습니다.');
  } else {
    const allowedComparisonKeys = new Set([
      'personalAttendanceRate',
      'cohortAverageAttendanceRate',
      'differencePercentagePoints',
      'rank',
      'cohortSize',
      'topPercentile'
    ]);
    Object.keys(comparison).forEach((key) => {
      if (!allowedComparisonKeys.has(key)) failures.push(`status.data.insights.comparison에 허용되지 않은 필드(${key})가 있습니다.`);
    });
    [
      'personalAttendanceRate',
      'cohortAverageAttendanceRate',
      'differencePercentagePoints',
      'cohortSize'
    ].forEach((key) => {
      if (typeof comparison[key] !== 'number' || !Number.isFinite(comparison[key])) {
        failures.push(`status.data.insights.comparison.${key}가 유한한 숫자가 아닙니다.`);
      }
    });
    ['rank', 'topPercentile'].forEach((key) => {
      if (comparison[key] !== null && (typeof comparison[key] !== 'number' || !Number.isFinite(comparison[key]))) {
        failures.push(`status.data.insights.comparison.${key}가 숫자 또는 null이 아닙니다.`);
      }
    });
  }

  if (!completion || typeof completion !== 'object' || Array.isArray(completion)) {
    failures.push('status.data.insights.completion 객체가 없습니다.');
  } else {
    const allowedCompletionKeys = new Set([
      'requiredAttendanceCount',
      'lateToAbsenceRatio',
      'maxAbsenceEquivalent',
      'currentCounts',
      'attendedCount',
      'lateCount',
      'absentCount',
      'excusedCount',
      'effectivePastCount',
      'futureCount',
      'attendanceRate',
      'requiredSessions',
      'requiredCheck',
      'absenceEquivalent',
      'absenceEquivalentRate',
      'remainingSessions',
      'minimumFutureParticipation',
      'remainingAbsenceAllowance',
      'meetsAttendanceCount',
      'attendancePossible',
      'meetsAbsenceThreshold',
      'requiredSessionsOk',
      'requiredSessionsPossible',
      'isFinal',
      'isGraduated',
      'isGraduationPossible'
    ]);
    Object.keys(completion).forEach((key) => {
      if (!allowedCompletionKeys.has(key)) failures.push(`status.data.insights.completion에 허용되지 않은 필드(${key})가 있습니다.`);
    });
    if (!completion.currentCounts || typeof completion.currentCounts !== 'object' || Array.isArray(completion.currentCounts)) {
      failures.push('status.data.insights.completion.currentCounts 객체가 없습니다.');
    } else {
      const allowedCountKeys = new Set(['attended', 'late', 'absent', 'excused', 'future']);
      Object.keys(completion.currentCounts).forEach((key) => {
        if (!allowedCountKeys.has(key)) failures.push(`status.data.insights.completion.currentCounts에 허용되지 않은 필드(${key})가 있습니다.`);
      });
      allowedCountKeys.forEach((key) => {
        if (typeof completion.currentCounts[key] !== 'number' || !Number.isFinite(completion.currentCounts[key])) {
          failures.push(`status.data.insights.completion.currentCounts.${key}가 유한한 숫자가 아닙니다.`);
        }
      });
    }
    const allowedRequiredSessionKeys = new Set(['position', 'sessionKey', 'date', 'status', 'satisfied', 'possible']);
    const validateRequiredSessionList = (sessions, fieldPath) => {
      if (!Array.isArray(sessions)) {
        failures.push(`${fieldPath}가 배열이 아닙니다.`);
        return;
      }
      sessions.forEach((session, index) => {
        if (!session || typeof session !== 'object' || Array.isArray(session)) {
          failures.push(`${fieldPath}[${index}]가 객체가 아닙니다.`);
          return;
        }
        Object.keys(session).forEach((key) => {
          if (!allowedRequiredSessionKeys.has(key)) failures.push(`${fieldPath}[${index}]에 허용되지 않은 필드(${key})가 있습니다.`);
        });
        ['position', 'sessionKey', 'date', 'status'].forEach((key) => {
          if (typeof session[key] !== 'string') failures.push(`${fieldPath}[${index}].${key}가 문자열이 아닙니다.`);
        });
        ['satisfied', 'possible'].forEach((key) => {
          if (typeof session[key] !== 'boolean') failures.push(`${fieldPath}[${index}].${key}가 boolean이 아닙니다.`);
        });
      });
    };
    validateRequiredSessionList(completion.requiredSessions, 'status.data.insights.completion.requiredSessions');
    if (!completion.requiredCheck || typeof completion.requiredCheck !== 'object' || Array.isArray(completion.requiredCheck)) {
      failures.push('status.data.insights.completion.requiredCheck 객체가 없습니다.');
    } else {
      const allowedRequiredCheckKeys = new Set(['satisfied', 'possible', 'details']);
      Object.keys(completion.requiredCheck).forEach((key) => {
        if (!allowedRequiredCheckKeys.has(key)) failures.push(`status.data.insights.completion.requiredCheck에 허용되지 않은 필드(${key})가 있습니다.`);
      });
      ['satisfied', 'possible'].forEach((key) => {
        if (typeof completion.requiredCheck[key] !== 'boolean') {
          failures.push(`status.data.insights.completion.requiredCheck.${key}가 boolean이 아닙니다.`);
        }
      });
      validateRequiredSessionList(completion.requiredCheck.details, 'status.data.insights.completion.requiredCheck.details');
    }
    [
      'requiredAttendanceCount',
      'lateToAbsenceRatio',
      'maxAbsenceEquivalent',
      'attendedCount',
      'lateCount',
      'absentCount',
      'excusedCount',
      'effectivePastCount',
      'futureCount',
      'attendanceRate',
      'absenceEquivalent',
      'absenceEquivalentRate',
      'remainingSessions',
      'minimumFutureParticipation',
      'remainingAbsenceAllowance'
    ].forEach((key) => {
      if (typeof completion[key] !== 'number' || !Number.isFinite(completion[key])) {
        failures.push(`status.data.insights.completion.${key}가 유한한 숫자가 아닙니다.`);
      }
    });
    [
      'meetsAttendanceCount',
      'attendancePossible',
      'meetsAbsenceThreshold',
      'requiredSessionsOk',
      'requiredSessionsPossible',
      'isFinal',
      'isGraduated',
      'isGraduationPossible'
    ].forEach((key) => {
      if (typeof completion[key] !== 'boolean') {
        failures.push(`status.data.insights.completion.${key}가 boolean이 아닙니다.`);
      }
    });
  }

  const serialized = JSON.stringify(insights).toLowerCase();
  ['phone', 'email'].forEach((forbiddenKey) => {
    if (new RegExp(`"${forbiddenKey}"\\s*:`).test(serialized)) {
      failures.push(`status.data.insights에 개인정보 필드(${forbiddenKey})가 포함되어 있습니다.`);
    }
  });
  return failures;
}

function compareStatusRecord(base, cand) {
  const failures = [];
  const baseNorm = JSON.parse(JSON.stringify(base.normalized || {}));
  const candNorm = JSON.parse(JSON.stringify(cand.normalized || {}));
  const resolveStatusData = (normalized) => {
    const envelopeData = normalized && normalized.data;
    if (envelopeData && envelopeData.data && typeof envelopeData.data === 'object') {
      return envelopeData.data;
    }
    return envelopeData;
  };
  const baseData = resolveStatusData(baseNorm);
  const candData = resolveStatusData(candNorm);
  const candInsights = candData ? candData.insights : undefined;
  const candEnvelope = candNorm && candNorm.data;

  if (candEnvelope && candEnvelope.success === true && candData && candInsights === undefined) {
    failures.push('성공한 status 응답에 data.insights가 없습니다.');
  }
  failures.push(...validateStatusInsights(candInsights));
  if (baseData) delete baseData.insights;
  if (candData) delete candData.insights;
  if (!deepEqual(baseNorm, candNorm)) {
    failures.push('status의 기존 정규화 응답이 additive insights 외 범위에서 변경되었습니다.');
  }
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
  if (base.api === 'status') {
    return compareStatusRecord(base, cand);
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
