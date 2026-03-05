function ensureCheckoutMetaSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CHECKOUT_META_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CHECKOUT_META_SHEET_NAME);
  }

  const headerRange = sheet.getRange(1, 1, 1, CHECKOUT_META_HEADERS.length);
  const currentHeaders = headerRange.getValues()[0];
  if (String(currentHeaders[0] || '').trim() === '') {
    headerRange.setValues([CHECKOUT_META_HEADERS]);
  }

  if (!sheet.isSheetHidden()) {
    sheet.hideSheet();
  }

  return sheet;
}

function ensureCheckoutEventSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(CHECKOUT_EVENT_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(CHECKOUT_EVENT_SHEET_NAME);
  }

  const headerRange = sheet.getRange(1, 1, 1, CHECKOUT_EVENT_HEADERS.length);
  const currentHeaders = headerRange.getValues()[0];
  if (String(currentHeaders[0] || '').trim() === '') {
    headerRange.setValues([CHECKOUT_EVENT_HEADERS]);
  }

  if (!sheet.isSheetHidden()) {
    sheet.hideSheet();
  }

  return sheet;
}

function getCheckoutCodeDigits(raw) {
  const value = parseInt(raw, 10);
  if (value === 6) return 6;
  return CHECKOUT_DEFAULT_CODE_DIGITS;
}

function generateCheckoutNumericCode(digits) {
  const size = Math.max(3, Math.min(6, parseInt(digits, 10) || CHECKOUT_DEFAULT_CODE_DIGITS));
  let code = '';
  for (let i = 0; i < size; i++) {
    code += String(Math.floor(Math.random() * 10));
  }
  return code;
}

function getCheckoutWindowBounds(session) {
  const closeBase = session && session.endTime instanceof Date
    ? session.endTime
    : (session && session.lateDeadline instanceof Date ? session.lateDeadline : null);

  if (!closeBase) {
    return {
      openTime: null,
      closeTime: null
    };
  }

  const closeTime = new Date(closeBase.getTime());
  const fallbackOffset = -CHECKOUT_DEFAULT_WINDOW_MINUTES;
  const offsetMin = Math.min(
    0,
    Math.max(
      -180,
      toNumberWithDefault(session && session.checkoutOpenOffsetMin, fallbackOffset)
    )
  );
  const openTime = new Date(closeTime.getTime() + offsetMin * 60 * 1000);

  return {
    openTime: openTime,
    closeTime: closeTime,
    offsetMin: offsetMin
  };
}

function parseCheckoutMetaTimestamp(value) {
  if (!value) return null;
  if (value instanceof Date && !isNaN(value.getTime())) return value;
  if (typeof value === 'number' && isFinite(value)) {
    const asDate = new Date(value);
    if (!isNaN(asDate.getTime())) return asDate;
  }
  const text = String(value || '').trim();
  if (!text) return null;
  const parsed = new Date(text);
  if (!isNaN(parsed.getTime())) return parsed;
  return null;
}

function parseCheckoutMetaEnabled(value) {
  if (typeof value === 'boolean') return value;
  const text = String(value || '').trim().toLowerCase();
  return text === 'true' || text === '1' || text === 'yes' || text === 'y';
}

function getCheckoutMetaPack(seasonSheetName, options) {
  const opts = options || {};
  const createIfMissing = opts.createIfMissing === true;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const metaSheet = createIfMissing
    ? ensureCheckoutMetaSheet()
    : ss.getSheetByName(CHECKOUT_META_SHEET_NAME);
  const map = {};

  if (!metaSheet) {
    return { metaSheet: null, map: map };
  }

  const lastRow = metaSheet.getLastRow();
  if (lastRow < 2) {
    return { metaSheet: metaSheet, map: map };
  }

  const values = metaSheet.getRange(2, 1, lastRow - 1, CHECKOUT_META_HEADERS.length).getValues();
  values.forEach((row, idx) => {
    const season = String(row[0] || '').trim();
    const sessionKey = String(row[1] || '').trim();
    if (!season || !sessionKey) return;
    if (season !== seasonSheetName) return;

    map[sessionKey] = {
      rowIndex: idx + 2,
      seasonSheet: season,
      sessionKey: sessionKey,
      enabled: parseCheckoutMetaEnabled(row[2]),
      code: String(row[3] || '').trim(),
      codeDigits: getCheckoutCodeDigits(row[4]),
      issuedAt: parseCheckoutMetaTimestamp(row[5]),
      issuedByEmail: String(row[6] || '').trim(),
      finalizedAt: parseCheckoutMetaTimestamp(row[7]),
      updatedAt: parseCheckoutMetaTimestamp(row[8])
    };
  });

  return { metaSheet: metaSheet, map: map };
}

function upsertCheckoutMetaRecord(metaPack, seasonSheetName, sessionKey, payload) {
  const existing = metaPack.map[sessionKey];
  const now = new Date();
  const rowValues = [
    seasonSheetName,
    sessionKey,
    payload.enabled ? true : false,
    String(payload.code || '').trim(),
    getCheckoutCodeDigits(payload.codeDigits),
    payload.issuedAt instanceof Date ? payload.issuedAt : now,
    String(payload.issuedByEmail || '').trim(),
    payload.finalizedAt instanceof Date ? payload.finalizedAt : '',
    payload.updatedAt instanceof Date ? payload.updatedAt : now
  ];

  if (existing && existing.rowIndex > 1) {
    metaPack.metaSheet.getRange(existing.rowIndex, 1, 1, CHECKOUT_META_HEADERS.length).setValues([rowValues]);
    metaPack.map[sessionKey] = {
      rowIndex: existing.rowIndex,
      seasonSheet: seasonSheetName,
      sessionKey: sessionKey,
      enabled: !!rowValues[2],
      code: String(rowValues[3] || '').trim(),
      codeDigits: getCheckoutCodeDigits(rowValues[4]),
      issuedAt: parseCheckoutMetaTimestamp(rowValues[5]),
      issuedByEmail: String(rowValues[6] || '').trim(),
      finalizedAt: parseCheckoutMetaTimestamp(rowValues[7]),
      updatedAt: parseCheckoutMetaTimestamp(rowValues[8])
    };
    return metaPack.map[sessionKey];
  }

  const startRow = metaPack.metaSheet.getLastRow() + 1;
  metaPack.metaSheet.getRange(startRow, 1, 1, CHECKOUT_META_HEADERS.length).setValues([rowValues]);

  metaPack.map[sessionKey] = {
    rowIndex: startRow,
    seasonSheet: seasonSheetName,
    sessionKey: sessionKey,
    enabled: !!rowValues[2],
    code: String(rowValues[3] || '').trim(),
    codeDigits: getCheckoutCodeDigits(rowValues[4]),
    issuedAt: parseCheckoutMetaTimestamp(rowValues[5]),
    issuedByEmail: String(rowValues[6] || '').trim(),
    finalizedAt: parseCheckoutMetaTimestamp(rowValues[7]),
    updatedAt: parseCheckoutMetaTimestamp(rowValues[8])
  };
  return metaPack.map[sessionKey];
}

