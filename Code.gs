// Code.gs

const SESSION_HEADER_REGEX = /^(\d{4})-(\d{2})-(\d{2})-(\d{2}):(\d{2})$/;
const ON_TIME_WINDOW_MS = 30 * 60 * 1000;
const LATE_WINDOW_MS = 60 * 60 * 1000;
const ON_TIME_COLOR = '#6d9eeb';
const LATE_COLOR = '#f6b26b';
const ADMIN_TOKEN_TTL_SECONDS = 6 * 60 * 60;
const ADMIN_TOKEN_CACHE_PREFIX = 'admin_token_';

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
  const season = params.season || '';

  if (mode === 'student') {
    const studentBase = getFrontendStudentBaseUrl();
    if (isFrontendUrlConfigured(studentBase)) {
      const studentUrl = generateStudentQRCodeUrl(season);
      return createRedirectOutput(studentUrl);
    }

    // fallback: 레거시 학생 인터페이스
    const template = HtmlService.createTemplateFromFile('StudentInterface');
    template.season = season;
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

/**
 * 모든 시트 목록을 반환합니다.
 * @returns {Array<{name: string, isActive: boolean}>}
 */
function getAllSheets() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheets = ss.getSheets();
    const scriptProperties = PropertiesService.getScriptProperties();
    const activeSheetName = scriptProperties.getProperty('activeSheet');

    const sheetList = sheets
      .map(sheet => sheet.getName())
      .filter(name => name !== '설정' && name !== 'Settings')
      .sort((a, b) => b.localeCompare(a))
      .map(name => ({
        name: name,
        isActive: name === activeSheetName
      }));

    if (!activeSheetName && sheetList.length > 0) {
      scriptProperties.setProperty('activeSheet', sheetList[0].name);
      sheetList[0].isActive = true;
    }

    return sheetList;
  } catch (error) {
    Logger.log('시트 목록 가져오기 오류: ' + error.toString());
    return [];
  }
}

/**
 * 활성 시트를 변경합니다.
 * @param {string} sheetName - 활성화할 시트명
 * @returns {{success: boolean, message: string}}
 */
function setActiveSheet(sheetName) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      return { success: false, message: '시트를 찾을 수 없습니다.' };
    }

    const scriptProperties = PropertiesService.getScriptProperties();
    scriptProperties.setProperty('activeSheet', sheetName);

    return { success: true, message: `${sheetName} 시트가 활성화되었습니다.` };
  } catch (error) {
    Logger.log('시트 변경 오류: ' + error.toString());
    return { success: false, message: '시트 변경 중 오류가 발생했습니다.' };
  }
}

/**
 * 현재 활성화된 시트를 가져옵니다. (관리자용)
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getActiveAttendanceSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const scriptProperties = PropertiesService.getScriptProperties();
  let activeSheetName = scriptProperties.getProperty('activeSheet');

  if (!activeSheetName) {
    const sheets = ss.getSheets().filter(sheet =>
      sheet.getName() !== '설정' && sheet.getName() !== 'Settings'
    );
    if (sheets.length > 0) {
      activeSheetName = sheets[0].getName();
      scriptProperties.setProperty('activeSheet', activeSheetName);
    }
  }

  return ss.getSheetByName(activeSheetName);
}

/**
 * 시즌별 시트를 가져옵니다. (학생용)
 * @param {string} seasonName - 시즌명 (시트명)
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getSeasonSheet(seasonName) {
  if (!seasonName) {
    return getActiveAttendanceSheet();
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(seasonName);

  if (!sheet) {
    throw new Error(`시즌 '${seasonName}'에 해당하는 시트를 찾을 수 없습니다.`);
  }

  return sheet;
}

function parseSessionHeader(headerValue) {
  if (typeof headerValue !== 'string') return null;
  const text = headerValue.trim();
  if (!text) return null;

  const parts = text.match(SESSION_HEADER_REGEX);
  if (!parts) return null;

  const startTime = new Date(
    parseInt(parts[1], 10),
    parseInt(parts[2], 10) - 1,
    parseInt(parts[3], 10),
    parseInt(parts[4], 10),
    parseInt(parts[5], 10),
    0,
    0
  );

  if (isNaN(startTime.getTime())) return null;

  return {
    header: text,
    startTime: startTime,
    onTimeDeadline: new Date(startTime.getTime() + ON_TIME_WINDOW_MS),
    lateDeadline: new Date(startTime.getTime() + LATE_WINDOW_MS)
  };
}

function collectSessionsFromHeaders(headers) {
  const sessions = [];

  for (let j = 3; j < headers.length; j++) {
    const parsed = parseSessionHeader(headers[j]);
    if (!parsed) continue;

    sessions.push({
      colIndex: j,
      header: parsed.header,
      startTime: parsed.startTime,
      onTimeDeadline: parsed.onTimeDeadline,
      lateDeadline: parsed.lateDeadline
    });
  }

  return sessions;
}

function findActiveSession(sessions, now) {
  let active = null;

  sessions.forEach(session => {
    if (now >= session.startTime && now <= session.lateDeadline) {
      active = session;
    }
  });

  return active;
}

function getAttendanceType(attendTime, session) {
  if (!attendTime || !session) return 'absent';

  const t = attendTime.getTime();
  if (t < session.startTime.getTime() || t > session.lateDeadline.getTime()) {
    return 'absent';
  }

  if (t <= session.onTimeDeadline.getTime()) {
    return 'on_time';
  }

  return 'late';
}

/**
 * 현재 진행 중인 출석 세션 정보를 반환합니다. (관리자용)
 */
