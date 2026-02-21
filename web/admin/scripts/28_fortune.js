let fortuneLastSourceType = 'editor';
let fortuneEventBound = false;

function canonicalFortuneClientText(value) {
  return String(value || '')
    .replace(/[\u200B-\u200D\uFEFF\u00A0]/g, '')
    .trim();
}

function isFortuneBuiltinVersion(versionId) {
  return String(versionId || '').trim().toLowerCase() === 'builtin';
}

function getFortuneVersionToken(version) {
  const token = String((version && version.versionId) || '').trim();
  return token || 'builtin';
}

function getFortuneCurrentVersionTokenForUpload() {
  const currentVersionId = String(fortuneCurrentVersionId || '').trim();
  if (currentVersionId) {
    return currentVersionId;
  }
  return fortuneCurrentVersion ? getFortuneVersionToken(fortuneCurrentVersion) : 'builtin';
}

function isFortuneBlockingErrorCode(code) {
  const token = String(code || '').trim();
  return token === 'FORTUNE_TOO_LONG' || token === 'NO_VALID_ROWS' || token === 'PARSE_FAILED';
}

function getFortuneBlockingErrors(validation) {
  const errors = Array.isArray(validation && validation.errors) ? validation.errors : [];
  return errors.filter(item => isFortuneBlockingErrorCode(item && item.code));
}

function setFortuneCurrentCodeLoading() {
  const codeNode = document.getElementById('fortuneCurrentCode');
  if (codeNode) {
    codeNode.textContent = '(현재 운세 원본을 불러오는 중...)';
  }
}

function setFortuneCurrentCodeFailed(message) {
  const codeNode = document.getElementById('fortuneCurrentCode');
  if (codeNode) {
    codeNode.textContent = `(${message || '조회 실패. 다시 시도 버튼을 사용하세요.'})`;
  }
}

function resolveFortunePreviewPageState(validation) {
  const rows = Array.isArray(validation && validation.validRows) ? validation.validRows : [];
  const size = Math.max(1, Number(fortunePreviewPageSize || 50));
  const totalPages = Math.max(1, Math.ceil(rows.length / size));
  fortunePreviewTotalPages = totalPages;
  if (!fortunePreviewPage || fortunePreviewPage < 1) {
    fortunePreviewPage = 1;
  }
  if (fortunePreviewPage > totalPages) {
    fortunePreviewPage = totalPages;
  }
}

function renderFortunePreviewPager(validation) {
  const pager = document.getElementById('fortunePreviewPager');
  if (!pager) return;
  const rows = Array.isArray(validation && validation.validRows) ? validation.validRows : [];
  if (rows.length === 0) {
    pager.innerHTML = '';
    return;
  }

  resolveFortunePreviewPageState(validation);
  if (fortunePreviewTotalPages <= 1) {
    pager.innerHTML = `<span class="info-text">총 ${rows.length}건</span>`;
    return;
  }

  const prevDisabled = fortunePreviewPage <= 1 ? 'disabled' : '';
  const nextDisabled = fortunePreviewPage >= fortunePreviewTotalPages ? 'disabled' : '';
  pager.innerHTML = `
    <button type="button" class="btn btn-secondary" ${prevDisabled} onclick="goToFortunePreviewPage(${fortunePreviewPage - 1})">
      <i class="fas fa-chevron-left"></i>
      <span>이전</span>
    </button>
    <span class="info-text">${fortunePreviewPage} / ${fortunePreviewTotalPages} (총 ${rows.length}건)</span>
    <button type="button" class="btn btn-secondary" ${nextDisabled} onclick="goToFortunePreviewPage(${fortunePreviewPage + 1})">
      <span>다음</span>
      <i class="fas fa-chevron-right"></i>
    </button>
  `;
}

function goToFortunePreviewPage(page) {
  const next = Math.max(1, parseInt(page, 10) || 1);
  fortunePreviewPage = next;
  renderFortunePreviewTable(fortuneValidationState);
}

function renderFortuneSaveEligibility(validation) {
  const node = document.getElementById('fortuneSaveEligibility');
  if (!node) return;
  if (fortuneTabBlocked) {
    node.innerHTML = '<div class="error">현재 백엔드 상태에서는 저장할 수 없습니다.</div>';
    return;
  }
  if (!validation) {
    node.innerHTML = '<p class="info-text">검증을 실행하면 저장 가능 여부가 표시됩니다.</p>';
    return;
  }

  const blockingErrors = getFortuneBlockingErrors(validation);
  if (blockingErrors.length > 0) {
    const longCount = blockingErrors.filter(item => item.code === 'FORTUNE_TOO_LONG').length;
    const noRows = blockingErrors.some(item => item.code === 'NO_VALID_ROWS');
    const messages = [];
    if (longCount > 0) messages.push(`200자 초과 ${longCount}건`);
    if (noRows) messages.push('저장 가능한 운세 0건');
    node.innerHTML = `<div class="error">저장 불가: ${escapeHtml(messages.join(', ') || '검증 오류')}</div>`;
    return;
  }

  const confirmed = !!(document.getElementById('fortuneUploadConfirmed') && document.getElementById('fortuneUploadConfirmed').checked);
  const warningCount = Array.isArray(validation.warnings) ? validation.warnings.length : 0;
  const duplicateCount = Math.max(0, Number(validation.droppedDuplicateCount || 0));
  const parts = [];
  if (duplicateCount > 0) parts.push(`중복 ${duplicateCount}건 자동 제외`);
  if (warningCount > 0 && duplicateCount === 0) parts.push(`경고 ${warningCount}건`);

  if (!confirmed) {
    node.innerHTML = `<div class="info-text">저장 가능. ${escapeHtml(parts.join(', ') || '확인 체크 후 저장할 수 있습니다.')} 확인 체크를 진행해주세요.</div>`;
    return;
  }

  node.innerHTML = `<div class="success">저장 가능: ${escapeHtml(parts.join(', ') || '검증 통과')}</div>`;
}

