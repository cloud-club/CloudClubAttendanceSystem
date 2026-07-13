#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const compareScript = path.join(repoRoot, 'scripts/doublecheck_api_compare.js');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'attendance-api-compare-'));

const legacyData = {
  success: true,
  name: '테스트',
  attendedCount: 3,
  lateCount: 1,
  rate: 75,
  details: []
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

try {
  const additive = runCompare(Object.assign({}, legacyData, { insights: validInsights }));
  assert.strictEqual(additive.status, 0, additive.stderr || additive.stdout);

  const missingInsights = runCompare(legacyData);
  assert.strictEqual(missingInsights.status, 1);
  assert.match(missingInsights.stderr, /data\.insights가 없습니다/);

  const changedLegacy = runCompare(Object.assign({}, legacyData, {
    attendedCount: 4,
    insights: validInsights
  }));
  assert.strictEqual(changedLegacy.status, 1);
  assert.match(changedLegacy.stderr, /additive insights 외 범위/);

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
          supportedActions: ['status'],
          runtimeChecks: { collectSessionsFromSheet: true },
          capabilities: { locationAttendanceV1: true }
        }
      }
    }]
  };
  const apiInfoCandidate = JSON.parse(JSON.stringify(apiInfoBaseline));
  Object.assign(apiInfoCandidate.records[0].normalized.data.runtimeChecks, {
    summarizeAttendanceComparison: true,
    resolveGraduationCriteria: true,
    buildGraduationAssessment: true
  });
  apiInfoCandidate.records[0].normalized.data.capabilities.studentInsightsV1 = true;
  const apiInfoAdditive = runSnapshotCompare(apiInfoBaseline, apiInfoCandidate);
  assert.strictEqual(apiInfoAdditive.status, 0, apiInfoAdditive.stderr || apiInfoAdditive.stdout);

  apiInfoCandidate.records[0].normalized.data.runtimeChecks.buildGraduationAssessment = false;
  const apiInfoIntegrityRegression = runSnapshotCompare(apiInfoBaseline, apiInfoCandidate);
  assert.strictEqual(apiInfoIntegrityRegression.status, 1);
  assert.match(apiInfoIntegrityRegression.stderr, /runtimeChecks\.buildGraduationAssessment/);

  console.log('PASS status insights and apiInfo deployment-integrity compare contracts');
} finally {
  fs.rmSync(tempDir, { recursive: true, force: true });
}
