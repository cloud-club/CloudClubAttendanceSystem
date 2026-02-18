// Code.gs

const SESSION_HEADER_REGEX = /^(\d{4})-(\d{2})-(\d{2})-(\d{2}):(\d{2})(?:~(\d{2}):(\d{2}))?$/;
const SEASON_NAME_REGEX = /^season_(\d{2})$/;
const LEGACY_SEASON_NAME_REGEX = /^(\d{1,2})$/;

const ON_TIME_COLOR = '#d9ead3';
const LATE_COLOR = '#fce5cd';
const EXCUSED_COLOR = '#d9e2f3';
const ABSENT_COLOR = '#f4cccc';

const ADMIN_TOKEN_TTL_SECONDS = 6 * 60 * 60;
const ADMIN_TOKEN_CACHE_PREFIX = 'admin_token_';

const VARIABLE_SHEET_NAME = 'variable';
const VARIABLE_TABLE_HEADER_ROW = 5;
const VARIABLE_TABLE_FIRST_DATA_ROW = 6;
const VARIABLE_TABLE_HEADERS = ['key', 'value', 'type', 'description', 'editable', 'updated_at'];
const LEGACY_VARIABLE_HEADERS = ['지각 한계 범위', '결석 한계 범위', '출석 시작 범위'];

const SESSION_META_SHEET_NAME = '_session_meta';
const SESSION_META_HEADERS = ['seasonSheet', 'sessionKey', 'openOffsetMin', 'lateThresholdMin', 'absenceThresholdMin', 'explicitEndAt', 'createdAt'];

const REQUIRED_VARIABLE_SPECS = [
  { key: 'attendance_open_offset_min', value: -30, type: 'number', description: '행사 시작 n분 전 출석 오픈' },
  { key: 'late_threshold_min', value: 50, type: 'number', description: '시작 후 지각 판정 분' },
  { key: 'absence_threshold_min', value: 180, type: 'number', description: '시작 후 출석 마감 분(종료 공백시 기본)' },
  { key: 'required_attendance_count', value: 3, type: 'number', description: '수료 최소 출석 횟수' },
  { key: 'late_to_absence_ratio', value: 3, type: 'number', description: '지각 n회 = 결석 1회' },
  { key: 'required_session_positions', value: 'first,last', type: 'string', description: '필참 회차 위치' },
  { key: 'max_absence_equivalent', value: '', type: 'number', description: '빈값이면 자동 계산' },
  { key: 'official_session_min_recommended', value: 6, type: 'number', description: '권장 최소 공식 행사 수' },
  { key: 'official_session_max_recommended', value: 8, type: 'number', description: '권장 최대 공식 행사 수' }
];

const VARIABLE_DEFAULTS = {
  attendance_open_offset_min: -30,
  late_threshold_min: 50,
  absence_threshold_min: 180,
  required_attendance_count: 3,
  late_to_absence_ratio: 3,
  required_session_positions: 'first,last',
  max_absence_equivalent: '',
  official_session_min_recommended: 6,
  official_session_max_recommended: 8
};

/**
 * 웹앱 진입점
 * - api 파라미터가 있으면 JSONP API 라우팅
 * - 그 외에는 GitHub Pages로 리디렉션 (미설정 시 레거시 HTML fallback)
 */
function doGet(e) {
  const params = (e && e.parameter) ? e.parameter : {};

  if (params.api) {
    return handleApiRequest(params);
  }

  const mode = params.mode;
  const seasonAlias = toSeasonAlias(params.season || '');

  if (mode === 'student') {
    const studentBase = getFrontendStudentBaseUrl();
    if (isFrontendUrlConfigured(studentBase)) {
      const studentUrl = generateStudentQRCodeUrl(seasonAlias || params.season || '');
      return createRedirectOutput(studentUrl);
    }

    // fallback: 레거시 학생 인터페이스
    const template = HtmlService.createTemplateFromFile('StudentInterface');
    template.season = seasonAlias;
    return template.evaluate()
      .setTitle('출석체크')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }

  const adminUrl = getFrontendAdminUrl();
  if (isFrontendUrlConfigured(adminUrl)) {
    return createRedirectOutput(adminUrl);
  }

  // fallback: 레거시 관리자 인터페이스
  return HtmlService.createHtmlOutputFromFile('AdminInterface')
    .setTitle('Cloud Club 출석체크 관리자')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function createRedirectOutput(url) {
  const target = String(url || '').trim();
  const html = [
    '<!DOCTYPE html>',
    '<html><head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<meta http-equiv="refresh" content="0;url=${escapeHtmlAttr(target)}">`,
    `<script>window.location.replace(${JSON.stringify(target)});</script>`,
    '</head><body>',
    '<p>페이지로 이동 중입니다...</p>',
    '</body></html>'
  ].join('');

  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function escapeHtmlAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function handleApiRequest(params) {
  const callback = params.callback;
  if (!validateCallback(callback)) {
    return createJavascriptOutput('throw new Error("INVALID_CALLBACK");');
  }

  try {
    const action = (params.api || '').trim();
    if (!action) {
      return jsonp(callback, apiError('INVALID_ACTION', 'api 파라미터가 필요합니다.'));
    }

    let data;
    switch (action) {
      case 'health':
        data = {
          status: 'ok',
          timestamp: new Date().getTime(),
          timezone: Session.getScriptTimeZone()
        };
        break;

      case 'session':
        data = params.season ? getSeasonAttendanceSession(params.season) : getAttendanceSession();
        break;

      case 'attendance': {
        const phone = (params.phone || '').trim();
        if (!phone) {
          return jsonp(callback, apiError('INVALID_PHONE', '전화번호가 입력되지 않았습니다.'));
        }
        data = params.season ? markSeasonAttendance(phone, params.season) : markAttendance(phone);
        break;
      }

      case 'status': {
        const phone = (params.phone || '').trim();
        if (!phone) {
          return jsonp(callback, apiError('INVALID_PHONE', '전화번호가 입력되지 않았습니다.'));
        }
        data = params.season ? getSeasonAttendanceStatus(phone, params.season) : getAttendanceStatus(phone);
        break;
      }

      case 'ranking':
        data = params.season ? getSeasonAttendanceRanking(params.season) : getAttendanceRanking();
        break;

      case 'sheets':
        data = getAllSheets();
        break;

      case 'setActiveSheet': {
        const token = (params.adminToken || '').trim();
        if (!verifyAdminToken(token)) {
          return jsonp(callback, apiError('UNAUTHORIZED', '관리자 인증이 필요합니다.'));
        }

        const sheetName = (params.sheet || '').trim();
        if (!sheetName) {
          return jsonp(callback, apiError('INVALID_SHEET', 'sheet 파라미터가 필요합니다.'));
        }

        data = setActiveSheet(sheetName);
        break;
      }

      case 'verifyAdminKey': {
        const adminKey = (params.adminKey || '').trim();
        data = verifyAdminKey(adminKey);
        break;
      }

      case 'studentUrl': {
        const season = (params.season || '').trim();
        if (!season) {
          return jsonp(callback, apiError('INVALID_SEASON', 'season 파라미터가 필요합니다.'));
        }
        data = { url: generateStudentQRCodeUrl(season) };
        break;
      }

      case 'adminUrl':
        data = { url: getAdminAccessUrl() };
        break;

      case 'sheetLink': {
        if (!verifyAdminToken((params.adminToken || '').trim())) {
          return jsonp(callback, apiError('UNAUTHORIZED', '관리자 인증이 필요합니다.'));
        }
        data = getSheetLink(params.season || '');
        break;
      }

      case 'variablesGet': {
        if (!verifyAdminToken((params.adminToken || '').trim())) {
          return jsonp(callback, apiError('UNAUTHORIZED', '관리자 인증이 필요합니다.'));
        }
        data = getVariablesPayload();
        break;
      }

      case 'variablesUpdate': {
        if (!verifyAdminToken((params.adminToken || '').trim())) {
          return jsonp(callback, apiError('UNAUTHORIZED', '관리자 인증이 필요합니다.'));
        }

        const items = parseItemsJson(params.itemsJson || params.items || '[]');
        data = updateVariables(items);
        break;
      }

      case 'scheduleList': {
        if (!verifyAdminToken((params.adminToken || '').trim())) {
          return jsonp(callback, apiError('UNAUTHORIZED', '관리자 인증이 필요합니다.'));
        }
        data = getScheduleList(params.season || '');
        break;
      }

      case 'scheduleSave': {
        if (!verifyAdminToken((params.adminToken || '').trim())) {
          return jsonp(callback, apiError('UNAUTHORIZED', '관리자 인증이 필요합니다.'));
        }
        data = saveSchedule(params);
        break;
      }

      case 'scheduleDelete': {
        if (!verifyAdminToken((params.adminToken || '').trim())) {
          return jsonp(callback, apiError('UNAUTHORIZED', '관리자 인증이 필요합니다.'));
        }
        data = deleteSchedule(params);
        break;
      }

      case 'members': {
        if (!verifyAdminToken((params.adminToken || '').trim())) {
          return jsonp(callback, apiError('UNAUTHORIZED', '관리자 인증이 필요합니다.'));
        }
        data = getMembers(params.season || '');
        break;
      }

      case 'manualApprove': {
        if (!verifyAdminToken((params.adminToken || '').trim())) {
          return jsonp(callback, apiError('UNAUTHORIZED', '관리자 인증이 필요합니다.'));
        }
        data = manualApproveAttendance(params);
        break;
      }

      case 'excusedSet': {
        if (!verifyAdminToken((params.adminToken || '').trim())) {
          return jsonp(callback, apiError('UNAUTHORIZED', '관리자 인증이 필요합니다.'));
        }
        data = setExcusedAttendance(params);
        break;
      }

      case 'graduationReport': {
        if (!verifyAdminToken((params.adminToken || '').trim())) {
          return jsonp(callback, apiError('UNAUTHORIZED', '관리자 인증이 필요합니다.'));
        }
        data = getGraduationReport(params.season || '');
        break;
      }

      default:
        return jsonp(callback, apiError('UNSUPPORTED_ACTION', `지원하지 않는 api입니다: ${action}`));
    }

    return jsonp(callback, apiSuccess(data));
  } catch (error) {
    Logger.log('API 오류: ' + error.toString());
    Logger.log(error.stack || '');
    return jsonp(callback, apiError('INTERNAL_ERROR', error.message || '내부 오류가 발생했습니다.'));
  }
}

function parseItemsJson(raw) {
  if (!raw) return [];

  if (Array.isArray(raw)) {
    return raw;
  }

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      throw new Error('variablesUpdate itemsJson 파싱 실패');
    }
  }

  return [];
}

