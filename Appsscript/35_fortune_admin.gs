function canonicalFortuneText(value) {
  return String(value || '')
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '')
    .trim();
}

function sanitizeFortuneSourceType(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'csv' || raw === 'xlsx' || raw === 'paste' || raw === 'editor') {
    return raw;
  }
  return 'manual';
}

function isFortuneBuiltinVersionId(value) {
  return String(value || '').trim().toLowerCase() === 'builtin';
}

function normalizeFortuneVersionTokenForCompare(value) {
  const token = String(value || '').trim();
  if (!token || isFortuneBuiltinVersionId(token)) {
    return 'builtin';
  }
  return token;
}

function ensureFortuneSheetWithHeaders(sheetName, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  const width = headers.length;
  const headerValues = sheet.getLastRow() >= 1
    ? sheet.getRange(1, 1, 1, width).getValues()[0]
    : [];
  const headerMismatch = headers.some((header, idx) => String(headerValues[idx] || '').trim() !== header);
  if (sheet.getLastRow() < 1 || headerMismatch) {
    sheet.getRange(1, 1, 1, width).setValues([headers]);
  }

  if (!sheet.isSheetHidden()) {
    sheet.hideSheet();
  }
  return sheet;
}

function ensureFortuneVersionSheet() {
  return ensureFortuneSheetWithHeaders(FORTUNE_VERSION_SHEET_NAME, FORTUNE_VERSION_HEADERS);
}

function ensureFortuneEntrySheet() {
  return ensureFortuneSheetWithHeaders(FORTUNE_ENTRY_SHEET_NAME, FORTUNE_ENTRY_HEADERS);
}

function ensureFortuneUploadMetaSheet() {
  return ensureFortuneSheetWithHeaders(FORTUNE_UPLOAD_META_SHEET_NAME, FORTUNE_UPLOAD_META_HEADERS);
}

function serializeFortuneVersionRecord(record) {
  return {
    versionId: String(record.versionId || '').trim(),
    createdAt: String(record.createdAt || '').trim(),
    createdByEmail: String(record.createdByEmail || '').trim(),
    sourceType: sanitizeFortuneSourceType(record.sourceType || ''),
    rowCount: Math.max(0, Number(record.rowCount || 0)),
    isCurrent: !!record.isCurrent
  };
}