function buildCheckoutQrPayload(seasonAlias, sessionKey, code) {
  const alias = String(seasonAlias || '').trim();
  const key = String(sessionKey || '').trim();
  const token = String(code || '').trim();
  return `CC_CHECKOUT|${alias}|${key}|${token}`;
}

function resolveCheckoutTargetSessionForIssue(sessions, requestedSessionKey, now) {
  const list = Array.isArray(sessions) ? sessions.slice() : [];
  const key = String(requestedSessionKey || '').trim();
  if (key) {
    return list.find(item => item.sessionKey === key) || null;
  }

  const currentTime = now instanceof Date ? now : new Date();
  let candidate = null;
  list.forEach(session => {
    const bounds = getCheckoutWindowBounds(session);
    if (!bounds.openTime || !bounds.closeTime) return;
    if (currentTime < bounds.openTime || currentTime > bounds.closeTime) return;
    if (!candidate || session.startTime.getTime() > candidate.startTime.getTime()) {
      candidate = session;
    }
  });

  if (candidate) return candidate;

  let next = null;
  list.forEach(session => {
    if (session.startTime < currentTime) return;
    if (!next || session.startTime.getTime() < next.startTime.getTime()) {
      next = session;
    }
  });
  if (next) return next;

  let latest = null;
  list.forEach(session => {
    if (!latest || session.startTime.getTime() > latest.startTime.getTime()) {
      latest = session;
    }
  });
  return latest;
}

function resolveCheckoutTargetSessionForSubmit(sessions, requestedSessionKey, now) {
  const list = Array.isArray(sessions) ? sessions.slice() : [];
  const key = String(requestedSessionKey || '').trim();
  if (key) {
    return list.find(item => item.sessionKey === key) || null;
  }

  const currentTime = now instanceof Date ? now : new Date();
  let candidate = null;
  list.forEach(session => {
    const bounds = getCheckoutWindowBounds(session);
    if (!bounds.openTime || !bounds.closeTime) return;
    if (currentTime < bounds.openTime || currentTime > bounds.closeTime) return;
    if (!candidate || session.startTime.getTime() > candidate.startTime.getTime()) {
      candidate = session;
    }
  });
  return candidate;
}

function isCheckoutRequiredMeta(meta) {
  return !!(meta && meta.enabled && String(meta.code || '').trim());
}

function findActiveCheckoutSession(sessions, checkoutMetaMap, now) {
  const list = Array.isArray(sessions) ? sessions : [];
  const metaMap = checkoutMetaMap || {};
  const currentTime = now instanceof Date ? now : new Date();
  let active = null;

  list.forEach(session => {
    if (!session || !session.sessionKey) return;
    const meta = metaMap[session.sessionKey];
    if (!isCheckoutRequiredMeta(meta)) return;
    const bounds = getCheckoutWindowBounds(session);
    if (!bounds.openTime || !bounds.closeTime) return;
    if (currentTime < bounds.openTime || currentTime > bounds.closeTime) return;
    if (!active || session.startTime.getTime() > active.startTime.getTime()) {
      active = session;
    }
  });

  return active;
}

function getCheckoutMetaMapForSeason(seasonSheetName, options) {
  const pack = getCheckoutMetaPack(seasonSheetName, options);
  return pack.map || {};
}

function getCheckoutEventRowsForSeason(seasonSheetName, sessionKeySet) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const eventSheet = ss.getSheetByName(CHECKOUT_EVENT_SHEET_NAME);
  if (!eventSheet) return [];

  const lastRow = eventSheet.getLastRow();
  if (lastRow < 2) return [];

  const values = eventSheet.getRange(2, 1, lastRow - 1, CHECKOUT_EVENT_HEADERS.length).getValues();
  const set = sessionKeySet && typeof sessionKeySet === 'object' ? sessionKeySet : null;
  const rows = [];

  values.forEach((row, idx) => {
    const season = String(row[0] || '').trim();
    const key = String(row[1] || '').trim();
    if (!season || !key) return;
    if (season !== seasonSheetName) return;
    if (set && !set[key]) return;

    rows.push({
      rowIndex: idx + 2,
      seasonSheet: season,
      sessionKey: key,
      phone: normalizePhone(row[2]),
      method: String(row[3] || '').trim(),
      submittedAt: parseCheckoutMetaTimestamp(row[4]),
      codeInput: String(row[5] || '').trim(),
      status: String(row[6] || '').trim().toLowerCase(),
      undoToken: String(row[7] || '').trim(),
      undoneAt: parseCheckoutMetaTimestamp(row[8]),
      meta: String(row[9] || '').trim()
    });
  });

  return rows;
}

function buildCheckoutCompletionMapBySession(eventRows) {
  const rows = Array.isArray(eventRows) ? eventRows : [];
  const bySession = {};

  rows.forEach(item => {
    if (!item || item.status !== 'completed' || !item.phone || !item.sessionKey) return;
    if (!bySession[item.sessionKey]) {
      bySession[item.sessionKey] = {};
    }

    const existing = bySession[item.sessionKey][item.phone];
    const currentMs = item.submittedAt instanceof Date ? item.submittedAt.getTime() : 0;
    const existingMs = existing && existing.submittedAt instanceof Date ? existing.submittedAt.getTime() : 0;
    if (!existing || currentMs >= existingMs) {
      bySession[item.sessionKey][item.phone] = item;
    }
  });

  return bySession;
}

function parseCheckoutEventMeta(metaRaw) {
  const text = String(metaRaw || '').trim();
  if (!text) return {};

  if (text.indexOf('{') === 0 && text.lastIndexOf('}') === text.length - 1) {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    } catch (error) {
      // fall through
    }
  }

  const out = {};
  text.split(';').forEach(token => {
    const pair = String(token || '').trim();
    if (!pair) return;
    const idx = pair.indexOf('=');
    if (idx < 0) {
      out[pair] = true;
      return;
    }
    const key = String(pair.slice(0, idx)).trim();
    const value = String(pair.slice(idx + 1)).trim();
    if (!key) return;
    out[key] = value;
  });
  return out;
}