function validateCallback(callback) {
  if (!callback) return false;
  return /^[A-Za-z_$][0-9A-Za-z_$\.]{0,64}$/.test(callback);
}

function jsonp(callback, payload) {
  const body = `${callback}(${JSON.stringify(payload)});`;
  return createJavascriptOutput(body);
}

function createJavascriptOutput(body) {
  return ContentService
    .createTextOutput(body)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function apiSuccess(data) {
  return {
    ok: true,
    data: data,
    ts: new Date().getTime()
  };
}

function apiError(code, message) {
  return {
    ok: false,
    error: {
      code: code,
      message: message
    },
    ts: new Date().getTime()
  };
}

function verifyAdminKey(adminKey) {
  if (!adminKey) {
    return {
      success: false,
      message: '관리자 키를 입력해주세요.'
    };
  }

  const scriptProperties = PropertiesService.getScriptProperties();
  const storedHash = (scriptProperties.getProperty('ADMIN_KEY_HASH') || '').trim().toLowerCase();

  if (!storedHash) {
    return {
      success: false,
      message: 'ADMIN_KEY_HASH가 설정되지 않았습니다. Apps Script Script properties를 확인하세요.'
    };
  }

  const inputHash = sha256Hex(adminKey);
  if (inputHash !== storedHash) {
    return {
      success: false,
      message: '관리자 키가 올바르지 않습니다.'
    };
  }

  const token = issueAdminToken();
  return {
    success: true,
    token: token,
    expiresInSeconds: ADMIN_TOKEN_TTL_SECONDS
  };
}

function issueAdminToken() {
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  const cache = CacheService.getScriptCache();
  cache.put(ADMIN_TOKEN_CACHE_PREFIX + token, '1', ADMIN_TOKEN_TTL_SECONDS);
  return token;
}

function verifyAdminToken(token) {
  if (!token) return false;
  const cache = CacheService.getScriptCache();
  const key = ADMIN_TOKEN_CACHE_PREFIX + token;
  const hit = cache.get(key);
  if (hit !== '1') return false;

  // active 토큰은 만료 시간을 갱신
  cache.put(key, '1', ADMIN_TOKEN_TTL_SECONDS);
  return true;
}

function sha256Hex(value) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    value,
    Utilities.Charset.UTF_8
  );

  return bytes
    .map(b => {
      const v = (b + 256) % 256;
      return ('0' + v.toString(16)).slice(-2);
    })
    .join('');
}

function getFrontendAdminUrl() {
  const raw = PropertiesService.getScriptProperties().getProperty('FRONTEND_ADMIN_BASE_URL');
  return (raw || '').trim();
}

function getFrontendStudentBaseUrl() {
  const raw = PropertiesService.getScriptProperties().getProperty('FRONTEND_STUDENT_BASE_URL');
  return (raw || '').trim();
}

function isFrontendUrlConfigured(url) {
  return /^https?:\/\//i.test(String(url || '').trim());
}

function getAdminAccessUrl() {
  const configured = getFrontendAdminUrl();
  if (isFrontendUrlConfigured(configured)) {
    return configured;
  }

  return ScriptApp.getService().getUrl() + '?mode=admin';
}

function toSeasonAlias(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';

  const seasonMatch = raw.match(SEASON_NAME_REGEX);
  if (seasonMatch) {
    return `season_${seasonMatch[1]}`;
  }

  const legacyMatch = raw.match(LEGACY_SEASON_NAME_REGEX);
  if (legacyMatch) {
    const padded = String(parseInt(legacyMatch[1], 10)).padStart(2, '0');
    return `season_${padded}`;
  }

  return '';
}

function getLegacySeasonName(alias) {
  const m = String(alias || '').match(SEASON_NAME_REGEX);
  if (!m) return '';
  return m[1];
}

function isSeasonSheetName(name) {
  return SEASON_NAME_REGEX.test(String(name || '').trim());
}

function isLegacySeasonSheetName(name) {
  return LEGACY_SEASON_NAME_REGEX.test(String(name || '').trim());
}

function getSeasonSheetCandidates() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const candidates = [];

  ss.getSheets().forEach(sheet => {
    const name = sheet.getName();

    if (isSeasonSheetName(name) || isLegacySeasonSheetName(name)) {
      const alias = toSeasonAlias(name);
      const seasonNo = parseInt(alias.split('_')[1], 10);

      candidates.push({
        sheet: sheet,
        name: name,
        alias: alias,
        seasonNo: isNaN(seasonNo) ? -1 : seasonNo,
        isLegacy: !isSeasonSheetName(name)
      });
    }
  });

  candidates.sort((a, b) => {
    if (b.seasonNo !== a.seasonNo) {
      return b.seasonNo - a.seasonNo;
    }
    return b.name.localeCompare(a.name);
  });

  return candidates;
}

function resolveSeasonSheetInfo(seasonInput) {
  const alias = toSeasonAlias(seasonInput);
  if (!alias) {
    throw new Error('유효한 season 파라미터가 필요합니다. (예: season_07)');
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const exact = ss.getSheetByName(alias);
  if (exact) {
    return {
      sheet: exact,
      seasonAlias: alias,
      currentSheet: exact.getName(),
      mappedLegacy: false
    };
  }

  const legacyName = getLegacySeasonName(alias);
  const legacy = ss.getSheetByName(legacyName);
  if (legacy) {
    return {
      sheet: legacy,
      seasonAlias: alias,
      currentSheet: legacy.getName(),
      mappedLegacy: true
    };
  }

  throw new Error(`시즌 '${alias}'에 해당하는 시트를 찾을 수 없습니다.`);
}

function getActiveAttendanceSheetInfo() {
  const candidates = getSeasonSheetCandidates();
  if (candidates.length === 0) {
    return null;
  }

  const scriptProperties = PropertiesService.getScriptProperties();
  const activeRaw = (scriptProperties.getProperty('activeSheet') || '').trim();

  if (activeRaw) {
    const found = candidates.find(item => item.name === activeRaw || item.alias === activeRaw);
    if (found) {
      scriptProperties.setProperty('activeSheet', found.name);
      return {
        sheet: found.sheet,
        seasonAlias: found.alias,
        currentSheet: found.name,
        mappedLegacy: found.isLegacy
      };
    }
  }

  const fallback = candidates[0];
  scriptProperties.setProperty('activeSheet', fallback.name);
  return {
    sheet: fallback.sheet,
    seasonAlias: fallback.alias,
    currentSheet: fallback.name,
    mappedLegacy: fallback.isLegacy
  };
}

/**
 * 모든 시즌 시트 목록을 반환합니다.
 * @returns {Array<{name: string, alias: string, isActive: boolean, isLegacy: boolean}>}
 */
function getAllSheets() {
  try {
    const activeInfo = getActiveAttendanceSheetInfo();
    const activeName = activeInfo ? activeInfo.currentSheet : '';

    return getSeasonSheetCandidates().map(item => ({
      name: item.name,
      alias: item.alias,
      isActive: item.name === activeName,
      isLegacy: item.isLegacy,
      isSeason: true
    }));
  } catch (error) {
    Logger.log('시트 목록 가져오기 오류: ' + error.toString());
    return [];
  }
}

/**
 * 활성 시트를 변경합니다.
 */
function setActiveSheet(sheetName) {
  try {
    const target = String(sheetName || '').trim();
    if (!target) {
      return { success: false, message: '시트명이 필요합니다.' };
    }

    const candidates = getSeasonSheetCandidates();
    const found = candidates.find(item => item.name === target || item.alias === target);
    if (!found) {
      return { success: false, message: '시즌 시트를 찾을 수 없습니다. (season_nn 형식 권장)' };
    }

    PropertiesService.getScriptProperties().setProperty('activeSheet', found.name);

    return {
      success: true,
      message: `${found.alias} 시트가 활성화되었습니다.`,
      activeSheet: found.name,
      seasonAlias: found.alias,
      mappedLegacy: found.isLegacy
    };
  } catch (error) {
    Logger.log('시트 변경 오류: ' + error.toString());
    return { success: false, message: '시트 변경 중 오류가 발생했습니다.' };
  }
}

/**
 * 현재 활성화된 시트를 가져옵니다. (관리자용)
 */
function getActiveAttendanceSheet() {
  const info = getActiveAttendanceSheetInfo();
  return info ? info.sheet : null;
}

/**
 * 시즌별 시트를 가져옵니다. (학생용)
 */
function getSeasonSheet(seasonName) {
  if (!seasonName) {
    return getActiveAttendanceSheet();
  }

  return resolveSeasonSheetInfo(seasonName).sheet;
}

function getRequestedSeasonSheetInfo(seasonName) {
  if (!seasonName) {
    const active = getActiveAttendanceSheetInfo();
    if (!active) {
      throw new Error('활성화된 시즌 시트가 없습니다.');
    }
    return active;
  }

  return resolveSeasonSheetInfo(seasonName);
}

function parseSessionHeader(headerValue) {
  if (typeof headerValue !== 'string') return null;
  const text = headerValue.trim();
  if (!text) return null;

  const parts = text.match(SESSION_HEADER_REGEX);
  if (!parts) return null;

  const year = parseInt(parts[1], 10);
  const month = parseInt(parts[2], 10) - 1;
  const day = parseInt(parts[3], 10);
  const hour = parseInt(parts[4], 10);
  const minute = parseInt(parts[5], 10);

  const startTime = new Date(year, month, day, hour, minute, 0, 0);
  if (isNaN(startTime.getTime())) return null;

  let explicitEndAt = '';
  let explicitEndTime = null;
  if (parts[6] && parts[7]) {
    explicitEndAt = `${parts[6]}:${parts[7]}`;
    explicitEndTime = new Date(year, month, day, parseInt(parts[6], 10), parseInt(parts[7], 10), 0, 0);
    if (explicitEndTime.getTime() < startTime.getTime()) {
      explicitEndTime = new Date(explicitEndTime.getTime() + 24 * 60 * 60 * 1000);
    }
  }

  return {
    header: text,
    sessionKey: formatSessionKey(startTime),
    startTime: startTime,
    explicitEndAt: explicitEndAt,
    explicitEndTime: explicitEndTime
  };
}

function formatSessionKey(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd-HH:mm');
}

function formatDateTime(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

function formatDateTimeMinute(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
}

function parseTimeOnDate(date, hhmm) {
  if (!hhmm) return null;
  const match = String(hhmm).trim().match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;

  const d = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    parseInt(match[1], 10),
    parseInt(match[2], 10),
    0,
    0
  );

  if (d.getTime() < date.getTime()) {
    return new Date(d.getTime() + 24 * 60 * 60 * 1000);
  }

  return d;
}

function parseDateTimeInput(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;

  const normalized = raw.replace(' ', 'T');
  const direct = new Date(normalized);
  if (!isNaN(direct.getTime())) {
    return direct;
  }

  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
  if (!match) return null;

  return new Date(
    parseInt(match[1], 10),
    parseInt(match[2], 10) - 1,
    parseInt(match[3], 10),
    parseInt(match[4], 10),
    parseInt(match[5], 10),
    0,
    0
  );
}

function buildSessionHeader(startTime, endAtText) {
  const startText = Utilities.formatDate(startTime, Session.getScriptTimeZone(), 'yyyy-MM-dd-HH:mm');
  if (!endAtText) {
    return startText;
  }

  const endMatch = String(endAtText).trim().match(/^(\d{2}):(\d{2})$/);
  if (!endMatch) {
    throw new Error('종료시간은 HH:mm 형식이어야 합니다.');
  }

  return `${startText}~${endMatch[1]}:${endMatch[2]}`;
}

function ensureVariableSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(VARIABLE_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(VARIABLE_SHEET_NAME);
  }

  ensureVariableSheetLayout(sheet);
  return sheet;
}

