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
const API_VERSION = '2026.02.19-v4.0';

const VARIABLE_SHEET_NAME = 'variable';
const VARIABLE_TABLE_HEADER_ROW = 1;
const VARIABLE_TABLE_FIRST_DATA_ROW = 2;
const VARIABLE_TABLE_HEADERS = ['key', 'value', 'type', 'description', 'editable', 'updated_at', 'applies_to', 'applies_when', 'used_in'];

const SESSION_META_SHEET_NAME = '_session_meta';
const SESSION_META_HEADERS = ['seasonSheet', 'sessionKey', 'openOffsetMin', 'lateThresholdMin', 'absenceThresholdMin', 'explicitEndAt', 'createdAt'];
const IMPORT_META_SHEET_NAME = '_import_meta';
const IMPORT_META_HEADERS = [
  'importId',
  'seasonAlias',
  'stagingSheetName',
  'status',
  'importMode',
  'targetMode',
  'targetSheetName',
  'schemaSummaryJson',
  'createdAt',
  'updatedAt',
  'insertedCount',
  'skippedDuplicateCount',
  'droppedInvalidCount',
  'skippedNonTargetCount'
];
const IMPORT_STATUS_ACTIVE = 'active';
const IMPORT_STATUS_FINALIZED = 'finalized';
const IMPORT_STATUS_ABORTED = 'aborted';
const IMPORT_TARGET_MODE_CREATE = 'create';
const IMPORT_TARGET_MODE_UPDATE = 'update';
const IMPORT_EFFECTIVE_SCOPE_ALL = 'all';
const IMPORT_EFFECTIVE_SCOPE_TARGET_ONLY = 'targetSeasonOnly';
const MEMBER_V2_SHEET_HEADERS = [
  'Name',
  'Season',
  'Phone',
  'Email',
  'Github ID',
  'Github Email',
  'Notion Email',
  'Discord ID',
  'Slack Email',
  '회비 체크',
  '수료 여부',
  '운영진 여부'
];
const MEMBER_IMPORT_INTERNAL_PHONE_KEY_HEADER = '_phone_key';
const MEMBER_FIELD_ORDER = [
  'name',
  'season',
  'phone',
  'email',
  'githubId',
  'githubEmail',
  'notionEmail',
  'discordId',
  'slackEmail',
  'feeChecked',
  'completed',
  'isStaff'
];
const SUPPORTED_API_ACTIONS = [
  'health',
  'apiInfo',
  'session',
  'attendance',
  'status',
  'ranking',
  'sheets',
  'setActiveSheet',
  'verifyAdminKey',
  'studentUrl',
  'adminUrl',
  'sheetLink',
  'variablesGet',
  'variablesUpdate',
  'variablesNormalize',
  'variablesResetTemplate',
  'scheduleList',
  'scheduleSave',
  'scheduleDelete',
  'members',
  'manualApprove',
  'excusedSet',
  'graduationReport',
  'sheetSchemaAudit',
  'seasonImportBegin',
  'seasonImportChunk',
  'seasonImportDiff',
  'seasonImportFinalize',
  'seasonImportAbort'
];

const VARIABLE_CATALOG = {
  attendance_open_offset_min: {
    labelKo: '출석 오픈 오프셋',
    formula: 'openTime = startTime + attendance_open_offset_min',
    example: '-30 이면 시작 30분 전 오픈',
    validation: { kind: 'number', min: -240, max: 0, required: true }
  },
  late_threshold_min: {
    labelKo: '지각 판정 기준',
    formula: 'onTimeDeadline = startTime + late_threshold_min',
    example: '50 이면 시작 50분까지 정시',
    validation: { kind: 'number', min: 1, max: 360, required: true }
  },
  absence_threshold_min: {
    labelKo: '기본 출석 마감 기준',
    formula: 'lateDeadline = startTime + absence_threshold_min',
    example: '180 이면 시작 3시간 후 마감',
    validation: { kind: 'number', min: 1, max: 600, required: true }
  },
  required_attendance_count: {
    labelKo: '수료 최소 출석 횟수',
    formula: 'attendedCount >= required_attendance_count',
    example: '3 이면 최소 3회 출석 필요',
    validation: { kind: 'number', min: 0, max: 100, required: true }
  },
  late_to_absence_ratio: {
    labelKo: '지각 결석 환산비',
    formula: 'absenceEquivalent = absent + floor(late / ratio)',
    example: '3 이면 지각 3회 = 결석 1회',
    validation: { kind: 'number', min: 1, max: 20, required: true }
  },
  required_session_positions: {
    labelKo: '필참 회차 위치',
    formula: '허용값: first,last 조합',
    example: 'first,last',
    validation: { kind: 'required_positions', required: true }
  },
  max_absence_equivalent: {
    labelKo: '결석환산 상한',
    formula: 'absenceEquivalent <= max_absence_equivalent',
    example: '빈값이면 자동 계산',
    validation: { kind: 'number', min: 0, max: 100, required: false, allowEmpty: true }
  },
  official_session_min_recommended: {
    labelKo: '권장 최소 공식행사 수',
    formula: '권장 구간 하한',
    example: '6',
    validation: { kind: 'number', min: 0, max: 100, required: true }
  },
  official_session_max_recommended: {
    labelKo: '권장 최대 공식행사 수',
    formula: '권장 구간 상한',
    example: '8',
    validation: { kind: 'number', min: 0, max: 100, required: true }
  },
  default_session_start_time: {
    labelKo: '일정 기본 시작시간',
    formula: '신규 회차 시작 시각 기본값',
    example: '19:00',
    validation: { kind: 'hhmm', required: true }
  }
};

const REQUIRED_VARIABLE_SPECS = [
  {
    key: 'attendance_open_offset_min',
    value: -30,
    type: 'number',
    description: '출석 오픈 오프셋(시작 n분 전)',
    appliesTo: '출석 오픈 시각 계산',
    appliesWhen: '회차 시작 시각 기준',
    usedIn: 'collectSessionsFromSheet.openTime'
  },
  {
    key: 'late_threshold_min',
    value: 50,
    type: 'number',
    description: '지각 판정 기준(시작 후 n분)',
    appliesTo: '정시/지각 경계 계산',
    appliesWhen: '회차 시작 이후',
    usedIn: 'collectSessionsFromSheet.onTimeDeadline'
  },
  {
    key: 'absence_threshold_min',
    value: 180,
    type: 'number',
    description: '기본 출석 마감 기준(종료 미입력 시)',
    appliesTo: '종료시간 미입력 회차 마감 계산',
    appliesWhen: '회차 종료시간이 비어 있을 때',
    usedIn: 'collectSessionsFromSheet.lateDeadline;web/admin.suggestScheduleEndTime'
  },
  {
    key: 'required_attendance_count',
    value: 3,
    type: 'number',
    description: '수료 최소 출석 횟수',
    appliesTo: '수료 최소 출석 조건 계산',
    appliesWhen: '수료 판정 계산 시',
    usedIn: 'getGraduationReport.requiredAttendance'
  },
  {
    key: 'late_to_absence_ratio',
    value: 3,
    type: 'number',
    description: '지각 n회 = 결석 1회',
    appliesTo: '결석환산 계산',
    appliesWhen: '수료 판정 계산 시',
    usedIn: 'getGraduationReport.absenceEquivalent'
  },
  {
    key: 'required_session_positions',
    value: 'first,last',
    type: 'string',
    description: '필참 회차 위치',
    appliesTo: '필참 회차 충족 여부 계산',
    appliesWhen: '수료 판정 계산 시',
    usedIn: 'evaluateRequiredSessions;getGraduationReport.requiredCheck'
  },
  {
    key: 'max_absence_equivalent',
    value: '',
    type: 'number',
    description: '결석환산 상한(빈값이면 자동 계산)',
    appliesTo: '결석환산 임계치 계산',
    appliesWhen: '수료 판정 계산 시',
    usedIn: 'getGraduationReport.absenceThreshold'
  },
  {
    key: 'official_session_min_recommended',
    value: 6,
    type: 'number',
    description: '권장 최소 공식 행사 수',
    appliesTo: '운영 가이드 표시값',
    appliesWhen: '수료 규칙 안내 렌더링 시',
    usedIn: 'getGraduationReport.variables'
  },
  {
    key: 'official_session_max_recommended',
    value: 8,
    type: 'number',
    description: '권장 최대 공식 행사 수',
    appliesTo: '운영 가이드 표시값',
    appliesWhen: '수료 규칙 안내 렌더링 시',
    usedIn: 'getGraduationReport.variables'
  },
  {
    key: 'default_session_start_time',
    value: '19:00',
    type: 'string',
    description: '일정 관리 기본 시작시간(HH:mm)',
    appliesTo: '신규 일정 시작시간 기본값',
    appliesWhen: '일정 관리 탭 신규 회차 입력 시',
    usedIn: 'getScheduleList.defaults;web/admin.getDefaultScheduleStartTime'
  }
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
  official_session_max_recommended: 8,
  default_session_start_time: '19:00'
};

const MINUTE_VARIABLE_KEYS = {
  attendance_open_offset_min: true,
  late_threshold_min: true,
  absence_threshold_min: true
};

const VARIABLE_USAGE_TAB_ORDER = [
  'QR코드 관리',
  '출석하기',
  '출석현황',
  '일정 관리',
  '변수명 관리',
  '유고 처리',
  '수료 판정'
];