function buildCheckoutAutoAbsentMapBySession(eventRows) {
  const rows = Array.isArray(eventRows) ? eventRows : [];
  const bySession = {};

  rows.forEach(item => {
    if (!item || item.status !== 'auto_absent' || !item.phone || !item.sessionKey) return;
    if (!bySession[item.sessionKey]) {
      bySession[item.sessionKey] = {};
    }

    const existing = bySession[item.sessionKey][item.phone];
    const currentMs = item.submittedAt instanceof Date ? item.submittedAt.getTime() : 0;
    const existingMs = existing && existing.submittedAt instanceof Date ? existing.submittedAt.getTime() : 0;
    if (!existing || currentMs >= existingMs) {
      bySession[item.sessionKey][item.phone] = item;
    }
  });

  return bySession;
}

function getCheckoutPreviousAttendTextFromAutoAbsentEvent(eventRow) {
  if (!eventRow) return '';
  const meta = parseCheckoutEventMeta(eventRow.meta);
  const candidates = [
    meta.previousAttend,
    meta.previousAttendTime,
    meta.previous_attend,
    meta.previous_attend_time
  ];
  for (let i = 0; i < candidates.length; i++) {
    const text = String(candidates[i] || '').trim();
    if (text) return text;
  }
  return '';
}

function getCheckoutAttendanceStatusLabel(status) {
  switch (String(status || '').trim()) {
    case 'on_time': return '출석';
    case 'late': return '지각';
    case 'absent': return '결석';
    case 'excused': return '유고';
    case 'future': return '예정';
    default: return '미기록';
  }
}

function appendCheckoutEventRow(payload) {
  const eventSheet = ensureCheckoutEventSheet();
  const startRow = eventSheet.getLastRow() + 1;
  const row = [
    String(payload.seasonSheet || '').trim(),
    String(payload.sessionKey || '').trim(),
    normalizePhone(payload.phone),
    String(payload.method || '').trim(),
    payload.submittedAt instanceof Date ? payload.submittedAt : new Date(),
    String(payload.codeInput || '').trim(),
    String(payload.status || '').trim().toLowerCase(),
    String(payload.undoToken || '').trim(),
    payload.undoneAt instanceof Date ? payload.undoneAt : '',
    String(payload.meta || '').trim()
  ];
  eventSheet.getRange(startRow, 1, 1, CHECKOUT_EVENT_HEADERS.length).setValues([row]);
  return startRow;
}

function updateCheckoutEventRowStatus(rowIndex, nextStatus, options) {
  const opts = options || {};
  const eventSheet = ensureCheckoutEventSheet();
  if (!rowIndex || rowIndex < 2) {
    return;
  }

  eventSheet.getRange(rowIndex, 7).setValue(String(nextStatus || '').trim().toLowerCase());
  if (opts.undoneAt instanceof Date) {
    eventSheet.getRange(rowIndex, 9).setValue(opts.undoneAt);
  }
  if (opts.meta !== undefined) {
    eventSheet.getRange(rowIndex, 10).setValue(String(opts.meta || '').trim());
  }
}

function issueCheckoutAttendanceTicket(payload) {
  const token = Utilities.getUuid().replace(/-/g, '');
  const cache = CacheService.getScriptCache();
  cache.put(
    CHECKOUT_ATTENDANCE_TICKET_CACHE_PREFIX + token,
    JSON.stringify({
      seasonAlias: String(payload.seasonAlias || '').trim(),
      sessionKey: String(payload.sessionKey || '').trim(),
      phone: normalizePhone(payload.phone),
      issuedAt: new Date().getTime()
    }),
    CHECKOUT_ATTENDANCE_TICKET_TTL_SECONDS
  );
  return token;
}

function readCheckoutAttendanceTicket(token) {
  const key = String(token || '').trim();
  if (!key) return null;
  const cache = CacheService.getScriptCache();
  const raw = cache.get(CHECKOUT_ATTENDANCE_TICKET_CACHE_PREFIX + key);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return {
      seasonAlias: String(parsed.seasonAlias || '').trim(),
      sessionKey: String(parsed.sessionKey || '').trim(),
      phone: normalizePhone(parsed.phone),
      issuedAt: Number(parsed.issuedAt || 0)
    };
  } catch (error) {
    return null;
  }
}

function issueCheckoutUndoToken(payload) {
  const token = Utilities.getUuid().replace(/-/g, '');
  const cache = CacheService.getScriptCache();
  cache.put(
    CHECKOUT_UNDO_CACHE_PREFIX + token,
    JSON.stringify({
      seasonAlias: String(payload.seasonAlias || '').trim(),
      seasonSheet: String(payload.seasonSheet || '').trim(),
      sessionKey: String(payload.sessionKey || '').trim(),
      phone: normalizePhone(payload.phone),
      eventRowIndex: Number(payload.eventRowIndex || 0),
      expiresAt: new Date().getTime() + CHECKOUT_UNDO_WINDOW_SECONDS * 1000
    }),
    Math.max(CHECKOUT_UNDO_WINDOW_SECONDS + 20, 60)
  );
  return token;
}

function readCheckoutUndoToken(token) {
  const key = String(token || '').trim();
  if (!key) return null;
  const cache = CacheService.getScriptCache();
  const raw = cache.get(CHECKOUT_UNDO_CACHE_PREFIX + key);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return {
      seasonAlias: String(parsed.seasonAlias || '').trim(),
      seasonSheet: String(parsed.seasonSheet || '').trim(),
      sessionKey: String(parsed.sessionKey || '').trim(),
      phone: normalizePhone(parsed.phone),
      eventRowIndex: Number(parsed.eventRowIndex || 0),
      expiresAt: Number(parsed.expiresAt || 0)
    };
  } catch (error) {
    return null;
  }
}

function clearCheckoutUndoToken(token) {
  const key = String(token || '').trim();
  if (!key) return;
  CacheService.getScriptCache().remove(CHECKOUT_UNDO_CACHE_PREFIX + key);
}

function buildCheckoutNoteLine(prefix, date, message) {
  const when = date instanceof Date ? formatDateTime(date) : formatDateTime(new Date());
  const text = String(message || '').trim();
  return `[${prefix}] ${when}${text ? ` - ${text}` : ''}`;
}

function appendCheckoutNote(existingNote, line) {
  const prev = String(existingNote || '').trim();
  const next = String(line || '').trim();
  if (!next) return prev;
  if (!prev) return next;
  if (prev.indexOf(next) >= 0) return prev;
  return `${prev}\n${next}`;
}

