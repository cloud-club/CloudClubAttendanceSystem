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
  maybeFinalizeCheckoutForSeasonSheet(sheet, sessions, now);

  const seasonSheetName = sheet.getName();
  const resolvedSeasonAlias = seasonAlias || toSeasonAlias(seasonSheetName);
  const checkoutMetaMap = getCheckoutMetaMapForSeason(seasonSheetName, { createIfMissing: false });
  const checkoutSession = findActiveCheckoutSession(sessions, checkoutMetaMap, now);
  const activeSession = findActiveSession(sessions, now);

  const baseSession = checkoutSession || activeSession;
  if (baseSession) {
    const phase = now <= baseSession.onTimeDeadline ? 'on_time' : 'late';
    const checkoutMeta = checkoutSession ? checkoutMetaMap[checkoutSession.sessionKey] : null;
    const checkoutBounds = checkoutSession ? getCheckoutWindowBounds(checkoutSession) : null;
    const checkinActive = !!(activeSession && !checkoutSession);

    return {
      active: checkinActive,
      checkinActive: checkinActive,
      checkoutActive: !!checkoutSession,
      flow: checkoutSession ? 'checkout' : 'checkin',
      phase: phase,
      openTime: baseSession.openTime.getTime(),
      startTime: baseSession.startTime.getTime(),
      onTimeDeadline: baseSession.onTimeDeadline.getTime(),
      lateDeadline: baseSession.lateDeadline.getTime(),
      endTime: baseSession.lateDeadline.getTime(),
      sessionKey: baseSession.sessionKey,
      checkoutRequired: !!checkoutSession,
      checkoutSessionKey: checkoutSession ? checkoutSession.sessionKey : '',
      checkoutCodeDigits: checkoutMeta ? checkoutMeta.codeDigits : CHECKOUT_DEFAULT_CODE_DIGITS,
      checkoutOpenTime: checkoutBounds && checkoutBounds.openTime ? checkoutBounds.openTime.getTime() : null,
      checkoutCloseTime: checkoutBounds && checkoutBounds.closeTime ? checkoutBounds.closeTime.getTime() : null,
      checkoutOpenOffsetMin: checkoutBounds ? checkoutBounds.offsetMin : null,
      message: checkoutSession ? '퇴실 인증 가능 시간입니다.' : '',
      currentSheet: seasonSheetName,
      seasonAlias: resolvedSeasonAlias
    };
  }

  const nextSession = findNextSession(sessions, now);
  if (nextSession) {
    return {
      active: false,
      checkinActive: false,
      checkoutActive: false,
      flow: 'waiting',
      message: '아직 출석 오픈 전입니다.',
      nextOpenTime: nextSession.openTime.getTime(),
      nextStartTime: nextSession.startTime.getTime(),
      nextSessionKey: nextSession.sessionKey,
      currentSheet: seasonSheetName,
      seasonAlias: resolvedSeasonAlias
    };
  }

  return {
    active: false,
    checkinActive: false,
    checkoutActive: false,
    flow: 'closed',
    message: '지금은 출석 가능한 시간이 아닙니다.',
    currentSheet: seasonSheetName,
    seasonAlias: resolvedSeasonAlias
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
  const hasAllV2Fields = MEMBER_FIELD_ORDER.every(field => fieldMap[field] !== null && fieldMap[field] !== undefined && fieldMap[field] >= 0);
  const mappedFieldIndexes = {};
  MEMBER_FIELD_ORDER.forEach(field => {
    const idx = fieldMap[field];
    if (idx === null || idx === undefined || idx < 0) return;
    mappedFieldIndexes[idx] = field;
  });

  const profileEndColIndex = sessionColumns.length > 0
    ? Math.max(0, sessionStartColIndex - 1)
    : Math.max(values.length - 1, profileMax - 1);
  const customProfileColumns = [];
  for (let i = 0; i <= profileEndColIndex && i < values.length; i++) {
    if (sessionColumns.indexOf(i) !== -1) continue;
    if (mappedFieldIndexes[i] !== undefined) continue;
    const headerText = String(values[i] || '').trim();
    if (!headerText) continue;
    customProfileColumns.push({
      colIndex: i,
      header: headerText,
      token: tokens[i] || ''
    });
  }

  let mode = 'custom';
  if (isV2) {
    mode = 'v2_strict';
  } else if (hasAllV2Fields) {
    mode = 'v2_extended';
  }

  return {
    headers: values,
    fieldMap: fieldMap,
    sessionStartColIndex: sessionStartColIndex,
    sessionColumns: sessionColumns,
    profileEndColIndex: profileEndColIndex,
    customProfileColumns: customProfileColumns,
    missingRequired: missingRequired,
    strictMissingRequired: strictMissingRequired,
    isV2: isV2,
    mode: mode
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

function hasSchemaFieldIndex(schema, field) {
  if (!schema || !schema.fieldMap) return false;
  const idx = schema.fieldMap[field];
  return idx !== null && idx !== undefined && idx >= 0;
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
    maybeFinalizeCheckoutForSeasonSheet(sheet, sessions, now, { alreadyLocked: true });
    const checkoutMetaMap = getCheckoutMetaMapForSeason(sheet.getName(), { createIfMissing: false });
    const activeCheckoutSession = findActiveCheckoutSession(sessions, checkoutMetaMap, now);
    if (activeCheckoutSession) {
      const bounds = getCheckoutWindowBounds(activeCheckoutSession);
      return {
        success: false,
        checkoutOnly: true,
        sessionKey: activeCheckoutSession.sessionKey,
        checkoutOpenTime: bounds && bounds.openTime ? bounds.openTime.getTime() : null,
        checkoutCloseTime: bounds && bounds.closeTime ? bounds.closeTime.getTime() : null,
        message: '지금은 입실이 아니라 퇴실 인증 시간입니다. 전화번호와 퇴실 코드를 입력해 주세요.'
      };
    }

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
    const resolvedSeasonAlias = seasonAlias || toSeasonAlias(sheet.getName());
    const checkoutTicket = issueCheckoutAttendanceTicket({
      seasonAlias: resolvedSeasonAlias,
      sessionKey: activeSession.sessionKey,
      phone: cleanedInputPhone
    });

    return {
      success: true,
      name: member.name,
      grade: seasonLabel,
      season: member.season,
      seasonLabel: seasonLabel,
      time: formattedTime,
      attendanceType: attendanceType,
      sessionKey: activeSession.sessionKey,
      seasonAlias: resolvedSeasonAlias,
      checkoutTicket: checkoutTicket,
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

  const now = new Date();
  let values = sheet.getDataRange().getValues();
  let memberSchema = resolveMemberSchemaFromHeaders(values[0] || []);
  const sessions = collectSessionsFromSheet(sheet, { createMissingMeta: false, memberSchema: memberSchema });
  const finalizeResult = maybeFinalizeCheckoutForSeasonSheet(sheet, sessions, now);
  if (finalizeResult && Number(finalizeResult.autoAbsentCount || 0) > 0) {
    values = sheet.getDataRange().getValues();
    memberSchema = resolveMemberSchemaFromHeaders(values[0] || []);
  }

  const seasonSheetName = sheet.getName();
  const sessionKeySet = {};
  sessions.forEach(session => {
    sessionKeySet[session.sessionKey] = true;
  });
  const checkoutMetaMap = getCheckoutMetaMapForSeason(seasonSheetName, { createIfMissing: false });
  const checkoutEventRows = getCheckoutEventRowsForSeason(seasonSheetName, sessionKeySet);
  const checkoutCompletionBySession = buildCheckoutCompletionMapBySession(checkoutEventRows);

  const lookup = findMemberRowIndexByPhone(values, memberSchema, cleanedInputPhone);
  if (lookup.duplicateRowIndexes.length > 0) {
    return buildPhoneSuperkeyDuplicateResult(lookup.duplicateRowIndexes);
  }

  const targetRowIndex = lookup.rowIndex;
  if (targetRowIndex < 0) {
    return { success: false, message: '등록되지 않은 전화번호입니다.' };
  }

  const member = readMemberFromRow(values[targetRowIndex], memberSchema);

  const attendanceDetails = [];
  const checkoutMissingRecords = [];
  let attendedCount = 0;
  let pastSessionCount = 0;
  let effectivePastCount = 0;
  let lateCount = 0;
  let excusedCount = 0;
  let checkoutCompletedCount = 0;
  let checkoutRequiredPastCount = 0;

  sessions.forEach(session => {
    const cellValue = values[targetRowIndex][session.colIndex];
    const status = getAttendanceDetailType(cellValue, session, now);
    const isPast = now > session.lateDeadline;
    const checkoutMeta = checkoutMetaMap[session.sessionKey];
    const checkoutRequired = isCheckoutRequiredMeta(checkoutMeta);
    const checkoutCompletion = checkoutRequired
      && checkoutCompletionBySession[session.sessionKey]
      ? checkoutCompletionBySession[session.sessionKey][cleanedInputPhone]
      : null;
    const checkoutBounds = getCheckoutWindowBounds(session);
    let checkoutStatus = 'not_required';
    let checkoutTime = null;

    if (checkoutRequired) {
      if (isPast) {
        checkoutRequiredPastCount++;
      }

      if (checkoutCompletion) {
        checkoutStatus = 'completed';
        checkoutTime = checkoutCompletion.submittedAt ? formatDateTime(checkoutCompletion.submittedAt) : null;
        if (isPast) {
          checkoutCompletedCount++;
        }
      } else if (now > session.lateDeadline) {
        checkoutStatus = 'missing';
      } else if (checkoutBounds.openTime && now >= checkoutBounds.openTime) {
        checkoutStatus = 'pending';
      } else {
        checkoutStatus = 'upcoming';
      }
    }

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

      if (checkoutRequired && !checkoutCompletion && (status === 'on_time' || status === 'late')) {
        checkoutMissingRecords.push({
          sessionKey: session.sessionKey,
          date: formatDateTimeMinute(session.startTime),
          attendTime: cellValue ? String(cellValue) : null,
          message: '입실 기록은 있으나 퇴실 정보가 없습니다.'
        });
      }
    }

    const attended = status === 'on_time' || status === 'late';

    attendanceDetails.push({
      sessionKey: session.sessionKey,
      date: formatDateTimeMinute(session.startTime),
      attended: attended,
      attendanceType: status,
      attendTime: attended ? (cellValue ? String(cellValue) : null) : null,
      isPast: isPast,
      checkoutRequired: checkoutRequired,
      checkoutStatus: checkoutStatus,
      checkoutTime: checkoutTime
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
      checkoutCompletedCount: checkoutCompletedCount,
      checkoutRequiredPastCount: checkoutRequiredPastCount,
      checkoutMissingCount: checkoutMissingRecords.length,
      checkoutMissingRecords: checkoutMissingRecords,
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
  const latestBaseUrl = getFrontendStudentLatestUrlBase();
  const requestedAlias = toSeasonAlias(seasonName);
  if (!requestedAlias) {
    return latestBaseUrl;
  }

  let latestAlias = '';
  try {
    latestAlias = resolveLatestSeasonAlias();
  } catch (error) {
    latestAlias = '';
  }

  if (latestAlias && requestedAlias === latestAlias) {
    return latestBaseUrl;
  }

  return appendSeasonQueryToUrl(latestBaseUrl, requestedAlias);
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
  const now = new Date();
  let values = sheet.getDataRange().getValues();
  let memberSchema = resolveMemberSchemaFromHeaders(values[0] || []);
  const sessions = collectSessionsFromSheet(sheet, { createMissingMeta: false, memberSchema: memberSchema });
  const finalizeResult = maybeFinalizeCheckoutForSeasonSheet(sheet, sessions, now);
  if (finalizeResult && Number(finalizeResult.autoAbsentCount || 0) > 0) {
    values = sheet.getDataRange().getValues();
    memberSchema = resolveMemberSchemaFromHeaders(values[0] || []);
  }

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