function withTimeout(promise, timeoutMs, errorMessage) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      const error = new Error(errorMessage || '요청 시간이 초과되었습니다.');
      error.code = 'TIMEOUT';
      reject(error);
    }, Math.max(1000, Number(timeoutMs || 8000)));
    Promise.resolve(promise)
      .then(value => {
        clearTimeout(timer);
        resolve(value);
      })
      .catch(error => {
        clearTimeout(timer);
        reject(error);
      });
  });
}

function setFortuneButtonsDisabled(disabled) {
  const buttonIds = [
    'fortuneLoadFileBtn',
    'fortuneAnalyzeBtn',
    'fortuneResetBtn',
    'fortuneLoadCurrentEditorBtn',
    'fortuneSaveBtn',
    'fortuneDownloadCurrentCsvBtn',
    'fortuneDownloadCurrentXlsxBtn',
    'fortuneRefreshBtn'
  ];
  buttonIds.forEach(id => {
    const node = document.getElementById(id);
    if (node) node.disabled = !!disabled;
  });
}

function renderFortuneCompatibilityNotice(state) {
  const node = document.getElementById('fortuneCompatibilityNotice');
  if (!node) return;

  const info = state || {};
  const maskedUrl = maskApiBaseUrl(getConfiguredApiBaseUrl());
  const versionText = info.apiVersion ? `API 버전: ${escapeHtml(info.apiVersion)}` : 'API 버전: 확인 불가';
  const serverTimeText = info.serverTime ? ` / 서버 시각: ${escapeHtml(info.serverTime)}` : '';

  if (info.blocked) {
    node.className = 'compat-notice blocked';
    node.innerHTML = `
      <div><strong>운세 탭 미지원 백엔드</strong></div>
      <div>${escapeHtml(info.message || 'Apps Script/Pages를 최신으로 배포해주세요.')}</div>
      <div><strong>${versionText}</strong>${serverTimeText}</div>
      <div><strong>현재 API URL:</strong> <code>${escapeHtml(maskedUrl)}</code></div>
    `;
    return;
  }

  node.className = 'compat-notice';
  node.innerHTML = `
    <div><strong>운세 API 호환성 정상</strong></div>
    <div><strong>${versionText}</strong>${serverTimeText}</div>
    <div><strong>현재 API URL:</strong> <code>${escapeHtml(maskedUrl)}</code></div>
  `;
}

function setFortuneTabBlocked(blocked, message, info) {
  fortuneTabBlocked = !!blocked;
  renderFortuneCompatibilityNotice(Object.assign({}, info || {}, {
    blocked: !!blocked,
    message: message || ''
  }));
  setFortuneButtonsDisabled(!!blocked);
  renderFortuneSaveEligibility(fortuneValidationState);

  if (!blocked) return;
  const previewWrap = document.getElementById('fortunePreviewWrap');
  if (previewWrap) {
    previewWrap.innerHTML = `<div class="error">${escapeHtml(message || '백엔드 구버전으로 운세 탭을 사용할 수 없습니다.')}</div>`;
  }
  const pager = document.getElementById('fortunePreviewPager');
  if (pager) pager.innerHTML = '';
}

function hasRequiredFortuneActions(supportedActions) {
  const required = [
    'apiInfo',
    'fortuneVersionList',
    'fortuneVersionGet',
    'fortuneUploadBegin',
    'fortuneUploadChunk',
    'fortuneUploadFinalize',
    'fortuneUploadAbort'
  ];
  const actionSet = {};
  (supportedActions || []).forEach(action => {
    actionSet[String(action || '').trim()] = true;
  });
  return required.every(action => !!actionSet[action]);
}

async function ensureFortuneApiCompatibility() {
  try {
    const info = await CloudClubApi.call('apiInfo', {
      adminToken: adminToken
    });
    const supportedActions = Array.isArray(info && info.supportedActions) ? info.supportedActions : [];
    const compatible = hasRequiredFortuneActions(supportedActions);
    fortuneApiInfo = info || null;

    if (!compatible) {
      setFortuneTabBlocked(
        true,
        'fortune* 액션을 지원하지 않는 백엔드입니다. Apps Script와 GitHub Pages를 최신으로 재배포해주세요.',
        info || {}
      );
      return false;
    }

    setFortuneTabBlocked(false, '', info || {});
    return true;
  } catch (error) {
    if (handleUnauthorizedError(error)) return false;
    const message = error && error.code === 'UNSUPPORTED_ACTION'
      ? 'apiInfo 미지원 백엔드입니다. 최신 Apps Script 배포 후 다시 시도해주세요.'
      : getDisplayErrorMessage(error, '운세 API 버전 확인 중 오류가 발생했습니다.');
    setFortuneTabBlocked(true, message, fortuneApiInfo || {});
    return false;
  }
}

function ensureFortuneEventsBound() {
  if (fortuneEventBound) return;
  const editor = document.getElementById('fortuneTextInput');
  if (editor) {
    editor.addEventListener('input', () => {
      fortuneLastSourceType = 'editor';
      fortuneValidationState = null;
      fortunePreviewRows = [];
      fortunePreviewPage = 1;
      fortunePreviewTotalPages = 1;
      renderFortuneValidationSummary(null);
      renderFortunePreviewTable(null);
      renderFortuneSaveEligibility(null);
      refreshFortuneExecuteButtonState();
    });
  }
  fortuneEventBound = true;
}