function maybeFinalizeCheckoutForSeasonSheet(sheet, sessions, now, options) {
  const opts = options || {};
  const seasonSheetName = sheet.getName();
  const currentTime = now instanceof Date ? now : new Date();
  const sessionMap = {};
  (Array.isArray(sessions) ? sessions : []).forEach(item => {
    if (!item || !item.sessionKey) return;
    sessionMap[item.sessionKey] = item;
  });

  const runInternal = () => {
    const metaPack = getCheckoutMetaPack(seasonSheetName, { createIfMissing: false });
    if (!metaPack.metaSheet) {
      return { finalizedSessionCount: 0, autoAbsentCount: 0 };
    }

    const pending = [];
    Object.keys(metaPack.map).forEach(sessionKey => {
      const meta = metaPack.map[sessionKey];
      if (!isCheckoutRequiredMeta(meta)) return;
      if (meta.finalizedAt instanceof Date && !isNaN(meta.finalizedAt.getTime())) return;
      const session = sessionMap[sessionKey];
      if (!session) return;
      const bounds = getCheckoutWindowBounds(session);
      if (!bounds.closeTime) return;
      if (currentTime <= bounds.closeTime) return;
      pending.push({
        session: session,
        meta: meta
      });
    });

    if (pending.length === 0) {
      return { finalizedSessionCount: 0, autoAbsentCount: 0 };
    }

    let finalizedSessionCount = 0;
    let autoAbsentCount = 0;

    pending.forEach(item => {
      const result = finalizeCheckoutSessionAsAbsent(sheet, item.session, currentTime);
      autoAbsentCount += Number(result && result.updatedCount || 0);
      upsertCheckoutMetaRecord(metaPack, seasonSheetName, item.session.sessionKey, {
        enabled: true,
        code: item.meta.code,
        codeDigits: item.meta.codeDigits,
        issuedAt: item.meta.issuedAt || currentTime,
        issuedByEmail: item.meta.issuedByEmail || '',
        finalizedAt: currentTime,
        updatedAt: currentTime
      });
      finalizedSessionCount++;
    });

    return {
      finalizedSessionCount: finalizedSessionCount,
      autoAbsentCount: autoAbsentCount
    };
  };

  if (opts.alreadyLocked) {
    return runInternal();
  }

  const lock = LockService.getDocumentLock();
  lock.waitLock(5000);
  try {
    return runInternal();
  } finally {
    lock.releaseLock();
  }
}

function finalizeCheckoutSessionAsAbsent(sheet, session, now) {
  const currentTime = now instanceof Date ? now : new Date();
  const values = sheet.getDataRange().getValues();
  const memberSchema = resolveMemberSchemaFromHeaders(values[0] || []);
  const sessionSet = {};
  sessionSet[session.sessionKey] = true;
  const eventRows = getCheckoutEventRowsForSeason(sheet.getName(), sessionSet);
  const completionBySession = buildCheckoutCompletionMapBySession(eventRows);
  const completedByPhone = completionBySession[session.sessionKey] || {};

  let updatedCount = 0;
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const phone = normalizePhone(getMemberFieldValue(row, memberSchema, 'phone'));
    if (!phone) continue;
    if (completedByPhone[phone]) continue;

    const cellValue = row[session.colIndex];
    const status = getAttendanceDetailType(cellValue, session, currentTime);
    if (status !== 'on_time' && status !== 'late') {
      continue;
    }

    const parsedAttendTime = parseAttendanceTime(cellValue);
    const previousAttendText = parsedAttendTime
      ? formatDateTime(parsedAttendTime)
      : String(cellValue || '').trim();

    const targetRange = sheet.getRange(i + 1, session.colIndex + 1);
    const existingNote = targetRange.getNote();
    let nextNote = existingNote;
    nextNote = appendCheckoutNote(nextNote, buildCheckoutNoteLine('퇴실미완료 자동결석', currentTime, `회차=${session.sessionKey}`));
    if (previousAttendText) {
      nextNote = appendCheckoutNote(nextNote, `기존 입실 기록: ${previousAttendText}`);
    }

    targetRange.setValue('');
    targetRange.setBackground(ABSENT_COLOR);
    targetRange.setNote(nextNote);

    appendCheckoutEventRow({
      seasonSheet: sheet.getName(),
      sessionKey: session.sessionKey,
      phone: phone,
      method: 'auto_finalize',
      submittedAt: currentTime,
      codeInput: '',
      status: 'auto_absent',
      undoToken: '',
      undoneAt: '',
      meta: `missing_checkout;previousAttend=${previousAttendText || ''}`
    });
    updatedCount++;
  }

  return {
    updatedCount: updatedCount
  };
}

function checkoutChallengeIssue(params, adminContext) {
  const seasonName = String(params && params.season || '').trim();
  if (!seasonName) {
    return { success: false, message: 'season 파라미터가 필요합니다.' };
  }

  const lock = LockService.getDocumentLock();
  lock.waitLock(5000);
  try {
    const info = resolveSeasonSheetInfo(seasonName);
    const now = new Date();
    const sessions = collectSessionsFromSheet(info.sheet, { createMissingMeta: false });
    const targetSession = resolveCheckoutTargetSessionForIssue(sessions, params && params.sessionKey, now);
    if (!targetSession) {
      return { success: false, message: '퇴실 코드를 발급할 회차를 찾지 못했습니다.' };
    }

    const bounds = getCheckoutWindowBounds(targetSession);
    if (!bounds.closeTime) {
      return { success: false, message: '퇴실 마감 시각이 설정되지 않은 회차입니다.' };
    }

    const codeDigits = getCheckoutCodeDigits(params && params.codeDigits);
    const code = generateCheckoutNumericCode(codeDigits);
    const seasonSheetName = info.sheet.getName();
    const actorEmail = String(adminContext && adminContext.email || '').trim();

    const metaPack = getCheckoutMetaPack(seasonSheetName, { createIfMissing: true });
    upsertCheckoutMetaRecord(metaPack, seasonSheetName, targetSession.sessionKey, {
      enabled: true,
      code: code,
      codeDigits: codeDigits,
      issuedAt: now,
      issuedByEmail: actorEmail,
      finalizedAt: '',
      updatedAt: now
    });

    return {
      success: true,
      message: '퇴실 인증 코드가 생성되었습니다.',
      seasonAlias: info.seasonAlias,
      currentSheet: info.currentSheet,
      sessionKey: targetSession.sessionKey,
      code: code,
      codeDigits: codeDigits,
      checkoutOpenTime: bounds.openTime ? bounds.openTime.getTime() : null,
      checkoutCloseTime: bounds.closeTime.getTime(),
      checkoutOpenOffsetMin: bounds.offsetMin,
      checkoutOpenLabel: bounds.openTime ? formatDateTimeMinute(bounds.openTime) : '',
      checkoutCloseLabel: formatDateTimeMinute(bounds.closeTime),
      qrPayload: buildCheckoutQrPayload(info.seasonAlias, targetSession.sessionKey, code)
    };
  } finally {
    lock.releaseLock();
  }
}

