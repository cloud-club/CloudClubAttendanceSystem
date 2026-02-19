let countdownInterval;
let isAttendanceActive = false;
let currentSeasonUrl = '';
let adminToken = '';
let currentSheetName = '';
let currentSeasonAlias = '';
let scheduleItems = [];
let membersCache = [];
let variableItems = [];
let variableConfig = {};
let selectedVariableIndex = -1;
let graduationReportCache = null;
let excuseModalState = null;
let excuseOverrideState = null;
let graduationVisibleCount = 20;
let graduationSortState = { key: 'attendedCount', direction: 'desc' };
let scheduleDeleteForceState = null;
let scheduleEndAutoManaged = true;
let scheduleDefaults = {};
let scheduleByDateMap = {};
let scheduleDateConflicts = [];
let calendarCursorYear = new Date().getFullYear();
let calendarCursorMonth = new Date().getMonth();
let calendarSelectedDateKey = '';
let scheduleCalendarModalState = null;
let excusedSearchKeyword = '';
let excusedAbsentOnly = false;
let variableApiInfo = null;
let variableTabBlocked = false;
let variableAutoNormalizedOnce = false;
let importRawMatrix = [];
let importFileMeta = null;
let importInference = null;
let importManualMapping = {};
let importManualConfirmed = false;
let importPreviewState = null;
let importDebugReport = null;
let importServerMode = 'create';
let importServerModeHint = 'create';
let importPendingImportId = '';
let importDiffState = null;
let importDiffToken = '';
let importAbortInFlight = null;
let importDiffFilterMode = 'all';
let attendanceDashboardInitialized = false;
let attendanceDashboardLoading = false;
let attendanceDashboardPayload = null;
let attendanceDashboardDrilldownPayload = null;
let attendanceDashboardMemberSeriesCache = {};
let attendanceDashboardEventRateChart = null;
let attendanceDashboardEventStatusChart = null;
let attendanceDashboardMemberTrendChart = null;
let attendanceDashboardStatusDonutChart = null;
let attendanceDashboardCohortDonutChart = null;
let attendanceDashboardCountDonutChart = null;
let attendanceDashboardLastEventRows = [];
let attendanceDashboardDateRangeUserEdited = false;
let attendanceDashboardAutoDateHydratedOnce = false;
let attendanceDashboardDateInputSyncing = false;
let attendanceDashboardActivePopover = '';
let attendanceDashboardState = {
  group: 'all',
  dateFrom: '',
  dateTo: '',
  sessionSearch: '',
  sessionKeys: [],
  topN: 10,
  sortBy: 'attendanceRate',
  chartType: 'bar',
  selectedMemberKeys: [],
  memberSearch: ''
};

const ATTENDANCE_DASHBOARD_STORAGE_KEY = 'cc_admin_attendance_dashboard_v2';
const ATTENDANCE_DASHBOARD_MAX_MEMBER_SELECTION = 5;
const ATTENDANCE_DASHBOARD_STATUS_LABELS = {
  on_time: '출석',
  late: '지각',
  absent: '결석',
  excused: '유고',
  future: '예정'
};
const MANUAL_APPROVE_BATCH_CHUNK_SIZE = 100;
const MANUAL_MEMBER_STATUS_LABELS = {
  none: '미기록',
  on_time: '출석',
  late: '지각',
  excused: '유고',
  absent: '미기록(결석)',
  future: '미기록(예정)',
  recorded: '기록됨'
};

let manualApproveState = createManualApproveInitialState();