function getAttendanceSession() {
  const sheet = getActiveAttendanceSheet();
  if (!sheet) {
    return { active: false, message: '활성화된 출석 시트가 없습니다.' };
  }

  return getAttendanceSessionFromSheet(sheet);
}

/**
 * 시즌별 출석 세션 정보를 반환합니다. (학생용)
 */
function getSeasonAttendanceSession(seasonName) {
  try {
    const sheet = getSeasonSheet(seasonName);
    if (!sheet) {
      return { active: false, message: `시즌 '${seasonName}'에 해당하는 시트가 없습니다.` };
    }

    const result = getAttendanceSessionFromSheet(sheet);
    result.currentSheet = seasonName;
    return result;
  } catch (error) {
    Logger.log('시즌별 출석 세션 조회 오류: ' + error.toString());
    return { active: false, message: error.message };
  }
}

/**
 * 특정 시트에서 출석 세션 정보를 조회합니다.
 */
function getAttendanceSessionFromSheet(sheet) {
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const now = new Date();
  const sessions = collectSessionsFromHeaders(headers);
  const activeSession = findActiveSession(sessions, now);

  if (!activeSession) {
    return {
      active: false,
      message: '지금은 출석 가능한 시간이 아닙니다.',
      currentSheet: sheet.getName()
    };
  }

  const phase = now <= activeSession.onTimeDeadline ? 'on_time' : 'late';

  return {
    active: true,
    phase: phase,
    startTime: activeSession.startTime.getTime(),
    onTimeDeadline: activeSession.onTimeDeadline.getTime(),
    lateDeadline: activeSession.lateDeadline.getTime(),
    endTime: activeSession.lateDeadline.getTime(),
    currentSheet: sheet.getName()
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
    const sheet = getActiveAttendanceSheet();
    if (!sheet) {
      return { success: false, message: '활성화된 출석 시트가 없습니다.' };
    }

    return markAttendanceInSheet(phoneNumber, sheet);
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
    const sheet = getSeasonSheet(seasonName);
    if (!sheet) {
      return { success: false, message: `시즌 '${seasonName}'에 해당하는 시트가 없습니다.` };
    }

    return markAttendanceInSheet(phoneNumber, sheet);
  } catch (error) {
    Logger.log('시즌별 출석 처리 오류: ' + error.toString());
    return { success: false, message: '서버 오류가 발생했습니다: ' + error.toString() };
  }
}

function isValidPhoneNumber(phoneNumber) {
  return /^010\d{8}$/.test(String(phoneNumber || '').replace(/-/g, ''));
}

/**
 * 특정 시트에서 출석을 처리합니다.
 */
