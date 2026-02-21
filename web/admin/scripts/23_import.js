function normalizeImportCell(value) {
  if (value === undefined || value === null) return '';
  if (value instanceof Date && !isNaN(value.getTime())) {
    const yyyy = value.getFullYear();
    const mm = String(value.getMonth() + 1).padStart(2, '0');
    const dd = String(value.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }
  return String(value).replace(/\uFEFF/g, '').trim();
}

function normalizeImportRow(row) {
  if (!Array.isArray(row)) return [];
  return row.map(normalizeImportCell);
}

function isImportRowEmpty(row) {
  return !row || row.every(cell => !String(cell || '').trim());
}

function normalizeImportMatrix(matrix) {
  if (!Array.isArray(matrix)) return [];
  return matrix
    .map(normalizeImportRow)
    .filter(row => !isImportRowEmpty(row));
}

async function ensureImportParsersReady() {
  await ensureRuntimeDeps(['papa', 'xlsx']);
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('파일을 읽는 중 오류가 발생했습니다.'));
    reader.readAsText(file, 'utf-8');
  });
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('파일을 읽는 중 오류가 발생했습니다.'));
    reader.readAsArrayBuffer(file);
  });
}

function parseDelimitedMatrix(text) {
  const normalized = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const parseWith = (delimiter) => {
    const parsed = window.Papa.parse(normalized, {
      delimiter: delimiter,
      skipEmptyLines: false
    });
    return Array.isArray(parsed.data) ? parsed.data : [];
  };

  const comma = parseWith(',');
  const tab = parseWith('\t');
  const semicolon = parseWith(';');

  const score = (rows) => {
    if (!rows || rows.length === 0) return 0;
    const widths = rows.map(row => Array.isArray(row) ? row.length : 0);
    const nonTrivial = widths.filter(w => w > 1).length;
    const avg = widths.reduce((a, b) => a + b, 0) / Math.max(1, widths.length);
    return nonTrivial * 10 + avg;
  };

  const candidates = [
    { delimiter: ',', rows: comma, score: score(comma) },
    { delimiter: '\t', rows: tab, score: score(tab) },
    { delimiter: ';', rows: semicolon, score: score(semicolon) }
  ];
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].rows || [];
}

function chooseWorkbookSheet(workbook) {
  const names = (workbook && Array.isArray(workbook.SheetNames)) ? workbook.SheetNames : [];
  if (names.length === 0) {
    return { sheetName: '', matrix: [] };
  }

  const preferred = names.find(name => /응답|합격자/i.test(String(name || '')));
  const sheetName = preferred || names[0];
  const sheet = workbook.Sheets[sheetName];
  const matrix = window.XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    blankrows: true,
    defval: ''
  });
  return { sheetName, matrix };
}

async function loadImportMatrixFromFile(file) {
  const name = String(file && file.name || '').toLowerCase();
  if (!file) {
    throw new Error('업로드할 파일을 선택해주세요.');
  }

  if (/\.xlsx?$/.test(name)) {
    const buffer = await readFileAsArrayBuffer(file);
    const workbook = window.XLSX.read(buffer, { type: 'array' });
    const selected = chooseWorkbookSheet(workbook);
    return {
      matrix: normalizeImportMatrix(selected.matrix),
      parser: `xlsx:${selected.sheetName || 'first'}`,
      sheetName: selected.sheetName || ''
    };
  }

  const text = await readFileAsText(file);
  return {
    matrix: normalizeImportMatrix(parseDelimitedMatrix(text)),
    parser: 'csv/tsv'
  };
}

function canonicalImportToken(text) {
  return String(text || '')
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '')
    .replace(/\s+/g, '')
    .toLowerCase();
}

function isLikelyImportPhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return /^010\d{8}$/.test(digits);
}

function normalizeImportPhoneLocal(value) {
  const digits = String(value || '').replace(/\D/g, '');
  return /^010\d{8}$/.test(digits) ? digits : '';
}

function formatImportPhoneDisplay(value) {
  const digits = normalizeImportPhoneLocal(value);
  if (!digits) return '';
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
}

