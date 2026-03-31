function getDefaultAttendanceDashboardState() {
  return {
    group: 'all',
    dateFrom: '',
    dateTo: '',
    sessionSearch: '',
    sessionKeys: [],
    sessionScopeMode: 'auto',
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
    sessionScopeMode: String(source.sessionScopeMode || '').toLowerCase() === 'manual' ? 'manual' : 'auto',
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
    if (query.has('dash_scope')) state.sessionScopeMode = query.get('dash_scope');
    if (query.has('dash_top')) state.topN = query.get('dash_top');
    if (query.has('dash_sort')) state.sortBy = query.get('dash_sort');
    if (query.has('dash_chart')) state.chartType = query.get('dash_chart');
    if (query.has('dash_members')) state.selectedMemberKeys = String(query.get('dash_members') || '').split(',').map(v => v.trim()).filter(v => !!v);
    if (query.has('dash_member_q')) state.memberSearch = query.get('dash_member_q');
    if (!state.sessionScopeMode && (state.dateFrom || state.dateTo || (state.sessionKeys && state.sessionKeys.length > 0))) {
      state.sessionScopeMode = 'manual';
    }
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
  setOrDelete('dash_scope', state.sessionScopeMode === 'manual' ? 'manual' : '');
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
    sessionScopeMode: attendanceDashboardState.sessionScopeMode || 'auto',
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

function formatDashboardPhoneDisplay(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return digits || '-';
}

function getAttendanceDashboardQuickFilterMeta() {
  const quickFilter = attendanceDashboardPayload
    && attendanceDashboardPayload.meta
    && attendanceDashboardPayload.meta.quickFilter
    ? attendanceDashboardPayload.meta.quickFilter
    : null;
  const version = Number(quickFilter && quickFilter.version || 0);
  return quickFilter && version >= 1 ? quickFilter : null;
}

function getAttendanceDashboardQuickFilterVersion() {
  const meta = getAttendanceDashboardQuickFilterMeta();
  const version = Number(meta && meta.version || 0);
  return isNaN(version) ? 0 : version;
}

function getAttendanceDashboardQuickFilterMembers() {
  const meta = getAttendanceDashboardQuickFilterMeta();
  return meta && Array.isArray(meta.members) ? meta.members : [];
}

function getDashboardStatusCodeFromKey(statusKey) {
  switch (String(statusKey || '')) {
    case 'on_time': return 'O';
    case 'late': return 'L';
    case 'absent': return 'A';
    case 'excused': return 'E';
    case 'pending': return 'P';
    default: return '-';
  }
}

function getDashboardStatusKeyFromCode(code) {
  switch (String(code || '')) {
    case 'O': return 'on_time';
    case 'L': return 'late';
    case 'A': return 'absent';
    case 'E': return 'excused';
    case 'P': return 'pending';
    default: return 'future';
  }
}

function getDashboardQuickFilterSessionCode(member, index) {
  const source = member && member.sessionCodes !== undefined && member.sessionCodes !== null
    ? member.sessionCodes
    : '';
  if (Array.isArray(source)) {
    return String(source[index] || '-');
  }
  if (typeof source === 'string') {
    return source.charAt(index) || '-';
  }
  return '-';
}

function getDashboardSeasonSortValue(value) {
  const n = Number(value);
  return isNaN(n) ? null : n;
}

function sortAttendanceDashboardSliceMembers(rows) {
  return (Array.isArray(rows) ? rows.slice() : []).sort((a, b) => {
    const aSeason = getDashboardSeasonSortValue(a && a.season);
    const bSeason = getDashboardSeasonSortValue(b && b.season);
    if (aSeason === null && bSeason !== null) return 1;
    if (aSeason !== null && bSeason === null) return -1;
    if (aSeason !== null && bSeason !== null && bSeason !== aSeason) {
      return bSeason - aSeason;
    }
    const nameDiff = String(a && a.name || '').localeCompare(String(b && b.name || ''), 'ko');
    if (nameDiff !== 0) return nameDiff;
    return String(a && a.memberKey || '').localeCompare(String(b && b.memberKey || ''));
  });
}

function getAttendanceDashboardDrilldownMode() {
  const mode = String(attendanceDashboardActiveDrilldownMode || '').trim();
  return mode === 'statusRanking' || mode === 'memberList' ? mode : '';
}

function hasAttendanceDashboardStatusRankingSupport() {
  if (getAttendanceDashboardQuickFilterVersion() < 2) {
    return false;
  }
  const members = getAttendanceDashboardQuickFilterMembers();
  const sample = members.find(Boolean);
  if (!sample) {
    return !!getAttendanceDashboardQuickFilterMeta();
  }
  return Object.prototype.hasOwnProperty.call(sample, 'onTimeCount')
    && Object.prototype.hasOwnProperty.call(sample, 'lateCount')
    && Object.prototype.hasOwnProperty.call(sample, 'absentCount')
    && Object.prototype.hasOwnProperty.call(sample, 'excusedCount')
    && Object.prototype.hasOwnProperty.call(sample, 'onTimeAvgOffsetSeconds')
    && Object.prototype.hasOwnProperty.call(sample, 'lateAvgOffsetSeconds');
}

function getDashboardStatusRankingCount(member, statusKey) {
  const source = member || {};
  switch (String(statusKey || '')) {
    case 'on_time': return Number(source.onTimeCount || 0);
    case 'late': return Number(source.lateCount || 0);
    case 'absent': return Number(source.absentCount || 0);
    case 'excused': return Number(source.excusedCount || 0);
    default: return 0;
  }
}

function getDashboardStatusRankingOffsetSeconds(member, statusKey) {
  const source = member || {};
  switch (String(statusKey || '')) {
    case 'on_time': return source.onTimeAvgOffsetSeconds;
    case 'late': return source.lateAvgOffsetSeconds;
    default: return null;
  }
}

function getDashboardStatusRankingOffsetLabel(member, statusKey) {
  const source = member || {};
  switch (String(statusKey || '')) {
    case 'on_time': return source.onTimeAvgOffset || '-';
    case 'late': return source.lateAvgOffset || '-';
    default: return '-';
  }
}

function getDashboardStatusRankingSummaryText(statusKey, count) {
  const total = Number(count || 0);
  switch (String(statusKey || '')) {
    case 'on_time':
      return `현재 대시보드 필터 기준 정시 출석 랭킹 ${total}명 / 정시 출석 횟수 내림차순, 동률이면 평균 정시 출석 오프셋이 더 빠른 순`;
    case 'late':
      return `현재 대시보드 필터 기준 지각 랭킹 ${total}명 / 지각 횟수 내림차순, 동률이면 평균 지각 오프셋이 더 늦은 순`;
    case 'absent':
      return `현재 대시보드 필터 기준 결석 랭킹 ${total}명 / 결석 횟수 내림차순`;
    case 'excused':
      return `현재 대시보드 필터 기준 유고 랭킹 ${total}명 / 유고 사용 횟수 내림차순`;
    default:
      return `현재 대시보드 필터 기준 상태별 랭킹 ${total}명`;
  }
}

function sortAttendanceDashboardStatusRankingRows(statusKey, rows) {
  const normalizedStatusKey = String(statusKey || '');
  return (Array.isArray(rows) ? rows.slice() : []).sort((a, b) => {
    const aCount = Number(a && a.count || 0);
    const bCount = Number(b && b.count || 0);
    if (bCount !== aCount) {
      return bCount - aCount;
    }

    if (normalizedStatusKey === 'on_time' || normalizedStatusKey === 'late') {
      const aRaw = a && a.offsetSeconds;
      const bRaw = b && b.offsetSeconds;
      const aMissing = aRaw === null || aRaw === undefined || isNaN(Number(aRaw));
      const bMissing = bRaw === null || bRaw === undefined || isNaN(Number(bRaw));
      if (aMissing && !bMissing) return 1;
      if (!aMissing && bMissing) return -1;
      if (!aMissing && !bMissing) {
        const aOffset = Number(aRaw);
        const bOffset = Number(bRaw);
        if (aOffset !== bOffset) {
          return normalizedStatusKey === 'late'
            ? bOffset - aOffset
            : aOffset - bOffset;
        }
      }
    }

    const nameDiff = String(a && a.name || '').localeCompare(String(b && b.name || ''), 'ko');
    if (nameDiff !== 0) return nameDiff;
    return String(a && a.memberKey || '').localeCompare(String(b && b.memberKey || ''));
  }).map((item, index) => Object.assign({}, item, { rank: index + 1 }));
}

function buildAttendanceDashboardStatusRankingRows(statusKey) {
  const normalizedStatusKey = String(statusKey || '').trim();
  return sortAttendanceDashboardStatusRankingRows(normalizedStatusKey, getAttendanceDashboardQuickFilterMembers().map(member => ({
    memberKey: member.memberKey,
    name: member.name,
    season: member.season,
    seasonLabel: member.seasonLabel,
    count: getDashboardStatusRankingCount(member, normalizedStatusKey),
    offsetSeconds: getDashboardStatusRankingOffsetSeconds(member, normalizedStatusKey),
    offsetLabel: getDashboardStatusRankingOffsetLabel(member, normalizedStatusKey)
  })).filter(row => Number(row.count || 0) > 0));
}

function clearAttendanceDashboardMemberHistoryCache() {
  attendanceDashboardMemberHistoryCache = {};
}

function resetAttendanceDashboardSliceUiState(options) {
  const opts = options || {};
  attendanceDashboardActiveSliceFilter = null;
  attendanceDashboardActiveSliceMembers = [];
  attendanceDashboardActiveStatusRankingRows = [];
  attendanceDashboardActiveDrilldownMode = '';
  if (opts.clearHistoryCache !== false) {
    clearAttendanceDashboardMemberHistoryCache();
  }
  if (opts.closeModal !== false) {
    closeAttendanceDashboardMemberHistoryModal();
  }
  if (opts.render !== false) {
    renderAttendanceDashboardSliceMembers();
  }
}

function toggleAttendanceDashboardActiveSlice(filter, members) {
  const nextId = filter && filter.id ? String(filter.id) : '';
  const currentId = attendanceDashboardActiveSliceFilter && attendanceDashboardActiveSliceFilter.id
    ? String(attendanceDashboardActiveSliceFilter.id)
    : '';
  if (nextId && nextId === currentId && getAttendanceDashboardDrilldownMode() === 'memberList') {
    resetAttendanceDashboardSliceUiState();
    return;
  }

  attendanceDashboardActiveSliceFilter = filter || null;
  attendanceDashboardActiveSliceMembers = sortAttendanceDashboardSliceMembers(members);
  attendanceDashboardActiveStatusRankingRows = [];
  attendanceDashboardActiveDrilldownMode = filter ? 'memberList' : '';
  closeAttendanceDashboardMemberHistoryModal();
  renderAttendanceDashboardSliceMembers();
}

function toggleAttendanceDashboardStatusRanking(filter, rows) {
  const nextId = filter && filter.id ? String(filter.id) : '';
  const currentId = attendanceDashboardActiveSliceFilter && attendanceDashboardActiveSliceFilter.id
    ? String(attendanceDashboardActiveSliceFilter.id)
    : '';
  if (nextId && nextId === currentId && getAttendanceDashboardDrilldownMode() === 'statusRanking') {
    resetAttendanceDashboardSliceUiState();
    return;
  }

  attendanceDashboardActiveSliceFilter = filter || null;
  attendanceDashboardActiveSliceMembers = [];
  attendanceDashboardActiveStatusRankingRows = Array.isArray(rows) ? rows.slice() : [];
  attendanceDashboardActiveDrilldownMode = filter ? 'statusRanking' : '';
  closeAttendanceDashboardMemberHistoryModal();
  renderAttendanceDashboardSliceMembers();
}

async function applyAttendanceDashboardStatusRankingSlice(statusKey, options) {
  const opts = options || {};
  if (!getAttendanceDashboardQuickFilterMeta()) {
    showToast('<i class="fas fa-info-circle"></i> 빠른 필터 인덱스를 찾을 수 없습니다. Apps Script를 먼저 배포했는지 확인해주세요.', true);
    return;
  }
  if (getAttendanceDashboardQuickFilterVersion() < 2) {
    if (!opts.skipRefreshAttempt) {
      showToast('<i class="fas fa-sync-alt"></i> 상태별 랭킹 데이터를 최신 요약으로 다시 불러오는 중입니다.', true);
      await loadAttendanceDashboard({ forceReload: true });
      return applyAttendanceDashboardStatusRankingSlice(statusKey, { skipRefreshAttempt: true });
    }
    showToast('<i class="fas fa-info-circle"></i> 상태별 랭킹 인덱스를 찾을 수 없습니다. Apps Script를 먼저 배포했는지 확인해주세요.', true);
    return;
  }
  if (!hasAttendanceDashboardStatusRankingSupport()) {
    showToast('<i class="fas fa-info-circle"></i> 상태별 랭킹 인덱스를 찾을 수 없습니다. Apps Script를 먼저 배포했는지 확인해주세요.', true);
    return;
  }

  const normalizedStatusKey = String(statusKey || '').trim();
  if (!normalizedStatusKey) return;
  const rankingRows = buildAttendanceDashboardStatusRankingRows(normalizedStatusKey);
  const statusLabel = formatDashboardStatus(normalizedStatusKey);
  const filterLabel = normalizedStatusKey === 'on_time'
    ? `${statusLabel}(정시) 랭킹`
    : `${statusLabel} 랭킹`;
  toggleAttendanceDashboardStatusRanking({
    id: `status-ranking:${normalizedStatusKey}`,
    type: 'statusRanking',
    statusKey: normalizedStatusKey,
    label: filterLabel,
    summary: getDashboardStatusRankingSummaryText(normalizedStatusKey, rankingRows.length)
  }, rankingRows);
}

function renderAttendanceDashboardSliceLoading(filter, message, options) {
  const opts = options || {};
  if (opts.preserveExistingTable && attendanceDashboardActiveSliceFilter && getAttendanceDashboardDrilldownMode() === 'memberList') {
    attendanceDashboardActiveSliceFilter = Object.assign({}, attendanceDashboardActiveSliceFilter, filter || {}, {
      summary: String(message || '드릴다운 데이터를 새로 불러오는 중입니다.').trim()
    });
    renderAttendanceDashboardSliceMembers();
    return;
  }

  attendanceDashboardActiveSliceFilter = filter || null;
  attendanceDashboardActiveSliceMembers = [];
  attendanceDashboardActiveStatusRankingRows = [];
  attendanceDashboardActiveDrilldownMode = filter ? 'memberList' : '';

  const wrap = document.getElementById('dashboardDrilldownTableWrap');
  const title = document.getElementById('dashboardDrilldownTitle');
  const summary = document.getElementById('dashboardDrilldownSummary');
  const actions = document.getElementById('dashboardDrilldownActions');
  if (!wrap || !title || !summary || !actions) return;

  title.textContent = filter && filter.label ? filter.label : '대시보드 드릴다운';
  summary.textContent = filter && filter.summary ? filter.summary : '선택한 그래프 구간에 해당하는 멤버 목록입니다.';
  actions.innerHTML = `
    <span class="dashboard-drilldown-count">로딩 중</span>
    <button type="button" class="btn btn-secondary" style="padding:6px 10px; font-size:12px;" onclick="resetAttendanceDashboardSliceUiState()">
      <i class="fas fa-rotate-left"></i>
      <span>필터 해제</span>
    </button>
  `;
  wrap.innerHTML = `<p class="info-text">${escapeHtml(message || '드릴다운 데이터를 불러오는 중입니다...')}</p>`;
}

function isAttendanceDashboardSessionOngoingByKey(sessionKey, payload) {
  const meta = getAttendanceDashboardSessionMetaByKey(sessionKey, payload);
  return !!(meta && meta.isOngoing);
}

async function loadAttendanceDashboardEventStatusMembers(sessionKey, statusKey, options) {
  const opts = options || {};
  const cacheKey = buildAttendanceDashboardEventSliceCacheKey(sessionKey);
  const cached = attendanceDashboardEventDrilldownCache[cacheKey];
  let payload = null;
  const isOngoing = isAttendanceDashboardSessionOngoingByKey(sessionKey, opts.payload);

  if (cached && (cached.isStable || (!opts.forceRefresh && cached.expiresAt > Date.now()))) {
    payload = cached.payload;
  } else {
    const season = getSelectedSeasonAlias();
    if (!season) {
      return [];
    }
    const params = Object.assign({
      adminToken: adminToken,
      season: season,
      drillType: 'event',
      key: String(sessionKey || '').trim()
    }, getAttendanceDashboardApiFilterParams());

    payload = await CloudClubApi.call('attendanceDashboardDrilldown', params);
    attendanceDashboardEventDrilldownCache[cacheKey] = {
      payload: payload,
      expiresAt: Date.now() + ATTENDANCE_DASHBOARD_MEMBER_HISTORY_CACHE_TTL_MS,
      isStable: !isOngoing
    };
  }

  const rows = payload && payload.success && Array.isArray(payload.rows) ? payload.rows : [];
  const normalizedStatusKey = String(statusKey || '').trim();
  return rows
    .filter(row => String(row && row.status || '').trim() === normalizedStatusKey)
    .map(row => {
      const quickFilterMember = getAttendanceDashboardQuickFilterMemberByKey(row.memberKey) || {};
      return Object.assign({}, quickFilterMember, row, {
        memberKey: row.memberKey || quickFilterMember.memberKey || '',
        email: quickFilterMember.email || '-',
        season: quickFilterMember.season,
        seasonLabel: row.seasonLabel || quickFilterMember.seasonLabel || '-',
        attendTimeHHMM: formatDashboardAttendClockText(row.attendTime)
      });
    });
}

async function updateAttendanceDashboardEventStatusSlice(filter, options) {
  const opts = options || {};
  const sessionKey = String(filter && filter.sessionKey || '').trim();
  const statusKey = String(filter && filter.statusKey || '').trim();
  if (!sessionKey || !statusKey) return;

  const previousMembers = Array.isArray(attendanceDashboardActiveSliceMembers)
    ? attendanceDashboardActiveSliceMembers.slice()
    : [];
  const previousFilter = attendanceDashboardActiveSliceFilter
    ? Object.assign({}, attendanceDashboardActiveSliceFilter)
    : null;

  renderAttendanceDashboardSliceLoading(
    filter,
    opts.loadingMessage || `${sessionKey} / ${formatDashboardStatus(statusKey)} 멤버 목록을 불러오는 중입니다...`,
    { preserveExistingTable: !!opts.preserveExistingTable }
  );

  try {
    const matchedMembers = await loadAttendanceDashboardEventStatusMembers(sessionKey, statusKey, {
      forceRefresh: !!opts.forceRefresh,
      payload: opts.payload || attendanceDashboardPayload
    });
    updateAttendanceDashboardEventStatusSliceCache(filter, matchedMembers);
  } catch (error) {
    if (handleUnauthorizedError(error)) return;
    if (opts.preserveExistingTable && previousFilter && previousMembers.length > 0) {
      attendanceDashboardActiveSliceFilter = Object.assign({}, previousFilter, {
        summary: `${previousFilter.summary || filter.summary || ''} / 최신 데이터 갱신 실패: ${getDisplayErrorMessage(error, '드릴다운 조회 실패')}`
      });
      attendanceDashboardActiveSliceMembers = previousMembers;
      attendanceDashboardActiveStatusRankingRows = [];
      attendanceDashboardActiveDrilldownMode = 'memberList';
      renderAttendanceDashboardSliceMembers();
      return;
    }
    resetAttendanceDashboardSliceUiState({ render: false });
    const wrap = document.getElementById('dashboardDrilldownTableWrap');
    const title = document.getElementById('dashboardDrilldownTitle');
    const summary = document.getElementById('dashboardDrilldownSummary');
    const actions = document.getElementById('dashboardDrilldownActions');
    if (title) title.textContent = filter.label || '대시보드 드릴다운';
    if (summary) summary.textContent = getDisplayErrorMessage(error, '드릴다운 조회 실패');
    if (actions) actions.innerHTML = '';
    if (wrap) wrap.innerHTML = '<p class="info-text">드릴다운 데이터를 불러오지 못했습니다.</p>';
  }
}

function updateAttendanceDashboardEventStatusSliceCache(filter, matchedMembers) {
  attendanceDashboardActiveSliceFilter = Object.assign({}, filter, {
    summary: filter.statusKey === 'pending'
      ? `회차 ${filter.sessionKey}에서 아직 출석하지 않은 멤버 ${matchedMembers.length}명`
      : `회차 ${filter.sessionKey}에서 ${formatDashboardStatus(filter.statusKey)}로 집계된 멤버 ${matchedMembers.length}명`
  });
  attendanceDashboardActiveSliceMembers = sortAttendanceDashboardSliceMembers(matchedMembers);
  attendanceDashboardActiveStatusRankingRows = [];
  attendanceDashboardActiveDrilldownMode = 'memberList';
  closeAttendanceDashboardMemberHistoryModal();
  renderAttendanceDashboardSliceMembers();
}

async function applyAttendanceDashboardEventStatusSlice(sessionKey, statusKey) {
  const meta = getAttendanceDashboardQuickFilterMeta();
  const sessionKeys = meta && Array.isArray(meta.sessionKeys) && meta.sessionKeys.length > 0
    ? meta.sessionKeys
    : (meta && Array.isArray(meta.closedSessionKeys) ? meta.closedSessionKeys : null);
  if (!meta || !Array.isArray(sessionKeys)) {
    showToast('<i class="fas fa-info-circle"></i> 빠른 필터 인덱스를 찾을 수 없습니다. Apps Script를 먼저 배포했는지 확인해주세요.', true);
    return;
  }
  const index = sessionKeys.indexOf(String(sessionKey || ''));
  if (index < 0) return;

  const statusLabel = formatDashboardStatus(statusKey);
  const filter = {
    id: `event-status:${sessionKey}:${statusKey}`,
    type: 'eventStatus',
    sessionKey: String(sessionKey || ''),
    statusKey: String(statusKey || ''),
    label: `${sessionKey} / ${statusLabel}`,
    summary: `회차 ${sessionKey}에서 ${statusLabel}로 집계된 멤버 목록`
  };
  const nextId = String(filter.id || '');
  const currentId = attendanceDashboardActiveSliceFilter && attendanceDashboardActiveSliceFilter.id
    ? String(attendanceDashboardActiveSliceFilter.id)
    : '';
  if (nextId && nextId === currentId && getAttendanceDashboardDrilldownMode() === 'memberList') {
    resetAttendanceDashboardSliceUiState();
    return;
  }
  await updateAttendanceDashboardEventStatusSlice(filter);
}

function applyAttendanceDashboardCohortSlice(cohortTag) {
  const normalizedTag = String(cohortTag || '').toUpperCase();
  if (!normalizedTag) return;
  if (!getAttendanceDashboardQuickFilterMeta()) {
    showToast('<i class="fas fa-info-circle"></i> 빠른 필터 인덱스를 찾을 수 없습니다. Apps Script를 먼저 배포했는지 확인해주세요.', true);
    return;
  }

  const matchedMembers = getAttendanceDashboardQuickFilterMembers().filter(member => {
    return String(member && member.cohortTag || '').toUpperCase() === normalizedTag;
  });
  const badge = getDashboardCohortBadge(normalizedTag);
  toggleAttendanceDashboardActiveSlice({
    id: `cohort:${normalizedTag}`,
    type: 'cohort',
    cohortTag: normalizedTag,
    label: `${badge} 구성 멤버`,
    summary: `${badge}로 분류된 멤버 ${matchedMembers.length}명`
  }, matchedMembers);
}

function applyAttendanceDashboardAttendanceCountSlice(item) {
  const target = item || null;
  if (!target) return;
  if (!getAttendanceDashboardQuickFilterMeta()) {
    showToast('<i class="fas fa-info-circle"></i> 빠른 필터 인덱스를 찾을 수 없습니다. Apps Script를 먼저 배포했는지 확인해주세요.', true);
    return;
  }

  const matchedMembers = getAttendanceDashboardQuickFilterMembers().filter(member => {
    const count = Number(member && member.attendedCount || 0);
    if (target.isOther) {
      return Array.isArray(target.counts) && target.counts.indexOf(count) >= 0;
    }
    return count === Number(target.count || 0);
  });

  const label = target.isOther
    ? '출석 횟수 기타'
    : `출석 ${target.count}회`;
  toggleAttendanceDashboardActiveSlice({
    id: target.isOther
      ? `attendance-count:other:${(target.counts || []).join(',')}`
      : `attendance-count:${target.count}`,
    type: 'attendanceCount',
    count: target.count,
    counts: Array.isArray(target.counts) ? target.counts.slice() : [],
    isOther: !!target.isOther,
    label: label,
    summary: `${target.label || label}에 해당하는 멤버 ${matchedMembers.length}명`
  }, matchedMembers);
}

function captureAttendanceDashboardActiveSliceSnapshot() {
  const filter = attendanceDashboardActiveSliceFilter || null;
  const mode = getAttendanceDashboardDrilldownMode();
  if (!filter || !mode) return null;
  return {
    id: filter.id || '',
    type: filter.type || '',
    mode: mode,
    statusKey: filter.statusKey || '',
    sessionKey: filter.sessionKey || '',
    cohortTag: filter.cohortTag || '',
    count: filter.count,
    counts: Array.isArray(filter.counts) ? filter.counts.slice() : [],
    isOther: !!filter.isOther
  };
}

function restoreAttendanceDashboardActiveSliceSnapshot(snapshot) {
  if (!snapshot || !snapshot.type) return false;

  if (snapshot.type === 'statusRanking' && snapshot.statusKey) {
    applyAttendanceDashboardStatusRankingSlice(snapshot.statusKey, { skipRefreshAttempt: true });
    return true;
  }
  if (snapshot.type === 'eventStatus' && snapshot.sessionKey && snapshot.statusKey) {
    const isOngoing = isAttendanceDashboardSessionOngoingByKey(snapshot.sessionKey);
    if (isOngoing) {
      void updateAttendanceDashboardEventStatusSlice(buildAttendanceDashboardEventStatusFilter(snapshot.sessionKey, snapshot.statusKey, attendanceDashboardActiveSliceMembers.length), {
        preserveExistingTable: true,
        forceRefresh: true,
        loadingMessage: `${snapshot.sessionKey} / ${formatDashboardStatus(snapshot.statusKey)} 멤버 목록을 업데이트하는 중입니다...`
      });
      return true;
    }
    renderAttendanceDashboardSliceMembers();
    return true;
  }
  if (snapshot.type === 'cohort' && snapshot.cohortTag) {
    applyAttendanceDashboardCohortSlice(snapshot.cohortTag);
    return true;
  }
  if (snapshot.type === 'attendanceCount') {
    applyAttendanceDashboardAttendanceCountSlice({
      count: snapshot.count,
      counts: snapshot.counts,
      isOther: snapshot.isOther
    });
    return true;
  }
  return false;
}

function renderAttendanceDashboardSliceMembers() {
  const wrap = document.getElementById('dashboardDrilldownTableWrap');
  const title = document.getElementById('dashboardDrilldownTitle');
  const summary = document.getElementById('dashboardDrilldownSummary');
  const actions = document.getElementById('dashboardDrilldownActions');
  if (!wrap || !title || !summary || !actions) return;

  const activeFilter = attendanceDashboardActiveSliceFilter;
  const activeMode = getAttendanceDashboardDrilldownMode();
  const activeMembers = Array.isArray(attendanceDashboardActiveSliceMembers)
    ? attendanceDashboardActiveSliceMembers
    : [];
  const activeRankingRows = Array.isArray(attendanceDashboardActiveStatusRankingRows)
    ? attendanceDashboardActiveStatusRankingRows
    : [];

  if (!activeFilter || !activeMode) {
    title.textContent = '대시보드 드릴다운';
    summary.textContent = '출석 상태 비율은 상태별 랭킹, 행사 상태 막대/OB-YB 비율/출석 횟수 분포는 하단 멤버 목록으로 연결됩니다.';
    actions.innerHTML = '';
    wrap.innerHTML = '<p class="info-text">활성 그래프 조각이 없습니다. 상태 비율은 랭킹, 나머지 그래프는 멤버 목록으로 바로 확인할 수 있습니다.</p>';
    return;
  }

  title.textContent = activeFilter.label || '대시보드 드릴다운';
  summary.textContent = activeFilter.summary || '선택된 그래프 구간에 해당하는 멤버 목록입니다.';
  actions.innerHTML = `
    <span class="dashboard-drilldown-count">${activeMode === 'statusRanking' ? activeRankingRows.length : activeMembers.length}명</span>
    <button type="button" class="btn btn-secondary" style="padding:6px 10px; font-size:12px;" onclick="resetAttendanceDashboardSliceUiState()">
      <i class="fas fa-rotate-left"></i>
      <span>필터 해제</span>
    </button>
  `;

  if (activeMode === 'statusRanking') {
    if (activeRankingRows.length === 0) {
      wrap.innerHTML = '<p class="info-text">선택한 상태에 해당하는 멤버가 없습니다.</p>';
      return;
    }

    const rowsHtml = activeRankingRows.map(row => {
      const rankDisplay = Number(row.rank || 0) <= 3
        ? `<span class="rank-medal rank-${Number(row.rank || 0)}">${Number(row.rank || 0)}</span>`
        : `<span style="color: #94a3b8;">${Number(row.rank || 0)}</span>`;
      const offsetLabel = String(row.offsetLabel || '-').trim() || '-';
      const offsetDisplay = offsetLabel === '-' || offsetLabel === '미출석'
        ? '<span style="color: #64748b;">-</span>'
        : `<span style="color: #60a5fa;">${escapeHtml(offsetLabel)}</span>`;
      return `
        <tr>
          <td>${rankDisplay}</td>
          <td><span class="grade-badge">${escapeHtml(row.seasonLabel || '-')}</span></td>
          <td>${escapeHtml(row.name || row.memberKey || '-')}</td>
          <td>${Number(row.count || 0)}회</td>
          <td>${offsetDisplay}</td>
          <td>
            <button type="button" class="btn btn-secondary" style="padding:6px 10px; font-size:12px;" onclick="openAttendanceDashboardMemberHistoryModal('${encodeURIComponent(row.memberKey || '')}')">
              <i class="fas fa-calendar-check"></i>
              <span>출석일 확인</span>
            </button>
          </td>
        </tr>
      `;
    }).join('');

    wrap.innerHTML = `
      <table class="dashboard-table">
        <thead>
          <tr>
            <th>순위</th>
            <th>기수</th>
            <th>이름</th>
            <th>횟수</th>
            <th>보조시간</th>
            <th>출석일 확인</th>
          </tr>
        </thead>
        <tbody>${rowsHtml}</tbody>
      </table>
    `;
    return;
  }

  if (activeMembers.length === 0) {
    wrap.innerHTML = '<p class="info-text">선택한 조건에 해당하는 멤버가 없습니다.</p>';
    return;
  }

  const rowsHtml = activeMembers.map(member => {
    const seasonLabel = member.seasonLabel || '-';
    const name = member.name || member.memberKey || '-';
    const phoneDisplay = formatDashboardPhoneDisplay(member.memberKey || '');
    const emailText = String(member.email || '').trim() || '-';
    const attendTimeText = activeFilter && activeFilter.type === 'eventStatus'
      ? String(member.attendTimeHHMM || '-').trim() || '-'
      : '';
    return `
      <tr>
        <td><span class="grade-badge">${escapeHtml(seasonLabel)}</span></td>
        <td>${escapeHtml(name)}</td>
        <td><span class="dashboard-member-contact">${escapeHtml(phoneDisplay)}</span></td>
        <td>${escapeHtml(emailText)}</td>
        ${activeFilter && activeFilter.type === 'eventStatus' ? `<td>${escapeHtml(attendTimeText)}</td>` : ''}
        <td>
          <button type="button" class="btn btn-secondary" style="padding:6px 10px; font-size:12px;" onclick="openAttendanceDashboardMemberHistoryModal('${encodeURIComponent(member.memberKey || '')}')">
            <i class="fas fa-calendar-check"></i>
            <span>출석일 확인</span>
          </button>
        </td>
      </tr>
    `;
  }).join('');

  wrap.innerHTML = `
    <table class="dashboard-table">
      <thead>
        <tr>
          <th>기수</th>
          <th>이름</th>
          <th>연락처</th>
          <th>이메일</th>
          ${activeFilter && activeFilter.type === 'eventStatus' ? '<th>출석 시간</th>' : ''}
          <th>출석일 확인</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  `;
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

  const filteredSignature = filtered.map(item => `${item.sessionKey}:${item.isClosed ? 1 : 0}:${item.isOngoing ? 1 : 0}`).join('|');
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
        <span class="dashboard-option-badge ${item.isClosed ? 'closed' : 'open'}">${item.isClosed ? '종료' : (item.isOngoing ? '진행중' : '예정')}</span>
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
    const ongoingCount = selectedKeys.filter(key => {
      const item = sessionMap[key];
      return item && item.isOngoing;
    }).length;
    const activeScope = !isAttendanceDashboardSessionScopeManual() && ongoingCount > 0;
    hintNode.textContent = activeScope
      ? `완료 회차 + 현재 활성 출석 ${ongoingCount}개 기준 / 날짜·회차를 직접 바꾸면 수동 필터로 전환`
      : `종료 회차 ${closedCount}개 / 진행중 회차 ${ongoingCount}개 포함 / 필터 적용 시 전체 지표 동기화`;
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
    hintNode.textContent = `선택 없으면 전체 평균 / 최대 ${ATTENDANCE_DASHBOARD_MAX_MEMBER_SELECTION}명 선택`;
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
  if (opts.markManual !== false) {
    attendanceDashboardState.sessionScopeMode = 'manual';
  }
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
      showToast(`<i class="fas fa-info-circle"></i> 평균 추이 대상은 최대 ${ATTENDANCE_DASHBOARD_MAX_MEMBER_SELECTION}명까지 선택됩니다.`, true);
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

function renderDashboardDonutChart(chartRefName, canvasId, emptyId, labels, values, colors, options) {
  const opts = options || {};
  const canvas = document.getElementById(canvasId);
  const emptyNode = document.getElementById(emptyId);
  const valueUnit = String(opts.valueUnit || '명').trim() || '명';
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
    prevChart.$ccSliceMeta = Array.isArray(opts.meta) ? opts.meta : [];
    prevChart.$ccOnSliceClick = typeof opts.onSliceClick === 'function' ? opts.onSliceClick : null;
    prevChart.$ccValueSnapshot = values.slice();
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
              const chartValues = context.chart && Array.isArray(context.chart.$ccValueSnapshot)
                ? context.chart.$ccValueSnapshot
                : [];
              const all = chartValues.reduce((sum, value) => sum + Number(value || 0), 0);
              const current = Number(context.raw || 0);
              const ratio = all > 0 ? Math.round((current / all) * 100) : 0;
              return `${context.label}: ${current}${valueUnit} (${ratio}%)`;
            }
          }
        }
      },
      onClick(event, elements) {
        if (!elements || elements.length === 0) return;
        const targetChart = getDashboardDonutChartRef(chartRefName);
        if (!targetChart || typeof targetChart.$ccOnSliceClick !== 'function') return;
        const index = elements[0].index;
        const meta = Array.isArray(targetChart.$ccSliceMeta) ? targetChart.$ccSliceMeta[index] : null;
        if (!meta) return;
        targetChart.$ccOnSliceClick(meta, index);
      }
    }
  });

  chart.$ccSliceMeta = Array.isArray(opts.meta) ? opts.meta : [];
  chart.$ccOnSliceClick = typeof opts.onSliceClick === 'function' ? opts.onSliceClick : null;
  chart.$ccValueSnapshot = values.slice();
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
    ['#4ade80', '#fbbf24', '#f87171', '#93c5fd'],
    {
      valueUnit: '회',
      meta: [
        { statusKey: 'on_time', label: '출석', drilldownMode: 'statusRanking' },
        { statusKey: 'late', label: '지각', drilldownMode: 'statusRanking' },
        { statusKey: 'absent', label: '결석', drilldownMode: 'statusRanking' },
        { statusKey: 'excused', label: '유고', drilldownMode: 'statusRanking' }
      ],
      onSliceClick(meta) {
        if (!meta || !meta.statusKey) return;
        applyAttendanceDashboardStatusRankingSlice(meta.statusKey);
      }
    }
  );

  if (!hasValue) {
    const statusCount = Number(payload && payload.meta ? payload.meta.statusSessionCount || 0 : 0);
    const ongoingCount = Number(payload && payload.meta ? payload.meta.ongoingSessionCount || 0 : 0);
    const message = statusCount > 0
      ? (ongoingCount > 0
        ? '진행 중 회차에는 아직 기록된 출석 상태가 없어 상태 비율을 계산할 수 없습니다.'
        : '필터 조건에 맞는 출석 상태 데이터가 없습니다.')
      : '종료되었거나 진행 중인 회차가 없어 출석 상태 비율을 계산할 수 없습니다.';
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
    ['#60a5fa', '#34d399', '#94a3b8'],
    {
      valueUnit: '명',
      meta: [
        { cohortTag: 'OB', label: 'OB' },
        { cohortTag: 'YB', label: 'YB' },
        { cohortTag: 'UNKNOWN', label: '미분류' }
      ],
      onSliceClick(meta) {
        if (!meta || !meta.cohortTag) return;
        applyAttendanceDashboardCohortSlice(meta.cohortTag);
      }
    }
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
  const quickFilterMembers = getAttendanceDashboardQuickFilterMembers();
  const options = quickFilterMembers.length > 0
    ? quickFilterMembers
    : (payload && payload.meta && Array.isArray(payload.meta.memberOptions)
      ? payload.meta.memberOptions
      : []);
  if (options.length === 0) {
    attendanceDashboardCountDistributionItems = [];
    return { labels: [], values: [], colors: [], items: [] };
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
    attendanceDashboardCountDistributionItems = [];
    return { labels: [], values: [], colors: [], items: [] };
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
    const otherEntries = entries.filter(item => !topSet[item.count]);
    const othersCount = otherEntries.reduce((sum, item) => sum + Number(item.members || 0), 0);

    displayEntries = topEntries
      .sort((a, b) => a.count - b.count)
      .map(item => ({
        label: `${item.count}회`,
        members: item.members,
        isOther: false,
        count: item.count,
        counts: [item.count]
      }));
    if (othersCount > 0) {
      displayEntries.push({
        label: '기타',
        members: othersCount,
        isOther: true,
        count: null,
        counts: otherEntries.map(item => item.count).sort((a, b) => a - b)
      });
    }
  } else {
    displayEntries = entries
      .sort((a, b) => a.count - b.count)
      .map(item => ({
        label: `${item.count}회`,
        members: item.members,
        isOther: false,
        count: item.count,
        counts: [item.count]
      }));
  }

  attendanceDashboardCountDistributionItems = displayEntries.slice();
  return {
    labels: displayEntries.map(item => item.label),
    values: displayEntries.map(item => item.members),
    colors: displayEntries.map((item, index) => item.isOther ? '#64748b' : getDashboardColor(index)),
    items: displayEntries
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
    distribution.colors,
    {
      valueUnit: '명',
      meta: distribution.items,
      onSliceClick(meta) {
        applyAttendanceDashboardAttendanceCountSlice(meta);
      }
    }
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
              if (row.rateMode === 'live') {
                return [
                  `현재 진행률: ${row.attendanceRate || 0}%`,
                  `현재 반영: ${row.participantCount || 0}/${row.rateBaseCount || 0}`,
                  `출석: ${row.attendedCount || 0}회, 유고: ${row.excusedCount || 0}회, 미확정: ${row.pendingCount || 0}회`
                ];
              }
              return [
                `출석률: ${row.attendanceRate || 0}%`,
                `출석/모수: ${row.attendedCount || 0}/${row.effectiveCount || 0}`,
                `지각: ${row.lateCount || 0}회, 결석: ${row.absentCount || 0}회, 유고: ${row.excusedCount || 0}회`
              ];
            }
          }
        }
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
    { label: '출석', statusKey: 'on_time', data: rows.map(r => Number(r.onTimeCount || 0)), backgroundColor: 'rgba(74, 222, 128, 0.75)', borderColor: '#4ade80', borderWidth: 1, stack: 'status' },
    { label: '지각', statusKey: 'late', data: rows.map(r => Number(r.lateCount || 0)), backgroundColor: 'rgba(251, 191, 36, 0.75)', borderColor: '#fbbf24', borderWidth: 1, stack: 'status' },
    { label: '결석', statusKey: 'absent', data: rows.map(r => Number(r.absentCount || 0)), backgroundColor: 'rgba(248, 113, 113, 0.75)', borderColor: '#f87171', borderWidth: 1, stack: 'status' },
    { label: '유고', statusKey: 'excused', data: rows.map(r => Number(r.excusedCount || 0)), backgroundColor: 'rgba(147, 197, 253, 0.75)', borderColor: '#93c5fd', borderWidth: 1, stack: 'status' },
    { label: '미확정', statusKey: 'pending', data: rows.map(r => Number(r.pendingCount || 0)), backgroundColor: 'rgba(148, 163, 184, 0.75)', borderColor: '#94a3b8', borderWidth: 1, stack: 'status' }
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
        legend: { labels: { color: '#dbeafe' } },
        tooltip: {
          callbacks: {
            label(context) {
              const value = Number(context.raw || 0);
              return `${context.dataset && context.dataset.label ? context.dataset.label : '상태'}: ${value}회`;
            }
          }
        }
      },
      onClick(event, elements) {
        if (!elements || elements.length === 0) return;
        const index = elements[0].index;
        const datasetIndex = elements[0].datasetIndex;
        const chartRows = attendanceDashboardEventStatusChart && attendanceDashboardEventStatusChart.$ccRows
          ? attendanceDashboardEventStatusChart.$ccRows
          : rows;
        const chartDatasets = attendanceDashboardEventStatusChart && attendanceDashboardEventStatusChart.data
          ? attendanceDashboardEventStatusChart.data.datasets || []
          : datasets;
        const row = chartRows[index];
        const dataset = chartDatasets[datasetIndex] || {};
        if (!row || !row.sessionKey) return;
        if (!dataset.statusKey) return;
        applyAttendanceDashboardEventStatusSlice(row.sessionKey, dataset.statusKey);
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
    summary.textContent = '차트를 클릭하거나 1명을 선택하면 상세가 표시됩니다.';
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
    summary.textContent = `출석 ${stat.onTimeCount || 0}회, 지각 ${stat.lateCount || 0}회, 결석 ${stat.absentCount || 0}회, 유고 ${stat.excusedCount || 0}회, 미확정 ${stat.pendingCount || 0}회`;

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
    summary.textContent = `출석률 ${stat.attendanceRate || 0}% / 출석 ${stat.attendedCount || 0}회 / 유효모수 ${stat.effectiveCount || 0}회 / 유고 ${stat.excusedCount || 0}회 / 미확정 ${stat.pendingCount || 0}회`;

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

function buildAttendanceDashboardMemberHistoryCacheKey(memberKey) {
  return [
    getSelectedSeasonAlias() || '-',
    attendanceDashboardState.group || 'all',
    attendanceDashboardState.dateFrom || '-',
    attendanceDashboardState.dateTo || '-',
    (attendanceDashboardState.sessionKeys || []).slice().sort().join('|') || '-',
    String(memberKey || '').trim()
  ].join('::');
}

function getAttendanceDashboardQuickFilterMemberByKey(memberKey) {
  const targetKey = String(memberKey || '').trim();
  if (!targetKey) return null;
  return getAttendanceDashboardQuickFilterMembers().find(item => String(item && item.memberKey || '').trim() === targetKey) || null;
}

function buildAttendanceDashboardEventSliceCacheKey(sessionKey) {
  return [
    getSelectedSeasonAlias() || '-',
    attendanceDashboardState.group || 'all',
    attendanceDashboardState.dateFrom || '-',
    attendanceDashboardState.dateTo || '-',
    (attendanceDashboardState.sessionKeys || []).slice().sort().join('|') || '-',
    String(sessionKey || '').trim()
  ].join('::');
}

function formatDashboardAttendClockText(value) {
  const text = String(value || '').trim();
  if (!text) return '-';
  const match = text.match(/(\d{2}:\d{2})(?::\d{2})?$/);
  if (match && match[1]) return match[1];
  const parsed = new Date(text);
  if (!isNaN(parsed.getTime())) {
    return `${String(parsed.getHours()).padStart(2, '0')}:${String(parsed.getMinutes()).padStart(2, '0')}`;
  }
  return '-';
}

function getAttendanceDashboardSessionMetaByKey(sessionKey, payload) {
  const targetKey = String(sessionKey || '').trim();
  if (!targetKey) return null;
  const sourcePayload = payload || attendanceDashboardPayload || null;
  const availableSessions = sourcePayload && sourcePayload.meta && Array.isArray(sourcePayload.meta.availableSessions)
    ? sourcePayload.meta.availableSessions
    : [];
  return availableSessions.find(item => String(item && item.sessionKey || '').trim() === targetKey) || null;
}

function buildAttendanceDashboardEventStatusFilter(sessionKey, statusKey, matchedCount) {
  const normalizedSessionKey = String(sessionKey || '').trim();
  const normalizedStatusKey = String(statusKey || '').trim();
  const statusLabel = formatDashboardStatus(normalizedStatusKey);
  const count = Number(matchedCount || 0);
  return {
    id: `event-status:${normalizedSessionKey}:${normalizedStatusKey}`,
    type: 'eventStatus',
    sessionKey: normalizedSessionKey,
    statusKey: normalizedStatusKey,
    label: `${normalizedSessionKey} / ${statusLabel}`,
    summary: normalizedStatusKey === 'pending'
      ? `회차 ${normalizedSessionKey}에서 아직 출석하지 않은 멤버 ${count}명`
      : `회차 ${normalizedSessionKey}에서 ${statusLabel}로 집계된 멤버 ${count}명`
  };
}

function updateAttendanceDashboardEventStatusSlice(filter, members, options) {
  const opts = options || {};
  attendanceDashboardActiveSliceFilter = filter || null;
  attendanceDashboardActiveSliceMembers = sortAttendanceDashboardSliceMembers(members);
  attendanceDashboardActiveStatusRankingRows = [];
  attendanceDashboardActiveDrilldownMode = filter ? 'memberList' : '';
  if (opts.closeModal !== false) {
    closeAttendanceDashboardMemberHistoryModal();
  }
  renderAttendanceDashboardSliceMembers();
}

function getDashboardStatusChipMarkup(status) {
  const normalized = String(status || '').toLowerCase();
  return `<span class="dashboard-status-chip ${escapeHtml(normalized)}">${escapeHtml(formatDashboardStatus(normalized))}</span>`;
}

function isAttendanceDashboardMemberHistoryRequestActive(memberKey) {
  return !!(
    attendanceDashboardMemberHistoryModalState
    && String(attendanceDashboardMemberHistoryModalState.memberKey || '') === String(memberKey || '')
  );
}

function closeAttendanceDashboardMemberHistoryModal() {
  const modal = document.getElementById('dashboardMemberHistoryModal');
  if (modal) {
    modal.style.display = 'none';
  }
  attendanceDashboardMemberHistoryModalState = null;
}

function renderAttendanceDashboardMemberHistoryModal(payload, memberInfo) {
  const modal = document.getElementById('dashboardMemberHistoryModal');
  const title = document.getElementById('dashboardMemberHistoryModalTitle');
  const summary = document.getElementById('dashboardMemberHistoryModalSummary');
  const body = document.getElementById('dashboardMemberHistoryModalBody');
  if (!modal || !title || !summary || !body) return;

  const member = memberInfo || {};
  const memberName = `${member.seasonLabel || '-'} ${member.name || member.memberKey || '-'}`.trim();
  title.textContent = `출석일 확인: ${memberName}`;

  if (!payload || !payload.success) {
    summary.textContent = payload && payload.message ? payload.message : '출석 기록을 불러오지 못했습니다.';
    body.innerHTML = '<p class="info-text">표시할 출석 기록이 없습니다.</p>';
    modal.style.display = 'flex';
    return;
  }

  const stat = payload.summary || {};
  const rows = Array.isArray(payload.rows) ? payload.rows : [];
  summary.textContent = `현재 대시보드 필터 기준 회차 / 출석 ${stat.attendedCount || 0}회 / 지각 ${stat.lateCount || 0}회 / 결석 ${stat.absentCount || 0}회 / 유고 ${stat.excusedCount || 0}회 / 미확정 ${stat.pendingCount || 0}회`;

  if (rows.length === 0) {
    body.innerHTML = '<p class="info-text">현재 필터에 포함된 회차 데이터가 없습니다.</p>';
    modal.style.display = 'flex';
    return;
  }

  const rowsHtml = rows.map(row => {
    const noteText = String(row.note || '').trim();
    const noteHtml = noteText
      ? `<span class="dashboard-subtext">${escapeHtml(noteText)}</span>`
      : '';
    return `
      <tr>
        <td>${escapeHtml(row.sessionKey || '-')}</td>
        <td>${escapeHtml(row.date || '-')}</td>
        <td>${getDashboardStatusChipMarkup(row.status || 'future')}</td>
        <td>
          ${escapeHtml(row.attendTime || '-')}
          ${noteHtml}
        </td>
      </tr>
    `;
  }).join('');

  body.innerHTML = `
    <table class="dashboard-table">
      <thead>
        <tr>
          <th>회차</th>
          <th>일시</th>
          <th>상태</th>
          <th>출석시각</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>
  `;
  modal.style.display = 'flex';
}

async function openAttendanceDashboardMemberHistoryModal(encodedMemberKey) {
  const memberKey = decodeURIComponent(String(encodedMemberKey || ''));
  if (!memberKey) return;

  const modal = document.getElementById('dashboardMemberHistoryModal');
  const title = document.getElementById('dashboardMemberHistoryModalTitle');
  const summary = document.getElementById('dashboardMemberHistoryModalSummary');
  const body = document.getElementById('dashboardMemberHistoryModalBody');
  const memberInfo = getAttendanceDashboardQuickFilterMemberByKey(memberKey) || {
    memberKey,
    name: memberKey,
    seasonLabel: '-'
  };
  if (!modal || !title || !summary || !body) return;

  attendanceDashboardMemberHistoryModalState = { memberKey };
  title.textContent = `출석일 확인: ${(memberInfo.seasonLabel || '-')} ${(memberInfo.name || memberKey)}`.trim();
  summary.textContent = '현재 대시보드 필터 기준 출석 기록을 불러오는 중입니다.';
  body.innerHTML = '<p class="info-text">출석 기록을 불러오는 중입니다...</p>';
  modal.style.display = 'flex';

  const cacheKey = buildAttendanceDashboardMemberHistoryCacheKey(memberKey);
  const cached = attendanceDashboardMemberHistoryCache[cacheKey];
  if (cached && cached.expiresAt > Date.now()) {
    if (!isAttendanceDashboardMemberHistoryRequestActive(memberKey)) return;
    renderAttendanceDashboardMemberHistoryModal(cached.payload, memberInfo);
    return;
  }

  try {
    const season = getSelectedSeasonAlias();
    if (!season) {
      renderAttendanceDashboardMemberHistoryModal({ success: false, message: '시즌이 선택되지 않았습니다.' }, memberInfo);
      return;
    }

    const params = Object.assign({
      adminToken: adminToken,
      season: season,
      drillType: 'member',
      key: memberKey
    }, getAttendanceDashboardApiFilterParams());

    const response = await CloudClubApi.call('attendanceDashboardDrilldown', params);
    attendanceDashboardMemberHistoryCache[cacheKey] = {
      payload: response,
      expiresAt: Date.now() + ATTENDANCE_DASHBOARD_MEMBER_HISTORY_CACHE_TTL_MS
    };
    if (!isAttendanceDashboardMemberHistoryRequestActive(memberKey)) return;
    renderAttendanceDashboardMemberHistoryModal(response, memberInfo);
  } catch (error) {
    if (handleUnauthorizedError(error)) return;
    if (!isAttendanceDashboardMemberHistoryRequestActive(memberKey)) return;
    renderAttendanceDashboardMemberHistoryModal({
      success: false,
      message: getDisplayErrorMessage(error, '출석 기록 조회 실패')
    }, memberInfo);
  }
}

function buildMemberTrendCacheKey() {
  const season = getSelectedSeasonAlias();
  const selectedMemberKey = (attendanceDashboardState.selectedMemberKeys || []).slice().sort().join('|') || 'ALL';
  const filterKey = [
    attendanceDashboardState.group || 'all',
    attendanceDashboardState.dateFrom || '-',
    attendanceDashboardState.dateTo || '-',
    (attendanceDashboardState.sessionKeys || []).slice().sort().join('|')
  ].join(':');
  return `${season}:${selectedMemberKey}:${filterKey}`;
}

function getAttendanceDashboardMemberTrendLabel() {
  const selected = attendanceDashboardState.selectedMemberKeys || [];
  if (selected.length === 0) {
    return '전체 평균';
  }

  const optionMap = {};
  getAttendanceDashboardMemberOptions().forEach(item => {
    optionMap[item.memberKey] = item;
  });

  if (selected.length === 1) {
    const item = optionMap[selected[0]];
    if (item) {
      return `${item.seasonLabel || '-'} ${item.name || selected[0]}`;
    }
    return '선택 1명';
  }

  return `선택 ${selected.length}명 평균`;
}

async function loadAttendanceDashboardMemberTrendSeries() {
  const cacheKey = buildMemberTrendCacheKey();
  if (attendanceDashboardMemberSeriesCache[cacheKey]) {
    return attendanceDashboardMemberSeriesCache[cacheKey];
  }

  const season = getSelectedSeasonAlias();
  if (!season) return null;
  const selected = (attendanceDashboardState.selectedMemberKeys || []).slice(0, ATTENDANCE_DASHBOARD_MAX_MEMBER_SELECTION);
  const params = Object.assign({
    adminToken: adminToken,
    season: season,
    drillType: 'memberAverage',
    key: selected.length === 1 ? selected[0] : 'aggregate',
    memberKeysCsv: selected.join(',')
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

  const series = await loadAttendanceDashboardMemberTrendSeries()
    .catch((error) => {
      console.error('평균 추이 로드 실패:', error);
      return null;
    });

  if (!series || !series.success || !Array.isArray(series.rows) || series.rows.length === 0) {
    if (attendanceDashboardMemberTrendChart) {
      attendanceDashboardMemberTrendChart.destroy();
      attendanceDashboardMemberTrendChart = null;
    }
    const ctx = canvas.getContext('2d');
    if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    return;
  }

  const rows = series.rows || [];
  const labels = rows.map(row => row.sessionKey);
  const datasets = [{
    label: getAttendanceDashboardMemberTrendLabel(),
    data: rows.map(row => (
      typeof row.averageOffsetSeconds === 'number'
        ? Number((row.averageOffsetSeconds / 60).toFixed(2))
        : null
    )),
    pointMeta: rows,
    summaryMeta: series.summary || {},
    borderColor: getDashboardColor(0),
    backgroundColor: 'rgba(0,0,0,0)',
    borderWidth: 2,
    pointRadius: 4,
    pointHoverRadius: 5,
    tension: 0.2,
    spanGaps: false
  }];

  if (
    attendanceDashboardMemberTrendChart
    && attendanceDashboardMemberTrendChart.config
    && attendanceDashboardMemberTrendChart.config.type === 'line'
  ) {
    attendanceDashboardMemberTrendChart.$ccRows = rows;
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
              const summaryMeta = dataset.summaryMeta || {};
              if (!pointMeta || typeof pointMeta.averageOffsetSeconds !== 'number') {
                return [`${dataset.label}: 평균 출석 데이터 없음`];
              }

              const lines = [
                `${dataset.label}: ${formatSignedOffsetMinutes(pointMeta.averageOffsetSeconds)}`,
                `평균 출석일시: ${pointMeta.averageAttendTime || '-'}`,
                `유효 출석자: ${Number(pointMeta.validAttendanceCount || 0)}명`
              ];
              if (pointMeta.isOngoing) {
                lines.push('진행중 회차: 현재까지 기록된 출석자 평균');
              }
              if (typeof summaryMeta.filteredMemberCount === 'number' && summaryMeta.filteredMemberCount > 0) {
                lines.push(`대상 인원: ${summaryMeta.filteredMemberCount}명`);
              }
              return lines;
            }
          }
        }
      }
    }
  });
  attendanceDashboardMemberTrendChart.$ccRows = rows;
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
    String(meta.ongoingSessionCount || 0),
    String((safePayload.ranking || []).length),
    String((safePayload.table && safePayload.table.eventTopRows && safePayload.table.eventTopRows.length) || 0),
    rateRows.map(row => `${row.sessionKey}:${row.attendanceRate}`).join('|'),
    statusRows.map(row => `${row.sessionKey}:${row.onTimeCount}:${row.lateCount}:${row.absentCount}:${row.excusedCount}:${row.pendingCount || 0}:${row.isOngoing ? 1 : 0}`).join('|'),
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
  renderAttendanceDashboardSliceMembers();

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