function ensureVariableSheetLayout(sheet) {
  const legacyHeaderRange = sheet.getRange(1, 1, 1, 3);
  const legacyHeaders = legacyHeaderRange.getValues()[0];

  if (legacyHeaders.every(v => String(v || '').trim() === '')) {
    legacyHeaderRange.setValues([LEGACY_VARIABLE_HEADERS]);
  }

  const legacyValueRange = sheet.getRange(2, 1, 1, 3);
  const legacyValues = legacyValueRange.getValues()[0];
  if (legacyValues.every(v => String(v || '').trim() === '')) {
    legacyValueRange.setValues([[
      VARIABLE_DEFAULTS.late_threshold_min,
      VARIABLE_DEFAULTS.absence_threshold_min,
      VARIABLE_DEFAULTS.attendance_open_offset_min
    ]]);
  }

  const tableHeaderRange = sheet.getRange(VARIABLE_TABLE_HEADER_ROW, 1, 1, VARIABLE_TABLE_HEADERS.length);
  const tableHeaders = tableHeaderRange.getValues()[0];
  if (String(tableHeaders[0] || '').trim() === '') {
    tableHeaderRange.setValues([VARIABLE_TABLE_HEADERS]);
  }

  const existingKeys = getExistingVariableKeys(sheet);
  const nowText = formatDateTime(new Date());

  REQUIRED_VARIABLE_SPECS.forEach(spec => {
    if (existingKeys[spec.key]) {
      return;
    }

    const row = [
      spec.key,
      spec.value,
      spec.type,
      spec.description,
      'true',
      nowText
    ];

    sheet.appendRow(row);
  });
}

function getExistingVariableKeys(sheet) {
  const lastRow = sheet.getLastRow();
  if (lastRow < VARIABLE_TABLE_FIRST_DATA_ROW) {
    return {};
  }

  const keys = sheet.getRange(VARIABLE_TABLE_FIRST_DATA_ROW, 1, lastRow - VARIABLE_TABLE_FIRST_DATA_ROW + 1, 1).getValues();
  const map = {};

  keys.forEach(row => {
    const key = String(row[0] || '').trim();
    if (key) {
      map[key] = true;
    }
  });

  return map;
}

function parseVariableValue(value, type) {
  const raw = value === null || value === undefined ? '' : String(value).trim();

  if (type === 'number') {
    if (raw === '') return '';
    const n = Number(raw);
    if (isNaN(n)) return '';
    return n;
  }

  if (type === 'boolean') {
    if (raw === '') return false;
    return /^(true|1|yes|y)$/i.test(raw);
  }

  return raw;
}

function normalizeVariableConfig(config) {
  const normalized = Object.assign({}, VARIABLE_DEFAULTS, config || {});

  normalized.attendance_open_offset_min = toNumberWithDefault(normalized.attendance_open_offset_min, VARIABLE_DEFAULTS.attendance_open_offset_min);
  normalized.late_threshold_min = Math.max(1, toNumberWithDefault(normalized.late_threshold_min, VARIABLE_DEFAULTS.late_threshold_min));
  normalized.absence_threshold_min = Math.max(normalized.late_threshold_min, toNumberWithDefault(normalized.absence_threshold_min, VARIABLE_DEFAULTS.absence_threshold_min));
  normalized.required_attendance_count = Math.max(0, toNumberWithDefault(normalized.required_attendance_count, VARIABLE_DEFAULTS.required_attendance_count));
  normalized.late_to_absence_ratio = Math.max(1, toNumberWithDefault(normalized.late_to_absence_ratio, VARIABLE_DEFAULTS.late_to_absence_ratio));

  if (normalized.max_absence_equivalent !== '') {
    normalized.max_absence_equivalent = Math.max(0, toNumberWithDefault(normalized.max_absence_equivalent, ''));
  }

  normalized.official_session_min_recommended = Math.max(0, toNumberWithDefault(normalized.official_session_min_recommended, VARIABLE_DEFAULTS.official_session_min_recommended));
  normalized.official_session_max_recommended = Math.max(normalized.official_session_min_recommended, toNumberWithDefault(normalized.official_session_max_recommended, VARIABLE_DEFAULTS.official_session_max_recommended));

  normalized.required_session_positions = String(normalized.required_session_positions || VARIABLE_DEFAULTS.required_session_positions);

  return normalized;
}

function toNumberWithDefault(value, defaultValue) {
  if (value === '' || value === null || value === undefined) {
    return defaultValue;
  }

  const n = Number(value);
  if (isNaN(n)) {
    return defaultValue;
  }

  return n;
}

function readLegacyVariableValues(sheet) {
  const values = sheet.getRange(2, 1, 1, 3).getValues()[0];

  return {
    late_threshold_min: toNumberWithDefault(values[0], VARIABLE_DEFAULTS.late_threshold_min),
    absence_threshold_min: toNumberWithDefault(values[1], VARIABLE_DEFAULTS.absence_threshold_min),
    attendance_open_offset_min: toNumberWithDefault(values[2], VARIABLE_DEFAULTS.attendance_open_offset_min)
  };
}

function getVariablesPayload() {
  const sheet = ensureVariableSheet();
  const lastRow = sheet.getLastRow();
  const legacy = readLegacyVariableValues(sheet);

  const items = [];
  const config = Object.assign({}, VARIABLE_DEFAULTS);

  if (lastRow >= VARIABLE_TABLE_FIRST_DATA_ROW) {
    const rows = sheet.getRange(VARIABLE_TABLE_FIRST_DATA_ROW, 1, lastRow - VARIABLE_TABLE_FIRST_DATA_ROW + 1, VARIABLE_TABLE_HEADERS.length).getValues();

    rows.forEach((row, idx) => {
      const key = String(row[0] || '').trim();
      if (!key) return;

      const type = String(row[2] || '').trim() || 'string';
      const parsedValue = parseVariableValue(row[1], type);
      const editable = String(row[4] || '').trim();

      items.push({
        key: key,
        value: parsedValue,
        type: type,
        description: String(row[3] || '').trim(),
        editable: editable === '' ? true : /^(true|1|yes|y)$/i.test(editable),
        updatedAt: String(row[5] || '').trim(),
        row: VARIABLE_TABLE_FIRST_DATA_ROW + idx
      });

      if (parsedValue !== '' || !(key in config)) {
        config[key] = parsedValue;
      }
    });
  }

  if (config.late_threshold_min === '' || config.late_threshold_min === undefined) {
    config.late_threshold_min = legacy.late_threshold_min;
  }
  if (config.absence_threshold_min === '' || config.absence_threshold_min === undefined) {
    config.absence_threshold_min = legacy.absence_threshold_min;
  }
  if (config.attendance_open_offset_min === '' || config.attendance_open_offset_min === undefined) {
    config.attendance_open_offset_min = legacy.attendance_open_offset_min;
  }

  return {
    success: true,
    sheetName: VARIABLE_SHEET_NAME,
    legacy: legacy,
    items: items,
    config: normalizeVariableConfig(config)
  };
}

function getVariableConfig() {
  return getVariablesPayload().config;
}

