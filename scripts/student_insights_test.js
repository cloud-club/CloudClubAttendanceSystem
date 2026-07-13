#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..');
const sandbox = {
  console,
  Date,
  Math,
  JSON,
  toNumberWithDefault(value, defaultValue) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : defaultValue;
  },
  parseRequiredSessionPositions() {
    return [];
  }
};

vm.createContext(sandbox);
[
  'Appsscript/30_attendance_core.gs',
  'Appsscript/33_graduation_manual_excused.gs'
].forEach(relativePath => {
  const source = fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
  vm.runInContext(source, sandbox, { filename: relativePath });
});

function test(name, run) {
  try {
    run();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    throw error;
  }
}

function graduationInput(overrides) {
  return Object.assign({
    attendedCount: 0,
    lateCount: 0,
    absentCount: 0,
    effectivePastCount: 0,
    futureCount: 0,
    requiredAttendanceCount: 0,
    lateToAbsenceRatio: 3,
    maxAbsenceEquivalent: 0,
    requiredCheck: { satisfied: true, possible: true, details: [] }
  }, overrides);
}

test('Given the exact attendance threshold, graduation assessment treats every final requirement as met', () => {
  // Given
  const input = graduationInput({
    attendedCount: 3,
    effectivePastCount: 3,
    requiredAttendanceCount: 3,
    maxAbsenceEquivalent: 1,
    requiredCheck: {
      satisfied: true,
      possible: true,
      details: [{ status: 'on_time', satisfied: true, possible: true }]
    }
  });

  // When
  const result = sandbox.buildGraduationAssessment(input);

  // Then
  assert.deepStrictEqual(JSON.parse(JSON.stringify(result)), {
    absenceEquivalent: 0,
    absenceEquivalentRate: 0,
    remainingSessions: 0,
    minimumFutureParticipation: 0,
    remainingAbsenceAllowance: 1,
    meetsAttendanceCount: true,
    attendancePossible: true,
    meetsAbsenceThreshold: true,
    requiredSessionsOk: true,
    requiredSessionsPossible: true,
    isFinal: true,
    isGraduated: true,
    isGraduationPossible: true
  });
});

test('Given lates exactly at the conversion ratio, graduation assessment counts one absence equivalent', () => {
  // Given
  const input = graduationInput({
    attendedCount: 2,
    lateCount: 3,
    effectivePastCount: 4,
    futureCount: 1,
    requiredAttendanceCount: 2,
    maxAbsenceEquivalent: 1
  });

  // When
  const result = sandbox.buildGraduationAssessment(input);

  // Then
  assert.strictEqual(result.absenceEquivalent, 1);
  assert.strictEqual(result.absenceEquivalentRate, 25);
  assert.strictEqual(result.remainingAbsenceAllowance, 0);
  assert.strictEqual(result.meetsAbsenceThreshold, true);
  assert.strictEqual(result.isFinal, false);
  assert.strictEqual(result.isGraduated, false);
});

test('Given an attended final session is still open, graduation assessment remains provisional', () => {
  const result = sandbox.buildGraduationAssessment(graduationInput({
    attendedCount: 3,
    effectivePastCount: 3,
    futureCount: 0,
    remainingSessions: 1,
    requiredAttendanceCount: 3,
    maxAbsenceEquivalent: 1
  }));

  assert.strictEqual(result.remainingSessions, 1);
  assert.strictEqual(result.isFinal, false);
  assert.strictEqual(result.isGraduated, false);
  assert.strictEqual(result.isGraduationPossible, true);
});

test('Given decimal discrete criteria, graduation assessment rounds them up to whole participation events', () => {
  const result = sandbox.buildGraduationAssessment(graduationInput({
    attendedCount: 1,
    lateCount: 3,
    effectivePastCount: 2,
    futureCount: 2,
    requiredAttendanceCount: 2.5,
    lateToAbsenceRatio: 2.5,
    maxAbsenceEquivalent: 1
  }));

  assert.strictEqual(result.minimumFutureParticipation, 2);
  assert.strictEqual(result.absenceEquivalent, 1);
});

