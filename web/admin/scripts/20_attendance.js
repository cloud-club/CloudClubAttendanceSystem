const DEFAULT_SEASON_SOURCE_BLOCK_MESSAGE = '시즌 목록 로드 실패로 조회가 중단되었습니다. 새로고침 후 다시 로그인해주세요.';

function setSeasonSourceBlockedState(message) {
  seasonSourceReady = false;
  seasonSourceBlockMessage = String(message || '').trim() || DEFAULT_SEASON_SOURCE_BLOCK_MESSAGE;
  currentSheetName = '';
  currentSeasonAlias = '';
}

function setSeasonSourceReadyState() {
  seasonSourceReady = true;
  seasonSourceBlockMessage = '';
}

function getSeasonSourceBlockedMessage() {
  return String(seasonSourceBlockMessage || '').trim() || DEFAULT_SEASON_SOURCE_BLOCK_MESSAGE;
}

function renderSeasonSourceBlockedUi(message, options) {
  const opts = options || {};
  const text = String(message || '').trim() || getSeasonSourceBlockedMessage();

  if (opts.renderCountdown) {
    renderCountdown({ active: false, message: text });
  }

  if (opts.renderRanking !== false) {
    const rankingBoard = document.getElementById('rankingBoard');
    if (rankingBoard) {
      rankingBoard.innerHTML = `<div class="error">${escapeHtml(text)}</div>`;
    }
  }

  if (opts.renderSheetInfo) {
    const info = document.getElementById('sheetLinkInfo');
    if (info) {
      info.textContent = text;
    }
  }
}

function ensureSeasonSourceReady(options) {
  const seasonAlias = getSelectedSeasonAlias();
  if (seasonSourceReady && seasonAlias) {
    return true;
  }
  renderSeasonSourceBlockedUi(getSeasonSourceBlockedMessage(), options || {});
  return false;
}

function buildSeasonScopedAdminParams(extraParams) {
  const season = getSelectedSeasonAlias();
  const params = Object.assign({}, extraParams || {});
  if (season) {
    params.season = season;
  }
  const token = String(adminToken || '').trim();
  if (token) {
    params.adminToken = token;
  }
  return params;
}

function invalidateAttendanceDashboardLocalState() {
  attendanceDashboardPayload = null;
  attendanceDashboardDrilldownPayload = null;
  attendanceDashboardMemberSeriesCache = {};
  attendanceDashboardMemberHistoryCache = {};
  attendanceDashboardEventDrilldownCache = {};
  attendanceDashboardActiveSliceFilter = null;
  attendanceDashboardActiveSliceMembers = [];
  attendanceDashboardActiveStatusRankingRows = [];
  attendanceDashboardActiveDrilldownMode = '';
  attendanceDashboardCountDistributionItems = [];
  attendanceDashboardMemberHistoryModalState = null;
  attendanceDashboardLastFetchKey = '';
  attendanceDashboardLastFetchedAt = 0;
  attendanceDashboardLastRenderSignature = '';
  attendanceDashboardEventStatusRequestSeq = 0;
  if (typeof closeAttendanceDashboardMemberHistoryModal === 'function') {
    closeAttendanceDashboardMemberHistoryModal();
  }
}

function invalidateSeasonOperationalCaches(seasonAlias) {
  const season = normalizeSeasonAlias(seasonAlias || getSelectedSeasonAlias());
  if (season) {
    invalidateFrontCachePrefixes([
      buildFrontCacheKey('ranking', season),
      buildFrontCacheKey('schedule:list', season),
      buildFrontCacheKey('graduation:report', season),
      buildFrontCacheKey('dashboard:summary', season),
      buildFrontCacheKey('dashboard:drilldown', season),
      buildFrontCacheKey('sheetLink', season)
    ]);
  }
  invalidateAttendanceDashboardLocalState();
}

function invalidateAdminUsersCache() {
  invalidateFrontCachePrefixes('adminUsers:list');
}

function invalidateAdminUrlCache() {
  invalidateFrontCachePrefixes('adminUrl');
  adminQrCodeLoaded = false;
}