function seedSessionMetaForAllSeasonSheets(configForSeeding) {
  const candidates = getSeasonSheetCandidates();
  const config = normalizeVariableConfig(configForSeeding || getVariableConfig());

  candidates.forEach(item => {
    collectSessionsFromSheet(item.sheet, {
      variableConfig: config,
      createMissingMeta: true
    });
  });
}

function updateVariables(items) {
  if (!Array.isArray(items)) {
    return { success: false, message: 'items 배열이 필요합니다.' };
  }

  // 변수 변경 전에 현재 값을 기준으로 모든 기존 회차를 스냅샷하여
  // 이후 변수 변경이 과거 회차에 소급되지 않도록 고정.
  const currentConfig = getVariableConfig();
  seedSessionMetaForAllSeasonSheets(currentConfig);

  const sheet = ensureVariableSheet();
  const payload = getVariablesPayload();
  const existingMap = {};

  payload.items.forEach(item => {
    existingMap[item.key] = item;
  });

  const nowText = formatDateTime(new Date());

  items.forEach(item => {
    const key = String((item && item.key) || '').trim();
    if (!key) return;

    const existing = existingMap[key] || null;
    const type = String((item && item.type) || (existing && existing.type) || 'string').trim() || 'string';
    const description = String((item && item.description) || (existing && existing.description) || '').trim();
    const editable = item && item.editable !== undefined
      ? !!item.editable
      : (existing ? !!existing.editable : true);

    const value = parseVariableValue(item ? item.value : '', type);

    if (existing) {
      sheet.getRange(existing.row, 2, 1, 5).setValues([[
        value,
        type,
        description,
        editable ? 'true' : 'false',
        nowText
      ]]);
    } else {
      sheet.appendRow([
        key,
        value,
        type,
        description,
        editable ? 'true' : 'false',
        nowText
      ]);
    }
  });

  const updatedPayload = getVariablesPayload();
  syncLegacyVariableRow(sheet, updatedPayload.config);

  return getVariablesPayload();
}

function syncLegacyVariableRow(sheet, config) {
  const normalized = normalizeVariableConfig(config);

  sheet.getRange(1, 1, 1, 3).setValues([LEGACY_VARIABLE_HEADERS]);
  sheet.getRange(2, 1, 1, 3).setValues([[
    normalized.late_threshold_min,
    normalized.absence_threshold_min,
    normalized.attendance_open_offset_min
  ]]);
}

function ensureSessionMetaSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SESSION_META_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(SESSION_META_SHEET_NAME);
  }

  const headerRange = sheet.getRange(1, 1, 1, SESSION_META_HEADERS.length);
  const currentHeaders = headerRange.getValues()[0];
  if (String(currentHeaders[0] || '').trim() === '') {
    headerRange.setValues([SESSION_META_HEADERS]);
  }

  if (!sheet.isSheetHidden()) {
    sheet.hideSheet();
  }

  return sheet;
}

function getSessionMetaPack(seasonSheetName) {
  const metaSheet = ensureSessionMetaSheet();
  const map = {};

  const lastRow = metaSheet.getLastRow();
  if (lastRow < 2) {
    return { metaSheet: metaSheet, map: map };
  }

  const values = metaSheet.getRange(2, 1, lastRow - 1, SESSION_META_HEADERS.length).getValues();
  values.forEach((row, idx) => {
    const season = String(row[0] || '').trim();
    const sessionKey = String(row[1] || '').trim();
    if (!season || !sessionKey) return;
    if (season !== seasonSheetName) return;

    map[sessionKey] = {
      rowIndex: idx + 2,
      seasonSheet: season,
      sessionKey: sessionKey,
      openOffsetMin: row[2],
      lateThresholdMin: row[3],
      absenceThresholdMin: row[4],
      explicitEndAt: String(row[5] || '').trim(),
      createdAt: String(row[6] || '').trim()
    };
  });

  return { metaSheet: metaSheet, map: map };
}

function appendSessionMetaRows(metaSheet, rows) {
  if (!rows || rows.length === 0) return;
  const startRow = metaSheet.getLastRow() + 1;
  metaSheet.getRange(startRow, 1, rows.length, SESSION_META_HEADERS.length).setValues(rows);
}

function collectSessionsFromSheet(sheet, options) {
  const opts = options || {};
  const createMissingMeta = opts.createMissingMeta !== false;
  const variableConfig = normalizeVariableConfig(opts.variableConfig || getVariableConfig());

  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const parsedSessions = [];

  for (let j = 3; j < headers.length; j++) {
    const parsed = parseSessionHeader(headers[j]);
    if (!parsed) continue;

    parsed.colIndex = j;
    parsedSessions.push(parsed);
  }

  if (parsedSessions.length === 0) {
    return [];
  }

  const seasonSheetName = sheet.getName();
  const metaPack = getSessionMetaPack(seasonSheetName);
  const nowText = formatDateTime(new Date());

  const pendingMetaRows = [];
  const updateRows = [];

  parsedSessions.forEach(parsed => {
    const existing = metaPack.map[parsed.sessionKey];
    if (!existing && createMissingMeta) {
      pendingMetaRows.push([
        seasonSheetName,
        parsed.sessionKey,
        variableConfig.attendance_open_offset_min,
        variableConfig.late_threshold_min,
        variableConfig.absence_threshold_min,
        parsed.explicitEndAt || '',
        nowText
      ]);
      return;
    }

    if (existing && parsed.explicitEndAt && existing.explicitEndAt !== parsed.explicitEndAt) {
      existing.explicitEndAt = parsed.explicitEndAt;
      updateRows.push({ row: existing.rowIndex, explicitEndAt: parsed.explicitEndAt });
    }
  });

  if (pendingMetaRows.length > 0) {
    appendSessionMetaRows(metaPack.metaSheet, pendingMetaRows);

    pendingMetaRows.forEach((row, idx) => {
      const rowIndex = metaPack.metaSheet.getLastRow() - pendingMetaRows.length + idx + 1;
      metaPack.map[row[1]] = {
        rowIndex: rowIndex,
        seasonSheet: row[0],
        sessionKey: row[1],
        openOffsetMin: row[2],
        lateThresholdMin: row[3],
        absenceThresholdMin: row[4],
        explicitEndAt: row[5],
        createdAt: row[6]
      };
    });
  }

  updateRows.forEach(item => {
    metaPack.metaSheet.getRange(item.row, 6).setValue(item.explicitEndAt);
  });

  return parsedSessions.map(parsed => {
    const meta = metaPack.map[parsed.sessionKey] || {
      openOffsetMin: variableConfig.attendance_open_offset_min,
      lateThresholdMin: variableConfig.late_threshold_min,
      absenceThresholdMin: variableConfig.absence_threshold_min,
      explicitEndAt: parsed.explicitEndAt || ''
    };

    const openOffsetMin = toNumberWithDefault(meta.openOffsetMin, variableConfig.attendance_open_offset_min);
    const lateThresholdMin = toNumberWithDefault(meta.lateThresholdMin, variableConfig.late_threshold_min);
    const absenceThresholdMin = Math.max(
      lateThresholdMin,
      toNumberWithDefault(meta.absenceThresholdMin, variableConfig.absence_threshold_min)
    );

    const openTime = new Date(parsed.startTime.getTime() + openOffsetMin * 60 * 1000);
    const onTimeDeadline = new Date(parsed.startTime.getTime() + lateThresholdMin * 60 * 1000);

    const explicitEndAt = parsed.explicitEndAt || meta.explicitEndAt || '';
    let lateDeadline = explicitEndAt
      ? parseTimeOnDate(parsed.startTime, explicitEndAt)
      : new Date(parsed.startTime.getTime() + absenceThresholdMin * 60 * 1000);

    if (!lateDeadline || isNaN(lateDeadline.getTime())) {
      lateDeadline = new Date(parsed.startTime.getTime() + absenceThresholdMin * 60 * 1000);
    }

    if (lateDeadline.getTime() < onTimeDeadline.getTime()) {
      lateDeadline = new Date(onTimeDeadline.getTime());
    }

    return {
      colIndex: parsed.colIndex,
      sessionKey: parsed.sessionKey,
      header: parsed.header,
      startTime: parsed.startTime,
      openTime: openTime,
      onTimeDeadline: onTimeDeadline,
      lateDeadline: lateDeadline,
      endTime: lateDeadline,
      explicitEndAt: explicitEndAt,
      openOffsetMin: openOffsetMin,
      lateThresholdMin: lateThresholdMin,
      absenceThresholdMin: absenceThresholdMin
    };
  });
}

function removeSessionMetaRow(seasonSheetName, sessionKey) {
  const metaPack = getSessionMetaPack(seasonSheetName);
  const rowInfo = metaPack.map[sessionKey];
  if (!rowInfo) return;

  metaPack.metaSheet.deleteRow(rowInfo.rowIndex);
}

function upsertSessionMetaRow(seasonSheetName, sessionKey, snapshot) {
  const metaPack = getSessionMetaPack(seasonSheetName);
  const existing = metaPack.map[sessionKey];
  const nowText = formatDateTime(new Date());

  if (existing) {
    metaPack.metaSheet.getRange(existing.rowIndex, 3, 1, 5).setValues([[
      snapshot.openOffsetMin,
      snapshot.lateThresholdMin,
      snapshot.absenceThresholdMin,
      snapshot.explicitEndAt || '',
      nowText
    ]]);
    return;
  }

  appendSessionMetaRows(metaPack.metaSheet, [[
    seasonSheetName,
    sessionKey,
    snapshot.openOffsetMin,
    snapshot.lateThresholdMin,
    snapshot.absenceThresholdMin,
    snapshot.explicitEndAt || '',
    nowText
  ]]);
}