const VARIABLE_KEY_TAB_MAP = {
  attendance_open_offset_min: ['출석하기', '출석현황', '일정 관리', '유고 처리', '수료 판정'],
  late_threshold_min: ['출석하기', '출석현황', '일정 관리', '유고 처리', '수료 판정'],
  absence_threshold_min: ['출석하기', '출석현황', '일정 관리', '유고 처리', '수료 판정'],
  required_attendance_count: ['유고 처리', '수료 판정'],
  late_to_absence_ratio: ['유고 처리', '수료 판정'],
  required_session_positions: ['유고 처리', '수료 판정'],
  max_absence_equivalent: ['유고 처리', '수료 판정'],
  official_session_min_recommended: ['수료 판정'],
  official_session_max_recommended: ['수료 판정'],
  default_session_start_time: ['일정 관리']
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

      case 'apiInfo':
        data = getApiInfo();
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

      case 'variablesNormalize': {
        if (!verifyAdminToken((params.adminToken || '').trim())) {
          return jsonp(callback, apiError('UNAUTHORIZED', '관리자 인증이 필요합니다.'));
        }
        data = normalizeVariablesPayload();
        break;
      }

      case 'variablesResetTemplate': {
        if (!verifyAdminToken((params.adminToken || '').trim())) {
          return jsonp(callback, apiError('UNAUTHORIZED', '관리자 인증이 필요합니다.'));
        }
        data = resetVariablesTemplate(params.mode || 'preserve');
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

      case 'sheetSchemaAudit': {
        if (!verifyAdminToken((params.adminToken || '').trim())) {
          return jsonp(callback, apiError('UNAUTHORIZED', '관리자 인증이 필요합니다.'));
        }
        data = getSheetSchemaAudit(params.season || '');
        break;
      }

      case 'seasonImportBegin': {
        if (!verifyAdminToken((params.adminToken || '').trim())) {
          return jsonp(callback, apiError('UNAUTHORIZED', '관리자 인증이 필요합니다.'));
        }
        data = beginSeasonImport(params);
        break;
      }

      case 'seasonImportChunk': {
        if (!verifyAdminToken((params.adminToken || '').trim())) {
          return jsonp(callback, apiError('UNAUTHORIZED', '관리자 인증이 필요합니다.'));
        }
        data = importSeasonChunk(params);
        break;
      }

      case 'seasonImportDiff': {
        if (!verifyAdminToken((params.adminToken || '').trim())) {
          return jsonp(callback, apiError('UNAUTHORIZED', '관리자 인증이 필요합니다.'));
        }
        data = getSeasonImportDiff(params);
        break;
      }

      case 'seasonImportFinalize': {
        if (!verifyAdminToken((params.adminToken || '').trim())) {
          return jsonp(callback, apiError('UNAUTHORIZED', '관리자 인증이 필요합니다.'));
        }
        data = finalizeSeasonImport(params);
        break;
      }

      case 'seasonImportAbort': {
        if (!verifyAdminToken((params.adminToken || '').trim())) {
          return jsonp(callback, apiError('UNAUTHORIZED', '관리자 인증이 필요합니다.'));
        }
        data = abortSeasonImport(params);
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

function getApiInfo() {
  return {
    success: true,
    apiVersion: API_VERSION,
    supportedActions: SUPPORTED_API_ACTIONS.slice(),
    scriptTimeZone: Session.getScriptTimeZone(),
    serverTime: formatDateTime(new Date())
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

function formatDateKey(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function formatTimeHhmm(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'HH:mm');
}

function formatSignedOffset(seconds) {
  if (seconds === null || seconds === undefined || isNaN(Number(seconds))) {
    return '미출석';
  }

  const value = Number(seconds);
  const sign = value < 0 ? '-' : '+';
  const abs = Math.abs(Math.round(value));
  const mm = Math.floor(abs / 60);
  const ss = abs % 60;

  return `${sign}${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
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

function ensureVariableSheet(options) {
  const opts = options || {};
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(VARIABLE_SHEET_NAME);

  if (!sheet) {
    sheet = ss.insertSheet(VARIABLE_SHEET_NAME);
    const nowText = formatDateTime(new Date());
    const baseMap = {};
    ensureRequiredVariableEntries(baseMap, nowText);
    writeVariableSheetRows(sheet, buildVariableRowsFromMap(baseMap, nowText, { includeRequired: false, includeExtras: false }));
    return sheet;
  }

  if (sheet.getLastRow() < 1) {
    const nowText = formatDateTime(new Date());
    const baseMap = {};
    ensureRequiredVariableEntries(baseMap, nowText);
    writeVariableSheetRows(sheet, buildVariableRowsFromMap(baseMap, nowText, { includeRequired: false, includeExtras: false }));
    return sheet;
  }

  if (opts.normalize === true) {
    normalizeVariableSheetData({ sheet: sheet });
  }

  return sheet;
}

function canonicalVariableKey(key) {
  return String(key || '')
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '')
    .trim()
    .toLowerCase();
}

function toVariableText(value) {
  if (value === undefined || value === null) return '';
  if (value instanceof Date && !isNaN(value.getTime())) {
    return formatDateTime(value);
  }
  return String(value).trim();
}

function parseVariableUpdatedAtTimestamp(updatedAt, fallbackOrder) {
  if (updatedAt instanceof Date && !isNaN(updatedAt.getTime())) {
    return updatedAt.getTime();
  }

  const text = String(updatedAt || '').trim();
  if (text) {
    const parsed = new Date(text.replace(/\./g, '-'));
    if (!isNaN(parsed.getTime())) {
      return parsed.getTime();
    }
  }

  return fallbackOrder;
}

function parseVariableEditable(value, defaultValue) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return defaultValue !== false;
  }
  return parseBooleanParam(value);
}

function normalizeLegacyHeaderToken(value) {
  return String(value || '')
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function isLegacyVariableHeaderRow(rowValues) {
  if (!rowValues || rowValues.length < 3) return false;
  const headerA = normalizeLegacyHeaderToken(rowValues[0]);
  const headerB = normalizeLegacyHeaderToken(rowValues[1]);
  const headerC = normalizeLegacyHeaderToken(rowValues[2]);
  return headerA === '지각한계범위'
    && headerB === '결석한계범위'
    && headerC === '출석시작범위';
}

function getRequiredVariableSpecMap() {
  const map = {};
  REQUIRED_VARIABLE_SPECS.forEach(spec => {
    map[canonicalVariableKey(spec.key)] = spec;
  });
  return map;
}

function toVariableStringCell(value) {
  if (value === undefined || value === null) return '';
  if (value instanceof Date && !isNaN(value.getTime())) {
    return formatDateTime(value);
  }
  return String(value).trim();
}

function normalizeUsedInText(value) {
  const text = toVariableStringCell(value);
  if (!text) return '';
  return text
    .split(/[,;\n]/)
    .map(item => String(item || '').trim())
    .filter(item => !!item)
    .join(';');
}

function dedupeVariableTabs(tabs) {
  const seen = {};
  const ordered = [];
  (tabs || []).forEach(tab => {
    const label = String(tab || '').trim();
    if (!label) return;
    if (seen[label]) return;
    seen[label] = true;
    ordered.push(label);
  });
  return ordered;
}

function sortVariableTabsByOrder(tabs) {
  const uniqueTabs = dedupeVariableTabs(tabs);
  const orderMap = {};
  VARIABLE_USAGE_TAB_ORDER.forEach((tab, idx) => {
    orderMap[tab] = idx;
  });

  return uniqueTabs.sort((a, b) => {
    const aOrder = Object.prototype.hasOwnProperty.call(orderMap, a) ? orderMap[a] : 999;
    const bOrder = Object.prototype.hasOwnProperty.call(orderMap, b) ? orderMap[b] : 999;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.localeCompare(b, 'ko');
  });
}

function resolveVariableUsedTabs(key, usedInText) {
  const normalizedKey = canonicalVariableKey(key);
  const tabs = ['변수명 관리'].concat(VARIABLE_KEY_TAB_MAP[normalizedKey] || []);
  const rawUsedIn = normalizeUsedInText(usedInText || '');

  if (rawUsedIn) {
    if (/getgraduationreport|evaluaterequiredsessions/i.test(rawUsedIn)) {
      tabs.push('수료 판정', '유고 처리');
    }
    if (/getschedulelist|schedulesave|suggestscheduleendtime|defaults/i.test(rawUsedIn)) {
      tabs.push('일정 관리');
    }
    if (/collectsessionsfromsheet|markattendance|getattendancesession|getattendancestatus|getattendanceranking/i.test(rawUsedIn)) {
      tabs.push('출석하기', '출석현황');
    }
  }

  return sortVariableTabsByOrder(tabs);
}

function parseTableHeaderMap(headers) {
  const map = {};
  headers.forEach((header, idx) => {
    map[canonicalVariableKey(header)] = idx;
  });
  return map;
}

function toVariableRecordFromRow(row, headerMap, order, source) {
  const keyIdx = headerMap.key;
  const key = keyIdx === undefined ? '' : canonicalVariableKey(row[keyIdx]);
  if (!key || key === 'key') return null;

  const valueIdx = headerMap.value;
  const typeIdx = headerMap.type;
  const descIdx = headerMap.description;
  const editableIdx = headerMap.editable;
  const updatedIdx = headerMap.updated_at;
  const appliesToIdx = headerMap.applies_to;
  const appliesWhenIdx = headerMap.applies_when;
  const usedInIdx = headerMap.used_in;

  return {
    key: key,
    value: valueIdx === undefined ? '' : row[valueIdx],
    type: String(typeIdx === undefined ? '' : row[typeIdx]).trim() || 'string',
    description: String(descIdx === undefined ? '' : row[descIdx]).trim(),
    editable: parseVariableEditable(editableIdx === undefined ? '' : row[editableIdx], true),
    updatedAt: toVariableStringCell(updatedIdx === undefined ? '' : row[updatedIdx]),
    appliesTo: String(appliesToIdx === undefined ? '' : row[appliesToIdx]).trim(),
    appliesWhen: String(appliesWhenIdx === undefined ? '' : row[appliesWhenIdx]).trim(),
    usedIn: normalizeUsedInText(usedInIdx === undefined ? '' : row[usedInIdx]),
    order: order,
    source: source || 'table'
  };
}

function isStrictNumberLikeValue(value) {
  if (typeof value === 'number' && isFinite(value)) return true;
  const text = String(value || '').trim();
  if (!text) return false;
  return /^-?\d+(\.\d+)?$/.test(text);
}

function isVariableRecordValid(record) {
  const key = canonicalVariableKey(record.key);
  const type = String(record.type || 'string').trim() || 'string';
  const value = record.value;
  const rawText = toVariableStringCell(value);

  if (type === 'number') {
    if (value instanceof Date) {
      return false;
    }
    if (rawText.indexOf(':') !== -1 && !isStrictNumberLikeValue(rawText)) {
      return false;
    }
  }

  const validation = validateVariableValue(key, value, type);
  return !!validation.valid;
}

function collectVariableRecords(sheet, options) {
  const opts = options || {};
  const mode = String(opts.mode || 'readStrict').trim();
  const allowLegacyNormalize = mode === 'normalizeLegacy';
  const records = [];
  const lastRow = sheet.getLastRow();
  let legacyRowsImportedCount = 0;
  let legacyRowsIgnoredCount = 0;
  let normalizedFromLegacy = false;

  if (lastRow < 1) {
    return {
      records: records,
      legacyRowsImportedCount: legacyRowsImportedCount,
      legacyRowsIgnoredCount: legacyRowsIgnoredCount,
      normalizedFromLegacy: normalizedFromLegacy
    };
  }

  const firstRow = sheet.getRange(1, 1, 1, 3).getValues()[0];
  const isSingleTable = canonicalVariableKey(firstRow[0]) === 'key';
  const hasLegacyHeader = isLegacyVariableHeaderRow(firstRow);
  const allowLegacyRead = !isSingleTable && hasLegacyHeader;

  let rowOrder = 0;
  const appendRows = (headerRow, firstDataRow, source) => {
    if (lastRow < firstDataRow) return;
    const width = Math.max(VARIABLE_TABLE_HEADERS.length, sheet.getLastColumn());
    const headers = sheet.getRange(headerRow, 1, 1, width).getValues()[0];
    const headerMap = parseTableHeaderMap(headers);
    if (headerMap.key === undefined || canonicalVariableKey(headers[headerMap.key]) !== 'key') {
      return;
    }

    const rows = sheet.getRange(firstDataRow, 1, lastRow - firstDataRow + 1, width).getValues();
    rows.forEach(row => {
      rowOrder++;
      const record = toVariableRecordFromRow(row, headerMap, rowOrder, source || 'table');
      if (!record) return;
      records.push(record);
    });
  };

  appendRows(1, 2, 'table');

  if (allowLegacyNormalize) {
    appendRows(5, 6, 'legacy_table');

    // 구형 A2:C2 레거시 레이아웃은 레거시 정규화 모드일 때만 읽는다.
    if (lastRow >= 2 && allowLegacyRead) {
      const legacyValues = sheet.getRange(2, 1, 1, 3).getValues()[0];
      const legacyKeyMap = [
        { key: 'late_threshold_min', value: legacyValues[0] },
        { key: 'absence_threshold_min', value: legacyValues[1] },
        { key: 'attendance_open_offset_min', value: legacyValues[2] }
      ];

      legacyKeyMap.forEach(item => {
        const raw = toVariableText(item.value);
        if (!raw) return;
        rowOrder++;
        legacyRowsImportedCount++;
        normalizedFromLegacy = true;
        records.push({
          key: item.key,
          value: item.value,
          type: 'number',
          description: '',
          editable: true,
          updatedAt: '',
          appliesTo: '',
          appliesWhen: '',
          usedIn: '',
          order: -100000 + rowOrder,
          source: 'legacy'
        });
      });
    } else if (lastRow >= 2 && hasLegacyHeader) {
      const legacyValues = sheet.getRange(2, 1, 1, 3).getValues()[0];
      legacyValues.forEach(value => {
        if (toVariableText(value)) {
          legacyRowsIgnoredCount++;
        }
      });
    }
  }

  return {
    records: records,
    legacyRowsImportedCount: legacyRowsImportedCount,
    legacyRowsIgnoredCount: legacyRowsIgnoredCount,
    normalizedFromLegacy: normalizedFromLegacy
  };
}

function mergeVariableRecordsByLatest(records) {
  const grouped = {};
  const map = {};
  const specMap = getRequiredVariableSpecMap();
  let invalidValueDroppedCount = 0;
  let selectedLegacyCount = 0;

  records.forEach(record => {
    const key = canonicalVariableKey(record.key);
    if (!key) return;
    if (!grouped[key]) {
      grouped[key] = [];
    }
    grouped[key].push(record);
  });

  Object.keys(grouped).forEach(key => {
    const ordered = grouped[key].slice().sort((a, b) => {
      const bTs = parseVariableUpdatedAtTimestamp(b.updatedAt, b.order);
      const aTs = parseVariableUpdatedAtTimestamp(a.updatedAt, a.order);
      if (bTs !== aTs) return bTs - aTs;
      return b.order - a.order;
    });

    const validityFlags = ordered.map(candidate => isVariableRecordValid(candidate));
    const invalidCountForKey = validityFlags.filter(flag => !flag).length;
    let selected = null;
    for (let i = 0; i < ordered.length; i++) {
      if (validityFlags[i]) {
        selected = ordered[i];
        break;
      }
    }

    invalidValueDroppedCount += invalidCountForKey;
    if (!selected) {
      return;
    }

    const spec = specMap[key] || {};
    const catalog = getVariableCatalogEntry(key);
    map[key] = {
      key: key,
      value: parseVariableValue(selected.value, selected.type, key),
      type: String(selected.type || spec.type || 'string').trim() || 'string',
      description: String(selected.description || spec.description || '').trim(),
      editable: selected.editable !== false,
      updatedAt: String(selected.updatedAt || '').trim(),
      appliesTo: String(selected.appliesTo || spec.appliesTo || '').trim(),
      appliesWhen: String(selected.appliesWhen || spec.appliesWhen || '').trim(),
      usedIn: normalizeUsedInText(selected.usedIn || spec.usedIn || '')
    };

    if ((selected.source || '') === 'legacy') {
      selectedLegacyCount++;
    }
    if (!map[key].description && catalog.description) {
      map[key].description = String(catalog.description).trim();
    }
  });

  return {
    map: map,
    selectedLegacyCount: selectedLegacyCount,
    invalidValueDroppedCount: invalidValueDroppedCount
  };
}

function ensureRequiredVariableEntries(dataMap, nowText) {
  let filledByDefaultCount = 0;
  const specMap = getRequiredVariableSpecMap();

  REQUIRED_VARIABLE_SPECS.forEach(spec => {
    const key = canonicalVariableKey(spec.key);
    const current = dataMap[key] || {};
    const hasCurrent = Object.prototype.hasOwnProperty.call(dataMap, key);
    if (!hasCurrent) {
      filledByDefaultCount++;
    }

    dataMap[key] = {
      key: key,
      value: current.value !== undefined ? current.value : spec.value,
      type: String(current.type || spec.type || 'string').trim() || 'string',
      description: String(current.description || spec.description || '').trim(),
      editable: current.editable === false ? false : true,
      updatedAt: String(current.updatedAt || nowText).trim(),
      appliesTo: String(current.appliesTo || spec.appliesTo || '').trim(),
      appliesWhen: String(current.appliesWhen || spec.appliesWhen || '').trim(),
      usedIn: normalizeUsedInText(current.usedIn || spec.usedIn || '')
    };
  });

  Object.keys(dataMap).forEach(key => {
    const current = dataMap[key] || {};
    const spec = specMap[key] || {};
    const catalog = VARIABLE_CATALOG[key] || {};
    dataMap[key] = {
      key: key,
      value: current.value,
      type: String(current.type || spec.type || 'string').trim() || 'string',
      description: String(current.description || spec.description || catalog.description || '').trim(),
      editable: current.editable === false ? false : true,
      updatedAt: String(current.updatedAt || nowText).trim(),
      appliesTo: String(current.appliesTo || spec.appliesTo || '').trim(),
      appliesWhen: String(current.appliesWhen || spec.appliesWhen || '').trim(),
      usedIn: normalizeUsedInText(current.usedIn || spec.usedIn || '')
    };
  });

  return filledByDefaultCount;
}

function buildVariableRowsFromMap(dataMap, nowText, options) {
  const opts = options || {};
  if (opts.includeRequired === true) {
    ensureRequiredVariableEntries(dataMap, nowText);
  }

  const requiredOrder = REQUIRED_VARIABLE_SPECS.map(spec => canonicalVariableKey(spec.key));
  const presentRequiredKeys = requiredOrder.filter(key => Object.prototype.hasOwnProperty.call(dataMap, key));
  const includeExtras = opts.includeExtras !== false;
  const extraKeys = includeExtras
    ? Object.keys(dataMap).filter(key => requiredOrder.indexOf(key) === -1).sort()
    : [];
  const orderedKeys = presentRequiredKeys.concat(extraKeys);

  return orderedKeys.map(key => {
    const item = dataMap[key];
    const type = String(item.type || 'string').trim() || 'string';
    return [
      key,
      parseVariableValue(item.value, type, key),
      type,
      String(item.description || '').trim(),
      item.editable === false ? 'false' : 'true',
      String(item.updatedAt || nowText).trim(),
      String(item.appliesTo || '').trim(),
      String(item.appliesWhen || '').trim(),
      normalizeUsedInText(item.usedIn || '')
    ];
  });
}

function writeVariableSheetRows(sheet, rows) {
  const rowCount = Math.max(sheet.getLastRow(), VARIABLE_TABLE_FIRST_DATA_ROW - 1 + rows.length);
  if (rowCount > 0) {
    sheet.getRange(1, 1, rowCount, VARIABLE_TABLE_HEADERS.length).clearContent();
  }

  sheet.getRange(VARIABLE_TABLE_HEADER_ROW, 1, 1, VARIABLE_TABLE_HEADERS.length).setValues([VARIABLE_TABLE_HEADERS]);

  if (rows.length > 0) {
    sheet.getRange(VARIABLE_TABLE_FIRST_DATA_ROW, 1, rows.length, VARIABLE_TABLE_HEADERS.length).setValues(rows);
  }
}

function getVariableDataSnapshot(sheet, options) {
  const opts = options || {};
  const readMode = String(opts.readMode || 'readStrict').trim();
  const nowText = formatDateTime(new Date());
  const collected = collectVariableRecords(sheet, { mode: readMode });
  const rawRecords = collected.records || [];
  const mergedResult = mergeVariableRecordsByLatest(rawRecords);
  const mergedMap = mergedResult.map || {};
  const dedupedCountBeforeDefaults = Object.keys(mergedMap).length;
  let filledByDefaultCount = 0;
  const includeRequired = opts.includeRequired === true;
  if (includeRequired) {
    filledByDefaultCount = ensureRequiredVariableEntries(mergedMap, nowText);
  }
  const rows = buildVariableRowsFromMap(mergedMap, nowText, { includeRequired: false, includeExtras: opts.includeExtras !== false });
  const mergedCount = Object.keys(mergedMap).length;
  const duplicateRemovedCount = Math.max(0, rawRecords.length - dedupedCountBeforeDefaults);
  const legacyRowsIgnoredCount = Math.max(
    0,
    toNumberWithDefault(collected.legacyRowsIgnoredCount, 0)
      + toNumberWithDefault(collected.legacyRowsImportedCount, 0)
      - toNumberWithDefault(mergedResult.selectedLegacyCount, 0)
  );

  return {
    nowText: nowText,
    rawCount: rawRecords.length,
    dedupedCount: mergedCount,
    duplicateRemovedCount: duplicateRemovedCount,
    legacyRowsImportedCount: toNumberWithDefault(collected.legacyRowsImportedCount, 0),
    legacyRowsIgnoredCount: legacyRowsIgnoredCount,
    invalidValueDroppedCount: toNumberWithDefault(mergedResult.invalidValueDroppedCount, 0),
    filledByDefaultCount: filledByDefaultCount,
    normalizedFromLegacy: !!collected.normalizedFromLegacy,
    map: mergedMap,
    rows: rows
  };
}

function normalizeVariableSheetData(options) {
  const opts = options || {};
  const sheet = opts.sheet || ensureVariableSheet();
  const snapshot = getVariableDataSnapshot(sheet, { includeRequired: true, includeExtras: false, readMode: 'normalizeLegacy' });
  writeVariableSheetRows(sheet, snapshot.rows);

  return {
    sheetName: sheet.getName(),
    rowCount: snapshot.rows.length,
    duplicateRemovedCount: snapshot.duplicateRemovedCount,
    normalizedFromLegacy: !!snapshot.normalizedFromLegacy,
    legacyRowsIgnoredCount: snapshot.legacyRowsIgnoredCount,
    invalidValueDroppedCount: snapshot.invalidValueDroppedCount,
    filledByDefaultCount: snapshot.filledByDefaultCount
  };
}

function normalizeVariablesPayload() {
  const sheet = ensureVariableSheet();
  const normalized = normalizeVariableSheetData({ sheet: sheet });
  const payload = getVariablesPayload();
  payload.message = `variable 시트 정규화 완료 (중복 정리 ${normalized.duplicateRemovedCount}건, 무효값 폐기 ${normalized.invalidValueDroppedCount}건, 기본값 보정 ${normalized.filledByDefaultCount}건)`;
  payload.normalized = normalized;
  payload.normalizedFromLegacy = !!normalized.normalizedFromLegacy;
  payload.duplicateRemovedCount = normalized.duplicateRemovedCount;
  payload.legacyRowsIgnoredCount = normalized.legacyRowsIgnoredCount;
  payload.invalidValueDroppedCount = normalized.invalidValueDroppedCount;
  payload.filledByDefaultCount = normalized.filledByDefaultCount;
  return payload;
}

function buildTemplateVariableMap(nowText) {
  const map = {};
  REQUIRED_VARIABLE_SPECS.forEach(spec => {
    const key = canonicalVariableKey(spec.key);
    map[key] = {
      key: key,
      value: spec.value,
      type: String(spec.type || 'string').trim() || 'string',
      description: String(spec.description || '').trim(),
      editable: true,
      updatedAt: nowText,
      appliesTo: String(spec.appliesTo || '').trim(),
      appliesWhen: String(spec.appliesWhen || '').trim(),
      usedIn: normalizeUsedInText(spec.usedIn || '')
    };
  });
  return map;
}

function resetVariablesTemplate(modeRaw) {
  const mode = String(modeRaw || 'preserve').trim().toLowerCase();
  if (mode !== 'preserve' && mode !== 'reset') {
    return { success: false, message: 'mode 파라미터는 preserve 또는 reset 이어야 합니다.' };
  }

  const sheet = ensureVariableSheet();
  const currentConfig = getVariableConfig();
  seedSessionMetaForAllSeasonSheets(currentConfig);
  const snapshot = getVariableDataSnapshot(sheet, { includeRequired: true, includeExtras: false, readMode: 'normalizeLegacy' });
  const nowText = formatDateTime(new Date());
  const templateMap = buildTemplateVariableMap(nowText);

  if (mode === 'preserve') {
    Object.keys(templateMap).forEach(key => {
      const current = snapshot.map[key];
      if (!current) return;
      if (!isVariableRecordValid(current)) return;
      templateMap[key].value = current.value;
      templateMap[key].updatedAt = String(current.updatedAt || nowText).trim();
    });
  }

  const rows = buildVariableRowsFromMap(templateMap, nowText, { includeRequired: false, includeExtras: false });
  writeVariableSheetRows(sheet, rows);

  const payload = getVariablesPayload();
  payload.message = mode === 'reset'
    ? '변수 템플릿 완전 초기화 완료'
    : '변수 템플릿 복구 완료 (value 유지)';
  payload.resetMode = mode;
  payload.normalized = {
    sheetName: sheet.getName(),
    rowCount: rows.length,
    duplicateRemovedCount: snapshot.duplicateRemovedCount,
    invalidValueDroppedCount: snapshot.invalidValueDroppedCount,
    filledByDefaultCount: snapshot.filledByDefaultCount
  };
  return payload;
}

function isMinuteVariableKey(key) {
  return !!MINUTE_VARIABLE_KEYS[canonicalVariableKey(key)];
}

function parseMinutesFromTimeText(text) {
  const match = String(text || '').trim().match(/^(-)?(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;

  const sign = match[1] ? -1 : 1;
  const hh = parseInt(match[2], 10);
  const mm = parseInt(match[3], 10);
  const ss = match[4] ? parseInt(match[4], 10) : 0;
  if (isNaN(hh) || isNaN(mm) || isNaN(ss)) return null;

  const minutes = (hh * 60) + mm + (ss / 60);
  return Math.round(sign * minutes);
}

function toHhmmFromAny(value) {
  if (value instanceof Date && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'HH:mm');
  }

  if (typeof value === 'number' && isFinite(value)) {
    if (Math.abs(value) <= 1) {
      const dayMinutes = Math.round(((value % 1) + 1) % 1 * 24 * 60);
      const hh = Math.floor(dayMinutes / 60);
      const mm = dayMinutes % 60;
      return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }

    if (value >= 0 && value < 24) {
      return `${String(Math.floor(value)).padStart(2, '0')}:00`;
    }
  }

  const text = String(value || '').trim();
  if (!text) return '';

  const hhmm = text.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (hhmm) {
    return `${String(parseInt(hhmm[1], 10)).padStart(2, '0')}:${hhmm[2]}`;
  }

  const parsed = new Date(text.replace(/\./g, '-').replace('T', ' '));
  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, Session.getScriptTimeZone(), 'HH:mm');
  }

  return '';
}

function parseVariableValue(value, type, key) {
  const normalizedType = String(type || 'string').trim() || 'string';
  const normalizedKey = canonicalVariableKey(key);
  const raw = value === null || value === undefined ? '' : String(value).trim();

  if (normalizedType === 'number') {
    if (value instanceof Date && !isNaN(value.getTime())) {
      if (!isMinuteVariableKey(normalizedKey)) return '';
      return (value.getHours() * 60) + value.getMinutes();
    }

    if (typeof value === 'number' && isFinite(value)) {
      if (isMinuteVariableKey(normalizedKey) && Math.abs(value) < 1 && value !== 0) {
        return Math.round(value * 24 * 60);
      }
      return value;
    }

    if (raw === '') return '';

    if (isMinuteVariableKey(normalizedKey)) {
      const timeMinutes = parseMinutesFromTimeText(raw);
      if (timeMinutes !== null) {
        return timeMinutes;
      }
    }

    const n = Number(raw);
    if (isNaN(n)) return '';
    if (isMinuteVariableKey(normalizedKey) && Math.abs(n) < 1 && n !== 0) {
      return Math.round(n * 24 * 60);
    }
    return n;
  }

  if (normalizedType === 'boolean') {
    if (raw === '') return false;
    return /^(true|1|yes|y)$/i.test(raw);
  }

  if (normalizedKey === 'default_session_start_time') {
    const hhmm = toHhmmFromAny(value);
    if (hhmm) return hhmm;
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

  normalized.required_session_positions = parseRequiredSessionPositions(normalized.required_session_positions).join(',');
  normalized.default_session_start_time = normalizeHhmm(normalized.default_session_start_time, VARIABLE_DEFAULTS.default_session_start_time);

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

function normalizeHhmm(value, defaultValue) {
  const text = String(value || '').trim();
  if (/^([01]\d|2[0-3]):([0-5]\d)$/.test(text)) {
    return text;
  }

  return String(defaultValue || '19:00');
}

function getVariableCatalogEntry(key) {
  const normalizedKey = canonicalVariableKey(key);
  const entry = VARIABLE_CATALOG[normalizedKey] || {};
  return Object.assign({}, entry);
}

function buildVariableValidationText(validation) {
  if (!validation || !validation.kind) return '';

  if (validation.kind === 'number') {
    const min = validation.min !== undefined ? validation.min : '-∞';
    const max = validation.max !== undefined ? validation.max : '∞';
    const requiredText = validation.allowEmpty ? '빈값 허용' : '필수';
    return `숫자(${min}~${max}, ${requiredText})`;
  }

  if (validation.kind === 'hhmm') {
    return 'HH:mm (24시간)';
  }

  if (validation.kind === 'required_positions') {
    return 'first,last 조합';
  }

  return '';
}

function validateVariableValue(key, value, type) {
  const catalog = getVariableCatalogEntry(key);
  const validation = catalog.validation || {};
  const text = value === undefined || value === null ? '' : String(value).trim();

  if (validation.kind === 'hhmm') {
    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(text)) {
      return { valid: false, message: `${key}: HH:mm 형식이어야 합니다. (예: 19:00)` };
    }
    return { valid: true };
  }

  if (validation.kind === 'required_positions') {
    const rawList = text.split(',').map(v => String(v || '').trim().toLowerCase()).filter(v => !!v);
    if (rawList.length === 0) {
      return { valid: false, message: `${key}: first,last 중 1개 이상 지정해야 합니다.` };
    }
    const invalid = rawList.filter(v => v !== 'first' && v !== 'last');
    if (invalid.length > 0) {
      return { valid: false, message: `${key}: 허용값은 first,last 만 가능합니다.` };
    }
    return { valid: true };
  }

  if (validation.kind === 'number') {
    if (text === '') {
      if (validation.allowEmpty) {
        return { valid: true };
      }
      return { valid: false, message: `${key}: 빈값을 허용하지 않습니다.` };
    }

    if (value instanceof Date || (typeof value === 'string' && text.indexOf(':') !== -1 && !/^-?\d+(\.\d+)?$/.test(text))) {
      return { valid: false, message: `${key}: 시간형식(예: 0:00) 대신 분 단위 숫자를 입력하세요.` };
    }

    const parsed = parseVariableValue(value, 'number', key);
    const n = Number(parsed);
    if (parsed === '' || isNaN(n)) {
      return { valid: false, message: `${key}: 숫자값이어야 합니다.` };
    }

    if (validation.min !== undefined && n < validation.min) {
      return { valid: false, message: `${key}: ${validation.min} 이상이어야 합니다.` };
    }
    if (validation.max !== undefined && n > validation.max) {
      return { valid: false, message: `${key}: ${validation.max} 이하여야 합니다.` };
    }

    return { valid: true };
  }

  if (type === 'number' && text !== '' && parseVariableValue(value, 'number', key) === '') {
    return { valid: false, message: `${key}: 숫자값이어야 합니다.` };
  }

  return { valid: true };
}

function getVariablesPayload() {
  const sheet = ensureVariableSheet();
  const snapshot = getVariableDataSnapshot(sheet, { includeRequired: true, includeExtras: false, readMode: 'readStrict' });
  const items = [];
  const config = Object.assign({}, VARIABLE_DEFAULTS);
  const specMap = getRequiredVariableSpecMap();

  snapshot.rows.forEach((row, idx) => {
    const key = canonicalVariableKey(row[0]);
    if (!key) return;
    if (!Object.prototype.hasOwnProperty.call(specMap, key)) return;

    const type = String(row[2] || '').trim() || 'string';
    const parsedValue = parseVariableValue(row[1], type, key);
    const editable = String(row[4] || '').trim();
    const catalog = getVariableCatalogEntry(key);
    const spec = specMap[key] || {};
    const appliesTo = String(row[6] || spec.appliesTo || '').trim();
    const appliesWhen = String(row[7] || spec.appliesWhen || '').trim();
    const usedIn = normalizeUsedInText(row[8] || spec.usedIn || '');
    const usedTabs = resolveVariableUsedTabs(key, usedIn);
    const usedTabsText = usedTabs.join(', ');

    items.push({
      key: key,
      value: parsedValue,
      type: type,
      description: String(row[3] || '').trim(),
      editable: editable === '' ? true : /^(true|1|yes|y)$/i.test(editable),
      updatedAt: String(row[5] || '').trim(),
      row: VARIABLE_TABLE_FIRST_DATA_ROW + idx,
      labelKo: String(catalog.labelKo || '').trim(),
      appliesTo: appliesTo,
      appliesWhen: appliesWhen,
      applies_to: appliesTo,
      applies_when: appliesWhen,
      usedIn: usedIn,
      used_in: usedIn,
      usedTabs: usedTabs,
      usedTabsText: usedTabsText,
      formula: String(catalog.formula || '').trim(),
      example: String(catalog.example || '').trim(),
      validation: catalog.validation || null,
      validationText: buildVariableValidationText(catalog.validation || null)
    });

    if (parsedValue !== '' || !(key in config)) {
      config[key] = parsedValue;
    }
  });

  return {
    success: true,
    sheetName: VARIABLE_SHEET_NAME,
    items: items,
    catalog: VARIABLE_CATALOG,
    config: normalizeVariableConfig(config),
    stats: {
      duplicateRemovedCount: snapshot.duplicateRemovedCount,
      invalidValueDroppedCount: snapshot.invalidValueDroppedCount,
      filledByDefaultCount: snapshot.filledByDefaultCount,
      legacyRowsIgnoredCount: snapshot.legacyRowsIgnoredCount
    }
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
  const snapshot = getVariableDataSnapshot(sheet, { includeRequired: true, includeExtras: false, readMode: 'readStrict' });
  const existingMap = snapshot.map;

  const nowText = formatDateTime(new Date());
  const specMap = getRequiredVariableSpecMap();

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const key = canonicalVariableKey((item && item.key) || '');
    if (!key) continue;

    const existing = existingMap[key] || null;
    const spec = specMap[key] || null;
    if (!existing || !spec) {
      return { success: false, message: `${key}: 템플릿에 없는 변수입니다. key 변경은 허용되지 않습니다.` };
    }

    if (existing && existing.editable === false) {
      return { success: false, message: `${key}: 수정 불가 항목입니다.` };
    }

    const expectedType = String(existing.type || spec.type || 'string').trim() || 'string';
    if (item && item.type !== undefined && String(item.type || '').trim() && String(item.type).trim() !== expectedType) {
      return { success: false, message: `${key}: type 변경은 허용되지 않습니다.` };
    }
    if (item && item.description !== undefined && String(item.description || '').trim() !== String(existing.description || '').trim()) {
      return { success: false, message: `${key}: description 변경은 허용되지 않습니다.` };
    }
    if (item && item.editable !== undefined && parseBooleanParam(item.editable) !== (existing.editable !== false)) {
      return { success: false, message: `${key}: editable 변경은 허용되지 않습니다.` };
    }

    const rawValue = item ? item.value : '';
    const validation = validateVariableValue(key, rawValue, expectedType);
    if (!validation.valid) {
      return { success: false, message: validation.message || `${key} 변수값 검증에 실패했습니다.` };
    }

    const value = parseVariableValue(rawValue, expectedType, key);

    existingMap[key] = {
      key: key,
      value: value,
      type: expectedType,
      description: String(existing.description || spec.description || '').trim(),
      editable: existing.editable !== false,
      updatedAt: nowText,
      appliesTo: String(existing.appliesTo || spec.appliesTo || '').trim(),
      appliesWhen: String(existing.appliesWhen || spec.appliesWhen || '').trim(),
      usedIn: normalizeUsedInText(existing.usedIn || spec.usedIn || '')
    };
  }

  const rows = buildVariableRowsFromMap(existingMap, nowText, { includeRequired: true, includeExtras: false });
  writeVariableSheetRows(sheet, rows);

  const payload = getVariablesPayload();
  payload.message = `변수 저장 완료 (중복 ${snapshot.duplicateRemovedCount}건 정리, 무효값 ${snapshot.invalidValueDroppedCount}건 제외)`;
  payload.normalized = {
    sheetName: sheet.getName(),
    rowCount: rows.length,
    duplicateRemovedCount: snapshot.duplicateRemovedCount,
    invalidValueDroppedCount: snapshot.invalidValueDroppedCount,
    filledByDefaultCount: snapshot.filledByDefaultCount
  };
  return payload;
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

function getSessionMetaPack(seasonSheetName, options) {
  const opts = options || {};
  const createIfMissing = opts.createIfMissing !== false;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const metaSheet = createIfMissing
    ? ensureSessionMetaSheet()
    : ss.getSheetByName(SESSION_META_SHEET_NAME);
  const map = {};

  if (!metaSheet) {
    return { metaSheet: null, map: map };
  }

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
  const memberSchema = opts.memberSchema || resolveMemberSchemaFromHeaders(headers);
  const parsedSessions = [];

  for (let j = Math.max(0, memberSchema.sessionStartColIndex); j < headers.length; j++) {
    const parsed = parseSessionHeader(headers[j]);
    if (!parsed) continue;

    parsed.colIndex = j;
    parsedSessions.push(parsed);
  }

  if (parsedSessions.length === 0) {
    return [];
  }

  const seasonSheetName = sheet.getName();
  const metaPack = getSessionMetaPack(seasonSheetName, { createIfMissing: createMissingMeta });
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

    if (createMissingMeta && existing && parsed.explicitEndAt && existing.explicitEndAt !== parsed.explicitEndAt) {
      existing.explicitEndAt = parsed.explicitEndAt;
      updateRows.push({ row: existing.rowIndex, explicitEndAt: parsed.explicitEndAt });
    }
  });

  if (createMissingMeta && metaPack.metaSheet && pendingMetaRows.length > 0) {
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

  if (createMissingMeta && metaPack.metaSheet && updateRows.length > 0) {
    updateRows.forEach(item => {
      metaPack.metaSheet.getRange(item.row, 6).setValue(item.explicitEndAt);
    });
  }

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
  const sessions = collectSessionsFromSheet(sheet, { createMissingMeta: false });
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
  return /^010\d{8}$/.test(String(phoneNumber || '').replace(/\D/g, ''));
}

function normalizePhone(phoneNumber) {
  return String(phoneNumber || '').replace(/\D/g, '').trim();
}

function normalizeMemberHeaderToken(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-]/g, '')
    .replace(/[()]/g, '')
    .replace(/\./g, '');
}

function getMemberHeaderHints() {
  return {
    name: ['name', '이름', '성명', '성함'],
    season: ['season', '기수', 'cohort', '학기'],
    phone: ['phone', '전화번호', '핸드폰', '휴대폰', '연락처', 'mobile'],
    email: ['email', '이메일', '메일', '연락처이메일'],
    githubId: ['githubid', 'github', '깃허브id', '깃허브아이디'],
    githubEmail: ['githubemail', '깃허브이메일'],
    notionEmail: ['notionemail', '노션이메일'],
    discordId: ['discordid', 'discorid', '디스코드id', '디스코드아이디'],
    slackEmail: ['slackemail', '슬랙이메일'],
    feeChecked: ['회비체크', '회비', 'feepaid', 'feechecked'],
    completed: ['수료여부', '수료', 'completed'],
    isStaff: ['운영진여부', '운영진', 'staff', 'isstaff']
  };
}

function resolveMemberSchemaFromHeaders(headers) {
  const values = Array.isArray(headers) ? headers : [];
  const tokens = values.map(normalizeMemberHeaderToken);
  const hints = getMemberHeaderHints();
  const fieldMap = {};
  const usedCols = {};

  MEMBER_FIELD_ORDER.forEach(field => {
    const hintList = hints[field] || [];
    let bestIndex = -1;
    let bestScore = 0;

    for (let i = 0; i < tokens.length; i++) {
      if (usedCols[i]) continue;
      const token = tokens[i];
      if (!token) continue;

      let score = 0;
      hintList.forEach(h => {
        const hint = normalizeMemberHeaderToken(h);
        if (!hint) return;
        if (token === hint) {
          score = Math.max(score, 1);
          return;
        }
        if (token.indexOf(hint) !== -1 || hint.indexOf(token) !== -1) {
          score = Math.max(score, 0.72);
        }
      });

      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }

    if (bestIndex >= 0 && bestScore >= 0.65) {
      fieldMap[field] = bestIndex;
      usedCols[bestIndex] = true;
    } else {
      fieldMap[field] = null;
    }
  });

  if (fieldMap.name === null && values.length > 0) fieldMap.name = 0;
  if (fieldMap.season === null && values.length > 1) fieldMap.season = 1;
  if (fieldMap.phone === null && values.length > 2) fieldMap.phone = 2;

  let sessionStartColIndex = -1;
  const sessionColumns = [];
  for (let i = 0; i < values.length; i++) {
    if (parseSessionHeader(values[i])) {
      sessionColumns.push(i);
      if (sessionStartColIndex === -1) {
        sessionStartColIndex = i;
      }
    }
  }

  let profileMax = 0;
  MEMBER_FIELD_ORDER.forEach(field => {
    const idx = fieldMap[field];
    if (idx !== null && idx !== undefined) {
      profileMax = Math.max(profileMax, idx + 1);
    }
  });
  profileMax = Math.max(profileMax, 3);
  if (sessionStartColIndex === -1 || sessionStartColIndex < profileMax) {
    sessionStartColIndex = profileMax;
  }

  const missingRequired = ['name', 'season', 'phone'].filter(field => fieldMap[field] === null || fieldMap[field] === undefined);
  const strictMissingRequired = ['name', 'season', 'phone', 'email'].filter(field => fieldMap[field] === null || fieldMap[field] === undefined);

  const isV2 = MEMBER_V2_SHEET_HEADERS.every((header, idx) => normalizeMemberHeaderToken(values[idx]) === normalizeMemberHeaderToken(header));

  return {
    headers: values,
    fieldMap: fieldMap,
    sessionStartColIndex: sessionStartColIndex,
    sessionColumns: sessionColumns,
    missingRequired: missingRequired,
    strictMissingRequired: strictMissingRequired,
    isV2: isV2
  };
}

function resolveMemberSchema(sheet) {
  const lastCol = Math.max(1, sheet.getLastColumn());
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
  return resolveMemberSchemaFromHeaders(headers);
}

function getMemberFieldValue(row, schema, field) {
  const map = schema && schema.fieldMap ? schema.fieldMap : {};
  const idx = map[field];
  if (idx === null || idx === undefined || idx < 0) return '';
  return row[idx];
}

function normalizeSeasonNumber(value) {
  if (value === null || value === undefined || value === '') return NaN;
  if (typeof value === 'number' && isFinite(value)) {
    const rounded = Math.round(value);
    return rounded > 0 ? rounded : NaN;
  }
  return parseCohortNumber(value);
}

function formatSeasonLabel(value) {
  const seasonNo = normalizeSeasonNumber(value);
  if (!isNaN(seasonNo)) return `${seasonNo}기`;
  const text = String(value || '').trim();
  return text || '';
}

function parseBooleanLikeValue(value) {
  if (value === true) return { value: true, valid: true };
  if (value === false) return { value: false, valid: true };
  if (value === null || value === undefined || value === '') return { value: null, valid: true };

  const text = String(value).trim().toLowerCase();
  if (!text) return { value: null, valid: true };

  const trueTokens = { true: true, '1': true, y: true, yes: true, o: true, '예': true, '체크': true, checked: true };
  const falseTokens = { false: true, '0': true, n: true, no: true, x: true, '아니오': true, unchecked: true };

  if (trueTokens[text]) return { value: true, valid: true };
  if (falseTokens[text]) return { value: false, valid: true };
  return { value: null, valid: false };
}

function normalizeMemberRecord(raw, schema) {
  const row = Array.isArray(raw) ? raw : [];
  const memberSchema = schema || { fieldMap: {} };
  const seasonRaw = getMemberFieldValue(row, memberSchema, 'season');
  const seasonNo = normalizeSeasonNumber(seasonRaw);
  const seasonLabel = formatSeasonLabel(seasonRaw);

  const email = normalizeImportEmail(getMemberFieldValue(row, memberSchema, 'email'));
  const githubId = String(getMemberFieldValue(row, memberSchema, 'githubId') || '').trim();
  const githubEmail = normalizeImportEmail(getMemberFieldValue(row, memberSchema, 'githubEmail'));
  const notionEmail = normalizeImportEmail(getMemberFieldValue(row, memberSchema, 'notionEmail'));
  const discordId = String(getMemberFieldValue(row, memberSchema, 'discordId') || '').trim();
  const slackEmail = normalizeImportEmail(getMemberFieldValue(row, memberSchema, 'slackEmail'));
  const feeChecked = parseBooleanLikeValue(getMemberFieldValue(row, memberSchema, 'feeChecked'));
  const completed = parseBooleanLikeValue(getMemberFieldValue(row, memberSchema, 'completed'));
  const isStaff = parseBooleanLikeValue(getMemberFieldValue(row, memberSchema, 'isStaff'));

  return {
    name: String(getMemberFieldValue(row, memberSchema, 'name') || '').trim(),
    season: isNaN(seasonNo) ? null : seasonNo,
    seasonLabel: seasonLabel,
    grade: seasonLabel,
    phone: normalizePhone(getMemberFieldValue(row, memberSchema, 'phone')),
    email: email,
    githubId: githubId,
    githubEmail: githubEmail,
    notionEmail: notionEmail,
    discordId: discordId,
    slackEmail: slackEmail,
    feeChecked: feeChecked.value,
    completed: completed.value,
    isStaff: isStaff.value
  };
}

function readMemberFromRow(row, schema) {
  return normalizeMemberRecord(row, schema);
}

function findMemberRowIndexByPhone(values, schema, cleanedPhone) {
  const rows = Array.isArray(values) ? values : [];
  const memberSchema = schema || resolveMemberSchemaFromHeaders(rows[0] || []);
  const matchedRowIndexes = [];

  for (let i = 1; i < rows.length; i++) {
    const storedPhone = normalizePhone(getMemberFieldValue(rows[i], memberSchema, 'phone'));
    if (!storedPhone) continue;
    if (storedPhone === cleanedPhone) {
      matchedRowIndexes.push(i);
    }
  }

  return {
    rowIndex: matchedRowIndexes.length === 1 ? matchedRowIndexes[0] : -1,
    matchedRowIndexes: matchedRowIndexes,
    duplicateRowIndexes: matchedRowIndexes.length > 1 ? matchedRowIndexes : []
  };
}

function findMemberRowIndex(values, cleanedPhone, schema) {
  const result = findMemberRowIndexByPhone(values, schema, cleanedPhone);
  if (result.matchedRowIndexes.length === 0) return -1;
  return result.matchedRowIndexes[0];
}

function buildPhoneSuperkeyDuplicateResult(rowIndexes) {
  const rows = (rowIndexes || []).map(idx => idx + 1);
  return {
    success: false,
    errorCode: 'PHONE_SUPERKEY_DUPLICATE',
    message: `동일 Phone 슈퍼키가 중복되었습니다. (rows: ${rows.join(', ')})`,
    duplicateRows: rows
  };
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
    const memberSchema = resolveMemberSchemaFromHeaders(values[0] || []);
    const now = new Date();

    const sessions = collectSessionsFromSheet(sheet, { createMissingMeta: true, memberSchema: memberSchema });
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

    const lookup = findMemberRowIndexByPhone(values, memberSchema, cleanedInputPhone);
    if (lookup.duplicateRowIndexes.length > 0) {
      return buildPhoneSuperkeyDuplicateResult(lookup.duplicateRowIndexes);
    }

    const targetRowIndex = lookup.rowIndex;
    if (targetRowIndex < 0) {
      return { success: false, message: '등록되지 않은 전화번호입니다.' };
    }

    const member = readMemberFromRow(values[targetRowIndex], memberSchema);
    const seasonDisplay = member.seasonLabel || '미정기수';

    const targetRange = sheet.getRange(targetRowIndex + 1, activeSession.colIndex + 1);
    const existing = targetRange.getValue();
    if (existing && String(existing).trim() !== '') {
      return { success: false, message: `(${seasonDisplay}) ${member.name}님은 이미 출석체크를 완료했습니다.` };
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

    const seasonLabel = member.seasonLabel || seasonDisplay;
    const fortune = getRandomFortune();

    return {
      success: true,
      name: member.name,
      grade: seasonLabel,
      season: member.season,
      seasonLabel: seasonLabel,
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
  const memberSchema = resolveMemberSchemaFromHeaders(values[0] || []);
  const sessions = collectSessionsFromSheet(sheet, { createMissingMeta: false, memberSchema: memberSchema });

  const lookup = findMemberRowIndexByPhone(values, memberSchema, cleanedInputPhone);
  if (lookup.duplicateRowIndexes.length > 0) {
    return buildPhoneSuperkeyDuplicateResult(lookup.duplicateRowIndexes);
  }

  const targetRowIndex = lookup.rowIndex;
  if (targetRowIndex < 0) {
    return { success: false, message: '등록되지 않은 전화번호입니다.' };
  }

  const now = new Date();
  const member = readMemberFromRow(values[targetRowIndex], memberSchema);

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
      name: member.name,
      grade: member.seasonLabel || formatSeasonLabel(member.season),
      season: member.season,
      seasonLabel: member.seasonLabel || formatSeasonLabel(member.season),
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
    const memberSchema = resolveMemberSchemaFromHeaders(values[0] || []);
    const phoneNumbers = [];

    for (let i = 1; i < values.length; i++) {
      const memberPhone = normalizePhone(getMemberFieldValue(values[i], memberSchema, 'phone'));
      if (!memberPhone) continue;
      phoneNumbers.push(memberPhone);
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

      const normalized = str
        .replace(/\./g, '-')
        .replace(/\//g, '-')
        .replace('T', ' ');

      const match = normalized.match(/(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{2}):(\d{2})(?::(\d{2}))?/);
      if (match) {
        return new Date(
          parseInt(match[1], 10),
          parseInt(match[2], 10) - 1,
          parseInt(match[3], 10),
          parseInt(match[4], 10),
          parseInt(match[5], 10),
          match[6] ? parseInt(match[6], 10) : 0
        );
      }

      const parsed = new Date(str);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }

    if (typeof value === 'number') {
      if (!isFinite(value)) return null;
      return new Date(Math.round((value - 25569) * 86400 * 1000));
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
  const memberSchema = resolveMemberSchemaFromHeaders(values[0] || []);
  const now = new Date();

  const sessions = collectSessionsFromSheet(sheet, { createMissingMeta: false, memberSchema: memberSchema });
  const closedSessions = sessions.filter(session => session.lateDeadline <= now);

  if (closedSessions.length === 0) {
    return { success: true, data: [], seasonAlias: seasonAlias || toSeasonAlias(sheet.getName()) };
  }

  const rankings = [];

  for (let i = 1; i < values.length; i++) {
    const member = readMemberFromRow(values[i], memberSchema);
    if (!member.name || !member.phone) continue;

    let attendedCount = 0;
    let effectiveSessionCount = 0;
    let totalAttendOffsetSeconds = 0;
    let validOffsetCount = 0;

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
      const minAllowed = Math.floor((session.openTime - session.startTime) / 1000);
      const maxAllowed = Math.floor((session.lateDeadline - session.startTime) / 1000);

      if (diffSec >= minAllowed && diffSec <= maxAllowed) {
        totalAttendOffsetSeconds += diffSec;
        validOffsetCount++;
      }
    });

    const attendanceRate = effectiveSessionCount > 0
      ? (attendedCount / effectiveSessionCount) * 100
      : 0;

    let avgAttendOffsetSeconds = null;
    let avgAttendOffsetFormatted = '미출석';

    if (validOffsetCount > 0) {
      avgAttendOffsetSeconds = Math.round(totalAttendOffsetSeconds / validOffsetCount);
      avgAttendOffsetFormatted = formatSignedOffset(avgAttendOffsetSeconds);
    }

    rankings.push({
      name: member.name,
      grade: member.seasonLabel || formatSeasonLabel(member.season),
      season: member.season,
      seasonLabel: member.seasonLabel || formatSeasonLabel(member.season),
      attendedCount: attendedCount,
      totalSessions: effectiveSessionCount,
      attendanceRate: Math.round(attendanceRate),
      avgAttendOffsetSeconds: avgAttendOffsetSeconds,
      avgAttendOffset: avgAttendOffsetFormatted,
      // 하위 호환: 기존 프런트 필드명 유지
      avgAttendTimeSeconds: avgAttendOffsetSeconds === null ? 999999 : avgAttendOffsetSeconds,
      avgAttendTime: avgAttendOffsetFormatted
    });
  }

  rankings.sort((a, b) => {
    const aAttended = Number(a.attendedCount || 0);
    const bAttended = Number(b.attendedCount || 0);
    if (bAttended !== aAttended) {
      return bAttended - aAttended;
    }

    const aOffset = a.avgAttendOffsetSeconds === null || a.avgAttendOffsetSeconds === undefined
      ? Number.POSITIVE_INFINITY
      : Number(a.avgAttendOffsetSeconds);
    const bOffset = b.avgAttendOffsetSeconds === null || b.avgAttendOffsetSeconds === undefined
      ? Number.POSITIVE_INFINITY
      : Number(b.avgAttendOffsetSeconds);
    if (aOffset !== bOffset) {
      return aOffset - bOffset;
    }

    return String(a.name || '').localeCompare(String(b.name || ''));
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

function buildSheetSchemaAuditReport(sheet, seasonAlias) {
  const values = sheet.getDataRange().getValues();
  const headers = values[0] || [];
  const schema = resolveMemberSchemaFromHeaders(headers);

  const strictRequired = ['name', 'season', 'phone', 'email'];
  const requiredMissingCounts = {};
  strictRequired.forEach(field => {
    requiredMissingCounts[field] = 0;
  });

  const phoneRowsByValue = {};
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const member = readMemberFromRow(row, schema);

    if (!member.name) requiredMissingCounts.name++;
    if (!member.phone) requiredMissingCounts.phone++;
    if (member.season === null || isNaN(Number(member.season))) requiredMissingCounts.season++;
    if (!member.email || !isValidImportEmail(member.email)) requiredMissingCounts.email++;

    if (member.phone) {
      if (!phoneRowsByValue[member.phone]) {
        phoneRowsByValue[member.phone] = [];
      }
      phoneRowsByValue[member.phone].push(i + 1);
    }
  }

  const duplicatePhones = [];
  Object.keys(phoneRowsByValue).forEach(phone => {
    const rows = phoneRowsByValue[phone];
    if (rows.length > 1) {
      duplicatePhones.push({ phone: phone, rows: rows });
    }
  });

  return {
    seasonAlias: seasonAlias || toSeasonAlias(sheet.getName()),
    sheetName: sheet.getName(),
    headerMap: schema.fieldMap,
    headerRow: headers,
    mode: schema.isV2 ? 'v2' : 'v1_or_custom',
    sessionStartColIndex: schema.sessionStartColIndex,
    sessionDetectedCount: schema.sessionColumns.length,
    requiredMissingCounts: requiredMissingCounts,
    duplicatePhones: duplicatePhones,
    strictMissingRequired: schema.strictMissingRequired
  };
}

function getSheetSchemaAudit(seasonName) {
  try {
    const requested = String(seasonName || '').trim();
    const reports = [];

    if (requested) {
      const info = getRequestedSeasonSheetInfo(requested);
      reports.push(buildSheetSchemaAuditReport(info.sheet, info.seasonAlias));
    } else {
      const candidates = getSeasonSheetCandidates();
      candidates.forEach(item => {
        reports.push(buildSheetSchemaAuditReport(item.sheet, item.alias));
      });
    }

    return {
      success: true,
      generatedAt: new Date().getTime(),
      reports: reports
    };
  } catch (error) {
    return {
      success: false,
      message: error.message || '시트 스키마 감사 중 오류가 발생했습니다.'
    };
  }
}

function getScheduleList(seasonName) {
  try {
    const info = getRequestedSeasonSheetInfo(seasonName);
    const now = new Date();
    const variableConfig = getVariableConfig();
    const sessions = collectSessionsFromSheet(info.sheet, { variableConfig: variableConfig, createMissingMeta: false });
    const dateMap = {};

    const items = sessions.map(session => {
      const dateKey = formatDateKey(session.startTime);
      if (!dateMap[dateKey]) {
        dateMap[dateKey] = [];
      }
      dateMap[dateKey].push(session.sessionKey);

      return {
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
        dateKey: dateKey,
        startHhmm: formatTimeHhmm(session.startTime),
        isPast: now > session.lateDeadline,
        isActive: now >= session.openTime && now <= session.lateDeadline
      };
    });

    const dateConflicts = Object.keys(dateMap)
      .filter(dateKey => dateMap[dateKey].length > 1)
      .sort()
      .map(dateKey => ({
        dateKey: dateKey,
        sessionKeys: dateMap[dateKey]
      }));

    return {
      success: true,
      seasonAlias: info.seasonAlias,
      currentSheet: info.currentSheet,
      defaults: {
        default_session_start_time: variableConfig.default_session_start_time,
        absence_threshold_min: variableConfig.absence_threshold_min,
        attendance_open_offset_min: variableConfig.attendance_open_offset_min
      },
      items: items,
      dateConflicts: dateConflicts
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
    const targetDateKey = formatDateKey(startTime);
    const duplicate = sessions.find(s => s.sessionKey === newSessionKey && s.sessionKey !== sessionKey);
    if (duplicate) {
      return { success: false, message: `동일한 시작시각의 회차가 이미 존재합니다. (${newSessionKey})` };
    }

    const duplicateDate = sessions.find(s => formatDateKey(s.startTime) === targetDateKey && s.sessionKey !== sessionKey);
    if (duplicateDate) {
      return {
        success: false,
        errorCode: 'SCHEDULE_DATE_DUPLICATE',
        message: `같은 날짜(${targetDateKey})에는 회차를 1개만 등록할 수 있습니다. 기존 회차(${duplicateDate.sessionKey})를 먼저 수정/삭제하세요.`,
        conflictSessionKey: duplicateDate.sessionKey,
        conflictDateKey: targetDateKey
      };
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
    const forceDelete = parseBooleanParam(params.forceDelete);
    const confirmSessionKey = String(params.confirmSessionKey || '').trim();
    if (!sessionKey) {
      return { success: false, message: 'sessionKey 파라미터가 필요합니다.' };
    }

    const sheet = info.sheet;
    const sessions = collectSessionsFromSheet(sheet, { createMissingMeta: true });
    const target = sessions.find(s => s.sessionKey === sessionKey);

    if (!target) {
      return { success: false, message: '삭제 대상 회차를 찾을 수 없습니다.' };
    }

    const attendanceRecordCount = countAttendanceRecordsInSession(sheet, target.colIndex);
    if (attendanceRecordCount > 0 && !forceDelete) {
      return {
        success: false,
        errorCode: 'SCHEDULE_DELETE_HAS_ATTENDANCE',
        message: `이미 ${attendanceRecordCount}건의 출석 기록이 있어 삭제하려면 강제 삭제 확인이 필요합니다.`,
        attendanceRecordCount: attendanceRecordCount,
        sessionKey: sessionKey
      };
    }

    if (attendanceRecordCount > 0 && forceDelete && confirmSessionKey !== sessionKey) {
      return {
        success: false,
        errorCode: 'SCHEDULE_DELETE_CONFIRM_KEY_MISMATCH',
        message: '강제 삭제 확인 문자열이 일치하지 않습니다. sessionKey를 정확히 입력하세요.'
      };
    }

    sheet.deleteColumn(target.colIndex + 1);
    removeSessionMetaRow(sheet.getName(), sessionKey);

    return {
      success: true,
      message: attendanceRecordCount > 0 ? '강제 삭제로 일정이 삭제되었습니다.' : '일정이 삭제되었습니다.',
      sessionKey: sessionKey,
      seasonAlias: info.seasonAlias,
      forceDeleted: attendanceRecordCount > 0,
      attendanceRecordCount: attendanceRecordCount
    };
  } catch (error) {
    return {
      success: false,
      message: error.message || '일정 삭제 중 오류가 발생했습니다.'
    };
  }
}

function countAttendanceRecordsInSession(sheet, colIndex) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;

  const values = sheet.getRange(2, colIndex + 1, lastRow - 1, 1).getValues();
  let count = 0;
  values.forEach(row => {
    const text = String(row[0] || '').trim();
    if (text !== '') {
      count++;
    }
  });
  return count;
}

function parseImportMode(value) {
  const raw = String(value || '').trim().toLowerCase();
  return raw === 'yb' ? 'yb' : 'all';
}

function parseImportTargetMode(value) {
  const raw = String(value || '').trim().toLowerCase();
  return raw === IMPORT_TARGET_MODE_UPDATE ? IMPORT_TARGET_MODE_UPDATE : IMPORT_TARGET_MODE_CREATE;
}

function resolveEffectiveImportScope(targetMode, importMode) {
  const resolvedImportMode = parseImportMode(importMode);
  return resolvedImportMode === 'yb' ? IMPORT_EFFECTIVE_SCOPE_TARGET_ONLY : IMPORT_EFFECTIVE_SCOPE_ALL;
}

function parseSeasonNumberFromAlias(alias) {
  const m = String(alias || '').trim().match(SEASON_NAME_REGEX);
  if (!m) return NaN;
  return parseInt(m[1], 10);
}

function parseCohortNumber(value) {
  const text = String(value || '').trim();
  if (!text) return NaN;

  let match = text.match(/season_(\d{1,2})/i);
  if (match) return parseInt(match[1], 10);

  match = text.match(/(\d{1,2})\s*기/);
  if (match) return parseInt(match[1], 10);

  match = text.match(/^(\d{1,2})$/);
  if (match) return parseInt(match[1], 10);

  // 헤더/문자열이 자유형인 경우 첫 숫자 그룹 fallback 허용
  match = text.match(/(\d{1,2})/);
  if (match) return parseInt(match[1], 10);

  return NaN;
}

function normalizeImportSeason(value) {
  const seasonNo = normalizeSeasonNumber(value);
  if (isNaN(seasonNo)) return NaN;
  return seasonNo;
}

function normalizeImportPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!/^010\d{8}$/.test(digits)) return '';
  return digits;
}

function formatPhoneWithHyphen(phoneDigits) {
  const digits = normalizeImportPhone(phoneDigits);
  if (!digits) return '';
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function normalizeImportEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidImportEmail(value) {
  const email = normalizeImportEmail(value);
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeOptionalImportEmail(value) {
  const email = normalizeImportEmail(value);
  if (!email) return '';
  return isValidImportEmail(email) ? email : '';
}

function toImportBooleanCell(value) {
  const parsed = parseBooleanLikeValue(value);
  if (!parsed.valid) return false;
  if (parsed.value === null) return false;
  return !!parsed.value;
}

function isInvalidBooleanImportInput(value) {
  if (value === null || value === undefined || String(value).trim() === '') return false;
  const parsed = parseBooleanLikeValue(value);
  return !parsed.valid;
}

function toImportJsonText(value, maxLength) {
  const limit = Math.max(1000, Number(maxLength || 20000));
  const text = String(value || '').trim();
  if (!text) return '';
  return text.length > limit ? text.slice(0, limit) : text;
}

function parseImportRowsJson(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;

  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    throw new Error('rowsJson 파싱에 실패했습니다.');
  }
}

function ensureImportMetaSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(IMPORT_META_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(IMPORT_META_SHEET_NAME);
  }

  const headerRange = sheet.getRange(1, 1, 1, IMPORT_META_HEADERS.length);
  const headers = headerRange.getValues()[0];
  if (String(headers[0] || '').trim() !== IMPORT_META_HEADERS[0]) {
    headerRange.clearContent();
    headerRange.setValues([IMPORT_META_HEADERS]);
  }

  if (!sheet.isSheetHidden()) {
    sheet.hideSheet();
  }
  return sheet;
}

function getImportMetaRows() {
  const metaSheet = ensureImportMetaSheet();
  const lastRow = metaSheet.getLastRow();
  if (lastRow < 2) {
    return { metaSheet: metaSheet, rows: [] };
  }

  const values = metaSheet.getRange(2, 1, lastRow - 1, IMPORT_META_HEADERS.length).getValues();
  const rows = values.map((row, idx) => {
    const rowIndex = idx + 2;
    const importId = String(row[0] || '').trim();
    if (!importId) return null;

    const seasonAlias = String(row[1] || '').trim();
    const isExtended = String(row[5] || '').trim().toLowerCase() === IMPORT_TARGET_MODE_CREATE
      || String(row[5] || '').trim().toLowerCase() === IMPORT_TARGET_MODE_UPDATE;

    if (isExtended) {
      return {
        rowIndex: rowIndex,
        importId: importId,
        seasonAlias: seasonAlias,
        stagingSheetName: String(row[2] || '').trim(),
        status: String(row[3] || '').trim(),
        importMode: parseImportMode(row[4] || ''),
        targetMode: parseImportTargetMode(row[5] || ''),
        targetSheetName: String(row[6] || '').trim(),
        schemaSummaryJson: toImportJsonText(row[7], 50000),
        createdAt: String(row[8] || '').trim(),
        updatedAt: String(row[9] || '').trim(),
        insertedCount: Math.max(0, parseInt(row[10], 10) || 0),
        skippedDuplicateCount: Math.max(0, parseInt(row[11], 10) || 0),
        droppedInvalidCount: Math.max(0, parseInt(row[12], 10) || 0),
        skippedNonTargetCount: Math.max(0, parseInt(row[13], 10) || 0)
      };
    }

    // 구버전 메타 포맷(12컬럼) 호환
    const inferredTargetSheet = findSeasonSheetByAlias(seasonAlias);
    return {
      rowIndex: rowIndex,
      importId: importId,
      seasonAlias: seasonAlias,
      stagingSheetName: String(row[2] || '').trim(),
      status: String(row[3] || '').trim(),
      importMode: parseImportMode(row[4] || ''),
      targetMode: inferredTargetSheet ? IMPORT_TARGET_MODE_UPDATE : IMPORT_TARGET_MODE_CREATE,
      targetSheetName: inferredTargetSheet ? inferredTargetSheet.getName() : '',
      schemaSummaryJson: toImportJsonText(row[5], 50000),
      createdAt: String(row[6] || '').trim(),
      updatedAt: String(row[7] || '').trim(),
      insertedCount: Math.max(0, parseInt(row[8], 10) || 0),
      skippedDuplicateCount: Math.max(0, parseInt(row[9], 10) || 0),
      droppedInvalidCount: Math.max(0, parseInt(row[10], 10) || 0),
      skippedNonTargetCount: Math.max(0, parseInt(row[11], 10) || 0)
    };
  }).filter(item => !!item);

  return { metaSheet: metaSheet, rows: rows };
}

function getImportMetaRecord(importId) {
  const id = String(importId || '').trim();
  if (!id) return null;
  const pack = getImportMetaRows();
  const found = pack.rows.find(item => item.importId === id);
  if (!found) return null;
  found.metaSheet = pack.metaSheet;
  return found;
}

function setImportMetaRecord(record) {
  if (!record || !record.rowIndex) return;
  const metaSheet = record.metaSheet || ensureImportMetaSheet();
  const nowText = formatDateTime(new Date());

  const row = [
    record.importId,
    record.seasonAlias,
    record.stagingSheetName,
    record.status,
    parseImportMode(record.importMode),
    parseImportTargetMode(record.targetMode),
    String(record.targetSheetName || '').trim(),
    toImportJsonText(record.schemaSummaryJson, 50000),
    record.createdAt || nowText,
    nowText,
    Math.max(0, Number(record.insertedCount || 0)),
    Math.max(0, Number(record.skippedDuplicateCount || 0)),
    Math.max(0, Number(record.droppedInvalidCount || 0)),
    Math.max(0, Number(record.skippedNonTargetCount || 0))
  ];
  metaSheet.getRange(record.rowIndex, 1, 1, IMPORT_META_HEADERS.length).setValues([row]);
}

function appendImportMetaRecord(record) {
  const metaSheet = ensureImportMetaSheet();
  const nowText = formatDateTime(new Date());
  const row = [
    String(record.importId || '').trim(),
    String(record.seasonAlias || '').trim(),
    String(record.stagingSheetName || '').trim(),
    String(record.status || IMPORT_STATUS_ACTIVE).trim(),
    parseImportMode(record.importMode || 'all'),
    parseImportTargetMode(record.targetMode || IMPORT_TARGET_MODE_CREATE),
    String(record.targetSheetName || '').trim(),
    toImportJsonText(record.schemaSummaryJson, 50000),
    String(record.createdAt || nowText).trim(),
    String(record.updatedAt || nowText).trim(),
    Math.max(0, Number(record.insertedCount || 0)),
    Math.max(0, Number(record.skippedDuplicateCount || 0)),
    Math.max(0, Number(record.droppedInvalidCount || 0)),
    Math.max(0, Number(record.skippedNonTargetCount || 0))
  ];
  const rowIndex = metaSheet.getLastRow() + 1;
  metaSheet.getRange(rowIndex, 1, 1, IMPORT_META_HEADERS.length).setValues([row]);
  return rowIndex;
}

function findSeasonSheetByAlias(alias) {
  const targetAlias = toSeasonAlias(alias);
  if (!targetAlias) return null;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const exact = ss.getSheetByName(targetAlias);
  if (exact) return exact;

  const legacy = ss.getSheetByName(getLegacySeasonName(targetAlias));
  return legacy || null;
}

function findActiveImportBySeason(alias) {
  const seasonAlias = toSeasonAlias(alias);
  if (!seasonAlias) return null;

  const pack = getImportMetaRows();
  return pack.rows.find(item => item.seasonAlias === seasonAlias && item.status === IMPORT_STATUS_ACTIVE) || null;
}

function buildActiveImportClientPayload(record) {
  if (!record) return null;
  return {
    importId: String(record.importId || '').trim(),
    seasonAlias: String(record.seasonAlias || '').trim(),
    stagingSheetName: String(record.stagingSheetName || '').trim(),
    status: String(record.status || '').trim(),
    importMode: parseImportMode(record.importMode || ''),
    targetMode: parseImportTargetMode(record.targetMode || ''),
    targetSheetName: String(record.targetSheetName || '').trim(),
    schemaSummaryJson: toImportJsonText(record.schemaSummaryJson || '', 50000),
    createdAt: String(record.createdAt || '').trim(),
    updatedAt: String(record.updatedAt || '').trim(),
    insertedCount: Math.max(0, parseInt(record.insertedCount, 10) || 0),
    skippedDuplicateCount: Math.max(0, parseInt(record.skippedDuplicateCount, 10) || 0),
    droppedInvalidCount: Math.max(0, parseInt(record.droppedInvalidCount, 10) || 0),
    skippedNonTargetCount: Math.max(0, parseInt(record.skippedNonTargetCount, 10) || 0)
  };
}

function makeImportStagingSheetName(seasonAlias) {
  const suffix = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMdd_HHmmss');
  const rand = Utilities.getUuid().replace(/-/g, '').slice(0, 6);
  return `_import_${seasonAlias}_${suffix}_${rand}`;
}

function beginSeasonImport(params) {
  const alias = toSeasonAlias(params.season || params.seasonNo || '');
  if (!alias) {
    return {
      success: false,
      errorCode: 'INVALID_SEASON',
      message: '유효한 시즌 번호가 필요합니다. (예: 9 또는 season_09)'
    };
  }

  const importMode = parseImportMode(params.importMode || params.mode);
  const schemaSummaryJson = toImportJsonText(params.schemaSummaryJson || params.schemaSummary || '', 50000);
  const lock = LockService.getDocumentLock();
  lock.waitLock(5000);

  try {
    const activeImport = findActiveImportBySeason(alias);
    if (activeImport) {
      return {
        success: false,
        errorCode: 'IMPORT_ALREADY_ACTIVE',
        message: `${alias} 시즌에 진행 중인 업로드가 있습니다. 먼저 완료/중단해주세요.`,
        importId: activeImport.importId,
        activeImport: buildActiveImportClientPayload(activeImport)
      };
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const targetSheet = findSeasonSheetByAlias(alias);
    const targetMode = targetSheet ? IMPORT_TARGET_MODE_UPDATE : IMPORT_TARGET_MODE_CREATE;
    const targetSheetName = targetSheet ? targetSheet.getName() : '';
    const effectiveScope = resolveEffectiveImportScope(targetMode, importMode);

    // 스테이징 시트는 항상 문서 최우측에 생성
    const stagingSheet = ss.insertSheet(makeImportStagingSheetName(alias), ss.getNumSheets() + 1);
    const stagingHeaders = MEMBER_V2_SHEET_HEADERS.concat([MEMBER_IMPORT_INTERNAL_PHONE_KEY_HEADER]);
    stagingSheet.getRange(1, 1, 1, stagingHeaders.length).setValues([stagingHeaders]);
    stagingSheet.hideSheet();

    const importId = Utilities.getUuid().replace(/-/g, '');
    const nowText = formatDateTime(new Date());
    appendImportMetaRecord({
      importId: importId,
      seasonAlias: alias,
      stagingSheetName: stagingSheet.getName(),
      status: IMPORT_STATUS_ACTIVE,
      importMode: importMode,
      targetMode: targetMode,
      targetSheetName: targetSheetName,
      schemaSummaryJson: schemaSummaryJson,
      createdAt: nowText,
      updatedAt: nowText,
      insertedCount: 0,
      skippedDuplicateCount: 0,
      droppedInvalidCount: 0,
      skippedNonTargetCount: 0
    });

    return {
      success: true,
      importId: importId,
      seasonAlias: alias,
      stagingSheetName: stagingSheet.getName(),
      importMode: importMode,
      targetMode: targetMode,
      targetSheetName: targetSheetName,
      effectiveScope: effectiveScope,
      createdAt: nowText
    };
  } catch (error) {
    return {
      success: false,
      errorCode: 'IMPORT_BEGIN_FAILED',
      message: error.message || '업로드 시작 중 오류가 발생했습니다.'
    };
  } finally {
    lock.releaseLock();
  }
}

function getStagingSeenKeys(stagingSheet) {
  const seenPhones = {};
  const lastRow = stagingSheet.getLastRow();
  if (lastRow < 2) {
    return { phones: seenPhones };
  }

  const values = stagingSheet.getRange(2, 1, lastRow - 1, MEMBER_V2_SHEET_HEADERS.length + 1).getValues();
  values.forEach(row => {
    const phone = normalizeImportPhone(row[2]);
    const phoneKey = normalizePhone(row[12] || row[2]);
    if (phone) seenPhones[phone] = true;
    if (phoneKey) seenPhones[phoneKey] = true;
  });

  return { phones: seenPhones };
}

function classifyImportRow(rawRow, options) {
  const opts = options || {};
  const sourceRow = Math.max(1, parseInt(rawRow.sourceRow || rawRow.rowNumber || 0, 10) || 0);
  const seasonNo = Number(opts.seasonNo || 0);
  const importMode = parseImportMode(opts.importMode || 'all');
  const targetMode = parseImportTargetMode(opts.targetMode || IMPORT_TARGET_MODE_CREATE);
  const effectiveScope = resolveEffectiveImportScope(targetMode, importMode);
  const enforceTargetSeasonOnly = effectiveScope === IMPORT_EFFECTIVE_SCOPE_TARGET_ONLY;
  const seenPhones = opts.seenPhones || {};

  const name = String(rawRow.name !== undefined ? rawRow.name : (rawRow.Name || '')).trim();
  const rowSeason = rawRow.season !== undefined
    ? rawRow.season
    : (rawRow.Season !== undefined
      ? rawRow.Season
      : (rawRow.cohort || rawRow.cohortRaw || rawRow.grade || rawRow.seasonRaw || ''));
  const seasonValue = normalizeImportSeason(rowSeason);
  const rawPhone = rawRow.phone !== undefined ? rawRow.phone : (rawRow.Phone !== undefined ? rawRow.Phone : rawRow.phoneRaw);
  const phoneDigits = normalizeImportPhone(rawPhone || '');
  const phoneKey = normalizePhone(phoneDigits);
  const phone = formatPhoneWithHyphen(phoneDigits);
  const rawEmail = rawRow.email !== undefined ? rawRow.email : (rawRow.Email !== undefined ? rawRow.Email : rawRow.emailRaw);
  const email = normalizeImportEmail(rawEmail || '');

  const githubId = String(rawRow.githubId || rawRow['Github ID'] || '').trim();
  const rawGithubEmail = rawRow.githubEmail !== undefined ? rawRow.githubEmail : rawRow['Github Email'];
  const rawNotionEmail = rawRow.notionEmail !== undefined ? rawRow.notionEmail : rawRow['Notion Email'];
  const rawSlackEmail = rawRow.slackEmail !== undefined ? rawRow.slackEmail : rawRow['Slack Email'];
  const rawFeeChecked = rawRow.feeChecked !== undefined ? rawRow.feeChecked : rawRow['회비 체크'];
  const rawCompleted = rawRow.completed !== undefined ? rawRow.completed : rawRow['수료 여부'];
  const rawIsStaff = rawRow.isStaff !== undefined ? rawRow.isStaff : rawRow['운영진 여부'];
  const githubEmail = normalizeOptionalImportEmail(rawGithubEmail || '');
  const notionEmail = normalizeOptionalImportEmail(rawNotionEmail || '');
  const discordId = String(rawRow.discordId || rawRow.discorId || rawRow['Discord ID'] || rawRow['Discor ID'] || '').trim();
  const slackEmail = normalizeOptionalImportEmail(rawSlackEmail || '');
  const feeChecked = toImportBooleanCell(rawFeeChecked);
  const completed = toImportBooleanCell(rawCompleted);
  const isStaff = toImportBooleanCell(rawIsStaff);

  if (!name) {
    return {
      action: 'invalid',
      sourceRow: sourceRow,
      reasonCode: 'MISSING_NAME',
      reason: '이름 값이 비어 있습니다.'
    };
  }

  if (!phoneDigits) {
    return {
      action: 'invalid',
      sourceRow: sourceRow,
      reasonCode: 'INVALID_PHONE',
      reason: '전화번호 형식이 올바르지 않습니다. (010xxxxxxxx)'
    };
  }

  if (!email || !isValidImportEmail(email)) {
    return {
      action: 'invalid',
      sourceRow: sourceRow,
      reasonCode: 'INVALID_REQUIRED_EMAIL',
      reason: '필수 이메일 형식이 올바르지 않습니다.'
    };
  }

  if (isNaN(seasonValue)) {
    return {
      action: 'invalid',
      sourceRow: sourceRow,
      reasonCode: 'INVALID_SEASON',
      reason: '필수 Season 값이 없거나 형식이 올바르지 않습니다.'
    };
  }

  if (enforceTargetSeasonOnly) {
    if (seasonValue !== seasonNo) {
      return {
        action: 'non_target',
        sourceRow: sourceRow,
        reasonCode: 'NON_TARGET_COHORT',
        reason: `YB 모드에서는 대상 시즌(${seasonNo}기)만 반영할 수 있습니다. 현재 행: ${seasonValue}기`
      };
    }
  } else if (seasonValue > seasonNo) {
    return {
      action: 'non_target',
      sourceRow: sourceRow,
      reasonCode: 'SKIP_FUTURE_COHORT',
      reason: `대상 시즌(${seasonNo}기)보다 미래 기수(${seasonValue}기)는 반영하지 않습니다.`
    };
  }

  if (seenPhones[phoneKey]) {
    return {
      action: 'duplicate',
      sourceRow: sourceRow,
      reasonCode: 'DUPLICATE_PHONE',
      reason: '전화번호 기준 중복입니다.'
    };
  }

  const warningCodes = [];
  if (rawGithubEmail !== undefined && rawGithubEmail !== null && String(rawGithubEmail).trim() !== '' && !githubEmail) {
    warningCodes.push('WARN_INVALID_GITHUB_EMAIL');
  }
  if (rawNotionEmail !== undefined && rawNotionEmail !== null && String(rawNotionEmail).trim() !== '' && !notionEmail) {
    warningCodes.push('WARN_INVALID_NOTION_EMAIL');
  }
  if (rawSlackEmail !== undefined && rawSlackEmail !== null && String(rawSlackEmail).trim() !== '' && !slackEmail) {
    warningCodes.push('WARN_INVALID_SLACK_EMAIL');
  }
  if (isInvalidBooleanImportInput(rawFeeChecked)) {
    warningCodes.push('WARN_INVALID_FEE_CHECKED');
  }
  if (isInvalidBooleanImportInput(rawCompleted)) {
    warningCodes.push('WARN_INVALID_COMPLETED');
  }
  if (isInvalidBooleanImportInput(rawIsStaff)) {
    warningCodes.push('WARN_INVALID_IS_STAFF');
  }

  return {
    action: 'insert',
    sourceRow: sourceRow,
    rowValues: [
      name,
      seasonValue,
      phone,
      email,
      githubId,
      githubEmail,
      notionEmail,
      discordId,
      slackEmail,
      feeChecked,
      completed,
      isStaff,
      phoneKey
    ],
    warningCodes: warningCodes
  };
}

function getImportDiffFieldLabel(field) {
  const labels = {
    name: 'Name',
    season: 'Season',
    phone: 'Phone',
    email: 'Email',
    githubId: 'Github ID',
    githubEmail: 'Github Email',
    notionEmail: 'Notion Email',
    discordId: 'Discord ID',
    slackEmail: 'Slack Email',
    feeChecked: '회비 체크',
    completed: '수료 여부',
    isStaff: '운영진 여부'
  };
  return labels[field] || field;
}

function normalizeImportDiffValue(field, value) {
  if (field === 'season') {
    const no = normalizeSeasonNumber(value);
    return isNaN(no) ? '' : String(no);
  }
  if (field === 'phone') {
    return normalizePhone(value);
  }
  if (field === 'feeChecked' || field === 'completed' || field === 'isStaff') {
    const parsed = parseBooleanLikeValue(value);
    if (!parsed.valid) return 'false';
    return parsed.value === true ? 'true' : 'false';
  }
  if (field === 'email' || field === 'githubEmail' || field === 'notionEmail' || field === 'slackEmail') {
    return normalizeImportEmail(value || '');
  }
  return String(value || '').trim();
}

function formatImportDiffDisplayValue(field, value) {
  if (field === 'season') {
    const no = normalizeSeasonNumber(value);
    return isNaN(no) ? '-' : `${no}기`;
  }
  if (field === 'phone') {
    const digits = normalizePhone(value);
    return digits ? formatPhoneWithHyphen(digits) : '-';
  }
  if (field === 'feeChecked' || field === 'completed' || field === 'isStaff') {
    if (value === true || String(value) === 'true') return 'TRUE';
    if (value === false || String(value) === 'false') return 'FALSE';
    return '-';
  }
  const text = String(value || '').trim();
  return text || '-';
}

function buildImportDiffRowSummary(member) {
  const seasonText = !isNaN(Number(member.season)) ? `${member.season}기` : '-';
  return `${member.name || '-'} / ${seasonText} / ${member.phoneDisplay || '-'} / ${member.email || '-'}`;
}

function getStagingMemberPack(stagingSheet) {
  const lastRow = stagingSheet.getLastRow();
  const members = [];
  const byPhone = {};
  if (lastRow < 2) {
    return { members: members, byPhone: byPhone };
  }

  const values = stagingSheet.getRange(2, 1, lastRow - 1, MEMBER_V2_SHEET_HEADERS.length + 1).getValues();
  values.forEach((row, idx) => {
    const phoneKey = normalizePhone(row[12] || row[2]);
    if (!phoneKey) return;

    const season = normalizeSeasonNumber(row[1]);
    const member = {
      sourceRow: idx + 2,
      name: String(row[0] || '').trim(),
      season: isNaN(season) ? null : season,
      phone: phoneKey,
      phoneDisplay: formatPhoneWithHyphen(phoneKey),
      email: normalizeImportEmail(row[3] || ''),
      githubId: String(row[4] || '').trim(),
      githubEmail: normalizeImportEmail(row[5] || ''),
      notionEmail: normalizeImportEmail(row[6] || ''),
      discordId: String(row[7] || '').trim(),
      slackEmail: normalizeImportEmail(row[8] || ''),
      feeChecked: toImportBooleanCell(row[9]),
      completed: toImportBooleanCell(row[10]),
      isStaff: toImportBooleanCell(row[11])
    };

    members.push(member);
    byPhone[phoneKey] = member;
  });

  return { members: members, byPhone: byPhone };
}

function getExistingMemberPackForUpdate(targetSheet) {
  const values = targetSheet.getDataRange().getValues();
  const headers = values[0] || [];
  const schema = resolveMemberSchemaFromHeaders(headers);

  if (!schema.isV2) {
    return {
      error: {
        success: false,
        errorCode: 'UPDATE_TARGET_NOT_V2',
        message: '업데이트 대상 시즌 시트가 v2 스키마가 아닙니다. 먼저 v2 마이그레이션을 진행해주세요.'
      }
    };
  }

  const byPhone = {};
  const duplicates = [];
  const sessionStartColIndex = Math.max(MEMBER_V2_SHEET_HEADERS.length, schema.sessionStartColIndex || MEMBER_V2_SHEET_HEADERS.length);

  for (let i = 1; i < values.length; i++) {
    const member = readMemberFromRow(values[i], schema);
    const phoneKey = normalizePhone(member.phone || '');
    if (!phoneKey) continue;

    if (byPhone[phoneKey]) {
      duplicates.push(i + 1);
      continue;
    }

    let hasAttendanceData = false;
    for (let col = sessionStartColIndex; col < values[i].length; col++) {
      const text = String(values[i][col] || '').trim();
      if (!text) continue;
      hasAttendanceData = true;
      break;
    }

    byPhone[phoneKey] = {
      rowIndex: i + 1,
      name: String(member.name || '').trim(),
      season: member.season === null || member.season === undefined ? null : Number(member.season),
      phone: phoneKey,
      phoneDisplay: formatPhoneWithHyphen(phoneKey),
      email: normalizeImportEmail(member.email || ''),
      githubId: String(member.githubId || '').trim(),
      githubEmail: normalizeImportEmail(member.githubEmail || ''),
      notionEmail: normalizeImportEmail(member.notionEmail || ''),
      discordId: String(member.discordId || '').trim(),
      slackEmail: normalizeImportEmail(member.slackEmail || ''),
      feeChecked: member.feeChecked,
      completed: member.completed,
      isStaff: member.isStaff,
      hasAttendanceData: hasAttendanceData
    };
  }

  if (duplicates.length > 0) {
    return {
      error: {
        success: false,
        errorCode: 'PHONE_SUPERKEY_DUPLICATE',
        message: `업데이트 대상 시즌에서 Phone 슈퍼키 중복이 발견되었습니다. (rows: ${duplicates.join(', ')})`,
        duplicateRows: duplicates
      }
    };
  }

  return {
    byPhone: byPhone,
    sessionStartColIndex: sessionStartColIndex
  };
}

function computeSha256Hex(text) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(text || ''), Utilities.Charset.UTF_8);
  return digest.map(byte => {
    const value = byte < 0 ? byte + 256 : byte;
    return (value < 16 ? '0' : '') + value.toString(16);
  }).join('');
}

function buildImportDiffSnapshot(record, stagingSheet, targetSheet) {
  const stagingPack = getStagingMemberPack(stagingSheet);
  const existingPack = getExistingMemberPackForUpdate(targetSheet);
  if (existingPack.error) return existingPack.error;

  const comparedFields = [
    'name',
    'season',
    'email',
    'githubId',
    'githubEmail',
    'notionEmail',
    'discordId',
    'slackEmail',
    'feeChecked',
    'completed',
    'isStaff'
  ];
  const rowFieldOrder = [
    'name',
    'season',
    'phone',
    'email',
    'githubId',
    'githubEmail',
    'notionEmail',
    'discordId',
    'slackEmail',
    'feeChecked',
    'completed',
    'isStaff'
  ];
  const diffTypeOrder = {
    ADD: 0,
    UPDATE: 1,
    DELETE_CANDIDATE: 2
  };
  const canonicalVersion = 2;

  const rows = [];
  const rowDiffByPhone = {};
  const cellDiffByPhone = {};
  const canonicalEntries = [];
  const summary = {
    addCount: 0,
    updateFieldCount: 0,
    deleteCandidateCount: 0,
    protectedSkipCount: 0
  };

  function toRowSnapshot(member) {
    const seasonNo = normalizeSeasonNumber(member.season);
    return {
      name: String(member.name || '').trim(),
      season: isNaN(seasonNo) ? null : seasonNo,
      seasonLabel: isNaN(seasonNo) ? '' : `${seasonNo}기`,
      phone: formatPhoneWithHyphen(member.phone || ''),
      phoneKey: normalizePhone(member.phone || ''),
      email: normalizeImportEmail(member.email || ''),
      githubId: String(member.githubId || '').trim(),
      githubEmail: normalizeImportEmail(member.githubEmail || ''),
      notionEmail: normalizeImportEmail(member.notionEmail || ''),
      discordId: String(member.discordId || '').trim(),
      slackEmail: normalizeImportEmail(member.slackEmail || ''),
      feeChecked: normalizeImportDiffValue('feeChecked', member.feeChecked) === 'true',
      completed: normalizeImportDiffValue('completed', member.completed) === 'true',
      isStaff: normalizeImportDiffValue('isStaff', member.isStaff) === 'true'
    };
  }

  const stagedPhoneMap = {};
  stagingPack.members.forEach(staged => {
    stagedPhoneMap[staged.phone] = true;
    const existing = existingPack.byPhone[staged.phone];

    if (!existing) {
      const afterRow = toRowSnapshot(staged);
      const cellMap = {};
      rowFieldOrder.forEach(field => {
        cellMap[field] = 'add';
      });

      summary.addCount++;
      rows.push({
        type: 'ADD',
        phone: staged.phoneDisplay,
        phoneKey: staged.phone,
        field: 'ROW',
        fieldLabel: '행 추가',
        before: '-',
        after: buildImportDiffRowSummary(staged),
        targetRow: null,
        sourceRow: staged.sourceRow
      });

      rowDiffByPhone[staged.phone] = {
        rowType: 'ADD',
        targetRow: null,
        sourceRow: staged.sourceRow,
        before: null,
        after: afterRow,
        changedFields: rowFieldOrder.slice()
      };
      cellDiffByPhone[staged.phone] = cellMap;
      canonicalEntries.push({
        type: 'ADD',
        phoneKey: staged.phone,
        field: 'ROW',
        before: '',
        after: 'row_add'
      });
      return;
    }

    if (existing.hasAttendanceData) {
      summary.protectedSkipCount++;
    }

    const beforeRow = toRowSnapshot(existing);
    const afterRow = toRowSnapshot(staged);
    const changedFields = [];
    const cellMap = {};
    rowFieldOrder.forEach(field => {
      cellMap[field] = 'same';
    });

    comparedFields.forEach(field => {
      const beforeNorm = normalizeImportDiffValue(field, existing[field]);
      const afterNorm = normalizeImportDiffValue(field, staged[field]);
      if (beforeNorm === afterNorm) return;

      summary.updateFieldCount++;
      changedFields.push(field);
      cellMap[field] = 'update';
      rows.push({
        type: 'UPDATE',
        phone: staged.phoneDisplay,
        phoneKey: staged.phone,
        field: field,
        fieldLabel: getImportDiffFieldLabel(field),
        before: formatImportDiffDisplayValue(field, existing[field]),
        after: formatImportDiffDisplayValue(field, staged[field]),
        targetRow: existing.rowIndex,
        sourceRow: staged.sourceRow
      });
      canonicalEntries.push({
        type: 'UPDATE',
        phoneKey: staged.phone,
        field: field,
        before: beforeNorm,
        after: afterNorm
      });
    });

    rowDiffByPhone[staged.phone] = {
      rowType: changedFields.length > 0 ? 'UPDATE' : 'SAME',
      targetRow: existing.rowIndex,
      sourceRow: staged.sourceRow,
      before: beforeRow,
      after: afterRow,
      changedFields: changedFields
    };
    cellDiffByPhone[staged.phone] = cellMap;
  });

  Object.keys(existingPack.byPhone).forEach(phoneKey => {
    if (stagedPhoneMap[phoneKey]) return;
    const existing = existingPack.byPhone[phoneKey];
    const beforeRow = toRowSnapshot(existing);
    const cellMap = {};
    rowFieldOrder.forEach(field => {
      cellMap[field] = 'delete';
    });

    summary.deleteCandidateCount++;
    rows.push({
      type: 'DELETE_CANDIDATE',
      phone: existing.phoneDisplay,
      phoneKey: phoneKey,
      field: 'ROW',
      fieldLabel: '삭제 후보',
      before: buildImportDiffRowSummary(existing),
      after: '-',
      targetRow: existing.rowIndex,
      sourceRow: null
    });

    rowDiffByPhone[phoneKey] = {
      rowType: 'DELETE_CANDIDATE',
      targetRow: existing.rowIndex,
      sourceRow: null,
      before: beforeRow,
      after: null,
      changedFields: []
    };
    cellDiffByPhone[phoneKey] = cellMap;
    canonicalEntries.push({
      type: 'DELETE_CANDIDATE',
      phoneKey: phoneKey,
      field: 'ROW',
      before: 'row_exists',
      after: ''
    });
  });

  rows.sort((a, b) => {
    const typeA = diffTypeOrder[a.type] !== undefined ? diffTypeOrder[a.type] : 99;
    const typeB = diffTypeOrder[b.type] !== undefined ? diffTypeOrder[b.type] : 99;
    if (typeA !== typeB) return typeA - typeB;
    if (a.phoneKey !== b.phoneKey) return String(a.phoneKey || '').localeCompare(String(b.phoneKey || ''));
    if (a.field !== b.field) return String(a.field || '').localeCompare(String(b.field || ''));
    return Number(a.targetRow || 0) - Number(b.targetRow || 0);
  });

  canonicalEntries.sort((a, b) => {
    if (a.phoneKey !== b.phoneKey) return String(a.phoneKey || '').localeCompare(String(b.phoneKey || ''));
    if (a.type !== b.type) return String(a.type || '').localeCompare(String(b.type || ''));
    if (a.field !== b.field) return String(a.field || '').localeCompare(String(b.field || ''));
    return String(a.before || '').localeCompare(String(b.before || ''));
  });

  const tokenPayload = JSON.stringify({
    seasonAlias: record.seasonAlias,
    targetSheetName: targetSheet.getName(),
    canonicalVersion: canonicalVersion,
    entries: canonicalEntries
  });
  const diffToken = computeSha256Hex(tokenPayload);

  return {
    targetMode: IMPORT_TARGET_MODE_UPDATE,
    targetSheetName: targetSheet.getName(),
    effectiveScope: resolveEffectiveImportScope(IMPORT_TARGET_MODE_UPDATE, record.importMode),
    canonicalVersion: canonicalVersion,
    attendanceProtectedStartCol: existingPack.sessionStartColIndex,
    summary: summary,
    rows: rows,
    totalCount: rows.length,
    diffToken: diffToken,
    rowDiffByPhone: rowDiffByPhone,
    cellDiffByPhone: cellDiffByPhone,
    stagingPack: stagingPack,
    existingPack: existingPack
  };
}

function getSeasonImportDiff(params) {
  const importId = String(params.importId || '').trim();
  if (!importId) {
    return { success: false, errorCode: 'INVALID_IMPORT_ID', message: 'importId 파라미터가 필요합니다.' };
  }

  const offset = Math.max(0, parseInt(params.offset, 10) || 0);
  const limit = Math.max(1, Math.min(1000, parseInt(params.limit, 10) || 300));

  const lock = LockService.getDocumentLock();
  lock.waitLock(5000);
  try {
    const record = getImportMetaRecord(importId);
    if (!record) {
      return { success: false, errorCode: 'IMPORT_NOT_FOUND', message: '업로드 세션을 찾을 수 없습니다.' };
    }
    if (record.status !== IMPORT_STATUS_ACTIVE) {
      return { success: false, errorCode: 'IMPORT_NOT_ACTIVE', message: '이미 종료된 업로드 세션입니다.' };
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const stagingSheet = ss.getSheetByName(record.stagingSheetName);
    if (!stagingSheet) {
      return { success: false, errorCode: 'STAGING_NOT_FOUND', message: '스테이징 시트를 찾을 수 없습니다.' };
    }

    const targetMode = parseImportTargetMode(record.targetMode || IMPORT_TARGET_MODE_CREATE);
    if (targetMode === IMPORT_TARGET_MODE_CREATE) {
      return {
        success: true,
        importId: importId,
        targetMode: IMPORT_TARGET_MODE_CREATE,
        effectiveScope: resolveEffectiveImportScope(IMPORT_TARGET_MODE_CREATE, record.importMode),
        canonicalVersion: 2,
        targetSheetName: '',
        attendanceProtectedStartCol: MEMBER_V2_SHEET_HEADERS.length,
        summary: {
          addCount: 0,
          updateFieldCount: 0,
          deleteCandidateCount: 0,
          protectedSkipCount: 0
        },
        rows: [],
        rowDiffByPhone: {},
        cellDiffByPhone: {},
        totalCount: 0,
        offset: offset,
        limit: limit,
        diffToken: computeSha256Hex(`${record.seasonAlias}:create`)
      };
    }

    const targetSheet = ss.getSheetByName(record.targetSheetName) || findSeasonSheetByAlias(record.seasonAlias);
    if (!targetSheet) {
      return {
        success: false,
        errorCode: 'TARGET_SHEET_NOT_FOUND',
        message: '업데이트 대상 시즌 시트를 찾을 수 없습니다.'
      };
    }

    const snapshot = buildImportDiffSnapshot(record, stagingSheet, targetSheet);
    if (!snapshot.success && snapshot.errorCode) {
      return snapshot;
    }

    return {
      success: true,
      importId: importId,
      targetMode: IMPORT_TARGET_MODE_UPDATE,
      effectiveScope: snapshot.effectiveScope,
      canonicalVersion: snapshot.canonicalVersion,
      targetSheetName: snapshot.targetSheetName,
      attendanceProtectedStartCol: snapshot.attendanceProtectedStartCol,
      summary: snapshot.summary,
      rows: snapshot.rows.slice(offset, offset + limit),
      rowDiffByPhone: snapshot.rowDiffByPhone,
      cellDiffByPhone: snapshot.cellDiffByPhone,
      totalCount: snapshot.totalCount,
      offset: offset,
      limit: limit,
      diffToken: snapshot.diffToken
    };
  } catch (error) {
    return {
      success: false,
      errorCode: 'IMPORT_DIFF_FAILED',
      message: error.message || '업데이트 Diff 계산 중 오류가 발생했습니다.'
    };
  } finally {
    lock.releaseLock();
  }
}

function buildImportRowValuesFromMember(member) {
  const season = normalizeSeasonNumber(member.season);
  const seasonValue = isNaN(season) ? '' : season;
  return [
    String(member.name || '').trim(),
    seasonValue,
    formatPhoneWithHyphen(member.phone || ''),
    normalizeImportEmail(member.email || ''),
    String(member.githubId || '').trim(),
    normalizeImportEmail(member.githubEmail || ''),
    normalizeImportEmail(member.notionEmail || ''),
    String(member.discordId || '').trim(),
    normalizeImportEmail(member.slackEmail || ''),
    !!member.feeChecked,
    !!member.completed,
    !!member.isStaff
  ];
}

function applyImportUpdateToExistingSheet(targetSheet, snapshot) {
  const stagingMembers = snapshot.stagingPack.members || [];
  const existingByPhone = snapshot.existingPack.byPhone || {};
  const sessionColCount = Math.max(0, targetSheet.getLastColumn() - MEMBER_V2_SHEET_HEADERS.length);
  const blankSessions = [];
  for (let i = 0; i < sessionColCount; i++) blankSessions.push('');

  let addedCount = 0;
  let updatedRowCount = 0;

  stagingMembers.forEach(member => {
    const existing = existingByPhone[member.phone];
    const rowValues = buildImportRowValuesFromMember(member);

    if (!existing) {
      const appendRow = rowValues.concat(blankSessions);
      const startRow = targetSheet.getLastRow() + 1;
      targetSheet.getRange(startRow, 1, 1, appendRow.length).setValues([appendRow]);
      addedCount++;
      return;
    }

    const current = targetSheet.getRange(existing.rowIndex, 1, 1, MEMBER_V2_SHEET_HEADERS.length).getValues()[0];
    let changed = false;
    for (let col = 0; col < MEMBER_V2_SHEET_HEADERS.length; col++) {
      const field = MEMBER_FIELD_ORDER[col];
      const beforeNorm = normalizeImportDiffValue(field, current[col]);
      const afterNorm = normalizeImportDiffValue(field, rowValues[col]);
      if (beforeNorm !== afterNorm) {
        changed = true;
        break;
      }
    }
    if (!changed) return;

    targetSheet.getRange(existing.rowIndex, 1, 1, MEMBER_V2_SHEET_HEADERS.length).setValues([rowValues]);
    updatedRowCount++;
  });

  return {
    addedCount: addedCount,
    updatedRowCount: updatedRowCount
  };
}

function applySeasonSheetTablePresentation(sheet) {
  if (!sheet) return;
  const lastRow = Math.max(1, sheet.getLastRow());
  const headerRange = sheet.getRange(1, 1, 1, MEMBER_V2_SHEET_HEADERS.length);

  headerRange
    .setBackground('#2f6b52')
    .setFontColor('#ffffff')
    .setFontWeight('bold')
    .setHorizontalAlignment('center')
    .setVerticalAlignment('middle');

  sheet.setFrozenRows(1);

  const widths = [150, 95, 150, 240, 170, 240, 240, 170, 240, 120, 120, 130];
  widths.forEach((width, idx) => {
    sheet.setColumnWidth(idx + 1, width);
  });

  if (sheet.getFilter()) {
    sheet.getFilter().remove();
  }
  sheet.getRange(1, 1, lastRow, MEMBER_V2_SHEET_HEADERS.length).createFilter();

  if (lastRow >= 2) {
    sheet.getRange(2, 2, lastRow - 1, 1).setNumberFormat('0');
    sheet.getRange(2, 3, lastRow - 1, 1).setNumberFormat('@');

    const boolRange = sheet.getRange(2, 10, lastRow - 1, 3);
    const boolValues = boolRange.getValues();
    let boolChanged = false;
    for (let r = 0; r < boolValues.length; r++) {
      for (let c = 0; c < 3; c++) {
        const value = boolValues[r][c];
        if (value === '' || value === null || value === undefined) {
          boolValues[r][c] = false;
          boolChanged = true;
        }
      }
    }
    if (boolChanged) {
      boolRange.setValues(boolValues);
    }

    const boolValidation = SpreadsheetApp.newDataValidation()
      .requireValueInList(['TRUE', 'FALSE'], true)
      .setAllowInvalid(false)
      .build();
    boolRange.setDataValidation(boolValidation);
  }
}

function moveSheetToRightmost(sheet) {
  if (!sheet) return;
  const ss = sheet.getParent();
  ss.setActiveSheet(sheet);
  ss.moveActiveSheet(ss.getNumSheets());
}

function importSeasonChunk(params) {
  const importId = String(params.importId || '').trim();
  if (!importId) {
    return { success: false, errorCode: 'INVALID_IMPORT_ID', message: 'importId 파라미터가 필요합니다.' };
  }

  let rows;
  try {
    rows = parseImportRowsJson(params.rowsJson || params.rows || '[]');
  } catch (error) {
    return { success: false, errorCode: 'INVALID_ROWS', message: error.message || 'rows 파싱 실패' };
  }

  if (rows.length === 0) {
    const snapshot = getImportMetaRecord(importId);
    return {
      success: true,
      importId: importId,
      chunkSeq: parseInt(params.chunkSeq, 10) || 0,
      inserted_count: 0,
      skipped_duplicate_count: 0,
      dropped_invalid_count: 0,
      skipped_non_target_count: 0,
      cumulative: snapshot ? {
        inserted_count: snapshot.insertedCount,
        skipped_duplicate_count: snapshot.skippedDuplicateCount,
        dropped_invalid_count: snapshot.droppedInvalidCount,
        skipped_non_target_count: snapshot.skippedNonTargetCount
      } : null,
      dropped: []
    };
  }

  const lock = LockService.getDocumentLock();
  lock.waitLock(5000);
  try {
    const record = getImportMetaRecord(importId);
    if (!record) {
      return { success: false, errorCode: 'IMPORT_NOT_FOUND', message: '진행 중인 업로드 세션을 찾을 수 없습니다.' };
    }
    if (record.status !== IMPORT_STATUS_ACTIVE) {
      return { success: false, errorCode: 'IMPORT_NOT_ACTIVE', message: '이미 종료된 업로드 세션입니다.' };
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const stagingSheet = ss.getSheetByName(record.stagingSheetName);
    if (!stagingSheet) {
      return { success: false, errorCode: 'STAGING_NOT_FOUND', message: '스테이징 시트를 찾을 수 없습니다.' };
    }

    const seasonNo = parseSeasonNumberFromAlias(record.seasonAlias);
    if (isNaN(seasonNo)) {
      return { success: false, errorCode: 'INVALID_SEASON', message: '시즌 번호 해석에 실패했습니다.' };
    }

    const seen = getStagingSeenKeys(stagingSheet);
    const appendRows = [];
    const dropped = [];
    let insertedCount = 0;
    let skippedDuplicateCount = 0;
    let droppedInvalidCount = 0;
    let skippedNonTargetCount = 0;

    rows.forEach(item => {
      const result = classifyImportRow(item || {}, {
        seasonNo: seasonNo,
        importMode: record.importMode,
        targetMode: record.targetMode,
        seenPhones: seen.phones
      });

      if (result.action === 'insert') {
        appendRows.push(result.rowValues);
        const phoneKey = normalizePhone(result.rowValues[12] || result.rowValues[2]);
        if (phoneKey) {
          seen.phones[phoneKey] = true;
        }
        insertedCount++;

        (result.warningCodes || []).forEach(code => {
          dropped.push({
            sourceRow: result.sourceRow,
            reasonCode: code,
            reason: '선택 필드 값이 유효하지 않아 기본값으로 보정 저장됩니다.'
          });
        });
        return;
      }

      if (result.action === 'duplicate') {
        skippedDuplicateCount++;
      } else if (result.action === 'non_target') {
        skippedNonTargetCount++;
      } else {
        droppedInvalidCount++;
      }

      dropped.push({
        sourceRow: result.sourceRow,
        reasonCode: result.reasonCode,
        reason: result.reason
      });
    });

    if (appendRows.length > 0) {
      const startRow = stagingSheet.getLastRow() + 1;
      stagingSheet.getRange(startRow, 1, appendRows.length, MEMBER_V2_SHEET_HEADERS.length + 1).setValues(appendRows);
    }

    record.insertedCount += insertedCount;
    record.skippedDuplicateCount += skippedDuplicateCount;
    record.droppedInvalidCount += droppedInvalidCount;
    record.skippedNonTargetCount += skippedNonTargetCount;
    setImportMetaRecord(record);

    return {
      success: true,
      importId: importId,
      seasonAlias: record.seasonAlias,
      chunkSeq: parseInt(params.chunkSeq, 10) || 0,
      inserted_count: insertedCount,
      skipped_duplicate_count: skippedDuplicateCount,
      dropped_invalid_count: droppedInvalidCount,
      skipped_non_target_count: skippedNonTargetCount,
      cumulative: {
        inserted_count: record.insertedCount,
        skipped_duplicate_count: record.skippedDuplicateCount,
        dropped_invalid_count: record.droppedInvalidCount,
        skipped_non_target_count: record.skippedNonTargetCount
      },
      dropped: dropped.slice(0, 200)
    };
  } catch (error) {
    return {
      success: false,
      errorCode: 'IMPORT_CHUNK_FAILED',
      message: error.message || '업로드 청크 처리 중 오류가 발생했습니다.'
    };
  } finally {
    lock.releaseLock();
  }
}

function finalizeSeasonImport(params) {
  const importId = String(params.importId || '').trim();
  if (!importId) {
    return { success: false, errorCode: 'INVALID_IMPORT_ID', message: 'importId 파라미터가 필요합니다.' };
  }

  const lock = LockService.getDocumentLock();
  lock.waitLock(5000);
  try {
    const record = getImportMetaRecord(importId);
    if (!record) {
      return { success: false, errorCode: 'IMPORT_NOT_FOUND', message: '진행 중인 업로드 세션을 찾을 수 없습니다.' };
    }
    if (record.status !== IMPORT_STATUS_ACTIVE) {
      return { success: false, errorCode: 'IMPORT_NOT_ACTIVE', message: '이미 종료된 업로드 세션입니다.' };
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const stagingSheet = ss.getSheetByName(record.stagingSheetName);
    if (!stagingSheet) {
      return { success: false, errorCode: 'STAGING_NOT_FOUND', message: '스테이징 시트를 찾을 수 없습니다.' };
    }

    const internalCol = MEMBER_V2_SHEET_HEADERS.length + 1;
    const internalHeader = String(stagingSheet.getRange(1, internalCol).getValue() || '').trim();
    if (internalHeader === MEMBER_IMPORT_INTERNAL_PHONE_KEY_HEADER) {
      stagingSheet.deleteColumn(internalCol);
    }

    stagingSheet.getRange(1, 1, 1, MEMBER_V2_SHEET_HEADERS.length).setValues([MEMBER_V2_SHEET_HEADERS]);

    const targetMode = parseImportTargetMode(record.targetMode || IMPORT_TARGET_MODE_CREATE);
    if (targetMode === IMPORT_TARGET_MODE_CREATE) {
      if (findSeasonSheetByAlias(record.seasonAlias)) {
        return {
          success: false,
          errorCode: 'DUPLICATE_SEASON',
          message: `${record.seasonAlias} 시즌 시트가 이미 존재합니다.`
        };
      }

      if (stagingSheet.isSheetHidden()) {
        stagingSheet.showSheet();
      }
      stagingSheet.setName(record.seasonAlias);
      moveSheetToRightmost(stagingSheet);
      applySeasonSheetTablePresentation(stagingSheet);
      PropertiesService.getScriptProperties().setProperty('activeSheet', record.seasonAlias);

      record.stagingSheetName = record.seasonAlias;
      record.status = IMPORT_STATUS_FINALIZED;
      record.targetSheetName = record.seasonAlias;
      setImportMetaRecord(record);

      return {
        success: true,
        importId: importId,
        seasonAlias: record.seasonAlias,
        sheetName: record.seasonAlias,
        targetMode: IMPORT_TARGET_MODE_CREATE,
        effectiveScope: resolveEffectiveImportScope(IMPORT_TARGET_MODE_CREATE, record.importMode),
        inserted_count: record.insertedCount,
        skipped_duplicate_count: record.skippedDuplicateCount,
        dropped_invalid_count: record.droppedInvalidCount,
        skipped_non_target_count: record.skippedNonTargetCount
      };
    }

    const targetSheet = ss.getSheetByName(record.targetSheetName) || findSeasonSheetByAlias(record.seasonAlias);
    if (!targetSheet) {
      return {
        success: false,
        errorCode: 'TARGET_SHEET_NOT_FOUND',
        message: '업데이트 대상 시즌 시트를 찾을 수 없습니다.'
      };
    }

    const confirmDiff = parseBooleanParam(params.confirmDiff);
    if (!confirmDiff) {
      return {
        success: false,
        errorCode: 'DIFF_CONFIRM_REQUIRED',
        message: '업데이트 모드 반영 전 변경사항 동의(confirmDiff=true)가 필요합니다.'
      };
    }

    const snapshot = buildImportDiffSnapshot(record, stagingSheet, targetSheet);
    if (!snapshot.success && snapshot.errorCode) {
      return snapshot;
    }

    const providedToken = String(params.diffToken || '').trim();
    if (!providedToken || providedToken !== snapshot.diffToken) {
      return {
        success: false,
        errorCode: 'DIFF_TOKEN_MISMATCH',
        message: '변경사항 토큰이 일치하지 않습니다. 최신 Diff로 갱신 후 다시 반영해주세요.',
        latestDiffToken: snapshot.diffToken,
        latestSummary: snapshot.summary
      };
    }

    const applyResult = applyImportUpdateToExistingSheet(targetSheet, snapshot);
    applySeasonSheetTablePresentation(targetSheet);
    PropertiesService.getScriptProperties().setProperty('activeSheet', record.seasonAlias);

    ss.deleteSheet(stagingSheet);

    record.stagingSheetName = targetSheet.getName();
    record.status = IMPORT_STATUS_FINALIZED;
    record.targetSheetName = targetSheet.getName();
    setImportMetaRecord(record);

    return {
      success: true,
      importId: importId,
      seasonAlias: record.seasonAlias,
      sheetName: targetSheet.getName(),
      targetMode: IMPORT_TARGET_MODE_UPDATE,
      effectiveScope: resolveEffectiveImportScope(IMPORT_TARGET_MODE_UPDATE, record.importMode),
      added_count: applyResult.addedCount,
      updated_row_count: applyResult.updatedRowCount,
      delete_candidate_count: snapshot.summary.deleteCandidateCount,
      protected_skip_count: snapshot.summary.protectedSkipCount,
      skipped_duplicate_count: record.skippedDuplicateCount,
      dropped_invalid_count: record.droppedInvalidCount,
      skipped_non_target_count: record.skippedNonTargetCount
    };
  } catch (error) {
    return {
      success: false,
      errorCode: 'IMPORT_FINALIZE_FAILED',
      message: error.message || '업로드 완료 처리 중 오류가 발생했습니다.'
    };
  } finally {
    lock.releaseLock();
  }
}

function abortSeasonImport(params) {
  const importId = String(params.importId || '').trim();
  if (!importId) {
    return { success: false, errorCode: 'INVALID_IMPORT_ID', message: 'importId 파라미터가 필요합니다.' };
  }

  const lock = LockService.getDocumentLock();
  lock.waitLock(5000);
  try {
    const record = getImportMetaRecord(importId);
    if (!record) {
      return { success: false, errorCode: 'IMPORT_NOT_FOUND', message: '업로드 세션을 찾을 수 없습니다.' };
    }

    if (record.status === IMPORT_STATUS_FINALIZED) {
      return {
        success: false,
        errorCode: 'IMPORT_ALREADY_FINALIZED',
        message: '이미 완료된 업로드 세션은 중단할 수 없습니다.'
      };
    }

    if (record.status === IMPORT_STATUS_ABORTED) {
      return {
        success: true,
        importId: importId,
        seasonAlias: record.seasonAlias,
        message: '이미 중단 처리된 업로드 세션입니다.'
      };
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const stagingSheet = ss.getSheetByName(record.stagingSheetName);
    if (stagingSheet) {
      ss.deleteSheet(stagingSheet);
    }

    record.status = IMPORT_STATUS_ABORTED;
    setImportMetaRecord(record);

    return {
      success: true,
      importId: importId,
      seasonAlias: record.seasonAlias,
      message: '업로드 세션이 중단되었습니다.'
    };
  } catch (error) {
    return {
      success: false,
      errorCode: 'IMPORT_ABORT_FAILED',
      message: error.message || '업로드 중단 중 오류가 발생했습니다.'
    };
  } finally {
    lock.releaseLock();
  }
}

function getMembers(seasonName) {
  try {
    const info = getRequestedSeasonSheetInfo(seasonName);
    const sheet = info.sheet;
    const values = sheet.getDataRange().getValues();
    const memberSchema = resolveMemberSchemaFromHeaders(values[0] || []);

    const members = [];
    for (let i = 1; i < values.length; i++) {
      const member = readMemberFromRow(values[i], memberSchema);
      if (!member.name || !member.phone) continue;

      members.push({
        name: member.name,
        grade: member.seasonLabel || formatSeasonLabel(member.season),
        season: member.season,
        seasonLabel: member.seasonLabel || formatSeasonLabel(member.season),
        phone: member.phone,
        email: member.email,
        githubId: member.githubId,
        githubEmail: member.githubEmail,
        notionEmail: member.notionEmail,
        discordId: member.discordId,
        slackEmail: member.slackEmail,
        feeChecked: member.feeChecked,
        completed: member.completed,
        isStaff: member.isStaff,
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
    const values = sheet.getDataRange().getValues();
    const memberSchema = resolveMemberSchemaFromHeaders(values[0] || []);
    const sessions = collectSessionsFromSheet(sheet, { createMissingMeta: true, memberSchema: memberSchema });
    const session = sessions.find(s => s.sessionKey === sessionKey);

    if (!session) {
      return { success: false, message: '회차를 찾을 수 없습니다.' };
    }

    const lookup = findMemberRowIndexByPhone(values, memberSchema, cleanedPhone);
    if (lookup.duplicateRowIndexes.length > 0) {
      return buildPhoneSuperkeyDuplicateResult(lookup.duplicateRowIndexes);
    }

    const rowIndex = lookup.rowIndex;
    if (rowIndex < 0) {
      return { success: false, message: '해당 전화번호의 회원을 찾을 수 없습니다.' };
    }
    const member = readMemberFromRow(values[rowIndex], memberSchema);

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
      name: member.name,
      grade: member.seasonLabel || formatSeasonLabel(member.season),
      season: member.season,
      seasonLabel: member.seasonLabel || formatSeasonLabel(member.season),
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

function buildExcusedExistingRecordInfo(existingValue, existingNote, session) {
  const rawText = existingValue === undefined || existingValue === null ? '' : String(existingValue).trim();
  const noteText = String(existingNote || '').trim();
  const isExcused = isExcusedValue(existingValue);
  const parsedTime = parseAttendanceTime(existingValue);
  const hasParsedTime = !!(parsedTime && !isNaN(parsedTime.getTime()));
  const hasDateValue = existingValue instanceof Date && !isNaN(existingValue.getTime());
  const hasNumericValue = typeof existingValue === 'number' && isFinite(existingValue);
  const hasFallbackTextRecord = !isExcused && rawText !== '' && (/\d/.test(rawText) || /(출석|지각)/.test(rawText));
  const hasAttendanceRecord = !isExcused && (hasParsedTime || hasDateValue || hasNumericValue || hasFallbackTextRecord);

  let status = '';
  if (hasAttendanceRecord) {
    if (hasParsedTime) {
      const computedStatus = getAttendanceType(parsedTime, session);
      status = (computedStatus === 'on_time' || computedStatus === 'late') ? computedStatus : 'recorded';
    } else {
      status = 'recorded';
    }
  }

  return {
    hasAttendanceRecord: hasAttendanceRecord,
    existingStatus: status,
    existingTimeText: hasParsedTime ? formatDateTime(parsedTime) : rawText,
    existingNote: noteText
  };
}

function setExcusedAttendance(params) {
  const seasonName = String(params.season || '').trim();
  const phone = String(params.phone || '').trim();
  const sessionKey = String(params.sessionKey || '').trim();
  const enabled = parseBooleanParam(params.enabled);
  const previewOnly = parseBooleanParam(params.previewOnly);
  const forceOverride = parseBooleanParam(params.forceOverride);
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
    const values = sheet.getDataRange().getValues();
    const memberSchema = resolveMemberSchemaFromHeaders(values[0] || []);
    const sessions = collectSessionsFromSheet(sheet, { createMissingMeta: true, memberSchema: memberSchema });
    const session = sessions.find(s => s.sessionKey === sessionKey);

    if (!session) {
      return { success: false, message: '회차를 찾을 수 없습니다.' };
    }

    const lookup = findMemberRowIndexByPhone(values, memberSchema, cleanedPhone);
    if (lookup.duplicateRowIndexes.length > 0) {
      return buildPhoneSuperkeyDuplicateResult(lookup.duplicateRowIndexes);
    }

    const rowIndex = lookup.rowIndex;
    if (rowIndex < 0) {
      return { success: false, message: '해당 전화번호의 회원을 찾을 수 없습니다.' };
    }

    const targetRange = sheet.getRange(rowIndex + 1, session.colIndex + 1);
    const existingValue = targetRange.getValue();
    const existingRecord = buildExcusedExistingRecordInfo(existingValue, targetRange.getNote(), session);
    const isAttendanceRecord = existingRecord.hasAttendanceRecord;

    if (enabled) {
      if (isAttendanceRecord && !forceOverride) {
        return {
          success: false,
          errorCode: 'EXCUSE_OVERRIDE_CONFIRM_REQUIRED',
          message: '이미 출석/지각 기록이 있습니다. 유고로 덮어쓸지 다시 확인해주세요.',
          existingStatus: existingRecord.existingStatus,
          existingTime: existingRecord.existingTimeText,
          existingNote: existingRecord.existingNote,
          requiresOverride: true
        };
      }

      if (previewOnly) {
        return {
          success: true,
          message: '유고 처리 사전 확인 완료',
          previewOnly: true,
          existingStatus: existingRecord.existingStatus,
          existingTime: existingRecord.existingTimeText,
          existingNote: existingRecord.existingNote,
          requiresOverride: false
        };
      }

      const noteLines = [];
      if (comment) {
        noteLines.push(`유고 사유: ${comment}`);
      }
      if (isAttendanceRecord) {
        const statusText = existingRecord.existingStatus === 'on_time'
          ? '출석'
          : (existingRecord.existingStatus === 'late' ? '지각' : '기록');
        noteLines.push(`[덮어쓰기] 기존 기록: ${statusText}${existingRecord.existingTimeText ? ` (${existingRecord.existingTimeText})` : ''}`);
        if (existingRecord.existingNote) {
          noteLines.push(`[기존 메모] ${existingRecord.existingNote}`);
        }
      }

      targetRange.setValue('유고');
      targetRange.setBackground(EXCUSED_COLOR);
      targetRange.setNote(noteLines.join('\n'));

      return {
        success: true,
        message: '유고 처리 완료',
        seasonAlias: info.seasonAlias,
        sessionKey: session.sessionKey,
        phone: cleanedPhone,
        enabled: true,
        comment: comment,
        overwrittenAttendance: isAttendanceRecord,
        previousStatus: isAttendanceRecord ? existingRecord.existingStatus : ''
      };
    }

    if (isExcusedValue(existingValue)) {
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
    const memberSchema = resolveMemberSchemaFromHeaders(values[0] || []);

    const variableConfig = getVariableConfig();
    const sessions = collectSessionsFromSheet(sheet, { variableConfig: variableConfig, createMissingMeta: false, memberSchema: memberSchema });
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

    const sessionStartCol = Math.max(0, memberSchema.sessionStartColIndex);
    const notes = sheet.getLastRow() >= 2 && sheet.getLastColumn() > sessionStartCol
      ? sheet.getRange(2, sessionStartCol + 1, sheet.getLastRow() - 1, sheet.getLastColumn() - sessionStartCol).getNotes()
      : [];

    const members = [];

    for (let i = 1; i < values.length; i++) {
      const member = readMemberFromRow(values[i], memberSchema);
      if (!member.name || !member.phone) continue;

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
          ? String(notes[i - 1][session.colIndex - sessionStartCol] || '').trim()
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
      const attendanceRate = effectivePastCount > 0
        ? Math.round((attendedCount / effectivePastCount) * 100)
        : 0;

      const meetsAttendance = attendedCount >= requiredAttendanceCount;
      const attendancePossible = attendedCount + futureCount >= requiredAttendanceCount;
      const meetsAbsence = absenceEquivalent <= maxAbsenceEquivalent;
      const requiredSatisfied = requiredCheck.satisfied;
      const requiredPossible = requiredCheck.possible;

      const isFinal = futureCount === 0;
      const isGraduated = isFinal && requiredSatisfied && meetsAttendance && meetsAbsence;
      const isGraduationPossible = requiredPossible && attendancePossible && meetsAbsence;

      members.push({
        name: member.name,
        grade: member.seasonLabel || formatSeasonLabel(member.season),
        season: member.season,
        seasonLabel: member.seasonLabel || formatSeasonLabel(member.season),
        phone: member.phone,
        email: member.email,
        githubId: member.githubId,
        githubEmail: member.githubEmail,
        notionEmail: member.notionEmail,
        discordId: member.discordId,
        slackEmail: member.slackEmail,
        feeChecked: member.feeChecked,
        completed: member.completed,
        isStaff: member.isStaff,
        attendedCount: attendedCount,
        lateCount: lateCount,
        absentCount: absentCount,
        excusedCount: excusedCount,
        effectivePastCount: effectivePastCount,
        futureCount: futureCount,
        attendanceRate: attendanceRate,
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

    members.sort((a, b) => {
      if (b.attendanceRate !== a.attendanceRate) {
        return b.attendanceRate - a.attendanceRate;
      }
      if (b.attendedCount !== a.attendedCount) {
        return b.attendedCount - a.attendedCount;
      }
      if (a.absenceEquivalent !== b.absenceEquivalent) {
        return a.absenceEquivalent - b.absenceEquivalent;
      }
      return String(a.name).localeCompare(String(b.name));
    });

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