function isValidImportEmailLocal(value) {
  const email = String(value || '').trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function parseImportSeasonNo(value) {
  const text = String(value || '').trim();
  if (!text) return NaN;

  let m = text.match(/season_(\d{1,2})/i);
  if (m) return parseInt(m[1], 10);
  m = text.match(/(\d{1,2})\s*기/);
  if (m) return parseInt(m[1], 10);
  m = text.match(/^(\d{1,2})$/);
  if (m) return parseInt(m[1], 10);
  m = text.match(/(\d{1,2})/);
  if (m) return parseInt(m[1], 10);
  return NaN;
}

function parseImportCohortNo(value) {
  return parseImportSeasonNo(value);
}

function isLikelyBooleanValue(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return false;
  return (
    text === 'true' || text === 'false' ||
    text === '1' || text === '0' ||
    text === 'y' || text === 'n' ||
    text === 'yes' || text === 'no' ||
    text === 'o' || text === 'x' ||
    text === '예' || text === '아니오' ||
    text === '체크' || text === '미체크'
  );
}

function parseImportBooleanLocal(value) {
  if (value === true) return { value: true, valid: true };
  if (value === false) return { value: false, valid: true };
  const text = String(value || '').trim().toLowerCase();
  if (!text) return { value: false, valid: true, defaulted: true };

  const truthy = { true: true, '1': true, y: true, yes: true, o: true, '예': true, '체크': true };
  const falsy = { false: true, '0': true, n: true, no: true, x: true, '아니오': true, '미체크': true };
  if (truthy[text]) return { value: true, valid: true, defaulted: false };
  if (falsy[text]) return { value: false, valid: true, defaulted: false };
  return { value: false, valid: false, defaulted: false };
}

function isLikelyNameValue(value) {
  const text = String(value || '').trim();
  if (!text) return false;
  if (isLikelyImportPhone(text)) return false;
  if (isValidImportEmailLocal(text)) return false;
  if (!isNaN(parseImportSeasonNo(text))) return false;
  if (isLikelyBooleanValue(text)) return false;
  if (/[0-9]{4,}/.test(text)) return false;
  if (/[@:/\\]/.test(text)) return false;
  return /^[가-힣a-zA-Z.\-()'\s]{2,30}$/.test(text);
}

function getImportHeaderHintScore(token, field) {
  const t = canonicalImportToken(token);
  if (!t) return 0;

  const hints = {
    name: ['이름', '성명', 'name', '성함'],
    season: ['기수', 'season', 'cohort', '학기', '기합'],
    phone: ['전화번호', '휴대폰', '핸드폰', '연락처', 'phone', 'mobile'],
    email: ['이메일', '메일', 'email', 'mail', '연락처이메일'],
    githubId: ['githubid', 'github id', '깃허브id', '깃허브 아이디'],
    githubEmail: ['githubemail', 'github email', '깃허브이메일'],
    notionEmail: ['notionemail', 'notion email', '노션이메일'],
    discordId: ['discordid', 'discord id', 'discorid', 'discor id', '디스코드id', '디스코드 아이디'],
    slackEmail: ['slackemail', 'slack email', '슬랙이메일'],
    feeChecked: ['회비체크', '회비 체크', '회비', 'feepaid', 'fee'],
    completed: ['수료여부', '수료 여부', '수료', 'completed'],
    isStaff: ['운영진여부', '운영진 여부', '운영진', 'staff', 'isstaff']
  };

  const list = hints[field] || [];
  let matched = 0;
  list.forEach(item => {
    const c = canonicalImportToken(item);
    if (c && (t === c || t.indexOf(c) !== -1)) {
      matched++;
    }
  });
  return Math.min(1, matched / 2);
}

function detectImportHeaderRow(matrix) {
  const limit = Math.min(5, matrix.length);
  let best = { rowIndex: -1, score: -999, headerHint: 0, dataLike: 0 };

  for (let i = 0; i < limit; i++) {
    const row = matrix[i] || [];
    const nonEmpty = row.filter(cell => !!String(cell || '').trim());
    if (nonEmpty.length === 0) continue;

    let headerHint = 0;
    let dataLike = 0;
    let nameLike = 0;

    nonEmpty.forEach(cell => {
      const value = String(cell || '').trim();
      const hintScore = Math.max(
        getImportHeaderHintScore(value, 'name'),
        getImportHeaderHintScore(value, 'season'),
        getImportHeaderHintScore(value, 'phone'),
        getImportHeaderHintScore(value, 'email'),
        getImportHeaderHintScore(value, 'githubId'),
        getImportHeaderHintScore(value, 'githubEmail'),
        getImportHeaderHintScore(value, 'notionEmail'),
        getImportHeaderHintScore(value, 'discordId'),
        getImportHeaderHintScore(value, 'slackEmail'),
        getImportHeaderHintScore(value, 'feeChecked'),
        getImportHeaderHintScore(value, 'completed'),
        getImportHeaderHintScore(value, 'isStaff')
      );
      headerHint += hintScore;

      if (isLikelyImportPhone(value) || isValidImportEmailLocal(value) || !isNaN(parseImportSeasonNo(value)) || isLikelyBooleanValue(value)) {
        dataLike++;
      } else if (isLikelyNameValue(value)) {
        nameLike++;
      }
    });

    const score = (headerHint * 1.1) + (nameLike * 0.2) - (dataLike * 0.8);
    if (score > best.score) {
      best = { rowIndex: i, score, headerHint, dataLike };
    }
  }

  const hasHeader = best.rowIndex >= 0 && best.score >= 0.6;
  return {
    hasHeader: hasHeader,
    headerRowIndex: hasHeader ? best.rowIndex : -1,
    score: best.score
  };
}

function profileImportColumns(matrix, headerInfo) {
  const dataStart = headerInfo.hasHeader ? headerInfo.headerRowIndex + 1 : 0;
  const dataRows = matrix.slice(dataStart);
  const rowCount = dataRows.length;
  const colCount = matrix.reduce((max, row) => Math.max(max, Array.isArray(row) ? row.length : 0), 0);
  const profiles = [];

  for (let col = 0; col < colCount; col++) {
    let nonEmpty = 0;
    let phoneHits = 0;
    let emailHits = 0;
    let seasonHits = 0;
    let nameHits = 0;
    let boolHits = 0;
    let idHits = 0;
    const samples = [];

    dataRows.forEach(row => {
      const value = normalizeImportCell((row || [])[col]);
      if (!value) return;
      nonEmpty++;

      if (samples.length < 3) samples.push(value);
      if (isLikelyImportPhone(value)) phoneHits++;
      if (isValidImportEmailLocal(value)) emailHits++;
      if (!isNaN(parseImportSeasonNo(value))) seasonHits++;
      if (isLikelyNameValue(value)) nameHits++;
      if (isLikelyBooleanValue(value)) boolHits++;
      if (/^[a-z0-9][a-z0-9\-_]{2,39}$/i.test(String(value || '').trim())) idHits++;
    });

    const headerValue = headerInfo.hasHeader ? normalizeImportCell((matrix[headerInfo.headerRowIndex] || [])[col]) : '';
    const denom = Math.max(1, nonEmpty);
    const missingRatio = rowCount <= 0 ? 1 : (rowCount - nonEmpty) / rowCount;
    const profile = {
      colIndex: col,
      headerValue: headerValue,
      samples: samples,
      ratios: {
        nonEmpty: rowCount <= 0 ? 0 : (nonEmpty / rowCount),
        phone: phoneHits / denom,
        email: emailHits / denom,
        season: seasonHits / denom,
        name: nameHits / denom,
        bool: boolHits / denom,
        id: idHits / denom,
        missing: missingRatio
      },
      fieldScores: {}
    };

    IMPORT_FIELD_ORDER.forEach(field => {
      if (field === 'ignore') return;
      const headerHint = getImportHeaderHintScore(headerValue, field);
      let score = 0;
      if (field === 'phone') {
        score = profile.ratios.phone * 0.82 + headerHint * 0.16 - profile.ratios.missing * 0.08;
      } else if (field === 'season') {
        score = profile.ratios.season * 0.8 + headerHint * 0.18 - profile.ratios.missing * 0.08;
      } else if (field === 'email') {
        score = profile.ratios.email * 0.82 + headerHint * 0.16 - profile.ratios.missing * 0.08;
      } else if (field === 'githubEmail' || field === 'notionEmail' || field === 'slackEmail') {
        score = profile.ratios.email * 0.72 + headerHint * 0.24 - profile.ratios.missing * 0.08;
      } else if (field === 'githubId' || field === 'discordId') {
        score = profile.ratios.id * 0.62 + headerHint * 0.3 - profile.ratios.missing * 0.08;
      } else if (field === 'feeChecked' || field === 'completed' || field === 'isStaff') {
        score = profile.ratios.bool * 0.72 + headerHint * 0.24 - profile.ratios.missing * 0.08;
      } else {
        const noise = Math.max(profile.ratios.phone, profile.ratios.email, profile.ratios.season, profile.ratios.bool);
        score = profile.ratios.name * 0.68 + headerHint * 0.2 + (1 - noise) * 0.18 - profile.ratios.missing * 0.08;
      }
      profile.fieldScores[field] = Math.max(0, Math.min(1, score));
    });

    profiles.push(profile);
  }

  return {
    profiles: profiles,
    dataStartRow: dataStart,
    dataRows: dataRows,
    rowCount: rowCount
  };
}

function inferImportAutoMapping(columnProfiles) {
  const profiles = columnProfiles.profiles || [];
  const mapping = {};
  IMPORT_FIELD_ORDER.forEach(field => {
    mapping[field] = null;
  });
  if (profiles.length === 0) return mapping;

  const used = {};
  IMPORT_REQUIRED_FIELDS.forEach(field => {
    let best = null;
    profiles.forEach(profile => {
      if (used[profile.colIndex]) return;
      const score = profile.fieldScores[field] || 0;
      if (!best || score > best.score) {
        best = { colIndex: profile.colIndex, score: score };
      }
    });
    if (best) {
      mapping[field] = best.colIndex;
      used[best.colIndex] = true;
    }
  });

  IMPORT_FIELD_ORDER.filter(field => IMPORT_REQUIRED_FIELDS.indexOf(field) === -1).forEach(field => {
    let best = null;
    profiles.forEach(profile => {
      if (used[profile.colIndex]) return;
      const score = profile.fieldScores[field] || 0;
      if (!best || score > best.score) {
        best = { colIndex: profile.colIndex, score: score };
      }
    });
    if (best && best.score >= 0.35) {
      mapping[field] = best.colIndex;
      used[best.colIndex] = true;
    }
  });

  return mapping;
}

function createImportManualMappingFromAuto(columnProfiles, autoFieldMap) {
  const mappingByColumn = {};
  (columnProfiles.profiles || []).forEach(profile => {
    mappingByColumn[String(profile.colIndex)] = 'ignore';
  });

  IMPORT_FIELD_ORDER.forEach(field => {
    const colIndex = autoFieldMap[field];
    if (colIndex === null || colIndex === undefined) return;
    mappingByColumn[String(colIndex)] = field;
  });

  return mappingByColumn;
}

function buildFieldMapFromManual(columnProfiles, mappingByColumn) {
  const fieldMap = {};
  IMPORT_FIELD_ORDER.forEach(field => {
    fieldMap[field] = null;
  });
  const duplicateAssignments = [];
  const profiles = columnProfiles.profiles || [];
  const profileByIndex = {};
  profiles.forEach(profile => {
    profileByIndex[String(profile.colIndex)] = profile;
  });

  Object.keys(mappingByColumn || {}).forEach(key => {
    const field = String(mappingByColumn[key] || 'ignore');
    if (field === 'ignore') return;
    if (!Object.prototype.hasOwnProperty.call(fieldMap, field)) return;
    const colIndex = parseInt(key, 10);
    const profile = profileByIndex[String(colIndex)];
    if (!profile) return;

    const payload = {
      colIndex: colIndex,
      confidence: Number(profile.fieldScores[field] || 0),
      source: 'manual',
      reason: `column_${colIndex + 1}, header="${profile.headerValue || '-'}"`
    };

    if (fieldMap[field]) {
      duplicateAssignments.push({
        field: field,
        keep: fieldMap[field].colIndex,
        dropped: colIndex
      });
      return;
    }
    fieldMap[field] = payload;
  });

  return {
    fieldMap: fieldMap,
    duplicateAssignments: duplicateAssignments
  };
}

function getImportConfidenceLevel(confidence) {
  const value = Number(confidence || 0);
  if (value >= 0.85) return 'HIGH';
  if (value >= 0.6) return 'MEDIUM';
  return 'LOW';
}

function parseSeasonFromInput(raw) {
  const input = String(raw || '').trim();
  let alias = normalizeSeasonAlias(input);
  if (!alias) {
    const m = input.match(/(\d{1,2})\s*기?/);
    if (m) {
      alias = normalizeSeasonAlias(m[1]);
    }
  }
  if (!alias) {
    return { valid: false, seasonAlias: '', seasonNo: NaN };
  }
  return {
    valid: true,
    seasonAlias: alias,
    seasonNo: parseInt(alias.replace('season_', ''), 10)
  };
}

function normalizeSeasonInputFieldValue() {
  const input = document.getElementById('importSeasonNoInput');
  if (!input) return null;
  const parsed = parseSeasonFromInput(input.value || '');
  if (!parsed.valid) return null;
  input.value = parsed.seasonAlias;
  return parsed;
}

function hasSeasonAliasInLoadedSheets(alias) {
  const targetAlias = normalizeSeasonAlias(alias);
  if (!targetAlias) return false;
  const sheetSelect = document.getElementById('sheetSelect');
  if (!sheetSelect) return false;
  return Array.from(sheetSelect.options || []).some(option => normalizeSeasonAlias(option.dataset ? option.dataset.alias : '') === targetAlias);
}

function getImportUiMode() {
  if (importPendingImportId) {
    return importServerMode === 'update' ? 'update' : 'create';
  }
  return importServerModeHint === 'update' ? 'update' : 'create';
}

function updateImportModeHintFromInput() {
  const input = document.getElementById('importSeasonNoInput');
  const parsed = parseSeasonFromInput(input ? input.value : '');
  importServerModeHint = (parsed.valid && hasSeasonAliasInLoadedSheets(parsed.seasonAlias)) ? 'update' : 'create';
  refreshImportModeUi();
}

function refreshImportModeUi() {
  const mode = getImportUiMode();
  const banner = document.getElementById('importModeHint');
  const checkboxText = document.getElementById('importPreviewConfirmText');

  if (banner) {
    banner.classList.remove('create', 'update');
    if (mode === 'update') {
      banner.classList.add('update');
      banner.textContent = '기존 시즌 감지: 업데이트 모드입니다. all 모드에서 OB+YB를 함께 반영할 수 있으며, M+ 출석 컬럼은 보호됩니다.';
    } else {
      banner.classList.add('create');
      banner.textContent = '신규 시즌 생성 모드입니다. 업로드 결과로 시즌 시트를 생성합니다.';
    }
  }

  if (checkboxText) {
    checkboxText.textContent = mode === 'update'
      ? '셀 단위 변경사항(OB/YB 포함 가능)을 확인했고, A~L 업데이트 반영에 동의합니다. (M+ 출석 컬럼 보호)'
      : '미리보기 결과를 확인했고, 시즌 생성/업로드를 진행합니다.';
  }

  setImportExecuteButtonLabel(!!(importPendingImportId && importServerMode === 'update' && importDiffState && importDiffToken));
}

function clearImportPendingState() {
  importPendingImportId = '';
  importServerMode = 'create';
  importDiffState = null;
  importDiffToken = '';
  importDiffFilterMode = 'all';
}

function toImportSessionShortId(importId) {
  const text = String(importId || '').trim();
  if (!text) return '-';
  return text.length > 10 ? `${text.slice(0, 8)}...` : text;
}

function canResumeActiveImportSession(activeImport, schemaSummaryJson) {
  if (!activeImport) return false;
  const targetMode = String(activeImport.targetMode || '').toLowerCase();
  if (targetMode !== 'update') return false;
  const activeSchemaSummary = String(activeImport.schemaSummaryJson || '');
  const incomingSchemaSummary = String(schemaSummaryJson || '');
  if (!activeSchemaSummary || !incomingSchemaSummary) return false;
  return activeSchemaSummary === incomingSchemaSummary;
}

async function abortImportSession(importId, reason, options) {
  const targetImportId = String(importId || '').trim();
  const opts = options || {};
  if (!targetImportId) {
    return { success: true, skipped: true };
  }

  if (importAbortInFlight && importAbortInFlight.importId === targetImportId) {
    return importAbortInFlight.promise;
  }

  const task = (async () => {
    try {
      const response = await CloudClubApi.call('seasonImportAbort', {
        importId: targetImportId,
        adminToken: adminToken
      });
      if (!response || !response.success) {
        const error = new Error((response && response.message) ? response.message : '업로드 세션 중단 실패');
        error.code = (response && response.errorCode) ? response.errorCode : 'IMPORT_ABORT_FAILED';
        return { success: false, importId: targetImportId, error: error };
      }
      return { success: true, importId: targetImportId, response: response };
    } catch (error) {
      console.error(`abort import session failed (${reason || 'unknown-reason'}):`, error);
      return { success: false, importId: targetImportId, error: error };
    }
  })();

  importAbortInFlight = {
    importId: targetImportId,
    promise: task
  };

  const result = await task;
  if (importAbortInFlight && importAbortInFlight.importId === targetImportId) {
    importAbortInFlight = null;
  }

  if (!result.success && !opts.quiet) {
    const message = getDisplayErrorMessage(result.error, '기존 업로드 세션 중단에 실패했습니다.');
    showToast(`<i class="fas fa-exclamation-triangle"></i> ${escapeHtml(message)}`, false);
  }

  return result;
}

async function discardPendingImportPreparation(reason, options) {
  const opts = options || {};
  const staleImportId = String(importPendingImportId || '').trim();
  clearImportPendingState();
  if (!staleImportId) {
    return { success: true, skipped: true };
  }
  return abortImportSession(staleImportId, reason || 'discard-pending-import', {
    quiet: !!opts.quiet
  });
}

function invalidatePendingImportPreparation(reason) {
  if (!importPendingImportId && !importDiffState && !importDiffToken) return;
  void discardPendingImportPreparation(reason || 'invalidate-pending-import', { quiet: true });
}

function findFallbackValueInRow(row, predicate) {
  for (let i = 0; i < row.length; i++) {
    const value = normalizeImportCell(row[i]);
    if (!value) continue;
    if (predicate(value)) {
      return { value: value, colIndex: i };
    }
  }
  return null;
}

function buildImportPreviewState(rawMatrix, inference, manualMapping, seasonInfo, importMode, options) {
  const opts = options || {};
  const modeHint = opts.modeHint === 'update' ? 'update' : 'create';
  const effectiveImportMode = importMode === 'yb' ? 'yb' : 'all';
  const effectiveScope = effectiveImportMode === 'yb' ? 'targetSeasonOnly' : 'all';
  const rows = rawMatrix || [];
  const columnPack = profileImportColumns(rows, inference.headerInfo);
  const built = buildFieldMapFromManual(columnPack, manualMapping || {});
  const fieldMap = built.fieldMap;
  const debugItems = [];
  const previewRows = [];
  const seenPhones = {};
  const stats = {
    valid_insert: 0,
    skip_duplicate: 0,
    drop_invalid: 0,
    skip_non_target: 0,
    skip_future: 0
  };

  built.duplicateAssignments.forEach(item => {
    debugItems.push({
      level: 'WARNING',
      code: `INF_DUPLICATE_FIELD_${item.field.toUpperCase()}`,
      message: `${IMPORT_FIELD_LABELS[item.field]} 필드에 다중 컬럼이 선택되어 첫 컬럼만 사용됩니다.`
    });
  });

  const requiredConfidence = {};

  IMPORT_REQUIRED_FIELDS.forEach(field => {
    requiredConfidence[field] = fieldMap[field] ? fieldMap[field].confidence : 0;
  });

  IMPORT_FIELD_ORDER.forEach(field => {
    const mapped = fieldMap[field];
    if (!mapped) {
      if (IMPORT_REQUIRED_FIELDS.indexOf(field) !== -1) {
        debugItems.push({
          level: 'BLOCKER',
          code: `INF_REQUIRED_FIELD_MISSING_${field.toUpperCase()}`,
          message: `필수 필드(${IMPORT_FIELD_LABELS[field]}) 컬럼 매핑이 없습니다.`
        });
      }
      return;
    }

    const level = getImportConfidenceLevel(mapped.confidence);
    if (IMPORT_REQUIRED_FIELDS.indexOf(field) !== -1 && level === 'LOW') {
      debugItems.push({
        level: 'BLOCKER',
        code: `INF_REQUIRED_LOW_CONF_${field.toUpperCase()}`,
        message: `필수 필드(${IMPORT_FIELD_LABELS[field]}) 신뢰도가 낮습니다 (${mapped.confidence.toFixed(2)}). 다른 컬럼으로 재매핑 후 다시 확인하세요.`
      });
    }
  });

  const requiredNeedsManualConfirm = IMPORT_REQUIRED_FIELDS.some(field => getImportConfidenceLevel(requiredConfidence[field]) !== 'HIGH');
  if (!importManualConfirmed && requiredNeedsManualConfirm) {
    debugItems.push({
      level: 'BLOCKER',
      code: 'INF_MANUAL_CONFIRM_REQUIRED',
      message: '필수 필드 신뢰도가 High가 아니므로 "현재 매핑 확정"을 먼저 실행해야 합니다.'
    });
  }

  const dataStart = inference.headerInfo.hasHeader ? (inference.headerInfo.headerRowIndex + 1) : 0;
  for (let index = dataStart; index < rows.length; index++) {
    const row = rows[index] || [];
    const rowNumber = index + 1;

    const fromMapped = (field) => {
      const mapped = fieldMap[field];
      if (!mapped) return { value: '', source: 'missing', colIndex: -1 };
      const value = normalizeImportCell(row[mapped.colIndex]);
      return {
        value: value,
        source: value ? 'column' : 'missing',
        colIndex: mapped.colIndex
      };
    };

    let nameSource = fromMapped('name');
    let seasonSource = fromMapped('season');
    let phoneSource = fromMapped('phone');
    let emailSource = fromMapped('email');
    let githubIdSource = fromMapped('githubId');
    let githubEmailSource = fromMapped('githubEmail');
    let notionEmailSource = fromMapped('notionEmail');
    let discordIdSource = fromMapped('discordId');
    let slackEmailSource = fromMapped('slackEmail');
    let feeCheckedSource = fromMapped('feeChecked');
    let completedSource = fromMapped('completed');
    let isStaffSource = fromMapped('isStaff');

    if (!phoneSource.value) {
      const fallback = findFallbackValueInRow(row, isLikelyImportPhone);
      if (fallback) {
        phoneSource = { value: fallback.value, source: 'row_fallback', colIndex: fallback.colIndex };
      }
    }

    if (!nameSource.value) {
      const fallback = findFallbackValueInRow(row, isLikelyNameValue);
      if (fallback) {
        nameSource = { value: fallback.value, source: 'row_fallback', colIndex: fallback.colIndex };
      }
    }

    if (!emailSource.value) {
      const fallback = findFallbackValueInRow(row, isValidImportEmailLocal);
      if (fallback) {
        emailSource = { value: fallback.value, source: 'row_fallback', colIndex: fallback.colIndex };
      }
    }

    if (!seasonSource.value) {
      const fallback = findFallbackValueInRow(row, value => !isNaN(parseImportSeasonNo(value)));
      if (fallback) {
        seasonSource = { value: fallback.value, source: 'row_fallback', colIndex: fallback.colIndex };
      }
    }

    const name = String(nameSource.value || '').trim();
    const seasonNo = parseImportSeasonNo(seasonSource.value || '');
    const phoneDigits = normalizeImportPhoneLocal(phoneSource.value || '');
    const phone = formatImportPhoneDisplay(phoneDigits || '');
    const email = String(emailSource.value || '').trim().toLowerCase();
    const githubId = String(githubIdSource.value || '').trim();
    const githubEmailRaw = String(githubEmailSource.value || '').trim().toLowerCase();
    const notionEmailRaw = String(notionEmailSource.value || '').trim().toLowerCase();
    const discordId = String(discordIdSource.value || '').trim();
    const slackEmailRaw = String(slackEmailSource.value || '').trim().toLowerCase();
    const githubEmail = githubEmailRaw && isValidImportEmailLocal(githubEmailRaw) ? githubEmailRaw : '';
    const notionEmail = notionEmailRaw && isValidImportEmailLocal(notionEmailRaw) ? notionEmailRaw : '';
    const slackEmail = slackEmailRaw && isValidImportEmailLocal(slackEmailRaw) ? slackEmailRaw : '';
    const feeCheckedParsed = parseImportBooleanLocal(feeCheckedSource.value);
    const completedParsed = parseImportBooleanLocal(completedSource.value);
    const isStaffParsed = parseImportBooleanLocal(isStaffSource.value);

    let status = 'VALID_INSERT';
    let reasonCode = '';
    let reason = '';
    let groupTag = '';

    if (!name) {
      status = 'DROP_INVALID';
      reasonCode = `ROW_${rowNumber}_MISSING_NAME`;
      reason = '이름을 찾을 수 없습니다.';
    } else if (!phoneDigits) {
      status = 'DROP_INVALID';
      reasonCode = `ROW_${rowNumber}_INVALID_PHONE`;
      reason = '전화번호 형식이 올바르지 않습니다.';
    } else if (!email || !isValidImportEmailLocal(email)) {
      status = 'DROP_INVALID';
      reasonCode = `ROW_${rowNumber}_INVALID_REQUIRED_EMAIL`;
      reason = '필수 이메일 형식이 올바르지 않습니다.';
    } else if (isNaN(seasonNo)) {
      status = 'DROP_INVALID';
      reasonCode = `ROW_${rowNumber}_INVALID_SEASON`;
      reason = '필수 Season 값이 없거나 형식이 올바르지 않습니다.';
    } else if (effectiveImportMode === 'yb' && seasonNo !== seasonInfo.seasonNo) {
      status = 'SKIP_NON_TARGET_COHORT';
      reasonCode = `ROW_${rowNumber}_NON_TARGET_COHORT`;
      reason = `YB 모드에서는 대상 시즌(${seasonInfo.seasonNo}기)만 반영합니다. 현재 행: ${seasonNo}기`;
    } else if (effectiveImportMode === 'all' && seasonNo > seasonInfo.seasonNo) {
      status = 'SKIP_FUTURE_COHORT';
      reasonCode = `ROW_${rowNumber}_SKIP_FUTURE_COHORT`;
      reason = `대상 시즌(${seasonInfo.seasonNo}기)보다 미래 기수(${seasonNo}기)는 반영하지 않습니다.`;
    } else if (seenPhones[phoneDigits]) {
      status = 'SKIP_DUPLICATE';
      reasonCode = `ROW_${rowNumber}_DUPLICATE_PHONE`;
      reason = '전화번호 기준 중복';
    }

    if (!isNaN(seasonNo)) {
      if (seasonNo === seasonInfo.seasonNo) {
        groupTag = 'YB';
      } else if (seasonNo < seasonInfo.seasonNo) {
        groupTag = 'OB';
      }
    }

    if (status === 'VALID_INSERT') {
      seenPhones[phoneDigits] = true;
      stats.valid_insert++;

      if (githubEmailRaw && !githubEmail) {
        debugItems.push({ level: 'WARNING', code: `ROW_${rowNumber}_INVALID_GITHUB_EMAIL`, message: 'Github Email 형식 오류로 빈 값 처리' });
      }
      if (notionEmailRaw && !notionEmail) {
        debugItems.push({ level: 'WARNING', code: `ROW_${rowNumber}_INVALID_NOTION_EMAIL`, message: 'Notion Email 형식 오류로 빈 값 처리' });
      }
      if (slackEmailRaw && !slackEmail) {
        debugItems.push({ level: 'WARNING', code: `ROW_${rowNumber}_INVALID_SLACK_EMAIL`, message: 'Slack Email 형식 오류로 빈 값 처리' });
      }
      if (!feeCheckedParsed.valid) {
        debugItems.push({ level: 'WARNING', code: `ROW_${rowNumber}_INVALID_FEE_CHECKED`, message: '회비 체크 값이 불명확해 FALSE 기본값으로 보정' });
      }
      if (!completedParsed.valid) {
        debugItems.push({ level: 'WARNING', code: `ROW_${rowNumber}_INVALID_COMPLETED`, message: '수료 여부 값이 불명확해 FALSE 기본값으로 보정' });
      }
      if (!isStaffParsed.valid) {
        debugItems.push({ level: 'WARNING', code: `ROW_${rowNumber}_INVALID_IS_STAFF`, message: '운영진 여부 값이 불명확해 FALSE 기본값으로 보정' });
      }
    } else if (status === 'SKIP_DUPLICATE') {
      stats.skip_duplicate++;
    } else if (status === 'SKIP_NON_TARGET_COHORT') {
      stats.skip_non_target++;
    } else if (status === 'SKIP_FUTURE_COHORT') {
      stats.skip_non_target++;
      stats.skip_future++;
    } else {
      stats.drop_invalid++;
    }

    if (status !== 'VALID_INSERT') {
      debugItems.push({
        level: 'WARNING',
        code: reasonCode,
        message: reason
      });
    }

    previewRows.push({
      rowNumber: rowNumber,
      status: status,
      reasonCode: reasonCode,
      reason: reason,
      groupTag: groupTag,
      name: name,
      season: seasonNo,
      seasonLabel: !isNaN(seasonNo) ? `${seasonNo}기` : '',
      phone: phone || String(phoneSource.value || '').trim(),
      email: email,
      githubId: githubId,
      githubEmail: githubEmail,
      notionEmail: notionEmail,
      discordId: discordId,
      slackEmail: slackEmail,
      feeChecked: !!feeCheckedParsed.value,
      completed: !!completedParsed.value,
      isStaff: !!isStaffParsed.value,
      provenance: {
        name: nameSource.source,
        season: seasonSource.source,
        phone: phoneSource.source,
        email: emailSource.source,
        githubId: githubIdSource.source,
        githubEmail: githubEmailSource.source,
        notionEmail: notionEmailSource.source,
        discordId: discordIdSource.source,
        slackEmail: slackEmailSource.source,
        feeChecked: feeCheckedSource.source,
        completed: completedSource.source,
        isStaff: isStaffSource.source
      }
    });
  }

  if (stats.valid_insert <= 0) {
    debugItems.push({
      level: 'BLOCKER',
      code: 'INF_NO_VALID_ROWS',
      message: '반영 가능한 유효 행이 없습니다.'
    });
  }

  const blockers = debugItems.filter(item => item.level === 'BLOCKER');
  return {
    fieldMap: fieldMap,
    previewRows: previewRows,
    debugItems: debugItems,
    blockers: blockers,
    stats: stats,
    seasonInfo: seasonInfo,
    importMode: importMode,
    effectiveImportMode: effectiveImportMode,
    effectiveScope: effectiveScope,
    modeHint: modeHint
  };
}

function renderImportSchemaInference(inference, previewState) {
  const wrap = document.getElementById('importSchemaInferenceWrap');
  if (!wrap) return;

  if (!inference) {
    wrap.innerHTML = '<p class="info-text">분석 전입니다.</p>';
    return;
  }

  const rows = IMPORT_FIELD_ORDER.map(field => {
    const mapped = (previewState && previewState.fieldMap) ? previewState.fieldMap[field] : null;
    const label = mapped
      ? `Column ${mapped.colIndex + 1}`
      : '-';
    const confidence = mapped ? Number(mapped.confidence || 0) : 0;
    const level = getImportConfidenceLevel(confidence);
    const levelClass = level === 'HIGH' ? 'pass' : (level === 'MEDIUM' ? 'warn' : 'fail');
    const reason = mapped ? escapeHtml(mapped.reason || '') : '매핑 없음';
    return `
      <tr>
        <td>${escapeHtml(IMPORT_FIELD_LABELS[field])}</td>
        <td>${escapeHtml(label)}</td>
        <td><span class="import-chip ${levelClass}">${level} (${confidence.toFixed(2)})</span></td>
        <td>${reason}</td>
      </tr>
    `;
  }).join('');

  const headerInfoText = inference.headerInfo.hasHeader
    ? `헤더 행 감지: ${inference.headerInfo.headerRowIndex + 1}행`
    : '헤더 미확정(데이터 행 기준 추론)';
  wrap.innerHTML = `
    <p class="info-text">${escapeHtml(headerInfoText)} / 분석 행수: ${inference.columnPack.rowCount}행</p>
    <table class="management-table import-mapping-table">
      <thead>
        <tr>
          <th>필드</th>
          <th>매핑 컬럼</th>
          <th>신뢰도</th>
          <th>근거</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

function renderImportManualMapping(inference) {
  const wrap = document.getElementById('importManualMappingWrap');
  if (!wrap) return;
  if (!inference || !inference.columnPack || !Array.isArray(inference.columnPack.profiles) || inference.columnPack.profiles.length === 0) {
    wrap.innerHTML = '<p class="info-text">분석 후 수동 매핑 항목이 표시됩니다.</p>';
    return;
  }

  const rows = inference.columnPack.profiles.map(profile => {
    const colKey = String(profile.colIndex);
    const selected = String(importManualMapping[colKey] || 'ignore');
    const samples = profile.samples && profile.samples.length > 0
      ? profile.samples.map(v => escapeHtml(v)).join(' / ')
      : '-';

    const options = [{ value: 'ignore', label: IMPORT_FIELD_LABELS.ignore }]
      .concat(IMPORT_FIELD_ORDER.map(field => ({ value: field, label: IMPORT_FIELD_LABELS[field] || field })))
      .map(opt => `<option value="${opt.value}" ${selected === opt.value ? 'selected' : ''}>${escapeHtml(opt.label)}</option>`)
      .join('');

    return `
      <tr>
        <td>Column ${profile.colIndex + 1}</td>
        <td>${escapeHtml(profile.headerValue || '-')}</td>
        <td>${samples}</td>
        <td>
          <select class="import-mapping-select" onchange="onImportMappingChanged(${profile.colIndex}, this.value)">
            ${options}
          </select>
        </td>
      </tr>
    `;
  }).join('');

  wrap.innerHTML = `
    <table class="management-table import-mapping-table">
      <thead>
        <tr>
          <th>소스 컬럼</th>
          <th>헤더</th>
          <th>샘플 값</th>
          <th>수동 매핑</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function renderImportDebug(debugItems) {
  const wrap = document.getElementById('importDebugWrap');
  if (!wrap) return;
  if (!Array.isArray(debugItems) || debugItems.length === 0) {
    wrap.innerHTML = '<p class="info-text">표시할 디버그 메시지가 없습니다.</p>';
    return;
  }

  wrap.innerHTML = debugItems.map(item => {
    const level = String(item.level || 'INFO').toUpperCase();
    const levelClass = level === 'BLOCKER' ? 'blocker' : (level === 'WARNING' ? 'warning' : 'info');
    return `
      <div class="import-debug-item ${levelClass}">
        <strong>[${escapeHtml(level)}] ${escapeHtml(item.code || '-')}</strong><br>
        <span>${escapeHtml(item.message || '')}</span>
      </div>
    `;
  }).join('');
}

function formatImportPreviewFieldValue(field, value, fallback) {
  if (field === 'season') {
    if (!isNaN(parseImportSeasonNo(value))) return `${parseImportSeasonNo(value)}기`;
    if (!isNaN(parseImportSeasonNo(fallback))) return `${parseImportSeasonNo(fallback)}기`;
    const text = String(value || fallback || '').trim();
    return text || '-';
  }
  if (field === 'feeChecked' || field === 'completed' || field === 'isStaff') {
    return value ? 'TRUE' : 'FALSE';
  }
  const text = String(value === undefined || value === null ? (fallback || '') : value).trim();
  return text || '-';
}

function getImportCellDiffClass(kind) {
  if (kind === 'add') return 'cell-diff-add';
  if (kind === 'update') return 'cell-diff-update';
  if (kind === 'delete') return 'cell-diff-delete';
  return '';
}

function renderImportPreview(previewState) {
  const summaryNode = document.getElementById('importPreviewSummary');
  const wrap = document.getElementById('importPreviewWrap');
  const diffMetaNode = document.getElementById('importDiffMeta');
  const diffControlsNode = document.getElementById('importDiffControls');
  const diffFilterSelect = document.getElementById('importDiffFilterSelect');
  if (!summaryNode || !wrap) return;

  if (!previewState) {
    summaryNode.innerHTML = '';
    wrap.innerHTML = '<p class="info-text">분석 후 미리보기 테이블이 표시됩니다.</p>';
    if (diffMetaNode) diffMetaNode.innerHTML = '';
    if (diffControlsNode) diffControlsNode.style.display = 'none';
    return;
  }

  const mode = getImportUiMode();
  const diffActive = mode === 'update' && importDiffState && importDiffState.success;
  const rowDiffByPhone = diffActive && importDiffState.rowDiffByPhone ? importDiffState.rowDiffByPhone : {};
  const cellDiffByPhone = diffActive && importDiffState.cellDiffByPhone ? importDiffState.cellDiffByPhone : {};
  const stats = previewState.stats || {};
  const diffSummary = (diffActive && importDiffState.summary) ? importDiffState.summary : null;
  const sameCount = diffActive
    ? Object.values(rowDiffByPhone).filter(item => item && item.rowType === 'SAME').length
    : 0;

  const summaryParts = [
    `<span class="import-chip pass">INSERT ${stats.valid_insert || 0}</span>`,
    `<span class="import-chip warn">SKIP_DUPLICATE ${stats.skip_duplicate || 0}</span>`,
    `<span class="import-chip warn">SKIP_NON_TARGET ${stats.skip_non_target || 0}</span>`,
    `<span class="import-chip warn">SKIP_FUTURE ${stats.skip_future || 0}</span>`,
    `<span class="import-chip fail">DROP_INVALID ${stats.drop_invalid || 0}</span>`
  ];
  if (diffSummary) {
    summaryParts.push(`<span class="import-chip pass">ADD ${Number(diffSummary.addCount || 0)}</span>`);
    summaryParts.push(`<span class="import-chip warn">UPDATE ${Number(diffSummary.updateFieldCount || 0)}</span>`);
    summaryParts.push(`<span class="import-chip">SAME ${sameCount}</span>`);
    summaryParts.push(`<span class="import-chip fail">DELETE_CANDIDATE ${Number(diffSummary.deleteCandidateCount || 0)}</span>`);
  }
  summaryNode.innerHTML = summaryParts.join('');

  if (diffFilterSelect) {
    diffFilterSelect.value = importDiffFilterMode;
  }
  if (diffActive) {
    const rawToken = String(importDiffToken || importDiffState.diffToken || '').trim();
    const tokenLabel = rawToken
      ? (rawToken.length > 18 ? `${rawToken.slice(0, 8)}...${rawToken.slice(-6)}` : rawToken)
      : '-';
    const targetSheetName = String(importDiffState.targetSheetName || '').trim() || '-';
    if (diffMetaNode) {
      diffMetaNode.innerHTML =
        `<span class="import-chip">TARGET ${escapeHtml(targetSheetName)}</span>` +
        `<span class="import-chip">DIFF_TOKEN ${escapeHtml(tokenLabel)}</span>`;
    }
    if (diffControlsNode) {
      diffControlsNode.style.display = 'flex';
    }
  } else {
    importDiffFilterMode = 'all';
    if (diffMetaNode) diffMetaNode.innerHTML = '';
    if (diffControlsNode) diffControlsNode.style.display = 'none';
  }

  const rowHtml = [];
  const phoneSeenInPreview = {};
  const changedOnlyMode = diffActive && importDiffFilterMode === 'changed';

  function renderDataCell(item, phoneKey, field, fallbackValue, beforeValueFromDiff) {
    const valueText = formatImportPreviewFieldValue(field, item[field], fallbackValue);
    const diffKind = (diffActive && phoneKey && cellDiffByPhone[phoneKey]) ? cellDiffByPhone[phoneKey][field] : '';
    const cellClass = getImportCellDiffClass(diffKind);
    let titleText = '';
    if (diffKind === 'update' && beforeValueFromDiff !== undefined) {
      const beforeText = formatImportPreviewFieldValue(field, beforeValueFromDiff, '');
      titleText = ` title="이전 값: ${escapeHtml(beforeText)}"`;
    }
    return `<td class="${cellClass}"${titleText}>${escapeHtml(valueText)}</td>`;
  }

  (previewState.previewRows || []).forEach(item => {
    const phoneKey = normalizeImportPhoneLocal(item.phone || '');
    if (phoneKey) phoneSeenInPreview[phoneKey] = true;

    let statusLabel = 'INSERT';
    let chipClass = 'insert';
    let diffRow = null;

    if (item.status === 'SKIP_DUPLICATE') {
      statusLabel = 'SKIP_DUP';
      chipClass = 'skip';
    } else if (item.status === 'SKIP_NON_TARGET_COHORT') {
      statusLabel = 'SKIP_COHORT';
      chipClass = 'skip';
    } else if (item.status === 'SKIP_FUTURE_COHORT') {
      statusLabel = 'SKIP_FUTURE';
      chipClass = 'skip';
    } else if (item.status === 'DROP_INVALID') {
      statusLabel = 'DROP';
      chipClass = 'drop';
    } else if (diffActive && phoneKey && rowDiffByPhone[phoneKey]) {
      diffRow = rowDiffByPhone[phoneKey];
      if (diffRow.rowType === 'ADD') {
        statusLabel = 'ADD';
        chipClass = 'insert';
      } else if (diffRow.rowType === 'UPDATE') {
        statusLabel = 'UPDATE';
        chipClass = 'possible';
      } else if (diffRow.rowType === 'SAME') {
        statusLabel = 'SAME';
        chipClass = 'pass';
      }
    }

    const before = diffRow && diffRow.before ? diffRow.before : {};
    const remarkParts = [];
    if (item.groupTag === 'OB') {
      remarkParts.push('OB 포함');
    } else if (item.groupTag === 'YB') {
      remarkParts.push('YB');
    }
    if (item.reason) {
      remarkParts.push(item.reason);
    } else if (item.reasonCode) {
      remarkParts.push(item.reasonCode);
    }
    const remarkText = remarkParts.length > 0 ? remarkParts.join(' | ') : '-';
    const isChangedRow = statusLabel === 'ADD' || statusLabel === 'UPDATE';
    if (changedOnlyMode && !isChangedRow) {
      return;
    }

    rowHtml.push(`
      <tr>
        <td>${item.rowNumber}</td>
        <td class="status-cell"><span class="status-chip ${chipClass}">${statusLabel}</span></td>
        ${renderDataCell(item, phoneKey, 'name', '', before.name)}
        ${renderDataCell(item, phoneKey, 'season', item.seasonLabel || '', before.season)}
        ${renderDataCell(item, phoneKey, 'phone', '', before.phone)}
        ${renderDataCell(item, phoneKey, 'email', '', before.email)}
        ${renderDataCell(item, phoneKey, 'githubId', '', before.githubId)}
        ${renderDataCell(item, phoneKey, 'githubEmail', '', before.githubEmail)}
        ${renderDataCell(item, phoneKey, 'notionEmail', '', before.notionEmail)}
        ${renderDataCell(item, phoneKey, 'discordId', '', before.discordId)}
        ${renderDataCell(item, phoneKey, 'slackEmail', '', before.slackEmail)}
        ${renderDataCell(item, phoneKey, 'feeChecked', '', before.feeChecked)}
        ${renderDataCell(item, phoneKey, 'completed', '', before.completed)}
        ${renderDataCell(item, phoneKey, 'isStaff', '', before.isStaff)}
        <td>${escapeHtml(remarkText)}</td>
      </tr>
    `);
  });

  if (diffActive) {
    Object.keys(rowDiffByPhone || {}).forEach(phoneKey => {
      if (phoneSeenInPreview[phoneKey]) return;
      const diffRow = rowDiffByPhone[phoneKey];
      if (!diffRow || diffRow.rowType !== 'DELETE_CANDIDATE' || !diffRow.before) return;
      const before = diffRow.before;
      const rowItem = {
        rowNumber: '-',
        reasonCode: 'DELETE_CANDIDATE',
        name: before.name,
        seasonLabel: before.seasonLabel,
        phone: before.phone,
        email: before.email,
        githubId: before.githubId,
        githubEmail: before.githubEmail,
        notionEmail: before.notionEmail,
        discordId: before.discordId,
        slackEmail: before.slackEmail,
        feeChecked: !!before.feeChecked,
        completed: !!before.completed,
        isStaff: !!before.isStaff
      };
      rowHtml.push(`
        <tr>
          <td>${rowItem.rowNumber}</td>
          <td class="status-cell"><span class="status-chip drop">DELETE_CANDIDATE</span></td>
          ${renderDataCell(rowItem, phoneKey, 'name', '', undefined)}
          ${renderDataCell(rowItem, phoneKey, 'season', rowItem.seasonLabel || '', undefined)}
          ${renderDataCell(rowItem, phoneKey, 'phone', '', undefined)}
          ${renderDataCell(rowItem, phoneKey, 'email', '', undefined)}
          ${renderDataCell(rowItem, phoneKey, 'githubId', '', undefined)}
          ${renderDataCell(rowItem, phoneKey, 'githubEmail', '', undefined)}
          ${renderDataCell(rowItem, phoneKey, 'notionEmail', '', undefined)}
          ${renderDataCell(rowItem, phoneKey, 'discordId', '', undefined)}
          ${renderDataCell(rowItem, phoneKey, 'slackEmail', '', undefined)}
          ${renderDataCell(rowItem, phoneKey, 'feeChecked', '', undefined)}
          ${renderDataCell(rowItem, phoneKey, 'completed', '', undefined)}
          ${renderDataCell(rowItem, phoneKey, 'isStaff', '', undefined)}
          <td>삭제 후보 (자동 반영 안 함)</td>
        </tr>
      `);
    });
  }

  if (rowHtml.length === 0) {
    rowHtml.push('<tr><td colspan="15">표시할 행이 없습니다. (필터 조건 확인)</td></tr>');
  }

  wrap.innerHTML = `
    <table class="management-table import-preview-table">
      <thead>
        <tr>
          <th>원본 행</th>
          <th>상태</th>
          <th>이름(A)</th>
          <th>Season(B)</th>
          <th>전화번호(C)</th>
          <th>Email(D)</th>
          <th>Github ID(E)</th>
          <th>Github Email(F)</th>
          <th>Notion Email(G)</th>
          <th>Discord ID(H)</th>
          <th>Slack Email(I)</th>
          <th>회비 체크(J)</th>
          <th>수료 여부(K)</th>
          <th>운영진 여부(L)</th>
          <th>비고</th>
        </tr>
      </thead>
      <tbody>${rowHtml.join('')}</tbody>
    </table>
  `;
}

function onImportDiffFilterChange(value) {
  importDiffFilterMode = String(value || '').toLowerCase() === 'changed' ? 'changed' : 'all';
  renderImportPreview(importPreviewState);
}

function refreshImportExecuteButtonState() {
  const btn = document.getElementById('importExecuteBtn');
  if (!btn) return;

  const previewConfirmed = !!(document.getElementById('importPreviewConfirmed') && document.getElementById('importPreviewConfirmed').checked);
  const hasBlocker = !!(importPreviewState && Array.isArray(importPreviewState.blockers) && importPreviewState.blockers.length > 0);
  const baseReady = !!importPreviewState && !hasBlocker && previewConfirmed;
  if (!baseReady) {
    btn.disabled = true;
    return;
  }

  if (importPendingImportId && importServerMode === 'update') {
    btn.disabled = !importDiffState || !importDiffToken;
    return;
  }

  btn.disabled = false;
}

function rebuildImportPreview() {
  if (!importRawMatrix || !importInference || !importFileMeta) return;

  const seasonInfo = parseSeasonFromInput(document.getElementById('importSeasonNoInput') ? document.getElementById('importSeasonNoInput').value : '');
  if (!seasonInfo.valid) {
    importServerModeHint = 'create';
    importPreviewState = null;
    importDebugReport = {
      generatedAt: Date.now(),
      fileMeta: importFileMeta,
      items: [{
        level: 'BLOCKER',
        code: 'INVALID_SEASON_INPUT',
        message: '시즌 번호 입력이 올바르지 않습니다.'
      }]
    };
    renderImportDebug(importDebugReport.items);
    renderImportPreview(null);
    refreshImportModeUi();
    refreshImportExecuteButtonState();
    return;
  }

  importServerModeHint = hasSeasonAliasInLoadedSheets(seasonInfo.seasonAlias) ? 'update' : 'create';
  refreshImportModeUi();

  const importMode = String(document.getElementById('importModeSelect') ? document.getElementById('importModeSelect').value : 'all');
  importPreviewState = buildImportPreviewState(importRawMatrix, importInference, importManualMapping, seasonInfo, importMode, {
    modeHint: getImportUiMode()
  });
  importDebugReport = {
    generatedAt: Date.now(),
    fileMeta: importFileMeta,
    seasonAlias: seasonInfo.seasonAlias,
    importMode: importMode,
    effectiveImportMode: importPreviewState.effectiveImportMode,
    effectiveScope: importPreviewState.effectiveScope,
    blockers: importPreviewState.blockers,
    stats: importPreviewState.stats,
    items: importPreviewState.debugItems
  };

  renderImportSchemaInference(importInference, importPreviewState);
  renderImportManualMapping(importInference);
  renderImportDebug(importPreviewState.debugItems);
  renderImportPreview(importPreviewState);
  refreshImportExecuteButtonState();
}

async function analyzeImportFile() {
  const fileInput = document.getElementById('importFileInput');
  const file = fileInput && fileInput.files ? fileInput.files[0] : null;
  if (!file) {
    alert('업로드할 파일을 선택해주세요.');
    return;
  }

  try {
    await ensureImportParsersReady();
  } catch (error) {
    alert('파서 라이브러리를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
    return;
  }

  const normalizedSeason = normalizeSeasonInputFieldValue();
  const seasonInfo = normalizedSeason || parseSeasonFromInput(document.getElementById('importSeasonNoInput') ? document.getElementById('importSeasonNoInput').value : '');
  if (!seasonInfo.valid) {
    alert('시즌 번호를 입력해주세요. (예: 9 또는 season_09)');
    return;
  }

  try {
    showBoxMessage('importAnalyzeResult', '분석 중입니다. 잠시만 기다려주세요...', true);
    await discardPendingImportPreparation('analyze-import-file', { quiet: true });
    const loaded = await loadImportMatrixFromFile(file);
    importRawMatrix = loaded.matrix || [];
    importFileMeta = {
      name: file.name,
      size: file.size,
      parser: loaded.parser || '',
      sheetName: loaded.sheetName || ''
    };

    if (importRawMatrix.length === 0) {
      showBoxMessage('importAnalyzeResult', '❌ 파일에서 읽을 수 있는 데이터가 없습니다.', false);
      resetImportFlow(false);
      return;
    }

    const headerInfo = detectImportHeaderRow(importRawMatrix);
    const columnPack = profileImportColumns(importRawMatrix, headerInfo);
    const autoFieldMap = inferImportAutoMapping(columnPack);
    importInference = {
      headerInfo: headerInfo,
      columnPack: columnPack,
      autoFieldMap: autoFieldMap
    };
    importManualMapping = createImportManualMappingFromAuto(columnPack, autoFieldMap);
    importManualConfirmed = false;
    clearImportPendingState();
    const previewConfirm = document.getElementById('importPreviewConfirmed');
    if (previewConfirm) previewConfirm.checked = false;
    refreshImportModeUi();

    rebuildImportPreview();
    showBoxMessage('importAnalyzeResult', `✅ 분석 완료: ${escapeHtml(file.name)} (${columnPack.rowCount}행)`, true);
  } catch (error) {
    showBoxMessage('importAnalyzeResult', `❌ 분석 실패: ${escapeHtml(error.message || '알 수 없는 오류')}`, false);
  }
}

function onImportMappingChanged(colIndex, fieldValue) {
  invalidatePendingImportPreparation('mapping-changed');
  importManualMapping[String(colIndex)] = String(fieldValue || 'ignore');
  importManualConfirmed = false;
  rebuildImportPreview();
}

function confirmImportManualMapping() {
  if (!importInference) {
    alert('먼저 파일 분석을 진행해주세요.');
    return;
  }
  importManualConfirmed = true;
  rebuildImportPreview();
  showToast('<i class="fas fa-check-circle"></i> 수동 매핑을 확정했습니다.', true);
}

function resetImportFlow(resetFileInput) {
  invalidatePendingImportPreparation('reset-import-flow');
  importRawMatrix = [];
  importFileMeta = null;
  importInference = null;
  importManualMapping = {};
  importManualConfirmed = false;
  importPreviewState = null;
  importDebugReport = null;
  importServerModeHint = 'create';
  clearImportPendingState();

  if (resetFileInput !== false) {
    const fileInput = document.getElementById('importFileInput');
    if (fileInput) fileInput.value = '';
  }

  const previewConfirm = document.getElementById('importPreviewConfirmed');
  if (previewConfirm) previewConfirm.checked = false;

  renderImportSchemaInference(null, null);
  renderImportManualMapping(null);
  renderImportDebug([]);
  renderImportPreview(null);
  updateImportModeHintFromInput();
  refreshImportExecuteButtonState();
}

function downloadImportDebugJson() {
  if (!importDebugReport) {
    alert('다운로드할 디버그 데이터가 없습니다.');
    return;
  }

  const blob = new Blob([JSON.stringify(importDebugReport, null, 2)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `import-debug-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function buildImportSchemaSummary() {
  if (!importInference || !importPreviewState) return {};
  const mapping = {};
  IMPORT_FIELD_ORDER.forEach(field => {
    const mapped = importPreviewState.fieldMap[field];
    mapping[field] = mapped ? {
      column: mapped.colIndex + 1,
      confidence: Number(mapped.confidence || 0),
      source: mapped.source || 'manual'
    } : null;
  });

  return {
    fileName: importFileMeta ? importFileMeta.name : '',
    parser: importFileMeta ? importFileMeta.parser : '',
    sheetName: importFileMeta ? importFileMeta.sheetName : '',
    hasHeader: !!(importInference.headerInfo && importInference.headerInfo.hasHeader),
    headerRowIndex: importInference.headerInfo ? importInference.headerInfo.headerRowIndex : -1,
    mapping: mapping,
    stats: importPreviewState.stats || {},
    debugCount: importDebugReport && Array.isArray(importDebugReport.items) ? importDebugReport.items.length : 0
  };
}

function buildImportPayloadChunks(rows, maxEncodedSize) {
  const limit = Math.max(2000, Number(maxEncodedSize || 4500));
  const chunks = [];
  let current = [];

  const flush = () => {
    if (current.length > 0) {
      chunks.push(current);
      current = [];
    }
  };

  rows.forEach(item => {
    const candidate = current.concat([item]);
    const encodedLength = encodeURIComponent(JSON.stringify(candidate)).length;
    if (encodedLength > limit && current.length > 0) {
      flush();
      current.push(item);
    } else {
      current = candidate;
    }
  });
  flush();
  return chunks;
}

async function fetchSeasonImportDiff(importId) {
  const response = await CloudClubApi.call('seasonImportDiff', {
    importId: importId,
    limit: 500,
    offset: 0,
    adminToken: adminToken
  });

  if (!response || !response.success) {
    const error = new Error((response && response.message) ? response.message : '변경사항 Diff 계산 실패');
    error.code = (response && response.errorCode) ? response.errorCode : 'IMPORT_DIFF_FAILED';
    throw error;
  }

  return response;
}

function applyImportDiffState(diffResponse, options) {
  const opts = options || {};
  importDiffState = diffResponse;
  importDiffToken = String(diffResponse && diffResponse.diffToken ? diffResponse.diffToken : '');
  if (!importDiffToken) {
    const error = new Error('변경사항 토큰을 생성하지 못했습니다.');
    error.code = 'DIFF_TOKEN_MISSING';
    throw error;
  }
  if (opts.resetFilter !== false) {
    importDiffFilterMode = 'all';
  }
}

async function beginImportSessionWithRecovery(seasonInfo, importMode, schemaSummaryJson, setProgress) {
  const beginPayload = {
    season: seasonInfo.seasonAlias,
    importMode: importMode,
    schemaSummaryJson: schemaSummaryJson,
    adminToken: adminToken
  };

  let begin = await CloudClubApi.call('seasonImportBegin', beginPayload);
  if (begin && begin.success && begin.importId) {
    return {
      success: true,
      importId: String(begin.importId),
      targetMode: String(begin.targetMode || 'create'),
      recoveredFromActive: false
    };
  }

  if (!(begin && begin.errorCode === 'IMPORT_ALREADY_ACTIVE' && begin.importId)) {
    return {
      success: false,
      errorCode: begin && begin.errorCode ? begin.errorCode : 'IMPORT_BEGIN_FAILED',
      message: begin && begin.message ? begin.message : '업로드 시작 중 오류가 발생했습니다.'
    };
  }

  const activeImport = begin.activeImport || null;
  const activeImportId = String(begin.importId || '').trim();
  if (!activeImportId) {
    return {
      success: false,
      errorCode: 'IMPORT_ALREADY_ACTIVE',
      message: begin.message || '진행 중 업로드가 감지되었지만 세션 ID가 없습니다.'
    };
  }

  const canResume = canResumeActiveImportSession(activeImport, schemaSummaryJson);
  if (canResume) {
    const shortId = toImportSessionShortId(activeImportId);
    setProgress(
      `⚠️ 기존 진행 세션(${escapeHtml(shortId)})이 감지되었습니다. 같은 설정으로 이어서 반영합니다.`,
      true
    );
    return {
      success: true,
      importId: activeImportId,
      targetMode: 'update',
      recoveredFromActive: true
    };
  }

  const shortId = toImportSessionShortId(activeImportId);
  setProgress(
    `⚠️ 기존 진행 세션(${escapeHtml(shortId)})이 현재 분석 정보와 달라 자동 중단 후 새로 시작합니다.`,
    true
  );
  const aborted = await abortImportSession(activeImportId, 'begin-active-conflict', { quiet: true });
  if (!aborted.success) {
    return {
      success: false,
      errorCode: 'IMPORT_ABORT_FAILED',
      message: `기존 진행 세션(${shortId}) 중단에 실패했습니다. 잠시 후 다시 시도해주세요.`
    };
  }

  begin = await CloudClubApi.call('seasonImportBegin', beginPayload);
  if (begin && begin.success && begin.importId) {
    return {
      success: true,
      importId: String(begin.importId),
      targetMode: String(begin.targetMode || 'create'),
      recoveredFromActive: false
    };
  }

  return {
    success: false,
    errorCode: begin && begin.errorCode ? begin.errorCode : 'IMPORT_BEGIN_FAILED',
    message: begin && begin.message ? begin.message : '업로드 세션 재시작에 실패했습니다.'
  };
}

async function executeSeasonImport() {
  if (!importPreviewState) {
    alert('먼저 파일 분석을 진행해주세요.');
    return;
  }
  if (importPreviewState.blockers && importPreviewState.blockers.length > 0) {
    alert('BLOCKER가 남아 있어 업로드를 진행할 수 없습니다. 디버그 메시지를 확인해주세요.');
    return;
  }

  const previewConfirm = document.getElementById('importPreviewConfirmed');
  if (!previewConfirm || !previewConfirm.checked) {
    alert('미리보기 확인 체크를 먼저 진행해주세요.');
    return;
  }

  const normalizedSeason = normalizeSeasonInputFieldValue();
  const seasonInfo = normalizedSeason || importPreviewState.seasonInfo;
  const importMode = importPreviewState.importMode;
  const schemaSummaryJson = JSON.stringify(buildImportSchemaSummary());
  const candidates = (importPreviewState.previewRows || [])
    .filter(row => row.status === 'VALID_INSERT')
    .map(row => ({
      sourceRow: row.rowNumber,
      name: row.name,
      season: row.season,
      phone: row.phone,
      email: row.email,
      githubId: row.githubId,
      githubEmail: row.githubEmail,
      notionEmail: row.notionEmail,
      discordId: row.discordId,
      slackEmail: row.slackEmail,
      feeChecked: row.feeChecked,
      completed: row.completed,
      isStaff: row.isStaff
    }));

  if (candidates.length === 0) {
    alert('반영 가능한 유효 데이터가 없습니다.');
    return;
  }

  const executeResult = document.getElementById('importExecuteResult');
  const setProgress = (html, success) => {
    if (!executeResult) return;
    executeResult.className = success ? 'success' : 'error';
    executeResult.innerHTML = html;
    executeResult.style.display = 'block';
  };

  const executeBtn = document.getElementById('importExecuteBtn');
  if (executeBtn) executeBtn.disabled = true;

  let importId = importPendingImportId || '';
  let shouldUploadChunks = false;
  try {
    if (!importPendingImportId) {
      const beginResult = await beginImportSessionWithRecovery(
        seasonInfo,
        importMode,
        schemaSummaryJson,
        setProgress
      );

      if (!beginResult.success || !beginResult.importId) {
        setProgress(`❌ 업로드 시작 실패: ${escapeHtml(beginResult.message || '알 수 없는 오류')}`, false);
        refreshImportExecuteButtonState();
        return;
      }

      importId = beginResult.importId;
      importPendingImportId = importId;
      importServerMode = String(beginResult.targetMode || 'create');
      importServerModeHint = importServerMode;
      shouldUploadChunks = true;

      setProgress(
        beginResult.recoveredFromActive
          ? '기존 진행 세션을 이어받았습니다. 현재 파일 기준으로 데이터 동기화 중...'
          : '업로드 세션 생성 완료. 데이터 전송 중...',
        true
      );
      refreshImportModeUi();
    }

    if (shouldUploadChunks) {
      const chunks = buildImportPayloadChunks(candidates, 4200);
      let cumulative = {
        inserted_count: 0,
        skipped_duplicate_count: 0,
        dropped_invalid_count: 0,
        skipped_non_target_count: 0
      };

      for (let i = 0; i < chunks.length; i++) {
        const response = await CloudClubApi.call('seasonImportChunk', {
          importId: importId,
          chunkSeq: i + 1,
          rowsJson: JSON.stringify(chunks[i]),
          adminToken: adminToken
        });

        if (!response.success) {
          throw new Error(response.message || `청크 ${i + 1} 업로드 실패`);
        }

        cumulative = response.cumulative || cumulative;
        setProgress(
          `청크 업로드 진행 중... (${i + 1}/${chunks.length})<br>` +
          `INSERT ${cumulative.inserted_count} / DUP ${cumulative.skipped_duplicate_count} / ` +
          `DROP ${cumulative.dropped_invalid_count} / SKIP_COHORT ${cumulative.skipped_non_target_count}`,
          true
        );
      }
      if (importServerMode === 'update') {
        importDiffState = null;
        importDiffToken = '';
      }
    }

    if (importServerMode === 'update' && (!importDiffState || !importDiffToken)) {
      const diffResponse = await fetchSeasonImportDiff(importId);
      applyImportDiffState(diffResponse);
      if (previewConfirm) previewConfirm.checked = false;
      renderImportPreview(importPreviewState);
      setImportExecuteButtonLabel(true);
      setProgress(
        `⚠️ 업데이트 모드 감지: ${escapeHtml(diffResponse.targetSheetName || seasonInfo.seasonAlias)}<br>` +
        `셀 단위 변경사항을 확인한 뒤 체크하고 다시 버튼을 눌러 최종 반영하세요.`,
        true
      );
      refreshImportExecuteButtonState();
      return;
    }

    const finalizePayload = {
      importId: importId,
      adminToken: adminToken
    };
    if (importServerMode === 'update') {
      finalizePayload.confirmDiff = true;
      finalizePayload.diffToken = importDiffToken;
      finalizePayload.applyDeletes = false;
    }

    const finalized = await CloudClubApi.call('seasonImportFinalize', finalizePayload);
    if (!finalized.success) {
      const finalizeError = new Error(finalized.message || '업로드 완료 처리 실패');
      finalizeError.code = finalized.errorCode || 'IMPORT_FINALIZE_FAILED';
      finalizeError.latestDiffToken = finalized.latestDiffToken || '';
      finalizeError.latestSummary = finalized.latestSummary || null;
      throw finalizeError;
    }

    if (importServerMode === 'update') {
      setProgress(
        `✅ 시즌 업데이트 완료 (${escapeHtml(finalized.sheetName || seasonInfo.seasonAlias)})<br>` +
        `ADD ${Number(finalized.added_count || 0)}, UPDATE_ROW ${Number(finalized.updated_row_count || 0)}, ` +
        `DELETE_CANDIDATE ${Number(finalized.delete_candidate_count || 0)}(미반영), ` +
        `PROTECTED_SKIP ${Number(finalized.protected_skip_count || 0)}`,
        true
      );
    } else {
      setProgress(
        `✅ 시즌 생성/업로드 완료 (${escapeHtml(finalized.sheetName || seasonInfo.seasonAlias)})<br>` +
        `INSERT ${finalized.inserted_count || 0}, DUP ${finalized.skipped_duplicate_count || 0}, ` +
        `DROP ${finalized.dropped_invalid_count || 0}, SKIP_COHORT ${finalized.skipped_non_target_count || 0}`,
        true
      );
    }

    showToast('<i class="fas fa-check-circle"></i> 시즌 생성/업로드 완료', true);
    clearImportPendingState();
    importServerModeHint = hasSeasonAliasInLoadedSheets(seasonInfo.seasonAlias) ? 'update' : 'create';
    if (previewConfirm) previewConfirm.checked = false;
    setImportExecuteButtonLabel(false);
    refreshImportModeUi();
    await loadSheets();
    await refreshSeasonData();
  } catch (error) {
    if (error && error.code === 'DIFF_TOKEN_MISMATCH' && importId && importServerMode === 'update') {
      try {
        const latestDiff = await fetchSeasonImportDiff(importId);
        applyImportDiffState(latestDiff);
        if (previewConfirm) previewConfirm.checked = false;
        renderImportPreview(importPreviewState);
        setImportExecuteButtonLabel(true);
        setProgress(
          '⚠️ 변경사항이 갱신되어 토큰이 바뀌었습니다. 셀 단위 변경을 다시 확인하고 체크 후 재반영해주세요.',
          false
        );
        refreshImportExecuteButtonState();
        return;
      } catch (refreshError) {
        console.error('diff refresh after token mismatch failed:', refreshError);
      }
    }

    if (importId && !importDiffState) {
      await abortImportSession(importId, 'execute-import-error', { quiet: true });
      clearImportPendingState();
    }
    const message = getDisplayErrorMessage(error, '시즌 업로드 중 오류가 발생했습니다.');
    setProgress(`❌ ${escapeHtml(message)}`, false);
  } finally {
    refreshImportModeUi();
    refreshImportExecuteButtonState();
  }
}

function syncImportSeasonInputByCurrentSelection() {
  const input = document.getElementById('importSeasonNoInput');
  if (!input) return;
  const alias = getSelectedSeasonAlias();
  if (alias && !String(input.value || '').trim()) {
    input.value = alias;
  }
}

function setImportExecuteButtonLabel(waitingDiff) {
  const label = document.getElementById('importExecuteBtnLabel');
  if (!label) return;
  if (waitingDiff) {
    label.textContent = '변경사항 최종 반영';
    return;
  }
  label.textContent = getImportUiMode() === 'update'
    ? '시즌 업데이트 반영'
    : '시즌 생성 + 업로드 반영';
}

function setImportCardCollapsed(cardId, collapsed) {
  const card = document.getElementById(cardId);
  if (!card) return;
  const body = card.querySelector('.collapsible-body');
  const header = card.querySelector('.collapsible-header');
  if (!body || !header) return;

  card.classList.toggle('collapsed', !!collapsed);
  header.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
}

function initializeImportCollapsibleCards() {
  const cards = document.querySelectorAll('[data-import-card][data-collapsible="true"]');
  cards.forEach(card => {
    const cardId = card.id;
    const defaultOpen = String(card.dataset.defaultOpen || 'false') === 'true';
    setImportCardCollapsed(cardId, !defaultOpen);
  });
}

function toggleImportCard(cardId) {
  const card = document.getElementById(cardId);
  if (!card || card.dataset.collapsible !== 'true') return;
  const isCollapsed = card.classList.contains('collapsed');
  setImportCardCollapsed(cardId, !isCollapsed);
}

function handleImportCardHeaderKey(event, cardId) {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  event.preventDefault();
  toggleImportCard(cardId);
}

function expandImportCard(cardId) {
  setImportCardCollapsed(cardId, false);
}

function renderSheetSchemaAudit(response) {
  const wrap = document.getElementById('sheetSchemaAuditWrap');
  if (!wrap) return;

  if (!response || !response.success || !Array.isArray(response.reports) || response.reports.length === 0) {
    wrap.innerHTML = '<div class="error">스키마 감사 리포트를 불러오지 못했습니다.</div>';
    return;
  }

  const report = response.reports[0];
  const required = report.requiredMissingCounts || {};
  const duplicatePhones = Array.isArray(report.duplicatePhones) ? report.duplicatePhones : [];
  const fieldMap = report.headerMap || {};
  const strictBannerHtml = report.mode === 'v2'
    ? ''
    : `
      <div class="import-debug-item warning" style="margin-bottom:12px;">
        <strong>[WARNING] LEGACY_SCHEMA_DETECTED</strong><br>
        <span>현재 시즌이 v2 표준 헤더가 아닙니다. 운영 전 스키마 마이그레이션 체크리스트를 따라 전환하세요.</span>
      </div>
    `;

  const mappingRows = IMPORT_FIELD_ORDER.map(field => {
    const idx = fieldMap[field];
    return `
      <tr>
        <td>${escapeHtml(IMPORT_FIELD_LABELS[field] || field)}</td>
        <td>${idx === null || idx === undefined ? '-' : `Column ${Number(idx) + 1}`}</td>
      </tr>
    `;
  }).join('');

  const duplicateRows = duplicatePhones.length > 0
    ? duplicatePhones.map(item => `
      <tr>
        <td>${escapeHtml(item.phone || '-')}</td>
        <td>${escapeHtml((item.rows || []).join(', '))}</td>
      </tr>
    `).join('')
    : '<tr><td colspan="2">중복 Phone 없음</td></tr>';

  wrap.innerHTML = `
    ${strictBannerHtml}
    <div class="import-summary">
      <span class="import-chip ${report.mode === 'v2' ? 'pass' : 'warn'}">MODE ${escapeHtml(report.mode || '-')}</span>
      <span class="import-chip">SESSION_START_COL ${Number(report.sessionStartColIndex || 0) + 1}</span>
      <span class="import-chip">SESSIONS ${Number(report.sessionDetectedCount || 0)}</span>
      <span class="import-chip ${duplicatePhones.length > 0 ? 'fail' : 'pass'}">PHONE_DUP ${duplicatePhones.length}</span>
    </div>

    <table class="management-table import-mapping-table">
      <thead>
        <tr>
          <th>필드</th>
          <th>헤더 매핑</th>
        </tr>
      </thead>
      <tbody>${mappingRows}</tbody>
    </table>

    <table class="management-table import-mapping-table" style="margin-top:12px;">
      <thead>
        <tr>
          <th>필수 필드 결측 카운트</th>
          <th>건수</th>
        </tr>
      </thead>
      <tbody>
        <tr><td>Name</td><td>${Number(required.name || 0)}</td></tr>
        <tr><td>Season</td><td>${Number(required.season || 0)}</td></tr>
        <tr><td>Phone</td><td>${Number(required.phone || 0)}</td></tr>
        <tr><td>Email</td><td>${Number(required.email || 0)}</td></tr>
      </tbody>
    </table>

    <table class="management-table import-mapping-table" style="margin-top:12px;">
      <thead>
        <tr>
          <th>중복 Phone</th>
          <th>행 번호</th>
        </tr>
      </thead>
      <tbody>${duplicateRows}</tbody>
    </table>
  `;
}

async function refreshSheetSchemaAudit() {
  const wrap = document.getElementById('sheetSchemaAuditWrap');
  if (wrap) {
    wrap.innerHTML = '<div class="loader" style="margin: 16px auto;"></div>';
  }

  const seasonAlias = getSelectedSeasonAlias();
  if (!seasonAlias) {
    if (wrap) {
      wrap.innerHTML = '<div class="error">감사할 시즌을 먼저 선택해주세요.</div>';
    }
    return;
  }

  try {
    const response = await CloudClubApi.call('sheetSchemaAudit', {
      season: seasonAlias,
      adminToken: adminToken
    });
    renderSheetSchemaAudit(response);
  } catch (error) {
    if (handleUnauthorizedError(error)) return;
    if (wrap) {
      wrap.innerHTML = `<div class="error">${escapeHtml(getDisplayErrorMessage(error, '스키마 감사 조회 중 오류가 발생했습니다.'))}</div>`;
    }
  }
}
