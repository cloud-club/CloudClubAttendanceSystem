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

  const missingRequired = ['name', 'season', 'phone', 'email'].filter(field => !hasSchemaFieldIndex(schema, field));
  if (missingRequired.length > 0) {
    return {
      error: {
        success: false,
        errorCode: 'UPDATE_TARGET_NOT_V2',
        message: `업데이트 대상 시즌 시트에서 필수 헤더(${missingRequired.join(', ')})를 찾지 못했습니다.`
      }
    };
  }

  const byPhone = {};
  const duplicates = [];
  const sessionColumns = Array.isArray(schema.sessionColumns)
    ? schema.sessionColumns.slice().sort((a, b) => a - b)
    : [];
  const sessionStartColIndex = sessionColumns.length > 0
    ? sessionColumns[0]
    : Math.max(0, schema.sessionStartColIndex || 0);

  for (let i = 1; i < values.length; i++) {
    const member = readMemberFromRow(values[i], schema);
    const phoneKey = normalizePhone(member.phone || '');
    if (!phoneKey) continue;

    if (byPhone[phoneKey]) {
      duplicates.push(i + 1);
      continue;
    }

    let hasAttendanceData = false;
    for (let j = 0; j < sessionColumns.length; j++) {
      const col = sessionColumns[j];
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
    sessionStartColIndex: sessionStartColIndex,
    sessionColumns: sessionColumns,
    schema: schema
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

  const targetSchema = existingPack.schema || { fieldMap: {} };
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
  ].filter(field => hasSchemaFieldIndex(targetSchema, field));
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

function buildImportMemberFieldMap(member) {
  const rowValues = buildImportRowValuesFromMember(member);
  const map = {};
  for (let i = 0; i < MEMBER_FIELD_ORDER.length; i++) {
    map[MEMBER_FIELD_ORDER[i]] = rowValues[i];
  }
  return map;
}

function buildTargetSheetRowFromMember(member, targetSchema, lastCol) {
  const row = [];
  for (let i = 0; i < lastCol; i++) row.push('');

  const memberFieldMap = buildImportMemberFieldMap(member);
  MEMBER_FIELD_ORDER.forEach(field => {
    if (!hasSchemaFieldIndex(targetSchema, field)) return;
    const colIndex = targetSchema.fieldMap[field];
    if (colIndex < 0 || colIndex >= lastCol) return;
    row[colIndex] = memberFieldMap[field];
  });

  return row;
}

function collectTargetSheetChangedCells(currentRow, member, targetSchema) {
  const memberFieldMap = buildImportMemberFieldMap(member);
  const changedCells = [];

  MEMBER_FIELD_ORDER.forEach(field => {
    if (!hasSchemaFieldIndex(targetSchema, field)) return;
    const colIndex = targetSchema.fieldMap[field];
    if (colIndex === null || colIndex === undefined || colIndex < 0 || colIndex >= currentRow.length) return;

    const beforeNorm = normalizeImportDiffValue(field, currentRow[colIndex]);
    const afterNorm = normalizeImportDiffValue(field, memberFieldMap[field]);
    if (beforeNorm === afterNorm) return;

    changedCells.push({
      colIndex: colIndex,
      value: memberFieldMap[field]
    });
  });

  return changedCells;
}

function applyImportUpdateToExistingSheet(targetSheet, snapshot) {
  const stagingMembers = snapshot.stagingPack.members || [];
  const existingByPhone = snapshot.existingPack.byPhone || {};
  const targetSchema = snapshot.existingPack.schema || resolveMemberSchema(targetSheet);
  const lastCol = Math.max(1, targetSheet.getLastColumn());

  let addedCount = 0;
  let updatedRowCount = 0;

  stagingMembers.forEach(member => {
    const existing = existingByPhone[member.phone];

    if (!existing) {
      const appendRow = buildTargetSheetRowFromMember(member, targetSchema, lastCol);
      const startRow = targetSheet.getLastRow() + 1;
      targetSheet.getRange(startRow, 1, 1, lastCol).setValues([appendRow]);
      addedCount++;
      return;
    }

    const currentRow = targetSheet.getRange(existing.rowIndex, 1, 1, lastCol).getValues()[0];
    const changedCells = collectTargetSheetChangedCells(currentRow, member, targetSchema);
    if (changedCells.length === 0) return;

    changedCells.forEach(item => {
      targetSheet.getRange(existing.rowIndex, item.colIndex + 1).setValue(item.value);
    });
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
    invalidateSeasonSheetMetaCache();

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
