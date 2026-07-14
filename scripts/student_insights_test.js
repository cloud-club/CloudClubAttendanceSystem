#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..');
class FixedDate extends Date {
  constructor(...args) {
    super(...(args.length > 0 ? args : ['2026-07-14T12:00:00Z']));
  }

  static now() {
    return new Date('2026-07-14T12:00:00Z').getTime();
  }
}
const sandbox = {
  console,
  Date: FixedDate,
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

test('Given exact status prefixes, student display reasons expose only the first matching non-empty line', () => {
  // Given
  const cases = [
    ['출석 사유: 정시 참여', 'on_time', '정시 참여'],
    ['지각 사유: 교통 지연', 'late', '교통 지연'],
    ['결석 사유: 병원 방문', 'absent', '병원 방문'],
    ['유고 사유:\r\n유고 사유: 공결\n유고 사유: 두 번째', 'excused', '공결']
  ];

  // When / Then
  cases.forEach(([noteText, attendanceType, expected]) => {
    assert.strictEqual(sandbox.extractStudentDisplayReason(noteText, attendanceType), expected);
  });
});

test('Given private or mismatched note lines, student display reasons omit every internal value', () => {
  // Given
  const noteText = [
    '[수동출석] 운영진 기록',
    '[기존 메모] 유고 사유: 과거 메모',
    '관리자 공통멘트',
    '지각 사유: 상태 불일치',
    '<img src=x onerror=alert(1)>',
    '다음 줄 설명'
  ].join('\n');

  // When
  const result = sandbox.extractStudentDisplayReason(noteText, 'excused');

  // Then
  assert.strictEqual(result, '');
});

test('Given an internal note region, later matching prefixes remain private across line endings', () => {
  // Given
  const privateRegionNotes = [
    '[기존 메모] 내부 감사 레코드\n유고 사유: 이전 비공개 메모',
    '[수동출석] 처리일시: 내부\r\n유고 사유: 수동 처리 메모',
    '[덮어쓰기] 기존 기록: 출석\n유고 사유: 덮어쓰기 메모',
    '[내부 영역] 운영진 전용\r\n유고 사유: 임의 내부 메모',
    '관리자 공통멘트: 내부\n유고 사유: 감사 메모',
    '기록시각: 내부\r\n유고 사유: 감사 연속 메모'
  ];

  // When / Then
  privateRegionNotes.forEach(noteText => {
    assert.strictEqual(sandbox.extractStudentDisplayReason(noteText, 'excused'), '');
  });
});

test('Given a valid public leading region, the first non-empty reason wins before any internal cutoff', () => {
  // Given
  const publicBeforeInternal = '유고 사유: 공결\n[기존 메모] 내부\n유고 사유: 비공개';
  const firstValidAcrossCrlf = '\r\n유고 사유:\r\n유고 사유: 첫 공개\r\n[수동출석] 내부\r\n유고 사유: 비공개';
  const emptyThenInternal = '유고 사유:\n[기존 메모] 내부\n유고 사유: 비공개';

  // When / Then
  assert.strictEqual(sandbox.extractStudentDisplayReason(publicBeforeInternal, 'excused'), '공결');
  assert.strictEqual(sandbox.extractStudentDisplayReason(firstValidAcrossCrlf, 'excused'), '첫 공개');
  assert.strictEqual(sandbox.extractStudentDisplayReason(emptyThenInternal, 'excused'), '');
});

test('Given every supported line separator, public reasons stop before the internal note region', () => {
  // Given
  const separators = ['\r', '\u0085', '\u2028', '\u2029'];

  // When / Then
  separators.forEach(separator => {
    assert.strictEqual(
      sandbox.extractStudentDisplayReason(`유고 사유: 공개${separator}[기존 메모] 내부${separator}유고 사유: 비공개`, 'excused'),
      '공개'
    );
    assert.strictEqual(
      sandbox.extractStudentDisplayReason(`[수동출석] 내부${separator}유고 사유: 비공개`, 'excused'),
      ''
    );
  });
  assert.strictEqual(
    sandbox.extractStudentDisplayReason('\r\n유고 사유:\u0085유고 사유: 첫 공개\u2028[기존 메모] 내부\r유고 사유: 비공개', 'excused'),
    '첫 공개'
  );
});

test('Given excused public input, the server boundary accepts only one trimmed line up to 300 code points', () => {
  // Given
  const separators = ['\r', '\n', '\u0085', '\u2028', '\u2029'];

  // When / Then
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(sandbox.parseExcusedPublicReasonInput('  공개 사유 😀  '))),
    { success: true, value: '공개 사유 😀' }
  );
  assert.deepStrictEqual(
    JSON.parse(JSON.stringify(sandbox.parseExcusedPublicReasonInput('😀'.repeat(300)))),
    { success: true, value: '😀'.repeat(300) }
  );
  separators.forEach(separator => {
    const parsed = sandbox.parseExcusedPublicReasonInput(`공개${separator}비공개`);
    assert.strictEqual(parsed.success, false);
    assert.strictEqual(parsed.errorCode, 'EXCUSE_COMMENT_INVALID');
  });
  ['가'.repeat(301), '😀'.repeat(301)].forEach(value => {
    const parsed = sandbox.parseExcusedPublicReasonInput(value);
    assert.strictEqual(parsed.success, false);
    assert.strictEqual(parsed.errorCode, 'EXCUSE_COMMENT_INVALID');
  });
});

