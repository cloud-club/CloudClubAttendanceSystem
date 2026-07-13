#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const repoRoot = path.resolve(__dirname, '..');
const cacheEntries = new Map();
let placeFetchCount = 0;
let placeResponse = {
  status: 200,
  body: JSON.stringify({ id: 'place-1', location: { latitude: 37.5, longitude: 127 } })
};
const sandbox = {
  console,
  Date,
  Math,
  JSON,
  encodeURIComponent,
  decodeURIComponent,
  Session: { getScriptTimeZone: () => 'Asia/Seoul' },
  PropertiesService: {
    getScriptProperties: () => ({ getProperty: () => 'server-test-key' })
  },
  CacheService: {
    getScriptCache: () => ({
      get: key => cacheEntries.get(key) || null,
      put: (key, value) => cacheEntries.set(key, value),
      remove: key => cacheEntries.delete(key)
    })
  },
  UrlFetchApp: {
    fetch: () => {
      placeFetchCount += 1;
      return {
        getResponseCode: () => placeResponse.status,
        getContentText: () => placeResponse.body
      };
    }
  },
  createApiException: (code, message) => {
    const error = new Error(message);
    error.apiCode = code;
    return error;
  },
  Utilities: {
    DigestAlgorithm: { SHA_256: 'sha256' },
    Charset: { UTF_8: 'utf8' },
    computeDigest: (_algorithm, value) => Array.from(crypto.createHash('sha256').update(String(value), 'utf8').digest()),
    base64EncodeWebSafe: bytes => Buffer.from(bytes).toString('base64url'),
    formatDate(date, _timezone, pattern) {
      const pad = value => String(value).padStart(2, '0');
      const values = {
        yyyy: date.getFullYear(),
        MM: pad(date.getMonth() + 1),
        dd: pad(date.getDate()),
        HH: pad(date.getHours()),
        mm: pad(date.getMinutes()),
        ss: pad(date.getSeconds())
      };
      return pattern.replace(/yyyy|MM|dd|HH|mm|ss/g, token => values[token]);
    }
  }
};

vm.createContext(sandbox);
[
  'Appsscript/01_constants_access.gs',
  'Appsscript/90_common_utils.gs',
  'Appsscript/21_variables_sessionmeta.gs',
  'Appsscript/22_location_attendance.gs',
  'Appsscript/32_schedule.gs'
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

test('Given a legacy header, parsing keeps the historical session key and disables location checks', () => {
  const parsed = sandbox.parseSessionHeader('2026-09-20-14:00~16:00');
  assert(parsed);
  assert.strictEqual(parsed.sessionKey, '2026-09-20-14:00');
  assert.strictEqual(parsed.locationRequired, false);
  assert.strictEqual(parsed.locationPolicyValid, true);
});

test('Given a location policy, building and parsing round-trip Place ID and radius without changing the session key', () => {
  const start = new Date(2026, 8, 20, 14, 0, 0, 0);
  const header = sandbox.buildSessionHeader(start, '16:00', {
    locationRequired: true,
    placeId: 'ChIJN1t_tDeuEmsRUsoyG83frY4',
    radiusM: 500
  });
  assert.strictEqual(
    header,
    '2026-09-20-14:00~16:00|v=1|gps=1|pid=ChIJN1t_tDeuEmsRUsoyG83frY4|r=500'
  );

  const parsed = sandbox.parseSessionHeader(header);
  assert(parsed);
  assert.strictEqual(parsed.sessionKey, '2026-09-20-14:00');
  assert.strictEqual(parsed.locationRequired, true);
  assert.strictEqual(parsed.locationPolicyValid, true);
  assert.strictEqual(parsed.googlePlaceId, 'ChIJN1t_tDeuEmsRUsoyG83frY4');
  assert.strictEqual(parsed.radiusM, 500);
});

test('Given an explicit non-location policy, building produces a versioned but backwards-readable header', () => {
  const start = new Date(2026, 8, 20, 14, 0, 0, 0);
  assert.strictEqual(
    sandbox.buildSessionHeader(start, '16:00', { locationRequired: false }),
    '2026-09-20-14:00~16:00|v=1|gps=0'
  );
});

test('Given an old admin edit, the locked latest header Note is preserved instead of a stale pre-lock Note', () => {
  const result = sandbox.resolveScheduleLocationNoteUnderLock(
    false,
    'stale note',
    { locationNote: 'stale note' },
    { locationNote: 'latest note' }
  );
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.note, 'latest note');
});