const IMPORT_FIELD_ORDER = [
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
const IMPORT_REQUIRED_FIELDS = ['name', 'season', 'phone', 'email'];
const IMPORT_FIELD_LABELS = {
  ignore: '무시',
  name: '이름',
  season: 'Season',
  phone: '전화번호',
  email: '이메일',
  githubId: 'Github ID',
  githubEmail: 'Github Email',
  notionEmail: 'Notion Email',
  discordId: 'Discord ID',
  slackEmail: 'Slack Email',
  feeChecked: '회비 체크',
  completed: '수료 여부',
  isStaff: '운영진 여부'
};

function normalizeSeasonAlias(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';

  const seasonMatch = value.match(/^season_(\d{2})$/i);
  if (seasonMatch) {
    return `season_${seasonMatch[1]}`;
  }

  const legacy = value.match(/^(\d{1,2})$/);
  if (legacy) {
    return `season_${String(parseInt(legacy[1], 10)).padStart(2, '0')}`;
  }

  return '';
}

function getSelectedSheetName() {
  const sheetSelect = document.getElementById('sheetSelect');
  return sheetSelect ? sheetSelect.value : '';
}

function getSelectedSeasonAlias() {
  const sheetSelect = document.getElementById('sheetSelect');
  if (!sheetSelect) return currentSeasonAlias;

  const option = sheetSelect.options[sheetSelect.selectedIndex];
  if (option && option.dataset && option.dataset.alias) {
    return option.dataset.alias;
  }

  return normalizeSeasonAlias(sheetSelect.value || currentSeasonAlias);
}

function getDisplayErrorMessage(error, fallbackMessage) {
  if (error && error.code === 'NETWORK_ERROR') {
    return 'API 서버 응답 스크립트를 불러오지 못했습니다. (리다이렉트/ORB 가능성) 잠시 후 다시 시도해주세요.';
  }

  return (error && error.message) ? error.message : fallbackMessage;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateTimeFromMs(ms) {
  if (!ms) return '-';
  const date = new Date(Number(ms));
  if (isNaN(date.getTime())) return '-';

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');

  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function formatDatetimeLocal(ms) {
  const date = new Date(Number(ms));
  if (isNaN(date.getTime())) return '';

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');

  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function getDateKeyFromDate(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return '';
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getDateKeyFromMs(ms) {
  const date = new Date(Number(ms));
  if (isNaN(date.getTime())) return '';
  return getDateKeyFromDate(date);
}

function parseDateKeyToDate(dateKey) {
  const match = String(dateKey || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(
    parseInt(match[1], 10),
    parseInt(match[2], 10) - 1,
    parseInt(match[3], 10),
    0,
    0,
    0,
    0
  );
}

function formatMonthTitle(year, month) {
  return `${year}년 ${month + 1}월`;
}

function formatDateKeyLabel(dateKey) {
  const date = parseDateKeyToDate(dateKey);
  if (!date) return dateKey;
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} (${weekdays[date.getDay()]})`;
}

function formatHhmmFromMs(ms) {
  const date = new Date(Number(ms));
  if (isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function getConfiguredApiBaseUrl() {
  const cfg = window.CLOUDCLUB_CONFIG || {};
  return String(cfg.API_BASE_URL || '').trim();
}

function maskApiBaseUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '-';

  try {
    const parsed = new URL(raw, window.location.href);
    const match = parsed.pathname.match(/\/macros\/s\/([^/]+)\/exec/i);
    if (!match) {
      return `${parsed.origin}${parsed.pathname}`;
    }

    const token = match[1];
    const maskedToken = token.length > 14
      ? `${token.slice(0, 8)}...${token.slice(-6)}`
      : `${token.slice(0, 4)}...${token.slice(-2)}`;

    return `${parsed.origin}/macros/s/${maskedToken}/exec`;
  } catch (error) {
    return '[invalid-url]';
  }
}

function setVariableActionButtonsDisabled(disabled) {
  const buttonIds = [
    'variablesSaveBtn',
    'variablesReloadBtn',
    'variablesTemplatePreserveBtn',
    'variablesTemplateResetBtn'
  ];

  buttonIds.forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.disabled = !!disabled;
  });
}

function renderVariableCompatibilityNotice(state) {
  const node = document.getElementById('variablesCompatibilityNotice');
  if (!node) return;

  const info = state || {};
  const maskedUrl = maskApiBaseUrl(getConfiguredApiBaseUrl());
  const versionText = info.apiVersion ? `API 버전: ${escapeHtml(info.apiVersion)}` : 'API 버전: 확인 불가';
  const serverTimeText = info.serverTime ? `서버 시각: ${escapeHtml(info.serverTime)}` : '';
  const baseLine = `<div><strong>현재 API URL:</strong> <code>${escapeHtml(maskedUrl)}</code></div>`;
  const versionLine = `<div><strong>${versionText}</strong>${serverTimeText ? ` / ${serverTimeText}` : ''}</div>`;

  if (info.blocked) {
    node.className = 'compat-notice blocked';
    node.innerHTML = `
      <div><strong>백엔드 구버전 연결됨</strong></div>
      <div>${escapeHtml(info.message || 'Apps Script 재배포 + GitHub Pages 재배포가 필요합니다.')}</div>
      ${versionLine}
      ${baseLine}
    `;
    return;
  }

  node.className = 'compat-notice';
  node.innerHTML = `
    <div><strong>변수 API 호환성 정상</strong></div>
    ${versionLine}
    ${baseLine}
  `;
}

function setVariableTabBlocked(blocked, message, info) {
  variableTabBlocked = !!blocked;
  const payload = Object.assign({}, info || {}, {
    blocked: !!blocked,
    message: message || ''
  });
  renderVariableCompatibilityNotice(payload);
  setVariableActionButtonsDisabled(!!blocked);

  if (!blocked) {
    return;
  }

  const tableWrap = document.getElementById('variablesTableWrap');
  const help = document.getElementById('variablesHelpPanel');
  if (tableWrap) {
    tableWrap.innerHTML = `<div class="error">${escapeHtml(message || '백엔드 구버전으로 변수 탭을 사용할 수 없습니다.')}</div>`;
  }
  if (help) {
    help.innerHTML = `
      <h4>백엔드 배포 버전을 확인해주세요.</h4>
      <p class="help-muted">Apps Script 최신 버전 배포 후, GitHub Pages를 workflow_dispatch로 재배포하면 정상 동작합니다.</p>
    `;
  }
}

function hasRequiredVariableActions(supportedActions) {
  const required = ['apiInfo', 'variablesGet', 'variablesNormalize', 'variablesResetTemplate'];
  const actionSet = {};
  (supportedActions || []).forEach(action => {
    actionSet[String(action || '').trim()] = true;
  });
  return required.every(action => !!actionSet[action]);
}

async function ensureVariableApiCompatibility() {
  try {
    const info = await CloudClubApi.call('apiInfo', {
      adminToken
    });
    if (!info || info.success === false) {
      setVariableTabBlocked(
        true,
        (info && info.message) ? info.message : 'apiInfo 응답이 올바르지 않습니다. 백엔드를 재배포하세요.',
        info || {}
      );
      return false;
    }

    const supportedActions = Array.isArray(info.supportedActions) ? info.supportedActions : [];
    const compatible = hasRequiredVariableActions(supportedActions);
    variableApiInfo = info;

    if (!compatible) {
      setVariableTabBlocked(
        true,
        'variablesGet/variablesNormalize/variablesResetTemplate 미지원 백엔드입니다. Apps Script와 GitHub Pages를 최신으로 재배포하세요.',
        info
      );
      return false;
    }

    setVariableTabBlocked(false, '', info);
    return true;
  } catch (error) {
    if (handleUnauthorizedError(error)) return false;
    const message = error && error.code === 'UNSUPPORTED_ACTION'
      ? 'apiInfo 미지원 백엔드입니다. Apps Script 최신 배포 후 GitHub Pages를 다시 배포하세요.'
      : getDisplayErrorMessage(error, '백엔드 버전 확인 중 오류가 발생했습니다.');
    setVariableTabBlocked(true, message, variableApiInfo || {});
    return false;
  }
}

function showBoxMessage(targetId, message, success) {
  const node = document.getElementById(targetId);
  if (!node) return;

  node.className = success ? 'success' : 'error';
  node.innerHTML = message;
  node.style.display = 'block';

  setTimeout(() => {
    node.style.display = 'none';
  }, 5000);
}

function showToast(message, success) {
  const node = document.createElement('div');
  node.className = success ? 'success' : 'error';
  node.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 9999; padding: 14px 18px; border-radius: 10px; max-width: 360px;';
  node.innerHTML = message;
  document.body.appendChild(node);

  setTimeout(() => {
    node.remove();
  }, 3000);
}

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

  if (!window.Papa || !window.XLSX) {
    alert('파서 라이브러리를 불러오지 못했습니다. 페이지를 새로고침 후 다시 시도해주세요.');
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

function createConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const particles = [];
  const colors = ['#60a5fa', '#3b82f6', '#93bbfc', '#dbeafe', '#fbbf24', '#f59e0b', '#a78bfa', '#e9d5ff'];

  for (let i = 0; i < 120; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      vx: Math.random() * 3 - 1.5,
      vy: Math.random() * 3 + 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: Math.random() * 8 + 4,
      angle: Math.random() * 360,
      angleV: Math.random() * 6 - 3
    });
  }

  let animationId;

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    particles.forEach((p, index) => {
      p.x += p.vx;
      p.y += p.vy;
      p.angle += p.angleV;
      p.vy += 0.1;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle * Math.PI / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();

      if (p.y > canvas.height) {
        particles.splice(index, 1);
      }
    });

    if (particles.length > 0) {
      animationId = requestAnimationFrame(animate);
    } else {
      canvas.style.display = 'none';
    }
  }

  canvas.style.display = 'block';
  animate();

  setTimeout(() => {
    cancelAnimationFrame(animationId);
    canvas.style.display = 'none';
  }, 3500);
}

function handleUnauthorizedError(error) {
  if (error && error.code === 'UNAUTHORIZED') {
    sessionStorage.removeItem('cc_admin_token');
    alert('관리자 인증이 만료되었습니다. 페이지를 새로고침 후 다시 인증해주세요.');
    return true;
  }

  return false;
}

async function ensureAdminAccess() {
  const cachedToken = sessionStorage.getItem('cc_admin_token');
  if (cachedToken) {
    adminToken = cachedToken;
    return;
  }

  await new Promise((resolve) => {
    const backdrop = document.createElement('div');
    backdrop.className = 'admin-key-modal-backdrop';

    backdrop.innerHTML = `
      <div class="admin-key-modal">
        <h3>관리자 인증</h3>
        <p>관리자 키를 입력하세요.</p>
        <input id="adminKeyInput" type="password" placeholder="관리자 키 입력" autocomplete="off" />
        <div class="admin-key-modal-actions">
          <button id="adminKeySubmitBtn" type="button">확인</button>
        </div>
      </div>
    `;

    document.body.appendChild(backdrop);

    const input = document.getElementById('adminKeyInput');
    const submitButton = document.getElementById('adminKeySubmitBtn');

    const submit = async () => {
      const adminKey = input.value.trim();
      if (!adminKey) {
        alert('관리자 키를 입력해주세요.');
        input.focus();
        return;
      }

      submitButton.disabled = true;
      submitButton.textContent = '검증 중...';

      try {
        const response = await CloudClubApi.call('verifyAdminKey', { adminKey });

        if (!response.success || !response.token) {
          alert(response.message || '관리자 인증에 실패했습니다.');
          submitButton.disabled = false;
          submitButton.textContent = '확인';
          input.focus();
          return;
        }

        adminToken = response.token;
        sessionStorage.setItem('cc_admin_token', adminToken);
        backdrop.remove();
        resolve();
      } catch (error) {
        alert(getDisplayErrorMessage(error, '관리자 인증 중 오류가 발생했습니다.'));
        console.error('관리자 인증 오류:', error);
        submitButton.disabled = false;
        submitButton.textContent = '확인';
        input.focus();
      }
    };

    submitButton.addEventListener('click', submit);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        submit();
      }
    });

    setTimeout(() => input.focus(), 0);
  });
}

async function initializeDashboard() {
  await ensureAdminAccess();

  await Promise.all([
    loadAdminQrCode(),
    loadSheets()
  ]);

  await Promise.all([
    refreshSessionAndRanking(),
    loadSheetLinkInfo()
  ]);

  const savedPhone = localStorage.getItem('lastUsedPhone');
  if (savedPhone) {
    const statusPhoneInput = document.getElementById('statusPhoneInput');

    if (statusPhoneInput) statusPhoneInput.value = savedPhone;
  }

  const scheduleSelect = document.getElementById('scheduleSessionSelect');
  if (scheduleSelect) {
    scheduleSelect.addEventListener('change', handleScheduleSelectionChange);
  }
  const scheduleDateInput = document.getElementById('scheduleDateInput');
  const scheduleStartTimeInput = document.getElementById('scheduleStartTimeInput');
  const scheduleEndInput = document.getElementById('scheduleEndInput');
  if (scheduleDateInput) {
    scheduleDateInput.addEventListener('change', updateSchedulePreview);
  }
  if (scheduleStartTimeInput) {
    scheduleStartTimeInput.addEventListener('change', onScheduleStartTimeChanged);
  }
  if (scheduleEndInput) {
    scheduleEndInput.addEventListener('input', () => {
      scheduleEndAutoManaged = false;
      updateSchedulePreview();
    });
  }

  const statusPhoneInput = document.getElementById('statusPhoneInput');
  if (statusPhoneInput) {
    statusPhoneInput.addEventListener('click', function () {
      this.focus();
    });
  }

  initializeAttendanceDashboardUi();
  initializeManualApproveUi();

  if (!calendarSelectedDateKey) {
    calendarSelectedDateKey = getDateKeyFromDate(new Date());
  }

  resetScheduleForm();
  syncImportSeasonInputByCurrentSelection();
  resetImportFlow(false);
  updateImportModeHintFromInput();
  initializeImportCollapsibleCards();

  const importSeasonNoInput = document.getElementById('importSeasonNoInput');
  if (importSeasonNoInput) {
    importSeasonNoInput.addEventListener('input', () => {
      invalidatePendingImportPreparation('season-input-typing');
      importManualConfirmed = false;
      updateImportModeHintFromInput();
      if (importInference) {
        rebuildImportPreview();
      }
    });
    importSeasonNoInput.addEventListener('blur', () => {
      invalidatePendingImportPreparation('season-input-blur');
      const parsed = normalizeSeasonInputFieldValue();
      updateImportModeHintFromInput();
      if (parsed && importInference) {
        rebuildImportPreview();
      }
    });
  }

  const importModeSelect = document.getElementById('importModeSelect');
  if (importModeSelect) {
    importModeSelect.addEventListener('change', () => {
      invalidatePendingImportPreparation('import-mode-changed');
      importManualConfirmed = false;
      if (importInference) {
        rebuildImportPreview();
      }
    });
  }

}

async function refreshSeasonData() {
  await Promise.all([
    refreshSessionAndRanking(),
    loadSheetLinkInfo()
  ]);

  const activeTab = getActiveTabName();
  if (activeTab === 'status') {
    await loadAttendanceDashboard({ forceReload: true });
    return;
  }

  if (activeTab === 'schedule' || activeTab === 'attend') {
    await loadScheduleList();
    return;
  }

  if (activeTab === 'variables') {
    await loadVariables();
    return;
  }

  if (activeTab === 'seasonImport') {
    syncImportSeasonInputByCurrentSelection();
    await refreshSheetSchemaAudit();
    return;
  }

  if (activeTab === 'graduation' || activeTab === 'excused') {
    await loadGraduationReport();
  }
}

function getActiveTabName() {
  const activeTab = document.querySelector('.tab-content.active');
  return activeTab ? activeTab.id : 'generate';
}

async function loadAdminQrCode() {
  try {
    const response = await CloudClubApi.call('adminUrl');
    createQrCode(response.url);
  } catch (error) {
    console.error('관리자 URL 로드 실패:', error);
  }
}

async function loadSheetLinkInfo() {
  const alias = getSelectedSeasonAlias();
  if (!alias) return;

  try {
    const response = await CloudClubApi.call('sheetLink', {
      season: alias,
      adminToken: adminToken
    });

    const info = document.getElementById('sheetLinkInfo');
    if (!info) return;

    if (!response.success) {
      info.textContent = response.message || '시트 링크를 불러오지 못했습니다.';
      return;
    }

    info.textContent = `현재 시즌: ${response.seasonAlias} (${response.sheetName})`;
  } catch (error) {
    if (handleUnauthorizedError(error)) return;
    console.error('시트 링크 정보 조회 실패:', error);
  }
}

async function openCurrentSheet() {
  const alias = getSelectedSeasonAlias();
  if (!alias) {
    alert('먼저 시즌 시트를 선택해주세요.');
    return;
  }

  try {
    const response = await CloudClubApi.call('sheetLink', {
      season: alias,
      adminToken: adminToken
    });

    if (!response.success || !response.sheetUrl) {
      alert(response.message || '시트 링크를 열 수 없습니다.');
      return;
    }

    window.open(response.sheetUrl, '_blank', 'noopener,noreferrer');
  } catch (error) {
    if (handleUnauthorizedError(error)) return;
    alert(getDisplayErrorMessage(error, '시트 링크를 여는 중 오류가 발생했습니다.'));
  }
}

async function generateSeasonQRCode() {
  const selectedSeason = getSelectedSeasonAlias();

  if (!selectedSeason) {
    alert('먼저 시트를 선택해주세요.');
    return;
  }

  try {
    const response = await CloudClubApi.call('studentUrl', { season: selectedSeason });
    handleSeasonQRCode(response.url);
  } catch (error) {
    handleSeasonQRCodeError(error);
  }
}

function handleSeasonQRCode(studentUrl) {
  currentSeasonUrl = studentUrl;

  const qrContainer = document.getElementById('seasonQrcode');
  qrContainer.innerHTML = '';

  const overlay = document.createElement('div');
  overlay.className = 'qr-overlay';
  overlay.innerHTML = '<span><i class="fas fa-eye"></i> 클릭하여 QR코드 보기</span>';
  qrContainer.appendChild(overlay);

  new QRCode(qrContainer, {
    text: studentUrl,
    width: 300,
    height: 300
  });

  qrContainer.onclick = () => toggleQRBlur('seasonQrcode');
  qrContainer.classList.add('blurred');
  qrContainer.style.display = 'flex';

  document.getElementById('urlText').textContent = studentUrl;
  document.getElementById('studentUrl').style.display = 'block';

  showToast('<i class="fas fa-check-circle"></i> 학생용 QR코드가 생성되었습니다!', true);
}

function handleSeasonQRCodeError(error) {
  alert('QR코드 생성 중 오류가 발생했습니다: ' + getDisplayErrorMessage(error, '알 수 없는 오류'));
}

function copyUrl() {
  if (!currentSeasonUrl) {
    alert('복사할 URL이 없습니다.');
    return;
  }

  navigator.clipboard.writeText(currentSeasonUrl).then(() => {
    const copyBtn = document.querySelector('.copy-btn');
    const originalText = copyBtn.innerHTML;
    copyBtn.innerHTML = '<i class="fas fa-check"></i> 복사됨!';
    copyBtn.style.background = 'rgba(34, 197, 94, 0.2)';
    copyBtn.style.borderColor = 'rgba(34, 197, 94, 0.3)';
    copyBtn.style.color = '#4ade80';

    setTimeout(() => {
      copyBtn.innerHTML = originalText;
      copyBtn.style.background = 'rgba(59, 130, 246, 0.2)';
      copyBtn.style.borderColor = 'rgba(59, 130, 246, 0.3)';
      copyBtn.style.color = '#60a5fa';
    }, 1800);
  }).catch(() => {
    alert('URL 복사에 실패했습니다.');
  });
}

function getDefaultAttendanceDashboardState() {
  return {
    group: 'all',
    dateFrom: '',
    dateTo: '',
    sessionSearch: '',
    sessionKeys: [],
    topN: 10,
    sortBy: 'attendanceRate',
    chartType: 'bar',
    selectedMemberKeys: [],
    memberSearch: ''
  };
}

function normalizeAttendanceDashboardState(rawState) {
  const base = getDefaultAttendanceDashboardState();
  const source = rawState || {};

  const normalized = {
    group: ['all', 'ob', 'yb'].includes(String(source.group || '').toLowerCase())
      ? String(source.group || '').toLowerCase()
      : base.group,
    dateFrom: /^\d{4}-\d{2}-\d{2}$/.test(String(source.dateFrom || '')) ? String(source.dateFrom || '') : '',
    dateTo: /^\d{4}-\d{2}-\d{2}$/.test(String(source.dateTo || '')) ? String(source.dateTo || '') : '',
    sessionSearch: String(source.sessionSearch || '').trim(),
    sessionKeys: Array.isArray(source.sessionKeys) ? source.sessionKeys.map(v => String(v || '').trim()).filter(v => !!v) : [],
    topN: Math.max(1, Math.min(30, parseInt(String(source.topN || base.topN), 10) || base.topN)),
    sortBy: ['attendanceRate', 'absenceRate', 'participants'].includes(String(source.sortBy || ''))
      ? String(source.sortBy || '')
      : base.sortBy,
    chartType: String(source.chartType || '').toLowerCase() === 'line' ? 'line' : 'bar',
    selectedMemberKeys: Array.isArray(source.selectedMemberKeys)
      ? source.selectedMemberKeys.map(v => String(v || '').trim()).filter(v => !!v).slice(0, ATTENDANCE_DASHBOARD_MAX_MEMBER_SELECTION)
      : [],
    memberSearch: String(source.memberSearch || '').trim()
  };

  if (normalized.dateFrom && normalized.dateTo && normalized.dateFrom > normalized.dateTo) {
    const temp = normalized.dateFrom;
    normalized.dateFrom = normalized.dateTo;
    normalized.dateTo = temp;
  }

  normalized.sessionKeys = Array.from(new Set(normalized.sessionKeys));
  normalized.selectedMemberKeys = Array.from(new Set(normalized.selectedMemberKeys));
  return normalized;
}

function readAttendanceDashboardStateFromStorage() {
  try {
    const raw = localStorage.getItem(ATTENDANCE_DASHBOARD_STORAGE_KEY);
    if (!raw) return null;
    return normalizeAttendanceDashboardState(JSON.parse(raw));
  } catch (error) {
    return null;
  }
}

function saveAttendanceDashboardStateToStorage() {
  try {
    localStorage.setItem(ATTENDANCE_DASHBOARD_STORAGE_KEY, JSON.stringify(attendanceDashboardState));
  } catch (error) {
    // no-op
  }
}

function readAttendanceDashboardStateFromQuery() {
  try {
    const query = new URLSearchParams(window.location.search || '');
    const state = {};
    if (query.has('dash_group')) state.group = query.get('dash_group');
    if (query.has('dash_from')) state.dateFrom = query.get('dash_from');
    if (query.has('dash_to')) state.dateTo = query.get('dash_to');
    if (query.has('dash_session_q')) state.sessionSearch = query.get('dash_session_q');
    if (query.has('dash_sessions')) state.sessionKeys = String(query.get('dash_sessions') || '').split(',').map(v => v.trim()).filter(v => !!v);
    if (query.has('dash_top')) state.topN = query.get('dash_top');
    if (query.has('dash_sort')) state.sortBy = query.get('dash_sort');
    if (query.has('dash_chart')) state.chartType = query.get('dash_chart');
    if (query.has('dash_members')) state.selectedMemberKeys = String(query.get('dash_members') || '').split(',').map(v => v.trim()).filter(v => !!v);
    if (query.has('dash_member_q')) state.memberSearch = query.get('dash_member_q');
    return Object.keys(state).length > 0 ? normalizeAttendanceDashboardState(state) : null;
  } catch (error) {
    return null;
  }
}

function buildAttendanceDashboardShareUrl() {
  const url = new URL(window.location.href);
  const state = normalizeAttendanceDashboardState(attendanceDashboardState);
  const setOrDelete = (key, value) => {
    if (value === undefined || value === null || value === '') {
      url.searchParams.delete(key);
      return;
    }
    url.searchParams.set(key, String(value));
  };

  setOrDelete('dash_group', state.group);
  setOrDelete('dash_from', state.dateFrom);
  setOrDelete('dash_to', state.dateTo);
  setOrDelete('dash_session_q', state.sessionSearch);
  setOrDelete('dash_sessions', state.sessionKeys.join(','));
  setOrDelete('dash_top', state.topN);
  setOrDelete('dash_sort', state.sortBy);
  setOrDelete('dash_chart', state.chartType);
  setOrDelete('dash_members', state.selectedMemberKeys.join(','));
  setOrDelete('dash_member_q', state.memberSearch);
  url.searchParams.delete('dash_donut');

  return url.toString();
}

function applyAttendanceDashboardStateToControls() {
  const groupSelect = document.getElementById('dashboardGroupSelect');
  const dateFromInput = document.getElementById('dashboardDateFromInput');
  const dateToInput = document.getElementById('dashboardDateToInput');
  const sessionSearchInput = document.getElementById('dashboardSessionSearchInput');
  const topNSelect = document.getElementById('dashboardTopNSelect');
  const sortBySelect = document.getElementById('dashboardSortBySelect');
  const chartTypeSelect = document.getElementById('dashboardChartTypeSelect');
  const memberSearchInput = document.getElementById('dashboardMemberSearchInput');

  if (groupSelect) groupSelect.value = attendanceDashboardState.group;
  attendanceDashboardDateInputSyncing = true;
  if (dateFromInput) dateFromInput.value = attendanceDashboardState.dateFrom || '';
  if (dateToInput) dateToInput.value = attendanceDashboardState.dateTo || '';
  attendanceDashboardDateInputSyncing = false;
  if (sessionSearchInput) sessionSearchInput.value = attendanceDashboardState.sessionSearch || '';
  if (topNSelect) topNSelect.value = String(attendanceDashboardState.topN || 10);
  if (sortBySelect) sortBySelect.value = attendanceDashboardState.sortBy || 'attendanceRate';
  if (chartTypeSelect) chartTypeSelect.value = attendanceDashboardState.chartType || 'bar';
  if (memberSearchInput) memberSearchInput.value = attendanceDashboardState.memberSearch || '';

  syncDashboardSessionSelectSelection();
  syncDashboardMemberSelectSelection();
}

function syncDashboardSessionSelectSelection() {
  const sessionSelect = document.getElementById('dashboardSessionSelect');
  if (!sessionSelect) return;
  const selectedSet = {};
  (attendanceDashboardState.sessionKeys || []).forEach(key => { selectedSet[key] = true; });
  Array.from(sessionSelect.options || []).forEach(option => {
    option.selected = !!selectedSet[option.value];
  });
}

function syncDashboardMemberSelectSelection() {
  const memberSelect = document.getElementById('dashboardMemberSelect');
  if (!memberSelect) return;
  const selectedSet = {};
  (attendanceDashboardState.selectedMemberKeys || []).forEach(key => { selectedSet[key] = true; });
  Array.from(memberSelect.options || []).forEach(option => {
    option.selected = !!selectedSet[option.value];
  });
}

function collectAttendanceDashboardStateFromControls() {
  const groupSelect = document.getElementById('dashboardGroupSelect');
  const dateFromInput = document.getElementById('dashboardDateFromInput');
  const dateToInput = document.getElementById('dashboardDateToInput');
  const sessionSearchInput = document.getElementById('dashboardSessionSearchInput');
  const sessionSelect = document.getElementById('dashboardSessionSelect');
  const topNSelect = document.getElementById('dashboardTopNSelect');
  const sortBySelect = document.getElementById('dashboardSortBySelect');
  const chartTypeSelect = document.getElementById('dashboardChartTypeSelect');
  const memberSearchInput = document.getElementById('dashboardMemberSearchInput');
  const memberSelect = document.getElementById('dashboardMemberSelect');

  const sessionKeys = sessionSelect
    ? Array.from(sessionSelect.selectedOptions || []).map(option => option.value).filter(value => !!value)
    : [];
  const selectedMemberKeys = memberSelect
    ? Array.from(memberSelect.selectedOptions || []).map(option => option.value).filter(value => !!value)
    : [];

  attendanceDashboardState = normalizeAttendanceDashboardState({
    group: groupSelect ? groupSelect.value : attendanceDashboardState.group,
    dateFrom: dateFromInput ? dateFromInput.value : attendanceDashboardState.dateFrom,
    dateTo: dateToInput ? dateToInput.value : attendanceDashboardState.dateTo,
    sessionSearch: sessionSearchInput ? sessionSearchInput.value : attendanceDashboardState.sessionSearch,
    sessionKeys: sessionKeys.length > 0 ? sessionKeys : attendanceDashboardState.sessionKeys,
    topN: topNSelect ? topNSelect.value : attendanceDashboardState.topN,
    sortBy: sortBySelect ? sortBySelect.value : attendanceDashboardState.sortBy,
    chartType: chartTypeSelect ? chartTypeSelect.value : attendanceDashboardState.chartType,
    selectedMemberKeys: selectedMemberKeys.length > 0 ? selectedMemberKeys : attendanceDashboardState.selectedMemberKeys,
    memberSearch: memberSearchInput ? memberSearchInput.value : attendanceDashboardState.memberSearch
  });

  if (sessionSelect && sessionSelect.options && sessionSelect.options.length > 0 && sessionSelect.selectedOptions.length === 0) {
    attendanceDashboardState.sessionKeys = [];
  }
  if (memberSelect && memberSelect.options && memberSelect.options.length > 0 && memberSelect.selectedOptions.length === 0) {
    attendanceDashboardState.selectedMemberKeys = [];
  }
}

function getAttendanceDashboardApiFilterParams() {
  return {
    group: attendanceDashboardState.group || 'all',
    dateFrom: attendanceDashboardState.dateFrom || '',
    dateTo: attendanceDashboardState.dateTo || '',
    sessionKeysCsv: (attendanceDashboardState.sessionKeys || []).join(','),
    topN: attendanceDashboardState.topN || 10,
    sortBy: attendanceDashboardState.sortBy || 'attendanceRate',
    chartType: attendanceDashboardState.chartType || 'bar'
  };
}

function setAttendanceDashboardMetaText(text) {
  const node = document.getElementById('dashboardMetaText');
  if (!node) return;
  node.textContent = text;
}

function setAttendanceDashboardKpiValue(id, text) {
  const node = document.getElementById(id);
  if (!node) return;
  node.textContent = text;
}

function formatDashboardPercent(value) {
  const n = Number(value || 0);
  return `${isNaN(n) ? 0 : Math.round(n)}%`;
}

function formatDashboardStatus(status) {
  return ATTENDANCE_DASHBOARD_STATUS_LABELS[String(status || '').toLowerCase()] || String(status || '-');
}

function formatSignedOffsetMinutes(seconds) {
  const n = Number(seconds);
  if (isNaN(n)) return '-';
  const sign = n < 0 ? '-' : '+';
  const abs = Math.abs(n);
  const mm = Math.floor(abs / 60);
  const ss = abs % 60;
  return `${sign}${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function formatDateKeyFromTimestamp(ms) {
  const date = new Date(Number(ms));
  if (isNaN(date.getTime())) return '';
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getDashboardCohortBadge(tag) {
  if (tag === 'OB' || tag === 'YB') return tag;
  return '미분류';
}

function renderAttendanceDashboardKpis(payload) {
  const kpi = payload && payload.kpi ? payload.kpi : {};
  setAttendanceDashboardKpiValue('dashboardKpiTotalMembers', String(kpi.totalMembers || 0));
  setAttendanceDashboardKpiValue('dashboardKpiObMembers', String(kpi.obMembers || 0));
  setAttendanceDashboardKpiValue('dashboardKpiYbMembers', String(kpi.ybMembers || 0));
  setAttendanceDashboardKpiValue('dashboardKpiAttendanceRate', formatDashboardPercent(kpi.averageAttendanceRate || 0));
  setAttendanceDashboardKpiValue('dashboardKpiLateRate', formatDashboardPercent(kpi.averageLateRate || 0));
  setAttendanceDashboardKpiValue('dashboardKpiAbsenceRate', formatDashboardPercent(kpi.averageAbsenceRate || 0));
}

function getAttendanceDashboardAvailableSessions() {
  return attendanceDashboardPayload && attendanceDashboardPayload.meta && Array.isArray(attendanceDashboardPayload.meta.availableSessions)
    ? attendanceDashboardPayload.meta.availableSessions
    : [];
}

function getAttendanceDashboardMemberOptions() {
  return attendanceDashboardPayload && attendanceDashboardPayload.meta && Array.isArray(attendanceDashboardPayload.meta.memberOptions)
    ? attendanceDashboardPayload.meta.memberOptions
    : [];
}

function getFilteredDashboardSessionOptions() {
  const options = getAttendanceDashboardAvailableSessions();
  const keyword = String(attendanceDashboardState.sessionSearch || '').trim().toLowerCase();
  if (!keyword) return options;

  return options.filter(item => {
    const key = String(item.sessionKey || '').toLowerCase();
    const date = String(item.date || '').toLowerCase();
    return key.includes(keyword) || date.includes(keyword);
  });
}

function renderAttendanceDashboardSessionOptions(payload) {
  const sessionSelect = document.getElementById('dashboardSessionSelect');
  if (!sessionSelect) return;

  const sessions = payload && payload.meta && Array.isArray(payload.meta.availableSessions)
    ? payload.meta.availableSessions
    : [];
  const selectedSet = {};
  (attendanceDashboardState.sessionKeys || []).forEach(key => { selectedSet[key] = true; });

  sessionSelect.innerHTML = '';
  sessions.forEach(item => {
    const option = document.createElement('option');
    option.value = item.sessionKey;
    option.textContent = `${item.date}${item.isClosed ? '' : ' (예정)'}`;
    option.selected = !!selectedSet[item.sessionKey];
    sessionSelect.appendChild(option);
  });

  const validSet = {};
  sessions.forEach(item => { validSet[item.sessionKey] = true; });
  attendanceDashboardState.sessionKeys = (attendanceDashboardState.sessionKeys || []).filter(key => !!validSet[key]);
  syncDashboardSessionSelectSelection();
  renderAttendanceDashboardSessionPicker();
}

function getFilteredDashboardMemberOptions() {
  const options = getAttendanceDashboardMemberOptions();
  const keyword = String(attendanceDashboardState.memberSearch || '').trim().toLowerCase();
  if (!keyword) return options;

  return options.filter(item => {
    const name = String(item.name || '').toLowerCase();
    const seasonLabel = String(item.seasonLabel || '').toLowerCase();
    const cohort = String(item.cohortTag || '').toLowerCase();
    return name.includes(keyword) || seasonLabel.includes(keyword) || cohort.includes(keyword);
  });
}

function renderAttendanceDashboardMemberOptions() {
  const memberSelect = document.getElementById('dashboardMemberSelect');
  if (!memberSelect) return;

  const allOptions = getAttendanceDashboardMemberOptions();
  const selectedSet = {};
  (attendanceDashboardState.selectedMemberKeys || []).forEach(key => { selectedSet[key] = true; });

  memberSelect.innerHTML = '';
  allOptions.forEach(item => {
    const option = document.createElement('option');
    option.value = item.memberKey;
    option.textContent = `${item.seasonLabel} ${item.name} (${item.attendedCount}회/${item.attendanceRate}%)`;
    option.selected = !!selectedSet[item.memberKey];
    memberSelect.appendChild(option);
  });

  const validSet = {};
  allOptions.forEach(item => { validSet[item.memberKey] = true; });
  attendanceDashboardState.selectedMemberKeys = (attendanceDashboardState.selectedMemberKeys || []).filter(key => !!validSet[key]);
  syncDashboardMemberSelectSelection();
  renderAttendanceDashboardMemberPicker();
}

function renderAttendanceDashboardSessionPicker() {
  const optionList = document.getElementById('dashboardSessionOptionList');
  const chipList = document.getElementById('dashboardSessionChipList');
  const hintNode = document.getElementById('dashboardSessionSelectionHint');
  const countBadge = document.getElementById('dashboardSessionCountBadge');
  if (!optionList || !chipList) return;

  const allSessions = getAttendanceDashboardAvailableSessions();
  const filtered = getFilteredDashboardSessionOptions();
  const selectedKeys = attendanceDashboardState.sessionKeys || [];
  const selectedSet = {};
  selectedKeys.forEach(key => { selectedSet[key] = true; });
  const sessionMap = {};
  allSessions.forEach(item => { sessionMap[item.sessionKey] = item; });

  if (filtered.length === 0) {
    optionList.innerHTML = '<div class="dashboard-option-empty">조건에 맞는 회차가 없습니다.</div>';
  } else {
    optionList.innerHTML = filtered.map(item => `
      <label class="dashboard-option-row">
        <input type="checkbox" data-session-key="${escapeHtml(item.sessionKey)}" ${selectedSet[item.sessionKey] ? 'checked' : ''}>
        <span class="dashboard-option-content">
          <span class="dashboard-option-main">${escapeHtml(item.sessionKey || '-')}</span>
          <span class="dashboard-option-sub">${escapeHtml(item.date || '-')}</span>
        </span>
        <span class="dashboard-option-badge ${item.isClosed ? 'closed' : 'open'}">${item.isClosed ? '종료' : '예정'}</span>
      </label>
    `).join('');
  }

  const previewKeys = selectedKeys.slice(0, 2);
  const overflowCount = Math.max(0, selectedKeys.length - previewKeys.length);
  chipList.innerHTML = selectedKeys.length === 0
    ? '<span class="dashboard-selection-hint">선택 없음</span>'
    : previewKeys.map(key => {
      const session = sessionMap[key];
      const label = session ? `${session.sessionKey}` : key;
      return `
        <span class="dashboard-chip">
          <span class="dashboard-chip-text">${escapeHtml(label)}</span>
          <button type="button" class="dashboard-chip-remove" data-session-remove-key="${escapeHtml(key)}">x</button>
        </span>
      `;
    }).join('') + (overflowCount > 0 ? `<span class="dashboard-chip dashboard-chip-overflow">+${overflowCount}</span>` : '');

  if (hintNode) {
    const closedCount = selectedKeys.filter(key => {
      const item = sessionMap[key];
      return item && item.isClosed;
    }).length;
    hintNode.textContent = `종료 회차 ${closedCount}개 포함 / 필터 적용 시 전체 지표 동기화`;
  }
  if (countBadge) {
    countBadge.textContent = `선택 ${selectedKeys.length}개`;
  }
}

function renderAttendanceDashboardMemberPicker() {
  const optionList = document.getElementById('dashboardMemberOptionList');
  const chipList = document.getElementById('dashboardMemberChipList');
  const hintNode = document.getElementById('dashboardMemberSelectionHint');
  const countBadge = document.getElementById('dashboardMemberCountBadge');
  if (!optionList || !chipList) return;

  const allOptions = getAttendanceDashboardMemberOptions();
  const filtered = getFilteredDashboardMemberOptions();
  const selectedKeys = attendanceDashboardState.selectedMemberKeys || [];
  const selectedSet = {};
  selectedKeys.forEach(key => { selectedSet[key] = true; });
  const optionMap = {};
  allOptions.forEach(item => { optionMap[item.memberKey] = item; });
  const reachedLimit = selectedKeys.length >= ATTENDANCE_DASHBOARD_MAX_MEMBER_SELECTION;

  if (filtered.length === 0) {
    optionList.innerHTML = '<div class="dashboard-option-empty">조건에 맞는 회원이 없습니다.</div>';
  } else {
    optionList.innerHTML = filtered.map(item => {
      const checked = !!selectedSet[item.memberKey];
      const disabled = reachedLimit && !checked;
      const cohortTag = getDashboardCohortBadge(item.cohortTag || '');
      return `
        <label class="dashboard-option-row${disabled ? ' is-disabled' : ''}">
          <input type="checkbox" data-member-key="${escapeHtml(item.memberKey)}" ${checked ? 'checked' : ''} ${disabled ? 'disabled' : ''}>
          <span class="dashboard-option-content">
            <span class="dashboard-option-main">${escapeHtml(item.seasonLabel || '-')} ${escapeHtml(item.name || '-')}</span>
            <span class="dashboard-option-sub">${escapeHtml(cohortTag)} | ${Number(item.attendedCount || 0)}회 / ${Number(item.attendanceRate || 0)}%</span>
          </span>
        </label>
      `;
    }).join('');
  }

  const previewKeys = selectedKeys.slice(0, 2);
  const overflowCount = Math.max(0, selectedKeys.length - previewKeys.length);
  chipList.innerHTML = selectedKeys.length === 0
    ? '<span class="dashboard-selection-hint">선택 없음</span>'
    : previewKeys.map(key => {
      const item = optionMap[key];
      const label = item ? `${item.seasonLabel} ${item.name}` : key;
      return `
        <span class="dashboard-chip">
          <span class="dashboard-chip-text">${escapeHtml(label)}</span>
          <button type="button" class="dashboard-chip-remove" data-member-remove-key="${escapeHtml(key)}">x</button>
        </span>
      `;
    }).join('') + (overflowCount > 0 ? `<span class="dashboard-chip dashboard-chip-overflow">+${overflowCount}</span>` : '');

  if (hintNode) {
    hintNode.textContent = `최대 ${ATTENDANCE_DASHBOARD_MAX_MEMBER_SELECTION}명 / hover로 출석일시·유고사유 확인`;
  }
  if (countBadge) {
    countBadge.textContent = `선택 ${selectedKeys.length}/${ATTENDANCE_DASHBOARD_MAX_MEMBER_SELECTION}`;
  }
}

function setAttendanceDashboardSessionKeys(keys, options) {
  const opts = options || {};
  const validSet = {};
  getAttendanceDashboardAvailableSessions().forEach(item => {
    validSet[item.sessionKey] = true;
  });

  const next = [];
  const unique = {};
  (Array.isArray(keys) ? keys : []).forEach(raw => {
    const key = String(raw || '').trim();
    if (!key || unique[key] || !validSet[key]) return;
    unique[key] = true;
    next.push(key);
  });

  attendanceDashboardState.sessionKeys = next;
  syncDashboardSessionSelectSelection();
  renderAttendanceDashboardSessionPicker();
  if (opts.save !== false) {
    saveAttendanceDashboardStateToStorage();
  }
}

function setAttendanceDashboardMemberKeys(keys, options) {
  const opts = options || {};
  const validSet = {};
  getAttendanceDashboardMemberOptions().forEach(item => {
    validSet[item.memberKey] = true;
  });

  const next = [];
  const unique = {};
  (Array.isArray(keys) ? keys : []).forEach(raw => {
    const key = String(raw || '').trim();
    if (!key || unique[key] || !validSet[key]) return;
    unique[key] = true;
    next.push(key);
  });

  let trimmed = next;
  if (trimmed.length > ATTENDANCE_DASHBOARD_MAX_MEMBER_SELECTION) {
    trimmed = trimmed.slice(0, ATTENDANCE_DASHBOARD_MAX_MEMBER_SELECTION);
    if (opts.showLimitToast !== false) {
      showToast(`<i class="fas fa-info-circle"></i> 개인 시계열은 최대 ${ATTENDANCE_DASHBOARD_MAX_MEMBER_SELECTION}명까지 선택됩니다.`, true);
    }
  }

  attendanceDashboardState.selectedMemberKeys = trimmed;
  syncDashboardMemberSelectSelection();
  renderAttendanceDashboardMemberPicker();
  if (opts.save !== false) {
    saveAttendanceDashboardStateToStorage();
  }
  if (opts.renderTrend !== false) {
    renderAttendanceDashboardMemberTrendChart();
  }
  if (opts.drilldown !== false && trimmed.length === 1) {
    loadAttendanceDashboardDrilldown('member', trimmed[0]);
  }
}

function getAttendanceDashboardPopoverElements(type) {
  if (type === 'session') {
    return {
      popover: document.getElementById('dashboardSessionPickerPopover'),
      button: document.getElementById('dashboardSessionPickerBtn'),
      field: document.getElementById('dashboardSessionPickerField')
    };
  }
  if (type === 'member') {
    return {
      popover: document.getElementById('dashboardMemberPickerPopover'),
      button: document.getElementById('dashboardMemberPickerBtn'),
      field: document.getElementById('dashboardMemberPickerField')
    };
  }
  return { popover: null, button: null, field: null };
}

function setAttendanceDashboardPopoverOpen(type, open) {
  const targetType = type === 'member' ? 'member' : 'session';
  const elements = getAttendanceDashboardPopoverElements(targetType);
  if (!elements.popover) return;

  elements.popover.hidden = !open;
  elements.popover.classList.toggle('is-open', open);
  if (elements.button) {
    elements.button.setAttribute('aria-expanded', open ? 'true' : 'false');
  }
  if (elements.field) {
    elements.field.classList.toggle('is-open', open);
  }
  if (open) {
    attendanceDashboardActivePopover = targetType;
  } else if (attendanceDashboardActivePopover === targetType) {
    attendanceDashboardActivePopover = '';
  }
}

function closeAttendanceDashboardPopovers() {
  setAttendanceDashboardPopoverOpen('session', false);
  setAttendanceDashboardPopoverOpen('member', false);
  attendanceDashboardActivePopover = '';
}

function toggleAttendanceDashboardPopover(type) {
  const targetType = type === 'member' ? 'member' : 'session';
  const shouldOpen = attendanceDashboardActivePopover !== targetType;
  if (shouldOpen) {
    const otherType = targetType === 'session' ? 'member' : 'session';
    setAttendanceDashboardPopoverOpen(otherType, false);
  }
  setAttendanceDashboardPopoverOpen(targetType, shouldOpen);
}

function destroyAttendanceDashboardCharts() {
  if (attendanceDashboardEventRateChart) {
    attendanceDashboardEventRateChart.destroy();
    attendanceDashboardEventRateChart = null;
  }
  if (attendanceDashboardEventStatusChart) {
    attendanceDashboardEventStatusChart.destroy();
    attendanceDashboardEventStatusChart = null;
  }
  if (attendanceDashboardMemberTrendChart) {
    attendanceDashboardMemberTrendChart.destroy();
    attendanceDashboardMemberTrendChart = null;
  }
  if (attendanceDashboardStatusDonutChart) {
    attendanceDashboardStatusDonutChart.destroy();
    attendanceDashboardStatusDonutChart = null;
  }
  if (attendanceDashboardCohortDonutChart) {
    attendanceDashboardCohortDonutChart.destroy();
    attendanceDashboardCohortDonutChart = null;
  }
  if (attendanceDashboardCountDonutChart) {
    attendanceDashboardCountDonutChart.destroy();
    attendanceDashboardCountDonutChart = null;
  }
}

function getDashboardColor(index) {
  const palette = ['#60a5fa', '#34d399', '#f59e0b', '#f87171', '#a78bfa', '#22d3ee', '#f472b6'];
  return palette[index % palette.length];
}

function ensureChartLibraryAvailable() {
  if (typeof Chart === 'undefined') {
    setAttendanceDashboardMetaText('Chart.js 로딩 실패: 차트 렌더를 건너뜁니다.');
    return false;
  }
  return true;
}

function getDashboardDonutChartRef(refName) {
  if (refName === 'status') return attendanceDashboardStatusDonutChart;
  if (refName === 'cohort') return attendanceDashboardCohortDonutChart;
  if (refName === 'count') return attendanceDashboardCountDonutChart;
  return null;
}

function setDashboardDonutChartRef(refName, chart) {
  if (refName === 'status') {
    attendanceDashboardStatusDonutChart = chart || null;
    return;
  }
  if (refName === 'cohort') {
    attendanceDashboardCohortDonutChart = chart || null;
    return;
  }
  if (refName === 'count') {
    attendanceDashboardCountDonutChart = chart || null;
  }
}

function setDashboardDonutEmptyState(chartRefName, canvasId, emptyId, message) {
  const canvas = document.getElementById(canvasId);
  const emptyNode = document.getElementById(emptyId);
  const prevChart = getDashboardDonutChartRef(chartRefName);
  if (prevChart) {
    prevChart.destroy();
    setDashboardDonutChartRef(chartRefName, null);
  }
  if (canvas) {
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    canvas.style.display = 'none';
  }
  if (emptyNode) {
    emptyNode.textContent = message;
    emptyNode.hidden = false;
  }
}

function renderDashboardDonutChart(chartRefName, canvasId, emptyId, labels, values, colors) {
  const canvas = document.getElementById(canvasId);
  const emptyNode = document.getElementById(emptyId);
  if (!canvas) return;

  const total = values.reduce((sum, value) => sum + Number(value || 0), 0);
  if (total <= 0) {
    return false;
  }

  const prevChart = getDashboardDonutChartRef(chartRefName);
  if (prevChart) {
    prevChart.destroy();
    setDashboardDonutChartRef(chartRefName, null);
  }

  canvas.style.display = '';
  if (emptyNode) {
    emptyNode.hidden = true;
  }

  const chart = new Chart(canvas.getContext('2d'), {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: values,
        borderWidth: 1,
        borderColor: 'rgba(15, 23, 42, 0.35)',
        backgroundColor: colors
      }]
    },
    options: {
      maintainAspectRatio: false,
      cutout: '58%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            color: '#dbeafe',
            boxWidth: 10,
            boxHeight: 10
          }
        },
        tooltip: {
          callbacks: {
            label(context) {
              const all = values.reduce((sum, value) => sum + Number(value || 0), 0);
              const current = Number(context.raw || 0);
              const ratio = all > 0 ? Math.round((current / all) * 100) : 0;
              return `${context.label}: ${current}명 (${ratio}%)`;
            }
          }
        }
      }
    }
  });

  setDashboardDonutChartRef(chartRefName, chart);
  return true;
}

function renderAttendanceDashboardStatusDonutChart(payload) {
  if (!ensureChartLibraryAvailable()) return;

  const donutSource = payload && payload.charts && payload.charts.donut ? payload.charts.donut : {};
  const statusRatio = donutSource.statusRatio || {};
  const values = [
    Number(statusRatio.onTimeCount || 0),
    Number(statusRatio.lateCount || 0),
    Number(statusRatio.absentCount || 0),
    Number(statusRatio.excusedCount || 0)
  ];
  const hasValue = renderDashboardDonutChart(
    'status',
    'dashboardStatusDonutChart',
    'dashboardStatusDonutEmpty',
    ['출석', '지각', '결석', '유고'],
    values,
    ['#4ade80', '#fbbf24', '#f87171', '#93c5fd']
  );

  if (!hasValue) {
    const closedCount = Number(payload && payload.meta ? payload.meta.closedSessionCount || 0 : 0);
    const message = closedCount > 0
      ? '필터 조건에 맞는 출석 상태 데이터가 없습니다.'
      : '종료된 회차가 없어 출석 상태 비율을 계산할 수 없습니다.';
    setDashboardDonutEmptyState('status', 'dashboardStatusDonutChart', 'dashboardStatusDonutEmpty', message);
  }
}

function renderAttendanceDashboardCohortDonutChart(payload) {
  if (!ensureChartLibraryAvailable()) return;

  const donutSource = payload && payload.charts && payload.charts.donut ? payload.charts.donut : {};
  const cohortRatio = donutSource.cohortRatio || {};
  const values = [
    Number(cohortRatio.obCount || (payload && payload.kpi ? payload.kpi.obMembers : 0) || 0),
    Number(cohortRatio.ybCount || (payload && payload.kpi ? payload.kpi.ybMembers : 0) || 0),
    Number(cohortRatio.unknownCount || (payload && payload.kpi ? payload.kpi.unknownMembers : 0) || 0)
  ];
  const hasValue = renderDashboardDonutChart(
    'cohort',
    'dashboardCohortDonutChart',
    'dashboardCohortDonutEmpty',
    ['OB', 'YB', '미분류'],
    values,
    ['#60a5fa', '#34d399', '#94a3b8']
  );

  if (!hasValue) {
    setDashboardDonutEmptyState(
      'cohort',
      'dashboardCohortDonutChart',
      'dashboardCohortDonutEmpty',
      '필터 조건에 맞는 인원 데이터가 없습니다.'
    );
  }
}

function buildAttendanceCountDistributionBuckets(payload) {
  const options = payload && payload.meta && Array.isArray(payload.meta.memberOptions)
    ? payload.meta.memberOptions
    : [];
  if (options.length === 0) {
    return { labels: [], values: [], colors: [] };
  }

  const countMap = {};
  options.forEach(item => {
    const raw = Number(item && item.attendedCount || 0);
    const count = isNaN(raw) ? 0 : Math.max(0, Math.floor(raw));
    countMap[count] = Number(countMap[count] || 0) + 1;
  });

  const entries = Object.keys(countMap).map(key => ({
    count: Number(key),
    members: Number(countMap[key] || 0)
  })).filter(item => item.members > 0);

  if (entries.length === 0) {
    return { labels: [], values: [], colors: [] };
  }

  const MAX_SLICES = 8;
  const TOP_EXACT_SLICES = MAX_SLICES - 1;
  let displayEntries = [];

  if (entries.length > MAX_SLICES) {
    const topEntries = entries.slice().sort((a, b) => {
      if (b.members !== a.members) return b.members - a.members;
      return a.count - b.count;
    }).slice(0, TOP_EXACT_SLICES);
    const topSet = {};
    topEntries.forEach(item => { topSet[item.count] = true; });
    const othersCount = entries
      .filter(item => !topSet[item.count])
      .reduce((sum, item) => sum + Number(item.members || 0), 0);

    displayEntries = topEntries
      .sort((a, b) => a.count - b.count)
      .map(item => ({ label: `${item.count}회`, members: item.members, isOther: false }));
    if (othersCount > 0) {
      displayEntries.push({ label: '기타', members: othersCount, isOther: true });
    }
  } else {
    displayEntries = entries
      .sort((a, b) => a.count - b.count)
      .map(item => ({ label: `${item.count}회`, members: item.members, isOther: false }));
  }

  return {
    labels: displayEntries.map(item => item.label),
    values: displayEntries.map(item => item.members),
    colors: displayEntries.map((item, index) => item.isOther ? '#64748b' : getDashboardColor(index))
  };
}

function renderAttendanceDashboardAttendanceCountDonutChart(payload) {
  if (!ensureChartLibraryAvailable()) return;

  const distribution = buildAttendanceCountDistributionBuckets(payload);
  const hasValue = renderDashboardDonutChart(
    'count',
    'dashboardAttendanceCountDonutChart',
    'dashboardAttendanceCountDonutEmpty',
    distribution.labels,
    distribution.values,
    distribution.colors
  );

  if (!hasValue) {
    setDashboardDonutEmptyState(
      'count',
      'dashboardAttendanceCountDonutChart',
      'dashboardAttendanceCountDonutEmpty',
      '필터 조건에 맞는 출석 횟수 분포 데이터가 없습니다.'
    );
  }
}

function renderAttendanceDashboardEventRateChart(payload) {
  if (!ensureChartLibraryAvailable()) return;

  const canvas = document.getElementById('dashboardEventRateChart');
  if (!canvas) return;

  const rows = payload && payload.charts && Array.isArray(payload.charts.attendanceRateBySession)
    ? payload.charts.attendanceRateBySession
    : [];
  if (rows.length === 0) {
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const labels = rows.map(row => row.sessionKey);
  const rates = rows.map(row => Number(row.attendanceRate || 0));

  if (attendanceDashboardEventRateChart) {
    attendanceDashboardEventRateChart.destroy();
    attendanceDashboardEventRateChart = null;
  }

  attendanceDashboardEventRateChart = new Chart(canvas.getContext('2d'), {
    type: attendanceDashboardState.chartType || 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: '출석률(%)',
        data: rates,
        borderColor: '#60a5fa',
        backgroundColor: 'rgba(96, 165, 250, 0.35)',
        borderWidth: 2,
        tension: 0.28,
        fill: attendanceDashboardState.chartType === 'line'
      }]
    },
    options: {
      maintainAspectRatio: false,
      responsive: true,
      scales: {
        y: { beginAtZero: true, max: 100, ticks: { color: '#bfdbfe' }, grid: { color: 'rgba(148, 163, 184, 0.2)' } },
        x: { ticks: { color: '#bfdbfe', maxRotation: 45, minRotation: 0 }, grid: { color: 'rgba(148, 163, 184, 0.08)' } }
      },
      plugins: {
        legend: { labels: { color: '#dbeafe' } },
        tooltip: {
          callbacks: {
            label(context) {
              const row = rows[context.dataIndex] || {};
              return [
                `출석률: ${row.attendanceRate || 0}%`,
                `출석/모수: ${row.attendedCount || 0}/${row.effectiveCount || 0}`,
                `지각: ${row.lateCount || 0}, 결석: ${row.absentCount || 0}, 유고: ${row.excusedCount || 0}`
              ];
            }
          }
        }
      },
      onClick(event, elements) {
        if (!elements || elements.length === 0) return;
        const index = elements[0].index;
        const row = rows[index];
        if (!row || !row.sessionKey) return;
        loadAttendanceDashboardDrilldown('event', row.sessionKey);
      }
    }
  });
}

