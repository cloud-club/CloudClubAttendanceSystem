#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const compareScript = path.join(repoRoot, 'scripts/doublecheck_api_compare.js');
const constantsSource = fs.readFileSync(path.join(repoRoot, 'Appsscript/01_constants_access.gs'), 'utf8');
const entryApiSource = fs.readFileSync(path.join(repoRoot, 'Appsscript/00_entry_api.gs'), 'utf8');
const adminSource = fs.readFileSync(path.join(repoRoot, 'web/admin/index.html'), 'utf8');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'attendance-api-compare-'));

const legacyData = {
  success: true,
  name: '테스트',
  attendedCount: 3,
  lateCount: 1,
  rate: 75,
  details: [{
    sessionKey: 'session-1',
    date: '2026-07-01 19:00',
    attended: false,
    attendanceType: 'excused',
    attendTime: null,
    isPast: true
  }]
};

const validInsights = {
  comparison: {
    personalAttendanceRate: 75,
    cohortAverageAttendanceRate: 70,
    differencePercentagePoints: 5,
    rank: 2,
    cohortSize: 10,
    topPercentile: 20
  },
  completion: {
    requiredAttendanceCount: 3,
    lateToAbsenceRatio: 3,
    maxAbsenceEquivalent: 2,
    attendedCount: 3,
    lateCount: 1,
    absentCount: 0,
    excusedCount: 0,
    effectivePastCount: 4,
    futureCount: 2,
    attendanceRate: 75,
    currentCounts: {
      attended: 3,
      late: 1,
      absent: 0,
      excused: 0,
      future: 2
    },
    requiredSessions: [{
      position: 'first',
      sessionKey: 'session-1',
      date: '2026-07-01 19:00',
      status: 'on_time',
      satisfied: true,
      possible: true
    }],
    requiredCheck: {
      satisfied: true,
      possible: true,
      details: [{
        position: 'first',
        sessionKey: 'session-1',
        date: '2026-07-01 19:00',
        status: 'on_time',
        satisfied: true,
        possible: true
      }]
    },
    absenceEquivalent: 1,
    absenceEquivalentRate: 25,
    remainingSessions: 2,
    minimumFutureParticipation: 1,
    remainingAbsenceAllowance: 1,
    meetsAttendanceCount: true,
    attendancePossible: true,
    meetsAbsenceThreshold: true,
    requiredSessionsOk: false,
    requiredSessionsPossible: true,
    isFinal: false,
    isGraduated: false,
    isGraduationPossible: true
  }
};

function snapshot(data) {
  return {
    records: [{
      id: 'public_status_valid',
      api: 'status',
      normalized: {
        ok: true,
        data: {
          success: true,
          data
        }
      }
    }]
  };
}

function runSnapshotCompare(baselineSnapshot, candidateSnapshot) {
  const baselinePath = path.join(tempDir, 'baseline.json');
  const candidatePath = path.join(tempDir, 'candidate.json');
  fs.writeFileSync(baselinePath, JSON.stringify(baselineSnapshot));
  fs.writeFileSync(candidatePath, JSON.stringify(candidateSnapshot));
  return spawnSync(process.execPath, [compareScript, '--baseline', baselinePath, '--candidate', candidatePath], {
    encoding: 'utf8'
  });
}

function runCompare(candidateData) {
  return runSnapshotCompare(snapshot(legacyData), snapshot(candidateData));
}

function stripOptionalDisplayReason(statusData) {
  const normalized = JSON.parse(JSON.stringify(statusData));
  (normalized.details || []).forEach(detail => {
    delete detail.displayReason;
  });
  return normalized;
}