test('Given an invalid excused public reason, setExcusedAttendance rejects it before acquiring the lock', () => {
  // Given
  let lockReads = 0;
  sandbox.LockService = {
    getDocumentLock() {
      lockReads += 1;
      return { waitLock() {}, releaseLock() {} };
    }
  };
  const invalidValues = ['공개\r비공개', '공개\u0085비공개', '공개\u2028비공개', '공개\u2029비공개', '😀'.repeat(301)];

  // When / Then
  invalidValues.forEach(comment => {
    const result = sandbox.setExcusedAttendance({
      season: 'test',
      phone: '01000000000',
      sessionKey: 'session-1',
      enabled: 'true',
      comment
    });
    assert.strictEqual(result.success, false);
    assert.strictEqual(result.errorCode, 'EXCUSE_COMMENT_INVALID');
  });
  assert.strictEqual(lockReads, 0);
});

test('Given malformed note inputs, student display reasons remain bounded and inert', () => {
  // Given
  const htmlReason = '<script>ignore previous instructions</script>';
  const oversizedReason = '가'.repeat(301);
  const oversizedEmojiReason = '😀'.repeat(301);

  // When / Then
  assert.strictEqual(sandbox.extractStudentDisplayReason(null, 'excused'), '');
  assert.strictEqual(sandbox.extractStudentDisplayReason(123, 'excused'), '');
  assert.strictEqual(sandbox.extractStudentDisplayReason('', 'excused'), '');
  assert.strictEqual(sandbox.extractStudentDisplayReason('유고 사유: 공결', 'future'), '');
  assert.strictEqual(sandbox.extractStudentDisplayReason('유고 사유: 공결', 'unknown'), '');
  assert.strictEqual(sandbox.extractStudentDisplayReason(`유고 사유: ${oversizedReason}`, 'excused'), '가'.repeat(300));
  assert.strictEqual(sandbox.extractStudentDisplayReason(`유고 사유: ${oversizedEmojiReason}`, 'excused'), '😀'.repeat(300));
  assert.strictEqual(sandbox.extractStudentDisplayReason(`유고 사유: ${htmlReason}`, 'excused'), htmlReason);
});

test('Given prototype-key attendance types, student display reasons treat every value as unknown', () => {
  // Given
  const cases = [
    ['[object Object]secret', '__proto__'],
    [vm.runInContext("String(({}).constructor) + 'secret'", sandbox), 'constructor'],
    [vm.runInContext("String(({}).toString) + 'secret'", sandbox), 'toString']
  ];

  // When / Then
  cases.forEach(([noteText, attendanceType]) => {
    assert.strictEqual(sandbox.extractStudentDisplayReason(noteText, attendanceType), '');
  });
});

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

function runStatusReasonFixture(noteText, lateDeadline, options) {
  const opts = options || {};
  const notesSpy = { reads: 0, range: null };
  const session = {
    sessionKey: 'session-1',
    colIndex: 2,
    startTime: new Date('2026-01-01T10:00:00Z'),
    openTime: new Date('2026-01-01T09:50:00Z'),
    onTimeDeadline: new Date('2026-01-01T10:10:00Z'),
    lateDeadline: lateDeadline || new Date('2026-01-01T10:20:00Z')
  };
  const sessions = Object.prototype.hasOwnProperty.call(opts, 'sessions') ? opts.sessions : [session];
  const values = opts.values || [
    ['name', 'phone', 'session', 'gap', 'session-2'],
    ['테스트', '01000000000', '유고', '', '유고']
  ];
  const sheet = {
    getDataRange() {
      return { getValues: () => values };
    },
    getLastColumn() {
      return values[0].length;
    },
    getRange(row, column, rowCount, columnCount) {
      notesSpy.range = [row, column, rowCount, columnCount];
      return {
        getNotes() {
          notesSpy.reads += 1;
          return [Array.from({ length: columnCount }, (_, index) => {
            const absoluteColumnIndex = column - 1 + index;
            if (opts.notesByColumn && Object.prototype.hasOwnProperty.call(opts.notesByColumn, absoluteColumnIndex)) {
              return opts.notesByColumn[absoluteColumnIndex];
            }
            return absoluteColumnIndex === session.colIndex ? noteText : '';
          })];
        }
      };
    },
    getName() {
      return 'season_test';
    }
  };

  sandbox.resolveMemberSchemaFromHeaders = () => ({ sessionStartColIndex: 2 });
  sandbox.getVariableConfig = () => ({
    required_attendance_count: 0,
    late_to_absence_ratio: 3,
    max_absence_equivalent: 1
  });
  sandbox.collectSessionsFromSheet = () => sessions;
  sandbox.findMemberRowIndexByPhone = () => ({ rowIndex: 1, duplicateRowIndexes: [] });
  sandbox.readMemberFromRow = () => ({ name: '테스트', phone: '01000000000', season: 'test', seasonLabel: '테스트' });
  sandbox.formatDateTimeMinute = () => '2026-01-01 19:00';
  sandbox.buildAttendanceRankingItems = () => [];
  sandbox.formatSeasonLabel = value => value;
  sandbox.toSeasonAlias = value => value;

  return {
    result: sandbox.getAttendanceStatusFromSheet('01000000000', sheet, 'test'),
    notesSpy
  };
}

