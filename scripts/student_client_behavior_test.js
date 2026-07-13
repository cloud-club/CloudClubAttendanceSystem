#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const repoRoot = path.resolve(__dirname, '..');
const studentSource = fs.readFileSync(path.join(repoRoot, 'web/student/student.js'), 'utf8');

function extractFunction(name) {
  const functionPattern = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`, 'g');
  const match = functionPattern.exec(studentSource);
  if (!match) throw new Error(`함수를 찾지 못했습니다: ${name}`);
  const start = match.index;
  const bodyStart = studentSource.indexOf('{', start);
  let depth = 0;
  let quote = '';
  let escaped = false;

  for (let index = bodyStart; index < studentSource.length; index++) {
    const char = studentSource[index];
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
      if (depth === 0) return studentSource.slice(start, index + 1);
    }
  }
  throw new Error(`함수 끝을 찾지 못했습니다: ${name}`);
}

function createContext(setup, functionNames) {
  const context = vm.createContext({ console, Date, Math, Promise, setTimeout, clearTimeout });
  vm.runInContext(`${setup}\n${functionNames.map(extractFunction).join('\n')}`, context);
  return context;
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
  `, ['invalidateStudentStatusCache', 'fetchStudentStatus']);

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

(async () => {
  testLegacyStatusCompatibility();
  console.log('PASS legacy status keeps personal rate and live detail counts');
  testServerRankingOrderPreserved();
  console.log('PASS ranking board preserves server-authored ranks');
  await testStatusCacheGeneration();
  console.log('PASS status cache generation rejects stale in-flight responses');
  await testRankingRequestCoordination();
  console.log('PASS ranking requests share in-flight work and reject stale responses');
  console.log('All student client behavior tests passed.');
})().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});
