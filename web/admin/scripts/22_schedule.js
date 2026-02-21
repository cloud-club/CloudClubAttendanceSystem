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

async function loadScheduleList(options) {
  const opts = options || {};
  const season = getSelectedSeasonAlias();
  if (!season) return;
  const perfToken = startPerfMark('data:load-schedule-list', {
    season: season,
    forceReload: !!opts.forceReload
  });

  try {
    const cache = getFrontCache();
    const cacheKey = buildFrontCacheKey('schedule:list', season);
    const response = cache
      ? await cache.remember(
        cacheKey,
        FRONT_CACHE_TTL_SCHEDULE_MS,
        () => CloudClubApi.call('scheduleList', {
          season,
          adminToken
        }),
        { force: !!opts.forceReload }
      )
      : await CloudClubApi.call('scheduleList', {
        season,
        adminToken
      });

    if (!response.success) {
      document.getElementById('scheduleTableWrap').innerHTML = `<div class="error">${escapeHtml(response.message || '일정 조회 실패')}</div>`;
      const calendarGrid = document.getElementById('scheduleCalendarGrid');
      if (calendarGrid) {
        calendarGrid.innerHTML = `<div class="error">${escapeHtml(response.message || '캘린더 조회 실패')}</div>`;
      }
      endPerfMark(perfToken, { status: 'error-response' });
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
    endPerfMark(perfToken, {
      status: 'ok',
      scheduleCount: Array.isArray(scheduleItems) ? scheduleItems.length : 0
    });
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
    endPerfMark(perfToken, {
      status: 'exception',
      code: error && error.code ? error.code : ''
    });
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
    invalidateSeasonOperationalCaches(season);

    await Promise.all([
      loadScheduleList({ forceReload: true }),
      checkAttendanceSession(),
      loadGraduationReport({ forceReload: true })
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
    invalidateSeasonOperationalCaches(season);
    await Promise.all([
      loadScheduleList({ forceReload: true }),
      checkAttendanceSession(),
      loadGraduationReport({ forceReload: true })
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
    invalidateSeasonOperationalCaches(options.season);

    await Promise.all([
      loadScheduleList({ forceReload: true }),
      checkAttendanceSession(),
      loadGraduationReport({ forceReload: true })
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

  text.textContent = `${state.sessionKey} 회차에 ${state.attendanceRecordCount}건의 기록이 있습니다. 아래 회차 키를 복사해서 그대로 입력하면 강제 삭제가 진행됩니다.`;
  input.value = '';
  modal.style.display = 'flex';
  setTimeout(() => input.focus(), 0);
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
    alert(`회차 키가 일치하지 않습니다. 아래에 표시된 그대로 입력하세요. (${expected})`);
    return;
  }

  await requestScheduleDelete({
    season: scheduleDeleteForceState.season,
    sessionKey: expected,
    forceDelete: true,
    confirmSessionKey: typed
  });
}