function checkoutPendingList(params) {
  const seasonName = String(params && params.season || '').trim();
  const requestedSessionKey = String(params && params.sessionKey || '').trim();
  if (!seasonName) {
    return { success: false, message: 'season 파라미터가 필요합니다.' };
  }
  if (!requestedSessionKey) {
    return { success: false, message: 'sessionKey 파라미터가 필요합니다.' };
  }

  try {
    const info = resolveSeasonSheetInfo(seasonName);
    const sheet = info.sheet;
    const now = new Date();
    const sessions = collectSessionsFromSheet(sheet, { createMissingMeta: false });
    maybeFinalizeCheckoutForSeasonSheet(sheet, sessions, now);

    const targetSession = sessions.find(item => item && item.sessionKey === requestedSessionKey);
    if (!targetSession) {
      return { success: false, message: '요청한 회차를 찾을 수 없습니다.' };
    }

    const seasonSheetName = sheet.getName();
    const checkoutMetaMap = getCheckoutMetaMapForSeason(seasonSheetName, { createIfMissing: false });
    const checkoutMeta = checkoutMetaMap[targetSession.sessionKey];
    const checkoutRequired = isCheckoutRequiredMeta(checkoutMeta);
    const checkoutBounds = getCheckoutWindowBounds(targetSession);

    if (!checkoutRequired) {
      return {
        success: true,
        seasonAlias: info.seasonAlias,
        currentSheet: info.currentSheet,
        sessionKey: targetSession.sessionKey,
        checkoutRequired: false,
        checkoutOpenTime: checkoutBounds.openTime ? checkoutBounds.openTime.getTime() : null,
        checkoutCloseTime: checkoutBounds.closeTime ? checkoutBounds.closeTime.getTime() : null,
        checkoutOpenLabel: checkoutBounds.openTime ? formatDateTimeMinute(checkoutBounds.openTime) : '',
        checkoutCloseLabel: checkoutBounds.closeTime ? formatDateTimeMinute(checkoutBounds.closeTime) : '',
        checkoutOpenOffsetMin: checkoutBounds.offsetMin,
        summary: {
          pendingCount: 0,
          recoverableCount: 0,
          autoFinalizedCount: 0,
          currentlyRecordedCount: 0,
          completedCount: 0
        },
        pendingMembers: []
      };
    }

    const sessionKeySet = {};
    sessionKeySet[targetSession.sessionKey] = true;
    const eventRows = getCheckoutEventRowsForSeason(seasonSheetName, sessionKeySet);
    const completionBySession = buildCheckoutCompletionMapBySession(eventRows);
    const autoAbsentBySession = buildCheckoutAutoAbsentMapBySession(eventRows);
    const completedByPhone = completionBySession[targetSession.sessionKey] || {};
    const autoAbsentByPhone = autoAbsentBySession[targetSession.sessionKey] || {};

    const values = sheet.getDataRange().getValues();
    const memberSchema = resolveMemberSchemaFromHeaders(values[0] || []);
    const pendingMembers = [];
    let recoverableCount = 0;
    let autoFinalizedCount = 0;
    let currentlyRecordedCount = 0;

    for (let i = 1; i < values.length; i++) {
      const row = values[i];
      const phone = normalizePhone(getMemberFieldValue(row, memberSchema, 'phone'));
      if (!phone) continue;
      if (completedByPhone[phone]) continue;

      const member = readMemberFromRow(row, memberSchema);
      const cellValue = row[targetSession.colIndex];
      const status = getAttendanceDetailType(cellValue, targetSession, now);
      const attendTime = parseAttendanceTime(cellValue);
      const autoAbsentEvent = autoAbsentByPhone[phone] || null;

      if (status !== 'on_time' && status !== 'late' && !autoAbsentEvent) {
        continue;
      }

      const previousAttendText = getCheckoutPreviousAttendTextFromAutoAbsentEvent(autoAbsentEvent);
      const parsedPreviousAttend = previousAttendText ? parseAttendanceTime(previousAttendText) : null;
      const recoveredStatus = parsedPreviousAttend ? getAttendanceType(parsedPreviousAttend, targetSession) : '';
      const recoverable = !!(
        autoAbsentEvent
        && parsedPreviousAttend
        && (recoveredStatus === 'on_time' || recoveredStatus === 'late')
      );

      const effectiveStatus = autoAbsentEvent
        ? (recoverable ? recoveredStatus : status)
        : status;
      const effectiveAttendTime = autoAbsentEvent
        ? (parsedPreviousAttend ? formatDateTime(parsedPreviousAttend) : previousAttendText)
        : (attendTime ? formatDateTime(attendTime) : '');

      if (autoAbsentEvent) {
        autoFinalizedCount++;
      } else {
        currentlyRecordedCount++;
      }
      if (recoverable) {
        recoverableCount++;
      }

      pendingMembers.push({
        name: member.name,
        season: member.season,
        grade: member.seasonLabel || formatSeasonLabel(member.season),
        seasonLabel: member.seasonLabel || formatSeasonLabel(member.season),
        phone: phone,
        sessionKey: targetSession.sessionKey,
        attendanceType: effectiveStatus,
        attendanceLabel: getCheckoutAttendanceStatusLabel(effectiveStatus),
        attendTime: effectiveAttendTime || '',
        autoFinalized: !!autoAbsentEvent,
        recoverable: recoverable,
        previousAttendTime: previousAttendText || '',
        autoFinalizedAt: autoAbsentEvent && autoAbsentEvent.submittedAt
          ? formatDateTime(autoAbsentEvent.submittedAt)
          : '',
        note: autoAbsentEvent
          ? '퇴실 미완료 자동결석 대상'
          : '입실 기록은 있으나 퇴실 미완료'
      });
    }

    pendingMembers.sort((a, b) => {
      if (!!a.autoFinalized !== !!b.autoFinalized) {
        return a.autoFinalized ? -1 : 1;
      }
      const gradeCompare = String(a.seasonLabel || '').localeCompare(String(b.seasonLabel || ''), 'ko');
      if (gradeCompare !== 0) return gradeCompare;
      const nameCompare = String(a.name || '').localeCompare(String(b.name || ''), 'ko');
      if (nameCompare !== 0) return nameCompare;
      return String(a.phone || '').localeCompare(String(b.phone || ''), 'ko');
    });

    return {
      success: true,
      seasonAlias: info.seasonAlias,
      currentSheet: info.currentSheet,
      sessionKey: targetSession.sessionKey,
      checkoutRequired: checkoutRequired,
      checkoutOpenTime: checkoutBounds.openTime ? checkoutBounds.openTime.getTime() : null,
      checkoutCloseTime: checkoutBounds.closeTime ? checkoutBounds.closeTime.getTime() : null,
      checkoutOpenLabel: checkoutBounds.openTime ? formatDateTimeMinute(checkoutBounds.openTime) : '',
      checkoutCloseLabel: checkoutBounds.closeTime ? formatDateTimeMinute(checkoutBounds.closeTime) : '',
      checkoutOpenOffsetMin: checkoutBounds.offsetMin,
      summary: {
        pendingCount: pendingMembers.length,
        recoverableCount: recoverableCount,
        autoFinalizedCount: autoFinalizedCount,
        currentlyRecordedCount: currentlyRecordedCount,
        completedCount: Object.keys(completedByPhone).length
      },
      pendingMembers: pendingMembers
    };
  } catch (error) {
    return {
      success: false,
      message: error && error.message ? error.message : '퇴실 미완료 목록 조회 중 오류가 발생했습니다.'
    };
  }
}