try {
  const characterizedCandidate = JSON.parse(JSON.stringify(legacyData));
  characterizedCandidate.details[0].displayReason = '공결';
  assert.deepStrictEqual(stripOptionalDisplayReason(characterizedCandidate), legacyData);
  console.log('PASS baseline legacy status fields/details remain equal after optional displayReason is stripped');

  const additive = runCompare(Object.assign({}, legacyData, { insights: validInsights }));
  assert.strictEqual(additive.status, 0, additive.stderr || additive.stdout);

  const displayReasonCandidate = JSON.parse(JSON.stringify(legacyData));
  displayReasonCandidate.details[0].displayReason = '공결';
  displayReasonCandidate.insights = validInsights;
  const additiveDisplayReason = runCompare(displayReasonCandidate);
  assert.strictEqual(additiveDisplayReason.status, 0, additiveDisplayReason.stderr || additiveDisplayReason.stdout);

  const unicodeDisplayReasonCandidate = JSON.parse(JSON.stringify(displayReasonCandidate));
  unicodeDisplayReasonCandidate.details[0].displayReason = '😀'.repeat(300);
  const unicodeDisplayReason = runCompare(unicodeDisplayReasonCandidate);
  assert.strictEqual(unicodeDisplayReason.status, 0, unicodeDisplayReason.stderr || unicodeDisplayReason.stdout);

  const missingInsights = runCompare(legacyData);
  assert.strictEqual(missingInsights.status, 0, missingInsights.stderr || missingInsights.stdout);

  ['', '가'.repeat(301), '😀'.repeat(301), 123].forEach(invalidReason => {
    const invalidReasonCandidate = JSON.parse(JSON.stringify(displayReasonCandidate));
    invalidReasonCandidate.details[0].displayReason = invalidReason;
    const invalidReasonResult = runCompare(invalidReasonCandidate);
    assert.strictEqual(invalidReasonResult.status, 1);
    assert.match(invalidReasonResult.stderr, /displayReason/);
  });

  ['note', 'rawNote', 'unexpected'].forEach(fieldName => {
    const leakedDetailCandidate = JSON.parse(JSON.stringify(displayReasonCandidate));
    leakedDetailCandidate.details[0][fieldName] = '비공개';
    const leakedDetailResult = runCompare(leakedDetailCandidate);
    assert.strictEqual(leakedDetailResult.status, 1);
    assert.match(leakedDetailResult.stderr, /기존 정규화 응답|허용되지 않은 필드/);
  });

  const changedLegacy = runCompare(Object.assign({}, legacyData, {
    attendedCount: 4,
    insights: validInsights
  }));
  assert.strictEqual(changedLegacy.status, 1);
  assert.match(changedLegacy.stderr, /additive insights\/displayReason 외 범위/);

  const leaked = JSON.parse(JSON.stringify(validInsights));
  leaked.comparison.phone = '01012345678';
  const privacyRegression = runCompare(Object.assign({}, legacyData, { insights: leaked }));
  assert.strictEqual(privacyRegression.status, 1);
  assert.match(privacyRegression.stderr, /허용되지 않은 필드\(phone\)/);

  const alternateIdentifier = JSON.parse(JSON.stringify(validInsights));
  alternateIdentifier.comparison.name = '다른 회원';
  const alternateIdentifierRegression = runCompare(Object.assign({}, legacyData, { insights: alternateIdentifier }));
  assert.strictEqual(alternateIdentifierRegression.status, 1);
  assert.match(alternateIdentifierRegression.stderr, /허용되지 않은 필드\(name\)/);

  const nestedIdentifier = JSON.parse(JSON.stringify(validInsights));
  nestedIdentifier.completion.requiredCheck.details[0].githubEmail = 'peer@example.com';
  const nestedIdentifierRegression = runCompare(Object.assign({}, legacyData, { insights: nestedIdentifier }));
  assert.strictEqual(nestedIdentifierRegression.status, 1);
  assert.match(nestedIdentifierRegression.stderr, /requiredCheck\.details\[0\].*허용되지 않은 필드\(githubEmail\)/);

  const apiInfoBaseline = {
    records: [{
      id: 'public_apiInfo',
      api: 'apiInfo',
      normalized: {
        ok: true,
        data: {
          success: true,
          apiVersion: '2026.07.14-v6.1',
          supportedActions: ['status'],
          runtimeChecks: { collectSessionsFromSheet: true },
          capabilities: { locationAttendanceV1: true }
        }
      }
    }]
  };
  const unchangedOldApiInfo = runSnapshotCompare(apiInfoBaseline, apiInfoBaseline);
  assert.strictEqual(unchangedOldApiInfo.status, 0, unchangedOldApiInfo.stderr || unchangedOldApiInfo.stdout);

  const apiInfoCandidate = JSON.parse(JSON.stringify(apiInfoBaseline));
  Object.assign(apiInfoCandidate.records[0].normalized.data.runtimeChecks, {
    summarizeAttendanceComparison: true,
    resolveGraduationCriteria: true,
    buildGraduationAssessment: true,
    extractStudentDisplayReason: true
  });
  apiInfoCandidate.records[0].normalized.data.apiVersion = '2026.07.14-v6.3';
  apiInfoCandidate.records[0].normalized.data.capabilities.studentInsightsV1 = true;
  apiInfoCandidate.records[0].normalized.data.capabilities.studentAttendanceReasonV1 = true;
  const apiInfoAdditive = runSnapshotCompare(apiInfoBaseline, apiInfoCandidate);
  assert.strictEqual(apiInfoAdditive.status, 0, apiInfoAdditive.stderr || apiInfoAdditive.stdout);

  const staleV63Runtime = JSON.parse(JSON.stringify(apiInfoCandidate));
  delete staleV63Runtime.records[0].normalized.data.runtimeChecks.extractStudentDisplayReason;
  const staleV63RuntimeResult = runSnapshotCompare(apiInfoBaseline, staleV63Runtime);
  assert.strictEqual(staleV63RuntimeResult.status, 1);
  assert.match(staleV63RuntimeResult.stderr, /runtimeChecks\.extractStudentDisplayReason/);

  const staleV63Capability = JSON.parse(JSON.stringify(apiInfoCandidate));
  delete staleV63Capability.records[0].normalized.data.capabilities.studentAttendanceReasonV1;
  const staleV63CapabilityResult = runSnapshotCompare(apiInfoBaseline, staleV63Capability);
  assert.strictEqual(staleV63CapabilityResult.status, 1);
  assert.match(staleV63CapabilityResult.stderr, /capabilities\.studentAttendanceReasonV1/);

  const oldBackendApiInfo = JSON.parse(JSON.stringify(apiInfoBaseline));
  oldBackendApiInfo.records[0].normalized.data.apiVersion = '2026.07.14-v6.2';
  Object.assign(oldBackendApiInfo.records[0].normalized.data.runtimeChecks, {
    summarizeAttendanceComparison: true,
    resolveGraduationCriteria: true,
    buildGraduationAssessment: true
  });
  oldBackendApiInfo.records[0].normalized.data.capabilities.studentInsightsV1 = true;
  const oldBackendApiInfoResult = runSnapshotCompare(apiInfoBaseline, oldBackendApiInfo);
  assert.strictEqual(oldBackendApiInfoResult.status, 0, oldBackendApiInfoResult.stderr || oldBackendApiInfoResult.stdout);

  const partialV62Runtime = JSON.parse(JSON.stringify(oldBackendApiInfo));
  partialV62Runtime.records[0].normalized.data.runtimeChecks.extractStudentDisplayReason = true;
  const partialV62RuntimeResult = runSnapshotCompare(apiInfoBaseline, partialV62Runtime);
  assert.strictEqual(partialV62RuntimeResult.status, 1);
  assert.match(partialV62RuntimeResult.stderr, /extractStudentDisplayReason.*v6\.3/);

  const partialV62Capability = JSON.parse(JSON.stringify(oldBackendApiInfo));
  partialV62Capability.records[0].normalized.data.capabilities.studentAttendanceReasonV1 = true;
  const partialV62CapabilityResult = runSnapshotCompare(apiInfoBaseline, partialV62Capability);
  assert.strictEqual(partialV62CapabilityResult.status, 1);
  assert.match(partialV62CapabilityResult.stderr, /studentAttendanceReasonV1.*v6\.3/);

  assert.match(constantsSource, /const API_VERSION = '2026\.07\.14-v6\.3';/);
  assert.match(entryApiSource, /extractStudentDisplayReason: typeof extractStudentDisplayReason === 'function'/);
  assert.match(entryApiSource, /studentAttendanceReasonV1: true/);
  assert.match(adminSource, /id="excuseCommentInput"[^>]*maxlength="300"/);
  assert.match(adminSource, /학생 출석 현황에 공개됩니다/);

  console.log('PASS status optional displayReason and v6.3 deployment-integrity compare contracts');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