function renderFortuneCurrentCode(rows, version) {
  const codeNode = document.getElementById('fortuneCurrentCode');
  const labelNode = document.getElementById('fortuneCurrentVersionLabel');
  if (labelNode) {
    const token = version ? getFortuneVersionToken(version) : 'builtin';
    const sourceLabel = version && version.sourceType ? ` (${version.sourceType})` : '';
    labelNode.textContent = `현재 버전: ${token}${sourceLabel}`;
  }
  if (!codeNode) return;

  const lines = (rows || []).map(item => canonicalFortuneClientText(item.fortune));
  if (lines.length === 0) {
    codeNode.textContent = '(현재 저장된 운세가 없습니다)';
    return;
  }
  codeNode.textContent = lines.join('\n');
}

function renderFortuneValidationSummary(validation) {
  const summary = document.getElementById('fortuneValidationSummary');
  if (!summary) return;

  if (!validation) {
    summary.innerHTML = '';
    return;
  }

  const validCount = Array.isArray(validation.validRows) ? validation.validRows.length : 0;
  const errorCount = Array.isArray(validation.errors) ? validation.errors.length : 0;
  const warningCount = Array.isArray(validation.warnings) ? validation.warnings.length : 0;
  const uniqueCount = Math.max(0, Number(validation.uniqueCount || 0));
  const droppedDuplicateCount = Math.max(0, Number(validation.droppedDuplicateCount || 0));
  const droppedEmptyCount = Math.max(0, Number(validation.droppedEmptyCount || 0));
  const blockingErrors = getFortuneBlockingErrors(validation);

  let html = '';
  html += `<span class="import-chip pass">VALID ${validCount}</span>`;
  html += `<span class="import-chip ${errorCount > 0 ? 'fail' : 'pass'}">ERROR ${errorCount}</span>`;
  html += `<span class="import-chip ${warningCount > 0 ? 'warn' : ''}">WARNING ${warningCount}</span>`;
  html += `<span class="import-chip">UNIQUE ${uniqueCount}</span>`;
  if (droppedDuplicateCount > 0) {
    html += `<span class="import-chip warn">DROPPED_DUP ${droppedDuplicateCount}</span>`;
  }
  if (droppedEmptyCount > 0) {
    html += `<span class="import-chip">DROPPED_EMPTY ${droppedEmptyCount}</span>`;
  }

  if (blockingErrors.length > 0) {
    const first = blockingErrors.slice(0, 8).map(item => `<li>${escapeHtml(item.message)}</li>`).join('');
    html += `<div class="error" style="margin-top:10px;"><strong>검증 오류</strong><ul style="margin-left:16px;">${first}</ul></div>`;
  } else {
    html += '<div class="success" style="margin-top:10px;">✅ 1차 검증 통과: 저장 가능합니다.</div>';
  }

  if (warningCount > 0) {
    const previewWarnings = validation.warnings.slice(0, 8).map(item => `<li>${escapeHtml(item.message)}</li>`).join('');
    const remain = warningCount > 8 ? `<li>외 ${warningCount - 8}건</li>` : '';
    html += `<div class="info-text" style="margin-top:10px;"><strong>검증 경고(저장 가능)</strong><ul style="margin-left:16px;">${previewWarnings}${remain}</ul></div>`;
  }

  summary.innerHTML = html;
}

function renderFortunePreviewTable(validation) {
  const wrap = document.getElementById('fortunePreviewWrap');
  if (!wrap) return;
  if (!validation) {
    wrap.innerHTML = '<p class="info-text">분석 후 미리보기가 표시됩니다.</p>';
    renderFortunePreviewPager(null);
    return;
  }

  const rows = validation.validRows || [];
  if (rows.length === 0) {
    wrap.innerHTML = '<p class="info-text">유효한 운세가 없습니다.</p>';
    renderFortunePreviewPager(validation);
    return;
  }

  resolveFortunePreviewPageState(validation);
  const start = (fortunePreviewPage - 1) * fortunePreviewPageSize;
  const end = Math.min(rows.length, start + fortunePreviewPageSize);
  const pageRows = rows.slice(start, end);

  const body = pageRows.map(item => {
    return `
      <tr>
        <td>${item.rowNo}</td>
        <td>${escapeHtml(item.fortune)}</td>
      </tr>
    `;
  }).join('');

  wrap.innerHTML = `
    <table class="management-table import-preview-table">
      <thead>
        <tr>
          <th>순번</th>
          <th>운세 문구</th>
        </tr>
      </thead>
      <tbody>${body}</tbody>
    </table>
  `;
  renderFortunePreviewPager(validation);
}