function renderAttendanceDashboardEventStatusChart(payload) {
  if (!ensureChartLibraryAvailable()) return;

  const canvas = document.getElementById('dashboardEventStatusChart');
  if (!canvas) return;
  const rows = payload && payload.charts && Array.isArray(payload.charts.statusDistributionBySession)
    ? payload.charts.statusDistributionBySession
    : [];
  if (rows.length === 0) {
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const labels = rows.map(row => row.sessionKey);
  if (attendanceDashboardEventStatusChart) {
    attendanceDashboardEventStatusChart.destroy();
    attendanceDashboardEventStatusChart = null;
  }

  attendanceDashboardEventStatusChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        { label: '출석', data: rows.map(r => Number(r.onTimeCount || 0)), backgroundColor: 'rgba(74, 222, 128, 0.75)', borderColor: '#4ade80', borderWidth: 1, stack: 'status' },
        { label: '지각', data: rows.map(r => Number(r.lateCount || 0)), backgroundColor: 'rgba(251, 191, 36, 0.75)', borderColor: '#fbbf24', borderWidth: 1, stack: 'status' },
        { label: '결석', data: rows.map(r => Number(r.absentCount || 0)), backgroundColor: 'rgba(248, 113, 113, 0.75)', borderColor: '#f87171', borderWidth: 1, stack: 'status' },
        { label: '유고', data: rows.map(r => Number(r.excusedCount || 0)), backgroundColor: 'rgba(147, 197, 253, 0.75)', borderColor: '#93c5fd', borderWidth: 1, stack: 'status' }
      ]
    },
    options: {
      maintainAspectRatio: false,
      responsive: true,
      scales: {
        y: { beginAtZero: true, stacked: true, ticks: { color: '#bfdbfe' }, grid: { color: 'rgba(148, 163, 184, 0.2)' } },
        x: { stacked: true, ticks: { color: '#bfdbfe', maxRotation: 45, minRotation: 0 }, grid: { color: 'rgba(148, 163, 184, 0.08)' } }
      },
      plugins: {
        legend: { labels: { color: '#dbeafe' } }
      },
      onClick(event, elements) {
        if (!elements || elements.length === 0) return;
        const index = elements[0].index;
        const row = rows[index];
        if (!row || !row.sessionKey) return;
        loadAttendanceDashboardDrilldown('event', row.sessionKey);
      }
    }
  });
}

function renderAttendanceDashboardTopEventTable(rows) {
  const wrap = document.getElementById('dashboardDrilldownTableWrap');
  const title = document.getElementById('dashboardDrilldownTitle');
  const summary = document.getElementById('dashboardDrilldownSummary');
  if (!wrap || !title || !summary) return;

  const list = Array.isArray(rows) ? rows : [];
  if (list.length === 0) {
    title.textContent = '드릴다운';
    summary.textContent = '차트를 클릭하거나 개인을 선택하면 상세가 표시됩니다.';
    wrap.innerHTML = '<p class="info-text">표시할 드릴다운 데이터가 없습니다.</p>';
    return;
  }

  title.textContent = `Top-${attendanceDashboardState.topN} 이벤트`;
  summary.textContent = `정렬 기준: ${attendanceDashboardState.sortBy} / 클릭하면 행사별 멤버 상세를 조회합니다.`;

  const rowsHtml = list.map(item => `
    <tr>
      <td>${escapeHtml(item.sessionKey)}</td>
      <td>${escapeHtml(item.date)}</td>
      <td>${item.attendanceRate}%</td>
      <td>${item.absenceRate}%</td>
      <td>${item.participantCount}</td>
      <td>
        <button type="button" class="btn btn-secondary" style="padding:6px 10px; font-size:12px;" onclick="loadAttendanceDashboardDrilldown('event', '${encodeURIComponent(item.sessionKey)}')">
          <i class="fas fa-search"></i>
          <span>상세</span>
        </button>
      </td>
    </tr>
  `).join('');

  wrap.innerHTML = `
    <table class="dashboard-table">
      <thead>
        <tr>
          <th>회차</th>
          <th>시작일시</th>
          <th>출석률</th>
          <th>결석률</th>
          <th>참여 인원</th>
          <th>동작</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  `;
}

function renderAttendanceDashboardDrilldown(payload) {
  attendanceDashboardDrilldownPayload = payload || null;

  const wrap = document.getElementById('dashboardDrilldownTableWrap');
  const title = document.getElementById('dashboardDrilldownTitle');
  const summary = document.getElementById('dashboardDrilldownSummary');
  if (!wrap || !title || !summary) return;

  if (!payload || !payload.success) {
    const msg = payload && payload.message ? payload.message : '드릴다운 데이터가 없습니다.';
    title.textContent = '드릴다운';
    summary.textContent = msg;
    wrap.innerHTML = '<p class="info-text">표시할 드릴다운 데이터가 없습니다.</p>';
    return;
  }

  if (payload.drillType === 'event') {
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    const info = payload.session || {};
    const stat = payload.summary || {};
    title.textContent = `행사 드릴다운: ${info.sessionKey || payload.key}`;
    summary.textContent = `출석 ${stat.onTimeCount || 0}, 지각 ${stat.lateCount || 0}, 결석 ${stat.absentCount || 0}, 유고 ${stat.excusedCount || 0}`;

    if (rows.length === 0) {
      wrap.innerHTML = '<p class="info-text">표시할 멤버 데이터가 없습니다.</p>';
      return;
    }

    const rowsHtml = rows.map(row => {
      const noteText = String(row.note || '').trim();
      const noteCell = noteText
        ? `<span class="dashboard-note-chip" title="${escapeHtml(noteText)}">${escapeHtml(noteText)}</span>`
        : '-';
      return `
        <tr>
          <td><span class="grade-badge">${escapeHtml(row.seasonLabel || '-')}</span>${escapeHtml(row.name || '')}</td>
          <td>${escapeHtml(getDashboardCohortBadge(row.cohortTag || ''))}</td>
          <td>${escapeHtml(formatDashboardStatus(row.status || ''))}</td>
          <td>${escapeHtml(row.attendTime || '-')}</td>
          <td>${noteCell}</td>
        </tr>
      `;
    }).join('');

    wrap.innerHTML = `
      <table class="dashboard-table">
        <thead>
          <tr>
            <th>회원</th>
            <th>그룹</th>
            <th>상태</th>
            <th>출석일시</th>
            <th>유고 사유/메모(note)</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    `;
    return;
  }

  if (payload.drillType === 'member') {
    const member = payload.member || {};
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    const stat = payload.summary || {};
    title.textContent = `개인 드릴다운: ${member.seasonLabel || '-'} ${member.name || payload.key}`;
    summary.textContent = `출석률 ${stat.attendanceRate || 0}% / 출석 ${stat.attendedCount || 0} / 유효모수 ${stat.effectiveCount || 0} / 유고 ${stat.excusedCount || 0}`;

    if (rows.length === 0) {
      wrap.innerHTML = '<p class="info-text">표시할 회차 데이터가 없습니다.</p>';
      return;
    }

    const rowsHtml = rows.map(row => {
      const noteText = String(row.note || '').trim();
      const noteCell = noteText
        ? `<span class="dashboard-note-chip" title="${escapeHtml(noteText)}">${escapeHtml(noteText)}</span>`
        : '-';
      return `
        <tr>
          <td>${escapeHtml(row.sessionKey || '-')}</td>
          <td>${escapeHtml(row.date || '-')}</td>
          <td>${escapeHtml(formatDashboardStatus(row.status || ''))}</td>
          <td>${escapeHtml(row.attendTime || '-')}</td>
          <td>${escapeHtml(row.offsetLabel || '-')}</td>
          <td>${noteCell}</td>
        </tr>
      `;
    }).join('');

    wrap.innerHTML = `
      <table class="dashboard-table">
        <thead>
          <tr>
            <th>회차</th>
            <th>일시</th>
            <th>상태</th>
            <th>출석일시</th>
            <th>출석 오프셋</th>
            <th>유고 사유/메모(note)</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    `;
  }
}

function buildMemberTrendCacheKey(memberKey) {
  const season = getSelectedSeasonAlias();
  const filterKey = [
    attendanceDashboardState.group || 'all',
    attendanceDashboardState.dateFrom || '-',
    attendanceDashboardState.dateTo || '-',
    (attendanceDashboardState.sessionKeys || []).slice().sort().join('|')
  ].join(':');
  return `${season}:${memberKey}:${filterKey}`;
}

async function loadAttendanceDashboardMemberSeries(memberKey) {
  const cacheKey = buildMemberTrendCacheKey(memberKey);
  if (attendanceDashboardMemberSeriesCache[cacheKey]) {
    return attendanceDashboardMemberSeriesCache[cacheKey];
  }

  const season = getSelectedSeasonAlias();
  if (!season) return null;
  const params = Object.assign({
    adminToken: adminToken,
    season: season,
    drillType: 'member',
    key: memberKey
  }, getAttendanceDashboardApiFilterParams());

  const response = await CloudClubApi.call('attendanceDashboardDrilldown', params);
  if (!response || !response.success) return null;
  attendanceDashboardMemberSeriesCache[cacheKey] = response;
  return response;
}

async function renderAttendanceDashboardMemberTrendChart() {
  if (!ensureChartLibraryAvailable()) return;
  const canvas = document.getElementById('dashboardMemberTrendChart');
  if (!canvas) return;

  const selected = (attendanceDashboardState.selectedMemberKeys || []).slice(0, ATTENDANCE_DASHBOARD_MAX_MEMBER_SELECTION);
  if (selected.length === 0) {
    if (attendanceDashboardMemberTrendChart) {
      attendanceDashboardMemberTrendChart.destroy();
      attendanceDashboardMemberTrendChart = null;
    }
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const seriesList = [];
  for (let i = 0; i < selected.length; i++) {
    const key = selected[i];
    try {
      const series = await loadAttendanceDashboardMemberSeries(key);
      if (series && series.success) {
        seriesList.push(series);
      }
    } catch (error) {
      console.error('개인 시계열 로드 실패:', error);
    }
  }

  if (seriesList.length === 0) {
    if (attendanceDashboardMemberTrendChart) {
      attendanceDashboardMemberTrendChart.destroy();
      attendanceDashboardMemberTrendChart = null;
    }
    return;
  }

  let labels = [];
  const selectedSessions = attendanceDashboardPayload && attendanceDashboardPayload.meta && Array.isArray(attendanceDashboardPayload.meta.availableSessions)
    ? attendanceDashboardPayload.meta.availableSessions.filter(item => item.isSelected)
    : [];
  if (selectedSessions.length > 0) {
    labels = selectedSessions.map(item => item.sessionKey);
  } else {
    labels = (seriesList[0].rows || []).map(row => row.sessionKey);
  }

  const datasets = seriesList.map((series, index) => {
    const rowMap = {};
    (series.rows || []).forEach(row => {
      rowMap[row.sessionKey] = row;
    });

    const data = [];
    const pointMeta = [];
    labels.forEach(label => {
      const row = rowMap[label];
      if (!row) {
        data.push(null);
        pointMeta.push(null);
        return;
      }
      const offset = row.offsetSeconds;
      data.push(typeof offset === 'number' ? Number((offset / 60).toFixed(2)) : null);
      pointMeta.push(row);
    });

    const member = series.member || {};
    return {
      label: `${member.seasonLabel || '-'} ${member.name || series.key}`,
      data: data,
      pointMeta: pointMeta,
      borderColor: getDashboardColor(index),
      backgroundColor: 'rgba(0,0,0,0)',
      borderWidth: 2,
      pointRadius: 4,
      pointHoverRadius: 5,
      tension: 0.2,
      spanGaps: true,
      memberKey: member.memberKey || series.key
    };
  });

  if (attendanceDashboardMemberTrendChart) {
    attendanceDashboardMemberTrendChart.destroy();
    attendanceDashboardMemberTrendChart = null;
  }

  attendanceDashboardMemberTrendChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels: labels, datasets: datasets },
    options: {
      maintainAspectRatio: false,
      responsive: true,
      scales: {
        y: {
          title: { display: true, text: '분(시작 시각 대비)', color: '#bfdbfe' },
          ticks: { color: '#bfdbfe' },
          grid: { color: 'rgba(148, 163, 184, 0.2)' }
        },
        x: {
          ticks: { color: '#bfdbfe', maxRotation: 45, minRotation: 0 },
          grid: { color: 'rgba(148, 163, 184, 0.08)' }
        }
      },
      plugins: {
        legend: { labels: { color: '#dbeafe' } },
        tooltip: {
          callbacks: {
            label(context) {
              const dataset = context.dataset || {};
              const pointMeta = Array.isArray(dataset.pointMeta) ? dataset.pointMeta[context.dataIndex] : null;
              if (!pointMeta) return `${dataset.label}: -`;
              const noteText = pointMeta.note ? String(pointMeta.note) : '-';
              return [
                `${dataset.label}: ${formatSignedOffsetMinutes(pointMeta.offsetSeconds)}`,
                `상태: ${formatDashboardStatus(pointMeta.status)}`,
                `출석일시: ${pointMeta.attendTime || '-'}`,
                `유고/메모: ${noteText}`
              ];
            }
          }
        }
      },
      onClick(event, elements) {
        if (!elements || elements.length === 0) return;
        const element = elements[0];
        const dataset = datasets[element.datasetIndex];
        if (!dataset || !dataset.memberKey) return;
        loadAttendanceDashboardDrilldown('member', dataset.memberKey);
      }
    }
  });
}

async function loadAttendanceDashboardDrilldown(drillType, key) {
  const season = getSelectedSeasonAlias();
  if (!season) return;

  const decodedKey = decodeURIComponent(String(key || ''));
  try {
    const params = Object.assign({
      adminToken: adminToken,
      season: season,
      drillType: drillType,
      key: decodedKey
    }, getAttendanceDashboardApiFilterParams());

    const response = await CloudClubApi.call('attendanceDashboardDrilldown', params);
    renderAttendanceDashboardDrilldown(response);
  } catch (error) {
    if (handleUnauthorizedError(error)) return;
    renderAttendanceDashboardDrilldown({ success: false, message: getDisplayErrorMessage(error, '드릴다운 조회 실패') });
  }
}

function renderAttendanceDashboard(payload) {
  attendanceDashboardPayload = payload || null;
  renderAttendanceDashboardKpis(payload);
  renderAttendanceDashboardSessionOptions(payload);
  renderAttendanceDashboardMemberOptions();
  renderAttendanceDashboardEventRateChart(payload);
  renderAttendanceDashboardEventStatusChart(payload);
  renderAttendanceDashboardStatusDonutChart(payload);
  renderAttendanceDashboardCohortDonutChart(payload);
  renderAttendanceDashboardAttendanceCountDonutChart(payload);

  attendanceDashboardLastEventRows = payload && payload.table && Array.isArray(payload.table.eventTopRows)
    ? payload.table.eventTopRows.slice()
    : [];
  renderAttendanceDashboardTopEventTable(attendanceDashboardLastEventRows);

  const defaultMemberKeys = payload && payload.meta && Array.isArray(payload.meta.defaultMemberKeys)
    ? payload.meta.defaultMemberKeys
    : [];
  if ((attendanceDashboardState.selectedMemberKeys || []).length === 0 && defaultMemberKeys.length > 0) {
    setAttendanceDashboardMemberKeys(defaultMemberKeys, {
      save: true,
      renderTrend: false,
      drilldown: false,
      showLimitToast: false
    });
  }

  renderAttendanceDashboardMemberTrendChart();
}