function findActiveSession(sessions, now) {
  let active = null;

  sessions.forEach(session => {
    if (now >= session.openTime && now <= session.lateDeadline) {
      if (!active || session.startTime.getTime() > active.startTime.getTime()) {
        active = session;
      }
    }
  });

  return active;
}

function findNextSession(sessions, now) {
  let next = null;

  sessions.forEach(session => {
    if (session.openTime <= now) return;
    if (!next || session.openTime.getTime() < next.openTime.getTime()) {
      next = session;
    }
  });

  return next;
}

function isExcusedValue(value) {
  return String(value || '').trim() === '유고';
}

function getAttendanceType(attendTime, session) {
  if (!attendTime || !session) return 'absent';

  const t = attendTime.getTime();
  if (t < session.openTime.getTime() || t > session.lateDeadline.getTime()) {
    return 'absent';
  }

  if (t <= session.onTimeDeadline.getTime()) {
    return 'on_time';
  }

  return 'late';
}

function getAttendanceDetailType(cellValue, session, now) {
  if (isExcusedValue(cellValue)) {
    return 'excused';
  }

  const attendTime = parseAttendanceTime(cellValue);
  if (attendTime) {
    return getAttendanceType(attendTime, session);
  }

  if (now > session.lateDeadline) {
    return 'absent';
  }

  return 'future';
}

/**
 * 현재 진행 중인 출석 세션 정보를 반환합니다. (관리자용)
 */
function getAttendanceSession() {
  const info = getActiveAttendanceSheetInfo();
  if (!info || !info.sheet) {
    return { active: false, message: '활성화된 출석 시트가 없습니다.' };
  }

  return getAttendanceSessionFromSheet(info.sheet, info.seasonAlias);
}

/**
 * 시즌별 출석 세션 정보를 반환합니다. (학생용)
 */
function getSeasonAttendanceSession(seasonName) {
  try {
    const info = getRequestedSeasonSheetInfo(seasonName);
    const result = getAttendanceSessionFromSheet(info.sheet, info.seasonAlias);
    result.currentSheet = info.currentSheet;
    result.seasonAlias = info.seasonAlias;
    result.mappedLegacy = info.mappedLegacy;
    return result;
  } catch (error) {
    Logger.log('시즌별 출석 세션 조회 오류: ' + error.toString());
    return { active: false, message: error.message };
  }
}

/**
 * 특정 시트에서 출석 세션 정보를 조회합니다.
 */
function getAttendanceSessionFromSheet(sheet, seasonAlias) {
  const now = new Date();
  const sessions = collectSessionsFromSheet(sheet, { createMissingMeta: true });
  const activeSession = findActiveSession(sessions, now);

  if (activeSession) {
    const phase = now <= activeSession.onTimeDeadline ? 'on_time' : 'late';

    return {
      active: true,
      phase: phase,
      openTime: activeSession.openTime.getTime(),
      startTime: activeSession.startTime.getTime(),
      onTimeDeadline: activeSession.onTimeDeadline.getTime(),
      lateDeadline: activeSession.lateDeadline.getTime(),
      endTime: activeSession.lateDeadline.getTime(),
      sessionKey: activeSession.sessionKey,
      currentSheet: sheet.getName(),
      seasonAlias: seasonAlias || toSeasonAlias(sheet.getName())
    };
  }

  const nextSession = findNextSession(sessions, now);
  if (nextSession) {
    return {
      active: false,
      message: '아직 출석 오픈 전입니다.',
      nextOpenTime: nextSession.openTime.getTime(),
      nextStartTime: nextSession.startTime.getTime(),
      nextSessionKey: nextSession.sessionKey,
      currentSheet: sheet.getName(),
      seasonAlias: seasonAlias || toSeasonAlias(sheet.getName())
    };
  }

  return {
    active: false,
    message: '지금은 출석 가능한 시간이 아닙니다.',
    currentSheet: sheet.getName(),
    seasonAlias: seasonAlias || toSeasonAlias(sheet.getName())
  };
}

/**
 * 전화번호 기반으로 출석을 처리합니다. (관리자용)
 */
function markAttendance(phoneNumber) {
  if (!phoneNumber) {
    return { success: false, message: '전화번호가 입력되지 않았습니다.' };
  }

  try {
    const info = getActiveAttendanceSheetInfo();
    if (!info || !info.sheet) {
      return { success: false, message: '활성화된 출석 시트가 없습니다.' };
    }

    return markAttendanceInSheet(phoneNumber, info.sheet, info.seasonAlias);
  } catch (error) {
    Logger.log(error.toString());
    return { success: false, message: '서버 오류가 발생했습니다: ' + error.toString() };
  }
}

/**
 * 시즌별 전화번호 기반 출석 처리합니다. (학생용)
 */
function markSeasonAttendance(phoneNumber, seasonName) {
  if (!phoneNumber) {
    return { success: false, message: '전화번호가 입력되지 않았습니다.' };
  }

  if (!seasonName) {
    return { success: false, message: '시즌 정보가 없습니다.' };
  }

  try {
    const info = resolveSeasonSheetInfo(seasonName);
    return markAttendanceInSheet(phoneNumber, info.sheet, info.seasonAlias);
  } catch (error) {
    Logger.log('시즌별 출석 처리 오류: ' + error.toString());
    return { success: false, message: '서버 오류가 발생했습니다: ' + error.toString() };
  }
}

function isValidPhoneNumber(phoneNumber) {
  return /^010\d{8}$/.test(String(phoneNumber || '').replace(/-/g, ''));
}

function normalizePhone(phoneNumber) {
  return String(phoneNumber || '').replace(/-/g, '').trim();
}

function findMemberRowIndex(values, cleanedPhone) {
  for (let i = 1; i < values.length; i++) {
    const storedPhone = normalizePhone(values[i][2]);
    if (storedPhone === cleanedPhone) {
      return i;
    }
  }

  return -1;
}

/**
 * 특정 시트에서 출석을 처리합니다.
 */
function markAttendanceInSheet(phoneNumber, sheet, seasonAlias) {
  const cleanedInputPhone = normalizePhone(phoneNumber);
  if (!isValidPhoneNumber(cleanedInputPhone)) {
    return { success: false, message: '올바른 전화번호 형식이 아닙니다. (예: 01012345678)' };
  }

  const lock = LockService.getDocumentLock();
  lock.waitLock(5000);

  try {
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    const now = new Date();

    const sessions = collectSessionsFromSheet(sheet, { createMissingMeta: true });
    const activeSession = findActiveSession(sessions, now);

    if (!activeSession) {
      const nextSession = findNextSession(sessions, now);
      if (nextSession) {
        return {
          success: false,
          message: `아직 출석 오픈 전입니다. (${formatDateTimeMinute(nextSession.openTime)} 오픈)`
        };
      }
      return { success: false, message: '출석 가능한 시간이 종료되었습니다.' };
    }

    const targetRowIndex = findMemberRowIndex(values, cleanedInputPhone);
    if (targetRowIndex === -1) {
      return { success: false, message: '등록되지 않은 전화번호입니다.' };
    }

    const targetRange = sheet.getRange(targetRowIndex + 1, activeSession.colIndex + 1);
    const existing = targetRange.getValue();
    if (existing && String(existing).trim() !== '') {
      const name = values[targetRowIndex][0];
      const grade = values[targetRowIndex][1];
      return { success: false, message: `(${grade}) ${name}님은 이미 출석체크를 완료했습니다.` };
    }

    const writeTime = new Date();
    if (writeTime < activeSession.openTime) {
      return {
        success: false,
        message: `출석 오픈 전입니다. (${formatDateTimeMinute(activeSession.openTime)}부터 가능)`
      };
    }

    if (writeTime > activeSession.lateDeadline) {
      return { success: false, message: '출석 가능한 시간이 종료되었습니다.' };
    }

    const attendanceType = writeTime <= activeSession.onTimeDeadline ? 'on_time' : 'late';
    const formattedTime = formatDateTime(writeTime);

    targetRange.setValue(formattedTime);
    targetRange.setBackground(attendanceType === 'on_time' ? ON_TIME_COLOR : LATE_COLOR);
    targetRange.setNote('');

    const updatedRow = sheet.getRange(targetRowIndex + 1, 1, 1, sheet.getLastColumn()).getValues()[0];

    let attendedCount = 0;
    let denominator = 0;
    let currentPastSessionCount = 0;

    sessions.forEach(session => {
      const isPast = writeTime > session.lateDeadline;
      if (!isPast) return;

      currentPastSessionCount++;

      const cellValue = updatedRow[session.colIndex];
      const status = getAttendanceDetailType(cellValue, session, writeTime);

      if (status === 'excused') {
        return;
      }

      denominator++;
      if (status === 'on_time' || status === 'late') {
        attendedCount++;
      }
    });

    const attendanceRate = denominator > 0
      ? Math.round((attendedCount / denominator) * 100)
      : 0;

    const name = values[targetRowIndex][0];
    const grade = values[targetRowIndex][1];
    const fortune = getRandomFortune();

    return {
      success: true,
      name: name,
      grade: grade,
      time: formattedTime,
      attendanceType: attendanceType,
      sessionKey: activeSession.sessionKey,
      seasonAlias: seasonAlias || toSeasonAlias(sheet.getName()),
      attendanceInfo: {
        attended: attendedCount,
        total: sessions.length,
        currentSession: currentPastSessionCount,
        effectiveTotal: denominator,
        rate: attendanceRate
      },
      fortune: fortune
    };
  } finally {
    lock.releaseLock();
  }
}

/**
 * 전화번호로 출석 현황을 조회합니다. (관리자용)
 */