test('Given decimal variable values, graduation criteria normalizes counts and ratios upward', () => {
  const result = sandbox.resolveGraduationCriteria({
    required_attendance_count: 2.5,
    late_to_absence_ratio: 2.5,
    max_absence_equivalent: 1
  }, 5);

  assert.strictEqual(result.requiredAttendanceCount, 3);
  assert.strictEqual(result.lateToAbsenceRatio, 3);
});

test('Given a failed required session that cannot be recovered, graduation assessment marks completion impossible', () => {
  // Given
  const input = graduationInput({
    attendedCount: 4,
    effectivePastCount: 4,
    futureCount: 1,
    requiredAttendanceCount: 3,
    maxAbsenceEquivalent: 1,
    requiredCheck: {
      satisfied: false,
      possible: false,
      details: [{ status: 'absent', satisfied: false, possible: false }]
    }
  });

  // When
  const result = sandbox.buildGraduationAssessment(input);

  // Then
  assert.strictEqual(result.requiredSessionsOk, false);
  assert.strictEqual(result.requiredSessionsPossible, false);
  assert.strictEqual(result.attendancePossible, true);
  assert.strictEqual(result.isGraduationPossible, false);
});

test('Given two pending required sessions, minimum future participation honors the larger required-session count', () => {
  // Given
  const input = graduationInput({
    attendedCount: 2,
    effectivePastCount: 2,
    futureCount: 4,
    requiredAttendanceCount: 3,
    maxAbsenceEquivalent: 2,
    requiredCheck: {
      satisfied: false,
      possible: true,
      details: [
        { status: 'future', satisfied: false, possible: true },
        { status: 'future', satisfied: false, possible: true },
        { status: 'on_time', satisfied: true, possible: true }
      ]
    }
  });

  // When
  const result = sandbox.buildGraduationAssessment(input);

  // Then
  assert.strictEqual(result.remainingSessions, 4);
  assert.strictEqual(result.minimumFutureParticipation, 2);
  assert.strictEqual(result.attendancePossible, true);
  assert.strictEqual(result.requiredSessionsPossible, true);
  assert.strictEqual(result.isGraduationPossible, true);
});

test('Given first and last point to one pending session, minimum participation counts that session once', () => {
  // Given
  const input = graduationInput({
    attendedCount: 0,
    effectivePastCount: 0,
    futureCount: 1,
    requiredAttendanceCount: 1,
    maxAbsenceEquivalent: 0,
    requiredCheck: {
      satisfied: false,
      possible: true,
      details: [
        { sessionKey: 'only-session', status: 'future', satisfied: false, possible: true },
        { sessionKey: 'only-session', status: 'future', satisfied: false, possible: true }
      ]
    }
  });

  // When
  const result = sandbox.buildGraduationAssessment(input);

  // Then
  assert.strictEqual(result.remainingSessions, 1);
  assert.strictEqual(result.minimumFutureParticipation, 1);
  assert.strictEqual(result.isGraduationPossible, true);
});

test('Given no remaining absence allowance, every future session is required to preserve eligibility', () => {
  // Given
  const input = graduationInput({
    attendedCount: 3,
    absentCount: 1,
    effectivePastCount: 4,
    futureCount: 3,
    requiredAttendanceCount: 3,
    maxAbsenceEquivalent: 1
  });

  // When
  const result = sandbox.buildGraduationAssessment(input);

  // Then
  assert.strictEqual(result.remainingAbsenceAllowance, 0);
  assert.strictEqual(result.minimumFutureParticipation, 3);
  assert.strictEqual(result.isGraduationPossible, true);
});

test('Given no completed sessions, graduation assessment keeps absence rate finite and zero', () => {
  // Given
  const input = graduationInput({
    effectivePastCount: 0,
    requiredAttendanceCount: 0
  });

  // When
  const result = sandbox.buildGraduationAssessment(input);

  // Then
  assert.strictEqual(result.absenceEquivalentRate, 0);
  assert.strictEqual(Number.isFinite(result.absenceEquivalentRate), true);
  assert.strictEqual(result.minimumFutureParticipation, 0);
  assert.strictEqual(result.isGraduated, true);
});

