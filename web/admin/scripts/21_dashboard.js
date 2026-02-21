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

function buildAttendanceDashboardFetchKey(season, filterParams) {
  const params = filterParams || {};
  return [
    String(season || ''),
    String(params.group || 'all'),
    String(params.dateFrom || ''),
    String(params.dateTo || ''),
    String(params.sessionKeysCsv || ''),
    String(params.topN || ''),
    String(params.sortBy || ''),
    String(params.chartType || '')
  ].join('|');
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

  const filteredSignature = filtered.map(item => `${item.sessionKey}:${item.isClosed ? 1 : 0}`).join('|');
  const selectedSignature = selectedKeys.join('|');
  const renderSignature = [
    attendanceDashboardState.sessionSearch || '',
    selectedSignature,
    filteredSignature,
    allSessions.length,
    filtered.length
  ].join('::');
  if (
    renderSignature === attendanceDashboardSessionPickerRenderSignature
    && attendanceDashboardSessionPickerLastOptionsRef === allSessions
  ) {
    return;
  }
  attendanceDashboardSessionPickerRenderSignature = renderSignature;
  attendanceDashboardSessionPickerLastOptionsRef = allSessions;

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

  const filteredSignature = filtered.map(item => item.memberKey).join('|');
  const selectedSignature = selectedKeys.join('|');
  const renderSignature = [
    attendanceDashboardState.memberSearch || '',
    selectedSignature,
    filteredSignature,
    allOptions.length,
    filtered.length
  ].join('::');
  if (
    renderSignature === attendanceDashboardMemberPickerRenderSignature
    && attendanceDashboardMemberPickerLastOptionsRef === allOptions
  ) {
    return;
  }
  attendanceDashboardMemberPickerRenderSignature = renderSignature;
  attendanceDashboardMemberPickerLastOptionsRef = allOptions;

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

async function ensureDashboardChartLibrary() {
  if (typeof Chart !== 'undefined') {
    return true;
  }
  try {
    await ensureRuntimeDeps(['chart']);
    return typeof Chart !== 'undefined';
  } catch (error) {
    setAttendanceDashboardMetaText('Chart.js 로딩 실패: 차트 렌더를 건너뜁니다.');
    return false;
  }
}

function getDashboardChartAnimationOption() {
  return isAdminPerfUiEnabled() ? false : undefined;
}

function shouldDeferDashboardMemberTrendRender() {
  return typeof getActiveTabName === 'function' && getActiveTabName() !== 'status';
}

function flushAttendanceDashboardDeferredWork() {
  if (typeof getActiveTabName === 'function' && getActiveTabName() !== 'status') {
    return;
  }
  if (!attendanceDashboardPendingMemberTrendRender) {
    return;
  }
  attendanceDashboardPendingMemberTrendRender = false;
  renderAttendanceDashboardMemberTrendChart();
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
  if (prevChart && String(prevChart.config && prevChart.config.type || '') === 'doughnut') {
    prevChart.data.labels = labels;
    prevChart.data.datasets[0].data = values;
    prevChart.data.datasets[0].backgroundColor = colors;
    prevChart.update('none');
    return true;
  }
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
      animation: getDashboardChartAnimationOption(),
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
  const chartType = attendanceDashboardState.chartType || 'bar';

  if (
    attendanceDashboardEventRateChart
    && attendanceDashboardEventRateChart.config
    && attendanceDashboardEventRateChart.config.type === chartType
  ) {
    attendanceDashboardEventRateChart.$ccRows = rows;
    attendanceDashboardEventRateChart.data.labels = labels;
    attendanceDashboardEventRateChart.data.datasets[0].data = rates;
    attendanceDashboardEventRateChart.data.datasets[0].fill = chartType === 'line';
    attendanceDashboardEventRateChart.update('none');
    return;
  }

  if (attendanceDashboardEventRateChart) {
    attendanceDashboardEventRateChart.destroy();
    attendanceDashboardEventRateChart = null;
  }

  attendanceDashboardEventRateChart = new Chart(canvas.getContext('2d'), {
    type: chartType,
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
      animation: getDashboardChartAnimationOption(),
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
              const chartRows = context.chart && context.chart.$ccRows ? context.chart.$ccRows : [];
              const row = chartRows[context.dataIndex] || {};
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
        const chartRows = attendanceDashboardEventRateChart && attendanceDashboardEventRateChart.$ccRows
          ? attendanceDashboardEventRateChart.$ccRows
          : rows;
        const row = chartRows[index];
        if (!row || !row.sessionKey) return;
        loadAttendanceDashboardDrilldown('event', row.sessionKey);
      }
    }
  });
  attendanceDashboardEventRateChart.$ccRows = rows;
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
  const datasets = [
    { label: '출석', data: rows.map(r => Number(r.onTimeCount || 0)), backgroundColor: 'rgba(74, 222, 128, 0.75)', borderColor: '#4ade80', borderWidth: 1, stack: 'status' },
    { label: '지각', data: rows.map(r => Number(r.lateCount || 0)), backgroundColor: 'rgba(251, 191, 36, 0.75)', borderColor: '#fbbf24', borderWidth: 1, stack: 'status' },
    { label: '결석', data: rows.map(r => Number(r.absentCount || 0)), backgroundColor: 'rgba(248, 113, 113, 0.75)', borderColor: '#f87171', borderWidth: 1, stack: 'status' },
    { label: '유고', data: rows.map(r => Number(r.excusedCount || 0)), backgroundColor: 'rgba(147, 197, 253, 0.75)', borderColor: '#93c5fd', borderWidth: 1, stack: 'status' }
  ];

  if (
    attendanceDashboardEventStatusChart
    && attendanceDashboardEventStatusChart.config
    && attendanceDashboardEventStatusChart.config.type === 'bar'
  ) {
    attendanceDashboardEventStatusChart.$ccRows = rows;
    attendanceDashboardEventStatusChart.data.labels = labels;
    attendanceDashboardEventStatusChart.data.datasets = datasets;
    attendanceDashboardEventStatusChart.update('none');
    return;
  }

  if (attendanceDashboardEventStatusChart) {
    attendanceDashboardEventStatusChart.destroy();
    attendanceDashboardEventStatusChart = null;
  }

  attendanceDashboardEventStatusChart = new Chart(canvas.getContext('2d'), {
    type: 'bar',
    data: {
      labels: labels,
      datasets: datasets
    },
    options: {
      animation: getDashboardChartAnimationOption(),
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
        const chartRows = attendanceDashboardEventStatusChart && attendanceDashboardEventStatusChart.$ccRows
          ? attendanceDashboardEventStatusChart.$ccRows
          : rows;
        const row = chartRows[index];
        if (!row || !row.sessionKey) return;
        loadAttendanceDashboardDrilldown('event', row.sessionKey);
      }
    }
  });
  attendanceDashboardEventStatusChart.$ccRows = rows;
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
  if (shouldDeferDashboardMemberTrendRender()) {
    attendanceDashboardPendingMemberTrendRender = true;
    return;
  }
  attendanceDashboardPendingMemberTrendRender = false;
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

  const seriesList = (await Promise.all(
    selected.map((key) => loadAttendanceDashboardMemberSeries(key)
      .then((series) => (series && series.success ? series : null))
      .catch((error) => {
        console.error('개인 시계열 로드 실패:', error);
        return null;
      }))
  )).filter(Boolean);

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

  if (
    attendanceDashboardMemberTrendChart
    && attendanceDashboardMemberTrendChart.config
    && attendanceDashboardMemberTrendChart.config.type === 'line'
  ) {
    attendanceDashboardMemberTrendChart.data.labels = labels;
    attendanceDashboardMemberTrendChart.data.datasets = datasets;
    attendanceDashboardMemberTrendChart.update('none');
    return;
  }

  if (attendanceDashboardMemberTrendChart) {
    attendanceDashboardMemberTrendChart.destroy();
    attendanceDashboardMemberTrendChart = null;
  }

  attendanceDashboardMemberTrendChart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: { labels: labels, datasets: datasets },
    options: {
      animation: getDashboardChartAnimationOption(),
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
        const dataset = attendanceDashboardMemberTrendChart
          && attendanceDashboardMemberTrendChart.data
          && Array.isArray(attendanceDashboardMemberTrendChart.data.datasets)
          ? attendanceDashboardMemberTrendChart.data.datasets[element.datasetIndex]
          : null;
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

function buildAttendanceDashboardRenderSignature(payload) {
  const safePayload = payload || {};
  const meta = safePayload.meta || {};
  const rateRows = safePayload.charts && Array.isArray(safePayload.charts.attendanceRateBySession)
    ? safePayload.charts.attendanceRateBySession
    : [];
  const statusRows = safePayload.charts && Array.isArray(safePayload.charts.statusDistributionBySession)
    ? safePayload.charts.statusDistributionBySession
    : [];
  return [
    safePayload.seasonAlias || '',
    String(meta.selectedSessionCount || 0),
    String(meta.closedSessionCount || 0),
    String((safePayload.ranking || []).length),
    String((safePayload.table && safePayload.table.eventTopRows && safePayload.table.eventTopRows.length) || 0),
    rateRows.map(row => `${row.sessionKey}:${row.attendanceRate}`).join('|'),
    statusRows.map(row => `${row.sessionKey}:${row.onTimeCount}:${row.lateCount}:${row.absentCount}:${row.excusedCount}`).join('|'),
    String(attendanceDashboardState.chartType || 'bar'),
    (attendanceDashboardState.selectedMemberKeys || []).join('|')
  ].join('::');
}

function renderAttendanceDashboard(payload) {
  const renderSignature = buildAttendanceDashboardRenderSignature(payload);
  if (renderSignature === attendanceDashboardLastRenderSignature) {
    endPerfMark(startPerfMark('render:attendance-dashboard'), { status: 'skip-same-signature' });
    return;
  }
  const perfToken = startPerfMark('render:attendance-dashboard');
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
  attendanceDashboardLastRenderSignature = renderSignature;
  endPerfMark(perfToken, { status: 'ok' });
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
  const debouncedSessionSearchRender = debounce(() => {
    renderAttendanceDashboardSessionPicker();
    saveAttendanceDashboardStateToStorage();
  }, ATTENDANCE_DASHBOARD_SEARCH_DEBOUNCE_MS);
  const debouncedMemberSearchRender = debounce(() => {
    renderAttendanceDashboardMemberPicker();
    saveAttendanceDashboardStateToStorage();
  }, ATTENDANCE_DASHBOARD_SEARCH_DEBOUNCE_MS);

  if (sessionSearchInput) {
    sessionSearchInput.addEventListener('focus', () => {
      setAttendanceDashboardPopoverOpen('session', true);
      setAttendanceDashboardPopoverOpen('member', false);
    });
    sessionSearchInput.addEventListener('input', () => {
      attendanceDashboardState.sessionSearch = sessionSearchInput.value.trim();
      setAttendanceDashboardPopoverOpen('session', true);
      debouncedSessionSearchRender();
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
      debouncedMemberSearchRender();
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
  const perfToken = startPerfMark('data:load-attendance-dashboard', {
    forceReload: !!opts.forceReload
  });

  const season = getSelectedSeasonAlias();
  if (!season) {
    setAttendanceDashboardMetaText('시즌이 선택되지 않아 대시보드를 불러올 수 없습니다.');
    endPerfMark(perfToken, { status: 'no-season' });
    return;
  }

  await ensureDashboardChartLibrary();
  collectAttendanceDashboardStateFromControls();
  saveAttendanceDashboardStateToStorage();

  const filterParams = getAttendanceDashboardApiFilterParams();
  const fetchKey = buildAttendanceDashboardFetchKey(season, filterParams);
  const now = Date.now();
  if (
    !opts.forceReload
    && attendanceDashboardPayload
    && attendanceDashboardLastFetchKey === fetchKey
    && (now - attendanceDashboardLastFetchedAt) < ATTENDANCE_DASHBOARD_FRONT_CACHE_TTL_MS
  ) {
    renderAttendanceDashboard(attendanceDashboardPayload);
    displayRankings({
      success: true,
      data: Array.isArray(attendanceDashboardPayload.ranking) ? attendanceDashboardPayload.ranking : []
    });
    setAttendanceDashboardMetaText(
      `시즌 ${attendanceDashboardPayload.seasonAlias || season} / 선택 회차 ${attendanceDashboardPayload.meta && attendanceDashboardPayload.meta.selectedSessionCount ? attendanceDashboardPayload.meta.selectedSessionCount : 0} / 종료 회차 ${attendanceDashboardPayload.meta && attendanceDashboardPayload.meta.closedSessionCount ? attendanceDashboardPayload.meta.closedSessionCount : 0} (client-cache)`
    );
    endPerfMark(perfToken, { status: 'memory-cache' });
    return;
  }

  attendanceDashboardLoading = true;
  setAttendanceDashboardMetaText('대시보드 데이터를 불러오는 중...');

  try {
    const cache = getFrontCache();
    const cacheKey = buildFrontCacheKey('dashboard:summary', fetchKey);
    const frontCached = !opts.forceReload && cache ? cache.get(cacheKey) : null;
    const params = Object.assign({
      adminToken: adminToken,
      season: season,
      disableCache: opts.forceReload ? 'true' : 'false'
    }, filterParams);
    const response = cache
      ? await cache.remember(
        cacheKey,
        ATTENDANCE_DASHBOARD_FRONT_CACHE_TTL_MS,
        () => CloudClubApi.call('attendanceDashboardSummary', params),
        { force: !!opts.forceReload }
      )
      : await CloudClubApi.call('attendanceDashboardSummary', params);

    if (!response || !response.success) {
      setAttendanceDashboardMetaText(response && response.message ? response.message : '대시보드 요약 조회 실패');
      loadRankings();
      endPerfMark(perfToken, { status: 'error-response' });
      return;
    }

    if (tryHydrateAttendanceDashboardDateRange(response, opts)) {
      attendanceDashboardLoading = false;
      endPerfMark(perfToken, { status: 'rehydrate-reload' });
      await loadAttendanceDashboard({ forceReload: true, skipAutoDateHydration: true });
      return;
    }

    attendanceDashboardPayload = response;
    attendanceDashboardDrilldownPayload = null;
    attendanceDashboardMemberSeriesCache = {};
    attendanceDashboardLastFetchKey = fetchKey;
    attendanceDashboardLastFetchedAt = Date.now();
    attendanceDashboardLastRenderSignature = '';
    renderAttendanceDashboard(response);
    displayRankings({
      success: true,
      data: Array.isArray(response.ranking) ? response.ranking : []
    });

    const fromCache = frontCached || (response.meta && response.meta.fromCache) ? ' (cache)' : '';
    const rangeMeta = response.meta && response.meta.actualAttendanceRange
      ? response.meta.actualAttendanceRange
      : {};
    const rangeLabel = rangeMeta.minAttendAt && rangeMeta.maxAttendAt
      ? ` / 실제출석 ${rangeMeta.minAttendAt} ~ ${rangeMeta.maxAttendAt}`
      : '';
    setAttendanceDashboardMetaText(
      `시즌 ${response.seasonAlias} / 선택 회차 ${response.meta && response.meta.selectedSessionCount ? response.meta.selectedSessionCount : 0} / 종료 회차 ${response.meta && response.meta.closedSessionCount ? response.meta.closedSessionCount : 0}${rangeLabel}${fromCache}`
    );
    endPerfMark(perfToken, { status: 'ok' });
  } catch (error) {
    if (handleUnauthorizedError(error)) return;
    setAttendanceDashboardMetaText(getDisplayErrorMessage(error, '대시보드 조회 중 오류가 발생했습니다.'));
    loadRankings();
    endPerfMark(perfToken, {
      status: 'exception',
      code: error && error.code ? error.code : ''
    });
  } finally {
    attendanceDashboardLoading = false;
  }
}

async function refreshStatusDashboardIfVisible() {
  if (getActiveTabName() !== 'status') return;
  await loadAttendanceDashboard({ forceReload: true });
}