function checkoutManualCompleteBatch(params, adminContext) {
  const seasonName = String(params && params.season || '').trim();
  const sessionKey = String(params && params.sessionKey || '').trim();
  const rawItems = parseItemsJson(params && (params.itemsJson || params.items) || '[]');
  const actorEmail = String(adminContext && adminContext.email || '').trim();

  if (!seasonName || !sessionKey) {
    return { success: false, message: 'season, sessionKey 파라미터가 필요합니다.' };
  }
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { success: false, message: '처리할 대상(itemsJson)이 없습니다.' };
  }

  const normalizedItems = [];
  const seenPhoneMap = {};
  rawItems.forEach(item => {
    const obj = item && typeof item === 'object' ? item : {};
    const cleanedPhone = normalizePhone(obj.phone);
    if (!cleanedPhone) return;
    if (seenPhoneMap[cleanedPhone]) return;
    seenPhoneMap[cleanedPhone] = true;
    normalizedItems.push({
      phone: cleanedPhone
    });
  });

  if (normalizedItems.length === 0) {
    return { success: false, message: '유효한 전화번호 대상이 없습니다.' };
  }

  const lock = LockService.getDocumentLock();
  lock.waitLock(5000);
  try {
    const info = resolveSeasonSheetInfo(seasonName);
    const sheet = info.sheet;
    const seasonSheetName = sheet.getName();
    const now = new Date();
    const sessions = collectSessionsFromSheet(sheet, { createMissingMeta: false });
    maybeFinalizeCheckoutForSeasonSheet(sheet, sessions, now, { alreadyLocked: true });

    const targetSession = sessions.find(item => item && item.sessionKey === sessionKey);
    if (!targetSession) {
      return { success: false, message: '회차를 찾을 수 없습니다.' };
    }

    const checkoutMetaMap = getCheckoutMetaMapForSeason(seasonSheetName, { createIfMissing: false });
    const checkoutMeta = checkoutMetaMap[targetSession.sessionKey];
    if (!isCheckoutRequiredMeta(checkoutMeta)) {
      return { success: false, message: '해당 회차는 퇴실 인증 대상이 아닙니다.' };
    }

    const sessionKeySet = {};
    sessionKeySet[targetSession.sessionKey] = true;
    const eventRows = getCheckoutEventRowsForSeason(seasonSheetName, sessionKeySet);
    const completionBySession = buildCheckoutCompletionMapBySession(eventRows);
    const autoAbsentBySession = buildCheckoutAutoAbsentMapBySession(eventRows);
    const completedByPhone = completionBySession[targetSession.sessionKey] || {};
    const autoAbsentByPhone = autoAbsentBySession[targetSession.sessionKey] || {};

    const values = sheet.getDataRange().getValues();
    const memberSchema = resolveMemberSchemaFromHeaders(values[0] || []);
    const summary = {
      requested: normalizedItems.length,
      completed: 0,
      restoredAttendance: 0,
      skipped: 0,
      failed: 0
    };
    const results = [];

    normalizedItems.forEach(item => {
      const phone = item.phone;
      const rowResult = {
        phone: phone,
        status: 'failed',
        message: ''
      };

      try {
        if (!isValidPhoneNumber(phone)) {
          summary.failed++;
          rowResult.reasonCode = 'INVALID_PHONE';
          rowResult.message = '전화번호 형식이 올바르지 않습니다.';
          results.push(rowResult);
          return;
        }

        const lookup = findMemberRowIndexByPhone(values, memberSchema, phone);
        if (lookup.duplicateRowIndexes.length > 0) {
          summary.failed++;
          rowResult.reasonCode = 'DUPLICATE_PHONE';
          rowResult.message = '동일 전화번호 중복 행이 있어 처리할 수 없습니다.';
          results.push(rowResult);
          return;
        }

        if (completedByPhone[phone]) {
          summary.skipped++;
          rowResult.status = 'skipped';
          rowResult.reasonCode = 'ALREADY_COMPLETED';
          rowResult.message = '이미 퇴실 완료된 대상입니다.';
          results.push(rowResult);
          return;
        }

        const rowIndex = lookup.rowIndex;
        if (rowIndex < 0) {
          summary.failed++;
          rowResult.reasonCode = 'MEMBER_NOT_FOUND';
          rowResult.message = '해당 전화번호의 회원을 찾을 수 없습니다.';
          results.push(rowResult);
          return;
        }

        const member = readMemberFromRow(values[rowIndex], memberSchema);
        rowResult.name = member.name;
        rowResult.grade = member.seasonLabel || formatSeasonLabel(member.season);
        rowResult.seasonLabel = member.seasonLabel || formatSeasonLabel(member.season);

        const targetRange = sheet.getRange(rowIndex + 1, targetSession.colIndex + 1);
        const currentCellValue = targetRange.getValue();
        let attendStatus = getAttendanceDetailType(currentCellValue, targetSession, now);
        let restored = false;
        let restoredFrom = '';

        if (attendStatus !== 'on_time' && attendStatus !== 'late') {
          const autoAbsentEvent = autoAbsentByPhone[phone];
          const previousAttendText = getCheckoutPreviousAttendTextFromAutoAbsentEvent(autoAbsentEvent);
          const restoredAttendAt = previousAttendText ? parseAttendanceTime(previousAttendText) : null;
          const restoredStatus = restoredAttendAt ? getAttendanceType(restoredAttendAt, targetSession) : '';

          if (!autoAbsentEvent || !restoredAttendAt || (restoredStatus !== 'on_time' && restoredStatus !== 'late')) {
            summary.failed++;
            rowResult.reasonCode = 'MISSING_ATTENDANCE_RECORD';
            rowResult.message = '복구 가능한 입실 기록이 없어 퇴실 완료 처리할 수 없습니다.';
            results.push(rowResult);
            return;
          }

          const restoredText = formatDateTime(restoredAttendAt);
          targetRange.setValue(restoredText);
          targetRange.setBackground(restoredStatus === 'on_time' ? ON_TIME_COLOR : LATE_COLOR);
          targetRange.setNote(appendCheckoutNote(
            targetRange.getNote(),
            buildCheckoutNoteLine('퇴실수동완료 복구', now, `자동결석 복구(이전입실=${restoredText})`)
          ));

          values[rowIndex][targetSession.colIndex] = restoredText;
          attendStatus = restoredStatus;
          restored = true;
          restoredFrom = restoredText;
        }

        if (attendStatus !== 'on_time' && attendStatus !== 'late') {
          summary.failed++;
          rowResult.reasonCode = 'INVALID_ATTENDANCE_STATUS';
          rowResult.message = '입실 상태가 출석/지각이 아니어서 퇴실 완료 처리할 수 없습니다.';
          results.push(rowResult);
          return;
        }

        const submittedAt = new Date();
        appendCheckoutEventRow({
          seasonSheet: seasonSheetName,
          sessionKey: targetSession.sessionKey,
          phone: phone,
          method: 'admin_manual_complete',
          submittedAt: submittedAt,
          codeInput: '[manual]',
          status: 'completed',
          undoToken: '',
          undoneAt: '',
          meta: `mode=manual_complete;actor=${actorEmail || 'admin'};restored=${restored ? '1' : '0'}`
        });

        targetRange.setNote(appendCheckoutNote(
          targetRange.getNote(),
          buildCheckoutNoteLine(
            '퇴실수동완료',
            submittedAt,
            `처리자=${actorEmail || 'admin'}${restored ? ';입실복구' : ''}`
          )
        ));

        completedByPhone[phone] = {
          submittedAt: submittedAt,
          method: 'admin_manual_complete'
        };

        summary.completed++;
        if (restored) {
          summary.restoredAttendance++;
        }
        rowResult.status = 'completed';
        rowResult.reasonCode = restored ? 'RESTORED_AND_COMPLETED' : 'COMPLETED';
        rowResult.message = restored
          ? '입실 기록 복구 후 퇴실 완료 처리했습니다.'
          : '퇴실 완료 처리했습니다.';
        rowResult.completedAt = formatDateTime(submittedAt);
        rowResult.restoredAttendance = restored;
        rowResult.restoredFrom = restoredFrom;
        results.push(rowResult);
      } catch (itemError) {
        summary.failed++;
        rowResult.reasonCode = 'INTERNAL_ITEM_ERROR';
        rowResult.message = itemError && itemError.message
          ? itemError.message
          : '처리 중 오류가 발생했습니다.';
        results.push(rowResult);
      }
    });

    return {
      success: true,
      message: '퇴실 수동 완료 처리가 완료되었습니다.',
      seasonAlias: info.seasonAlias,
      currentSheet: info.currentSheet,
      sessionKey: targetSession.sessionKey,
      processedAt: formatDateTime(now),
      summary: summary,
      results: results
    };
  } finally {
    lock.releaseLock();
  }
}