function renderFortuneVersionList() {
  const wrap = document.getElementById('fortuneVersionTableWrap');
  if (!wrap) return;
  const items = Array.isArray(fortuneVersionItems) ? fortuneVersionItems : [];
  if (items.length === 0) {
    wrap.innerHTML = '<p class="info-text">저장된 버전이 없습니다.</p>';
    return;
  }

  const rows = items.map(item => {
    const versionId = String(item.versionId || '').trim();
    const currentTag = item.isCurrent ? '<span class="import-chip pass">CURRENT</span>' : '';
    const builtinTag = item.isBuiltin ? '<span class="import-chip">BUILTIN</span>' : '';
    return `
      <tr>
        <td>${escapeHtml(versionId || '-')}</td>
        <td>${escapeHtml(item.createdAt || '-')}</td>
        <td>${escapeHtml(item.createdByEmail || '-')}</td>
        <td>${escapeHtml(item.sourceType || '-')}</td>
        <td>${Number(item.rowCount || 0)}</td>
        <td>${currentTag} ${builtinTag}</td>
        <td>
          <button type="button" class="btn btn-secondary" onclick="loadFortuneVersionIntoEditor('${escapeHtml(versionId)}')">불러오기</button>
          <button type="button" class="btn btn-secondary" onclick="downloadFortuneVersionCsv('${escapeHtml(versionId)}')">CSV</button>
          <button type="button" class="btn btn-secondary" onclick="downloadFortuneVersionXlsx('${escapeHtml(versionId)}')">XLSX</button>
        </td>
      </tr>
    `;
  }).join('');

  wrap.innerHTML = `
    <table class="management-table import-mapping-table">
      <thead>
        <tr>
          <th>version_id</th>
          <th>created_at</th>
          <th>created_by_email</th>
          <th>source</th>
          <th>rows</th>
          <th>상태</th>
          <th>작업</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

function parseFortuneEditorRows(text) {
  const raw = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = raw.split('\n');
  return lines.map((line, idx) => ({
    rowNo: idx + 1,
    fortune: line
  }));
}

function normalizeFortuneHeaderToken(value) {
  return String(value === undefined || value === null ? '' : value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9가-힣_]/g, '');
}

function detectFortuneMatrixShape(matrix) {
  const rows = Array.isArray(matrix) ? matrix : [];
  const normalizedRows = rows.map(row => (Array.isArray(row) ? row : [row]));
  const firstNonEmptyIndex = normalizedRows.findIndex(row => row.some(cell => String(cell === undefined || cell === null ? '' : cell).trim() !== ''));
  const firstNonEmptyRow = firstNonEmptyIndex >= 0 ? normalizedRows[firstNonEmptyIndex] : [];

  const headerTokens = firstNonEmptyRow.map(normalizeFortuneHeaderToken);
  const fortuneHeaderCandidates = ['fortune_text', 'fortunetext', 'fortune', 'text', 'message', '운세', '운세문구'];
  const fortuneHeaderIndex = headerTokens.findIndex(token => fortuneHeaderCandidates.indexOf(token) >= 0);
  const hasHeader = fortuneHeaderIndex >= 0;

  let multiColumnRows = 0;
  let numericFirstRows = 0;
  normalizedRows.forEach((row, idx) => {
    if (hasHeader && idx === firstNonEmptyIndex) return;
    const c0 = String(row[0] === undefined || row[0] === null ? '' : row[0]).trim();
    const c1 = String(row[1] === undefined || row[1] === null ? '' : row[1]).trim();
    const nonEmptyCellCount = row.filter(cell => String(cell === undefined || cell === null ? '' : cell).trim() !== '').length;
    if (nonEmptyCellCount >= 2) {
      multiColumnRows += 1;
    }
    if (/^\d+$/.test(c0) && c1) {
      numericFirstRows += 1;
    }
  });

  const likelySecondColumn = multiColumnRows > 0 && numericFirstRows >= Math.ceil(multiColumnRows * 0.6);
  const columnIndex = hasHeader
    ? fortuneHeaderIndex
    : (likelySecondColumn ? 1 : 0);

  return {
    hasHeader: hasHeader,
    headerRowIndex: hasHeader ? firstNonEmptyIndex : -1,
    columnIndex: Math.max(0, columnIndex),
    rowCount: normalizedRows.length,
    multiColumnRows: multiColumnRows,
    likelySecondColumn: likelySecondColumn
  };
}

function shouldTreatEditorInputAsDelimitedMatrix(text, matrix, shape) {
  if (!text) return false;
  if (!Array.isArray(matrix) || matrix.length === 0) return false;
  if (!shape) return false;
  if (shape.hasHeader) return true;

  const normalized = String(text || '');
  const hasTab = normalized.indexOf('\t') >= 0;
  const hasSemicolon = normalized.indexOf(';') >= 0;
  const hasComma = normalized.indexOf(',') >= 0;
  if (hasTab || hasSemicolon) {
    return shape.rowCount >= 2 && shape.multiColumnRows >= 1;
  }
  if (!hasComma) return false;

  // Avoid over-detecting normal sentences with commas: require clear multi-row structure.
  return shape.rowCount >= 2 && shape.multiColumnRows >= 2;
}

function validateFortuneRowsClient(rows) {
  const errors = [];
  const warnings = [];
  const validRows = [];
  const seen = {};
  let droppedDuplicateCount = 0;
  let droppedEmptyCount = 0;

  (rows || []).forEach((row, idx) => {
    const sourceRowNo = idx + 1;
    const text = canonicalFortuneClientText(row.fortune);
    if (!text) {
      droppedEmptyCount += 1;
      return;
    }
    if (text.length > 200) {
      errors.push({
        rowNo: sourceRowNo,
        code: 'FORTUNE_TOO_LONG',
        message: `${sourceRowNo}행: 운세 길이는 200자를 초과할 수 없습니다.`
      });
      return;
    }
    if (Object.prototype.hasOwnProperty.call(seen, text)) {
      droppedDuplicateCount += 1;
      warnings.push({
        rowNo: sourceRowNo,
        code: 'DUPLICATE_FORTUNE',
        message: `${sourceRowNo}행: ${seen[text]}행과 중복 문구로 자동 제외됩니다.`
      });
      return;
    }
    seen[text] = sourceRowNo;
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
    errors: errors,
    warnings: warnings,
    validRows: validRows,
    uniqueCount: Object.keys(seen).length,
    droppedDuplicateCount: droppedDuplicateCount,
    droppedEmptyCount: droppedEmptyCount
  };
}

function readFortuneFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('파일을 읽는 중 오류가 발생했습니다.'));
    reader.readAsText(file, 'utf-8');
  });
}

function readFortuneFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('파일을 읽는 중 오류가 발생했습니다.'));
    reader.readAsArrayBuffer(file);
  });
}

function parseFortuneDelimitedMatrix(text) {
  const normalized = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!window.Papa || typeof window.Papa.parse !== 'function') {
    return normalized.split('\n').map(line => [line]);
  }
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
    { rows: comma, score: score(comma) },
    { rows: tab, score: score(tab) },
    { rows: semicolon, score: score(semicolon) }
  ];
  candidates.sort((a, b) => b.score - a.score);
  return candidates[0].rows || [];
}

function fortuneMatrixToRows(matrix) {
  const shape = detectFortuneMatrixShape(matrix);
  const rows = [];
  (matrix || []).forEach((row, idx) => {
    if (shape.hasHeader && idx === shape.headerRowIndex) {
      return;
    }
    const list = Array.isArray(row) ? row : [row];
    let value = String(list[shape.columnIndex] === undefined || list[shape.columnIndex] === null ? '' : list[shape.columnIndex]);
    if (!value.trim()) {
      for (let i = 0; i < list.length; i++) {
        const candidate = String(list[i] === undefined || list[i] === null ? '' : list[i]);
        if (candidate.trim()) {
          value = candidate;
          break;
        }
      }
    }
    rows.push({
      rowNo: rows.length + 1,
      fortune: value
    });
  });
  return rows;
}

async function parseFortuneRowsFromFile(file) {
  const name = String((file && file.name) || '').toLowerCase();
  if (/\.xlsx?$/.test(name)) {
    await ensureRuntimeDeps(['xlsx']);
    const buffer = await readFortuneFileAsArrayBuffer(file);
    const workbook = window.XLSX.read(buffer, { type: 'array' });
    const firstSheetName = (workbook.SheetNames && workbook.SheetNames[0]) ? workbook.SheetNames[0] : '';
    if (!firstSheetName) {
      throw new Error('엑셀 시트를 찾을 수 없습니다.');
    }
    const sheet = workbook.Sheets[firstSheetName];
    const matrix = window.XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      blankrows: true,
      defval: ''
    });
    return {
      sourceType: 'xlsx',
      rows: fortuneMatrixToRows(matrix)
    };
  }

  const text = await readFortuneFileAsText(file);
  const matrix = parseFortuneDelimitedMatrix(text);
  return {
    sourceType: 'csv',
    rows: fortuneMatrixToRows(matrix)
  };
}

function rowsToEditorText(rows) {
  return (rows || [])
    .map(item => canonicalFortuneClientText(item.fortune))
    .join('\n');
}

function refreshFortuneExecuteButtonState() {
  const btn = document.getElementById('fortuneSaveBtn');
  if (!btn) return;
  if (fortuneTabBlocked) {
    btn.disabled = true;
    renderFortuneSaveEligibility(fortuneValidationState);
    return;
  }

  const confirmed = !!(document.getElementById('fortuneUploadConfirmed') && document.getElementById('fortuneUploadConfirmed').checked);
  const hasValidation = !!fortuneValidationState;
  const hasErrors = !!(fortuneValidationState && getFortuneBlockingErrors(fortuneValidationState).length > 0);
  const hasRows = !!(fortuneValidationState && Array.isArray(fortuneValidationState.validRows) && fortuneValidationState.validRows.length > 0);
  btn.disabled = !(hasValidation && !hasErrors && hasRows && confirmed);
  renderFortuneSaveEligibility(fortuneValidationState);
}

async function loadFortuneFromFile() {
  if (fortuneTabBlocked) return;
  const fileInput = document.getElementById('fortuneFileInput');
  const file = fileInput && fileInput.files ? fileInput.files[0] : null;
  if (!file) {
    alert('업로드할 파일을 선택해주세요.');
    return;
  }
  try {
    await ensureRuntimeDeps(['papa', 'xlsx']);
  } catch (error) {
    alert('CSV/XLSX 파서 라이브러리를 불러오지 못했습니다.');
    return;
  }

  try {
    const parsed = await parseFortuneRowsFromFile(file);
    fortuneLastSourceType = parsed.sourceType;
    const editor = document.getElementById('fortuneTextInput');
    if (editor) {
      editor.value = rowsToEditorText(parsed.rows);
    }
    showBoxMessage('fortuneAnalyzeResult', `✅ 파일 로드 완료: ${escapeHtml(file.name)} (${parsed.rows.length}행)`, true);
    analyzeFortuneInput();
  } catch (error) {
    showBoxMessage('fortuneAnalyzeResult', `❌ 파일 로드 실패: ${escapeHtml(error.message || '알 수 없는 오류')}`, false);
  }
}

function analyzeFortuneInput() {
  if (fortuneTabBlocked) return;
  const editor = document.getElementById('fortuneTextInput');
  const text = editor ? editor.value : '';
  const matrix = parseFortuneDelimitedMatrix(text);
  const shape = detectFortuneMatrixShape(matrix);
  const parsedRows = shouldTreatEditorInputAsDelimitedMatrix(text, matrix, shape)
    ? fortuneMatrixToRows(matrix)
    : parseFortuneEditorRows(text);
  const validation = validateFortuneRowsClient(parsedRows);
  fortuneValidationState = validation;
  fortunePreviewRows = validation.validRows.slice();
  fortunePreviewPage = 1;
  resolveFortunePreviewPageState(validation);
  renderFortuneValidationSummary(validation);
  renderFortunePreviewTable(validation);
  refreshFortuneExecuteButtonState();

  const blockingErrors = getFortuneBlockingErrors(validation);
  if (blockingErrors.length === 0) {
    const droppedDuplicateCount = Math.max(0, Number(validation.droppedDuplicateCount || 0));
    const warningSuffix = droppedDuplicateCount > 0 ? ` / 중복 ${droppedDuplicateCount}건 자동 제외` : '';
    showBoxMessage('fortuneAnalyzeResult', `✅ 검증 완료: ${validation.validRows.length}건 저장 가능${warningSuffix}`, true);
  } else {
    showBoxMessage('fortuneAnalyzeResult', `❌ 검증 실패: 오류 ${blockingErrors.length}건`, false);
  }
}

async function abortFortunePendingUpload(reason, options) {
  const opts = options || {};
  const uploadId = String(fortunePendingUploadId || '').trim();
  if (!uploadId) return { success: true, skipped: true };
  fortunePendingUploadId = '';

  try {
    const response = await CloudClubApi.call('fortuneUploadAbort', {
      uploadId: uploadId,
      reason: reason || 'manual-abort',
      adminToken: adminToken
    });
    return response || { success: true };
  } catch (error) {
    if (!opts.quiet) {
      console.error('fortune upload abort failed:', error);
    }
    return { success: false, error: error };
  }
}

function resetFortuneEditor() {
  const editor = document.getElementById('fortuneTextInput');
  const fileInput = document.getElementById('fortuneFileInput');
  if (editor) editor.value = '';
  if (fileInput) fileInput.value = '';
  const confirmed = document.getElementById('fortuneUploadConfirmed');
  if (confirmed) confirmed.checked = false;
  fortuneValidationState = null;
  fortunePreviewRows = [];
  fortunePreviewPage = 1;
  fortunePreviewTotalPages = 1;
  fortuneLastSourceType = 'editor';
  renderFortuneValidationSummary(null);
  renderFortunePreviewTable(null);
  renderFortuneSaveEligibility(null);
  refreshFortuneExecuteButtonState();
  void abortFortunePendingUpload('reset-fortune-editor', { quiet: true });
}

async function fetchFortuneVersion(versionId) {
  const payload = {
    adminToken: adminToken
  };
  if (versionId) {
    payload.versionId = versionId;
  }
  const response = await CloudClubApi.call('fortuneVersionGet', payload);
  if (!response || !response.success) {
    const error = new Error((response && response.message) ? response.message : '운세 버전을 불러오지 못했습니다.');
    error.code = (response && response.errorCode) ? response.errorCode : 'FORTUNE_VERSION_GET_FAILED';
    throw error;
  }
  return response;
}

async function loadCurrentFortuneIntoEditor() {
  try {
    const response = await fetchFortuneVersion('');
    const rows = Array.isArray(response.rows) ? response.rows : [];
    const editor = document.getElementById('fortuneTextInput');
    if (editor) {
      editor.value = rowsToEditorText(rows);
    }
    fortuneLastSourceType = 'editor';
    analyzeFortuneInput();
    showToast('<i class="fas fa-check-circle"></i> 현재 버전을 편집기에 불러왔습니다.', true);
  } catch (error) {
    if (handleUnauthorizedError(error)) return;
    alert(getDisplayErrorMessage(error, '현재 운세를 불러오지 못했습니다.'));
  }
}

async function loadFortuneVersionIntoEditor(versionId) {
  try {
    const response = await fetchFortuneVersion(versionId);
    const rows = Array.isArray(response.rows) ? response.rows : [];
    const editor = document.getElementById('fortuneTextInput');
    if (editor) {
      editor.value = rowsToEditorText(rows);
    }
    fortuneLastSourceType = 'editor';
    analyzeFortuneInput();
    showToast(`<i class="fas fa-check-circle"></i> 버전 ${escapeHtml(versionId || '')}을 편집기에 불러왔습니다.`, true);
  } catch (error) {
    if (handleUnauthorizedError(error)) return;
    alert(getDisplayErrorMessage(error, '운세 버전을 불러오지 못했습니다.'));
  }
}

function escapeFortuneCsvCell(value) {
  const raw = String(value === undefined || value === null ? '' : value);
  if (/[",\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function downloadFortuneRowsAsCsv(fileName, rows) {
  const lines = ['row_no,fortune_text'];
  (rows || []).forEach((row, idx) => {
    lines.push(`${idx + 1},${escapeFortuneCsvCell(row.fortune)}`);
  });
  const csv = '\ufeff' + lines.join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function downloadFortuneRowsAsXlsx(fileName, rows) {
  const aoa = [['row_no', 'fortune_text']];
  (rows || []).forEach((row, idx) => {
    aoa.push([idx + 1, row.fortune]);
  });
  const ws = window.XLSX.utils.aoa_to_sheet(aoa);
  const wb = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(wb, ws, 'fortunes');
  window.XLSX.writeFile(wb, fileName);
}

async function downloadCurrentFortuneCsv() {
  try {
    const response = await fetchFortuneVersion('');
    const rows = Array.isArray(response.rows) ? response.rows : [];
    const token = getFortuneVersionToken(response.version);
    downloadFortuneRowsAsCsv(`fortune-${token}.csv`, rows);
  } catch (error) {
    if (handleUnauthorizedError(error)) return;
    alert(getDisplayErrorMessage(error, '현재 운세 CSV 다운로드에 실패했습니다.'));
  }
}

async function downloadCurrentFortuneXlsx() {
  try {
    await ensureRuntimeDeps(['xlsx']);
    const response = await fetchFortuneVersion('');
    const rows = Array.isArray(response.rows) ? response.rows : [];
    const token = getFortuneVersionToken(response.version);
    downloadFortuneRowsAsXlsx(`fortune-${token}.xlsx`, rows);
  } catch (error) {
    if (handleUnauthorizedError(error)) return;
    alert(getDisplayErrorMessage(error, '현재 운세 XLSX 다운로드에 실패했습니다.'));
  }
}

async function downloadFortuneVersionCsv(versionId) {
  try {
    const response = await fetchFortuneVersion(versionId);
    const rows = Array.isArray(response.rows) ? response.rows : [];
    const token = getFortuneVersionToken(response.version);
    downloadFortuneRowsAsCsv(`fortune-${token}.csv`, rows);
  } catch (error) {
    if (handleUnauthorizedError(error)) return;
    alert(getDisplayErrorMessage(error, '운세 버전 CSV 다운로드에 실패했습니다.'));
  }
}

async function downloadFortuneVersionXlsx(versionId) {
  try {
    await ensureRuntimeDeps(['xlsx']);
    const response = await fetchFortuneVersion(versionId);
    const rows = Array.isArray(response.rows) ? response.rows : [];
    const token = getFortuneVersionToken(response.version);
    downloadFortuneRowsAsXlsx(`fortune-${token}.xlsx`, rows);
  } catch (error) {
    if (handleUnauthorizedError(error)) return;
    alert(getDisplayErrorMessage(error, '운세 버전 XLSX 다운로드에 실패했습니다.'));
  }
}

function buildFortunePayloadChunks(rows, maxEncodedSize) {
  const limit = Math.max(2000, Number(maxEncodedSize || 4200));
  const chunks = [];
  let current = [];

  const flush = () => {
    if (current.length > 0) {
      chunks.push(current);
      current = [];
    }
  };

  (rows || []).forEach(item => {
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

async function beginFortuneUploadWithRecovery(baseVersionId, expectedRows) {
  const payload = {
    sourceType: fortuneLastSourceType || 'editor',
    expectedRowCount: expectedRows,
    baseVersionId: baseVersionId,
    adminToken: adminToken
  };
  let begin = await CloudClubApi.call('fortuneUploadBegin', payload);
  if (begin && begin.success && begin.uploadId) {
    return begin;
  }

  if (!(begin && begin.errorCode === 'FORTUNE_UPLOAD_ALREADY_ACTIVE' && begin.uploadId)) {
    const error = new Error((begin && begin.message) ? begin.message : '운세 업로드 세션 생성 실패');
    error.code = (begin && begin.errorCode) ? begin.errorCode : 'FORTUNE_UPLOAD_BEGIN_FAILED';
    throw error;
  }

  await CloudClubApi.call('fortuneUploadAbort', {
    uploadId: begin.uploadId,
    adminToken: adminToken
  });
  begin = await CloudClubApi.call('fortuneUploadBegin', payload);
  if (begin && begin.success && begin.uploadId) {
    return begin;
  }

  const error = new Error((begin && begin.message) ? begin.message : '운세 업로드 세션 재시작 실패');
  error.code = (begin && begin.errorCode) ? begin.errorCode : 'FORTUNE_UPLOAD_BEGIN_FAILED';
  throw error;
}

async function executeFortuneUpload() {
  if (fortuneTabBlocked) return;
  if (!fortuneValidationState) {
    alert('먼저 검증을 실행해주세요.');
    return;
  }
  const blockingErrors = getFortuneBlockingErrors(fortuneValidationState);
  if (blockingErrors.length > 0) {
    alert('검증 오류를 먼저 해결해주세요.');
    return;
  }
  if (!fortuneValidationState.validRows || fortuneValidationState.validRows.length === 0) {
    alert('저장 가능한 운세가 없습니다.');
    return;
  }

  const confirmed = document.getElementById('fortuneUploadConfirmed');
  if (!confirmed || !confirmed.checked) {
    alert('미리보기 확인 체크를 먼저 진행해주세요.');
    return;
  }

  const btn = document.getElementById('fortuneSaveBtn');
  if (btn) btn.disabled = true;

  const resultNodeId = 'fortuneSaveResult';
  const baseVersionId = getFortuneCurrentVersionTokenForUpload();
  const rows = fortuneValidationState.validRows.map((item, idx) => ({
    rowNo: idx + 1,
    fortune: item.fortune
  }));

  try {
    const begin = await beginFortuneUploadWithRecovery(baseVersionId, rows.length);
    fortunePendingUploadId = String(begin.uploadId || '').trim();
    if (!fortunePendingUploadId) {
      throw new Error('운세 업로드 세션 ID를 확보하지 못했습니다.');
    }

    const chunks = buildFortunePayloadChunks(rows, 4200);
    for (let i = 0; i < chunks.length; i++) {
      const response = await CloudClubApi.call('fortuneUploadChunk', {
        uploadId: fortunePendingUploadId,
        chunkSeq: i + 1,
        rowsJson: JSON.stringify(chunks[i]),
        adminToken: adminToken
      });
      if (!response || !response.success) {
        const error = new Error((response && response.message) ? response.message : `운세 청크 업로드 실패 (${i + 1}/${chunks.length})`);
        error.code = (response && response.errorCode) ? response.errorCode : 'FORTUNE_UPLOAD_CHUNK_FAILED';
        throw error;
      }
      showBoxMessage(resultNodeId, `청크 업로드 중... (${i + 1}/${chunks.length})`, true);
    }

    const finalized = await CloudClubApi.call('fortuneUploadFinalize', {
      uploadId: fortunePendingUploadId,
      baseVersionId: baseVersionId,
      sourceType: fortuneLastSourceType || 'editor',
      confirm: true,
      adminToken: adminToken
    });
    if (!finalized || !finalized.success) {
      const error = new Error((finalized && finalized.message) ? finalized.message : '운세 저장 실패');
      error.code = (finalized && finalized.errorCode) ? finalized.errorCode : 'FORTUNE_UPLOAD_FINALIZE_FAILED';
      throw error;
    }

    fortunePendingUploadId = '';
    const droppedDuplicateCount = Math.max(0, Number(finalized.droppedDuplicateCount || 0));
    const droppedEmptyCount = Math.max(0, Number(finalized.droppedEmptyCount || 0));
    const suffixParts = [];
    if (droppedDuplicateCount > 0) suffixParts.push(`중복 자동 제외 ${droppedDuplicateCount}건`);
    if (droppedEmptyCount > 0) suffixParts.push(`빈 행 제외 ${droppedEmptyCount}건`);
    const suffix = suffixParts.length > 0 ? ` / ${suffixParts.join(', ')}` : '';
    showBoxMessage(resultNodeId, `✅ 운세 저장 완료: ${finalized.rowCount}건 (버전 ${escapeHtml(finalized.newVersionId || '-')})${suffix}`, true);
    if (confirmed) confirmed.checked = false;
    await refreshFortuneManagement();
  } catch (error) {
    if (handleUnauthorizedError(error)) return;
    showBoxMessage(resultNodeId, `❌ 저장 실패: ${escapeHtml(getDisplayErrorMessage(error, '알 수 없는 오류'))}`, false);
    if (error && error.code === 'BASE_VERSION_CONFLICT') {
      await refreshFortuneManagement();
    }
    if (fortunePendingUploadId) {
      await abortFortunePendingUpload('fortune-upload-error', { quiet: true });
    }
  } finally {
    refreshFortuneExecuteButtonState();
  }
}

async function loadFortuneCurrentSnapshot() {
  const reqSeq = (fortuneCurrentSnapshotReqSeq = Number(fortuneCurrentSnapshotReqSeq || 0) + 1);
  setFortuneCurrentCodeLoading();

  try {
    const response = await withTimeout(
      fetchFortuneVersion(''),
      8000,
      '조회 시간이 초과되었습니다. 다시 시도 버튼을 사용하세요.'
    );
    if (reqSeq !== fortuneCurrentSnapshotReqSeq) return;
    fortuneCurrentVersion = response.version || null;
    fortuneCurrentVersionId = getFortuneVersionToken(response.version);
    const rows = Array.isArray(response.rows) ? response.rows : [];
    renderFortuneCurrentCode(rows, response.version);
  } catch (error) {
    if (reqSeq !== fortuneCurrentSnapshotReqSeq) return;
    if (handleUnauthorizedError(error)) return;
    setFortuneCurrentCodeFailed('조회 실패. 다시 시도 버튼을 사용하세요.');
    const labelNode = document.getElementById('fortuneCurrentVersionLabel');
    if (labelNode) {
      labelNode.textContent = `현재 버전: ${fortuneCurrentVersionId || 'builtin'}`;
    }
  }
}

async function loadFortuneVersionList() {
  const response = await CloudClubApi.call('fortuneVersionList', {
    adminToken: adminToken
  });
  if (!response || !response.success) {
    const error = new Error((response && response.message) ? response.message : '운세 버전 목록 조회 실패');
    error.code = (response && response.errorCode) ? response.errorCode : 'FORTUNE_VERSION_LIST_FAILED';
    throw error;
  }
  fortuneVersionItems = Array.isArray(response.versions) ? response.versions : [];
  const responseCurrentVersionId = String((response && response.currentVersionId) || '').trim();
  if (responseCurrentVersionId) {
    fortuneCurrentVersionId = responseCurrentVersionId;
  } else {
    const currentItem = fortuneVersionItems.find(item => !!item && item.isCurrent);
    fortuneCurrentVersionId = currentItem ? getFortuneVersionToken(currentItem) : 'builtin';
  }
  renderFortuneVersionList();
}

async function refreshFortuneManagement() {
  if (fortuneRefreshInFlight) {
    return fortuneRefreshInFlight;
  }

  ensureFortuneEventsBound();
  ensureRuntimeDeps(['papa']).catch(() => {
    // no-op: 텍스트 기반 편집은 fallback parser로 동작합니다.
  });
  fortuneRefreshInFlight = (async () => {
    const compatible = await ensureFortuneApiCompatibility();
    if (!compatible) {
      refreshFortuneExecuteButtonState();
      return;
    }

    const [snapshotResult, versionResult] = await Promise.allSettled([
      loadFortuneCurrentSnapshot(),
      loadFortuneVersionList()
    ]);

    if (versionResult.status === 'rejected') {
      const error = versionResult.reason;
      if (!handleUnauthorizedError(error)) {
        showBoxMessage('fortuneSaveResult', `❌ ${escapeHtml(getDisplayErrorMessage(error, '운세 버전 목록을 불러오지 못했습니다.'))}`, false);
      }
    }

    if (snapshotResult.status === 'rejected') {
      const error = snapshotResult.reason;
      if (!handleUnauthorizedError(error)) {
        setFortuneCurrentCodeFailed('조회 실패. 다시 시도 버튼을 사용하세요.');
      }
    }

    refreshFortuneExecuteButtonState();
  })();

  try {
    await fortuneRefreshInFlight;
  } finally {
    fortuneRefreshInFlight = null;
  }
}