test('Given an explicit Note edit race, the schedule save fails instead of overwriting another admin change', () => {
  const result = sandbox.resolveScheduleLocationNoteUnderLock(
    true,
    'my note',
    { locationNote: 'initial note' },
    { locationNote: 'other admin note' }
  );
  assert.strictEqual(result.valid, false);
  assert.strictEqual(result.errorCode, 'SCHEDULE_CHANGED_RETRY');
});

test('Given malformed required-location metadata, parsing finds the session but fails the policy closed', () => {
  const parsed = sandbox.parseSessionHeader('2026-09-20-14:00~16:00|v=1|gps=1|r=500');
  assert(parsed);
  assert.strictEqual(parsed.sessionKey, '2026-09-20-14:00');
  assert.strictEqual(parsed.locationRequired, true);
  assert.strictEqual(parsed.locationPolicyValid, false);
});

test('Given reserved Place ID characters, the header codec preserves the exact identifier', () => {
  const placeId = 'A|B%한글';
  const header = sandbox.buildSessionHeader(new Date(2026, 8, 20, 14, 0), '', {
    locationRequired: true,
    placeId,
    radiusM: 500
  });
  const parsed = sandbox.parseSessionHeader(header);
  assert.strictEqual(parsed.googlePlaceId, placeId);
  assert.strictEqual(parsed.locationPolicyValid, true);
});

test('Given duplicate or unknown metadata keys, the session remains visible but the policy is invalid', () => {
  const duplicate = sandbox.parseSessionHeader('2026-09-20-14:00|v=1|gps=1|gps=0|pid=x|r=500');
  const unknown = sandbox.parseSessionHeader('2026-09-20-14:00|v=1|gps=0|extra=x');
  assert(duplicate && unknown);
  assert.strictEqual(duplicate.locationPolicyValid, false);
  assert.strictEqual(unknown.locationPolicyValid, false);
});

test('Given a required policy with a non-500m radius, parsing fails closed', () => {
  const parsed = sandbox.parseSessionHeader('2026-09-20-14:00|v=1|gps=1|pid=x|r=501');
  assert(parsed);
  assert.strictEqual(parsed.locationRequired, true);
  assert.strictEqual(parsed.locationPolicyValid, false);
});

test('Given two coordinates, Haversine distance supports a 500m server-side boundary check', () => {
  const distance = sandbox.calculateDistanceMeters(
    { latitude: 37.5665, longitude: 126.9780 },
    { latitude: 37.5700, longitude: 126.9780 }
  );
  assert(distance > 380 && distance < 400, `unexpected distance: ${distance}`);
  assert.strictEqual(sandbox.isWithinAttendanceRadius(distance, 500), true);
  assert.strictEqual(sandbox.isWithinAttendanceRadius(501, 500), false);
});

test('Given attendee coordinates, validation accepts 100m accuracy and rejects missing or 101m accuracy', () => {
  const accepted = sandbox.normalizeAttendanceLocation({ latitude: 37.5, longitude: 127, accuracy: 100 });
  const missing = sandbox.normalizeAttendanceLocation({ latitude: '', longitude: 127, accuracy: 10 });
  const inaccurate = sandbox.normalizeAttendanceLocation({ latitude: 37.5, longitude: 127, accuracy: 101 });
  assert.strictEqual(accepted.valid, true);
  assert.strictEqual(missing.errorCode, 'LOCATION_REQUIRED');
  assert.strictEqual(inaccurate.errorCode, 'LOCATION_ACCURACY_TOO_LOW');
});

test('Given a Place ID, the server resolver requests only once and reuses the six-hour script cache', () => {
  cacheEntries.clear();
  placeFetchCount = 0;
  placeResponse = {
    status: 200,
    body: JSON.stringify({ id: 'place-1', location: { latitude: 37.5, longitude: 127 } })
  };
  const first = sandbox.resolveGooglePlaceTarget('place-1');
  const second = sandbox.resolveGooglePlaceTarget('place-1');
  assert.deepStrictEqual(JSON.parse(JSON.stringify(first)), { latitude: 37.5, longitude: 127 });
  assert.deepStrictEqual(JSON.parse(JSON.stringify(second)), { latitude: 37.5, longitude: 127 });
  assert.strictEqual(placeFetchCount, 1);
});

test('Given an obsolete Place ID, the server resolver returns a stable not-found error', () => {
  cacheEntries.clear();
  placeResponse = { status: 404, body: '{}' };
  assert.throws(
    () => sandbox.resolveGooglePlaceTarget('obsolete-place'),
    error => error && error.apiCode === 'GOOGLE_PLACE_NOT_FOUND'
  );
});

console.log('All location policy regression tests passed.');
