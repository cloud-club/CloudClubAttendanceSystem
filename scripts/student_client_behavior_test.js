#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..');
const studentSource = fs.readFileSync(path.join(repoRoot, 'web/student/student.js'), 'utf8');
const studentHtmlSource = fs.readFileSync(path.join(repoRoot, 'web/student/latest/index.html'), 'utf8');
const adminExcuseSource = fs.readFileSync(path.join(repoRoot, 'web/admin/scripts/25_graduation_excused.js'), 'utf8');
const adminRollbackSource = fs.readFileSync(path.join(repoRoot, 'web/admin/admin.js'), 'utf8');

function extractFunction(name, source, label) {
  const targetSource = source || studentSource;
  const sourceLabel = label || 'student source';
  const functionPattern = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`, 'g');
  const match = functionPattern.exec(targetSource);
  if (!match) throw new Error(`${sourceLabel}에서 함수를 찾지 못했습니다: ${name}`);
  const start = match.index;
  const bodyStart = targetSource.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;

  for (let index = bodyStart; index < targetSource.length; index++) {
    const char = targetSource[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = '';
      }
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth++;
    if (char === '}') {
      depth--;
      if (depth === 0) return targetSource.slice(start, index + 1);
    }
  }
  throw new Error(`${sourceLabel}에서 함수 끝을 찾지 못했습니다: ${name}`);
}

function createContext(setup, functionNames) {
  const context = vm.createContext({ console, Date, Math, Promise, setTimeout, clearTimeout });
  vm.runInContext(`${setup}\n${functionNames.map(name => extractFunction(name)).join('\n')}`, context);
  return context;
}

async function testAdminExcusePrefillUsesOnlySafePublicReason() {
  const rawNote = '[수동출석] 운영 감사\r[기존 메모] <script>내부</script>\u2028유고 사유: 비공개';
  const publicReason = '안전 <b> 공개';
  const sourceContext = vm.createContext({ console, Promise });
  vm.runInContext(`
    let excuseModalState = null;
    const input = { value: '', focus() {} };
    const modal = { style: {} };
    const target = { textContent: '' };
    const disclosure = {};
    const document = {
      getElementById(id) {
        if (id === 'excuseModal') return modal;
        if (id === 'excuseModalTargetText') return target;
        if (id === 'excuseModalDisclosureText') return disclosure;
        if (id === 'excuseCommentInput') return input;
        return null;
      }
    };
    function setTimeout(callback) { callback(); }
    function confirm() { return true; }
    async function applyExcusedChange() { return { success: true }; }
    function escapeHtml(value) {
      return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
    function getMatrixCellLabel() { return '결석'; }
  `, sourceContext);
  vm.runInContext([
    'buildGraduationMatrixRowHtml',
    'openExcuseModal',
    'onMatrixCellClick'
  ].map(name => extractFunction(name, adminExcuseSource, 'admin split source')).join('\n'), sourceContext);
  sourceContext.rawNote = rawNote;
  sourceContext.publicReason = publicReason;

  const sourceMarkup = vm.runInContext(`buildGraduationMatrixRowHtml({
    phone: '01000000000',
    name: '회원',
    details: [{ sessionKey: 'session-1', status: 'absent', note: rawNote, displayReason: publicReason }]
  }, [{ sessionKey: 'session-1', date: '2026-07-14' }])`, sourceContext);
  assert.doesNotMatch(sourceMarkup, /data-note|수동출석|기존 메모|script|비공개/);
  assert.match(sourceMarkup, /data-public-reason="안전 &lt;b&gt; 공개"/);

  await vm.runInContext(`onMatrixCellClick({ currentTarget: {
    disabled: false,
    dataset: {
      status: 'absent',
      phone: '01000000000',
      name: '회원',
      sessionKey: 'session-1',
      note: rawNote,
      publicReason: publicReason
    }
  } })`, sourceContext);
  assert.strictEqual(vm.runInContext('input.value', sourceContext), publicReason);
  assert.strictEqual(vm.runInContext('excuseModalState.publicReason', sourceContext), publicReason);
  assert.strictEqual(vm.runInContext("Object.prototype.hasOwnProperty.call(excuseModalState, 'note')", sourceContext), false);

  const rollbackContext = vm.createContext({ console, Promise });
  vm.runInContext(`
    let excuseModalState = null;
    const input = { value: '', focus() {} };
    const modal = { style: {} };
    const target = { textContent: '' };
    const disclosure = {};
    const document = {
      getElementById(id) {
        if (id === 'excuseModal') return modal;
        if (id === 'excuseModalTargetText') return target;
        if (id === 'excuseModalDisclosureText') return disclosure;
        if (id === 'excuseCommentInput') return input;
        return null;
      }
    };
    function setTimeout(callback) { callback(); }
    function confirm() { return true; }
    async function applyExcusedChange() { return { success: true }; }
  `, rollbackContext);
  vm.runInContext([
    'openExcuseModal',
    'onMatrixCellClick'
  ].map(name => extractFunction(name, adminRollbackSource, 'admin rollback source')).join('\n'), rollbackContext);
  rollbackContext.rawNote = rawNote;
  rollbackContext.publicReason = publicReason;
  await vm.runInContext(`onMatrixCellClick({ currentTarget: {
    disabled: false,
    dataset: {
      status: 'absent',
      phone: '01000000000',
      name: '회원',
      sessionKey: 'session-1',
      note: rawNote,
      publicReason: publicReason
    }
  } })`, rollbackContext);
  assert.strictEqual(vm.runInContext('input.value', rollbackContext), publicReason);
  assert.strictEqual(vm.runInContext('excuseModalState.publicReason', rollbackContext), publicReason);
  assert.strictEqual(vm.runInContext("Object.prototype.hasOwnProperty.call(excuseModalState, 'note')", rollbackContext), false);
  assert.doesNotMatch(extractFunction('renderGraduationMatrix', adminRollbackSource, 'admin rollback source'), /data-note|detail\.note/);
}

function testLegacyStatusCompatibility() {
  const context = createContext(`
    function escapeHtml(value) { return String(value || ''); }
    function toSafeInteger(value, fallbackValue) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return Math.trunc(parsed);
      const fallback = Number(fallbackValue);
      return Number.isFinite(fallback) ? Math.trunc(fallback) : 0;
    }
    function toSafeNumber(value, fallbackValue) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
      const fallback = Number(fallbackValue);
      return Number.isFinite(fallback) ? fallback : 0;
    }
    function formatOneDecimal(value) { return toSafeNumber(value, 0).toFixed(1); }
  `, [
    'getStatusCounts',
    'renderUpgradeNotice',
    'renderStatusComparison'
  ]);

  const counts = vm.runInContext(`getStatusCounts({
    attended: 0,
    lateCount: 0,
    details: [{ attendanceType: 'late' }]
  })`, context);
  assert.strictEqual(counts.attended, 1);
  assert.strictEqual(counts.late, 1);

  const fallbackMarkup = vm.runInContext(`renderStatusComparison(undefined, 75)`, context);
  assert.match(fallbackMarkup, /내 출석률/);
  assert.match(fallbackMarkup, /75\.0%/);
  assert.match(fallbackMarkup, /Apps Script 업데이트 후 확인 가능/);
}

function testCurrentStatusBaselineCharacterization() {
  const context = createContext(`
    let studentStatusDetails = [];
    let studentAttendanceDetailTrigger = null;
    let studentAttendanceDetailPreviousBodyOverflow = null;
    let studentAttendanceDetailFocusGeneration = 0;
    let studentAttendanceDetailFocusTimer = null;
    const statusResult = { innerHTML: '', style: {} };
    const document = {
      body: { style: { overflow: '' } },
      getElementById(id) { return id === 'statusResult' ? statusResult : null; }
    };
    function escapeHtml(value) {
      return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
    function toSafeInteger(value, fallbackValue) {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) return Number.isFinite(Number(fallbackValue)) ? Math.trunc(Number(fallbackValue)) : 0;
      return Math.floor(parsed);
    }
    function toSafeNumber(value, fallbackValue) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
      const fallback = Number(fallbackValue);
      return Number.isFinite(fallback) ? fallback : 0;
    }
    function formatOneDecimal(value) { return toSafeNumber(value, 0).toFixed(1); }
  `, [
    'getStudentAttendanceStatusMeta',
    'sanitizeStudentAttendanceDetails',
    'closeStudentAttendanceDetailDialog',
    'clearStudentAttendanceDetailState',
    'buildStatusProgressFromDetails',
    'getStatusCounts',
    'renderUpgradeNotice',
    'renderStatusComparison',
    'renderAttendanceDetails',
    'handleStatusResponse'
  ]);

  vm.runInContext(`handleStatusResponse({
    success: true,
    data: {
      seasonLabel: '15기',
      name: '레거시 회원',
      rate: 66.7,
      attended: 99,
      lateCount: 99,
      absentCount: 99,
      excusedCount: 99,
      futureCount: 99,
      details: [
        { attendanceType: 'on_time', date: '1회차' },
        { attendanceType: 'late', date: '2회차' },
        { attendanceType: 'absent', date: '3회차' },
        { attendanceType: 'excused', date: '4회차' },
        { attendanceType: 'future', date: '5회차' }
      ]
    }
  })`, context);

  const markup = vm.runInContext('statusResult.innerHTML', context);
  assert.match(markup, /내 출석률/);
  assert.match(markup, /66\.7%/);
  assert.match(markup, /Apps Script 업데이트 후 확인 가능/);
  assert.match(markup, /출석[\s\S]*2회/);
  assert.match(markup, /지각[\s\S]*1회/);
  assert.match(markup, /결석[\s\S]*1회/);
  assert.match(markup, /유고[\s\S]*1회/);
  assert.match(markup, /<section class="status-details"/);
  assert.doesNotMatch(markup, /<button\b/);

  const liveCounts = vm.runInContext(`getStatusCounts({
    attended: 99,
    lateCount: 99,
    absentCount: 99,
    excusedCount: 99,
    futureCount: 99,
    details: [
      { attendanceType: 'late' },
      { attendanceType: 'future' }
    ]
  })`, context);
  assert.deepStrictEqual(
    ['attended', 'late', 'absent', 'excused', 'future'].map(key => liveCounts[key]),
    [1, 1, 0, 0, 1]
  );

  assert.ok(studentHtmlSource.indexOf('id="rankingBoard"') > studentHtmlSource.indexOf('id="statusResult"'));
}

async function testReasonRenderingAndLookupReset() {
  const renderContext = createContext(`
    function escapeHtml(value) {
      return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
  `, ['getStudentAttendanceStatusMeta', 'sanitizeStudentAttendanceDetails', 'renderAttendanceDetails']);
  const markup = vm.runInContext(`renderAttendanceDetails([
    { attendanceType: 'excused', date: '<b>7월 14일</b>', displayReason: '공개 사유' },
    { attendanceType: 'absent', date: '7월 21일' }
  ])`, renderContext);

  assert.match(markup, /attendance-item/);
  assert.match(markup, /&lt;b&gt;7월 14일&lt;\/b&gt;/);
  assert.doesNotMatch(markup, /data-attendance-detail-index="0"/);
  assert.doesNotMatch(markup, /data-attendance-detail-index="1"/);
  assert.doesNotMatch(markup, /공개 사유|displayReason/);
  assert.match(studentHtmlSource, /id="studentAttendanceDetailDialog"[^>]*role="dialog"/);
  assert.ok(studentHtmlSource.indexOf('id="rankingBoard"') > studentHtmlSource.indexOf('id="statusResult"'));

  const requestContext = createContext(`
    let studentStatusViewGeneration = 0;
    let resolveStatus;
    const statusResult = { innerHTML: '이전 상세', style: {} };
    const document = {
      getElementById(id) {
        if (id === 'statusPhoneInput') return { value: '01012345678' };
        if (id === 'statusResult') return statusResult;
        return null;
      }
    };
    function normalizeStudentPhone(value) { return String(value || ''); }
    function isValidStudentPhone() { return true; }
    function saveLastUsedStudentPhone() {}
    function resetStudentStatusResult() {
      studentStatusViewGeneration++;
      statusResult.innerHTML = '';
      statusResult.style.display = 'none';
    }
    function fetchStudentStatus() { return new Promise(resolve => { resolveStatus = resolve; }); }
    function handleStatusResponse(response) { statusResult.innerHTML = response.marker; }
    function handleHistoricalAccessError() { return false; }
    function handleStatusError(error) { statusResult.innerHTML = error.message; }
    function alert() {}
  `, ['checkAttendanceStatus']);
  requestContext.event = { preventDefault() {} };
  const pending = vm.runInContext('checkAttendanceStatus(event)', requestContext);
  assert.match(vm.runInContext('statusResult.innerHTML', requestContext), /class="loader"/);
  assert.doesNotMatch(vm.runInContext('statusResult.innerHTML', requestContext), /이전 상세/);
  vm.runInContext("resolveStatus({ success: true, marker: '새 결과' })", requestContext);
  await pending;
  assert.strictEqual(vm.runInContext('statusResult.innerHTML', requestContext), '새 결과');
}

function createStatusRendererContext() {
  return createContext(`
    let studentStatusDetails = [];
    let studentAttendanceDetailTrigger = null;
    let studentAttendanceDetailPreviousBodyOverflow = null;
    let studentAttendanceDetailFocusGeneration = 0;
    let studentAttendanceDetailFocusTimer = null;
    const statusResult = { innerHTML: '', style: {} };
    const document = {
      body: { style: { overflow: '' } },
      getElementById(id) { return id === 'statusResult' ? statusResult : null; }
    };
    function escapeHtml(value) {
      return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
    function toSafeInteger(value, fallbackValue) {
      const parsed = Number(value);
      if (!Number.isFinite(parsed)) return Number.isFinite(Number(fallbackValue)) ? Math.trunc(Number(fallbackValue)) : 0;
      return Math.floor(parsed);
    }
    function toSafeNumber(value, fallbackValue) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
      const fallback = Number(fallbackValue);
      return Number.isFinite(fallback) ? fallback : 0;
    }
    function formatOneDecimal(value) { return toSafeNumber(value, 0).toFixed(1); }
  `, [
    'getStudentAttendanceStatusMeta',
    'sanitizeStudentAttendanceDetails',
    'closeStudentAttendanceDetailDialog',
    'clearStudentAttendanceDetailState',
    'buildStatusProgressFromDetails',
    'getStatusCounts',
    'renderUpgradeNotice',
    'renderStatusComparison',
    'renderAttendanceDetails',
    'handleStatusResponse'
  ]);
}

function renderStatusFixture(comparison, overrides) {
  const context = createStatusRendererContext();
  context.comparisonFixture = comparison;
  context.overridesFixture = overrides || {};
  vm.runInContext(`
    const defaultData = {
      seasonLabel: '15기',
      name: '테스트 회원',
      rate: 82.5,
      details: [
        { attendanceType: 'on_time', date: '1회차' },
        { attendanceType: 'on_time', date: '2회차' },
        { attendanceType: 'late', date: '3회차' },
        { attendanceType: 'absent', date: '4회차' },
        { attendanceType: 'excused', date: '5회차' },
        { attendanceType: 'future', date: '6회차' }
      ],
      insights: {
        comparison: comparisonFixture,
        completion: {
          currentCounts: { attended: 8, late: 1, absent: 2, excused: 1, future: 4 }
        }
      }
    };
    handleStatusResponse({ success: true, data: Object.assign(defaultData, overridesFixture) });
  `, context);
  return vm.runInContext('statusResult.innerHTML', context);
}

function getMetricBlock(markup, attributeName, attributeValue) {
  const pattern = new RegExp(`<div class="metric-card[^\"]*"[^>]*${attributeName}="${attributeValue}"[^>]*>([\\s\\S]*?)<\\/div>`);
  const match = markup.match(pattern);
  return match ? match[1] : '';
}

function testCurrentStatusDashboardSignals() {
  // Given current-backend comparison and completion signals
  const markup = renderStatusFixture({
    personalAttendanceRate: 82.5,
    cohortAverageAttendanceRate: 70,
    differencePercentagePoints: 12.5,
    rank: 3,
    cohortSize: 40,
    topPercentile: 7.5
  });

  // When the personal dashboard renders, then all five comparison signals exist.
  ['내 출석률', '전체 평균', '평균 대비', '전체 순위', '상위 백분율'].forEach(label => {
    assert.match(markup, new RegExp(label));
  });
  assert.match(markup, /\+12\.5%p/);
  assert.match(markup, /평균보다 높음/);
  assert.match(getMetricBlock(markup, 'data-status-metric', 'rank'), /3\s*\/\s*40/);
  assert.match(getMetricBlock(markup, 'data-status-metric', 'percentile'), /7\.5%/);

  // And all five count signals render from the current server counts.
  const expectedCounts = {
    attended: ['출석', '8회'],
    late: ['지각', '1회'],
    absent: ['결석', '2회'],
    excused: ['유고', '1회'],
    future: ['남은 수업', '4회']
  };
  Object.entries(expectedCounts).forEach(([key, values]) => {
    const block = getMetricBlock(markup, 'data-status-count', key);
    assert.ok(block, `${key} count tile missing`);
    values.forEach(value => assert.match(block, new RegExp(value)));
  });
  assert.match(markup, /<section class="status-details"/);
}

function testCurrentStatusFirstViewportCompositionContract() {
  // Given all five comparison and all five count signals are required at desktop density
  const markup = renderStatusFixture({
    personalAttendanceRate: 82.5,
    cohortAverageAttendanceRate: 70,
    differencePercentagePoints: 12.5,
    rank: 3,
    cohortSize: 40,
    topPercentile: 7.5
  });

  // When current status renders, then the two complete groups share one parallel wrapper before collapsed detail.
  assert.match(markup, /class="status-dashboard-layout"/);
  assert.match(markup, /class="status-dashboard-group status-comparison-group"/);
  assert.match(markup, /class="status-dashboard-group status-count-group"/);
  assert.ok(markup.indexOf('status-comparison-group') < markup.indexOf('status-count-group'));
  assert.strictEqual((markup.match(/data-status-metric=/g) || []).length, 5);
  assert.strictEqual((markup.match(/data-status-count=/g) || []).length, 5);
  const countGroupStart = markup.indexOf('status-count-group');
  const detailsStart = markup.indexOf('<section class="status-details"');
  assert.ok(detailsStart > countGroupStart);
  assert.doesNotMatch(markup, /<details class="status-details"/);
}

function testSettledDrawerCloseControlContract() {
  // Given the header toggle is the single close control while the mobile drawer is open
  const directSiblingPattern = /<div class="container">\s*<button[^>]*id="studentMenuButton"[\s\S]*?<\/button>\s*<header class="header">/;

  // When the drawer settles, then that control shares its stacking context and stays in the Tab loop.
  assert.match(studentHtmlSource, directSiblingPattern);
  assert.match(studentSource, /Array\.from\(drawer\.querySelectorAll\('\.mobile-drawer-button'\)\)\.concat\(menuButton\)/);
  assert.match(studentHtmlSource, /\.mobile-menu-button\s*\{[\s\S]*?height:\s*44px[\s\S]*?width:\s*44px[\s\S]*?z-index:\s*42/);
  assert.match(studentHtmlSource, /\.mobile-menu-drawer\s*\{[\s\S]*?z-index:\s*41/);
}

function testComparisonDeltaVariantsAndMissingMetrics() {
  const cases = [
    [{ personalAttendanceRate: 65, cohortAverageAttendanceRate: 70, differencePercentagePoints: -5, rank: 8, cohortSize: 40, topPercentile: 20 }, /-5\.0%p/, /평균보다 낮음/],
    [{ personalAttendanceRate: 70, cohortAverageAttendanceRate: 70, differencePercentagePoints: 0, rank: 10, cohortSize: 40, topPercentile: 25 }, /0\.0%p/, /평균과 동일/]
  ];
  cases.forEach(([comparison, valuePattern, notePattern]) => {
    const markup = renderStatusFixture(comparison);
    assert.match(getMetricBlock(markup, 'data-status-metric', 'difference'), valuePattern);
    assert.match(getMetricBlock(markup, 'data-status-metric', 'difference'), notePattern);
  });

  const missingMarkup = renderStatusFixture({
    personalAttendanceRate: null,
    cohortAverageAttendanceRate: Number.NaN,
    differencePercentagePoints: null,
    rank: null,
    cohortSize: 0,
    topPercentile: null
  });
  assert.match(getMetricBlock(missingMarkup, 'data-status-metric', 'rank'), /-\s*\/\s*0/);
  assert.match(getMetricBlock(missingMarkup, 'data-status-metric', 'percentile'), />-</);
  assert.doesNotMatch(missingMarkup, /NaN|Infinity/);
}

function testStatusEscapesIdentityAndIgnoresFutureReasonUi() {
  const markup = renderStatusFixture({
    personalAttendanceRate: 82.5,
    cohortAverageAttendanceRate: 70,
    differencePercentagePoints: 12.5,
    rank: 3,
    cohortSize: 40,
    topPercentile: 7.5
  }, {
    seasonLabel: '<svg onload="globalThis.injected=true">',
    name: '<img src=x onerror="globalThis.injected=true">',
    details: [{ attendanceType: 'absent', date: '<script>bad()</script>', displayReason: '<img src=x onerror=bad()>' }]
  });
  assert.match(markup, /&lt;svg onload=&quot;globalThis\.injected=true&quot;&gt;/);
  assert.match(markup, /&lt;img src=x onerror=&quot;globalThis\.injected=true&quot;&gt;/);
  assert.match(markup, /&lt;script&gt;bad\(\)&lt;\/script&gt;/);
  assert.doesNotMatch(markup, /<svg|<img|<script>/);
  assert.doesNotMatch(markup, /displayReason|onerror=bad/);
}

function testReasonDialogStaticAndRowContract() {
  const givenSafeReasonAndMalformedPayloads = [
    { attendanceType: 'excused', date: '2026-07-14 19:00', displayReason: '정상 공개 사유' },
    { attendanceType: 'absent', date: '2026-07-21 19:00' },
    { attendanceType: 'late', date: '2026-07-28 19:00', displayReason: '   ' },
    { attendanceType: 'absent', date: '2026-08-04 19:00', displayReason: 123 },
    { attendanceType: 'future', date: '2026-08-11 19:00', displayReason: '미래 사유' },
    { attendanceType: 'excused', date: '2026-08-18 19:00', displayReason: '공개\r비공개' },
    { attendanceType: 'late', date: '2026-08-25 19:00', displayReason: '공개\u0085비공개' },
    { attendanceType: 'absent', date: '2026-09-01 19:00', displayReason: '공개\u2028비공개' },
    { attendanceType: 'on_time', date: '2026-09-08 19:00', displayReason: '공개\u2029비공개' },
    { attendanceType: 'excused', date: '2026-09-15 19:00', displayReason: '공개\r\n\u2028비공개' }
  ];
  const whenDetailsRender = renderStatusFixture({
    personalAttendanceRate: 82.5,
    cohortAverageAttendanceRate: 70,
    differencePercentagePoints: 12.5,
    rank: 3,
    cohortSize: 40,
    topPercentile: 7.5
  }, { details: givenSafeReasonAndMalformedPayloads });

  const thenOnlySafeReasonRowIsDialogTrigger = whenDetailsRender;
  assert.doesNotMatch(thenOnlySafeReasonRowIsDialogTrigger, /data-attendance-detail-index="0"/);
  ['1', '2', '3', '4', '5', '6', '7', '8', '9'].forEach(index => {
    assert.doesNotMatch(thenOnlySafeReasonRowIsDialogTrigger, new RegExp(`data-attendance-detail-index="${index}"`));
  });
  assert.doesNotMatch(thenOnlySafeReasonRowIsDialogTrigger, /정상 공개 사유|displayReason|data-[^=]*reason/);

  const thenDialogLivesOutsideAtomicStatusRegion = {
    statusResultIndex: studentHtmlSource.indexOf('id="statusResult"'),
    dialogIndex: studentHtmlSource.indexOf('id="studentAttendanceDetailDialog"')
  };
  assert.ok(thenDialogLivesOutsideAtomicStatusRegion.statusResultIndex >= 0
    && thenDialogLivesOutsideAtomicStatusRegion.dialogIndex > thenDialogLivesOutsideAtomicStatusRegion.statusResultIndex);
  assert.match(studentHtmlSource, /id="studentAttendanceDetailDialog"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="studentAttendanceDetailTitle"[^>]*aria-describedby="studentAttendanceDetailDescription"/);
  assert.match(studentHtmlSource, /id="studentAttendanceDetailClose"[^>]*type="button"/);
}

function testDisplayReasonClientTrustBoundary() {
  // Given exact public statuses plus separator-bearing, future, and legacy payloads
  const context = createContext('', [
    'sanitizeStudentAttendanceDetails',
    'sanitizeStudentStatusResponseForCache'
  ]);
  const sanitized = JSON.parse(vm.runInContext(`JSON.stringify(sanitizeStudentAttendanceDetails([
    { attendanceType: 'on_time', displayReason: '정시 사유' },
    { attendanceType: 'late', displayReason: '지각 사유' },
    { attendanceType: 'absent', displayReason: '결석 사유' },
    { attendanceType: 'excused', displayReason: '유고 사유' },
    { attendanceType: 'on_time', displayReason: '앞\\r\\n뒤' },
    { attendanceType: 'late', displayReason: '앞\\n뒤' },
    { attendanceType: 'absent', displayReason: '앞\\r뒤' },
    { attendanceType: 'excused', displayReason: '앞\\u0085뒤' },
    { attendanceType: 'on_time', displayReason: '앞\\u2028뒤' },
    { attendanceType: 'late', displayReason: '앞\\u2029뒤' },
    { attendanceType: 'absent', displayReason: '\\u2028앞' },
    { attendanceType: 'excused', displayReason: '뒤\\u2029' },
    { attendanceType: 'future', displayReason: '예정 사유' },
    { attendanceType: 'ABSENT', displayReason: '대문자 상태 사유' },
    { attendanceType: ' absent ', displayReason: '공백 상태 사유' },
    { attendanceType: '__proto__', displayReason: '레거시 상태 사유' }
  ]))`, context));

  // When the untrusted details cross the client boundary
  const exactStatusReasons = sanitized.slice(0, 4).map(detail => detail.displayReason);
  const rejectedReasons = sanitized.slice(4).map(detail => detail.displayReason);

  // Then only single-line reasons on the four exact public statuses survive
  assert.deepStrictEqual(exactStatusReasons, ['정시 사유', '지각 사유', '결석 사유', '']);
  assert.deepStrictEqual(rejectedReasons, Array(rejectedReasons.length).fill(''));

  const cachedDetails = JSON.parse(vm.runInContext(`JSON.stringify(sanitizeStudentStatusResponseForCache({
    success: true,
    data: {
      details: [
        { attendanceType: 'excused', date: '2026-07-14', displayReason: '안전 사유', rawNote: true },
        { attendanceType: 'future', date: '2026-07-21', displayReason: '예정 사유', rawNote: true },
        { attendanceType: 'absent', date: '2026-07-28', displayReason: '앞\\u2028뒤', rawNote: true }
      ]
    }
  }).data.details)`, context));
  assert.deepStrictEqual(cachedDetails.map(detail => Object.keys(detail).sort()), [
    ['attendanceType', 'date', 'time'],
    ['attendanceType', 'date', 'time'],
    ['attendanceType', 'date', 'time']
  ]);
}

function createReasonDialogContext() {
  return createContext(`
    let studentStatusDetails = [];
    let studentAttendanceDetailTrigger = null;
    let studentAttendanceDetailPreviousBodyOverflow = null;
    let studentAttendanceDetailInitialized = false;
    let studentAttendanceDetailFocusGeneration = 0;
    let studentAttendanceDetailFocusTimer = null;
    let studentStatusViewGeneration = 0;
    let studentAttendanceDetailFocusFailuresRemaining = 0;
    const focusLog = [];
    const animationFrames = [];
    const listeners = { statusResult: {}, dialog: {}, close: {}, document: {} };
    const nodes = {};
    const document = {
      activeElement: null,
      body: { style: { overflow: 'clip' } },
      getElementById(id) { return nodes[id] || null; },
      addEventListener(type, listener) { listeners.document[type] = listener; }
    };
    function requestAnimationFrame(callback) {
      animationFrames.push(callback);
      return animationFrames.length;
    }
    function flushAnimationFrames() {
      const pending = animationFrames.splice(0);
      pending.forEach(callback => callback(0));
    }
    function createNode(id, listenerBucket) {
      const attributes = {};
      const classes = new Set();
      return {
        id,
        attributes,
        classList: {
          add(value) { classes.add(value); },
          remove(value) { classes.delete(value); },
          contains(value) { return classes.has(value); }
        },
        disabled: false,
        hidden: false,
        isConnected: true,
        style: {},
        textContent: '',
        innerHTML: '',
        addEventListener(type, listener) { listeners[listenerBucket][type] = listener; },
        getAttribute(name) { return Object.prototype.hasOwnProperty.call(attributes, name) ? attributes[name] : null; },
        hasAttribute(name) { return Object.prototype.hasOwnProperty.call(attributes, name); },
        removeAttribute(name) { delete attributes[name]; },
        setAttribute(name, value) { attributes[name] = String(value); },
        focus() {
          focusLog.push(id);
          if (id === 'studentAttendanceDetailClose' && studentAttendanceDetailFocusFailuresRemaining > 0) {
            studentAttendanceDetailFocusFailuresRemaining--;
            return;
          }
          document.activeElement = this;
        }
      };
    }
    const statusResult = createNode('statusResult', 'statusResult');
    const dialog = createNode('studentAttendanceDetailDialog', 'dialog');
    const closeButton = createNode('studentAttendanceDetailClose', 'close');
    const trigger = createNode('reasonTrigger', 'statusResult');
    const secondTrigger = createNode('secondReasonTrigger', 'statusResult');
    trigger.setAttribute('data-attendance-detail-index', '0');
    secondTrigger.setAttribute('data-attendance-detail-index', '1');
    dialog.setAttribute('aria-hidden', 'true');
    dialog.setAttribute('inert', '');
    dialog.querySelectorAll = () => [closeButton];
    dialog.contains = node => node === closeButton;
    statusResult.contains = node => node === trigger || node === secondTrigger;
    nodes.statusResult = statusResult;
    nodes.secondReasonTrigger = secondTrigger;
    nodes.statusPhoneInput = createNode('statusPhoneInput', 'statusResult');
    nodes.studentAttendanceDetailDialog = dialog;
    nodes.studentAttendanceDetailClose = closeButton;
    nodes.studentAttendanceDetailStatus = createNode('studentAttendanceDetailStatus', 'dialog');
    nodes.studentAttendanceDetailDate = createNode('studentAttendanceDetailDate', 'dialog');
    nodes.studentAttendanceDetailTime = createNode('studentAttendanceDetailTime', 'dialog');
    nodes.studentAttendanceDetailReason = createNode('studentAttendanceDetailReason', 'dialog');
    function escapeHtml(value) { return String(value || '').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
    function getDisplayErrorMessage(error, fallback) { return error && error.message ? error.message : fallback; }
  `, [
    'getStudentAttendanceStatusMeta',
    'sanitizeStudentAttendanceDetails',
    'closeStudentAttendanceDetailDialog',
    'clearStudentAttendanceDetailState',
    'resetStudentStatusResult',
    'openStudentAttendanceDetailDialog',
    'handleStudentAttendanceDetailDialogKeydown',
    'initializeStudentAttendanceDetailDialog',
    'handleStatusError'
  ]);
}

function testReasonDialogInteractionAndCleanup() {
  const context = createReasonDialogContext();
  vm.runInContext(`
    studentStatusDetails = sanitizeStudentAttendanceDetails([
      {
        attendanceType: 'late',
        date: '<b>2026-07-14</b> 19:00',
        displayReason: '<img src=x onerror="globalThis.injected=true">'
      },
      { attendanceType: '__proto__', date: '2026-07-21', displayReason: '두 번째 사유' }
    ]);
    initializeStudentAttendanceDetailDialog();
  `, context);

  assert.strictEqual(vm.runInContext(`openStudentAttendanceDetailDialog('1e0', trigger)`, context), false);
  assert.strictEqual(vm.runInContext(`openStudentAttendanceDetailDialog('0x0', trigger)`, context), false);
  assert.strictEqual(vm.runInContext(`studentStatusDetails[1].attendanceType`, context), 'absent');

  vm.runInContext(`listeners.statusResult.click({
    target: { closest() { return trigger; } }
  })`, context);
  assert.strictEqual(vm.runInContext(`nodes.studentAttendanceDetailStatus.textContent`, context), '지각');
  assert.strictEqual(vm.runInContext(`nodes.studentAttendanceDetailDate.textContent`, context), '<b>2026-07-14</b>');
  assert.strictEqual(vm.runInContext(`nodes.studentAttendanceDetailTime.textContent`, context), '19:00');
  assert.strictEqual(
    vm.runInContext(`nodes.studentAttendanceDetailReason.textContent`, context),
    '<img src=x onerror="globalThis.injected=true">'
  );
  assert.strictEqual(vm.runInContext(`globalThis.injected`, context), undefined);
  assert.strictEqual(vm.runInContext(`dialog.getAttribute('aria-hidden')`, context), 'false');
  assert.strictEqual(vm.runInContext(`dialog.hasAttribute('inert')`, context), false);
  assert.strictEqual(vm.runInContext(`dialog.classList.contains('is-open')`, context), true);
  assert.strictEqual(vm.runInContext(`document.body.style.overflow`, context), 'hidden');
  assert.strictEqual(vm.runInContext(`document.activeElement === closeButton`, context), true);

  const tabResult = vm.runInContext(`(() => {
    let prevented = false;
    handleStudentAttendanceDetailDialogKeydown({ key: 'Tab', shiftKey: false, preventDefault() { prevented = true; } });
    return { prevented, focused: document.activeElement === closeButton };
  })()`, context);
  assert.deepStrictEqual({ prevented: tabResult.prevented, focused: tabResult.focused }, { prevented: true, focused: true });
  const shiftTabResult = vm.runInContext(`(() => {
    let prevented = false;
    handleStudentAttendanceDetailDialogKeydown({ key: 'Tab', shiftKey: true, preventDefault() { prevented = true; } });
    return { prevented, focused: document.activeElement === closeButton };
  })()`, context);
  assert.deepStrictEqual({ prevented: shiftTabResult.prevented, focused: shiftTabResult.focused }, { prevented: true, focused: true });

  vm.runInContext(`listeners.dialog.click({ target: dialog })`, context);
  assert.strictEqual(vm.runInContext(`dialog.getAttribute('aria-hidden')`, context), 'true');
  assert.strictEqual(vm.runInContext(`dialog.hasAttribute('inert')`, context), true);
  assert.strictEqual(vm.runInContext(`document.body.style.overflow`, context), 'clip');
  assert.strictEqual(vm.runInContext(`document.activeElement === trigger`, context), true);

  vm.runInContext(`openStudentAttendanceDetailDialog('0', trigger)`, context);
  const escapeResult = vm.runInContext(`(() => {
    let prevented = false;
    handleStudentAttendanceDetailDialogKeydown({ key: 'Escape', preventDefault() { prevented = true; } });
    return { prevented, focused: document.activeElement === trigger };
  })()`, context);
  assert.deepStrictEqual({ prevented: escapeResult.prevented, focused: escapeResult.focused }, { prevented: true, focused: true });
  assert.strictEqual(vm.runInContext(`document.body.style.overflow`, context), 'clip');

  vm.runInContext(`openStudentAttendanceDetailDialog('0', trigger); handleStatusError(new Error('<실패>'))`, context);
  assert.strictEqual(vm.runInContext(`studentStatusDetails.length`, context), 0);
  assert.strictEqual(vm.runInContext(`dialog.getAttribute('aria-hidden')`, context), 'true');
  assert.strictEqual(vm.runInContext(`document.body.style.overflow`, context), 'clip');
  assert.strictEqual(vm.runInContext(`document.activeElement.id`, context), 'statusPhoneInput');
  assert.match(vm.runInContext(`statusResult.innerHTML`, context), /&lt;실패&gt;/);
}

function testReasonDialogPointerFocusSettlementAndStaleGuards() {
  const context = createReasonDialogContext();
  vm.runInContext(`
    studentStatusDetails = sanitizeStudentAttendanceDetails([
      { attendanceType: 'late', date: '2026-07-14 19:00', displayReason: '첫 번째 사유' },
      { attendanceType: 'absent', date: '2026-07-21', displayReason: '두 번째 사유' }
    ]);
    initializeStudentAttendanceDetailDialog();
  `, context);

  // Given a native pointer default action can restore focus to its trigger after the delegated click handler
  vm.runInContext(`listeners.statusResult.click({ target: { closest() { return trigger; } } });`, context);
  vm.runInContext(`document.activeElement = trigger;`, context);

  // When the bounded post-click frame runs, then the visible dialog owns focus.
  vm.runInContext(`flushAnimationFrames(); flushAnimationFrames();`, context);
  assert.strictEqual(vm.runInContext(`document.activeElement === closeButton`, context), true);

  // Given the dialog closes before its queued confirmation, then stale work must not refocus it.
  vm.runInContext(`
    openStudentAttendanceDetailDialog('0', trigger);
    document.activeElement = trigger;
    flushAnimationFrames();
    handleStudentAttendanceDetailDialogKeydown({ key: 'Escape', preventDefault() {} });
    flushAnimationFrames();
  `, context);
  assert.strictEqual(vm.runInContext(`dialog.getAttribute('aria-hidden')`, context), 'true');
  assert.strictEqual(vm.runInContext(`document.activeElement === trigger`, context), true);

  // Given a programmatic reset preserves external focus, then stale work must remain inert.
  vm.runInContext(`
    studentStatusDetails = sanitizeStudentAttendanceDetails([
      { attendanceType: 'late', date: '2026-07-14 19:00', displayReason: '첫 번째 사유' },
      { attendanceType: 'absent', date: '2026-07-21', displayReason: '두 번째 사유' }
    ]);
    openStudentAttendanceDetailDialog('0', trigger);
    document.activeElement = nodes.statusPhoneInput;
    flushAnimationFrames();
    resetStudentStatusResult();
    flushAnimationFrames();
  `, context);
  assert.strictEqual(vm.runInContext(`dialog.getAttribute('aria-hidden')`, context), 'true');
  assert.strictEqual(vm.runInContext(`document.activeElement === nodes.statusPhoneInput`, context), true);

  // Given two opens race in one frame, then only the newest dialog state may confirm focus.
  vm.runInContext(`
    studentStatusDetails = sanitizeStudentAttendanceDetails([
      { attendanceType: 'late', date: '2026-07-14 19:00', displayReason: '첫 번째 사유' },
      { attendanceType: 'absent', date: '2026-07-21', displayReason: '두 번째 사유' }
    ]);
    openStudentAttendanceDetailDialog('0', trigger);
    document.activeElement = trigger;
    openStudentAttendanceDetailDialog('1', secondTrigger);
    document.activeElement = secondTrigger;
    flushAnimationFrames();
    flushAnimationFrames();
  `, context);
  assert.strictEqual(vm.runInContext(`nodes.studentAttendanceDetailReason.textContent`, context), '두 번째 사유');
  assert.strictEqual(vm.runInContext(`studentAttendanceDetailTrigger === secondTrigger`, context), true);
  assert.strictEqual(vm.runInContext(`document.activeElement === closeButton`, context), true);
}

async function testReasonDialogFreshHiddenOpenRetriesUntilCloseFocusIsAcquired() {
  const context = createReasonDialogContext();
  vm.runInContext(`
    studentStatusDetails = sanitizeStudentAttendanceDetails([
      { attendanceType: 'absent', date: '2026-07-21', displayReason: '새 다이얼로그 사유' }
    ]);
    initializeStudentAttendanceDetailDialog();
    studentAttendanceDetailFocusFailuresRemaining = 3;
    listeners.statusResult.click({ target: { closest() { return trigger; } } });
    flushAnimationFrames();
    flushAnimationFrames();
  `, context);

  await new Promise(resolve => setTimeout(resolve, 80));

  assert.strictEqual(
    vm.runInContext(`document.activeElement === closeButton`, context),
    true,
    'fresh hidden dialog must retry until the close button actually acquires focus'
  );
}

function testReasonDialogRepeatedPointerAndPendingResetFocus() {
  const context = createReasonDialogContext();
  vm.runInContext(`
    studentStatusDetails = sanitizeStudentAttendanceDetails([
      { attendanceType: 'late', date: '2026-07-14 19:00', displayReason: '반복 사유' }
    ]);
    initializeStudentAttendanceDetailDialog();
  `, context);

  // Given repeated native pointer focus returns to the trigger after delegated click
  for (let cycle = 0; cycle < 10; cycle++) {
    vm.runInContext(`
      listeners.statusResult.click({ target: { closest() { return trigger; } } });
      document.activeElement = trigger;
      flushAnimationFrames();
      flushAnimationFrames();
    `, context);

    // When focus settlement completes, then every open owns focus and every close restores exact state
    assert.strictEqual(vm.runInContext(`document.activeElement === closeButton`, context), true);
    vm.runInContext(`listeners.close.click()`, context);
    assert.strictEqual(vm.runInContext(`document.activeElement === trigger`, context), true);
    assert.strictEqual(vm.runInContext(`document.body.style.overflow`, context), 'clip');
    assert.strictEqual(vm.runInContext(`dialog.getAttribute('aria-hidden')`, context), 'true');
  }

  // Given reset occurs while the pointer-settlement task is still pending
  vm.runInContext(`
    openStudentAttendanceDetailDialog('0', trigger);
    document.activeElement = trigger;
    resetStudentStatusResult();
    flushAnimationFrames();
    flushAnimationFrames();
  `, context);

  // Then reset moves focus to the connected safe field and stale work cannot reclaim it
  assert.strictEqual(vm.runInContext(`document.activeElement === nodes.statusPhoneInput`, context), true);
  assert.strictEqual(vm.runInContext(`document.body.style.overflow`, context), 'clip');

  vm.runInContext(`
    studentStatusDetails = sanitizeStudentAttendanceDetails([
      { attendanceType: 'late', date: '2026-07-14 19:00', displayReason: '반복 사유' }
    ]);
    trigger.isConnected = false;
    openStudentAttendanceDetailDialog('0', trigger);
    document.activeElement = trigger;
    resetStudentStatusResult();
  `, context);
  assert.strictEqual(vm.runInContext(`document.activeElement === nodes.statusPhoneInput`, context), true);

  vm.runInContext(`
    studentStatusDetails = sanitizeStudentAttendanceDetails([
      { attendanceType: 'late', date: '2026-07-14 19:00', displayReason: '반복 사유' }
    ]);
    trigger.isConnected = true;
    nodes.externalControl = createNode('externalControl', 'document');
    openStudentAttendanceDetailDialog('0', trigger);
    document.activeElement = nodes.externalControl;
    resetStudentStatusResult();
  `, context);
  assert.strictEqual(vm.runInContext(`document.activeElement === nodes.externalControl`, context), true);
}

function testDetachedReasonTriggerFallsBackToSafeFocus() {
  const context = createReasonDialogContext();
  vm.runInContext(`
    studentStatusDetails = sanitizeStudentAttendanceDetails([
      { attendanceType: 'late', date: '2026-07-14 19:00', displayReason: '공개 사유' }
    ]);
    initializeStudentAttendanceDetailDialog();
  `, context);

  const closeActions = [
    `handleStudentAttendanceDetailDialogKeydown({ key: 'Escape', preventDefault() {} })`,
    `listeners.close.click()`,
    `listeners.dialog.click({ target: dialog })`
  ];

  closeActions.forEach(action => {
    vm.runInContext(`
      trigger.isConnected = true;
      openStudentAttendanceDetailDialog('0', trigger);
      trigger.isConnected = false;
      ${action};
    `, context);
    assert.strictEqual(vm.runInContext(`document.activeElement === nodes.statusPhoneInput`, context), true);
    assert.strictEqual(vm.runInContext(`document.activeElement.isConnected`, context), true);
    assert.strictEqual(vm.runInContext(`dialog.getAttribute('aria-hidden')`, context), 'true');
  });

  vm.runInContext(`
    trigger.isConnected = true;
    openStudentAttendanceDetailDialog('0', trigger);
    document.activeElement = nodes.statusPhoneInput;
    closeStudentAttendanceDetailDialog({ restoreFocus: false });
  `, context);
  assert.strictEqual(vm.runInContext(`document.activeElement === nodes.statusPhoneInput`, context), true);

  vm.runInContext(`
    openStudentAttendanceDetailDialog('0', trigger);
    closeStudentAttendanceDetailDialog({ restoreFocus: false });
  `, context);
  assert.strictEqual(vm.runInContext(`document.activeElement === nodes.statusPhoneInput`, context), true);
}

async function testNewestStatusLookupOwnsUi() {
  const context = createContext(`
    let studentStatusViewGeneration = 0;
    let inputValue = '01011111111';
    let displayed = [];
    let errors = [];
    let resolveFirst;
    let resolveSecond;
    let detailResetCount = 0;
    const statusResult = { innerHTML: '', style: {} };
    const document = {
      getElementById(id) {
        if (id === 'statusPhoneInput') return { value: inputValue };
        if (id === 'statusResult') return statusResult;
        return null;
      }
    };
    function normalizeStudentPhone(value) { return String(value || ''); }
    function isValidStudentPhone() { return true; }
    function saveLastUsedStudentPhone() {}
    function resetStudentStatusResult() {
      detailResetCount++;
      studentStatusViewGeneration++;
      statusResult.innerHTML = '';
      statusResult.style.display = 'none';
    }
    function fetchStudentStatus(phone) {
      return new Promise(resolve => {
        if (phone === '01011111111') resolveFirst = resolve;
        else resolveSecond = resolve;
      });
    }
    function handleStatusResponse(response) { displayed.push(response.marker); }
    function handleHistoricalAccessError() { return false; }
    function handleStatusError(error) { errors.push(error.message); }
    function alert() {}
  `, ['checkAttendanceStatus']);

  const event = { preventDefault() {} };
  context.event = event;
  const older = vm.runInContext('checkAttendanceStatus(event)', context);
  vm.runInContext("inputValue = '01022222222'", context);
  const newer = vm.runInContext('checkAttendanceStatus(event)', context);
  vm.runInContext("resolveSecond({ success: true, marker: 'newest' })", context);
  await newer;
  vm.runInContext("resolveFirst({ success: true, marker: 'older' })", context);
  await older;

  assert.deepStrictEqual(Array.from(vm.runInContext('displayed', context)), ['newest']);
  assert.strictEqual(vm.runInContext('detailResetCount', context), 2);
  assert.deepStrictEqual(Array.from(vm.runInContext('errors', context)), []);
}

async function testInvalidStatusLookupInvalidatesInFlightResponse() {
  const context = createContext(`
    let studentStatusViewGeneration = 0;
    let inputValue = '01011111111';
    let displayed = [];
    let resolveStatus;
    let alertCount = 0;
    const statusResult = { innerHTML: 'old detail', style: {} };
    const document = {
      getElementById(id) {
        if (id === 'statusPhoneInput') return { value: inputValue };
        if (id === 'statusResult') return statusResult;
        return null;
      }
    };
    function normalizeStudentPhone(value) { return String(value || ''); }
    function isValidStudentPhone() { return true; }
    function saveLastUsedStudentPhone() {}
    function resetStudentStatusResult() {
      studentStatusViewGeneration++;
      statusResult.innerHTML = '';
      statusResult.style.display = 'none';
    }
    function fetchStudentStatus() { return new Promise(resolve => { resolveStatus = resolve; }); }
    function handleStatusResponse(response) { displayed.push(response.marker); }
    function handleHistoricalAccessError() { return false; }
    function handleStatusError() {}
    function alert() { alertCount++; }
  `, ['checkAttendanceStatus']);
  context.event = { preventDefault() {} };

  const older = vm.runInContext('checkAttendanceStatus(event)', context);
  vm.runInContext(`inputValue = ''`, context);
  await vm.runInContext('checkAttendanceStatus(event)', context);
  vm.runInContext(`resolveStatus({ success: true, marker: 'stale' })`, context);
  await older;

  assert.deepStrictEqual(Array.from(vm.runInContext('displayed', context)), []);
  assert.strictEqual(vm.runInContext('studentStatusViewGeneration', context), 2);
  assert.strictEqual(vm.runInContext('alertCount', context), 1);
  assert.strictEqual(vm.runInContext('statusResult.innerHTML', context), '');
}

async function testNewestStatusRequestOwnsCache() {
  const context = createContext(`
    let currentSeason = 'season_07';
    let studentStatusCacheGeneration = 0;
    let studentStatusRequestSequence = 0;
    let studentStatusCache = { key: '', loadedAt: 0, response: null };
    const STUDENT_STATUS_CACHE_TTL_MS = 10000;
    let resolveFirst;
    let resolveSecond;
    function normalizeStudentPhone(value) { return String(value || ''); }
    function normalizeSeasonAlias(value) { return value; }
    function buildSeasonParams(value) { return value; }
    function callStudentApi(action, params) {
      return new Promise(resolve => {
        if (params.phone === '01011111111') resolveFirst = resolve;
        else resolveSecond = resolve;
      });
    }
  `, ['sanitizeStudentAttendanceDetails', 'sanitizeStudentStatusResponseForCache', 'fetchStudentStatus']);

  const older = vm.runInContext("fetchStudentStatus('01011111111')", context);
  const newer = vm.runInContext("fetchStudentStatus('01022222222')", context);
  vm.runInContext("resolveSecond({ success: true, marker: 'newest' })", context);
  await newer;
  vm.runInContext("resolveFirst({ success: true, marker: 'older' })", context);
  await older;

  assert.strictEqual(vm.runInContext('studentStatusCache.response.marker', context), 'newest');
  assert.match(vm.runInContext('studentStatusCache.key', context), /01022222222$/);
}

async function testStatusCacheRetainsOnlyRenderSafeDetailFields() {
  const context = createContext(`
    let currentSeason = 'season_07';
    let studentStatusCacheGeneration = 0;
    let studentStatusRequestSequence = 0;
    let studentStatusCache = { key: '', loadedAt: 0, response: null };
    const STUDENT_STATUS_CACHE_TTL_MS = 10000;
    let apiCalls = 0;
    const safeReason = '  공개 가능한 사유  ';
    const networkResponse = {
      success: true,
      marker: 'kept',
      data: {
        name: '회원',
        rate: 87.5,
        insights: { comparison: { rank: 2 } },
        details: [
          {
            attendanceType: 'excused',
            date: '2026-07-14',
            time: '19:00',
            displayReason: safeReason,
            note: true,
            rawNote: true,
            priorNote: true,
            audit: true,
            phone: true,
            name: true
          },
          { attendanceType: 'absent', date: '2026-07-21', time: '19:00', displayReason: '   ', note: true },
          { attendanceType: 'late', date: '2026-07-28', time: '19:00', displayReason: '가'.repeat(301), rawNote: true },
          { attendanceType: 'excused', date: '2026-08-04', time: '19:00', displayReason: '공개\u2028비공개', rawNote: true },
          { attendanceType: 'future', date: '2026-08-11', time: '19:00', displayReason: '미래 사유', rawNote: true }
        ]
      }
    };
    function normalizeStudentPhone(value) { return String(value || ''); }
    function normalizeSeasonAlias(value) { return value; }
    function buildSeasonParams(value) { return value; }
    function callStudentApi() { apiCalls++; return Promise.resolve(networkResponse); }
  `, ['sanitizeStudentAttendanceDetails', 'sanitizeStudentStatusResponseForCache', 'fetchStudentStatus']);

  const firstResponse = await vm.runInContext(`fetchStudentStatus('01012345678')`, context);
  const replayResponse = await vm.runInContext(`fetchStudentStatus('01012345678')`, context);
  const cachedDetailKeys = vm.runInContext(`studentStatusCache.response.data.details.map(detail => Object.keys(detail).sort())`, context);

  assert.deepStrictEqual(
    Array.from(cachedDetailKeys, keys => Array.from(keys)),
    [
      ['attendanceType', 'date', 'time'],
      ['attendanceType', 'date', 'time'],
      ['attendanceType', 'date', 'time'],
      ['attendanceType', 'date', 'time'],
      ['attendanceType', 'date', 'time']
    ]
  );
  assert.strictEqual(vm.runInContext(`studentStatusCache.response.data.details[0].displayReason`, context), undefined);
  assert.strictEqual(vm.runInContext(`networkResponse.data.details[0].displayReason === safeReason`, context), true);
  assert.strictEqual(vm.runInContext(`networkResponse.data.details[0].rawNote`, context), true);
  assert.strictEqual(vm.runInContext(`studentStatusCache.response !== networkResponse`, context), true);
  assert.strictEqual(vm.runInContext(`studentStatusCache.response.data !== networkResponse.data`, context), true);
  assert.strictEqual(vm.runInContext(`studentStatusCache.response.data.details[0] !== networkResponse.data.details[0]`, context), true);
  assert.strictEqual(vm.runInContext(`studentStatusCache.response.data.insights === networkResponse.data.insights`, context), true);
  assert.strictEqual(vm.runInContext(`studentStatusCache.response.marker`, context), 'kept');
  assert.strictEqual(vm.runInContext(`apiCalls`, context), 1);
  assert.strictEqual(firstResponse, replayResponse);
}

function testServerRankingOrderPreserved() {
  const context = createContext('', ['normalizeAndSortRankings']);
  const rankings = vm.runInContext(`normalizeAndSortRankings([
    { rank: 2, name: '가', attendedCount: 5, avgAttendOffsetSeconds: 10 },
    { rank: 1, name: 'A', attendedCount: 5, avgAttendOffsetSeconds: 10 }
  ])`, context);
  assert.deepStrictEqual(Array.from(rankings, item => `${item.rank}:${item.name}`), ['1:A', '2:가']);

  const fallback = vm.runInContext(`normalizeAndSortRankings([
    { name: '가', attendedCount: 5, avgAttendOffsetSeconds: 10 },
    { name: 'A', attendedCount: 5, avgAttendOffsetSeconds: 10 }
  ])`, context);
  assert.deepStrictEqual(Array.from(fallback, item => item.rank), [1, 2]);
}

async function testStatusCacheGeneration() {
  const context = createContext(`
    let currentSeason = 'season_07';
    let studentStatusCacheGeneration = 0;
    let studentStatusRequestSequence = 0;
    let studentStatusViewGeneration = 0;
    let studentStatusCache = { key: '', loadedAt: 0, response: null };
    const STUDENT_STATUS_CACHE_TTL_MS = 10000;
    let apiCalls = 0;
    let resolveFirst;
    const firstResponse = new Promise(resolve => { resolveFirst = resolve; });
    function normalizeStudentPhone(value) { return String(value || '').replace(/[^0-9]/g, '').slice(0, 11); }
    function normalizeSeasonAlias(value) { return value; }
    function buildSeasonParams(value) { return value; }
    function callStudentApi() {
      apiCalls++;
      return apiCalls === 1 ? firstResponse : Promise.resolve({ success: true, marker: 'fresh' });
    }
    function clearStudentAttendanceDetailState() {}
  `, ['sanitizeStudentAttendanceDetails', 'sanitizeStudentStatusResponseForCache', 'invalidateStudentStatusCache', 'fetchStudentStatus']);

  const pending = vm.runInContext(`fetchStudentStatus('01012345678')`, context);
  vm.runInContext('invalidateStudentStatusCache()', context);
  vm.runInContext(`resolveFirst({ success: true, marker: 'stale' })`, context);
  const result = await pending;

  assert.strictEqual(vm.runInContext('apiCalls', context), 2);
  assert.strictEqual(result.marker, 'fresh');
  assert.strictEqual(vm.runInContext('studentStatusCache.response.marker', context), 'fresh');
}

async function testRankingRequestCoordination() {
  const context = createContext(`
    let currentSeason = 'season_07';
    let studentRankingCacheGeneration = 0;
    let studentRankingCache = { season: '', loadedAt: 0, response: null };
    let studentRankingRequest = { season: '', promise: null };
    const STUDENT_RANKING_CACHE_TTL_MS = 10000;
    let apiCalls = 0;
    let displayed = [];
    let errors = [];
    let resolveFirst;
    let resolveSecond;
    function normalizeSeasonAlias(value) { return value; }
    function buildSeasonParams(value) { return value || {}; }
    function displayRankings(response) { displayed.push(response.marker); }
    function handleHistoricalAccessError() { return false; }
    function handleRankingError(error) { errors.push(error.message); }
    function callStudentApi() {
      apiCalls++;
      if (apiCalls === 1) return new Promise(resolve => { resolveFirst = resolve; });
      if (apiCalls === 2) return new Promise(resolve => { resolveSecond = resolve; });
      return Promise.resolve({ success: true, marker: 'unexpected' });
    }
  `, ['invalidateStudentRankingCache', 'loadRankings']);

  const sharedA = vm.runInContext('loadRankings()', context);
  const sharedB = vm.runInContext('loadRankings()', context);
  assert.strictEqual(vm.runInContext('apiCalls', context), 1);
  vm.runInContext(`resolveFirst({ success: true, marker: 'shared' })`, context);
  await Promise.all([sharedA, sharedB]);
  assert.deepStrictEqual(Array.from(vm.runInContext('displayed', context)), ['shared']);

  vm.runInContext('invalidateStudentRankingCache(); displayed = []', context);
  const oldRequest = vm.runInContext('loadRankings()', context);
  vm.runInContext('invalidateStudentRankingCache()', context);
  const freshRequest = vm.runInContext('loadRankings()', context);
  vm.runInContext(`resolveSecond({ success: true, marker: 'stale' })`, context);
  await oldRequest;
  await freshRequest;

  assert.deepStrictEqual(Array.from(vm.runInContext('displayed', context)), ['unexpected']);
  assert.deepStrictEqual(Array.from(vm.runInContext('errors', context)), []);
}

function createCompletionRendererContext() {
  return createContext(`
    function escapeHtml(value) {
      return String(value || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }
    function toSafeInteger(value, fallbackValue) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return Math.floor(parsed);
      const fallback = Number(fallbackValue);
      return Number.isFinite(fallback) ? Math.floor(fallback) : 0;
    }
    function toSafeNumber(value, fallbackValue) {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
      const fallback = Number(fallbackValue);
      return Number.isFinite(fallback) ? fallback : 0;
    }
    function formatOneDecimal(value) { return toSafeNumber(value, 0).toFixed(1); }
  `, ['getRequiredSessions', 'renderRequiredSessionCriteria', 'renderCompletionAssessment']);
}

function testCompletionBaselineCharacterization() {
  const context = createCompletionRendererContext();
  const markup = vm.runInContext(`renderCompletionAssessment({
    seasonLabel: '<b>15기</b>',
    name: '<img src=x onerror=bad()>',
    attended: 99,
    lateCount: 99,
    absentCount: 99,
    excusedCount: 99
  }, {
    requiredAttendanceCount: 10,
    attendedCount: 7,
    lateCount: 2,
    absentCount: 1,
    excusedCount: 1,
    remainingSessions: 4,
    futureCount: 9,
    minimumFutureParticipation: 3,
    lateToAbsenceRatio: 3,
    absenceEquivalent: 1.7,
    absenceEquivalentRate: 17,
    maxAbsenceEquivalent: 2.5,
    remainingAbsenceAllowance: 0.8,
    isFinal: false,
    isGraduationPossible: true,
    meetsAttendanceCount: false,
    attendancePossible: true,
    meetsAbsenceThreshold: true,
    requiredSessions: [
      { position: 'first', date: '<첫날>', status: 'on_time', satisfied: true, possible: true },
      { position: 'last', date: '마지막 날', status: 'future', satisfied: false, possible: true }
    ]
  })`, context);

  const metricLabels = [
    '수료 필요 출석',
    '현재 출석',
    '남은 수업',
    '최소 참여 필요',
    '현재 지각',
    '환산 결석',
    '현재 환산 결석률',
    '남은 결석 여유'
  ];
  metricLabels.forEach(label => {
    assert.strictEqual(markup.split(`<span class="metric-label">${label}</span>`).length - 1, 1, `${label} metric must remain exactly once`);
  });
  ['출석 횟수 기준', '환산 결석 기준', '첫 회차', '마지막 회차'].forEach(label => assert.match(markup, new RegExp(label)));
  assert.match(markup, /남은 4회 중 최소 3회 참여가 필요합니다\./);
  assert.match(markup, /지각 3회 = 결석 1회/);
  assert.match(markup, /1\.7회/);
  assert.match(markup, /17\.0%/);
  assert.match(markup, /&lt;b&gt;15기&lt;\/b&gt;/);
  assert.match(markup, /&lt;img src=x onerror=bad\(\)&gt;/);
  assert.match(markup, /&lt;첫날&gt;/);
  assert.doesNotMatch(markup, /<b>|<img|<첫날>/);

  const fallbackMarkup = vm.runInContext(`renderCompletionAssessment({}, {
    isGraduationPossible: false,
    requiredSessionsOk: false,
    requiredSessionsPossible: true
  })`, context);
  metricLabels.forEach(label => assert.match(fallbackMarkup, new RegExp(label)));
  assert.match(fallbackMarkup, /남은 필수 회차에 참여하면 충족할 수 있습니다\./);
  assert.doesNotMatch(fallbackMarkup, /NaN|Infinity/);

  const initialCompletionResult = studentHtmlSource.match(/<div id="completionResult"[\s\S]*?<\/div>\s*<\/div>\s*<\/div>/);
  assert.ok(initialCompletionResult, 'initial completion result must exist');
  assert.match(initialCompletionResult[0], /내 수료 가능 여부를 바로 확인하세요/);
}

function testCompletionDesktopCompositionContract() {
  // Given a current completion payload with every calculation signal
  const context = createCompletionRendererContext();
  const markup = vm.runInContext(`renderCompletionAssessment({ seasonLabel: '15기', name: '회원' }, {
    requiredAttendanceCount: 10,
    attendedCount: 7,
    lateCount: 2,
    absentCount: 1,
    excusedCount: 1,
    remainingSessions: 4,
    minimumFutureParticipation: 3,
    lateToAbsenceRatio: 3,
    absenceEquivalent: 1.7,
    absenceEquivalentRate: 17,
    maxAbsenceEquivalent: 2.5,
    remainingAbsenceAllowance: 0.8,
    isGraduationPossible: true,
    meetsAttendanceCount: false,
    attendancePossible: true,
    meetsAbsenceThreshold: true,
    requiredSessionsOk: false,
    requiredSessionsPossible: true
  })`, context);

  // When the assessment is rendered, then overview/metrics and criteria use one semantic desktop wrapper.
  assert.match(markup, /class="completion-assessment-layout"/);
  assert.match(markup, /<section class="completion-overview"[^>]*aria-label="수료 가능 여부와 출석 지표"/);
  assert.match(markup, /<section class="completion-criteria"[^>]*aria-label="수료 기준"/);
  assert.ok(markup.indexOf('class="completion-overview"') < markup.indexOf('class="completion-criteria"'));
  assert.strictEqual((markup.match(/class="metric-grid count-grid completion-metric-grid"/g) || []).length, 2);
}

function testCompletionPersistentStudyNoticeContract() {
  // Given every completion state replaces only #completionResult
  const exactNotice = '이 화면에는 스터디 출석이 반영되지 않습니다. 최종 수료 여부는 스터디 출석률에 따라 달라질 수 있습니다.';
  const completionPanelStart = studentHtmlSource.indexOf('id="completion"');
  const completionPanelEnd = studentHtmlSource.indexOf('id="studentAttendanceDetailDialog"');
  const completionPanel = studentHtmlSource.slice(completionPanelStart, completionPanelEnd);
  const noticeMarkup = completionPanel.match(/<aside class="completion-study-note" role="note">([\s\S]*?)<\/aside>/);
  const noticeText = noticeMarkup
    ? noticeMarkup[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()
    : '';
  const noticeIndex = completionPanel.indexOf('class="completion-study-note"');
  const resultIndex = completionPanel.indexOf('id="completionResult"');

  // When static markup is inspected, then the exact notice appears once before and outside the live region.
  assert.strictEqual((completionPanel.match(/class="completion-study-note"/g) || []).length, 1);
  assert.strictEqual(noticeText, exactNotice);
  assert.match(completionPanel, /스터디 출석률에 따라 <span class="completion-study-note-tail">달라질 수 있습니다\.<\/span>/);
  assert.match(completionPanel, /<aside class="completion-study-note" role="note">[\s\S]*?<\/aside>\s*<div id="completionResult"/);
  assert.ok(noticeIndex >= 0 && noticeIndex < resultIndex);
  assert.doesNotMatch(studentSource, new RegExp(exactNotice.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}

function testStudentVisualPolishStaticContracts() {
  // Given the student page keeps motion only for state-bearing interactions
  const styleMarkup = studentHtmlSource.match(/<style>([\s\S]*?)<\/style>/);
  const css = styleMarkup ? styleMarkup[1] : '';

  // When static CSS is inspected, then decorative entrance and noninteractive hover treatments are absent.
  ['main-title', 'subtitle', 'season-info', 'divider', 'tab-nav'].forEach(className => {
    const rule = css.match(new RegExp(`\\.${className}\\s*\\{([^}]*)\\}`));
    assert.ok(rule, `.${className} rule missing`);
    assert.doesNotMatch(rule[1], /\banimation\s*:/);
  });
  assert.doesNotMatch(css, /\.ranking-table\s+tr:hover\s*\{/);

  // And Korean criteria and the static notice tail retain semantic phrase boundaries.
  assert.match(css, /\.criteria-item\s*>\s*div\s*\{[^}]*\bflex:\s*1\s+1\s+auto[^}]*\bmin-width:\s*0/);
  assert.match(css, /\.criteria-item span\s*\{[^}]*\boverflow-wrap:\s*break-word[^}]*\bword-break:\s*keep-all/);
  assert.match(css, /\.completion-study-note-tail\s*\{[^}]*\bwhite-space:\s*nowrap/);
}

async function testCompletionLookupStateCharacterization() {
  const context = createContext(`
    let studentCompletionRequestGeneration = 0;
    let studentCompletionRequestKey = '';
    let inputValue = '01012345678';
    let fetchMode = 'pending';
    let resolveFetch;
    let rejectFetch;
    let fetchCalls = 0;
    let alertCount = 0;
    let savedPhone = '';
    let capturedData = null;
    let capturedCompletion = null;
    const completionResult = { innerHTML: '' };
    const document = {
      getElementById(id) {
        if (id === 'completionPhoneInput') return { value: inputValue };
        if (id === 'completionResult') return completionResult;
        return null;
      }
    };
    function normalizeStudentPhone(value) { return String(value || ''); }
    function isValidStudentPhone(value) { return /^010[0-9]{8}$/.test(value); }
    function saveLastUsedStudentPhone(value) { savedPhone = value; }
    function fetchStudentStatus() {
      fetchCalls++;
      if (fetchMode === 'pending') return new Promise((resolve, reject) => { resolveFetch = resolve; rejectFetch = reject; });
      if (fetchMode === 'legacy') return Promise.resolve({ success: true, data: { name: 'legacy' } });
      if (fetchMode === 'responseError') return Promise.resolve({ success: false, message: '<응답 실패>' });
      return Promise.reject(new Error('<예외 실패>'));
    }
    function renderCompletionAssessment(data, completion) {
      capturedData = data;
      capturedCompletion = completion;
      return '<div data-completion-state="current">현재 수료 결과</div>';
    }
    function renderUpgradeNotice(title) { return '<div data-completion-state="legacy">' + title + '</div>'; }
    function handleHistoricalAccessError() { return false; }
    function getDisplayErrorMessage(error, fallback) { return error && error.message ? error.message : fallback; }
    function escapeHtml(value) {
      return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    function alert() { alertCount++; }
  `, ['invalidateStudentCompletionRequest', 'checkCompletionStatus']);
  context.event = { preventDefault() {} };

  const pending = vm.runInContext('checkCompletionStatus(event)', context);
  assert.match(vm.runInContext('completionResult.innerHTML', context), /class="loader"/);
  vm.runInContext(`resolveFetch({ success: true, data: { marker: 'current', insights: { completion: { token: 'completion' } } } })`, context);
  await pending;
  assert.match(vm.runInContext('completionResult.innerHTML', context), /data-completion-state="current"/);
  assert.strictEqual(vm.runInContext('capturedData.marker', context), 'current');
  assert.strictEqual(vm.runInContext('capturedCompletion.token', context), 'completion');
  assert.strictEqual(vm.runInContext('savedPhone', context), '01012345678');

  vm.runInContext(`fetchMode = 'legacy'`, context);
  await vm.runInContext('checkCompletionStatus(event)', context);
  assert.match(vm.runInContext('completionResult.innerHTML', context), /data-completion-state="legacy"/);

  vm.runInContext(`fetchMode = 'responseError'`, context);
  await vm.runInContext('checkCompletionStatus(event)', context);
  assert.match(vm.runInContext('completionResult.innerHTML', context), /&lt;응답 실패&gt;/);

  vm.runInContext(`fetchMode = 'exception'`, context);
  await vm.runInContext('checkCompletionStatus(event)', context);
  assert.match(vm.runInContext('completionResult.innerHTML', context), /&lt;예외 실패&gt;/);

  const callsBeforeInvalid = vm.runInContext('fetchCalls', context);
  vm.runInContext(`inputValue = ''`, context);
  await vm.runInContext('checkCompletionStatus(event)', context);
  assert.strictEqual(vm.runInContext('fetchCalls', context), callsBeforeInvalid);
  assert.strictEqual(vm.runInContext('alertCount', context), 1);
}

function createCompletionLookupRaceContext() {
  return createContext(`
    let studentCompletionRequestGeneration = 0;
    let studentCompletionRequestKey = '';
    const completionPhoneInput = { value: '01011111111' };
    const completionResult = { innerHTML: '' };
    const requests = [];
    const renderedMarkers = [];
    const document = {
      getElementById(id) {
        if (id === 'completionPhoneInput') return completionPhoneInput;
        if (id === 'completionResult') return completionResult;
        return null;
      }
    };
    function normalizeStudentPhone(value) { return String(value || '').replace(/[^0-9]/g, '').slice(0, 11); }
    function isValidStudentPhone(value) { return /^010[0-9]{8}$/.test(value); }
    function saveLastUsedStudentPhone() {}
    function fetchStudentStatus(phone) {
      return new Promise((resolve, reject) => requests.push({ phone, resolve, reject }));
    }
    function renderCompletionAssessment(data) {
      renderedMarkers.push(data.marker);
      return '<div data-marker="' + data.marker + '">' + data.marker + '</div>';
    }
    function renderUpgradeNotice(title) { return '<div data-completion-state="legacy">' + title + '</div>'; }
    function handleHistoricalAccessError() { return false; }
    function getDisplayErrorMessage(error, fallback) { return error && error.message ? error.message : fallback; }
    function escapeHtml(value) {
      return String(value || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
    function alert() {}
  `, ['invalidateStudentCompletionRequest', 'checkCompletionStatus']);
}

async function testNewestCompletionSuccessOwnsUi() {
  // Given two completion lookups whose responses settle newest first
  const context = createCompletionLookupRaceContext();
  context.event = { preventDefault() {} };
  const older = vm.runInContext('checkCompletionStatus(event)', context);
  vm.runInContext("completionPhoneInput.value = '01022222222'", context);
  const newer = vm.runInContext('checkCompletionStatus(event)', context);

  // When the newer success settles before the older success
  vm.runInContext("requests[1].resolve({ success: true, data: { marker: 'newest', insights: { completion: {} } } })", context);
  await newer;
  vm.runInContext("requests[0].resolve({ success: true, data: { marker: 'older', insights: { completion: {} } } })", context);
  await older;

  // Then only the newest response owns the completion surface
  assert.deepStrictEqual(Array.from(vm.runInContext('renderedMarkers', context)), ['newest']);
  assert.match(vm.runInContext('completionResult.innerHTML', context), /data-marker="newest"/);
}

async function testNewestCompletionErrorOwnsUi() {
  // Given an older success pending behind a newer lookup
  const context = createCompletionLookupRaceContext();
  context.event = { preventDefault() {} };
  const older = vm.runInContext('checkCompletionStatus(event)', context);
  vm.runInContext("completionPhoneInput.value = '01022222222'", context);
  const newer = vm.runInContext('checkCompletionStatus(event)', context);

  // When the newer lookup fails and the older success settles afterward
  vm.runInContext("requests[1].resolve({ success: false, message: '<newest error>' })", context);
  await newer;
  vm.runInContext("requests[0].resolve({ success: true, data: { marker: 'older', insights: { completion: {} } } })", context);
  await older;

  // Then the newer error remains visible and the older success never renders
  assert.deepStrictEqual(Array.from(vm.runInContext('renderedMarkers', context)), []);
  assert.match(vm.runInContext('completionResult.innerHTML', context), /&lt;newest error&gt;/);
}

async function testCompletionPhoneChangeInvalidatesPendingResponse() {
  // Given a completion lookup pending for the current phone
  const context = createCompletionLookupRaceContext();
  context.event = { preventDefault() {} };
  const pending = vm.runInContext('checkCompletionStatus(event)', context);

  // When the synchronized phone field changes before the response settles
  vm.runInContext("completionPhoneInput.value = '01022222222'", context);
  vm.runInContext("requests[0].resolve({ success: true, data: { marker: 'stale', insights: { completion: {} } } })", context);
  await pending;

  // Then the stale response cannot replace the pending surface for the new phone
  assert.deepStrictEqual(Array.from(vm.runInContext('renderedMarkers', context)), []);
  assert.match(vm.runInContext('completionResult.innerHTML', context), /class="loader"/);
}

async function testCompletionTabTransitionInvalidatesPendingResponse() {
  // Given a completion lookup whose tab is about to be left
  const context = createCompletionLookupRaceContext();
  context.event = { preventDefault() {} };
  const pending = vm.runInContext('checkCompletionStatus(event)', context);

  // When navigation invalidates the completion request generation
  vm.runInContext("studentCompletionRequestGeneration++; studentCompletionRequestKey = ''", context);
  vm.runInContext("requests[0].resolve({ success: true, data: { marker: 'stale', insights: { completion: {} } } })", context);
  await pending;

  // Then the response no longer owns the hidden completion surface
  assert.deepStrictEqual(Array.from(vm.runInContext('renderedMarkers', context)), []);
  assert.match(vm.runInContext('completionResult.innerHTML', context), /class="loader"/);
}

function testCompletionInvalidationWiringContract() {
  // Given phone synchronization and tab navigation are the two external invalidation paths
  const navigationSource = extractFunction('openTab');
  const initializationSource = extractFunction('initializeStudentPage');

  // Then both paths explicitly invalidate completion ownership
  assert.match(navigationSource, /tabName\s*!==\s*'completion'[\s\S]*invalidateStudentCompletionRequest\(\)/);
  assert.match(initializationSource, /input[\s\S]*syncStudentPhoneInputs\(this\.value, this\)[\s\S]*invalidateStudentCompletionRequest\(\)/);
}

(async () => {
  await testAdminExcusePrefillUsesOnlySafePublicReason();
  console.log('PASS admin excused modal prefills only the safe public reason in source and rollback bundle');
  testLegacyStatusCompatibility();
  console.log('PASS legacy status keeps personal rate and live detail counts');
  testCurrentStatusBaselineCharacterization();
  console.log('PASS baseline status keeps fallback, live counts, collapsed noninteractive details, and ranking DOM order');
  await testReasonRenderingAndLookupReset();
  console.log('PASS reason rows stay leak-safe while a new request replaces prior result content');
  testCurrentStatusDashboardSignals();
  console.log('PASS current status renders five comparison and five count signals');
  testCurrentStatusFirstViewportCompositionContract();
  console.log('PASS current status keeps complete comparison and count groups parallel before collapsed detail');
  testSettledDrawerCloseControlContract();
  console.log('PASS settled mobile drawer keeps its single close control visible and in the focus loop');
  testComparisonDeltaVariantsAndMissingMetrics();
  console.log('PASS comparison handles positive, negative, equal, null, and empty-cohort metrics');
  testStatusEscapesIdentityAndIgnoresFutureReasonUi();
  console.log('PASS status renderer escapes identity strings and keeps displayReason out of result markup');
  testReasonDialogStaticAndRowContract();
  console.log('PASS safe reason rows alone expose numeric dialog triggers outside the status live region');
  testDisplayReasonClientTrustBoundary();
  console.log('PASS displayReason client boundary accepts exact public statuses and rejects every line separator, future, and legacy payload');
  testReasonDialogInteractionAndCleanup();
  console.log('PASS reason dialog traps focus, restores scroll/focus, renders literal text, and clears on errors');
  testReasonDialogPointerFocusSettlementAndStaleGuards();
  console.log('PASS reason dialog settles real-pointer focus without stale callback theft');
  await testReasonDialogFreshHiddenOpenRetriesUntilCloseFocusIsAcquired();
  console.log('PASS fresh hidden reason dialog retries until close focus is acquired');
  testReasonDialogRepeatedPointerAndPendingResetFocus();
  console.log('PASS reason dialog survives ten pointer cycles and pending resets without focus loss or theft');
  await testStatusCacheRetainsOnlyRenderSafeDetailFields();
  console.log('PASS status cache retains only render-safe detail fields without mutating the network response');
  testDetachedReasonTriggerFallsBackToSafeFocus();
  console.log('PASS detached reason triggers fall back to the safe phone input without stealing external focus on resets');
  testServerRankingOrderPreserved();
  console.log('PASS ranking board preserves server-authored ranks');
  await testStatusCacheGeneration();
  console.log('PASS status cache generation rejects stale in-flight responses');
  await testNewestStatusLookupOwnsUi();
  console.log('PASS newest status lookup owns the visible dashboard');
  await testInvalidStatusLookupInvalidatesInFlightResponse();
  console.log('PASS invalid lookup and tab-style reset invalidate older status responses');
  await testNewestStatusRequestOwnsCache();
  console.log('PASS newest status request owns the single-entry cache');
  await testRankingRequestCoordination();
  console.log('PASS ranking requests share in-flight work and reject stale responses');
  testCompletionBaselineCharacterization();
  console.log('PASS completion baseline preserves eight metrics, criteria, escaping, and missing-field fallback');
  testCompletionDesktopCompositionContract();
  console.log('PASS completion assessment uses the semantic desktop overview/criteria composition');
  testCompletionPersistentStudyNoticeContract();
  console.log('PASS completion study-attendance notice is static, exact, singular, and outside the live region');
  testStudentVisualPolishStaticContracts();
  console.log('PASS student visual polish removes decorative motion and preserves Korean phrase boundaries');
  await testCompletionLookupStateCharacterization();
  console.log('PASS completion lookup preserves initial, loading, current, legacy, error, and phone states');
  await testNewestCompletionSuccessOwnsUi();
  console.log('PASS newest successful completion lookup owns the completion surface');
  await testNewestCompletionErrorOwnsUi();
  console.log('PASS newest failed completion lookup cannot be overwritten by an older success');
  await testCompletionPhoneChangeInvalidatesPendingResponse();
  console.log('PASS completion phone changes invalidate pending response ownership');
  await testCompletionTabTransitionInvalidatesPendingResponse();
  console.log('PASS completion tab transitions invalidate pending response ownership');
  testCompletionInvalidationWiringContract();
  console.log('PASS completion input and tab paths explicitly invalidate request ownership');
  console.log('All student client behavior tests passed.');
})().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