function markAttendanceInSheet(phoneNumber, sheet) {
  const cleanedInputPhone = String(phoneNumber || '').replace(/-/g, '');
  if (!isValidPhoneNumber(cleanedInputPhone)) {
    return { success: false, message: '올바른 전화번호 형식이 아닙니다. (예: 01012345678)' };
  }

  const lock = LockService.getDocumentLock();
  lock.waitLock(5000);

  try {
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    const headers = values[0];
    const now = new Date();

    const sessions = collectSessionsFromHeaders(headers);
    const activeSession = findActiveSession(sessions, now);

    if (!activeSession) {
      return { success: false, message: '출석 가능한 시간이 종료되었습니다.' };
    }

    let targetRowIndex = -1;
    for (let i = 1; i < values.length; i++) {
      const storedPhone = values[i][2] ? values[i][2].toString().replace(/-/g, '') : '';
      if (storedPhone === cleanedInputPhone) {
        targetRowIndex = i;
        break;
      }
    }

    if (targetRowIndex === -1) {
      return { success: false, message: '등록되지 않은 전화번호입니다.' };
    }

    const targetRange = sheet.getRange(targetRowIndex + 1, activeSession.colIndex + 1);
    const existing = targetRange.getValue();
    if (existing && existing.toString().trim() !== '') {
      const name = values[targetRowIndex][0];
      const grade = values[targetRowIndex][1];
      return { success: false, message: `(${grade}) ${name}님은 이미 출석체크를 완료했습니다.` };
    }

    const writeTime = new Date();
    if (writeTime > activeSession.lateDeadline) {
      return { success: false, message: '출석 가능한 시간이 종료되었습니다.' };
    }

    const attendanceType = writeTime <= activeSession.onTimeDeadline ? 'on_time' : 'late';
    const formattedTime = Utilities.formatDate(writeTime, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');

    targetRange.setValue(formattedTime);
    targetRange.setBackground(attendanceType === 'on_time' ? ON_TIME_COLOR : LATE_COLOR);

    const updatedRow = sheet.getRange(targetRowIndex + 1, 1, 1, sheet.getLastColumn()).getValues()[0];
    const startedSessions = sessions.filter(s => s.startTime <= writeTime);

    let attendedCount = 0;
    startedSessions.forEach(session => {
      const cellValue = updatedRow[session.colIndex];
      if (cellValue && cellValue.toString().trim() !== '') {
        attendedCount++;
      }
    });

    const attendanceRate = startedSessions.length > 0
      ? Math.round((attendedCount / startedSessions.length) * 100)
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
      attendanceInfo: {
        attended: attendedCount,
        total: sessions.length,
        currentSession: startedSessions.length,
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
    const sheet = getActiveAttendanceSheet();
    if (!sheet) {
      return { success: false, message: '활성화된 출석 시트가 없습니다.' };
    }

    return getAttendanceStatusFromSheet(phoneNumber, sheet);
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
    const sheet = getSeasonSheet(seasonName);
    if (!sheet) {
      return { success: false, message: `시즌 '${seasonName}'에 해당하는 시트가 없습니다.` };
    }

    return getAttendanceStatusFromSheet(phoneNumber, sheet);
  } catch (error) {
    Logger.log('시즌별 출석 현황 조회 오류: ' + error.toString());
    return { success: false, message: '조회 중 오류가 발생했습니다: ' + error.toString() };
  }
}

/**
 * 특정 시트에서 출석 현황을 조회합니다.
 */
function getAttendanceStatusFromSheet(phoneNumber, sheet) {
  const cleanedInputPhone = String(phoneNumber || '').replace(/-/g, '');
  if (!isValidPhoneNumber(cleanedInputPhone)) {
    return { success: false, message: '올바른 전화번호 형식이 아닙니다. (예: 01012345678)' };
  }

  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const sessions = collectSessionsFromHeaders(headers);

  let targetRowIndex = -1;
  for (let i = 1; i < values.length; i++) {
    const storedPhone = values[i][2] ? values[i][2].toString().replace(/-/g, '') : '';
    if (storedPhone === cleanedInputPhone) {
      targetRowIndex = i;
      break;
    }
  }

  if (targetRowIndex === -1) {
    return { success: false, message: '등록되지 않은 전화번호입니다.' };
  }

  const now = new Date();
  const name = values[targetRowIndex][0];
  const grade = values[targetRowIndex][1];

  const attendanceDetails = [];
  let attendedCount = 0;
  let currentSessionCount = 0;

  sessions.forEach(session => {
    const cellValue = values[targetRowIndex][session.colIndex];
    const attendTime = parseAttendanceTime(cellValue);
    const isPast = now > session.lateDeadline;

    if (isPast) {
      currentSessionCount++;
    }

    const attendanceType = attendTime
      ? getAttendanceType(attendTime, session)
      : (isPast ? 'absent' : 'future');

    const attended = attendanceType === 'on_time' || attendanceType === 'late';
    if (attended && isPast) {
      attendedCount++;
    }

    attendanceDetails.push({
      date: Utilities.formatDate(session.startTime, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'),
      attended: attended,
      attendanceType: attendanceType,
      attendTime: attended ? (cellValue ? cellValue.toString() : null) : null,
      isPast: isPast
    });
  });

  const attendanceRate = currentSessionCount > 0
    ? Math.round((attendedCount / currentSessionCount) * 100)
    : 0;

  return {
    success: true,
    data: {
      name: name,
      grade: grade,
      attended: attendedCount,
      total: attendanceDetails.length,
      currentSession: currentSessionCount,
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
        phoneNumbers.push(values[i][2].toString().replace(/-/g, ''));
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
  const studentBase = getFrontendStudentBaseUrl();
  if (isFrontendUrlConfigured(studentBase)) {
    const separator = studentBase.indexOf('?') === -1 ? '?' : '&';
    return `${studentBase}${separator}season=${encodeURIComponent(seasonName || '')}`;
  }

  const baseUrl = ScriptApp.getService().getUrl();
  return `${baseUrl}?mode=student&season=${encodeURIComponent(seasonName || '')}`;
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

  try {
    if (value instanceof Date) {
      return value;
    }

    if (typeof value === 'string') {
      const str = value.trim();

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
    const sheet = getActiveAttendanceSheet();
    if (!sheet) {
      return { success: false, message: '활성화된 출석 시트가 없습니다.' };
    }

    return getAttendanceRankingFromSheet(sheet);
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
    const sheet = getSeasonSheet(seasonName);
    if (!sheet) {
      return { success: false, message: `시즌 '${seasonName}'에 해당하는 시트가 없습니다.` };
    }

    return getAttendanceRankingFromSheet(sheet);
  } catch (error) {
    Logger.log('시즌별 순위 계산 오류: ' + error.toString());
    Logger.log('오류 스택: ' + (error.stack || ''));
    return { success: false, message: '순위 계산 중 오류가 발생했습니다.' };
  }
}

/**
 * 특정 시트에서 출석률 순위를 계산합니다.
 */
function getAttendanceRankingFromSheet(sheet) {
  const values = sheet.getDataRange().getValues();
  const headers = values[0];
  const now = new Date();

  const sessions = collectSessionsFromHeaders(headers);
  const closedSessions = sessions.filter(session => session.lateDeadline <= now);
  const currentSessionCount = closedSessions.length;

  if (currentSessionCount === 0) {
    return { success: true, data: [] };
  }

  const rankings = [];

  for (let i = 1; i < values.length; i++) {
    const name = values[i][0];
    const grade = values[i][1];
    const phone = values[i][2];
    if (!name || !phone) continue;

    let attendedCount = 0;
    let totalAttendTimeSeconds = 0;
    let validAttendTimeCount = 0;

    closedSessions.forEach(session => {
      const cellValue = values[i][session.colIndex];
      if (!cellValue || cellValue.toString().trim() === '') return;

      attendedCount++;

      const attendTime = parseAttendanceTime(cellValue);
      if (!attendTime || isNaN(attendTime.getTime())) {
        return;
      }

      const diffSec = Math.floor((attendTime - session.startTime) / 1000);
      if (diffSec >= 0 && diffSec <= 3600) {
        totalAttendTimeSeconds += diffSec;
        validAttendTimeCount++;
      }
    });

    const attendanceRate = (attendedCount / currentSessionCount) * 100;

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
      totalSessions: currentSessionCount,
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

  return { success: true, data: rankings.slice(0, 10) };
}