function getAttendanceDashboardDefaultVisibleSessionKeys(payload) {
  const meta = payload && payload.meta ? payload.meta : {};
  const availableSessions = Array.isArray(meta.availableSessions) ? meta.availableSessions : [];
  return availableSessions
    .filter(item => item && (item.isClosed || item.isOngoing))
    .map(item => String(item.sessionKey || '').trim())
    .filter(key => !!key);
}

function isAttendanceDashboardSessionScopeManual() {
  return String(attendanceDashboardState && attendanceDashboardState.sessionScopeMode || 'auto') === 'manual';
}

function tryHydrateAttendanceDashboardActiveSessionScope(payload, options) {
  const opts = options || {};
  if (opts.skipAutoSessionHydration) return false;
  if (isAttendanceDashboardSessionScopeManual()) return false;

  const activeKeys = getAttendanceDashboardDefaultVisibleSessionKeys(payload);
  const currentKeys = Array.isArray(attendanceDashboardState.sessionKeys)
    ? attendanceDashboardState.sessionKeys.slice()
    : [];

  const sameKeys = activeKeys.length === currentKeys.length
    && activeKeys.every((key, index) => key === currentKeys[index]);

  if (sameKeys) return false;

  attendanceDashboardState.sessionKeys = activeKeys;
  attendanceDashboardState.sessionScopeMode = 'auto';
  applyAttendanceDashboardStateToControls();
  saveAttendanceDashboardStateToStorage();
  setAttendanceDashboardMetaText(
    activeKeys.length > 0
      ? `기본 범위를 완료 회차 + 현재 활성 출석까지로 맞췄습니다. (${activeKeys.join(', ')})`
      : '완료되었거나 현재 활성인 출석 회차가 없어 기본 범위를 비워 둡니다.'
  );
  return true;
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
  const hasExplicitSessionScope = !!(
    (storedState && Object.prototype.hasOwnProperty.call(storedState, 'sessionScopeMode'))
    || (queryState && Object.prototype.hasOwnProperty.call(queryState, 'sessionScopeMode'))
  );
  if (
    !hasExplicitSessionScope
    && (
      attendanceDashboardState.dateFrom
      || attendanceDashboardState.dateTo
      || ((attendanceDashboardState.sessionKeys || []).length > 0)
    )
  ) {
    attendanceDashboardState.sessionScopeMode = 'manual';
  }
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
  const memberHistoryModal = document.getElementById('dashboardMemberHistoryModal');
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
      setAttendanceDashboardMemberKeys(next, { showLimitToast: true });
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
        { showLimitToast: false }
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
      closeAttendanceDashboardMemberHistoryModal();
    }
  });

  if (memberHistoryModal) {
    memberHistoryModal.addEventListener('click', event => {
      if (event.target === memberHistoryModal) {
        closeAttendanceDashboardMemberHistoryModal();
      }
    });
  }

  if (memberSelect) {
    memberSelect.addEventListener('change', () => {
      const keys = Array.from(memberSelect.selectedOptions || [])
        .map(option => option.value)
        .filter(value => !!value);
      setAttendanceDashboardMemberKeys(keys, { showLimitToast: false });
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
        attendanceDashboardState.sessionScopeMode = 'manual';
      });
    });
  }

  if (dateToInput) {
    ['input', 'change'].forEach(eventName => {
      dateToInput.addEventListener(eventName, () => {
        if (attendanceDashboardDateInputSyncing) return;
        attendanceDashboardDateRangeUserEdited = true;
        attendanceDashboardAutoDateHydratedOnce = true;
        attendanceDashboardState.sessionScopeMode = 'manual';
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
    current.sessionScopeMode = 'auto';
    current.sortBy = 'attendanceRate';
  } else if (mode === 'yb') {
    current.group = 'yb';
    current.sessionScopeMode = 'manual';
  } else if (mode === 'ob') {
    current.group = 'ob';
    current.sessionScopeMode = 'manual';
  } else if (mode === 'recent4') {
    const sessions = attendanceDashboardPayload && attendanceDashboardPayload.meta && Array.isArray(attendanceDashboardPayload.meta.availableSessions)
      ? attendanceDashboardPayload.meta.availableSessions.filter(item => item.isClosed)
      : [];
    current.sessionKeys = sessions.slice(-4).map(item => item.sessionKey);
    current.sessionScopeMode = 'manual';
  } else if (mode === 'high_absence') {
    current.sortBy = 'absenceRate';
    current.topN = 10;
    current.sessionScopeMode = 'manual';
  }

  attendanceDashboardState = normalizeAttendanceDashboardState(current);
  applyAttendanceDashboardStateToControls();
  renderAttendanceDashboardSessionPicker();
  renderAttendanceDashboardMemberPicker();
  closeAttendanceDashboardPopovers();
  resetAttendanceDashboardSliceUiState({ render: true });
  saveAttendanceDashboardStateToStorage();
  applyAttendanceDashboardFilters();
}

function applyAttendanceDashboardFilters() {
  collectAttendanceDashboardStateFromControls();
  attendanceDashboardState.sessionScopeMode = 'manual';
  closeAttendanceDashboardPopovers();
  resetAttendanceDashboardSliceUiState({ render: true });
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
  resetAttendanceDashboardSliceUiState({ render: true });
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

  if (attendanceDashboardActiveSliceFilter && getAttendanceDashboardDrilldownMode() === 'statusRanking') {
    const headers = ['rank', 'seasonLabel', 'name', 'phone', 'count', 'offsetLabel', 'sliceLabel'];
    const rows = (Array.isArray(attendanceDashboardActiveStatusRankingRows) ? attendanceDashboardActiveStatusRankingRows : []).map(row => [
      Number(row.rank || 0),
      row.seasonLabel || '',
      row.name || '',
      formatDashboardPhoneDisplay(row.memberKey || ''),
      Number(row.count || 0),
      row.offsetLabel || '-',
      attendanceDashboardActiveSliceFilter && attendanceDashboardActiveSliceFilter.label
        ? attendanceDashboardActiveSliceFilter.label
        : ''
    ]);
    downloadCsvFile(`${season}_dashboard_status_ranking_${stamp}.csv`, headers, rows);
    return;
  }

  if (attendanceDashboardActiveSliceFilter) {
    const headers = ['seasonLabel', 'name', 'phone', 'email', 'cohortTag', 'attendanceRate', 'attendedCount', 'sliceLabel'];
    const rows = (Array.isArray(attendanceDashboardActiveSliceMembers) ? attendanceDashboardActiveSliceMembers : []).map(member => [
      member.seasonLabel || '',
      member.name || '',
      formatDashboardPhoneDisplay(member.memberKey || ''),
      member.email || '',
      member.cohortTag || '',
      Number(member.attendanceRate || 0),
      Number(member.attendedCount || 0),
      attendanceDashboardActiveSliceFilter && attendanceDashboardActiveSliceFilter.label
        ? attendanceDashboardActiveSliceFilter.label
        : ''
    ]);
    downloadCsvFile(`${season}_dashboard_members_${stamp}.csv`, headers, rows);
    return;
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
  const preserveSlice = opts.preserveSlice !== false;
  const sliceSnapshot = preserveSlice ? captureAttendanceDashboardActiveSliceSnapshot() : null;
  if (opts.forceReload || (attendanceDashboardLastFetchKey && attendanceDashboardLastFetchKey !== fetchKey)) {
    if (!sliceSnapshot) {
      resetAttendanceDashboardSliceUiState({ render: true });
    }
  }
  const now = Date.now();
  if (
    !opts.forceReload
    && attendanceDashboardPayload
    && attendanceDashboardLastFetchKey === fetchKey
    && (now - attendanceDashboardLastFetchedAt) < ATTENDANCE_DASHBOARD_FRONT_CACHE_TTL_MS
  ) {
    if (tryHydrateAttendanceDashboardActiveSessionScope(attendanceDashboardPayload, opts)) {
      endPerfMark(perfToken, { status: 'memory-cache-active-session-reload' });
      await loadAttendanceDashboard({ forceReload: true, skipAutoSessionHydration: true });
      return;
    }
    renderAttendanceDashboard(attendanceDashboardPayload);
    displayRankings({
      success: true,
      data: Array.isArray(attendanceDashboardPayload.ranking) ? attendanceDashboardPayload.ranking : []
    });
    setAttendanceDashboardMetaText(
      `시즌 ${attendanceDashboardPayload.seasonAlias || season} / 선택 회차 ${attendanceDashboardPayload.meta && attendanceDashboardPayload.meta.selectedSessionCount ? attendanceDashboardPayload.meta.selectedSessionCount : 0} / 종료 회차 ${attendanceDashboardPayload.meta && attendanceDashboardPayload.meta.closedSessionCount ? attendanceDashboardPayload.meta.closedSessionCount : 0} / 진행중 회차 ${attendanceDashboardPayload.meta && attendanceDashboardPayload.meta.ongoingSessionCount ? attendanceDashboardPayload.meta.ongoingSessionCount : 0} (client-cache)`
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

    if (tryHydrateAttendanceDashboardActiveSessionScope(response, opts)) {
      attendanceDashboardLoading = false;
      endPerfMark(perfToken, { status: 'rehydrate-active-session-reload' });
      await loadAttendanceDashboard({ forceReload: true, skipAutoSessionHydration: true });
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
      `시즌 ${response.seasonAlias} / 선택 회차 ${response.meta && response.meta.selectedSessionCount ? response.meta.selectedSessionCount : 0} / 종료 회차 ${response.meta && response.meta.closedSessionCount ? response.meta.closedSessionCount : 0} / 진행중 회차 ${response.meta && response.meta.ongoingSessionCount ? response.meta.ongoingSessionCount : 0}${rangeLabel}${fromCache}`
    );
    if (sliceSnapshot) {
      restoreAttendanceDashboardActiveSliceSnapshot(sliceSnapshot);
    }
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

function clearAttendanceDashboardAutoRefresh() {
  if (attendanceDashboardRefreshInterval) {
    clearInterval(attendanceDashboardRefreshInterval);
    attendanceDashboardRefreshInterval = null;
  }
}

function syncAttendanceDashboardAutoRefresh(options) {
  const opts = options || {};
  const shouldRun = getActiveTabName() === 'status'
    && !document.hidden
    && !!adminToken
    && seasonSourceReady;

  if (!shouldRun) {
    clearAttendanceDashboardAutoRefresh();
    return;
  }

  if (!attendanceDashboardRefreshInterval) {
    attendanceDashboardRefreshInterval = setInterval(() => {
      if (document.hidden || getActiveTabName() !== 'status') {
        clearAttendanceDashboardAutoRefresh();
        return;
      }
      refreshStatusDashboardIfVisible();
    }, ATTENDANCE_DASHBOARD_REFRESH_INTERVAL_MS);
  }

  if (opts.immediate) {
    refreshStatusDashboardIfVisible();
  }
}

async function refreshStatusDashboardIfVisible() {
  if (getActiveTabName() !== 'status') return;
  await loadAttendanceDashboard({ forceReload: true });
}