function readFortuneVersionRowsCache() {
  try {
    const raw = CacheService.getScriptCache().get(FORTUNE_VERSION_ROWS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch (error) {
    return null;
  }
}

function writeFortuneVersionRowsCache(records) {
  if (!Array.isArray(records)) return;
  try {
    CacheService.getScriptCache().put(
      FORTUNE_VERSION_ROWS_CACHE_KEY,
      JSON.stringify(records),
      FORTUNE_VERSION_CACHE_TTL_SECONDS
    );
  } catch (error) {
    Logger.log('운세 버전 캐시 저장 실패: ' + error.toString());
  }
}

function getFortuneVersionEntryCacheKey(versionId) {
  return FORTUNE_VERSION_ENTRY_CACHE_PREFIX + String(versionId || '').trim();
}

function readFortuneEntryRowsCache(versionId) {
  const key = getFortuneVersionEntryCacheKey(versionId);
  if (!key || key === FORTUNE_VERSION_ENTRY_CACHE_PREFIX) return null;
  try {
    const raw = CacheService.getScriptCache().get(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch (error) {
    return null;
  }
}

function writeFortuneEntryRowsCache(versionId, rows) {
  const key = getFortuneVersionEntryCacheKey(versionId);
  if (!key || key === FORTUNE_VERSION_ENTRY_CACHE_PREFIX || !Array.isArray(rows)) return;
  try {
    CacheService.getScriptCache().put(
      key,
      JSON.stringify(rows),
      FORTUNE_VERSION_CACHE_TTL_SECONDS
    );
  } catch (error) {
    Logger.log('운세 엔트리 캐시 저장 실패: ' + error.toString());
  }
}

function invalidateFortuneVersionCaches(versionId) {
  try {
    const cache = CacheService.getScriptCache();
    cache.remove(FORTUNE_VERSION_ROWS_CACHE_KEY);
    const key = getFortuneVersionEntryCacheKey(versionId);
    if (key && key !== FORTUNE_VERSION_ENTRY_CACHE_PREFIX) {
      cache.remove(key);
    }
  } catch (error) {
    Logger.log('운세 버전 캐시 삭제 실패: ' + error.toString());
  }
}

function getFortuneVersionRows() {
  const cached = readFortuneVersionRowsCache();
  if (cached) return cached;

  const sheet = ensureFortuneVersionSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, FORTUNE_VERSION_HEADERS.length).getValues();
  const records = values.map((row, idx) => {
    const versionId = String(row[0] || '').trim();
    if (!versionId) return null;
    return {
      rowIndex: idx + 2,
      versionId: versionId,
      createdAt: String(row[1] || '').trim(),
      createdByEmail: String(row[2] || '').trim(),
      sourceType: sanitizeFortuneSourceType(row[3] || ''),
      rowCount: Math.max(0, parseInt(row[4], 10) || 0),
      isCurrent: parseBooleanParam(row[5]),
      note: String(row[6] || '').trim()
    };
  }).filter(item => !!item);
  writeFortuneVersionRowsCache(records);
  return records;
}

function getFortuneVersionById(versionId) {
  const id = String(versionId || '').trim();
  if (!id) return null;
  const rows = getFortuneVersionRows();
  return rows.find(item => item.versionId === id) || null;
}

function getFortuneCurrentVersionRecord() {
  const rows = getFortuneVersionRows().filter(item => item.isCurrent);
  if (rows.length === 0) return null;
  rows.sort((a, b) => b.rowIndex - a.rowIndex);
  return rows[0];
}

function getFortuneCurrentVersionToken() {
  const current = getFortuneCurrentVersionRecord();
  return current ? current.versionId : 'builtin';
}

function clearFortuneCurrentFlags() {
  const sheet = ensureFortuneVersionSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;
  const values = [];
  for (let i = 2; i <= lastRow; i++) {
    values.push([false]);
  }
  sheet.getRange(2, 6, lastRow - 1, 1).setValues(values);
  invalidateFortuneVersionCaches('');
}

function appendFortuneVersionRow(record) {
  const sheet = ensureFortuneVersionSheet();
  const nowText = formatDateTime(new Date());
  const row = [
    String(record.versionId || '').trim(),
    String(record.createdAt || nowText).trim(),
    String(record.createdByEmail || '').trim(),
    sanitizeFortuneSourceType(record.sourceType || 'manual'),
    Math.max(0, Number(record.rowCount || 0)),
    !!record.isCurrent,
    String(record.note || '').trim()
  ];
  const rowIndex = sheet.getLastRow() + 1;
  sheet.getRange(rowIndex, 1, 1, FORTUNE_VERSION_HEADERS.length).setValues([row]);
  invalidateFortuneVersionCaches(record.versionId);
  return rowIndex;
}

function getFortuneEntryRowsByVersionId(versionId) {
  const targetVersionId = String(versionId || '').trim();
  if (!targetVersionId) return [];

  const cached = readFortuneEntryRowsCache(targetVersionId);
  if (cached) return cached;

  const sheet = ensureFortuneEntrySheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, FORTUNE_ENTRY_HEADERS.length).getValues();
  const rows = [];
  values.forEach((row, idx) => {
    const rowVersionId = String(row[0] || '').trim();
    if (rowVersionId !== targetVersionId) return;
    const fortuneText = canonicalFortuneText(row[2]);
    if (!fortuneText) return;
    const rowNo = parseInt(row[1], 10);
    rows.push({
      rowIndex: idx + 2,
      rowNo: isNaN(rowNo) ? (idx + 1) : rowNo,
      fortune: fortuneText
    });
  });

  rows.sort((a, b) => {
    if (a.rowNo !== b.rowNo) return a.rowNo - b.rowNo;
    return a.rowIndex - b.rowIndex;
  });

  const normalizedRows = rows.map((item, idx) => ({
    rowNo: idx + 1,
    fortune: item.fortune
  }));
  writeFortuneEntryRowsCache(targetVersionId, normalizedRows);
  return normalizedRows;
}

function appendFortuneEntryRows(versionId, rows) {
  const targetVersionId = String(versionId || '').trim();
  if (!targetVersionId) return;
  if (!rows || rows.length === 0) return;

  const sheet = ensureFortuneEntrySheet();
  const appendRows = rows.map((row, idx) => [
    targetVersionId,
    idx + 1,
    canonicalFortuneText(row.fortune)
  ]);
  const startRow = sheet.getLastRow() + 1;
  sheet.getRange(startRow, 1, appendRows.length, FORTUNE_ENTRY_HEADERS.length).setValues(appendRows);
  invalidateFortuneVersionCaches(targetVersionId);
}

function getFortuneUploadMetaRows() {
  const sheet = ensureFortuneUploadMetaSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const values = sheet.getRange(2, 1, lastRow - 1, FORTUNE_UPLOAD_META_HEADERS.length).getValues();
  return values.map((row, idx) => {
    const uploadId = String(row[0] || '').trim();
    if (!uploadId) return null;
    return {
      rowIndex: idx + 2,
      uploadId: uploadId,
      stagingSheetName: String(row[1] || '').trim(),
      status: String(row[2] || '').trim(),
      createdAt: String(row[3] || '').trim(),
      updatedAt: String(row[4] || '').trim(),
      createdByEmail: String(row[5] || '').trim(),
      expectedRows: Math.max(0, parseInt(row[6], 10) || 0),
      receivedRows: Math.max(0, parseInt(row[7], 10) || 0)
    };
  }).filter(item => !!item);
}

function appendFortuneUploadMetaRecord(record) {
  const sheet = ensureFortuneUploadMetaSheet();
  const nowText = formatDateTime(new Date());
  const row = [
    String(record.uploadId || '').trim(),
    String(record.stagingSheetName || '').trim(),
    String(record.status || FORTUNE_UPLOAD_STATUS_ACTIVE).trim(),
    String(record.createdAt || nowText).trim(),
    String(record.updatedAt || nowText).trim(),
    String(record.createdByEmail || '').trim(),
    Math.max(0, Number(record.expectedRows || 0)),
    Math.max(0, Number(record.receivedRows || 0))
  ];
  const rowIndex = sheet.getLastRow() + 1;
  sheet.getRange(rowIndex, 1, 1, FORTUNE_UPLOAD_META_HEADERS.length).setValues([row]);
  return rowIndex;
}

function getFortuneUploadMetaRecord(uploadId) {
  const id = String(uploadId || '').trim();
  if (!id) return null;
  const rows = getFortuneUploadMetaRows();
  return rows.find(item => item.uploadId === id) || null;
}

function getActiveFortuneUploadRecord() {
  const rows = getFortuneUploadMetaRows().filter(item => item.status === FORTUNE_UPLOAD_STATUS_ACTIVE);
  if (rows.length === 0) return null;
  rows.sort((a, b) => b.rowIndex - a.rowIndex);
  return rows[0];
}

function updateFortuneUploadMetaRecord(record) {
  if (!record || !record.rowIndex) return;
  const sheet = ensureFortuneUploadMetaSheet();
  const nowText = formatDateTime(new Date());
  const row = [
    String(record.uploadId || '').trim(),
    String(record.stagingSheetName || '').trim(),
    String(record.status || '').trim(),
    String(record.createdAt || nowText).trim(),
    String(record.updatedAt || nowText).trim(),
    String(record.createdByEmail || '').trim(),
    Math.max(0, Number(record.expectedRows || 0)),
    Math.max(0, Number(record.receivedRows || 0))
  ];
  sheet.getRange(record.rowIndex, 1, 1, FORTUNE_UPLOAD_META_HEADERS.length).setValues([row]);
}

function createFortuneStagingSheet(uploadId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const suffix = String(uploadId || '').trim().slice(0, 8) || Utilities.getUuid().replace(/-/g, '').slice(0, 8);
  let baseName = `${FORTUNE_UPLOAD_STAGING_PREFIX}${suffix}`;
  let name = baseName;
  let seq = 1;
  while (ss.getSheetByName(name)) {
    name = `${baseName}_${seq++}`;
  }

  const sheet = ss.insertSheet(name);
  sheet.getRange(1, 1, 1, 3).setValues([['row_no', 'fortune_text', 'canonical_key']]);
  if (!sheet.isSheetHidden()) {
    sheet.hideSheet();
  }
  return sheet;
}

function deleteFortuneStagingSheet(stagingSheetName) {
  const name = String(stagingSheetName || '').trim();
  if (!name) return;
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(name);
  if (!sheet) return;
  if (ss.getSheets().length <= 1) return;
  ss.deleteSheet(sheet);
}

function readFortuneStagingRows(stagingSheet) {
  if (!stagingSheet) return [];
  const lastRow = stagingSheet.getLastRow();
  if (lastRow < 2) return [];
  const values = stagingSheet.getRange(2, 1, lastRow - 1, 3).getValues();
  return values.map((row, idx) => ({
    rowNo: idx + 1,
    fortune: String(row[1] || '')
  }));
}

function getCachedFortunePayload() {
  try {
    const cache = CacheService.getScriptCache();
    const raw = cache.get(FORTUNE_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.fortunes)) return null;
    return parsed;
  } catch (error) {
    return null;
  }
}

function setCachedFortunePayload(payload) {
  if (!payload || !Array.isArray(payload.fortunes)) return;
  try {
    const cache = CacheService.getScriptCache();
    cache.put(
      FORTUNE_CACHE_KEY,
      JSON.stringify(payload),
      Math.max(60, Number(FORTUNE_CACHE_TTL_SECONDS || 300))
    );
  } catch (error) {
    Logger.log('운세 캐시 저장 실패: ' + error.toString());
  }
}

function clearFortuneCache() {
  try {
    CacheService.getScriptCache().remove(FORTUNE_CACHE_KEY);
  } catch (error) {
    Logger.log('운세 캐시 삭제 실패: ' + error.toString());
  }
  invalidateFortuneVersionCaches('');
}

function loadCurrentFortunePayloadFromSheets() {
  const current = getFortuneCurrentVersionRecord();
  if (!current) {
    return {
      versionId: 'builtin',
      fortunes: []
    };
  }
  const entries = getFortuneEntryRowsByVersionId(current.versionId);
  return {
    versionId: current.versionId,
    fortunes: entries.map(item => item.fortune).filter(item => !!item)
  };
}

function getCurrentFortuneTextList() {
  const cached = getCachedFortunePayload();
  if (cached && Array.isArray(cached.fortunes) && cached.fortunes.length > 0) {
    return cached.fortunes.slice();
  }

  const loaded = loadCurrentFortunePayloadFromSheets();
  if (Array.isArray(loaded.fortunes) && loaded.fortunes.length > 0) {
    setCachedFortunePayload(loaded);
    return loaded.fortunes.slice();
  }
  return [];
}

function parseFortuneRowsJson(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  const parsed = JSON.parse(String(raw));
  return Array.isArray(parsed) ? parsed : [];
}

function validateFortuneRows(rows) {
  const errors = [];
  const warnings = [];
  const seen = {};
  const validRows = [];
  let droppedDuplicateCount = 0;
  let droppedEmptyCount = 0;

  (rows || []).forEach((row, idx) => {
    const sourceRowNo = idx + 1;
    const text = canonicalFortuneText(row && row.fortune !== undefined ? row.fortune : row);
    if (!text) {
      droppedEmptyCount += 1;
      return;
    }

    if (text.length > FORTUNE_MAX_TEXT_LENGTH) {
      errors.push({
        rowNo: sourceRowNo,
        code: 'FORTUNE_TOO_LONG',
        message: `${sourceRowNo}행: 운세 길이는 ${FORTUNE_MAX_TEXT_LENGTH}자를 초과할 수 없습니다.`
      });
      return;
    }

    const key = text;
    if (Object.prototype.hasOwnProperty.call(seen, key)) {
      droppedDuplicateCount += 1;
      warnings.push({
        rowNo: sourceRowNo,
        code: 'DUPLICATE_FORTUNE',
        message: `${sourceRowNo}행: ${seen[key]}행과 중복 문구로 자동 제외됩니다.`
      });
      return;
    }

    seen[key] = sourceRowNo;
    validRows.push({
      rowNo: validRows.length + 1,
      fortune: text
    });
  });

  if (validRows.length === 0) {
    errors.push({
      rowNo: 0,
      code: 'NO_VALID_ROWS',
      message: '저장 가능한 운세가 1개 이상 필요합니다.'
    });
  }

  return {
    success: errors.length === 0,
    errors: errors,
    warnings: warnings,
    rows: validRows,
    droppedDuplicateCount: droppedDuplicateCount,
    droppedEmptyCount: droppedEmptyCount
  };
}

function fortuneVersionList(adminContext) {
  try {
    const records = getFortuneVersionRows().slice().sort((a, b) => b.rowIndex - a.rowIndex);
    if (records.length === 0) {
      const builtinRows = typeof getBuiltinFortunes === 'function' ? getBuiltinFortunes() : [];
      return {
        success: true,
        currentVersionId: 'builtin',
        versions: [{
          versionId: 'builtin',
          createdAt: '',
          createdByEmail: 'system',
          sourceType: 'builtin',
          rowCount: builtinRows.length,
          isCurrent: true,
          isBuiltin: true
        }]
      };
    }

    return {
      success: true,
      currentVersionId: getFortuneCurrentVersionToken(),
      versions: records.map(item => serializeFortuneVersionRecord(item))
    };
  } catch (error) {
    Logger.log('fortuneVersionList 오류: ' + error.toString());
    return {
      success: false,
      errorCode: 'FORTUNE_VERSION_LIST_FAILED',
      message: '운세 버전 목록을 불러오지 못했습니다.'
    };
  }
}

function fortuneVersionGet(adminContext, params) {
  try {
    const requestedVersionId = String((params && params.versionId) || '').trim();
    if (isFortuneBuiltinVersionId(requestedVersionId)) {
      const builtinRows = typeof getBuiltinFortunes === 'function' ? getBuiltinFortunes() : [];
      return {
        success: true,
        version: {
          versionId: 'builtin',
          createdAt: '',
          createdByEmail: 'system',
          sourceType: 'builtin',
          rowCount: builtinRows.length,
          isCurrent: getFortuneCurrentVersionToken() === 'builtin',
          isBuiltin: true
        },
        rows: builtinRows.map((fortune, idx) => ({
          rowNo: idx + 1,
          fortune: String(fortune || '')
        }))
      };
    }

    const targetRecord = requestedVersionId
      ? getFortuneVersionById(requestedVersionId)
      : getFortuneCurrentVersionRecord();

    if (!targetRecord) {
      const builtinRows = typeof getBuiltinFortunes === 'function' ? getBuiltinFortunes() : [];
      if (!requestedVersionId) {
        return {
          success: true,
          version: {
            versionId: 'builtin',
            createdAt: '',
            createdByEmail: 'system',
            sourceType: 'builtin',
            rowCount: builtinRows.length,
            isCurrent: true,
            isBuiltin: true
          },
          rows: builtinRows.map((fortune, idx) => ({
            rowNo: idx + 1,
            fortune: String(fortune || '')
          }))
        };
      }

      return {
        success: false,
        errorCode: 'FORTUNE_VERSION_NOT_FOUND',
        message: '요청한 운세 버전을 찾을 수 없습니다.'
      };
    }

    const rows = getFortuneEntryRowsByVersionId(targetRecord.versionId);
    return {
      success: true,
      version: serializeFortuneVersionRecord(targetRecord),
      rows: rows
    };
  } catch (error) {
    Logger.log('fortuneVersionGet 오류: ' + error.toString());
    return {
      success: false,
      errorCode: 'FORTUNE_VERSION_GET_FAILED',
      message: '운세 버전을 불러오지 못했습니다.'
    };
  }
}

function fortuneUploadBegin(adminContext, params) {
  const ctx = sanitizeAdminContext(adminContext || {});
  const lock = LockService.getDocumentLock();
  lock.waitLock(5000);
  try {
    const active = getActiveFortuneUploadRecord();
    if (active) {
      return {
        success: false,
        errorCode: 'FORTUNE_UPLOAD_ALREADY_ACTIVE',
        message: '이미 진행 중인 운세 업로드 세션이 있습니다.',
        uploadId: active.uploadId
      };
    }

    const uploadId = Utilities.getUuid().replace(/-/g, '');
    const stagingSheet = createFortuneStagingSheet(uploadId);
    const expectedRows = Math.max(0, parseInt((params && params.expectedRowCount) || 0, 10) || 0);
    const sourceType = sanitizeFortuneSourceType((params && params.sourceType) || 'manual');
    const currentVersionId = getFortuneCurrentVersionToken();
    const baseVersionId = String((params && params.baseVersionId) || '').trim() || currentVersionId;

    appendFortuneUploadMetaRecord({
      uploadId: uploadId,
      stagingSheetName: stagingSheet.getName(),
      status: FORTUNE_UPLOAD_STATUS_ACTIVE,
      createdByEmail: String(ctx.email || '').trim(),
      expectedRows: expectedRows,
      receivedRows: 0
    });

    return {
      success: true,
      uploadId: uploadId,
      sourceType: sourceType,
      baseVersionId: baseVersionId,
      currentVersionId: currentVersionId
    };
  } catch (error) {
    Logger.log('fortuneUploadBegin 오류: ' + error.toString());
    return {
      success: false,
      errorCode: 'FORTUNE_UPLOAD_BEGIN_FAILED',
      message: '운세 업로드 세션 시작에 실패했습니다.'
    };
  } finally {
    lock.releaseLock();
  }
}

function fortuneUploadChunk(adminContext, params) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(5000);
  try {
    const uploadId = String((params && params.uploadId) || '').trim();
    if (!uploadId) {
      return {
        success: false,
        errorCode: 'INVALID_UPLOAD_ID',
        message: 'uploadId 파라미터가 필요합니다.'
      };
    }

    const record = getFortuneUploadMetaRecord(uploadId);
    if (!record) {
      return {
        success: false,
        errorCode: 'UPLOAD_NOT_FOUND',
        message: '운세 업로드 세션을 찾을 수 없습니다.'
      };
    }

    if (record.status !== FORTUNE_UPLOAD_STATUS_ACTIVE) {
      return {
        success: false,
        errorCode: 'UPLOAD_NOT_ACTIVE',
        message: '이미 종료된 업로드 세션입니다.'
      };
    }

    let rows = [];
    try {
      rows = parseFortuneRowsJson((params && (params.rowsJson || params.rows)) || '[]');
    } catch (error) {
      return {
        success: false,
        errorCode: 'INVALID_ROWS_JSON',
        message: error.message || 'rowsJson 파싱에 실패했습니다.'
      };
    }

    if (rows.length === 0) {
      return {
        success: true,
        receivedRows: record.receivedRows
      };
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const stagingSheet = ss.getSheetByName(record.stagingSheetName);
    if (!stagingSheet) {
      return {
        success: false,
        errorCode: 'STAGING_SHEET_MISSING',
        message: '운세 업로드 스테이징 시트를 찾을 수 없습니다.'
      };
    }

    const appendRows = rows.map((item, idx) => {
      const rowNoRaw = item && (item.rowNo !== undefined ? item.rowNo : item.row);
      const rowNo = Math.max(1, parseInt(rowNoRaw, 10) || (record.receivedRows + idx + 1));
      const fortune = canonicalFortuneText(
        item && (item.fortune !== undefined
          ? item.fortune
          : (item.text !== undefined
            ? item.text
            : (item.value !== undefined ? item.value : '')))
      );
      return [rowNo, fortune, fortune];
    });

    const startRow = stagingSheet.getLastRow() + 1;
    stagingSheet.getRange(startRow, 1, appendRows.length, 3).setValues(appendRows);

    record.receivedRows = Math.max(0, Number(record.receivedRows || 0)) + appendRows.length;
    record.updatedAt = formatDateTime(new Date());
    updateFortuneUploadMetaRecord(record);

    return {
      success: true,
      receivedRows: record.receivedRows
    };
  } catch (error) {
    Logger.log('fortuneUploadChunk 오류: ' + error.toString());
    return {
      success: false,
      errorCode: 'FORTUNE_UPLOAD_CHUNK_FAILED',
      message: '운세 업로드 청크 반영에 실패했습니다.'
    };
  } finally {
    lock.releaseLock();
  }
}

function fortuneUploadFinalize(adminContext, params) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(5000);
  try {
    if (!parseBooleanParam(params && params.confirm)) {
      return {
        success: false,
        errorCode: 'CONFIRM_REQUIRED',
        message: '최종 저장 확인(confirm=true)이 필요합니다.'
      };
    }

    const uploadId = String((params && params.uploadId) || '').trim();
    if (!uploadId) {
      return {
        success: false,
        errorCode: 'INVALID_UPLOAD_ID',
        message: 'uploadId 파라미터가 필요합니다.'
      };
    }

    const record = getFortuneUploadMetaRecord(uploadId);
    if (!record) {
      return {
        success: false,
        errorCode: 'UPLOAD_NOT_FOUND',
        message: '운세 업로드 세션을 찾을 수 없습니다.'
      };
    }

    if (record.status !== FORTUNE_UPLOAD_STATUS_ACTIVE) {
      return {
        success: false,
        errorCode: 'UPLOAD_NOT_ACTIVE',
        message: '이미 종료된 업로드 세션입니다.'
      };
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const stagingSheet = ss.getSheetByName(record.stagingSheetName);
    if (!stagingSheet) {
      return {
        success: false,
        errorCode: 'STAGING_SHEET_MISSING',
        message: '운세 업로드 스테이징 시트를 찾을 수 없습니다.'
      };
    }

    const stagedRows = readFortuneStagingRows(stagingSheet);
    const validation = validateFortuneRows(stagedRows);
    if (!validation.success) {
      return {
        success: false,
        errorCode: 'FORTUNE_VALIDATION_FAILED',
        message: '운세 데이터 서버 검증에 실패했습니다.',
        errorCount: validation.errors.length,
        errors: validation.errors.slice(0, 50),
        warningCount: Array.isArray(validation.warnings) ? validation.warnings.length : 0,
        warnings: Array.isArray(validation.warnings) ? validation.warnings.slice(0, 50) : [],
        droppedDuplicateCount: Math.max(0, Number(validation.droppedDuplicateCount || 0)),
        droppedEmptyCount: Math.max(0, Number(validation.droppedEmptyCount || 0))
      };
    }

    const currentVersionToken = normalizeFortuneVersionTokenForCompare(getFortuneCurrentVersionToken());
    const requestedBaseVersion = normalizeFortuneVersionTokenForCompare((params && params.baseVersionId) || currentVersionToken);
    if (requestedBaseVersion !== currentVersionToken) {
      return {
        success: false,
        errorCode: 'BASE_VERSION_CONFLICT',
        message: '기준 버전이 최신 상태와 다릅니다. 새로고침 후 다시 시도해주세요.',
        currentVersionId: getFortuneCurrentVersionToken()
      };
    }

    const newVersionId = Utilities.getUuid().replace(/-/g, '');
    const nowText = formatDateTime(new Date());
    appendFortuneEntryRows(newVersionId, validation.rows);

    const newVersionRowIndex = appendFortuneVersionRow({
      versionId: newVersionId,
      createdAt: nowText,
      createdByEmail: String((adminContext && adminContext.email) || '').trim(),
      sourceType: sanitizeFortuneSourceType((params && params.sourceType) || 'manual'),
      rowCount: validation.rows.length,
      isCurrent: false,
      note: `upload:${uploadId}`
    });

    clearFortuneCurrentFlags();
    ensureFortuneVersionSheet().getRange(newVersionRowIndex, 6).setValue(true);

    record.status = FORTUNE_UPLOAD_STATUS_FINALIZED;
    record.updatedAt = nowText;
    record.receivedRows = validation.rows.length;
    updateFortuneUploadMetaRecord(record);
    deleteFortuneStagingSheet(record.stagingSheetName);
    clearFortuneCache();

    return {
      success: true,
      newVersionId: newVersionId,
      rowCount: validation.rows.length,
      currentVersionId: newVersionId,
      warningCount: Array.isArray(validation.warnings) ? validation.warnings.length : 0,
      droppedDuplicateCount: Math.max(0, Number(validation.droppedDuplicateCount || 0)),
      droppedEmptyCount: Math.max(0, Number(validation.droppedEmptyCount || 0))
    };
  } catch (error) {
    Logger.log('fortuneUploadFinalize 오류: ' + error.toString());
    return {
      success: false,
      errorCode: 'FORTUNE_UPLOAD_FINALIZE_FAILED',
      message: '운세 최종 저장에 실패했습니다.'
    };
  } finally {
    lock.releaseLock();
  }
}

function fortuneUploadAbort(adminContext, params) {
  const lock = LockService.getDocumentLock();
  lock.waitLock(5000);
  try {
    const uploadId = String((params && params.uploadId) || '').trim();
    if (!uploadId) {
      return {
        success: false,
        errorCode: 'INVALID_UPLOAD_ID',
        message: 'uploadId 파라미터가 필요합니다.'
      };
    }

    const record = getFortuneUploadMetaRecord(uploadId);
    if (!record) {
      return {
        success: true,
        message: '중단할 업로드 세션이 없습니다.'
      };
    }

    if (record.status === FORTUNE_UPLOAD_STATUS_ACTIVE) {
      deleteFortuneStagingSheet(record.stagingSheetName);
      record.status = FORTUNE_UPLOAD_STATUS_ABORTED;
      record.updatedAt = formatDateTime(new Date());
      updateFortuneUploadMetaRecord(record);
    }

    return {
      success: true,
      uploadId: uploadId
    };
  } catch (error) {
    Logger.log('fortuneUploadAbort 오류: ' + error.toString());
    return {
      success: false,
      errorCode: 'FORTUNE_UPLOAD_ABORT_FAILED',
      message: '운세 업로드 중단 처리에 실패했습니다.'
    };
  } finally {
    lock.releaseLock();
  }
}
