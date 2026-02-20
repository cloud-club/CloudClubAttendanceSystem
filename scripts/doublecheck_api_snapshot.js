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
  node scripts/doublecheck_api_snapshot.js \\
    --base-url <exec_url> \\
    --out <snapshot.json> \\
    [--season season_09] \\
    [--valid-phone 01012345678] \\
    [--invalid-phone 01000000000] \\
    [--admin-token <token>] \\
    [--super-token <token>] \\
    [--include-attendance] \\
    [--include-season-import-begin-dry]
`);
}

function buildUrl(baseUrl, params) {
  const url = new URL(baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, String(value));
  });
  return url.toString();
}

function parseJsonpBody(text) {
  const trimmed = String(text || '').trim();
  const match = trimmed.match(/^[^(]+\(([\s\S]*)\);?\s*$/);
  if (!match) {
    throw new Error('JSONP 파싱 실패');
  }
  return JSON.parse(match[1]);
}

function maskToken(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.length <= 8) return '*'.repeat(raw.length);
  return `${raw.slice(0, 4)}...${raw.slice(-4)}`;
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

function stripDynamicFields(value, parentKey) {
  if (Array.isArray(value)) {
    return value.map((item) => stripDynamicFields(item, parentKey));
  }
  if (!value || typeof value !== 'object') {
    return value;
  }

  const out = {};
  Object.keys(value).forEach((key) => {
    if (key === 'ts' || key === 'timestamp') return;
    if (parentKey === 'data' && key === 'serverTime') return;
    out[key] = stripDynamicFields(value[key], key);
  });
  return out;
}

function normalizePayload(api, payload) {
  const cloned = JSON.parse(JSON.stringify(payload || {}));
  const normalized = stripDynamicFields(cloned, '');

  if (normalized && normalized.data && api === 'attendance') {
    delete normalized.data.time;
    delete normalized.data.fortune;
  }

  if (normalized && normalized.data && api === 'apiInfo') {
    delete normalized.data.apiVersion;
    delete normalized.data.serverTime;
    if (Array.isArray(normalized.data.supportedActions)) {
      normalized.data.supportedActions = normalized.data.supportedActions
        .map((v) => String(v || '').trim())
        .filter((v) => !!v)
        .sort();
    }
  }

  return sortKeysDeep(normalized);
}

function buildRequests(args) {
  const season = String(args.season || '').trim();
  const validPhone = String(args['valid-phone'] || '').trim();
  const invalidPhone = String(args['invalid-phone'] || '').trim();
  const adminToken = String(args['admin-token'] || '').trim();
  const superToken = String(args['super-token'] || '').trim();
  const includeAttendance = !!args['include-attendance'];
  const includeSeasonImportDry = !!args['include-season-import-begin-dry'];

  const requests = [];
  const add = (id, api, params) => requests.push({ id, api, params: params || {} });

  add('public_health', 'health', {});
  add('public_apiInfo', 'apiInfo', {});
  add('public_latestSeason', 'latestSeason', {});
  if (season) {
    add('public_session', 'session', { season });
    add('public_ranking', 'ranking', { season });
  } else {
    add('public_session', 'session', {});
    add('public_ranking', 'ranking', {});
  }

  if (validPhone) {
    add('public_status_valid', 'status', season ? { season, phone: validPhone } : { phone: validPhone });
    if (includeAttendance) {
      add('public_attendance_valid', 'attendance', season ? { season, phone: validPhone } : { phone: validPhone });
    }
  }
  if (invalidPhone) {
    add('public_status_invalid', 'status', season ? { season, phone: invalidPhone } : { phone: invalidPhone });
    if (includeAttendance) {
      add('public_attendance_invalid', 'attendance', season ? { season, phone: invalidPhone } : { phone: invalidPhone });
    }
  }

  if (adminToken) {
    add('admin_authSession', 'authSession', { adminToken });
    add('admin_adminSeasonList', 'adminSeasonList', { adminToken });
    add('admin_sheetLink', 'sheetLink', season ? { adminToken, season } : { adminToken });
    add('admin_scheduleList', 'scheduleList', season ? { adminToken, season } : { adminToken });
    add('admin_members', 'members', season ? { adminToken, season } : { adminToken });
    add('admin_graduationReport', 'graduationReport', season ? { adminToken, season } : { adminToken });
    add('admin_attendanceDashboardSummary', 'attendanceDashboardSummary', season ? { adminToken, season } : { adminToken });
  }

  if (superToken) {
    add('super_variablesGet', 'variablesGet', { adminToken: superToken });
    add('super_adminUsersList', 'adminUsersList', { adminToken: superToken });
    add('super_sheetSchemaAudit', 'sheetSchemaAudit', season ? { adminToken: superToken, season } : { adminToken: superToken });
    if (includeSeasonImportDry) {
      add('super_seasonImportBegin_dry', 'seasonImportBegin', {
        adminToken: superToken,
        mode: 'create',
        season: season || 'season_00',
        expectedRowCount: 0,
        confirm: false
      });
    }
  }

  return {
    requests,
    masked: {
      season,
      validPhone,
      invalidPhone,
      adminToken: maskToken(adminToken),
      superToken: maskToken(superToken),
      includeAttendance,
      includeSeasonImportDry
    }
  };
}

async function callJsonp(baseUrl, api, params, seq) {
  const callbackName = `cb_${Date.now()}_${seq}`;
  const query = Object.assign({}, params, {
    api,
    callback: callbackName,
    _: Date.now()
  });
  const url = buildUrl(baseUrl, query);
  const response = await fetch(url);
  const text = await response.text();
  const payload = parseJsonpBody(text);
  return {
    httpStatus: response.status,
    url,
    text,
    payload
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const baseUrl = String(args['base-url'] || '').trim();
  const outPath = String(args.out || '').trim();
  if (!baseUrl || !outPath) {
    usage();
    process.exit(1);
  }

  const { requests, masked } = buildRequests(args);
  if (requests.length === 0) {
    console.error('실행할 API 요청이 없습니다.');
    process.exit(1);
  }

  const records = [];
  let failedCount = 0;
  for (let i = 0; i < requests.length; i += 1) {
    const req = requests[i];
    try {
      const result = await callJsonp(baseUrl, req.api, req.params, i + 1);
      const normalized = normalizePayload(req.api, result.payload);
      records.push({
        id: req.id,
        api: req.api,
        params: Object.assign({}, req.params, {
          adminToken: req.params.adminToken ? maskToken(req.params.adminToken) : undefined
        }),
        httpStatus: result.httpStatus,
        ok: !!(result.payload && result.payload.ok),
        errorCode: result.payload && result.payload.error ? (result.payload.error.code || '') : '',
        normalized
      });
      console.log(`OK    ${req.id} (${req.api})`);
    } catch (error) {
      failedCount += 1;
      records.push({
        id: req.id,
        api: req.api,
        params: Object.assign({}, req.params, {
          adminToken: req.params.adminToken ? maskToken(req.params.adminToken) : undefined
        }),
        failedToParse: true,
        errorMessage: error.message || String(error)
      });
      console.error(`FAIL  ${req.id} (${req.api}) -> ${error.message || error}`);
    }
  }

  const output = {
    generatedAt: new Date().toISOString(),
    baseUrl,
    options: masked,
    recordCount: records.length,
    failedCount,
    records
  };

  const absoluteOut = path.resolve(process.cwd(), outPath);
  fs.mkdirSync(path.dirname(absoluteOut), { recursive: true });
  fs.writeFileSync(absoluteOut, JSON.stringify(output, null, 2), 'utf8');
  console.log(`\nSaved snapshot: ${absoluteOut}`);
  if (failedCount > 0) {
    console.error(`Snapshot completed with ${failedCount} failed request(s).`);
    process.exit(2);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