function getAttendanceStatus(phoneNumber) {
  if (!phoneNumber) {
    return { success: false, message: '전화번호가 입력되지 않았습니다.' };
  }

  try {
    const info = getActiveAttendanceSheetInfo();
    if (!info || !info.sheet) {
      return { success: false, message: '활성화된 출석 시트가 없습니다.' };
    }

    return getAttendanceStatusFromSheet(phoneNumber, info.sheet, info.seasonAlias);
  } catch (error) {
    Logger.log('출석 현황 조회 오류: ' + error.toString());
    return { success: false, message: '조회 중 오류가 발생했습니다: ' + error.toString() };
  }
}

/**
 * 시즌별 전화번호로 출석 현황을 조회합니다. (학생용)
 */
function getSeasonAttendanceStatus(phoneNumber, seasonName) {
  if (!phoneNumber) {
    return { success: false, message: '전화번호가 입력되지 않았습니다.' };
  }

  if (!seasonName) {
    return { success: false, message: '시즌 정보가 없습니다.' };
  }

  try {
    const info = resolveSeasonSheetInfo(seasonName);
    return getAttendanceStatusFromSheet(phoneNumber, info.sheet, info.seasonAlias);
  } catch (error) {
    Logger.log('시즌별 출석 현황 조회 오류: ' + error.toString());
    return { success: false, message: '조회 중 오류가 발생했습니다: ' + error.toString() };
  }
}

/**
 * 특정 시트에서 출석 현황을 조회합니다.
 */
function getAttendanceStatusFromSheet(phoneNumber, sheet, seasonAlias) {
  const cleanedInputPhone = normalizePhone(phoneNumber);
  if (!isValidPhoneNumber(cleanedInputPhone)) {
    return { success: false, message: '올바른 전화번호 형식이 아닙니다. (예: 01012345678)' };
  }

  const values = sheet.getDataRange().getValues();
  const sessions = collectSessionsFromSheet(sheet, { createMissingMeta: true });

  const targetRowIndex = findMemberRowIndex(values, cleanedInputPhone);
  if (targetRowIndex === -1) {
    return { success: false, message: '등록되지 않은 전화번호입니다.' };
  }

  const now = new Date();
  const name = values[targetRowIndex][0];
  const grade = values[targetRowIndex][1];

  const attendanceDetails = [];
  let attendedCount = 0;
  let pastSessionCount = 0;
  let effectivePastCount = 0;
  let lateCount = 0;
  let excusedCount = 0;

  sessions.forEach(session => {
    const cellValue = values[targetRowIndex][session.colIndex];
    const status = getAttendanceDetailType(cellValue, session, now);
    const isPast = now > session.lateDeadline;

    if (isPast) {
      pastSessionCount++;

      if (status === 'excused') {
        excusedCount++;
      } else {
        effectivePastCount++;
        if (status === 'on_time' || status === 'late') {
          attendedCount++;
        }
        if (status === 'late') {
          lateCount++;
        }
      }
    }

    const attended = status === 'on_time' || status === 'late';

    attendanceDetails.push({
      sessionKey: session.sessionKey,
      date: formatDateTimeMinute(session.startTime),
      attended: attended,
      attendanceType: status,
      attendTime: attended ? (cellValue ? String(cellValue) : null) : null,
      isPast: isPast
    });
  });

  const attendanceRate = effectivePastCount > 0
    ? Math.round((attendedCount / effectivePastCount) * 100)
    : 0;

  return {
    success: true,
    data: {
      name: name,
      grade: grade,
      seasonAlias: seasonAlias || toSeasonAlias(sheet.getName()),
      attended: attendedCount,
      total: attendanceDetails.length,
      currentSession: effectivePastCount,
      pastSessions: pastSessionCount,
      excusedCount: excusedCount,
      lateCount: lateCount,
      rate: attendanceRate,
      details: attendanceDetails
    }
  };
}

/**
 * 모든 등록된 전화번호 목록을 반환합니다.
 */
function getAllPhoneNumbers() {
  try {
    const sheet = getActiveAttendanceSheet();
    if (!sheet) return [];

    const values = sheet.getDataRange().getValues();
    const phoneNumbers = [];

    for (let i = 1; i < values.length; i++) {
      if (values[i][2]) {
        phoneNumbers.push(normalizePhone(values[i][2]));
      }
    }

    return phoneNumbers;
  } catch (error) {
    Logger.log('전화번호 목록 가져오기 오류: ' + error.toString());
    return [];
  }
}

// 관리자 URL 반환 함수
function getQRCodeUrl() {
  return getAdminAccessUrl();
}

/**
 * 시즌별 학생용 URL 생성
 */
function generateStudentQRCodeUrl(seasonName) {
  let alias = toSeasonAlias(seasonName);
  if (!alias) {
    const active = getActiveAttendanceSheetInfo();
    alias = active ? active.seasonAlias : '';
  }

  const studentBase = getFrontendStudentBaseUrl();
  if (isFrontendUrlConfigured(studentBase)) {
    const separator = studentBase.indexOf('?') === -1 ? '?' : '&';
    return `${studentBase}${separator}season=${encodeURIComponent(alias || '')}`;
  }

  const baseUrl = ScriptApp.getService().getUrl();
  return `${baseUrl}?mode=student&season=${encodeURIComponent(alias || '')}`;
}

/**
 * Google Charts API QR코드 이미지 URL 생성
 */
function generateQRCodeImageUrl(seasonName) {
  const studentUrl = generateStudentQRCodeUrl(seasonName);
  return `https://chart.googleapis.com/chart?cht=qr&chl=${encodeURIComponent(studentUrl)}&chs=300x300`;
}

/**
 * 날짜 값을 Date 객체로 변환하는 헬퍼 함수
 */