function checkoutSubmit(params) {
  const seasonName = String(params && params.season || '').trim();
  if (!seasonName) {
    return { success: false, message: 'season 파라미터가 필요합니다.' };
  }

  const lock = LockService.getDocumentLock();
  lock.waitLock(5000);
  try {
    const info = resolveSeasonSheetInfo(seasonName);
    const sheet = info.sheet;
    const seasonSheetName = sheet.getName();
    const now = new Date();
    const sessions = collectSessionsFromSheet(sheet, { createMissingMeta: false });
    maybeFinalizeCheckoutForSeasonSheet(sheet, sessions, now, { alreadyLocked: true });

    const requestedSessionKey = String(params.sessionKey || '').trim();
    const targetSession = resolveCheckoutTargetSessionForSubmit(sessions, requestedSessionKey, now);
    if (!targetSession) {
      return { success: false, message: '퇴실 처리 가능한 회차가 없습니다.' };
    }

    const bounds = getCheckoutWindowBounds(targetSession);
    if (bounds.openTime && now < bounds.openTime) {
      return {
        success: false,
        message: `아직 퇴실 인증 오픈 전입니다. (${formatDateTimeMinute(bounds.openTime)}부터 가능)`,
        sessionKey: targetSession.sessionKey
      };
    }
    if (bounds.closeTime && now > bounds.closeTime) {
      return {
        success: false,
        message: '퇴실 인증 가능 시간이 종료되었습니다.',
        sessionKey: targetSession.sessionKey
      };
    }

    const metaPack = getCheckoutMetaPack(seasonSheetName, { createIfMissing: false });
    const checkoutMeta = metaPack.map[targetSession.sessionKey];
    if (!isCheckoutRequiredMeta(checkoutMeta)) {
      return {
        success: false,
        message: '운영진이 퇴실 인증 코드를 아직 발급하지 않았습니다.',
        sessionKey: targetSession.sessionKey
      };
    }

    const ticketToken = String(params.ticket || '').trim();
    let phone = '';
    let method = String(params.method || '').trim().toLowerCase() || 'manual_code';

    if (ticketToken) {
      const ticket = readCheckoutAttendanceTicket(ticketToken);
      if (!ticket) {
        return { success: false, message: '자동 퇴실 캐시가 만료되었습니다. 전화번호 + 코드를 입력해 주세요.' };
      }
      if (ticket.seasonAlias && ticket.seasonAlias !== info.seasonAlias) {
        return { success: false, message: '자동 퇴실 캐시의 시즌 정보가 일치하지 않습니다.' };
      }
      if (ticket.sessionKey && ticket.sessionKey !== targetSession.sessionKey) {
        return { success: false, message: '자동 퇴실 캐시의 회차 정보가 일치하지 않습니다.' };
      }
      phone = normalizePhone(ticket.phone);
      method = 'auto_cache';
    } else {
      phone = normalizePhone(params.phone);
      const submittedCode = String(params.code || '').replace(/\D/g, '');
      if (!submittedCode) {
        return { success: false, message: '퇴실 인증 코드가 필요합니다.' };
      }
      if (submittedCode !== checkoutMeta.code) {
        return { success: false, message: '퇴실 인증 코드가 일치하지 않습니다.' };
      }
    }

    if (!isValidPhoneNumber(phone)) {
      return { success: false, message: '올바른 전화번호 형식이 아닙니다. (예: 01012345678)' };
    }

    const values = sheet.getDataRange().getValues();
    const memberSchema = resolveMemberSchemaFromHeaders(values[0] || []);
    const lookup = findMemberRowIndexByPhone(values, memberSchema, phone);
    if (lookup.duplicateRowIndexes.length > 0) {
      return buildPhoneSuperkeyDuplicateResult(lookup.duplicateRowIndexes);
    }
    if (lookup.rowIndex < 0) {
      return { success: false, message: '등록되지 않은 전화번호입니다.' };
    }

    const member = readMemberFromRow(values[lookup.rowIndex], memberSchema);
    const attendCellValue = values[lookup.rowIndex][targetSession.colIndex];
    const attendStatus = getAttendanceDetailType(attendCellValue, targetSession, now);
    if (attendStatus !== 'on_time' && attendStatus !== 'late') {
      return {
        success: false,
        message: '입실 기록이 없어 퇴실 처리할 수 없습니다.',
        sessionKey: targetSession.sessionKey
      };
    }

    const sessionSet = {};
    sessionSet[targetSession.sessionKey] = true;
    const eventRows = getCheckoutEventRowsForSeason(seasonSheetName, sessionSet);
    const completionBySession = buildCheckoutCompletionMapBySession(eventRows);
    const completedByPhone = completionBySession[targetSession.sessionKey] || {};
    const existingCompletion = completedByPhone[phone];
    if (existingCompletion) {
      return {
        success: true,
        alreadyCompleted: true,
        message: '이미 퇴실 처리된 기록입니다.',
        seasonAlias: info.seasonAlias,
        sessionKey: targetSession.sessionKey,
        checkoutTime: existingCompletion.submittedAt ? formatDateTime(existingCompletion.submittedAt) : '',
        checkoutType: existingCompletion.method || 'manual_code',
        name: member.name,
        grade: member.seasonLabel || formatSeasonLabel(member.season),
        seasonLabel: member.seasonLabel || formatSeasonLabel(member.season)
      };
    }

    const submittedAt = new Date();
    const eventRowIndex = appendCheckoutEventRow({
      seasonSheet: seasonSheetName,
      sessionKey: targetSession.sessionKey,
      phone: phone,
      method: method,
      submittedAt: submittedAt,
      codeInput: method === 'auto_cache' ? '[ticket]' : String(params.code || '').replace(/\D/g, ''),
      status: 'completed',
      undoToken: '',
      undoneAt: '',
      meta: `seasonAlias=${info.seasonAlias}`
    });

    const undoToken = issueCheckoutUndoToken({
      seasonAlias: info.seasonAlias,
      seasonSheet: seasonSheetName,
      sessionKey: targetSession.sessionKey,
      phone: phone,
      eventRowIndex: eventRowIndex
    });

    updateCheckoutEventRowStatus(eventRowIndex, 'completed', { meta: `seasonAlias=${info.seasonAlias};undoToken=${undoToken}` });
    ensureCheckoutEventSheet().getRange(eventRowIndex, 8).setValue(undoToken);

    const targetRange = sheet.getRange(lookup.rowIndex + 1, targetSession.colIndex + 1);
    const noteLine = buildCheckoutNoteLine('퇴실완료', submittedAt, `방법=${method}`);
    targetRange.setNote(appendCheckoutNote(targetRange.getNote(), noteLine));

    return {
      success: true,
      message: '퇴실 처리가 완료되었습니다.',
      seasonAlias: info.seasonAlias,
      sessionKey: targetSession.sessionKey,
      checkoutTime: formatDateTime(submittedAt),
      checkoutType: method,
      checkoutOpenTime: bounds.openTime ? bounds.openTime.getTime() : null,
      checkoutCloseTime: bounds.closeTime ? bounds.closeTime.getTime() : null,
      undoToken: undoToken,
      undoUntil: new Date(submittedAt.getTime() + CHECKOUT_UNDO_WINDOW_SECONDS * 1000).getTime(),
      name: member.name,
      grade: member.seasonLabel || formatSeasonLabel(member.season),
      seasonLabel: member.seasonLabel || formatSeasonLabel(member.season)
    };
  } finally {
    lock.releaseLock();
  }
}