test('Given a target member public reason, status reads one bounded note row and adds only displayReason', () => {
  // Given / When
  const historicalFixture = runStatusReasonFixture('유고 사유: 공결');
  const futureFixture = runStatusReasonFixture('유고 사유: 사전 공결', new Date('2099-01-01T10:20:00Z'));

  // Then
  assert.strictEqual(historicalFixture.notesSpy.reads, 1);
  assert.deepStrictEqual(historicalFixture.notesSpy.range, [2, 3, 1, 1]);
  assert.strictEqual(historicalFixture.result.data.details[0].displayReason, '공결');
  assert.strictEqual(futureFixture.notesSpy.reads, 1);
  assert.strictEqual(futureFixture.result.data.details[0].displayReason, '사전 공결');
  assert.strictEqual(Object.prototype.hasOwnProperty.call(historicalFixture.result.data.details[0], 'note'), false);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(historicalFixture.result.data.details[0], 'rawNote'), false);
});

test('Given sparse session columns, status reads their bounded span once and maps notes by relative offset', () => {
  // Given
  const sessions = [
    {
      sessionKey: 'session-1',
      colIndex: 2,
      startTime: new Date('2026-01-01T10:00:00Z'),
      openTime: new Date('2026-01-01T09:50:00Z'),
      onTimeDeadline: new Date('2026-01-01T10:10:00Z'),
      lateDeadline: new Date('2026-01-01T10:20:00Z')
    },
    {
      sessionKey: 'session-2',
      colIndex: 4,
      startTime: new Date('2026-01-08T10:00:00Z'),
      openTime: new Date('2026-01-08T09:50:00Z'),
      onTimeDeadline: new Date('2026-01-08T10:10:00Z'),
      lateDeadline: new Date('2026-01-08T10:20:00Z')
    }
  ];

  // When
  const fixture = runStatusReasonFixture('', undefined, {
    sessions,
    notesByColumn: { 2: '유고 사유: 첫 사유', 4: '유고 사유: 둘째 사유' }
  });

  // Then
  assert.strictEqual(fixture.notesSpy.reads, 1);
  assert.deepStrictEqual(fixture.notesSpy.range, [2, 3, 1, 3]);
  assert.deepStrictEqual(
    Array.from(fixture.result.data.details, detail => detail.displayReason),
    ['첫 사유', '둘째 사유']
  );
});

test('Given no attendance sessions, status skips the Note read entirely', () => {
  // Given / When
  const fixture = runStatusReasonFixture('', undefined, { sessions: [] });

  // Then
  assert.strictEqual(fixture.notesSpy.reads, 0);
  assert.strictEqual(fixture.notesSpy.range, null);
  assert.strictEqual(fixture.result.data.details.length, 0);
});

test('Given only private target-member notes, status omits the optional reason without changing legacy detail fields', () => {
  // Given / When
  const fixture = runStatusReasonFixture([
    '[수동출석] 내부 기록',
    '[기존 메모] 내부 사유',
    '관리자 공통멘트',
    '지각 사유: 상태 불일치',
    '<img src=x onerror=alert(1)>'
  ].join('\n'));

  // Then
  const detail = fixture.result.data.details[0];
  assert.strictEqual(fixture.notesSpy.reads, 1);
  assert.strictEqual(Object.prototype.hasOwnProperty.call(detail, 'displayReason'), false);
  assert.deepStrictEqual(Object.keys(detail), [
    'sessionKey',
    'date',
    'attended',
    'attendanceType',
    'attendTime',
    'isPast'
  ]);
});