function getDashboardAutoDateRange(payload) {
  const meta = payload && payload.meta ? payload.meta : {};
  const defaultRange = meta.defaultDateRange || {};
  let fromDate = String(defaultRange.fromDate || '').trim();
  let toDate = String(defaultRange.toDate || '').trim();
  let source = String(defaultRange.source || '').trim() || 'none';

  const validDate = value => /^\d{4}-\d{2}-\d{2}$/.test(String(value || ''));
  if (validDate(fromDate) && validDate(toDate)) {
    if (fromDate > toDate) {
      const temp = fromDate;
      fromDate = toDate;
      toDate = temp;
    }
    return { fromDate, toDate, source };
  }

  const actualRange = meta.actualAttendanceRange || {};
  const fromByMs = formatDateKeyFromTimestamp(actualRange.minAttendAtMs);
  const toByMs = formatDateKeyFromTimestamp(actualRange.maxAttendAtMs);
  if (fromByMs && toByMs) {
    return { fromDate: fromByMs, toDate: toByMs, source: 'actual_attendance' };
  }

  return { fromDate: '', toDate: '', source: 'none' };
}

function tryHydrateAttendanceDashboardDateRange(payload, options) {
  const opts = options || {};
  if (opts.skipAutoDateHydration) return false;
  if (attendanceDashboardAutoDateHydratedOnce) return false;
  if (attendanceDashboardDateRangeUserEdited) return false;
  if (attendanceDashboardState.dateFrom || attendanceDashboardState.dateTo) return false;

  const range = getDashboardAutoDateRange(payload);
  if (!range.fromDate || !range.toDate) return false;

  attendanceDashboardState.dateFrom = range.fromDate;
  attendanceDashboardState.dateTo = range.toDate;
  attendanceDashboardAutoDateHydratedOnce = true;
  applyAttendanceDashboardStateToControls();
  saveAttendanceDashboardStateToStorage();
  setAttendanceDashboardMetaText(`기본 기간을 자동 설정했습니다. (${range.fromDate} ~ ${range.toDate}, source: ${range.source})`);
  return true;
}

function dashboardSelectAllSessions() {
  const options = getFilteredDashboardSessionOptions();
  setAttendanceDashboardSessionKeys(options.map(item => item.sessionKey));
}

function dashboardSelectClosedSessions() {
  const options = getFilteredDashboardSessionOptions().filter(item => item.isClosed);
  setAttendanceDashboardSessionKeys(options.map(item => item.sessionKey));
}

function dashboardSelectRecentSessions() {
  const options = getAttendanceDashboardAvailableSessions()
    .filter(item => item.isClosed)
    .slice(-4)
    .map(item => item.sessionKey);
  setAttendanceDashboardSessionKeys(options);
}

function dashboardClearSessionSelection() {
  setAttendanceDashboardSessionKeys([]);
}

function dashboardSelectTopMembers() {
  const options = getFilteredDashboardMemberOptions()
    .slice(0, Math.min(3, ATTENDANCE_DASHBOARD_MAX_MEMBER_SELECTION))
    .map(item => item.memberKey);
  setAttendanceDashboardMemberKeys(options, { drilldown: false, showLimitToast: false });
}

function dashboardClearMemberSelection() {
  setAttendanceDashboardMemberKeys([], { drilldown: false, showLimitToast: false });
}

function initializeAttendanceDashboardUi() {
  if (attendanceDashboardInitialized) return;

  const storedState = readAttendanceDashboardStateFromStorage();
  const queryState = readAttendanceDashboardStateFromQuery();
  const merged = Object.assign(
    {},
    getDefaultAttendanceDashboardState(),
    storedState || {},
    queryState || {}
  );
  attendanceDashboardState = normalizeAttendanceDashboardState(merged);
  attendanceDashboardDateRangeUserEdited = !!(attendanceDashboardState.dateFrom || attendanceDashboardState.dateTo);
  attendanceDashboardAutoDateHydratedOnce = !!(attendanceDashboardState.dateFrom || attendanceDashboardState.dateTo);
  applyAttendanceDashboardStateToControls();

  const sessionSearchInput = document.getElementById('dashboardSessionSearchInput');
  const memberSearchInput = document.getElementById('dashboardMemberSearchInput');
  const sessionOptionList = document.getElementById('dashboardSessionOptionList');
  const sessionChipList = document.getElementById('dashboardSessionChipList');
  const memberOptionList = document.getElementById('dashboardMemberOptionList');
  const memberChipList = document.getElementById('dashboardMemberChipList');
  const sessionPickerField = document.getElementById('dashboardSessionPickerField');
  const memberPickerField = document.getElementById('dashboardMemberPickerField');
  const sessionPickerBtn = document.getElementById('dashboardSessionPickerBtn');
  const memberPickerBtn = document.getElementById('dashboardMemberPickerBtn');
  const memberSelect = document.getElementById('dashboardMemberSelect');
  const sessionSelect = document.getElementById('dashboardSessionSelect');
  const topNSelect = document.getElementById('dashboardTopNSelect');
  const sortSelect = document.getElementById('dashboardSortBySelect');
  const chartTypeSelect = document.getElementById('dashboardChartTypeSelect');
  const groupSelect = document.getElementById('dashboardGroupSelect');
  const dateFromInput = document.getElementById('dashboardDateFromInput');
  const dateToInput = document.getElementById('dashboardDateToInput');

  if (sessionSearchInput) {
    sessionSearchInput.addEventListener('focus', () => {
      setAttendanceDashboardPopoverOpen('session', true);
      setAttendanceDashboardPopoverOpen('member', false);
    });
    sessionSearchInput.addEventListener('input', () => {
      attendanceDashboardState.sessionSearch = sessionSearchInput.value.trim();
      setAttendanceDashboardPopoverOpen('session', true);
      renderAttendanceDashboardSessionPicker();
      saveAttendanceDashboardStateToStorage();
    });
  }

  if (memberSearchInput) {
    memberSearchInput.addEventListener('focus', () => {
      setAttendanceDashboardPopoverOpen('member', true);
      setAttendanceDashboardPopoverOpen('session', false);
    });
    memberSearchInput.addEventListener('input', () => {
      attendanceDashboardState.memberSearch = memberSearchInput.value.trim();
      setAttendanceDashboardPopoverOpen('member', true);
      renderAttendanceDashboardMemberPicker();
      saveAttendanceDashboardStateToStorage();
    });
  }

  if (sessionPickerBtn) {
    sessionPickerBtn.addEventListener('click', event => {
      event.preventDefault();
      toggleAttendanceDashboardPopover('session');
    });
  }

  if (memberPickerBtn) {
    memberPickerBtn.addEventListener('click', event => {
      event.preventDefault();
      toggleAttendanceDashboardPopover('member');
    });
  }

  if (sessionOptionList) {
    sessionOptionList.addEventListener('change', event => {
      const target = event.target;
      if (!target || target.type !== 'checkbox' || !target.dataset || !target.dataset.sessionKey) return;
      const key = String(target.dataset.sessionKey || '').trim();
      const selected = attendanceDashboardState.sessionKeys || [];
      const next = target.checked
        ? selected.concat([key])
        : selected.filter(item => item !== key);
      setAttendanceDashboardSessionKeys(next);
    });
  }

  if (sessionChipList) {
    sessionChipList.addEventListener('click', event => {
      const button = event.target && event.target.closest ? event.target.closest('[data-session-remove-key]') : null;
      if (!button) return;
      const key = String(button.getAttribute('data-session-remove-key') || '').trim();
      if (!key) return;
      setAttendanceDashboardSessionKeys((attendanceDashboardState.sessionKeys || []).filter(item => item !== key));
    });
  }

  if (memberOptionList) {
    memberOptionList.addEventListener('change', event => {
      const target = event.target;
      if (!target || target.type !== 'checkbox' || !target.dataset || !target.dataset.memberKey) return;
      const key = String(target.dataset.memberKey || '').trim();
      const selected = attendanceDashboardState.selectedMemberKeys || [];
      const next = target.checked
        ? selected.concat([key])
        : selected.filter(item => item !== key);
      setAttendanceDashboardMemberKeys(next, { drilldown: true });
    });
  }

  if (memberChipList) {
    memberChipList.addEventListener('click', event => {
      const button = event.target && event.target.closest ? event.target.closest('[data-member-remove-key]') : null;
      if (!button) return;
      const key = String(button.getAttribute('data-member-remove-key') || '').trim();
      if (!key) return;
      setAttendanceDashboardMemberKeys(
        (attendanceDashboardState.selectedMemberKeys || []).filter(item => item !== key),
        { drilldown: true, showLimitToast: false }
      );
    });
  }

  document.addEventListener('click', event => {
    const target = event.target;
    if (!target) return;
    if (sessionPickerField && sessionPickerField.contains(target)) return;
    if (memberPickerField && memberPickerField.contains(target)) return;
    closeAttendanceDashboardPopovers();
  });

  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      closeAttendanceDashboardPopovers();
    }
  });

  if (memberSelect) {
    memberSelect.addEventListener('change', () => {
      const keys = Array.from(memberSelect.selectedOptions || [])
        .map(option => option.value)
        .filter(value => !!value);
      setAttendanceDashboardMemberKeys(keys, { drilldown: true, showLimitToast: false });
    });
  }

  if (sessionSelect) {
    sessionSelect.addEventListener('change', () => {
      const keys = Array.from(sessionSelect.selectedOptions || [])
        .map(option => option.value)
        .filter(value => !!value);
      setAttendanceDashboardSessionKeys(keys);
    });
  }

  if (dateFromInput) {
    ['input', 'change'].forEach(eventName => {
      dateFromInput.addEventListener(eventName, () => {
        if (attendanceDashboardDateInputSyncing) return;
        attendanceDashboardDateRangeUserEdited = true;
        attendanceDashboardAutoDateHydratedOnce = true;
      });
    });
  }

  if (dateToInput) {
    ['input', 'change'].forEach(eventName => {
      dateToInput.addEventListener(eventName, () => {
        if (attendanceDashboardDateInputSyncing) return;
        attendanceDashboardDateRangeUserEdited = true;
        attendanceDashboardAutoDateHydratedOnce = true;
      });
    });
  }

  const simpleControls = [topNSelect, sortSelect, chartTypeSelect, groupSelect, dateFromInput, dateToInput];
  simpleControls.forEach(node => {
    if (!node) return;
    node.addEventListener('change', () => {
      collectAttendanceDashboardStateFromControls();
      saveAttendanceDashboardStateToStorage();
    });
  });

  renderAttendanceDashboardSessionPicker();
  renderAttendanceDashboardMemberPicker();
  closeAttendanceDashboardPopovers();

  attendanceDashboardInitialized = true;
}

function applyAttendanceDashboardPreset(type) {
  const mode = String(type || '').trim();
  const current = normalizeAttendanceDashboardState(attendanceDashboardState);

  if (mode === 'all') {
    current.group = 'all';
    current.dateFrom = '';
    current.dateTo = '';
    current.sessionKeys = [];
    current.sortBy = 'attendanceRate';
  } else if (mode === 'yb') {
    current.group = 'yb';
  } else if (mode === 'ob') {
    current.group = 'ob';
  } else if (mode === 'recent4') {
    const sessions = attendanceDashboardPayload && attendanceDashboardPayload.meta && Array.isArray(attendanceDashboardPayload.meta.availableSessions)
      ? attendanceDashboardPayload.meta.availableSessions.filter(item => item.isClosed)
      : [];
    current.sessionKeys = sessions.slice(-4).map(item => item.sessionKey);
  } else if (mode === 'high_absence') {
    current.sortBy = 'absenceRate';
    current.topN = 10;
  }

  attendanceDashboardState = normalizeAttendanceDashboardState(current);
  applyAttendanceDashboardStateToControls();
  renderAttendanceDashboardSessionPicker();
  renderAttendanceDashboardMemberPicker();
  closeAttendanceDashboardPopovers();
  saveAttendanceDashboardStateToStorage();
  applyAttendanceDashboardFilters();
}

function applyAttendanceDashboardFilters() {
  collectAttendanceDashboardStateFromControls();
  closeAttendanceDashboardPopovers();
  saveAttendanceDashboardStateToStorage();
  loadAttendanceDashboard({ forceReload: true });
}

function resetAttendanceDashboardFilters() {
  attendanceDashboardState = getDefaultAttendanceDashboardState();
  attendanceDashboardDateRangeUserEdited = false;
  attendanceDashboardAutoDateHydratedOnce = false;
  applyAttendanceDashboardStateToControls();
  renderAttendanceDashboardSessionPicker();
  renderAttendanceDashboardMemberPicker();
  closeAttendanceDashboardPopovers();
  saveAttendanceDashboardStateToStorage();
  loadAttendanceDashboard({ forceReload: true });
}

async function copyAttendanceDashboardShareLink() {
  const url = buildAttendanceDashboardShareUrl();
  try {
    await navigator.clipboard.writeText(url);
    showToast('<i class="fas fa-check-circle"></i> 대시보드 뷰 링크를 복사했습니다.', true);
  } catch (error) {
    alert('뷰 링크 복사에 실패했습니다.');
  }
}