function parseAttendanceTime(value) {
  if (!value) return null;

  if (isExcusedValue(value)) {
    return null;
  }

  try {
    if (value instanceof Date) {
      return value;
    }

    if (typeof value === 'string') {
      const str = value.trim();
      if (!str) return null;

      const match = str.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
      if (match) {
        return new Date(
          parseInt(match[1], 10),
          parseInt(match[2], 10) - 1,
          parseInt(match[3], 10),
          parseInt(match[4], 10),
          parseInt(match[5], 10),
          parseInt(match[6], 10)
        );
      }

      const parsed = new Date(str);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    if (typeof value === 'number') {
      return new Date((value - 25569) * 86400 * 1000);
    }
  } catch (e) {
    Logger.log('날짜 파싱 오류: ' + e.toString());
  }

  return null;
}

/**
 * 출석률 순위를 계산합니다. (관리자용)
 */
function getAttendanceRanking() {
  try {
    const info = getActiveAttendanceSheetInfo();
    if (!info || !info.sheet) {
      return { success: false, message: '활성화된 출석 시트가 없습니다.' };
    }

    return getAttendanceRankingFromSheet(info.sheet, info.seasonAlias);
  } catch (error) {
    Logger.log('순위 계산 오류: ' + error.toString());
    Logger.log('오류 스택: ' + (error.stack || ''));
    return { success: false, message: '순위 계산 중 오류가 발생했습니다.' };
  }
}

/**
 * 시즌별 출석률 순위를 계산합니다. (학생용)
 */
function getSeasonAttendanceRanking(seasonName) {
  if (!seasonName) {
    return { success: false, message: '시즌 정보가 없습니다.' };
  }

  try {
    const info = resolveSeasonSheetInfo(seasonName);
    return getAttendanceRankingFromSheet(info.sheet, info.seasonAlias);
  } catch (error) {
    Logger.log('시즌별 순위 계산 오류: ' + error.toString());
    Logger.log('오류 스택: ' + (error.stack || ''));
    return { success: false, message: '순위 계산 중 오류가 발생했습니다.' };
  }
}

/**
 * 특정 시트에서 출석률 순위를 계산합니다.
 */
function getAttendanceRankingFromSheet(sheet, seasonAlias) {
  const values = sheet.getDataRange().getValues();
  const now = new Date();

  const sessions = collectSessionsFromSheet(sheet, { createMissingMeta: true });
  const closedSessions = sessions.filter(session => session.lateDeadline <= now);

  if (closedSessions.length === 0) {
    return { success: true, data: [], seasonAlias: seasonAlias || toSeasonAlias(sheet.getName()) };
  }

  const rankings = [];

  for (let i = 1; i < values.length; i++) {
    const name = values[i][0];
    const grade = values[i][1];
    const phone = values[i][2];
    if (!name || !phone) continue;

    let attendedCount = 0;
    let effectiveSessionCount = 0;
    let totalAttendTimeSeconds = 0;
    let validAttendTimeCount = 0;

    closedSessions.forEach(session => {
      const cellValue = values[i][session.colIndex];
      const status = getAttendanceDetailType(cellValue, session, now);

      if (status === 'excused') {
        return;
      }

      effectiveSessionCount++;

      if (status !== 'on_time' && status !== 'late') {
        return;
      }

      attendedCount++;

      const attendTime = parseAttendanceTime(cellValue);
      if (!attendTime || isNaN(attendTime.getTime())) {
        return;
      }

      const diffSec = Math.floor((attendTime - session.startTime) / 1000);
      if (diffSec >= 0 && diffSec <= Math.floor((session.lateDeadline - session.startTime) / 1000)) {
        totalAttendTimeSeconds += diffSec;
        validAttendTimeCount++;
      }
    });

    const attendanceRate = effectiveSessionCount > 0
      ? (attendedCount / effectiveSessionCount) * 100
      : 0;

    let avgAttendTimeSeconds;
    let avgAttendTimeFormatted;

    if (validAttendTimeCount > 0) {
      avgAttendTimeSeconds = Math.round(totalAttendTimeSeconds / validAttendTimeCount);
      const avgMinutes = Math.floor(avgAttendTimeSeconds / 60);
      const avgSeconds = avgAttendTimeSeconds % 60;
      avgAttendTimeFormatted = `${avgMinutes}:${String(avgSeconds).padStart(2, '0')}`;
    } else if (attendedCount > 0) {
      avgAttendTimeSeconds = 3600;
      avgAttendTimeFormatted = '60:00';
    } else {
      avgAttendTimeSeconds = 999999;
      avgAttendTimeFormatted = '미출석';
    }

    rankings.push({
      name: name,
      grade: grade,
      attendedCount: attendedCount,
      totalSessions: effectiveSessionCount,
      attendanceRate: Math.round(attendanceRate),
      avgAttendTimeSeconds: avgAttendTimeSeconds,
      avgAttendTime: avgAttendTimeFormatted
    });
  }

  rankings.sort((a, b) => {
    if (b.attendanceRate !== a.attendanceRate) {
      return b.attendanceRate - a.attendanceRate;
    }

    if (a.avgAttendTimeSeconds === 999999) return 1;
    if (b.avgAttendTimeSeconds === 999999) return -1;

    return a.avgAttendTimeSeconds - b.avgAttendTimeSeconds;
  });

  rankings.forEach((item, index) => {
    item.rank = index + 1;
  });

  return {
    success: true,
    seasonAlias: seasonAlias || toSeasonAlias(sheet.getName()),
    data: rankings.slice(0, 10)
  };
}

function getSheetLink(seasonName) {
  try {
    const info = getRequestedSeasonSheetInfo(seasonName);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const baseUrl = ss.getUrl();
    const sheetUrl = `${baseUrl}#gid=${info.sheet.getSheetId()}`;

    return {
      success: true,
      spreadsheetUrl: baseUrl,
      sheetUrl: sheetUrl,
      sheetName: info.currentSheet,
      seasonAlias: info.seasonAlias,
      gid: info.sheet.getSheetId()
    };
  } catch (error) {
    return {
      success: false,
      message: error.message || '시트 링크 생성 중 오류가 발생했습니다.'
    };
  }
}

function getScheduleList(seasonName) {
  try {
    const info = getRequestedSeasonSheetInfo(seasonName);
    const now = new Date();
    const sessions = collectSessionsFromSheet(info.sheet, { createMissingMeta: true });

    return {
      success: true,
      seasonAlias: info.seasonAlias,
      currentSheet: info.currentSheet,
      items: sessions.map(session => ({
        sessionKey: session.sessionKey,
        header: session.header,
        startTime: session.startTime.getTime(),
        openTime: session.openTime.getTime(),
        onTimeDeadline: session.onTimeDeadline.getTime(),
        lateDeadline: session.lateDeadline.getTime(),
        explicitEndAt: session.explicitEndAt,
        startLabel: formatDateTimeMinute(session.startTime),
        openLabel: formatDateTimeMinute(session.openTime),
        endLabel: formatDateTimeMinute(session.lateDeadline),
        isPast: now > session.lateDeadline,
        isActive: now >= session.openTime && now <= session.lateDeadline
      }))
    };
  } catch (error) {
    return {
      success: false,
      message: error.message || '일정 조회 중 오류가 발생했습니다.'
    };
  }
}

function saveSchedule(params) {
  try {
    const info = getRequestedSeasonSheetInfo(params.season || '');
    const sessionKey = String(params.sessionKey || '').trim();
    const startAt = String(params.startAt || '').trim();
    const endAt = String(params.endAt || '').trim();

    if (!startAt) {
      return { success: false, message: 'startAt 파라미터가 필요합니다.' };
    }

    const startTime = parseDateTimeInput(startAt);
    if (!startTime || isNaN(startTime.getTime())) {
      return { success: false, message: 'startAt 형식이 올바르지 않습니다. (예: 2026-03-01T19:00)' };
    }

    if (endAt && !/^(\d{2}):(\d{2})$/.test(endAt)) {
      return { success: false, message: 'endAt 형식이 올바르지 않습니다. (예: 21:30)' };
    }

    const sheet = info.sheet;
    const variableConfig = getVariableConfig();
    const sessions = collectSessionsFromSheet(sheet, { variableConfig: variableConfig, createMissingMeta: true });

    const newSessionKey = formatSessionKey(startTime);
    const duplicate = sessions.find(s => s.sessionKey === newSessionKey && s.sessionKey !== sessionKey);
    if (duplicate) {
      return { success: false, message: `동일한 시작시각의 회차가 이미 존재합니다. (${newSessionKey})` };
    }

    const headerValue = buildSessionHeader(startTime, endAt);

    if (sessionKey) {
      const target = sessions.find(s => s.sessionKey === sessionKey);
      if (!target) {
        return { success: false, message: '수정 대상 회차를 찾을 수 없습니다.' };
      }

      sheet.getRange(1, target.colIndex + 1).setValue(headerValue);

      if (sessionKey !== newSessionKey) {
        removeSessionMetaRow(sheet.getName(), sessionKey);
      }

      upsertSessionMetaRow(sheet.getName(), newSessionKey, {
        openOffsetMin: variableConfig.attendance_open_offset_min,
        lateThresholdMin: variableConfig.late_threshold_min,
        absenceThresholdMin: variableConfig.absence_threshold_min,
        explicitEndAt: endAt
      });
    } else {
      const insertCol = sheet.getLastColumn() + 1;
      sheet.getRange(1, insertCol).setValue(headerValue);

      upsertSessionMetaRow(sheet.getName(), newSessionKey, {
        openOffsetMin: variableConfig.attendance_open_offset_min,
        lateThresholdMin: variableConfig.late_threshold_min,
        absenceThresholdMin: variableConfig.absence_threshold_min,
        explicitEndAt: endAt
      });
    }

    return {
      success: true,
      message: sessionKey ? '일정이 수정되었습니다.' : '일정이 추가되었습니다.',
      seasonAlias: info.seasonAlias,
      sessionKey: newSessionKey
    };
  } catch (error) {
    return {
      success: false,
      message: error.message || '일정 저장 중 오류가 발생했습니다.'
    };
  }
}

function deleteSchedule(params) {
  try {
    const info = getRequestedSeasonSheetInfo(params.season || '');
    const sessionKey = String(params.sessionKey || '').trim();
    if (!sessionKey) {
      return { success: false, message: 'sessionKey 파라미터가 필요합니다.' };
    }

    const sheet = info.sheet;
    const sessions = collectSessionsFromSheet(sheet, { createMissingMeta: true });
    const target = sessions.find(s => s.sessionKey === sessionKey);

    if (!target) {
      return { success: false, message: '삭제 대상 회차를 찾을 수 없습니다.' };
    }

    sheet.deleteColumn(target.colIndex + 1);
    removeSessionMetaRow(sheet.getName(), sessionKey);

    return {
      success: true,
      message: '일정이 삭제되었습니다.',
      sessionKey: sessionKey,
      seasonAlias: info.seasonAlias
    };
  } catch (error) {
    return {
      success: false,
      message: error.message || '일정 삭제 중 오류가 발생했습니다.'
    };
  }
}

function getMembers(seasonName) {
  try {
    const info = getRequestedSeasonSheetInfo(seasonName);
    const sheet = info.sheet;
    const values = sheet.getDataRange().getValues();

    const members = [];
    for (let i = 1; i < values.length; i++) {
      const name = String(values[i][0] || '').trim();
      const grade = String(values[i][1] || '').trim();
      const phone = normalizePhone(values[i][2]);
      if (!name || !phone) continue;

      members.push({
        name: name,
        grade: grade,
        phone: phone,
        rowIndex: i + 1
      });
    }

    return {
      success: true,
      seasonAlias: info.seasonAlias,
      currentSheet: info.currentSheet,
      members: members
    };
  } catch (error) {
    return {
      success: false,
      message: error.message || '회원 목록 조회 중 오류가 발생했습니다.'
    };
  }
}

function manualApproveAttendance(params) {
  const seasonName = String(params.season || '').trim();
  const phone = String(params.phone || '').trim();
  const sessionKey = String(params.sessionKey || '').trim();

  if (!seasonName || !phone || !sessionKey) {
    return { success: false, message: 'season, phone, sessionKey 파라미터가 필요합니다.' };
  }

  const cleanedPhone = normalizePhone(phone);
  if (!isValidPhoneNumber(cleanedPhone)) {
    return { success: false, message: '올바른 전화번호 형식이 아닙니다.' };
  }

  const lock = LockService.getDocumentLock();
  lock.waitLock(5000);

  try {
    const info = resolveSeasonSheetInfo(seasonName);
    const sheet = info.sheet;
    const sessions = collectSessionsFromSheet(sheet, { createMissingMeta: true });
    const session = sessions.find(s => s.sessionKey === sessionKey);

    if (!session) {
      return { success: false, message: '회차를 찾을 수 없습니다.' };
    }

    const values = sheet.getDataRange().getValues();
    const rowIndex = findMemberRowIndex(values, cleanedPhone);
    if (rowIndex === -1) {
      return { success: false, message: '해당 전화번호의 회원을 찾을 수 없습니다.' };
    }

    const targetRange = sheet.getRange(rowIndex + 1, session.colIndex + 1);
    const existing = targetRange.getValue();
    if (String(existing || '').trim() !== '') {
      return { success: false, message: '이미 값이 있는 회차입니다. 수동 승인 불가.' };
    }

    const writeTime = new Date(session.lateDeadline.getTime());
    const formattedTime = formatDateTime(writeTime);

    targetRange.setValue(formattedTime);
    targetRange.setBackground(LATE_COLOR);
    targetRange.setNote('수동 승인');

    return {
      success: true,
      message: '수동 출석 승인 완료',
      seasonAlias: info.seasonAlias,
      sessionKey: session.sessionKey,
      attendanceType: 'late',
      time: formattedTime,
      name: values[rowIndex][0],
      grade: values[rowIndex][1],
      phone: cleanedPhone
    };
  } finally {
    lock.releaseLock();
  }
}

function parseBooleanParam(value) {
  if (typeof value === 'boolean') return value;
  const raw = String(value || '').trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'y';
}

function setExcusedAttendance(params) {
  const seasonName = String(params.season || '').trim();
  const phone = String(params.phone || '').trim();
  const sessionKey = String(params.sessionKey || '').trim();
  const enabled = parseBooleanParam(params.enabled);
  const comment = String(params.comment || '').trim();

  if (!seasonName || !phone || !sessionKey) {
    return { success: false, message: 'season, phone, sessionKey 파라미터가 필요합니다.' };
  }

  const cleanedPhone = normalizePhone(phone);
  if (!isValidPhoneNumber(cleanedPhone)) {
    return { success: false, message: '올바른 전화번호 형식이 아닙니다.' };
  }

  const lock = LockService.getDocumentLock();
  lock.waitLock(5000);

  try {
    const info = resolveSeasonSheetInfo(seasonName);
    const sheet = info.sheet;
    const sessions = collectSessionsFromSheet(sheet, { createMissingMeta: true });
    const session = sessions.find(s => s.sessionKey === sessionKey);

    if (!session) {
      return { success: false, message: '회차를 찾을 수 없습니다.' };
    }

    const values = sheet.getDataRange().getValues();
    const rowIndex = findMemberRowIndex(values, cleanedPhone);
    if (rowIndex === -1) {
      return { success: false, message: '해당 전화번호의 회원을 찾을 수 없습니다.' };
    }

    const targetRange = sheet.getRange(rowIndex + 1, session.colIndex + 1);

    if (enabled) {
      targetRange.setValue('유고');
      targetRange.setBackground(EXCUSED_COLOR);
      targetRange.setNote(comment || '');

      return {
        success: true,
        message: '유고 처리 완료',
        seasonAlias: info.seasonAlias,
        sessionKey: session.sessionKey,
        phone: cleanedPhone,
        enabled: true,
        comment: comment
      };
    }

    if (isExcusedValue(targetRange.getValue())) {
      targetRange.clearContent();
      targetRange.setBackground('#ffffff');
      targetRange.clearNote();
    }

    return {
      success: true,
      message: '유고 해제 완료',
      seasonAlias: info.seasonAlias,
      sessionKey: session.sessionKey,
      phone: cleanedPhone,
      enabled: false
    };
  } finally {
    lock.releaseLock();
  }
}

function parseRequiredSessionPositions(raw) {
  const text = String(raw || '').trim();
  if (!text) return ['first', 'last'];

  const allowed = { first: true, last: true };
  const list = text.split(',').map(v => String(v || '').trim().toLowerCase()).filter(v => !!allowed[v]);

  if (list.length === 0) return ['first', 'last'];
  return list;
}

function evaluateRequiredSessions(requiredPositions, sessions, statusBySessionKey) {
  const results = [];

  requiredPositions.forEach(pos => {
    let targetSession = null;

    if (pos === 'first' && sessions.length > 0) {
      targetSession = sessions[0];
    }

    if (pos === 'last' && sessions.length > 0) {
      targetSession = sessions[sessions.length - 1];
    }

    if (!targetSession) return;

    const status = statusBySessionKey[targetSession.sessionKey] || 'future';
    const satisfied = status === 'on_time' || status === 'late' || status === 'excused';
    const possible = satisfied || status === 'future';

    results.push({
      position: pos,
      sessionKey: targetSession.sessionKey,
      status: status,
      satisfied: satisfied,
      possible: possible
    });
  });

  const allSatisfied = results.every(item => item.satisfied);
  const allPossible = results.every(item => item.possible);

  return {
    details: results,
    satisfied: allSatisfied,
    possible: allPossible
  };
}

function getGraduationReport(seasonName) {
  try {
    const info = getRequestedSeasonSheetInfo(seasonName);
    const sheet = info.sheet;
    const values = sheet.getDataRange().getValues();

    const variableConfig = getVariableConfig();
    const sessions = collectSessionsFromSheet(sheet, { variableConfig: variableConfig, createMissingMeta: true });
    const now = new Date();

    const requiredPositions = parseRequiredSessionPositions(variableConfig.required_session_positions);
    const lateToAbsenceRatio = Math.max(1, toNumberWithDefault(variableConfig.late_to_absence_ratio, 3));
    const requiredAttendanceCount = Math.max(0, toNumberWithDefault(variableConfig.required_attendance_count, 3));

    let maxAbsenceEquivalent = variableConfig.max_absence_equivalent;
    if (maxAbsenceEquivalent === '' || maxAbsenceEquivalent === null || maxAbsenceEquivalent === undefined) {
      maxAbsenceEquivalent = Math.max(0, sessions.length - requiredAttendanceCount);
    } else {
      maxAbsenceEquivalent = Math.max(0, toNumberWithDefault(maxAbsenceEquivalent, 0));
    }

    const notes = sheet.getLastRow() >= 2 && sheet.getLastColumn() >= 4
      ? sheet.getRange(2, 4, sheet.getLastRow() - 1, sheet.getLastColumn() - 3).getNotes()
      : [];

    const members = [];

    for (let i = 1; i < values.length; i++) {
      const name = String(values[i][0] || '').trim();
      const grade = String(values[i][1] || '').trim();
      const phone = normalizePhone(values[i][2]);
      if (!name || !phone) continue;

      let attendedCount = 0;
      let lateCount = 0;
      let absentCount = 0;
      let excusedCount = 0;
      let futureCount = 0;
      let effectivePastCount = 0;

      const details = [];
      const statusMap = {};

      sessions.forEach(session => {
        const cellValue = values[i][session.colIndex];
        const status = getAttendanceDetailType(cellValue, session, now);
        const attendTime = parseAttendanceTime(cellValue);

        const note = notes.length > 0 && notes[i - 1]
          ? String(notes[i - 1][session.colIndex - 3] || '').trim()
          : '';

        statusMap[session.sessionKey] = status;

        if (status === 'future') {
          futureCount++;
        } else if (status === 'excused') {
          excusedCount++;
        } else {
          if (status === 'on_time' || status === 'late' || status === 'absent') {
            if (now > session.lateDeadline) {
              effectivePastCount++;
            }
          }

          if (status === 'on_time' || status === 'late') {
            attendedCount++;
          }
          if (status === 'late') {
            lateCount++;
          }
          if (status === 'absent') {
            absentCount++;
          }
        }

        details.push({
          sessionKey: session.sessionKey,
          date: formatDateTimeMinute(session.startTime),
          status: status,
          attendTime: attendTime ? formatDateTime(attendTime) : '',
          note: note,
          isPast: now > session.lateDeadline,
          isRequired: false
        });
      });

      const requiredCheck = evaluateRequiredSessions(requiredPositions, sessions, statusMap);
      requiredCheck.details.forEach(req => {
        const target = details.find(item => item.sessionKey === req.sessionKey);
        if (target) {
          target.isRequired = true;
          target.requiredPosition = req.position;
        }
      });

      const absenceEquivalent = absentCount + Math.floor(lateCount / lateToAbsenceRatio);

      const meetsAttendance = attendedCount >= requiredAttendanceCount;
      const attendancePossible = attendedCount + futureCount >= requiredAttendanceCount;
      const meetsAbsence = absenceEquivalent <= maxAbsenceEquivalent;
      const requiredSatisfied = requiredCheck.satisfied;
      const requiredPossible = requiredCheck.possible;

      const isFinal = futureCount === 0;
      const isGraduated = isFinal && requiredSatisfied && meetsAttendance && meetsAbsence;
      const isGraduationPossible = requiredPossible && attendancePossible && meetsAbsence;

      members.push({
        name: name,
        grade: grade,
        phone: phone,
        attendedCount: attendedCount,
        lateCount: lateCount,
        absentCount: absentCount,
        excusedCount: excusedCount,
        effectivePastCount: effectivePastCount,
        futureCount: futureCount,
        absenceEquivalent: absenceEquivalent,
        requiredSessionsOk: requiredSatisfied,
        requiredSessionsPossible: requiredPossible,
        meetsAttendanceCount: meetsAttendance,
        meetsAbsenceThreshold: meetsAbsence,
        isGraduated: isGraduated,
        isGraduationPossible: isGraduationPossible,
        details: details
      });
    }

    return {
      success: true,
      seasonAlias: info.seasonAlias,
      currentSheet: info.currentSheet,
      generatedAt: new Date().getTime(),
      variables: {
        required_attendance_count: requiredAttendanceCount,
        late_to_absence_ratio: lateToAbsenceRatio,
        max_absence_equivalent: maxAbsenceEquivalent,
        required_session_positions: requiredPositions.join(','),
        official_session_min_recommended: variableConfig.official_session_min_recommended,
        official_session_max_recommended: variableConfig.official_session_max_recommended
      },
      sessions: sessions.map(session => {
        const isRequired = requiredCheckBySession(requiredPositions, sessions, session.sessionKey);
        return {
          sessionKey: session.sessionKey,
          date: formatDateTimeMinute(session.startTime),
          isRequired: isRequired,
          openTime: session.openTime.getTime(),
          onTimeDeadline: session.onTimeDeadline.getTime(),
          lateDeadline: session.lateDeadline.getTime()
        };
      }),
      members: members,
      colorPalette: {
        on_time: ON_TIME_COLOR,
        late: LATE_COLOR,
        absent: ABSENT_COLOR,
        excused: EXCUSED_COLOR
      }
    };
  } catch (error) {
    return {
      success: false,
      message: error.message || '수료 판정 보고서 생성 중 오류가 발생했습니다.'
    };
  }
}

function requiredCheckBySession(requiredPositions, sessions, sessionKey) {
  for (let i = 0; i < requiredPositions.length; i++) {
    const pos = requiredPositions[i];
    if (pos === 'first' && sessions.length > 0 && sessions[0].sessionKey === sessionKey) {
      return true;
    }
    if (pos === 'last' && sessions.length > 0 && sessions[sessions.length - 1].sessionKey === sessionKey) {
      return true;
    }
  }

  return false;
}