async function loadRankings(options) {
  const opts = options || {};
  if (Array.isArray(opts.data)) {
    displayRankings({ success: true, data: opts.data });
    return;
  }

  if (!ensureSeasonSourceReady({ renderRanking: true })) {
    return;
  }

  const season = getSelectedSeasonAlias();
  if (!season) {
    setSeasonSourceBlockedState('시즌 선택 정보를 확인할 수 없어 조회를 중단했습니다. 새로고침 후 다시 로그인해주세요.');
    renderSeasonSourceBlockedUi(getSeasonSourceBlockedMessage(), { renderRanking: true });
    return;
  }

  try {
    const cache = getFrontCache();
    const cacheKey = buildFrontCacheKey('ranking', season);
    const response = cache
      ? await cache.remember(
        cacheKey,
        FRONT_CACHE_TTL_RANKING_MS,
        () => CloudClubApi.call('ranking', buildSeasonScopedAdminParams()),
        { force: !!opts.forceReload }
      )
      : await CloudClubApi.call('ranking', buildSeasonScopedAdminParams());
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
  if (handleUnauthorizedError(error)) return;
  const rankingBoard = document.getElementById('rankingBoard');
  rankingBoard.innerHTML = `<div class="error">${escapeHtml(getDisplayErrorMessage(error, '순위를 불러오는 중 오류가 발생했습니다.'))}</div>`;
  console.error('Ranking error:', error);
}

async function loadSheets() {
  try {
    const payload = await CloudClubApi.call('adminSeasonList', {
      adminToken: adminToken
    });
    if (payload && currentAdminUser) {
      if (payload.role) currentAdminUser.role = payload.role;
      if (payload.season !== undefined) currentAdminUser.season = payload.season;
      if (payload.seasonAlias !== undefined) currentAdminUser.seasonAlias = payload.seasonAlias;
      updateAdminSessionBar();
    }
    const sheets = Array.isArray(payload && payload.sheets) ? payload.sheets : [];
    const sheetSelect = document.getElementById('sheetSelect');
    if (!sheetSelect) return;
    sheetSelect.innerHTML = '';

    if (!Array.isArray(sheets) || sheets.length === 0) {
      sheetSelect.innerHTML = '<option value="">사용 가능한 시즌 시트가 없습니다</option>';
      sheetSelect.disabled = true;
      setSeasonSourceBlockedState('사용 가능한 시즌 시트가 없습니다. 관리자 설정을 확인해주세요.');
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
    sheetSelect.disabled = !isSuperAdmin();
    if (!currentSeasonAlias) {
      setSeasonSourceBlockedState('시즌 선택 정보를 확인할 수 없어 조회를 중단했습니다. 새로고침 후 다시 로그인해주세요.');
    } else {
      setSeasonSourceReadyState();
    }
    syncImportSeasonInputByCurrentSelection();
    updateImportModeHintFromInput();
  } catch (error) {
    if (handleUnauthorizedError(error)) return;
    console.error('시트 목록 조회 실패:', error);
    setSeasonSourceBlockedState(DEFAULT_SEASON_SOURCE_BLOCK_MESSAGE);
    const sheetSelect = document.getElementById('sheetSelect');
    if (sheetSelect) {
      sheetSelect.innerHTML = '<option value="">시즌 목록을 불러오지 못했습니다.</option>';
      sheetSelect.disabled = true;
    }
  }
}

async function changeSheet() {
  const sheetName = getSelectedSheetName();
  if (!sheetName) return;

  if (!isSuperAdmin()) {
    currentSheetName = getSelectedSheetName();
    currentSeasonAlias = getSelectedSeasonAlias();
    syncImportSeasonInputByCurrentSelection();
    updateImportModeHintFromInput();
    await refreshSeasonData();
    return;
  }

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
      invalidateSeasonOperationalCaches(currentSeasonAlias);
      invalidateAdminUrlCache();
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
    if (error && error.code === 'FORBIDDEN') {
      alert('시즌 전환은 Super Admin 권한에서만 가능합니다.');
      return;
    }
    alert('시트 변경 중 오류가 발생했습니다: ' + getDisplayErrorMessage(error, '알 수 없는 오류'));
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
      if (typeof refreshStatusDashboardIfVisible === 'function' && getActiveTabName() === 'status') {
        refreshStatusDashboardIfVisible();
      }
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
  if (!ensureSeasonSourceReady({ renderCountdown: true, renderSheetInfo: true })) {
    return;
  }
  const season = getSelectedSeasonAlias();
  if (!season) {
    setSeasonSourceBlockedState('시즌 선택 정보를 확인할 수 없어 조회를 중단했습니다. 새로고침 후 다시 로그인해주세요.');
    renderSeasonSourceBlockedUi(getSeasonSourceBlockedMessage(), { renderCountdown: true, renderSheetInfo: true });
    return;
  }

  try {
    const session = await CloudClubApi.call('session', buildSeasonScopedAdminParams());
    renderCountdown(session);
    if (typeof syncAttendanceDashboardAutoRefresh === 'function') {
      syncAttendanceDashboardAutoRefresh({ immediate: false });
    }
  } catch (error) {
    if (handleUnauthorizedError(error)) return;
    renderCountdown({ active: false, message: getDisplayErrorMessage(error, '세션 정보를 불러올 수 없습니다.') });
    if (typeof syncAttendanceDashboardAutoRefresh === 'function') {
      syncAttendanceDashboardAutoRefresh({ immediate: false });
    }
  }
}

function openTab(tabName, evt) {
  const perfToken = startPerfMark('ui:open-tab', { tabName: tabName });
  if (SUPER_ONLY_TABS[tabName] && !isSuperAdmin()) {
    alert('해당 탭은 Super Admin 권한에서만 접근할 수 있습니다.');
    endPerfMark(perfToken, { status: 'blocked' });
    return;
  }

  const targetTab = document.getElementById(tabName);
  if (!targetTab || targetTab.classList.contains('is-hidden')) {
    endPerfMark(perfToken, { status: 'missing-target' });
    return;
  }

  document.querySelectorAll('.tab-content').forEach(tc => tc.classList.remove('active'));
  document.querySelectorAll('.tab-button').forEach(tb => tb.classList.remove('active'));
  targetTab.classList.add('active');
  if (evt && evt.currentTarget) {
    evt.currentTarget.classList.add('active');
  } else {
    const tabButton = getTabButtonByName(tabName);
    if (tabButton) {
      tabButton.classList.add('active');
    }
  }

  if (typeof syncAttendanceDashboardAutoRefresh === 'function') {
    syncAttendanceDashboardAutoRefresh({ immediate: false });
  }

  if (tabName === 'status') {
    loadAttendanceDashboard({ forceReload: !!isAttendanceActive });
    if (typeof flushAttendanceDashboardDeferredWork === 'function') {
      runWhenBrowserIdle(() => flushAttendanceDashboardDeferredWork(), 120);
    }
  }

  if (tabName === 'schedule') {
    loadScheduleList();
  }

  if (tabName === 'fortune') {
    refreshFortuneManagement();
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

  if (tabName === 'adminUsers') {
    loadAdminUsers();
  }

  if (tabName === 'generate' && !adminQrCodeLoaded) {
    loadAdminQrCode();
  }

  endPerfMark(perfToken, { status: 'ok' });
}

async function refreshSessionAndRanking() {
  await withPerfMark('data:refresh-session-and-ranking', async () => {
    await Promise.all([
      checkAttendanceSession(),
      loadRankings()
    ]);
  });
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
    const response = await CloudClubApi.call('attendance', buildSeasonScopedAdminParams({ phone: phoneNumber }));
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
    invalidateSeasonOperationalCaches(getSelectedSeasonAlias());

    if (getActiveTabName() === 'status') {
      refreshStatusDashboardIfVisible();
    } else {
      loadRankings({ forceReload: true });
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
  if (handleUnauthorizedError(error)) return;
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
    const response = await CloudClubApi.call('status', buildSeasonScopedAdminParams({ phone: phoneNumber }));
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
  if (handleUnauthorizedError(error)) return;
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

function getManualSessionDateKey(item) {
  const directDateKey = String(item && item.dateKey || '').trim();
  if (directDateKey) {
    return directDateKey;
  }
  return getDateKeyFromMs(item && item.startTime);
}

function getClosestManualSessionItem(items) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return null;

  const dayMs = 24 * 60 * 60 * 1000;
  const todayDate = parseDateKeyToDate(getDateKeyFromDate(new Date()));
  const nowMs = Date.now();
  let bestItem = list[0];
  let bestRank = null;

  list.forEach(item => {
    const dateKey = getManualSessionDateKey(item);
    const sessionDate = parseDateKeyToDate(dateKey);
    const startMs = Number(item && item.startTime || 0);
    let rank = null;

    if (todayDate && sessionDate) {
      const diffDays = Math.round((sessionDate.getTime() - todayDate.getTime()) / dayMs);
      rank = [
        0,
        Math.abs(diffDays),
        diffDays < 0 ? 1 : 0,
        startMs || Number.POSITIVE_INFINITY
      ];
    } else {
      rank = [
        1,
        startMs ? Math.abs(startMs - nowMs) : Number.POSITIVE_INFINITY,
        startMs && startMs >= nowMs ? 0 : 1,
        startMs || Number.POSITIVE_INFINITY
      ];
    }

    if (!bestRank) {
      bestItem = item;
      bestRank = rank;
      return;
    }

    for (let i = 0; i < rank.length; i += 1) {
      if (rank[i] === bestRank[i]) continue;
      if (rank[i] < bestRank[i]) {
        bestItem = item;
        bestRank = rank;
      }
      return;
    }
  });

  return bestItem;
}

function populateManualSessionSelect(items) {
  const select = document.getElementById('manualSessionSelect');
  if (!select) return;
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

  const targetItem = getClosestManualSessionItem(items);
  select.value = targetItem && targetItem.sessionKey ? targetItem.sessionKey : items[0].sessionKey;
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
  scheduleManualMemberListRender();
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

function buildManualMemberRowHtml(member) {
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
}

function renderManualMemberList() {
  const perfToken = startPerfMark('render:manual-member-list');
  const wrap = document.getElementById('manualMemberListWrap');
  if (!wrap) {
    endPerfMark(perfToken, { status: 'missing-wrap' });
    return;
  }

  manualMemberListRenderToken += 1;
  const renderToken = manualMemberListRenderToken;

  const sessionKey = String(manualApproveState.sessionKey || '').trim();
  const members = Array.isArray(manualApproveState.members) ? manualApproveState.members : [];
  const filtered = getManualMemberFilteredList();
  manualApproveState.filteredMembers = filtered;

  updateManualMemberMeta(filtered);
  syncManualApproveSubmitState();

  if (!sessionKey) {
    wrap.classList.remove('manual-member-list-cv');
    wrap.innerHTML = '<p class="info-text" style="padding: 12px;">승인할 회차를 먼저 선택해주세요.</p>';
    endPerfMark(perfToken, { status: 'no-session' });
    return;
  }

  if (members.length === 0) {
    wrap.classList.remove('manual-member-list-cv');
    wrap.innerHTML = '<p class="info-text" style="padding: 12px;">회원 목록이 없습니다.</p>';
    endPerfMark(perfToken, { status: 'no-members' });
    return;
  }

  if (filtered.length === 0) {
    wrap.classList.remove('manual-member-list-cv');
    wrap.innerHTML = '<p class="info-text" style="padding: 12px;">조건에 맞는 회원이 없습니다.</p>';
    endPerfMark(perfToken, { status: 'no-filtered' });
    return;
  }

  const useContentVisibility = isAdminPerfUiEnabled()
    && filtered.length >= MANUAL_MEMBER_CONTENT_VISIBILITY_THRESHOLD;
  wrap.classList.toggle('manual-member-list-cv', useContentVisibility);
  wrap.innerHTML = '';

  const chunkSize = Math.max(1, Number(MANUAL_MEMBER_RENDER_CHUNK_SIZE || 24));
  let cursor = 0;

  const renderChunk = () => {
    if (renderToken !== manualMemberListRenderToken) {
      return;
    }

    const end = Math.min(cursor + chunkSize, filtered.length);
    let rows = '';
    for (let i = cursor; i < end; i += 1) {
      rows += buildManualMemberRowHtml(filtered[i]);
    }
    wrap.insertAdjacentHTML('beforeend', rows);
    cursor = end;

    if (cursor < filtered.length) {
      requestAnimationFrame(renderChunk);
      return;
    }

    endPerfMark(perfToken, {
      status: 'ok',
      visibleMembers: filtered.length,
      chunkSize: chunkSize,
      contentVisibility: useContentVisibility
    });
  };

  renderChunk();
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

  const cachedReport = graduationReportCache;
  const cachedSeasonAlias = normalizeSeasonAlias(
    cachedReport && (
      cachedReport.seasonAlias
      || cachedReport.currentSheet
      || cachedReport.sheetName
      || cachedReport.season
    )
  );
  if (
    cachedReport
    && cachedReport.success
    && Array.isArray(cachedReport.members)
    && cachedSeasonAlias
    && cachedSeasonAlias === normalizeSeasonAlias(season)
  ) {
    manualApproveState.statusByPhone = buildManualStatusByPhoneFromReport(cachedReport, sessionKey);
    manualApproveState.statusLoadedSeasonAlias = season;
    manualApproveState.statusLoadedSessionKey = sessionKey;
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
    invalidateSeasonOperationalCaches(getSelectedSeasonAlias());

    await Promise.all([
      refreshSessionAndRanking(),
      loadGraduationReport({ forceReload: true })
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
