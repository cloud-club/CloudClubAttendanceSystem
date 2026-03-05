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
      tabs.push('출석 관리', '출석현황');
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
  normalized.checkout_open_offset_min = Math.min(0, Math.max(-180, toNumberWithDefault(
    normalized.checkout_open_offset_min,
    VARIABLE_DEFAULTS.checkout_open_offset_min
  )));
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
      absenceThresholdMin: absenceThresholdMin,
      checkoutOpenOffsetMin: variableConfig.checkout_open_offset_min
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