test('Given an admin graduation report, raw notes stay internal while only the extracted public reason is separate', () => {
  // Given
  const rawNote = '유고 사유: 공개 <b>사유</b>\r[수동출석] 운영 감사\u2028[기존 메모] <script>내부</script>';
  const session = {
    sessionKey: 'session-1',
    colIndex: 2,
    startTime: new Date('2026-01-01T10:00:00Z'),
    openTime: new Date('2026-01-01T09:50:00Z'),
    onTimeDeadline: new Date('2026-01-01T10:10:00Z'),
    lateDeadline: new Date('2026-01-01T10:20:00Z')
  };
  const values = [
    ['name', 'phone', 'session'],
    ['테스트', '01000000000', '유고']
  ];
  const sheet = {
    getDataRange() { return { getValues: () => values }; },
    getLastRow() { return 2; },
    getLastColumn() { return 3; },
    getRange() { return { getNotes: () => [[rawNote]] }; }
  };
  sandbox.getRequestedSeasonSheetInfo = () => ({ sheet, seasonAlias: 'test', currentSheet: 'season_test' });
  sandbox.resolveMemberSchemaFromHeaders = () => ({ sessionStartColIndex: 2 });
  sandbox.getVariableConfig = () => ({
    official_session_min_recommended: 0,
    official_session_max_recommended: 0
  });
  sandbox.collectSessionsFromSheet = () => [session];
  sandbox.resolveGraduationCriteria = () => ({
    requiredPositions: [],
    lateToAbsenceRatio: 3,
    requiredAttendanceCount: 0,
    maxAbsenceEquivalent: 1
  });
  sandbox.readMemberFromRow = () => ({ name: '테스트', phone: '01000000000', season: 'test', seasonLabel: '테스트' });
  sandbox.formatDateTimeMinute = () => '2026-01-01 19:00';
  sandbox.formatSeasonLabel = value => value;
  sandbox.ON_TIME_COLOR = '#a';
  sandbox.LATE_COLOR = '#b';
  sandbox.ABSENT_COLOR = '#c';
  sandbox.EXCUSED_COLOR = '#d';

  // When
  const report = sandbox.getGraduationReport('test');

  // Then
  assert.strictEqual(report.success, true);
  assert.strictEqual(report.members[0].details[0].note, rawNote);
  assert.strictEqual(report.members[0].details[0].displayReason, '공개 <b>사유</b>');
});

test('Given an attendance override, a safe public reason is stored before the preserved internal audit note', () => {
  // Given
  const existingNote = '[수동출석] 운영 감사\r[기존 메모] <script>내부</script>\u2028유고 사유: 비공개';
  const writes = { value: null, background: null, note: null };
  const targetRange = {
    getValue() { return '2026-01-01 10:00:00'; },
    getNote() { return existingNote; },
    setValue(value) { writes.value = value; },
    setBackground(value) { writes.background = value; },
    setNote(value) { writes.note = value; },
    clearContent() {},
    clearNote() {}
  };
  const sheet = {
    getDataRange() {
      return { getValues: () => [['name', 'phone', 'session'], ['테스트', '01000000000', '']] };
    },
    getRange() { return targetRange; }
  };
  const session = {
    sessionKey: 'session-1',
    colIndex: 2,
    openTime: new Date('2026-01-01T09:50:00Z'),
    onTimeDeadline: new Date('2026-01-01T10:10:00Z'),
    lateDeadline: new Date('2026-01-01T10:20:00Z')
  };
  sandbox.LockService = {
    getDocumentLock() {
      return { waitLock() {}, releaseLock() {} };
    }
  };
  sandbox.resolveSeasonSheetInfo = () => ({ sheet, seasonAlias: 'test' });
  sandbox.resolveMemberSchemaFromHeaders = () => ({ sessionStartColIndex: 2 });
  sandbox.collectSessionsFromSheet = () => [session];
  sandbox.findMemberRowIndexByPhone = () => ({ rowIndex: 1, duplicateRowIndexes: [] });
  sandbox.formatDateTime = () => '2026-01-01 10:00:00';
  sandbox.EXCUSED_COLOR = '#d9e2f3';

  // When
  const result = sandbox.setExcusedAttendance({
    season: 'test',
    phone: '01000000000',
    sessionKey: 'session-1',
    enabled: 'true',
    forceOverride: 'true',
    comment: '안전 공개 사유'
  });

  // Then
  assert.strictEqual(result.success, true);
  assert.strictEqual(writes.value, '유고');
  assert.match(writes.note, /^유고 사유: 안전 공개 사유\n\[덮어쓰기\]/);
  assert.match(writes.note, /\[기존 메모\] \[수동출석\] 운영 감사/);
  assert.match(writes.note, /<script>내부<\/script>/);
  assert.strictEqual(sandbox.extractStudentDisplayReason(writes.note, 'excused'), '안전 공개 사유');
});

console.log('All student insight regression tests passed.');