function escapeCsvCell(value) {
  const raw = String(value === undefined || value === null ? '' : value);
  if (/[",\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

function downloadCsvFile(fileName, headers, rows) {
  const lines = [];
  lines.push(headers.map(escapeCsvCell).join(','));
  rows.forEach(row => {
    lines.push(row.map(escapeCsvCell).join(','));
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

function downloadAttendanceDashboardCsv() {
  const season = getSelectedSeasonAlias() || 'season';
  const timestamp = new Date();
  const stamp = `${timestamp.getFullYear()}${String(timestamp.getMonth() + 1).padStart(2, '0')}${String(timestamp.getDate()).padStart(2, '0')}_${String(timestamp.getHours()).padStart(2, '0')}${String(timestamp.getMinutes()).padStart(2, '0')}`;

  if (attendanceDashboardDrilldownPayload && attendanceDashboardDrilldownPayload.success) {
    const payload = attendanceDashboardDrilldownPayload;
    if (payload.drillType === 'event') {
      const headers = ['name', 'seasonLabel', 'cohortTag', 'status', 'attendTime', 'note'];
      const rows = (payload.rows || []).map(row => [
        row.name,
        row.seasonLabel,
        row.cohortTag,
        formatDashboardStatus(row.status),
        row.attendTime || '',
        row.note || ''
      ]);
      downloadCsvFile(`${season}_event_drilldown_${stamp}.csv`, headers, rows);
      return;
    }

    if (payload.drillType === 'member') {
      const headers = ['sessionKey', 'date', 'status', 'attendTime', 'offset', 'note'];
      const rows = (payload.rows || []).map(row => [
        row.sessionKey,
        row.date,
        formatDashboardStatus(row.status),
        row.attendTime || '',
        row.offsetLabel || '',
        row.note || ''
      ]);
      downloadCsvFile(`${season}_member_drilldown_${stamp}.csv`, headers, rows);
      return;
    }
  }

  const rows = Array.isArray(attendanceDashboardLastEventRows) ? attendanceDashboardLastEventRows : [];
  const headers = ['sessionKey', 'date', 'attendanceRate', 'absenceRate', 'participantCount', 'attendedCount', 'effectiveCount', 'lateCount', 'absentCount', 'excusedCount'];
  const csvRows = rows.map(item => [
    item.sessionKey,
    item.date,
    item.attendanceRate,
    item.absenceRate,
    item.participantCount,
    item.attendedCount,
    item.effectiveCount,
    item.lateCount,
    item.absentCount,
    item.excusedCount
  ]);
  downloadCsvFile(`${season}_dashboard_summary_${stamp}.csv`, headers, csvRows);
}

async function loadAttendanceDashboard(options) {
  const opts = options || {};
  if (attendanceDashboardLoading) return;

  const season = getSelectedSeasonAlias();
  if (!season) {
    setAttendanceDashboardMetaText('시즌이 선택되지 않아 대시보드를 불러올 수 없습니다.');
    return;
  }

  collectAttendanceDashboardStateFromControls();
  saveAttendanceDashboardStateToStorage();

  attendanceDashboardLoading = true;
  setAttendanceDashboardMetaText('대시보드 데이터를 불러오는 중...');

  try {
    const params = Object.assign({
      adminToken: adminToken,
      season: season,
      disableCache: opts.forceReload ? 'true' : 'false'
    }, getAttendanceDashboardApiFilterParams());
    const response = await CloudClubApi.call('attendanceDashboardSummary', params);

    if (!response || !response.success) {
      setAttendanceDashboardMetaText(response && response.message ? response.message : '대시보드 요약 조회 실패');
      loadRankings();
      return;
    }

    if (tryHydrateAttendanceDashboardDateRange(response, opts)) {
      attendanceDashboardLoading = false;
      await loadAttendanceDashboard({ forceReload: true, skipAutoDateHydration: true });
      return;
    }

    attendanceDashboardPayload = response;
    attendanceDashboardDrilldownPayload = null;
    attendanceDashboardMemberSeriesCache = {};
    renderAttendanceDashboard(response);
    displayRankings({
      success: true,
      data: Array.isArray(response.ranking) ? response.ranking : []
    });

    const fromCache = response.meta && response.meta.fromCache ? ' (cache)' : '';
    const rangeMeta = response.meta && response.meta.actualAttendanceRange
      ? response.meta.actualAttendanceRange
      : {};
    const rangeLabel = rangeMeta.minAttendAt && rangeMeta.maxAttendAt
      ? ` / 실제출석 ${rangeMeta.minAttendAt} ~ ${rangeMeta.maxAttendAt}`
      : '';
    setAttendanceDashboardMetaText(
      `시즌 ${response.seasonAlias} / 선택 회차 ${response.meta && response.meta.selectedSessionCount ? response.meta.selectedSessionCount : 0} / 종료 회차 ${response.meta && response.meta.closedSessionCount ? response.meta.closedSessionCount : 0}${rangeLabel}${fromCache}`
    );
  } catch (error) {
    if (handleUnauthorizedError(error)) return;
    setAttendanceDashboardMetaText(getDisplayErrorMessage(error, '대시보드 조회 중 오류가 발생했습니다.'));
    loadRankings();
  } finally {
    attendanceDashboardLoading = false;
  }
}

async function refreshStatusDashboardIfVisible() {
  if (getActiveTabName() !== 'status') return;
  await loadAttendanceDashboard({ forceReload: true });
}

async function loadRankings(options) {
  const opts = options || {};
  if (Array.isArray(opts.data)) {
    displayRankings({ success: true, data: opts.data });
    return;
  }

  const season = getSelectedSeasonAlias();

  try {
    const response = await CloudClubApi.call('ranking', season ? { season } : {});
    displayRankings(response);
  } catch (error) {
    handleRankingError(error);
  }
}

function normalizeAndSortRankings(items) {
  const list = Array.isArray(items) ? items.slice() : [];

  list.sort((a, b) => {
    const aAttended = Number(a && a.attendedCount || 0);
    const bAttended = Number(b && b.attendedCount || 0);
    if (bAttended !== aAttended) {
      return bAttended - aAttended;
    }

    const aOffsetRaw = a && a.avgAttendOffsetSeconds;
    const bOffsetRaw = b && b.avgAttendOffsetSeconds;
    const aOffset = aOffsetRaw === null || aOffsetRaw === undefined ? Number.POSITIVE_INFINITY : Number(aOffsetRaw);
    const bOffset = bOffsetRaw === null || bOffsetRaw === undefined ? Number.POSITIVE_INFINITY : Number(bOffsetRaw);
    if (aOffset !== bOffset) {
      return aOffset - bOffset;
    }

    return String(a && a.name || '').localeCompare(String(b && b.name || ''), 'ko');
  });

  return list.map((item, index) => Object.assign({}, item, { rank: index + 1 }));
}

function displayRankings(response) {
  const rankingBoard = document.getElementById('rankingBoard');

  if (!response.success) {
    rankingBoard.innerHTML = `<div class="error">순위를 불러올 수 없습니다: ${escapeHtml(response.message || '')}</div>`;
    return;
  }

  const rankings = normalizeAndSortRankings(response.data);
  if (!rankings || rankings.length === 0) {
    rankingBoard.innerHTML = '<p class="info-text">아직 출석 데이터가 없습니다.</p>';
    return;
  }

  let tableHTML = `
    <table class="ranking-table">
      <thead>
        <tr>
          <th>순위</th>
          <th>이름</th>
          <th>출석률</th>
          <th>출석 횟수</th>
          <th>평균 출석 오프셋</th>
        </tr>
      </thead>
      <tbody>
  `;

  rankings.forEach(item => {
    const rankDisplay = item.rank <= 3
      ? `<span class="rank-medal rank-${item.rank}">${item.rank}</span>`
      : `<span style="color: #94a3b8;">${item.rank}</span>`;

    const avgOffset = item.avgAttendOffset || item.avgAttendTime;
    const avgTimeDisplay = avgOffset === '미출석'
      ? '<span style="color: #64748b;">-</span>'
      : `<span style="color: #60a5fa;">${escapeHtml(avgOffset)}</span>`;

    tableHTML += `
      <tr>
        <td>${rankDisplay}</td>
        <td><span class="grade-badge">${escapeHtml(item.seasonLabel || item.grade || '-')}</span>${escapeHtml(item.name)}</td>
        <td><span class="highlight-text">${item.attendanceRate}%</span></td>
        <td>${item.attendedCount}/${item.totalSessions}</td>
        <td>${avgTimeDisplay}</td>
      </tr>
    `;
  });

  tableHTML += '</tbody></table>';
  rankingBoard.innerHTML = tableHTML;
}

function handleRankingError(error) {
  const rankingBoard = document.getElementById('rankingBoard');
  rankingBoard.innerHTML = `<div class="error">${escapeHtml(getDisplayErrorMessage(error, '순위를 불러오는 중 오류가 발생했습니다.'))}</div>`;
  console.error('Ranking error:', error);
}

async function loadSheets() {
  try {
    const sheets = await CloudClubApi.call('sheets');
    const sheetSelect = document.getElementById('sheetSelect');
    sheetSelect.innerHTML = '';

    if (!Array.isArray(sheets) || sheets.length === 0) {
      sheetSelect.innerHTML = '<option value="">사용 가능한 시즌 시트가 없습니다</option>';
      currentSheetName = '';
      currentSeasonAlias = '';
      return;
    }

    sheets.forEach(sheet => {
      const option = document.createElement('option');
      option.value = sheet.name;
      option.dataset.alias = sheet.alias || normalizeSeasonAlias(sheet.name);
      option.textContent = sheet.alias || sheet.name;
      if (sheet.isLegacy && sheet.alias) {
        option.textContent = `${sheet.alias} (legacy: ${sheet.name})`;
      }
      if (sheet.isActive) {
        option.selected = true;
      }
      sheetSelect.appendChild(option);
    });

    currentSheetName = sheetSelect.value;
    currentSeasonAlias = getSelectedSeasonAlias();
    syncImportSeasonInputByCurrentSelection();
    updateImportModeHintFromInput();
  } catch (error) {
    console.error('시트 목록 조회 실패:', error);
  }
}

async function changeSheet() {
  const sheetName = getSelectedSheetName();
  if (!sheetName) return;

  try {
    const response = await CloudClubApi.call('setActiveSheet', {
      sheet: sheetName,
      adminToken: adminToken
    });

    if (response.success) {
      currentSheetName = getSelectedSheetName();
      currentSeasonAlias = getSelectedSeasonAlias();
      syncImportSeasonInputByCurrentSelection();
      updateImportModeHintFromInput();
      showToast(`<i class="fas fa-check-circle"></i> ${escapeHtml(response.message)}`, true);

      await refreshSeasonData();

      const seasonQR = document.getElementById('seasonQrcode');
      const studentUrlDiv = document.getElementById('studentUrl');
      seasonQR.style.display = 'none';
      seasonQR.classList.add('blurred');
      studentUrlDiv.style.display = 'none';
    } else {
      alert(response.message || '시트 변경에 실패했습니다.');
    }
  } catch (error) {
    if (handleUnauthorizedError(error)) return;
    alert('시트 변경 중 오류가 발생했습니다: ' + getDisplayErrorMessage(error, '알 수 없는 오류'));
  }
}

function createQrCode(url) {
  const qrContainer = document.getElementById('qrcode');
  const existingQR = qrContainer.querySelector('canvas, img');
  if (existingQR) {
    existingQR.remove();
  }

  new QRCode(qrContainer, { text: url, width: 300, height: 300 });
  qrContainer.classList.add('blurred');
}

function toggleQRBlur(qrId) {
  const qrContainer = document.getElementById(qrId);
  const overlay = qrContainer.querySelector('.qr-overlay span');

  if (qrContainer.classList.contains('blurred')) {
    qrContainer.classList.remove('blurred');
    if (overlay) {
      overlay.innerHTML = '<i class="fas fa-eye-slash"></i> 클릭하여 QR코드 숨기기';
    }
  } else {
    qrContainer.classList.add('blurred');
    if (overlay) {
      overlay.innerHTML = '<i class="fas fa-eye"></i> 클릭하여 QR코드 보기';
    }
  }
}

function formatDurationKorean(ms) {
  const totalSec = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const days = Math.floor(totalSec / 86400);
  const hours = Math.floor((totalSec % 86400) / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  const seconds = totalSec % 60;

  if (days > 0) {
    return `${days}일 ${hours}시간 ${minutes}분 ${String(seconds).padStart(2, '0')}초`;
  }
  if (hours > 0) {
    return `${hours}시간 ${minutes}분 ${String(seconds).padStart(2, '0')}초`;
  }
  return `${minutes}분 ${String(seconds).padStart(2, '0')}초`;
}

function renderCountdown(session) {
  const countdownTitle = document.getElementById('countdown-title');
  const countdownDiv = document.getElementById('countdown');
  const attendBtn = document.getElementById('attendBtn');

  clearInterval(countdownInterval);

  const disableAttend = (label) => {
    isAttendanceActive = false;
    if (!attendBtn) return;
    attendBtn.disabled = true;
    attendBtn.innerHTML = label;
  };

  if (!session.active) {
    if (session.nextOpenTime) {
      const nextOpenTime = Number(session.nextOpenTime);

      const updateOpenCountdown = () => {
        const now = Date.now();
        const remain = Math.max(0, nextOpenTime - now);

        if (remain <= 0) {
          clearInterval(countdownInterval);
          countdownTitle.textContent = '출석 가능 시간 확인 중...';
          countdownDiv.textContent = '잠시 후 자동 갱신됩니다.';
          disableAttend('<i class="fas fa-clock"></i> <span>오픈 대기</span>');
          setTimeout(() => {
            checkAttendanceSession();
          }, 1000);
          return;
        }

        countdownTitle.textContent = '출석 오픈까지 남은 시간';
        countdownDiv.textContent = formatDurationKorean(remain);
      };

      updateOpenCountdown();
      countdownInterval = setInterval(updateOpenCountdown, 1000);
      disableAttend('<i class="fas fa-clock"></i> <span>오픈 대기</span>');
      return;
    }

    countdownTitle.textContent = '출석 대기 중';
    countdownDiv.textContent = session.message || '지금은 출석 가능한 시간이 아닙니다.';
    disableAttend('<i class="fas fa-times"></i> <span>출석 불가</span>');
    return;
  }

  isAttendanceActive = true;
  if (attendBtn) {
    attendBtn.disabled = false;
  }

  const onTimeDeadline = Number(session.onTimeDeadline || session.endTime || 0);
  const lateDeadline = Number(session.lateDeadline || session.endTime || 0);

  const updateClock = () => {
    const now = Date.now();

    if (lateDeadline && now > lateDeadline) {
      clearInterval(countdownInterval);
      countdownTitle.textContent = '출석 시간 종료';
      countdownDiv.textContent = '00분 00초';
      disableAttend('<i class="fas fa-times"></i> <span>출석 마감</span>');
      return;
    }

    let target = lateDeadline;
    if (onTimeDeadline && now <= onTimeDeadline) {
      target = onTimeDeadline;
      countdownTitle.textContent = '정시 마감까지 남은 시간';
    } else {
      countdownTitle.textContent = '지각 마감까지 남은 시간';
    }

    const remaining = Math.max(0, target - now);
    countdownDiv.textContent = formatDurationKorean(remaining);
  };

  updateClock();
  countdownInterval = setInterval(updateClock, 1000);
}

async function checkAttendanceSession() {
  const season = getSelectedSeasonAlias();

  try {
    const session = await CloudClubApi.call('session', season ? { season } : {});
    renderCountdown(session);
  } catch (error) {
    renderCountdown({ active: false, message: getDisplayErrorMessage(error, '세션 정보를 불러올 수 없습니다.') });
  }
}

function openTab(tabName, evt) {
  document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
  document.querySelectorAll('.tab-button').forEach(tb => tb.classList.remove('active'));
  document.getElementById(tabName).classList.add('active');
  evt.currentTarget.classList.add('active');

  if (tabName === 'status') {
    loadAttendanceDashboard({ forceReload: false });
  }

  if (tabName === 'schedule') {
    loadScheduleList();
  }

  if (tabName === 'variables') {
    loadVariables();
  }

  if (tabName === 'graduation') {
    loadGraduationReport();
  }

  if (tabName === 'excused') {
    loadGraduationReport();
  }

  if (tabName === 'attend') {
    loadScheduleList();
  }

  if (tabName === 'seasonImport') {
    syncImportSeasonInputByCurrentSelection();
    updateImportModeHintFromInput();
    initializeImportCollapsibleCards();
    refreshSheetSchemaAudit();
  }
}

async function refreshSessionAndRanking() {
  await Promise.all([
    checkAttendanceSession(),
    loadRankings()
  ]);
}

async function doAttendance(event) {
  event.preventDefault();

  const phoneNumber = document.getElementById('phoneInput').value.trim();
  if (!phoneNumber) {
    alert('전화번호를 입력해주세요.');
    return;
  }

  const phoneRegex = /^010[0-9]{8}$/;
  if (!phoneRegex.test(phoneNumber)) {
    alert('올바른 전화번호 형식이 아닙니다. (예: 01012345678)');
    return;
  }

  if (!isAttendanceActive) {
    alert('현재는 출석 가능한 시간이 아닙니다.');
    return;
  }

  const season = getSelectedSeasonAlias();
  if (!season) {
    alert('선택된 시즌이 없습니다.');
    return;
  }

  const attendBtn = document.getElementById('attendBtn');
  attendBtn.disabled = true;
  attendBtn.innerHTML = '<span class="loader"></span> <span>처리 중...</span>';

  localStorage.setItem('lastUsedPhone', phoneNumber);

  try {
    const response = await CloudClubApi.call('attendance', { season, phone: phoneNumber });
    handleAttendanceResponse(response);
  } catch (error) {
    handleAttendanceError(error);
  }
}

function handleAttendanceResponse(response) {
  const resultDiv = document.getElementById('result');
  const attendBtn = document.getElementById('attendBtn');

  if (response.success) {
    createConfetti();

    const typeBadge = response.attendanceType === 'late'
      ? '<span class="attendance-badge late">지각</span>'
      : '<span class="attendance-badge on-time">정시</span>';

    let message = `✅ <span class="grade-badge">${escapeHtml(response.seasonLabel || response.grade || '-')}</span>${escapeHtml(response.name)}님, ${escapeHtml(response.time)} 출석 완료! ${typeBadge}`;

    if (response.attendanceInfo) {
      const info = response.attendanceInfo;
      message += `
        <div class="attendance-info">
          <h3><span class="grade-badge">${escapeHtml(response.seasonLabel || response.grade || '-')}</span>${escapeHtml(response.name)}님 출석 현황</h3>
          <div class="attendance-stats">
            <div class="stat-item">
              <div class="stat-label">출석 횟수</div>
              <div class="stat-value">${info.attended}/${info.total}</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">출석률</div>
              <div class="stat-value highlight">${info.rate}%</div>
            </div>
          </div>
          <p class="info-text" style="margin-top: 12px; font-size: 14px;">
            현재까지 ${info.currentSession}회차 기준
          </p>
        </div>
      `;
    }

    if (response.fortune) {
      message += `
        <div class="fortune-card">
          <h4>
            <i class="fas fa-star"></i>
            오늘의 운세
            <i class="fas fa-star"></i>
          </h4>
          <p class="fortune-text">${escapeHtml(response.fortune)}</p>
        </div>
      `;
    }

    resultDiv.innerHTML = message;
    resultDiv.className = 'success';
    attendBtn.innerHTML = '<i class="fas fa-check-circle"></i> <span>출석 완료</span>';

    if (getActiveTabName() === 'status') {
      refreshStatusDashboardIfVisible();
    } else {
      loadRankings();
    }
  } else {
    resultDiv.innerHTML = `❌ ${escapeHtml(response.message || '출석 실패')}`;
    resultDiv.className = 'error';
    attendBtn.disabled = false;
    attendBtn.innerHTML = '<i class="fas fa-hand-point-up"></i> <span>지금 출석하기</span>';
  }

  resultDiv.style.display = 'block';

  setTimeout(() => {
    resultDiv.style.display = 'none';
    if (!response.success && isAttendanceActive) {
      attendBtn.disabled = false;
    }
  }, response.success ? 10000 : 5000);
}

function handleAttendanceError(error) {
  const resultDiv = document.getElementById('result');
  const attendBtn = document.getElementById('attendBtn');

  resultDiv.innerHTML = `❌ 오류가 발생했습니다: ${escapeHtml(getDisplayErrorMessage(error, '알 수 없는 오류'))}`;
  resultDiv.className = 'error';
  resultDiv.style.display = 'block';

  attendBtn.disabled = false;
  attendBtn.innerHTML = '<i class="fas fa-hand-point-up"></i> <span>지금 출석하기</span>';

  setTimeout(() => {
    resultDiv.style.display = 'none';
  }, 5000);
}

async function checkAttendanceStatus(event) {
  event.preventDefault();

  const phoneNumber = document.getElementById('statusPhoneInput').value.trim();

  if (!phoneNumber) {
    alert('전화번호를 입력해주세요.');
    return;
  }

  const phoneRegex = /^010[0-9]{8}$/;
  if (!phoneRegex.test(phoneNumber)) {
    alert('올바른 전화번호 형식이 아닙니다. (예: 01012345678)');
    return;
  }

  const season = getSelectedSeasonAlias();
  if (!season) {
    alert('시즌 선택 정보가 없습니다.');
    return;
  }

  localStorage.setItem('lastUsedPhone', phoneNumber);

  const statusResult = document.getElementById('statusResult');
  statusResult.innerHTML = '<div class="loader" style="margin: 32px auto;"></div>';
  statusResult.style.display = 'block';

  try {
    const response = await CloudClubApi.call('status', { season, phone: phoneNumber });
    handleStatusResponse(response);
  } catch (error) {
    handleStatusError(error);
  }
}

function handleStatusResponse(response) {
  const statusResult = document.getElementById('statusResult');

  if (response.success) {
    const data = response.data;
    let detailsHTML = '';

    data.details.forEach(detail => {
      let statusClass;
      let statusIcon;
      let statusText;

      if (detail.attendanceType === 'future') {
        statusClass = 'future';
        statusIcon = '<i class="fas fa-clock"></i>';
        statusText = '예정';
      } else if (detail.attendanceType === 'on_time') {
        statusClass = 'present';
        statusIcon = '<i class="fas fa-check-circle"></i>';
        statusText = '출석';
      } else if (detail.attendanceType === 'late') {
        statusClass = 'late';
        statusIcon = '<i class="fas fa-hourglass-half"></i>';
        statusText = '지각';
      } else if (detail.attendanceType === 'excused') {
        statusClass = 'excused';
        statusIcon = '<i class="fas fa-notes-medical"></i>';
        statusText = '유고';
      } else {
        statusClass = 'absent';
        statusIcon = '<i class="fas fa-times-circle"></i>';
        statusText = '결석';
      }

      const itemClass = detail.attendanceType === 'future' ? 'future' : '';

      detailsHTML += `
        <div class="attendance-item ${itemClass}">
          <div class="attendance-date">${escapeHtml(detail.date)}</div>
          <div class="attendance-status ${statusClass}">
            ${statusIcon}
            <span>${statusText}</span>
          </div>
        </div>
      `;
    });

    statusResult.innerHTML = `
      <div class="card">
        <div class="attendance-info">
          <h3><span class="grade-badge">${escapeHtml(data.seasonLabel || data.grade || '-')}</span>${escapeHtml(data.name)}님 출석 현황</h3>
          <div class="attendance-stats">
            <div class="stat-item">
              <div class="stat-label">출석 횟수</div>
              <div class="stat-value">${data.attended}/${data.total}</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">출석률</div>
              <div class="stat-value highlight">${data.rate}%</div>
            </div>
          </div>
          <p class="info-text" style="margin-top: 12px;">
            과거 유효 회차 ${data.currentSession}회차 기준, 유고 ${data.excusedCount || 0}회
          </p>
        </div>
        <div class="attendance-details">
          <h4 style="color: #e2e8f0; margin-bottom: 16px; font-size: 18px;">출석 상세 내역</h4>
          ${detailsHTML}
        </div>
      </div>
    `;
  } else {
    statusResult.innerHTML = `<div class="error">❌ ${escapeHtml(response.message || '조회 실패')}</div>`;
  }

  statusResult.style.display = 'block';
}

function handleStatusError(error) {
  const statusResult = document.getElementById('statusResult');
  statusResult.innerHTML = `<div class="error">❌ 오류가 발생했습니다: ${escapeHtml(getDisplayErrorMessage(error, '알 수 없는 오류'))}</div>`;
  statusResult.style.display = 'block';
}

function createManualApproveInitialState() {
  return {
    seasonAlias: '',
    sessionKey: '',
    keyword: '',
    absentOnly: false,
    selectedOnly: false,
    defaultComment: '',
    forceOverride: false,
    members: [],
    statusByPhone: {},
    selectedPhones: {},
    memberComments: {},
    openCommentPhones: {},
    filteredMembers: [],
    statusLoadedSeasonAlias: '',
    statusLoadedSessionKey: ''
  };
}

function normalizeManualMemberStatus(rawStatus) {
  const value = String(rawStatus || '').trim();
  if (!value) return 'none';
  if (value === 'on_time' || value === 'late' || value === 'excused' || value === 'absent' || value === 'future') {
    return value;
  }
  return 'recorded';
}

function isManualMemberValueRecorded(status) {
  return status === 'on_time' || status === 'late' || status === 'excused' || status === 'recorded';
}

function getManualMemberStatusInfo(phone) {
  const key = String(phone || '').trim();
  const mapped = key && manualApproveState.statusByPhone ? manualApproveState.statusByPhone[key] : null;
  if (mapped) return mapped;
  return {
    status: 'none',
    label: MANUAL_MEMBER_STATUS_LABELS.none,
    hasValue: false,
    note: '',
    attendTime: ''
  };
}

function buildManualStatusByPhoneFromReport(report, sessionKey) {
  const map = {};
  const members = report && Array.isArray(report.members) ? report.members : [];
  const targetKey = String(sessionKey || '').trim();

  members.forEach(member => {
    const phone = String(member && member.phone || '').trim();
    if (!phone) return;

    const details = Array.isArray(member.details) ? member.details : [];
    const detail = details.find(item => String(item && item.sessionKey || '').trim() === targetKey);

    if (!detail) {
      map[phone] = {
        status: 'none',
        label: MANUAL_MEMBER_STATUS_LABELS.none,
        hasValue: false,
        note: '',
        attendTime: ''
      };
      return;
    }

    const normalizedStatus = normalizeManualMemberStatus(detail.status);
    map[phone] = {
      status: normalizedStatus,
      label: MANUAL_MEMBER_STATUS_LABELS[normalizedStatus] || MANUAL_MEMBER_STATUS_LABELS.recorded,
      hasValue: isManualMemberValueRecorded(normalizedStatus),
      note: String(detail.note || '').trim(),
      attendTime: String(detail.attendTime || '').trim()
    };
  });

  return map;
}

function initializeManualApproveUi() {
  const defaultCommentInput = document.getElementById('manualDefaultCommentInput');
  if (defaultCommentInput) {
    defaultCommentInput.value = manualApproveState.defaultComment || '';
  }

  const forceOverrideInput = document.getElementById('manualForceOverride');
  if (forceOverrideInput) {
    forceOverrideInput.checked = !!manualApproveState.forceOverride;
  }

  renderManualMemberList();
}

function populateManualSessionSelect(items) {
  const select = document.getElementById('manualSessionSelect');
  if (!select) return;

  const previousValue = manualApproveState.sessionKey || String(select.value || '').trim();
  select.innerHTML = '';

  if (!items || items.length === 0) {
    select.innerHTML = '<option value="">회차가 없습니다</option>';
    manualApproveState.sessionKey = '';
    manualApproveState.statusByPhone = {};
    syncManualApproveSubmitState();
    renderManualMemberList();
    return;
  }

  items.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.sessionKey;
    opt.textContent = `${item.sessionKey} (${item.startLabel} ~ ${item.endLabel})`;
    select.appendChild(opt);
  });

  const hasPrevious = items.some(item => item.sessionKey === previousValue);
  select.value = hasPrevious ? previousValue : items[0].sessionKey;
  manualApproveState.sessionKey = String(select.value || '').trim();
  syncManualApproveSubmitState();
}

function onManualSessionChanged(value) {
  manualApproveState.sessionKey = String(value || '').trim();
  manualApproveState.selectedPhones = {};
  manualApproveState.memberComments = {};
  manualApproveState.openCommentPhones = {};
  manualApproveState.statusLoadedSessionKey = '';
  manualApproveState.statusLoadedSeasonAlias = '';
  renderManualMemberList();
  refreshManualApproveData({ forceMembers: false, forceStatuses: true }).catch(error => {
    if (handleUnauthorizedError(error)) return;
    showBoxMessage('manualApproveResult', `❌ ${escapeHtml(getDisplayErrorMessage(error, '수동 승인 회차 상태 조회 중 오류'))}`, false);
  });
}

function onManualMemberSearchInput(value) {
  manualApproveState.keyword = String(value || '').trim().toLowerCase();
  renderManualMemberList();
}

function onManualDefaultCommentInput(value) {
  manualApproveState.defaultComment = String(value || '');
}

function setManualAbsentOnly(value) {
  manualApproveState.absentOnly = !!value;
  renderManualMemberList();
}

function setManualSelectedOnly(value) {
  manualApproveState.selectedOnly = !!value;
  renderManualMemberList();
}

function setManualForceOverride(value) {
  manualApproveState.forceOverride = !!value;
}

function toggleManualSelectFiltered(selectFiltered) {
  const shouldSelect = !!selectFiltered;
  const filtered = Array.isArray(manualApproveState.filteredMembers)
    ? manualApproveState.filteredMembers
    : getManualMemberFilteredList();

  filtered.forEach(member => {
    const phone = String(member.phone || '').trim();
    if (!phone) return;
    if (shouldSelect) {
      manualApproveState.selectedPhones[phone] = true;
    } else {
      delete manualApproveState.selectedPhones[phone];
    }
  });

  renderManualMemberList();
}

function toggleManualMemberSelection(encodedPhone, checked) {
  const phone = decodeURIComponent(String(encodedPhone || ''));
  if (!phone) return;

  if (checked) {
    manualApproveState.selectedPhones[phone] = true;
  } else {
    delete manualApproveState.selectedPhones[phone];
  }

  renderManualMemberList();
}

function toggleManualMemberComment(encodedPhone) {
  const phone = decodeURIComponent(String(encodedPhone || ''));
  if (!phone) return;

  const opened = !!manualApproveState.openCommentPhones[phone];
  if (opened) {
    delete manualApproveState.openCommentPhones[phone];
  } else {
    manualApproveState.openCommentPhones[phone] = true;
  }
  renderManualMemberList();
}

function onManualMemberCommentInput(encodedPhone, value) {
  const phone = decodeURIComponent(String(encodedPhone || ''));
  if (!phone) return;

  const rawValue = String(value || '');
  if (rawValue.trim()) {
    manualApproveState.memberComments[phone] = rawValue;
  } else {
    delete manualApproveState.memberComments[phone];
  }
}

function getManualMemberFilteredList() {
  const keyword = manualApproveState.keyword || '';
  const members = Array.isArray(manualApproveState.members) ? manualApproveState.members : [];

  return members.filter(member => {
    const phone = String(member.phone || '').trim();
    if (!phone) return false;

    const statusInfo = getManualMemberStatusInfo(phone);
    if (manualApproveState.absentOnly && statusInfo.hasValue) {
      return false;
    }

    if (manualApproveState.selectedOnly && !manualApproveState.selectedPhones[phone]) {
      return false;
    }

    if (!keyword) return true;

    const haystack = [
      String(member.name || '').toLowerCase(),
      String(member.seasonLabel || member.grade || '').toLowerCase(),
      phone
    ].join(' ');
    return haystack.includes(keyword);
  });
}

function getManualSelectedCount() {
  const members = Array.isArray(manualApproveState.members) ? manualApproveState.members : [];
  const memberPhoneSet = {};
  members.forEach(member => {
    const phone = String(member.phone || '').trim();
    if (phone) memberPhoneSet[phone] = true;
  });

  return Object.keys(manualApproveState.selectedPhones || {}).reduce((count, phone) => {
    return memberPhoneSet[phone] ? count + 1 : count;
  }, 0);
}

function updateManualMemberMeta(filteredMembers) {
  const meta = document.getElementById('manualMemberMeta');
  if (!meta) return;

  const visibleCount = Array.isArray(filteredMembers) ? filteredMembers.length : 0;
  const totalCount = Array.isArray(manualApproveState.members) ? manualApproveState.members.length : 0;
  const selectedCount = getManualSelectedCount();
  meta.textContent = `표시 ${visibleCount}명 / 전체 ${totalCount}명 / 선택 ${selectedCount}명`;
}

function syncManualApproveSubmitState() {
  const btn = document.getElementById('manualApproveBtn');
  const summary = document.getElementById('manualApproveSelectionSummary');
  const selectedCount = getManualSelectedCount();
  const sessionKey = String(manualApproveState.sessionKey || '').trim();

  if (btn) {
    btn.disabled = selectedCount === 0 || !sessionKey;
    btn.innerHTML = `<i class="fas fa-user-check"></i> <span>${selectedCount}명 수동 승인 실행</span>`;
  }

  if (summary) {
    summary.textContent = `선택 ${selectedCount}명`;
  }
}

function renderManualMemberList() {
  const wrap = document.getElementById('manualMemberListWrap');
  if (!wrap) return;

  const sessionKey = String(manualApproveState.sessionKey || '').trim();
  const members = Array.isArray(manualApproveState.members) ? manualApproveState.members : [];
  const filtered = getManualMemberFilteredList();
  manualApproveState.filteredMembers = filtered;

  updateManualMemberMeta(filtered);
  syncManualApproveSubmitState();

  if (!sessionKey) {
    wrap.innerHTML = '<p class="info-text" style="padding: 12px;">승인할 회차를 먼저 선택해주세요.</p>';
    return;
  }

  if (members.length === 0) {
    wrap.innerHTML = '<p class="info-text" style="padding: 12px;">회원 목록이 없습니다.</p>';
    return;
  }

  if (filtered.length === 0) {
    wrap.innerHTML = '<p class="info-text" style="padding: 12px;">조건에 맞는 회원이 없습니다.</p>';
    return;
  }

  const rows = filtered.map(member => {
    const phone = String(member.phone || '').trim();
    const encodedPhone = encodeURIComponent(phone);
    const statusInfo = getManualMemberStatusInfo(phone);
    const isSelected = !!manualApproveState.selectedPhones[phone];
    const comment = String(manualApproveState.memberComments[phone] || '');
    const commentOpened = !!manualApproveState.openCommentPhones[phone];
    const rowClass = [
      'manual-member-row',
      isSelected ? 'is-selected' : ''
    ].filter(Boolean).join(' ');
    const statusClass = escapeHtml(statusInfo.status || 'none');
    const statusLabel = escapeHtml(statusInfo.label || MANUAL_MEMBER_STATUS_LABELS.none);
    const noteLine = statusInfo.note
      ? `<span class="manual-member-sub" title="${escapeHtml(statusInfo.note)}">기존 메모: ${escapeHtml(statusInfo.note)}</span>`
      : '';
    const timeLine = statusInfo.attendTime
      ? `<span class="manual-member-sub">기존 기록 시각: ${escapeHtml(statusInfo.attendTime)}</span>`
      : '';
    const commentToggleLabel = commentOpened ? '개별 멘트 닫기' : (comment ? '개별 멘트 수정' : '개별 멘트');

    return `
      <div class="${rowClass}" role="listitem">
        <label class="manual-member-check">
          <input type="checkbox"
                 ${isSelected ? 'checked' : ''}
                 onchange="toggleManualMemberSelection('${encodedPhone}', this.checked)"
                 aria-label="${escapeHtml(member.name)} 선택">
        </label>
        <div class="manual-member-main">
          <div class="manual-member-name-line">
            <span class="grade-badge">${escapeHtml(member.seasonLabel || member.grade || '-')}</span>
            <span>${escapeHtml(member.name || '-')}</span>
            <span class="manual-status-badge ${statusClass}">${statusLabel}</span>
          </div>
          <span class="manual-member-sub">${escapeHtml(phone)}</span>
          ${timeLine}
          ${noteLine}
          <div class="manual-member-comment ${commentOpened ? 'is-open' : ''}">
            <input type="text"
                   class="form-input"
                   value="${escapeHtml(comment)}"
                   placeholder="이 회원에게만 남길 개별 멘트"
                   oninput="onManualMemberCommentInput('${encodedPhone}', this.value)">
          </div>
        </div>
        <div class="manual-member-actions">
          <button type="button"
                  class="manual-member-comment-toggle"
                  onclick="toggleManualMemberComment('${encodedPhone}')"
                  aria-label="${escapeHtml(member.name)} 개별 멘트 입력 토글">
            ${commentToggleLabel}
          </button>
        </div>
      </div>
    `;
  }).join('');

  wrap.innerHTML = rows;
}

function renderManualApproveDetailTable(results, summary) {
  const wrap = document.getElementById('manualApproveDetailWrap');
  if (!wrap) return;

  if (!Array.isArray(results) || results.length === 0) {
    wrap.innerHTML = '';
    return;
  }

  const statusLabelMap = {
    approved: '승인',
    skipped: '건너뜀',
    failed: '실패'
  };

  const rows = results.map(row => {
    const previousText = [
      row.previousStatusLabel || '',
      row.previousValue || '',
      row.previousNote ? `note: ${row.previousNote}` : ''
    ].filter(Boolean).join(' / ');
    const boundaryReasonText = row.boundaryAdjustReason === 'before_open'
      ? '오픈시각 보정'
      : (row.boundaryAdjustReason === 'after_close' ? '마감시각 보정' : '');
    const writtenAtText = row.writtenAt
      ? `${row.writtenAt}${row.boundaryAdjusted && boundaryReasonText ? ` (${boundaryReasonText})` : ''}`
      : '-';

    return `
      <tr>
        <td>${escapeHtml(row.name || '-')}</td>
        <td>${escapeHtml(row.phone || '-')}</td>
        <td>${escapeHtml(statusLabelMap[row.status] || row.status || '-')}</td>
        <td>${escapeHtml(writtenAtText)}</td>
        <td>${escapeHtml(row.message || '-')}</td>
        <td>${escapeHtml(previousText || '-')}</td>
      </tr>
    `;
  }).join('');

  wrap.innerHTML = `
    <p class="info-text" style="margin-top: 10px;">
      처리 요약: 요청 ${Number(summary.requested || 0)}건 / 승인 ${Number(summary.approved || 0)}건 / 건너뜀 ${Number(summary.skipped || 0)}건 / 실패 ${Number(summary.failed || 0)}건
    </p>
    <table class="manual-detail-table">
      <thead>
        <tr>
          <th>이름</th>
          <th>전화번호</th>
          <th>결과</th>
          <th>기록시각</th>
          <th>메시지</th>
          <th>기존 기록</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

async function loadManualApproveStatuses(options) {
  const season = getSelectedSeasonAlias();
  const sessionKey = String(manualApproveState.sessionKey || '').trim();
  const opts = options || {};
  const forceStatuses = !!opts.forceStatuses;

  if (!season || !sessionKey) {
    manualApproveState.statusByPhone = {};
    manualApproveState.statusLoadedSeasonAlias = season || '';
    manualApproveState.statusLoadedSessionKey = sessionKey;
    return;
  }

  const canReuse = !forceStatuses
    && manualApproveState.statusLoadedSeasonAlias === season
    && manualApproveState.statusLoadedSessionKey === sessionKey
    && Object.keys(manualApproveState.statusByPhone || {}).length > 0;

  if (canReuse) {
    return;
  }

  const response = await CloudClubApi.call('graduationReport', {
    season,
    adminToken
  });

  if (!response.success) {
    throw new Error(response.message || '수동 승인 대상 상태 조회 실패');
  }

  manualApproveState.statusByPhone = buildManualStatusByPhoneFromReport(response, sessionKey);
  manualApproveState.statusLoadedSeasonAlias = season;
  manualApproveState.statusLoadedSessionKey = sessionKey;
}

async function refreshManualApproveData(options) {
  const season = getSelectedSeasonAlias();
  if (!season) return;

  const opts = options || {};
  const seasonChanged = manualApproveState.seasonAlias !== season;
  const forceMembers = !!opts.forceMembers;
  const forceStatuses = !!opts.forceStatuses;

  if (seasonChanged) {
    const prevDefaultComment = manualApproveState.defaultComment || '';
    const prevForceOverride = !!manualApproveState.forceOverride;
    manualApproveState = createManualApproveInitialState();
    manualApproveState.seasonAlias = season;
    manualApproveState.defaultComment = prevDefaultComment;
    manualApproveState.forceOverride = prevForceOverride;
  }

  if (forceMembers || seasonChanged || membersCache.length === 0) {
    await loadMembers({ force: true, seasonAlias: season });
  }

  manualApproveState.members = Array.isArray(membersCache) ? membersCache.slice() : [];
  if (!manualApproveState.sessionKey) {
    const select = document.getElementById('manualSessionSelect');
    manualApproveState.sessionKey = select ? String(select.value || '').trim() : '';
  }

  await loadManualApproveStatuses({
    forceStatuses: forceStatuses || seasonChanged
  });

  const searchInput = document.getElementById('manualMemberSearchInput');
  if (searchInput) {
    searchInput.value = manualApproveState.keyword || '';
  }

  const defaultCommentInput = document.getElementById('manualDefaultCommentInput');
  if (defaultCommentInput && defaultCommentInput.value !== manualApproveState.defaultComment) {
    defaultCommentInput.value = manualApproveState.defaultComment || '';
  }

  const forceOverrideInput = document.getElementById('manualForceOverride');
  if (forceOverrideInput && forceOverrideInput.checked !== !!manualApproveState.forceOverride) {
    forceOverrideInput.checked = !!manualApproveState.forceOverride;
  }

  const absentOnlyInput = document.getElementById('manualAbsentOnly');
  if (absentOnlyInput && absentOnlyInput.checked !== !!manualApproveState.absentOnly) {
    absentOnlyInput.checked = !!manualApproveState.absentOnly;
  }

  const selectedOnlyInput = document.getElementById('manualSelectedOnly');
  if (selectedOnlyInput && selectedOnlyInput.checked !== !!manualApproveState.selectedOnly) {
    selectedOnlyInput.checked = !!manualApproveState.selectedOnly;
  }

  renderManualMemberList();
}

async function submitManualApproveBatch(event) {
  if (event) event.preventDefault();

  const season = getSelectedSeasonAlias();
  const sessionKey = String(manualApproveState.sessionKey || '').trim();
  const btn = document.getElementById('manualApproveBtn');
  const detailWrap = document.getElementById('manualApproveDetailWrap');

  if (!season) {
    alert('시즌이 선택되지 않았습니다.');
    return;
  }

  if (!sessionKey) {
    alert('승인할 회차를 선택해주세요.');
    return;
  }

  const selectedItems = (manualApproveState.members || [])
    .map(member => {
      const phone = String(member.phone || '').trim();
      if (!phone || !manualApproveState.selectedPhones[phone]) return null;
      return {
        phone: phone,
        comment: String(manualApproveState.memberComments[phone] || '').trim()
      };
    })
    .filter(Boolean);

  if (selectedItems.length === 0) {
    alert('수동 승인할 회원을 선택해주세요.');
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="loader"></span> <span>배치 처리 중...</span>';
  }

  if (detailWrap) {
    detailWrap.innerHTML = '<div class="loader" style="margin: 18px auto;"></div>';
  }

  const mergedSummary = {
    requested: 0,
    approved: 0,
    skipped: 0,
    overridden: 0,
    failed: 0
  };
  const mergedResults = [];

  try {
    for (let i = 0; i < selectedItems.length; i += MANUAL_APPROVE_BATCH_CHUNK_SIZE) {
      const chunk = selectedItems.slice(i, i + MANUAL_APPROVE_BATCH_CHUNK_SIZE);
      const response = await CloudClubApi.call('manualApproveBatch', {
        season,
        sessionKey,
        defaultComment: String(manualApproveState.defaultComment || '').trim(),
        forceOverride: manualApproveState.forceOverride ? 'true' : 'false',
        itemsJson: JSON.stringify(chunk),
        adminToken
      });

      if (!response.success) {
        throw new Error(response.message || '수동 승인 배치 처리 실패');
      }

      const summary = response.summary || {};
      mergedSummary.requested += Number(summary.requested || chunk.length);
      mergedSummary.approved += Number(summary.approved || 0);
      mergedSummary.skipped += Number(summary.skipped || 0);
      mergedSummary.overridden += Number(summary.overridden || 0);
      mergedSummary.failed += Number(summary.failed || 0);

      if (Array.isArray(response.results)) {
        mergedResults.push(...response.results);
      }
    }

    const ok = mergedSummary.failed === 0;
    const message = `${ok ? '✅' : '⚠️'} 요청 ${mergedSummary.requested}건 중 승인 ${mergedSummary.approved}건 / 건너뜀 ${mergedSummary.skipped}건 / 실패 ${mergedSummary.failed}건`;
    showBoxMessage('manualApproveResult', message, ok);
    renderManualApproveDetailTable(mergedResults, mergedSummary);
    showToast(`<i class="fas fa-check-circle"></i> 수동 승인 배치 완료 (${mergedSummary.approved}건)`, ok);

    const retrySelection = {};
    mergedResults.forEach(item => {
      if (item && item.status && item.status !== 'approved') {
        const phone = normalizeImportPhoneLocal(item.phone || '');
        if (phone) retrySelection[phone] = true;
      }
    });
    manualApproveState.selectedPhones = retrySelection;
    if (Object.keys(retrySelection).length === 0) {
      manualApproveState.memberComments = {};
      manualApproveState.openCommentPhones = {};
    }
    manualApproveState.statusLoadedSessionKey = '';
    manualApproveState.statusLoadedSeasonAlias = '';

    await Promise.all([
      refreshSessionAndRanking(),
      loadGraduationReport()
    ]);
    await refreshStatusDashboardIfVisible();
    await refreshManualApproveData({ forceMembers: false, forceStatuses: true });
  } catch (error) {
    if (handleUnauthorizedError(error)) return;
    showBoxMessage('manualApproveResult', `❌ ${escapeHtml(getDisplayErrorMessage(error, '수동 승인 배치 처리 중 오류'))}`, false);
    if (detailWrap) {
      detailWrap.innerHTML = '';
    }
  } finally {
    syncManualApproveSubmitState();
  }
}

async function manualApprove(event) {
  await submitManualApproveBatch(event);
}

function updateScheduleSaveButtonLabel() {
  const btn = document.getElementById('scheduleSaveBtn');
  const select = document.getElementById('scheduleSessionSelect');
  if (!btn || !select) return;

  const isEdit = !!String(select.value || '').trim();
  btn.innerHTML = `<i class="fas fa-save"></i> <span>${isEdit ? '일정 수정' : '일정 추가'}</span>`;
}

function resetScheduleForm() {
  const select = document.getElementById('scheduleSessionSelect');
  const dateInput = document.getElementById('scheduleDateInput');
  const startTimeInput = document.getElementById('scheduleStartTimeInput');
  const endInput = document.getElementById('scheduleEndInput');

  if (select) select.value = '';

  const now = new Date();
  if (dateInput) {
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    dateInput.value = `${yyyy}-${mm}-${dd}`;
  }

  if (startTimeInput) {
    startTimeInput.value = getDefaultScheduleStartTime();
  }

  scheduleEndAutoManaged = true;
  if (endInput) {
    endInput.value = suggestScheduleEndTime(startTimeInput ? startTimeInput.value : '');
  }

  updateSchedulePreview();
  updateScheduleSaveButtonLabel();
}

function populateScheduleSelect(items) {
  const select = document.getElementById('scheduleSessionSelect');
  if (!select) return;

  const prevValue = select.value;

  select.innerHTML = '<option value="">새 회차 추가</option>';

  items.forEach(item => {
    const option = document.createElement('option');
    option.value = item.sessionKey;
    option.textContent = `${item.sessionKey} (${item.startLabel})`;
    select.appendChild(option);
  });

  if (prevValue && items.some(item => item.sessionKey === prevValue)) {
    select.value = prevValue;
  }

  updateScheduleSaveButtonLabel();
}

function renderScheduleTable(items) {
  const wrap = document.getElementById('scheduleTableWrap');
  if (!wrap) return;

  if (!items || items.length === 0) {
    wrap.innerHTML = '<p class="info-text">등록된 일정이 없습니다.</p>';
    return;
  }

  const rows = items.map(item => {
    const activeBadge = item.isActive
      ? '<span class="status-chip possible">진행중</span>'
      : (item.isPast ? '<span class="status-chip fail">종료</span>' : '<span class="status-chip pass">예정</span>');

    return `
      <tr>
        <td>${escapeHtml(item.sessionKey)}</td>
        <td>${escapeHtml(item.startLabel)}</td>
        <td>${escapeHtml(item.openLabel)}</td>
        <td>${escapeHtml(item.endLabel)}</td>
        <td>${item.explicitEndAt ? escapeHtml(item.explicitEndAt) : '-'}</td>
        <td>${activeBadge}</td>
        <td>
          <button type="button" class="btn btn-secondary" style="padding:8px 12px; font-size:13px;" onclick="selectScheduleForEdit('${encodeURIComponent(item.sessionKey)}')">
            <i class="fas fa-edit"></i>
            <span>수정</span>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  wrap.innerHTML = `
    <table class="management-table">
      <thead>
        <tr>
          <th>회차 키</th>
          <th>시작</th>
          <th>오픈</th>
          <th>마감</th>
          <th>종료 직접입력</th>
          <th>상태</th>
          <th>동작</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

function handleScheduleSelectionChange() {
  const key = document.getElementById('scheduleSessionSelect').value;
  const dateInput = document.getElementById('scheduleDateInput');
  const startTimeInput = document.getElementById('scheduleStartTimeInput');
  const endInput = document.getElementById('scheduleEndInput');

  if (!key) {
    resetScheduleForm();
    return;
  }

  const found = scheduleItems.find(item => item.sessionKey === key);
  if (!found) return;

  const date = new Date(found.startTime);
  if (dateInput) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    dateInput.value = `${yyyy}-${mm}-${dd}`;
  }
  if (startTimeInput) {
    startTimeInput.value = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  }
  if (endInput) {
    endInput.value = found.explicitEndAt || suggestScheduleEndTime(startTimeInput ? startTimeInput.value : '');
  }
  scheduleEndAutoManaged = !found.explicitEndAt;
  updateSchedulePreview();
  updateScheduleSaveButtonLabel();
}

function selectScheduleForEdit(encodedSessionKey) {
  const key = decodeURIComponent(encodedSessionKey || '');
  const select = document.getElementById('scheduleSessionSelect');
  if (!select) return;
  select.value = key;
  handleScheduleSelectionChange();

  const scheduleTabButton = Array.from(document.querySelectorAll('.tab-button')).find(btn => btn.textContent.includes('일정 관리'));
  if (scheduleTabButton) {
    openTab('schedule', { currentTarget: scheduleTabButton });
  }
}

async function loadScheduleList() {
  const season = getSelectedSeasonAlias();
  if (!season) return;

  try {
    const response = await CloudClubApi.call('scheduleList', {
      season,
      adminToken
    });

    if (!response.success) {
      document.getElementById('scheduleTableWrap').innerHTML = `<div class="error">${escapeHtml(response.message || '일정 조회 실패')}</div>`;
      const calendarGrid = document.getElementById('scheduleCalendarGrid');
      if (calendarGrid) {
        calendarGrid.innerHTML = `<div class="error">${escapeHtml(response.message || '캘린더 조회 실패')}</div>`;
      }
      return;
    }

    scheduleDefaults = response.defaults || {};
    scheduleItems = response.items || [];
    buildScheduleCalendarModel(scheduleItems, response.dateConflicts || []);
    renderScheduleTable(scheduleItems);
    populateScheduleSelect(scheduleItems);
    populateManualSessionSelect(scheduleItems);
    renderScheduleCalendar();
    if (!document.getElementById('scheduleSessionSelect').value) {
      resetScheduleForm();
    } else {
      updateSchedulePreview();
      updateScheduleSaveButtonLabel();
    }

    if (getActiveTabName() === 'attend') {
      try {
        await refreshManualApproveData({
          forceMembers: false,
          forceStatuses: true
        });
      } catch (error) {
        if (handleUnauthorizedError(error)) return;
        showBoxMessage('manualApproveResult', `❌ ${escapeHtml(getDisplayErrorMessage(error, '수동 승인 대상 정보 조회 중 오류'))}`, false);
      }
    }
  } catch (error) {
    if (handleUnauthorizedError(error)) return;
    const wrap = document.getElementById('scheduleTableWrap');
    if (wrap) {
      wrap.innerHTML = `<div class="error">${escapeHtml(getDisplayErrorMessage(error, '일정 조회 중 오류'))}</div>`;
    }
    const calendarGrid = document.getElementById('scheduleCalendarGrid');
    if (calendarGrid) {
      calendarGrid.innerHTML = `<div class="error">${escapeHtml(getDisplayErrorMessage(error, '캘린더 조회 중 오류'))}</div>`;
    }
  }
}

function buildScheduleCalendarModel(items, serverConflicts) {
  const grouped = {};

  (items || []).forEach(item => {
    const dateKey = String(item.dateKey || getDateKeyFromMs(item.startTime) || '').trim();
    if (!dateKey) return;
    if (!grouped[dateKey]) {
      grouped[dateKey] = [];
    }
    grouped[dateKey].push(item);
  });

  scheduleByDateMap = {};
  Object.keys(grouped).forEach(dateKey => {
    const sorted = grouped[dateKey].slice().sort((a, b) => Number(a.startTime || 0) - Number(b.startTime || 0));
    scheduleByDateMap[dateKey] = sorted[0];
  });

  const serverList = Array.isArray(serverConflicts) ? serverConflicts : [];
  if (serverList.length > 0) {
    scheduleDateConflicts = serverList
      .filter(item => item && item.dateKey && Array.isArray(item.sessionKeys) && item.sessionKeys.length > 1)
      .map(item => ({
        dateKey: String(item.dateKey),
        sessionKeys: item.sessionKeys.map(v => String(v || ''))
      }));
  } else {
    scheduleDateConflicts = Object.keys(grouped)
      .filter(dateKey => grouped[dateKey].length > 1)
      .sort()
      .map(dateKey => ({
        dateKey: dateKey,
        sessionKeys: grouped[dateKey].map(item => String(item.sessionKey || ''))
      }));
  }

  if (!calendarSelectedDateKey) {
    calendarSelectedDateKey = getDateKeyFromDate(new Date());
  }
  const selectedDate = parseDateKeyToDate(calendarSelectedDateKey);
  if (selectedDate) {
    calendarCursorYear = selectedDate.getFullYear();
    calendarCursorMonth = selectedDate.getMonth();
  }
}

function renderScheduleConflictBox() {
  const wrap = document.getElementById('scheduleCalendarConflictWrap');
  if (!wrap) return;

  if (!scheduleDateConflicts || scheduleDateConflicts.length === 0) {
    wrap.innerHTML = '';
    return;
  }

  const lines = scheduleDateConflicts.map(conflict => (
    `<li><button type="button" class="schedule-conflict-link-btn" onclick="selectConflictDate('${escapeHtml(conflict.dateKey)}')">${escapeHtml(conflict.dateKey)}</button>: ${escapeHtml(conflict.sessionKeys.join(', '))}</li>`
  )).join('');

  wrap.innerHTML = `
    <div class="schedule-calendar-conflict-box">
      <strong>동일 날짜 회차 중복 ${scheduleDateConflicts.length}건</strong><br>
      먼저 중복 날짜 회차를 정리한 뒤 저장 가능합니다.
      <ul>${lines}</ul>
    </div>
  `;
}

function selectConflictDate(dateKey) {
  const conflict = (scheduleDateConflicts || []).find(item => item.dateKey === dateKey);
  selectCalendarDate(dateKey);
  if (!conflict) return;
  const message = `${dateKey} 중복 회차: ${conflict.sessionKeys.join(', ')}`;
  showToast(escapeHtml(message), true);
}

function renderScheduleCalendar() {
  const monthTitle = document.getElementById('scheduleCalendarMonthTitle');
  const grid = document.getElementById('scheduleCalendarGrid');
  if (!grid) return;

  renderScheduleConflictBox();

  if (monthTitle) {
    monthTitle.textContent = formatMonthTitle(calendarCursorYear, calendarCursorMonth);
  }

  const weekdayCells = ['일', '월', '화', '수', '목', '금', '토']
    .map(name => `<div class="schedule-calendar-weekday">${name}</div>`)
    .join('');

  const firstDay = new Date(calendarCursorYear, calendarCursorMonth, 1);
  const startOffset = firstDay.getDay();
  const gridStartDate = new Date(calendarCursorYear, calendarCursorMonth, 1 - startOffset);
  const todayKey = getDateKeyFromDate(new Date());
  let dayCells = '';

  for (let i = 0; i < 42; i++) {
    const cellDate = new Date(
      gridStartDate.getFullYear(),
      gridStartDate.getMonth(),
      gridStartDate.getDate() + i
    );
    const dateKey = getDateKeyFromDate(cellDate);
    const isCurrentMonth = cellDate.getMonth() === calendarCursorMonth;
    const isToday = dateKey === todayKey;
    const isSelected = dateKey === calendarSelectedDateKey;
    const hasSchedule = !!scheduleByDateMap[dateKey];
    const item = scheduleByDateMap[dateKey] || null;
    const dayClass = [
      'schedule-calendar-day',
      isCurrentMonth ? 'current-month' : 'other-month',
      isToday ? 'today' : '',
      isSelected ? 'selected' : '',
      hasSchedule ? 'has-schedule' : ''
    ].filter(Boolean).join(' ');
    const timeLabel = item ? escapeHtml(item.startHhmm || formatHhmmFromMs(item.startTime)) : '';
    const statusLabel = item
      ? (item.isActive ? '진행중' : (item.isPast ? '종료' : '예정'))
      : '';

    dayCells += `
      <div class="${dayClass}" onclick="selectCalendarDate('${dateKey}')">
        <div class="schedule-calendar-day-head">
          <span class="schedule-calendar-day-num">${cellDate.getDate()}</span>
          <button type="button" class="schedule-calendar-plus-btn" onclick="openScheduleCalendarModal('${dateKey}'); event.stopPropagation();">+</button>
        </div>
        ${hasSchedule ? `
          <div class="schedule-calendar-item-time">${timeLabel}</div>
          <div class="schedule-calendar-item-status">${escapeHtml(statusLabel)}</div>
        ` : '<div class="schedule-calendar-item-empty">일정 없음</div>'}
      </div>
    `;
  }

  grid.innerHTML = `
    <div class="schedule-calendar-weekdays">${weekdayCells}</div>
    <div class="schedule-calendar-days">${dayCells}</div>
  `;
}

function moveCalendarMonth(delta) {
  const next = new Date(calendarCursorYear, calendarCursorMonth + Number(delta || 0), 1);
  calendarCursorYear = next.getFullYear();
  calendarCursorMonth = next.getMonth();
  renderScheduleCalendar();
}

function goCalendarToday() {
  const today = new Date();
  calendarCursorYear = today.getFullYear();
  calendarCursorMonth = today.getMonth();
  calendarSelectedDateKey = getDateKeyFromDate(today);
  renderScheduleCalendar();
}

function selectCalendarDate(dateKey) {
  const selected = parseDateKeyToDate(dateKey);
  if (!selected) return;
  calendarSelectedDateKey = dateKey;
  calendarCursorYear = selected.getFullYear();
  calendarCursorMonth = selected.getMonth();
  renderScheduleCalendar();
}

function openScheduleCalendarModal(dateKey) {
  const modal = document.getElementById('scheduleCalendarModal');
  const title = document.getElementById('scheduleCalendarModalTitle');
  const targetDate = document.getElementById('scheduleCalendarModalTargetDate');
  const sessionInfo = document.getElementById('scheduleCalendarModalSessionInfo');
  const startInput = document.getElementById('scheduleCalendarModalStartTimeInput');
  const endInput = document.getElementById('scheduleCalendarModalEndInput');
  const saveBtn = document.getElementById('scheduleCalendarModalSaveBtn');
  const deleteBtn = document.getElementById('scheduleCalendarModalDeleteBtn');
  if (!modal || !title || !targetDate || !sessionInfo || !startInput || !endInput || !saveBtn || !deleteBtn) return;

  const item = scheduleByDateMap[dateKey] || null;
  scheduleCalendarModalState = {
    dateKey: dateKey,
    isEdit: !!item,
    sessionKey: item ? item.sessionKey : '',
    endAutoManaged: !(item && item.explicitEndAt)
  };
  calendarSelectedDateKey = dateKey;
  const selectedDate = parseDateKeyToDate(dateKey);
  if (selectedDate) {
    calendarCursorYear = selectedDate.getFullYear();
    calendarCursorMonth = selectedDate.getMonth();
  }

  title.textContent = item ? '일정 수정' : '새 회차 추가';
  targetDate.textContent = formatDateKeyLabel(dateKey);
  sessionInfo.textContent = item
    ? `기존 회차: ${item.sessionKey}`
    : '해당 날짜에 등록된 회차가 없습니다.';
  startInput.value = item ? (item.startHhmm || formatHhmmFromMs(item.startTime)) : getDefaultScheduleStartTime();
  endInput.value = item ? (item.explicitEndAt || suggestScheduleEndTime(startInput.value)) : suggestScheduleEndTime(startInput.value);
  saveBtn.innerHTML = `<i class="fas fa-save"></i> <span>${item ? '일정 수정' : '일정 추가'}</span>`;
  deleteBtn.style.display = item ? 'inline-flex' : 'none';

  updateScheduleCalendarModalPreview();
  renderScheduleCalendar();

  modal.style.display = 'flex';
  setTimeout(() => startInput.focus(), 0);
}

function closeScheduleCalendarModal() {
  const modal = document.getElementById('scheduleCalendarModal');
  if (modal) {
    modal.style.display = 'none';
  }
  scheduleCalendarModalState = null;
}

function onScheduleCalendarStartTimeChanged() {
  const startInput = document.getElementById('scheduleCalendarModalStartTimeInput');
  const endInput = document.getElementById('scheduleCalendarModalEndInput');
  if (!scheduleCalendarModalState || !startInput || !endInput) return;

  if (scheduleCalendarModalState.endAutoManaged || !endInput.value) {
    endInput.value = suggestScheduleEndTime(startInput.value);
    scheduleCalendarModalState.endAutoManaged = true;
  }
  updateScheduleCalendarModalPreview();
}

function onScheduleCalendarEndInputChanged() {
  if (!scheduleCalendarModalState) return;
  scheduleCalendarModalState.endAutoManaged = false;
  updateScheduleCalendarModalPreview();
}

function updateScheduleCalendarModalPreview() {
  const preview = document.getElementById('scheduleCalendarModalPreview');
  const startInput = document.getElementById('scheduleCalendarModalStartTimeInput');
  const endInput = document.getElementById('scheduleCalendarModalEndInput');
  if (!preview || !startInput || !endInput || !scheduleCalendarModalState) return;

  const startTime = String(startInput.value || '').trim();
  const dateKey = scheduleCalendarModalState.dateKey;
  if (!dateKey || !startTime) {
    preview.textContent = '회차 키/오픈 시각 미리보기가 여기에 표시됩니다.';
    return;
  }

  const startAt = `${dateKey}T${startTime}`;
  const sessionKey = startAt.replace('T', '-');
  const liveOpenOffset = Number(getVariableValueByKey('attendance_open_offset_min'));
  const openOffsetMin = Number(
    (!Number.isNaN(liveOpenOffset) ? liveOpenOffset : '') ||
    (variableConfig && variableConfig.attendance_open_offset_min) ||
    (scheduleDefaults && scheduleDefaults.attendance_open_offset_min) ||
    -30
  );
  const start = new Date(startAt);
  const open = new Date(start.getTime() + openOffsetMin * 60 * 1000);
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  preview.innerHTML = `
    회차 키: <strong>${escapeHtml(sessionKey)}</strong><br>
    출석 오픈: ${escapeHtml(fmt(open))} (${openOffsetMin}분)<br>
    종료 입력: ${endInput.value ? escapeHtml(endInput.value) : '미입력(기본 마감 규칙 적용)'}
  `;
}

async function requestScheduleSave(options) {
  const season = String(options.season || '').trim();
  if (!season) {
    return { success: false, message: '시즌 정보가 없습니다.' };
  }

  return CloudClubApi.call('scheduleSave', {
    season,
    sessionKey: options.sessionKey || '',
    startAt: options.startAt || '',
    endAt: options.endAt || '',
    adminToken
  });
}

async function saveSchedule(event) {
  event.preventDefault();

  const season = getSelectedSeasonAlias();
  const sessionKey = document.getElementById('scheduleSessionSelect').value;
  const isEditMode = !!String(sessionKey || '').trim();
  const actionNoun = isEditMode ? '수정' : '추가';
  const startAt = composeScheduleStartAt();
  const endAt = document.getElementById('scheduleEndInput').value;

  if (!season) {
    alert('시즌 정보가 없습니다.');
    return;
  }

  if (!startAt) {
    alert('시작 시각을 입력해주세요.');
    return;
  }

  const btn = document.getElementById('scheduleSaveBtn');
  btn.disabled = true;
  btn.innerHTML = `<span class="loader"></span> <span>${actionNoun} 중...</span>`;

  try {
    const response = await requestScheduleSave({
      season,
      sessionKey,
      startAt,
      endAt
    });

    if (!response.success) {
      const duplicateInfo = response.errorCode === 'SCHEDULE_DATE_DUPLICATE'
        ? ` (충돌: ${response.conflictDateKey || '-'} / ${response.conflictSessionKey || '-'})`
        : '';
      showBoxMessage('scheduleActionResult', `❌ ${escapeHtml((response.message || `일정 ${actionNoun} 실패`) + duplicateInfo)}`, false);
      return;
    }

    showBoxMessage('scheduleActionResult', `✅ ${escapeHtml(response.message || `일정 ${actionNoun} 완료`)}`, true);
    showToast(`<i class="fas fa-check-circle"></i> 일정 ${actionNoun} 완료`, true);

    await Promise.all([
      loadScheduleList(),
      checkAttendanceSession(),
      loadGraduationReport()
    ]);

    resetScheduleForm();
  } catch (error) {
    if (handleUnauthorizedError(error)) return;
    showBoxMessage('scheduleActionResult', `❌ ${escapeHtml(getDisplayErrorMessage(error, `일정 ${actionNoun} 중 오류`))}`, false);
  } finally {
    btn.disabled = false;
    updateScheduleSaveButtonLabel();
  }
}

async function submitScheduleCalendarModal() {
  if (!scheduleCalendarModalState) return;

  const season = getSelectedSeasonAlias();
  const startInput = document.getElementById('scheduleCalendarModalStartTimeInput');
  const endInput = document.getElementById('scheduleCalendarModalEndInput');
  const saveBtn = document.getElementById('scheduleCalendarModalSaveBtn');
  if (!season || !startInput || !endInput || !saveBtn) return;

  const startTime = String(startInput.value || '').trim();
  const endAt = String(endInput.value || '').trim();
  if (!startTime) {
    alert('시작 시간을 입력해주세요.');
    return;
  }

  const startAt = `${scheduleCalendarModalState.dateKey}T${startTime}`;
  const actionNoun = scheduleCalendarModalState.isEdit ? '수정' : '추가';

  saveBtn.disabled = true;
  saveBtn.innerHTML = `<span class="loader"></span> <span>${actionNoun} 중...</span>`;
  try {
    const response = await requestScheduleSave({
      season,
      sessionKey: scheduleCalendarModalState.sessionKey,
      startAt,
      endAt
    });

    if (!response.success) {
      const duplicateInfo = response.errorCode === 'SCHEDULE_DATE_DUPLICATE'
        ? ` (충돌: ${response.conflictDateKey || '-'} / ${response.conflictSessionKey || '-'})`
        : '';
      alert((response.message || '일정 저장 실패') + duplicateInfo);
      return;
    }

    showToast(`<i class="fas fa-check-circle"></i> 일정 ${actionNoun} 완료`, true);
    closeScheduleCalendarModal();
    await Promise.all([
      loadScheduleList(),
      checkAttendanceSession(),
      loadGraduationReport()
    ]);
    resetScheduleForm();
  } catch (error) {
    if (handleUnauthorizedError(error)) return;
    alert(getDisplayErrorMessage(error, `일정 ${actionNoun} 중 오류`));
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = `<i class="fas fa-save"></i> <span>${scheduleCalendarModalState && scheduleCalendarModalState.isEdit ? '일정 수정' : '일정 추가'}</span>`;
  }
}

async function deleteFromCalendarModal() {
  if (!scheduleCalendarModalState || !scheduleCalendarModalState.isEdit) return;

  const season = getSelectedSeasonAlias();
  const sessionKey = scheduleCalendarModalState.sessionKey;
  if (!season || !sessionKey) return;

  if (!confirm(`${sessionKey} 회차를 삭제하시겠습니까?`)) {
    return;
  }

  if (!confirm(`삭제를 진행하면 해당 회차 열이 시트에서 제거됩니다.\n정말 삭제하시겠습니까?`)) {
    return;
  }

  closeScheduleCalendarModal();
  await requestScheduleDelete({
    season,
    sessionKey,
    forceDelete: false,
    confirmSessionKey: ''
  });
}

async function deleteSelectedSchedule() {
  const season = getSelectedSeasonAlias();
  const sessionKey = document.getElementById('scheduleSessionSelect').value;

  if (!season) {
    alert('시즌 정보가 없습니다.');
    return;
  }

  if (!sessionKey) {
    alert('삭제할 회차를 선택해주세요.');
    return;
  }

  if (!confirm(`${sessionKey} 회차를 삭제하시겠습니까?`)) {
    return;
  }

  if (!confirm(`삭제를 진행하면 해당 회차 열이 시트에서 제거됩니다.\n정말 삭제하시겠습니까?`)) {
    return;
  }

  await requestScheduleDelete({
    season,
    sessionKey,
    forceDelete: false,
    confirmSessionKey: ''
  });
}

function getDefaultScheduleStartTime() {
  const fromVariable = String((variableConfig && variableConfig.default_session_start_time) || '').trim();
  if (/^([01]\d|2[0-3]):([0-5]\d)$/.test(fromVariable)) {
    return fromVariable;
  }

  const fromScheduleDefaults = String((scheduleDefaults && scheduleDefaults.default_session_start_time) || '').trim();
  if (/^([01]\d|2[0-3]):([0-5]\d)$/.test(fromScheduleDefaults)) {
    return fromScheduleDefaults;
  }

  return '19:00';
}

function suggestScheduleEndTime(startTimeText) {
  const match = String(startTimeText || '').match(/^(\d{2}):(\d{2})$/);
  if (!match) return '';

  const startMin = (parseInt(match[1], 10) * 60) + parseInt(match[2], 10);
  const liveAbsence = Number(getVariableValueByKey('absence_threshold_min'));
  const duration = Number(
    (!Number.isNaN(liveAbsence) ? liveAbsence : '') ||
    (variableConfig && variableConfig.absence_threshold_min) ||
    (scheduleDefaults && scheduleDefaults.absence_threshold_min) ||
    180
  );
  const end = startMin + (isNaN(duration) ? 180 : duration);
  const hh = Math.floor((end % (24 * 60)) / 60);
  const mm = end % 60;
  return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
}

function composeScheduleStartAt() {
  const date = document.getElementById('scheduleDateInput').value;
  const time = document.getElementById('scheduleStartTimeInput').value;

  if (!date || !time) return '';
  return `${date}T${time}`;
}

function onScheduleStartTimeChanged() {
  const startTimeInput = document.getElementById('scheduleStartTimeInput');
  const endInput = document.getElementById('scheduleEndInput');
  if (!startTimeInput || !endInput) return;

  if (scheduleEndAutoManaged || !endInput.value) {
    endInput.value = suggestScheduleEndTime(startTimeInput.value);
    scheduleEndAutoManaged = true;
  }

  updateSchedulePreview();
}

function updateSchedulePreview() {
  const preview = document.getElementById('scheduleComputedPreview');
  if (!preview) return;

  const startAt = composeScheduleStartAt();
  const endAt = document.getElementById('scheduleEndInput').value;
  if (!startAt) {
    preview.textContent = '회차 키와 마감 계산 정보가 여기에 표시됩니다.';
    return;
  }

  const key = startAt.replace('T', '-');
  const liveOpenOffset = Number(getVariableValueByKey('attendance_open_offset_min'));
  const openOffsetMin = Number(
    (!Number.isNaN(liveOpenOffset) ? liveOpenOffset : '') ||
    (variableConfig && variableConfig.attendance_open_offset_min) ||
    (scheduleDefaults && scheduleDefaults.attendance_open_offset_min) ||
    -30
  );
  const start = new Date(startAt);
  const open = new Date(start.getTime() + openOffsetMin * 60 * 1000);
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

  preview.innerHTML = `
    회차 키: <strong>${escapeHtml(key)}</strong><br>
    출석 오픈: ${escapeHtml(fmt(open))} (${openOffsetMin}분)<br>
    종료 입력: ${endAt ? escapeHtml(endAt) : '미입력(기본 마감 규칙 적용)'}
  `;
}

async function requestScheduleDelete(options) {
  try {
    const response = await CloudClubApi.call('scheduleDelete', {
      season: options.season,
      sessionKey: options.sessionKey,
      forceDelete: options.forceDelete ? 'true' : 'false',
      confirmSessionKey: options.confirmSessionKey || '',
      adminToken
    });

    if (!response.success) {
      if (response.errorCode === 'SCHEDULE_DELETE_HAS_ATTENDANCE') {
        openScheduleDeleteForceModal({
          season: options.season,
          sessionKey: options.sessionKey,
          attendanceRecordCount: response.attendanceRecordCount || 0
        });
        return;
      }

      showBoxMessage('scheduleActionResult', `❌ ${escapeHtml(response.message || '일정 삭제 실패')}`, false);
      return;
    }

    closeScheduleCalendarModal();
    showBoxMessage('scheduleActionResult', `✅ ${escapeHtml(response.message || '일정 삭제 완료')}`, true);
    closeScheduleDeleteForceModal();

    await Promise.all([
      loadScheduleList(),
      checkAttendanceSession(),
      loadGraduationReport()
    ]);

    resetScheduleForm();
  } catch (error) {
    if (handleUnauthorizedError(error)) return;
    showBoxMessage('scheduleActionResult', `❌ ${escapeHtml(getDisplayErrorMessage(error, '일정 삭제 중 오류'))}`, false);
  }
}

function openScheduleDeleteForceModal(state) {
  scheduleDeleteForceState = state;
  const modal = document.getElementById('scheduleDeleteForceModal');
  const text = document.getElementById('scheduleDeleteForceText');
  const input = document.getElementById('scheduleDeleteForceInput');
  if (!modal || !text || !input) return;

  text.textContent = `${state.sessionKey} 회차에 ${state.attendanceRecordCount}건의 기록이 있습니다. 강제 삭제를 진행하려면 sessionKey를 정확히 입력하세요.`;
  input.value = '';
  modal.style.display = 'flex';
  setTimeout(() => input.focus(), 0);
}

const variableUsageTabOrder = [
  'QR코드 관리',
  '출석하기',
  '출석현황',
  '일정 관리',
  '변수명 관리',
  '유고 처리',
  '수료 판정'
];

const variableTabMapByKey = {
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

function getFallbackVariableMetaText(value) {
  return String(value || '').trim() || '미정(템플릿 복구 필요)';
}

function sortVariableTabsForDisplay(tabs) {
  const orderMap = {};
  variableUsageTabOrder.forEach((tab, idx) => {
    orderMap[tab] = idx;
  });

  const seen = {};
  const unique = [];
  (tabs || []).forEach(tab => {
    const t = String(tab || '').trim();
    if (!t || seen[t]) return;
    seen[t] = true;
    unique.push(t);
  });

  unique.sort((a, b) => {
    const aOrder = Object.prototype.hasOwnProperty.call(orderMap, a) ? orderMap[a] : 999;
    const bOrder = Object.prototype.hasOwnProperty.call(orderMap, b) ? orderMap[b] : 999;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.localeCompare(b, 'ko');
  });

  return unique;
}

function mapVariableUsedTabs(key, usedInText) {
  const normalizedKey = String(key || '').trim().toLowerCase();
  const usedIn = String(usedInText || '').trim();
  const tabs = ['변수명 관리'].concat(variableTabMapByKey[normalizedKey] || []);

  if (usedIn) {
    if (/getgraduationreport|evaluaterequiredsessions/i.test(usedIn)) {
      tabs.push('수료 판정', '유고 처리');
    }
    if (/getschedulelist|schedulesave|suggestscheduleendtime|defaults/i.test(usedIn)) {
      tabs.push('일정 관리');
    }
    if (/collectsessionsfromsheet|markattendance|getattendancesession|getattendancestatus|getattendanceranking/i.test(usedIn)) {
      tabs.push('출석하기', '출석현황');
    }
  }

  return sortVariableTabsForDisplay(tabs);
}

function normalizeVariableItemMeta(item) {
  const normalized = Object.assign({}, item || {});
  const appliesToRaw = normalized.appliesTo !== undefined ? normalized.appliesTo : normalized.applies_to;
  const appliesWhenRaw = normalized.appliesWhen !== undefined ? normalized.appliesWhen : normalized.applies_when;
  const usedInRaw = normalized.usedIn !== undefined ? normalized.usedIn : normalized.used_in;
  const usedTabsRaw = Array.isArray(normalized.usedTabs)
    ? normalized.usedTabs
    : (Array.isArray(normalized.used_tabs) ? normalized.used_tabs : []);
  const usedTabsTextRaw = normalized.usedTabsText !== undefined
    ? normalized.usedTabsText
    : normalized.used_tabs_text;

  const appliesTo = String(appliesToRaw || '').trim();
  const appliesWhen = String(appliesWhenRaw || '').trim();
  const usedIn = String(usedInRaw || '').trim();
  const usedTabs = usedTabsRaw.length > 0
    ? sortVariableTabsForDisplay(usedTabsRaw)
    : mapVariableUsedTabs(normalized.key, usedIn);
  const usedTabsText = String(usedTabsTextRaw || '').trim() || usedTabs.join(', ');

  normalized.appliesTo = appliesTo;
  normalized.appliesWhen = appliesWhen;
  normalized.usedIn = usedIn;
  normalized.usedTabs = usedTabs;
  normalized.usedTabsText = usedTabsText;
  return normalized;
}

function getVariableUsedInText(item) {
  if (!item) return '미정(템플릿 복구 필요)';
  const text = String(item.usedTabsText || '').trim();
  if (text) return text;

  const tabs = Array.isArray(item.usedTabs) ? item.usedTabs : mapVariableUsedTabs(item.key, item.usedIn || '');
  if (!tabs || tabs.length === 0) return '미정(템플릿 복구 필요)';
  return tabs.join(', ');
}

function closeScheduleDeleteForceModal() {
  const modal = document.getElementById('scheduleDeleteForceModal');
  if (modal) {
    modal.style.display = 'none';
  }
  scheduleDeleteForceState = null;
}

async function submitScheduleDeleteForceModal() {
  if (!scheduleDeleteForceState) return;

  const input = document.getElementById('scheduleDeleteForceInput');
  const typed = input ? input.value.trim() : '';
  const expected = scheduleDeleteForceState.sessionKey;
  if (typed !== expected) {
    alert(`sessionKey가 일치하지 않습니다. (${expected})`);
    return;
  }

  await requestScheduleDelete({
    season: scheduleDeleteForceState.season,
    sessionKey: expected,
    forceDelete: true,
    confirmSessionKey: typed
  });
}

function renderVariablesTable(items) {
  const wrap = document.getElementById('variablesTableWrap');
  if (!wrap) return;

  if (!items || items.length === 0) {
    wrap.innerHTML = '<p class="info-text">변수 데이터가 없습니다.</p>';
    return;
  }

  const rows = items.map((item, idx) => {
    const disabledAttr = item.editable ? '' : 'disabled';
    const valueText = item.value === null || item.value === undefined ? '' : String(item.value);
    const activeClass = idx === selectedVariableIndex ? 'active' : '';

    return `
      <tr class="variable-row ${activeClass}" onclick="selectVariableRow(${idx})">
        <td>${escapeHtml(item.key)}</td>
        <td>
          <input class="table-input" id="var-value-${idx}" data-key="${escapeHtml(item.key)}" data-type="${escapeHtml(item.type || 'string')}" data-description="${escapeHtml(item.description || '')}" ${disabledAttr} value="${escapeHtml(valueText)}" oninput="onVariableInputChanged(${idx}, event)">
        </td>
        <td>${escapeHtml(item.type || 'string')}</td>
        <td>${escapeHtml(item.description || '')}</td>
        <td>${escapeHtml(getFallbackVariableMetaText(item.appliesTo))}</td>
        <td>${escapeHtml(getFallbackVariableMetaText(item.appliesWhen))}</td>
        <td>${escapeHtml(getVariableUsedInText(item))}</td>
        <td>${item.editable ? 'Y' : 'N'}</td>
        <td>${escapeHtml(item.updatedAt || '')}</td>
      </tr>
    `;
  }).join('');

  wrap.innerHTML = `
    <table class="management-table">
      <thead>
        <tr>
          <th>key</th>
          <th>value</th>
          <th>type</th>
          <th>description</th>
          <th>적용 위치</th>
          <th>적용 시점</th>
          <th>실제 사용처</th>
          <th>editable</th>
          <th>updated_at</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

function getVariableInputValue(idx) {
  const input = document.getElementById(`var-value-${idx}`);
  return input ? input.value : '';
}

function getVariableValueByKey(key) {
  const index = variableItems.findIndex(item => item.key === key);
  if (index === -1) return '';
  return getVariableInputValue(index);
}

function renderVariableHelpPanel(item) {
  const panel = document.getElementById('variablesHelpPanel');
  if (!panel) return;

  if (!item) {
    panel.innerHTML = `
      <h4>변수를 선택하면 설명이 표시됩니다.</h4>
      <p class="help-muted">값을 바꾸기 전에 “이 값이 어디에 적용되는지”를 먼저 확인하세요.</p>
    `;
    return;
  }

  const value = getVariableInputValue(selectedVariableIndex);
  const hasTimePreview = ['attendance_open_offset_min', 'late_threshold_min', 'absence_threshold_min'].indexOf(item.key) !== -1;
  let previewHtml = '';

  if (hasTimePreview) {
    const openOffsetMin = Number(getVariableValueByKey('attendance_open_offset_min') || -30);
    const lateThresholdMin = Number(getVariableValueByKey('late_threshold_min') || 50);
    const absenceThresholdMin = Number(getVariableValueByKey('absence_threshold_min') || 180);
    const base = new Date('2026-01-01T19:00:00');
    const openTime = new Date(base.getTime() + openOffsetMin * 60 * 1000);
    const onTimeDeadline = new Date(base.getTime() + lateThresholdMin * 60 * 1000);
    const lateDeadline = new Date(base.getTime() + absenceThresholdMin * 60 * 1000);
    const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

    previewHtml = `
      <p><strong>시간 미리보기 (기준 시작시각 19:00)</strong></p>
      <p>출석 오픈: ${hhmm(openTime)} / 정시 경계: ${hhmm(onTimeDeadline)} / 기본 마감: ${hhmm(lateDeadline)}</p>
    `;
  }

  panel.innerHTML = `
    <h4>${escapeHtml(item.labelKo || item.key)}</h4>
    <p><strong>현재 입력값:</strong> ${escapeHtml(value || '(빈값)')}</p>
    <p><strong>설정 주체:</strong> 운영자(관리자)</p>
    <p><strong>설정 위치:</strong> 관리자 페이지 &gt; 변수명 관리 탭</p>
    <p><strong>어떤 효과:</strong> ${escapeHtml(getFallbackVariableMetaText(item.appliesTo))}</p>
    <p><strong>언제 반영:</strong> ${escapeHtml(getFallbackVariableMetaText(item.appliesWhen))}</p>
    <p><strong>실제 사용처:</strong> ${escapeHtml(getVariableUsedInText(item))}</p>
    <p><strong>영향 범위:</strong> 저장 즉시 계산 기준이 갱신됩니다. 이미 확정된 과거 회차는 메타 스냅샷 기준을 유지합니다.</p>
    <p><strong>설명:</strong> ${escapeHtml(item.description || '-')}</p>
    <p><strong>공식:</strong> ${escapeHtml(item.formula || '-')}</p>
    <p><strong>예시:</strong> ${escapeHtml(item.example || '-')}</p>
    <p><strong>검증 규칙:</strong> ${escapeHtml(item.validationText || '-')}</p>
    ${previewHtml}
  `;
}

function selectVariableRow(index) {
  selectedVariableIndex = index;
  const rows = document.querySelectorAll('#variablesTableWrap .variable-row');
  rows.forEach((row, idx) => {
    row.classList.toggle('active', idx === index);
  });
  renderVariableHelpPanel(variableItems[index] || null);
}

function onVariableInputChanged(index) {
  if (selectedVariableIndex === index) {
    renderVariableHelpPanel(variableItems[index] || null);
  }
  if (variableItems[index] && variableItems[index].key === 'absence_threshold_min') {
    updateSchedulePreview();
  }
  if (variableItems[index] && variableItems[index].key === 'attendance_open_offset_min') {
    updateSchedulePreview();
  }
}

function validateVariableDraft(item, value) {
  const validation = item.validation || null;
  const text = String(value === undefined || value === null ? '' : value).trim();

  if (!validation || !validation.kind) return { valid: true };

  if (validation.kind === 'number') {
    if (text === '') {
      if (validation.allowEmpty) return { valid: true };
      return { valid: false, message: `${item.key}: 빈값을 허용하지 않습니다.` };
    }

    const n = Number(text);
    if (Number.isNaN(n)) {
      return { valid: false, message: `${item.key}: 숫자값을 입력하세요.` };
    }
    if (validation.min !== undefined && n < validation.min) {
      return { valid: false, message: `${item.key}: ${validation.min} 이상이어야 합니다.` };
    }
    if (validation.max !== undefined && n > validation.max) {
      return { valid: false, message: `${item.key}: ${validation.max} 이하여야 합니다.` };
    }
    return { valid: true };
  }

  if (validation.kind === 'hhmm') {
    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(text)) {
      return { valid: false, message: `${item.key}: HH:mm 형식으로 입력하세요. (예: 19:00)` };
    }
    return { valid: true };
  }

  if (validation.kind === 'required_positions') {
    const list = text.split(',').map(v => v.trim().toLowerCase()).filter(v => !!v);
    if (!list.length || list.some(v => v !== 'first' && v !== 'last')) {
      return { valid: false, message: `${item.key}: first,last 조합만 허용됩니다.` };
    }
    return { valid: true };
  }

  return { valid: true };
}

async function maybeAutoNormalizeVariableSheet(response) {
  if (variableAutoNormalizedOnce) {
    return response;
  }

  const stats = response && response.stats ? response.stats : {};
  const duplicateRemovedCount = Number(stats.duplicateRemovedCount || 0);
  const invalidValueDroppedCount = Number(stats.invalidValueDroppedCount || 0);

  if (duplicateRemovedCount <= 0 && invalidValueDroppedCount <= 0) {
    return response;
  }

  variableAutoNormalizedOnce = true;

  const normalized = await CloudClubApi.call('variablesNormalize', {
    adminToken
  });

  if (!normalized.success) {
    showBoxMessage('variablesResult', `❌ ${escapeHtml(normalized.message || '변수 정규화 실패')}`, false);
    return response;
  }

  showBoxMessage(
    'variablesResult',
    `✅ 변수 시트 자동 정규화 완료 (중복 ${normalized.duplicateRemovedCount || 0}건, 무효값 ${normalized.invalidValueDroppedCount || 0}건)`,
    true
  );
  showToast('<i class="fas fa-check-circle"></i> 변수 시트 자동 정규화 완료', true);

  const refreshed = await CloudClubApi.call('variablesGet', {
    adminToken
  });
  return refreshed;
}

async function loadVariables() {
  try {
    const isCompatible = await ensureVariableApiCompatibility();
    if (!isCompatible) {
      return;
    }

    const rawResponse = await CloudClubApi.call('variablesGet', {
      adminToken
    });
    const response = await maybeAutoNormalizeVariableSheet(rawResponse);

    if (!response.success) {
      document.getElementById('variablesTableWrap').innerHTML = `<div class="error">${escapeHtml(response.message || '변수 조회 실패')}</div>`;
      return;
    }

    variableItems = (response.items || []).map(item => normalizeVariableItemMeta(item));
    variableConfig = response.config || {};
    selectedVariableIndex = variableItems.length > 0 ? 0 : -1;
    renderVariablesTable(variableItems);
    if (selectedVariableIndex >= 0) {
      selectVariableRow(selectedVariableIndex);
    } else {
      renderVariableHelpPanel(null);
    }
    updateSchedulePreview();
  } catch (error) {
    if (handleUnauthorizedError(error)) return;
    if (error && error.code === 'UNSUPPORTED_ACTION') {
      setVariableTabBlocked(
        true,
        '변수 API 일부가 구버전입니다. Apps Script 재배포 후 GitHub Pages를 다시 배포하세요.',
        variableApiInfo || {}
      );
      return;
    }
    document.getElementById('variablesTableWrap').innerHTML = `<div class="error">${escapeHtml(getDisplayErrorMessage(error, '변수 조회 중 오류'))}</div>`;
  }
}

async function saveVariables() {
  if (variableTabBlocked) {
    alert('백엔드 구버전으로 변수 저장이 차단되었습니다. Apps Script와 GitHub Pages를 재배포하세요.');
    return;
  }

  if (!variableItems || variableItems.length === 0) {
    alert('저장할 변수 데이터가 없습니다.');
    return;
  }

  try {
    const payload = [];
    variableItems.forEach((item, idx) => {
      if (item.editable === false) return;
      const input = document.getElementById(`var-value-${idx}`);
      const value = input ? input.value : item.value;

      const validation = validateVariableDraft(item, value);
      if (!validation.valid) {
        throw new Error(validation.message || `${item.key} 값이 올바르지 않습니다.`);
      }

      payload.push({
        key: item.key,
        value
      });
    });

    const response = await CloudClubApi.call('variablesUpdate', {
      adminToken,
      itemsJson: JSON.stringify(payload)
    });

    if (!response.success) {
      showBoxMessage('variablesResult', `❌ ${escapeHtml(response.message || '변수 저장 실패')}`, false);
      return;
    }

    showBoxMessage('variablesResult', '✅ 변수 저장 완료', true);
    showToast('<i class="fas fa-check-circle"></i> 변수 저장 완료', true);

    await Promise.all([
      loadVariables(),
      checkAttendanceSession(),
      loadGraduationReport()
    ]);
  } catch (error) {
    if (handleUnauthorizedError(error)) return;
    showBoxMessage('variablesResult', `❌ ${escapeHtml(getDisplayErrorMessage(error, '변수 저장 중 오류'))}`, false);
  }
}

async function resetVariablesTemplate(mode) {
  if (variableTabBlocked) {
    alert('백엔드 구버전으로 템플릿 복구가 차단되었습니다. Apps Script와 GitHub Pages를 재배포하세요.');
    return;
  }

  const resetMode = mode === 'reset' ? 'reset' : 'preserve';
  const confirmMessage = resetMode === 'reset'
    ? '정말 변수 템플릿을 완전 초기화할까요? 현재 value 값이 기본값으로 바뀝니다.'
    : '변수 템플릿 메타(설명/적용 위치/사용처)를 표준값으로 복구할까요? value는 유지됩니다.';
  if (!confirm(confirmMessage)) return;

  try {
    const response = await CloudClubApi.call('variablesResetTemplate', {
      adminToken,
      mode: resetMode
    });

    if (!response.success) {
      showBoxMessage('variablesResult', `❌ ${escapeHtml(response.message || '변수 템플릿 복구 실패')}`, false);
      return;
    }

    showBoxMessage('variablesResult', `✅ ${escapeHtml(response.message || '변수 템플릿 복구 완료')}`, true);
    showToast('<i class="fas fa-check-circle"></i> 변수 템플릿 반영 완료', true);

    await Promise.all([
      loadVariables(),
      checkAttendanceSession(),
      loadGraduationReport()
    ]);
  } catch (error) {
    if (handleUnauthorizedError(error)) return;
    showBoxMessage('variablesResult', `❌ ${escapeHtml(getDisplayErrorMessage(error, '변수 템플릿 복구 중 오류'))}`, false);
  }
}

async function loadMembers(options) {
  const opts = options || {};
  const season = String(opts.seasonAlias || getSelectedSeasonAlias() || '').trim();
  const force = !!opts.force;
  if (!season) return [];

  const canReuse = !force
    && manualApproveState.seasonAlias === season
    && Array.isArray(membersCache)
    && membersCache.length > 0;
  if (canReuse) {
    return membersCache;
  }

  try {
    const response = await CloudClubApi.call('members', {
      season,
      adminToken
    });

    if (!response.success) {
      membersCache = [];
      return [];
    }

    membersCache = response.members || [];
    manualApproveState.seasonAlias = season;
    return membersCache;
  } catch (error) {
    if (handleUnauthorizedError(error)) return [];
    console.error('회원 목록 로딩 실패:', error);
    membersCache = [];
    return [];
  }
}

function getMemberStatusChip(member) {
  if (member.isGraduated) {
    return '<span class="status-chip pass">수료확정</span>';
  }

  if (member.isGraduationPossible) {
    return '<span class="status-chip possible">수료가능</span>';
  }

  return '<span class="status-chip fail">수료불가</span>';
}

function renderGraduationSummary(report) {
  const node = document.getElementById('graduationSummary');
  if (!node) return;

  const v = report.variables || {};

  node.innerHTML = `
    <div class="attendance-info">
      <h3>${escapeHtml(report.seasonAlias || '')} 수료 규칙</h3>
      <div class="attendance-stats" style="gap:16px; flex-wrap: wrap;">
        <div class="stat-item">
          <div class="stat-label">최소 출석</div>
          <div class="stat-value">${v.required_attendance_count}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">지각 환산</div>
          <div class="stat-value">${v.late_to_absence_ratio}:1</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">결석환산 상한</div>
          <div class="stat-value">${v.max_absence_equivalent}</div>
        </div>
        <div class="stat-item">
          <div class="stat-label">필참 회차</div>
          <div class="stat-value">${escapeHtml(v.required_session_positions || '')}</div>
        </div>
      </div>
      <p class="info-text" style="margin-top: 10px;">회차 수: ${report.sessions ? report.sessions.length : 0}회 / 생성 시각: ${formatDateTimeFromMs(report.generatedAt)}</p>
    </div>
  `;
}

function getGraduationSortDefaultDirection(key) {
  if (key === 'name' || key === 'phone') return 'asc';
  if (key === 'absenceEquivalent') return 'asc';
  return 'desc';
}

function setGraduationSort(key) {
  if (!key) return;

  if (graduationSortState.key === key) {
    graduationSortState.direction = graduationSortState.direction === 'asc' ? 'desc' : 'asc';
  } else {
    graduationSortState.key = key;
    graduationSortState.direction = getGraduationSortDefaultDirection(key);
  }

  graduationVisibleCount = 20;
  if (graduationReportCache) {
    renderGraduationTable(graduationReportCache);
    renderGraduationMatrix(graduationReportCache);
  }
}

function getGraduationSortIndicator(key) {
  if (graduationSortState.key !== key) {
    return '<span class="sort-indicator">↕</span>';
  }
  return graduationSortState.direction === 'asc'
    ? '<span class="sort-indicator active">↑</span>'
    : '<span class="sort-indicator active">↓</span>';
}

function renderGraduationSortableHeader(key, label) {
  return `
    <button type="button" class="table-sort-btn" onclick="setGraduationSort('${key}')">
      <span>${escapeHtml(label)}</span>
      ${getGraduationSortIndicator(key)}
    </button>
  `;
}

function renderGraduationTable(report) {
  const wrap = document.getElementById('graduationTableWrap');
  const loadMoreWrap = document.getElementById('graduationLoadMoreWrap');
  if (!wrap) return;

  const members = getSortedGraduationMembers(report);
  if (members.length === 0) {
    wrap.innerHTML = '<p class="info-text">회원 데이터가 없습니다.</p>';
    if (loadMoreWrap) loadMoreWrap.innerHTML = '';
    return;
  }

  const visibleMembers = members.slice(0, graduationVisibleCount);
  const rows = visibleMembers.map(member => `
    <tr>
      <td><span class="grade-badge">${escapeHtml(member.seasonLabel || member.grade || '-')}</span>${escapeHtml(member.name)}</td>
      <td>${escapeHtml(member.phone)}</td>
      <td>${member.attendanceRate}%</td>
      <td>${member.attendedCount}</td>
      <td>${member.lateCount}</td>
      <td>${member.absentCount}</td>
      <td>${member.excusedCount}</td>
      <td>${member.absenceEquivalent}</td>
      <td>${getMemberStatusChip(member)}</td>
    </tr>
  `).join('');

  wrap.innerHTML = `
    <table class="management-table">
      <thead>
        <tr>
          <th>${renderGraduationSortableHeader('name', '회원')}</th>
          <th>${renderGraduationSortableHeader('phone', '연락처')}</th>
          <th>${renderGraduationSortableHeader('attendanceRate', '출석률')}</th>
          <th>${renderGraduationSortableHeader('attendedCount', '출석')}</th>
          <th>${renderGraduationSortableHeader('lateCount', '지각')}</th>
          <th>${renderGraduationSortableHeader('absentCount', '결석')}</th>
          <th>${renderGraduationSortableHeader('excusedCount', '유고')}</th>
          <th>${renderGraduationSortableHeader('absenceEquivalent', '결석환산')}</th>
          <th>${renderGraduationSortableHeader('status', '판정')}</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;

  if (loadMoreWrap) {
    if (visibleMembers.length < members.length) {
      loadMoreWrap.innerHTML = `
        <button type="button" class="btn btn-secondary" onclick="loadMoreGraduationMembers()">
          <i class="fas fa-chevron-down"></i>
          <span>20명 더 보기 (${visibleMembers.length}/${members.length})</span>
        </button>
      `;
    } else {
      loadMoreWrap.innerHTML = `<p class="info-text">총 ${members.length}명 표시 완료</p>`;
    }
  }
}

function loadMoreGraduationMembers() {
  graduationVisibleCount += 20;
  if (graduationReportCache) {
    renderGraduationTable(graduationReportCache);
  }
}

function getMemberAttendanceRate(member) {
  if (typeof member.attendanceRate === 'number') {
    return member.attendanceRate;
  }
  const denominator = Number(member.effectivePastCount || 0);
  if (denominator <= 0) return 0;
  return Math.round((Number(member.attendedCount || 0) / denominator) * 100);
}

function getGraduationStatusScore(member) {
  if (member.isGraduated) return 3;
  if (member.isGraduationPossible) return 2;
  return 1;
}

function getGraduationSortValue(member, key) {
  switch (key) {
    case 'name':
      return String(member.name || '').toLowerCase();
    case 'phone':
      return String(member.phone || '');
    case 'attendanceRate':
      return Number(member.attendanceRate || 0);
    case 'attendedCount':
      return Number(member.attendedCount || 0);
    case 'lateCount':
      return Number(member.lateCount || 0);
    case 'absentCount':
      return Number(member.absentCount || 0);
    case 'excusedCount':
      return Number(member.excusedCount || 0);
    case 'absenceEquivalent':
      return Number(member.absenceEquivalent || 0);
    case 'status':
      return getGraduationStatusScore(member);
    default:
      return Number(member.attendedCount || 0);
  }
}

function getSortedGraduationMembers(report) {
  const list = (report.members || []).slice();
  list.forEach(member => {
    member.attendanceRate = getMemberAttendanceRate(member);
  });

  const sortKey = graduationSortState.key || 'attendedCount';
  const directionFactor = graduationSortState.direction === 'asc' ? 1 : -1;

  list.sort((a, b) => {
    const aValue = getGraduationSortValue(a, sortKey);
    const bValue = getGraduationSortValue(b, sortKey);

    if (aValue !== bValue) {
      if (typeof aValue === 'string' || typeof bValue === 'string') {
        return String(aValue).localeCompare(String(bValue), 'ko') * directionFactor;
      }
      return (aValue > bValue ? 1 : -1) * directionFactor;
    }

    if (b.attendedCount !== a.attendedCount) {
      return b.attendedCount - a.attendedCount;
    }
    if (b.attendanceRate !== a.attendanceRate) {
      return b.attendanceRate - a.attendanceRate;
    }
    if (a.absenceEquivalent !== b.absenceEquivalent) {
      return a.absenceEquivalent - b.absenceEquivalent;
    }
    return String(a.name || '').localeCompare(String(b.name || ''));
  });

  return list;
}

function getMatrixCellLabel(status) {
  switch (status) {
    case 'on_time':
      return '출석';
    case 'late':
      return '지각';
    case 'excused':
      return '유고';
    case 'absent':
      return '결석';
    default:
      return '예정';
  }
}

function setExcusedSearchKeyword(value) {
  excusedSearchKeyword = String(value || '').trim().toLowerCase();
  if (graduationReportCache) {
    renderGraduationMatrix(graduationReportCache);
  }
}

function setExcusedAbsentOnly(value) {
  excusedAbsentOnly = !!value;
  if (graduationReportCache) {
    renderGraduationMatrix(graduationReportCache);
  }
}

function getFilteredExcusedMembers(report) {
  const members = getSortedGraduationMembers(report);
  const query = excusedSearchKeyword;

  return members.filter(member => {
    if (excusedAbsentOnly) {
      const hasAbsent = (member.details || []).some(detail => detail.status === 'absent');
      if (!hasAbsent) return false;
    }

    if (!query) return true;

    const name = String(member.name || '').toLowerCase();
    const grade = String(member.seasonLabel || member.grade || '').toLowerCase();
    const phone = String(member.phone || '').toLowerCase();
    return name.includes(query) || grade.includes(query) || phone.includes(query);
  });
}

function syncExcusedFilterUi() {
  const keywordInput = document.getElementById('excusedMemberSearch');
  const absentOnly = document.getElementById('excusedAbsentOnly');
  if (keywordInput && keywordInput.value !== excusedSearchKeyword) {
    keywordInput.value = excusedSearchKeyword;
  }
  if (absentOnly && absentOnly.checked !== excusedAbsentOnly) {
    absentOnly.checked = excusedAbsentOnly;
  }
}

function renderGraduationMatrix(report) {
  const wrap = document.getElementById('excusedMatrixWrap');
  const meta = document.getElementById('excusedFilterMeta');
  if (!wrap) return;

  const sessions = report.sessions || [];
  const allMembers = getSortedGraduationMembers(report);
  const members = getFilteredExcusedMembers(report);

  syncExcusedFilterUi();
  if (meta) {
    meta.textContent = `표시 ${members.length}명 / 전체 ${allMembers.length}명`;
  }

  if (sessions.length === 0 || members.length === 0) {
    wrap.innerHTML = '<p class="info-text">조건에 맞는 회원이 없습니다.</p>';
    return;
  }

  const headCells = sessions.map(session => {
    const requiredMark = session.isRequired ? ' *' : '';
    return `<th>${escapeHtml(session.sessionKey)}${requiredMark}</th>`;
  }).join('');

  const bodyRows = members.map(member => {
    const detailMap = {};
    (member.details || []).forEach(detail => {
      detailMap[detail.sessionKey] = detail;
    });

    const cells = sessions.map(session => {
      const detail = detailMap[session.sessionKey] || { status: 'future', note: '' };
      const status = detail.status || 'future';
      const label = getMatrixCellLabel(status);
      const disabled = status === 'future' ? 'disabled' : '';

      return `
        <td>
          <button
            type="button"
            class="matrix-cell ${status}"
            data-phone="${escapeHtml(member.phone)}"
            data-name="${escapeHtml(member.name)}"
            data-session-key="${escapeHtml(session.sessionKey)}"
            data-session-date="${escapeHtml(session.date)}"
            data-status="${escapeHtml(status)}"
            data-note="${escapeHtml(detail.note || '')}"
            onclick="onMatrixCellClick(event)"
            ${disabled}
          >${label}</button>
        </td>
      `;
    }).join('');

    return `
      <tr>
        <td class="sticky-col">
          <span class="grade-badge">${escapeHtml(member.seasonLabel || member.grade || '-')}</span>${escapeHtml(member.name)}<br>
          <span style="color:#93bbfc; font-size:11px;">${escapeHtml(member.phone)}</span>
        </td>
        ${cells}
      </tr>
    `;
  }).join('');

  wrap.innerHTML = `
    <table class="matrix-table">
      <thead>
        <tr>
          <th class="sticky-col">회원/연락처</th>
          ${headCells}
        </tr>
      </thead>
      <tbody>
        ${bodyRows}
      </tbody>
    </table>
  `;
}

async function loadGraduationReport() {
  const season = getSelectedSeasonAlias();
  if (!season) return;

  const tableWrap = document.getElementById('graduationTableWrap');
  const matrixWrap = document.getElementById('excusedMatrixWrap');
  const loadMoreWrap = document.getElementById('graduationLoadMoreWrap');
  const matrixMeta = document.getElementById('excusedFilterMeta');

  if (tableWrap) tableWrap.innerHTML = '<div class="loader" style="margin: 24px auto;"></div>';
  if (matrixWrap) matrixWrap.innerHTML = '<div class="loader" style="margin: 24px auto;"></div>';
  if (loadMoreWrap) loadMoreWrap.innerHTML = '';
  if (matrixMeta) matrixMeta.textContent = '불러오는 중...';

  try {
    const response = await CloudClubApi.call('graduationReport', {
      season,
      adminToken
    });

    if (!response.success) {
      if (tableWrap) tableWrap.innerHTML = `<div class="error">${escapeHtml(response.message || '수료 판정 조회 실패')}</div>`;
      if (matrixWrap) matrixWrap.innerHTML = '';
      if (loadMoreWrap) loadMoreWrap.innerHTML = '';
      if (matrixMeta) matrixMeta.textContent = '표시 0명 / 전체 0명';
      return;
    }

    graduationReportCache = response;
    graduationVisibleCount = 20;

    renderGraduationSummary(response);
    renderGraduationTable(response);
    renderGraduationMatrix(response);
  } catch (error) {
    if (handleUnauthorizedError(error)) return;
    if (tableWrap) tableWrap.innerHTML = `<div class="error">${escapeHtml(getDisplayErrorMessage(error, '수료 판정 조회 중 오류'))}</div>`;
    if (matrixWrap) matrixWrap.innerHTML = '';
    if (loadMoreWrap) loadMoreWrap.innerHTML = '';
    if (matrixMeta) matrixMeta.textContent = '표시 0명 / 전체 0명';
  }
}

function openExcuseModal(state) {
  excuseModalState = state;

  const modal = document.getElementById('excuseModal');
  const target = document.getElementById('excuseModalTargetText');
  const input = document.getElementById('excuseCommentInput');

  if (!modal || !target || !input) return;

  target.textContent = `${state.memberName} / ${state.sessionKey} 에 유고 사유를 저장합니다.`;
  input.value = state.note || '';
  modal.style.display = 'flex';
  setTimeout(() => input.focus(), 0);
}

function closeExcuseModal() {
  const modal = document.getElementById('excuseModal');
  if (modal) {
    modal.style.display = 'none';
  }
  excuseModalState = null;
}

async function submitExcuseModal() {
  if (!excuseModalState) return;

  const input = document.getElementById('excuseCommentInput');
  const comment = input ? input.value.trim() : '';
  const preview = await applyExcusedChange({
    phone: excuseModalState.phone,
    sessionKey: excuseModalState.sessionKey,
    enabled: true,
    comment,
    previewOnly: true
  });

  if (!preview) return;

  if (!preview.success && preview.errorCode === 'EXCUSE_OVERRIDE_CONFIRM_REQUIRED') {
    const warningConfirmed = excuseModalState.preWarned
      ? true
      : confirm('이미 출석/지각 기록이 있습니다. 정말 유고로 덮어쓸까요?');
    if (!warningConfirmed) {
      return;
    }

    excuseOverrideState = {
      phone: excuseModalState.phone,
      sessionKey: excuseModalState.sessionKey,
      memberName: excuseModalState.memberName,
      comment: comment,
      existingStatus: preview.existingStatus || '',
      existingTime: preview.existingTime || '',
      existingNote: preview.existingNote || ''
    };

    closeExcuseModal();
    openExcuseOverrideModal(excuseOverrideState);
    return;
  }

  if (!preview.success) {
    return;
  }

  const response = await applyExcusedChange({
    phone: excuseModalState.phone,
    sessionKey: excuseModalState.sessionKey,
    enabled: true,
    comment
  });

  if (response && response.success) {
    closeExcuseModal();
  }
}

function openExcuseOverrideModal(state) {
  const modal = document.getElementById('excuseOverrideModal');
  const summary = document.getElementById('excuseOverrideSummaryText');
  const input = document.getElementById('excuseOverrideConfirmInput');
  if (!modal || !summary || !input) return;

  const statusText = state.existingStatus === 'on_time'
    ? '출석'
    : (state.existingStatus === 'late'
      ? '지각'
      : (state.existingStatus === 'recorded' ? '기록됨' : state.existingStatus));
  const noteText = state.existingNote ? ` / 기존 메모: ${state.existingNote}` : '';
  summary.textContent = `${state.memberName} / ${state.sessionKey} 기존 기록: ${statusText || '-'} ${state.existingTime || ''}${noteText}`;
  input.value = '';
  modal.style.display = 'flex';
  setTimeout(() => input.focus(), 0);
}

function closeExcuseOverrideModal() {
  const modal = document.getElementById('excuseOverrideModal');
  if (modal) {
    modal.style.display = 'none';
  }
  excuseOverrideState = null;
}

async function submitExcuseOverrideModal() {
  if (!excuseOverrideState) return;

  const input = document.getElementById('excuseOverrideConfirmInput');
  const typed = input ? input.value.trim() : '';
  if (typed !== '유고처리') {
    alert('확인 문구가 일치하지 않습니다. "유고처리"를 정확히 입력해주세요.');
    return;
  }

  const response = await applyExcusedChange({
    phone: excuseOverrideState.phone,
    sessionKey: excuseOverrideState.sessionKey,
    enabled: true,
    comment: excuseOverrideState.comment,
    forceOverride: true
  });

  if (response && response.success) {
    closeExcuseOverrideModal();
  }
}

async function onMatrixCellClick(event) {
  const btn = event.currentTarget;
  if (!btn || btn.disabled) return;

  const status = btn.dataset.status;
  const phone = btn.dataset.phone;
  const memberName = btn.dataset.name;
  const sessionKey = btn.dataset.sessionKey;
  const note = btn.dataset.note || '';

  if (!phone || !sessionKey) return;

  if (status === 'excused') {
    if (!confirm(`${memberName} / ${sessionKey} 유고를 해제하시겠습니까?`)) {
      return;
    }

    await applyExcusedChange({
      phone,
      sessionKey,
      enabled: false,
      comment: ''
    });
    return;
  }

  if (status === 'on_time' || status === 'late') {
    const confirmed = confirm(`${memberName}님은 이미 ${status === 'on_time' ? '출석' : '지각'} 상태입니다. 정말 유고 처리하시겠습니까?`);
    if (!confirmed) {
      return;
    }
  }

  openExcuseModal({
    phone,
    sessionKey,
    memberName,
    note,
    preWarned: status === 'on_time' || status === 'late'
  });
}

async function applyExcusedChange(payload) {
  const season = getSelectedSeasonAlias();
  if (!season) {
    alert('시즌 정보가 없습니다.');
    return null;
  }

  try {
    const response = await CloudClubApi.call('excusedSet', {
      season,
      phone: payload.phone,
      sessionKey: payload.sessionKey,
      enabled: payload.enabled ? 'true' : 'false',
      comment: payload.comment || '',
      previewOnly: payload.previewOnly ? 'true' : 'false',
      forceOverride: payload.forceOverride ? 'true' : 'false',
      adminToken
    });

    if (!response.success) {
      if (response.errorCode !== 'EXCUSE_OVERRIDE_CONFIRM_REQUIRED') {
        alert(response.message || '유고 처리에 실패했습니다.');
      }
      return response;
    }

    if (payload.previewOnly) {
      return response;
    }

    showToast(`<i class="fas fa-check-circle"></i> ${escapeHtml(response.message || '유고 반영 완료')}`, true);

    await Promise.all([
      loadGraduationReport(),
      loadRankings()
    ]);
    await refreshStatusDashboardIfVisible();
    return response;
  } catch (error) {
    if (handleUnauthorizedError(error)) return;
    alert(getDisplayErrorMessage(error, '유고 처리 중 오류가 발생했습니다.'));
    return null;
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initializeDashboard().catch((error) => {
    alert(getDisplayErrorMessage(error, '초기화 중 오류가 발생했습니다.'));
    console.error(error);
  });
});