test('Given cohort rates with decimals, attendance comparison rounds the weighted average and signed delta to one decimal', () => {
  // Given
  const items = [
    { key: 'target', name: 'Target', attendanceRate: 80.44, attendedCount: 4, totalSessions: 5, avgAttendOffsetSeconds: 30 },
    { key: 'peer', name: 'Peer', attendanceRate: 60.16, attendedCount: 3, totalSessions: 5, avgAttendOffsetSeconds: 20 }
  ];

  // When
  const result = sandbox.summarizeAttendanceComparison(items, 'target');

  // Then
  assert.strictEqual(result.personalAttendanceRate, 80.4);
  assert.strictEqual(result.cohortAverageAttendanceRate, 70);
  assert.strictEqual(result.differencePercentagePoints, 10.4);
});

test('Given a target below the cohort average, attendance comparison preserves a negative percentage-point delta', () => {
  // Given
  const items = [
    { key: 'target', name: 'Target', attendanceRate: 40, attendedCount: 2, totalSessions: 5, avgAttendOffsetSeconds: 10 },
    { key: 'peer', name: 'Peer', attendanceRate: 70, attendedCount: 7, totalSessions: 10, avgAttendOffsetSeconds: 20 }
  ];

  // When
  const result = sandbox.summarizeAttendanceComparison(items, 'target');

  // Then
  assert.strictEqual(result.cohortAverageAttendanceRate, 60);
  assert.strictEqual(result.differencePercentagePoints, -20);
});

test('Given a full cohort with ranking ties, attendance comparison finds an exact rank beyond the top ten', () => {
  // Given
  const leaders = Array.from({ length: 9 }, (_, index) => ({
    key: `leader-${index}`,
    name: `Leader ${index}`,
    attendanceRate: 100 - index,
    attendedCount: 20 - index,
    avgAttendOffsetSeconds: index
  }));
  const tied = [
    { key: 'null-offset', name: 'Null', attendanceRate: 70, attendedCount: 5, avgAttendOffsetSeconds: null },
    { key: 'target', name: 'Target', attendanceRate: 75, attendedCount: 5, avgAttendOffsetSeconds: 30 },
    { key: 'alpha', name: 'Alpha', attendanceRate: 80, attendedCount: 5, avgAttendOffsetSeconds: 30 },
    { key: 'fast', name: 'Fast', attendanceRate: 90, attendedCount: 5, avgAttendOffsetSeconds: 10 }
  ];
  const items = tied.concat(leaders).reverse();

  // When
  const result = sandbox.summarizeAttendanceComparison(items, 'target');

  // Then
  assert.strictEqual(result.rank, 12);
  assert.strictEqual(result.cohortSize, 13);
  assert.strictEqual(result.topPercentile, 93);
});

test('Given an empty cohort, attendance comparison returns the explicit no-data contract', () => {
  // Given
  const items = [];

  // When
  const result = sandbox.summarizeAttendanceComparison(items, 'target');

  // Then
  assert.deepStrictEqual(JSON.parse(JSON.stringify(result)), {
    personalAttendanceRate: 0,
    cohortAverageAttendanceRate: 0,
    differencePercentagePoints: 0,
    rank: null,
    cohortSize: 0,
    topPercentile: null
  });
});

test('Given a cohort without the requested key, attendance comparison returns the no-data contract', () => {
  // Given
  const items = [
    { key: 'peer', name: 'Peer', attendanceRate: 100, attendedCount: 5, avgAttendOffsetSeconds: 0 }
  ];

  // When
  const result = sandbox.summarizeAttendanceComparison(items, 'missing');

  // Then
  assert.strictEqual(result.personalAttendanceRate, 0);
  assert.strictEqual(result.cohortAverageAttendanceRate, 0);
  assert.strictEqual(result.differencePercentagePoints, 0);
  assert.strictEqual(result.rank, null);
  assert.strictEqual(result.cohortSize, 0);
  assert.strictEqual(result.topPercentile, null);
});

console.log('All student insight regression tests passed.');