function checkoutUndo(params) {
  const token = String(params && params.undoToken || params && params.token || '').trim();
  if (!token) {
    return { success: false, message: 'undoToken 파라미터가 필요합니다.' };
  }

  const payload = readCheckoutUndoToken(token);
  if (!payload) {
    return { success: false, message: '취소 가능한 시간이 지났거나 유효하지 않은 토큰입니다.' };
  }

  const now = new Date();
  if (!payload.expiresAt || now.getTime() > payload.expiresAt) {
    clearCheckoutUndoToken(token);
    return { success: false, message: '취소 가능한 시간이 지났습니다.' };
  }

  const seasonName = String(params && params.season || payload.seasonAlias || '').trim();
  if (!seasonName) {
    return { success: false, message: '시즌 정보를 확인할 수 없습니다.' };
  }

  const lock = LockService.getDocumentLock();
  lock.waitLock(5000);
  try {
    const info = resolveSeasonSheetInfo(seasonName);
    const seasonSheetName = info.sheet.getName();
    if (payload.seasonSheet && payload.seasonSheet !== seasonSheetName) {
      return { success: false, message: '시즌 정보가 일치하지 않아 취소할 수 없습니다.' };
    }

    const eventSheet = ensureCheckoutEventSheet();
    const rowIndex = Number(payload.eventRowIndex || 0);
    if (!rowIndex || rowIndex < 2 || rowIndex > eventSheet.getLastRow()) {
      clearCheckoutUndoToken(token);
      return { success: false, message: '취소 대상 기록을 찾을 수 없습니다.' };
    }

    const row = eventSheet.getRange(rowIndex, 1, 1, CHECKOUT_EVENT_HEADERS.length).getValues()[0];
    const rowSeasonSheet = String(row[0] || '').trim();
    const rowSessionKey = String(row[1] || '').trim();
    const rowPhone = normalizePhone(row[2]);
    const rowStatus = String(row[6] || '').trim().toLowerCase();
    const rowUndoToken = String(row[7] || '').trim();

    if (rowSeasonSheet !== seasonSheetName || rowSessionKey !== payload.sessionKey || rowPhone !== payload.phone) {
      clearCheckoutUndoToken(token);
      return { success: false, message: '취소 대상 기록 검증에 실패했습니다.' };
    }
    if (rowUndoToken && rowUndoToken !== token) {
      clearCheckoutUndoToken(token);
      return { success: false, message: '취소 토큰이 일치하지 않습니다.' };
    }
    if (rowStatus !== 'completed') {
      clearCheckoutUndoToken(token);
      return { success: false, message: '이미 취소되었거나 취소할 수 없는 상태입니다.' };
    }

    updateCheckoutEventRowStatus(rowIndex, 'undone', {
      undoneAt: now,
      meta: `undoAt=${formatDateTime(now)}`
    });
    clearCheckoutUndoToken(token);

    return {
      success: true,
      message: '퇴실 처리를 취소했습니다.',
      seasonAlias: info.seasonAlias,
      sessionKey: payload.sessionKey,
      phone: payload.phone,
      undoneAt: formatDateTime(now)
    };
  } finally {
    lock.releaseLock();
  }
}
