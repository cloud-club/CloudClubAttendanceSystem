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
  if (typeof scheduleExcusedMatrixRender === 'function') {
    scheduleExcusedMatrixRender();
    return;
  }
  if (graduationReportCache) renderGraduationMatrix(graduationReportCache);
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

function buildGraduationMatrixRowHtml(member, sessions) {
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
}

function renderGraduationMatrix(report) {
  const wrap = document.getElementById('excusedMatrixWrap');
  const meta = document.getElementById('excusedFilterMeta');
  if (!wrap) return;

  graduationMatrixRenderToken += 1;
  const renderToken = graduationMatrixRenderToken;

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
  const useStickyColumn = members.length <= MATRIX_STICKY_ROW_LIMIT;
  const tableClass = useStickyColumn ? 'matrix-table' : 'matrix-table matrix-no-sticky';

  wrap.innerHTML = `
    <table class="${tableClass}">
      <thead>
        <tr>
          <th class="sticky-col">회원/연락처</th>
          ${headCells}
        </tr>
      </thead>
      <tbody></tbody>
    </table>
  `;

  const tbody = wrap.querySelector('tbody');
  if (!tbody) return;

  const chunkSize = Math.max(1, Number(MATRIX_RENDER_CHUNK_SIZE || 24));
  let index = 0;

  const renderChunk = () => {
    if (renderToken !== graduationMatrixRenderToken) {
      return;
    }
    const end = Math.min(index + chunkSize, members.length);
    let rowsHtml = '';
    for (let i = index; i < end; i += 1) {
      rowsHtml += buildGraduationMatrixRowHtml(members[i], sessions);
    }
    tbody.insertAdjacentHTML('beforeend', rowsHtml);
    index = end;
    if (index < members.length) {
      requestAnimationFrame(renderChunk);
    }
  };

  renderChunk();
}

const scheduleExcusedMatrixRender = debounce(() => {
  if (graduationReportCache) {
    renderGraduationMatrix(graduationReportCache);
  }
}, 250);

async function loadGraduationReport(options) {
  const opts = options || {};
  const season = getSelectedSeasonAlias();
  if (!season) return;
  const perfToken = startPerfMark('data:load-graduation-report', {
    season: season,
    forceReload: !!opts.forceReload
  });
  const normalizedSeasonAlias = normalizeSeasonAlias(season);
  const cachedSeasonAlias = normalizeSeasonAlias(
    graduationReportCache && (
      graduationReportCache.seasonAlias
      || graduationReportCache.currentSheet
      || graduationReportCache.sheetName
      || graduationReportCache.season
    )
  );
  if (!opts.forceReload && graduationReportCache && cachedSeasonAlias && cachedSeasonAlias === normalizedSeasonAlias) {
    renderGraduationSummary(graduationReportCache);
    renderGraduationTable(graduationReportCache);
    renderGraduationMatrix(graduationReportCache);
    endPerfMark(perfToken, { status: 'memory-cache' });
    return;
  }

  const cacheKey = buildFrontCacheKey('graduation:report', season);
  const frontCache = getFrontCache();
  const frontCached = !opts.forceReload && frontCache ? frontCache.get(cacheKey) : null;
  if (frontCached && frontCached.success) {
    graduationReportCache = frontCached;
    graduationVisibleCount = 20;
    renderGraduationSummary(frontCached);
    renderGraduationTable(frontCached);
    renderGraduationMatrix(frontCached);
    endPerfMark(perfToken, { status: 'front-cache' });
    return;
  }

  const tableWrap = document.getElementById('graduationTableWrap');
  const matrixWrap = document.getElementById('excusedMatrixWrap');
  const loadMoreWrap = document.getElementById('graduationLoadMoreWrap');
  const matrixMeta = document.getElementById('excusedFilterMeta');

  if (tableWrap) tableWrap.innerHTML = '<div class="loader" style="margin: 24px auto;"></div>';
  if (matrixWrap) matrixWrap.innerHTML = '<div class="loader" style="margin: 24px auto;"></div>';
  if (loadMoreWrap) loadMoreWrap.innerHTML = '';
  if (matrixMeta) matrixMeta.textContent = '불러오는 중...';

  try {
    const response = frontCache
      ? await frontCache.remember(
        cacheKey,
        FRONT_CACHE_TTL_GRADUATION_MS,
        () => CloudClubApi.call('graduationReport', {
          season,
          adminToken
        }),
        { force: !!opts.forceReload }
      )
      : await CloudClubApi.call('graduationReport', {
        season,
        adminToken
      });

    if (!response.success) {
      if (tableWrap) tableWrap.innerHTML = `<div class="error">${escapeHtml(response.message || '수료 판정 조회 실패')}</div>`;
      if (matrixWrap) matrixWrap.innerHTML = '';
      if (loadMoreWrap) loadMoreWrap.innerHTML = '';
      if (matrixMeta) matrixMeta.textContent = '표시 0명 / 전체 0명';
      endPerfMark(perfToken, { status: 'error-response' });
      return;
    }

    graduationReportCache = response;
    graduationVisibleCount = 20;

    renderGraduationSummary(response);
    renderGraduationTable(response);
    renderGraduationMatrix(response);
    endPerfMark(perfToken, {
      status: 'ok',
      memberCount: Array.isArray(response.members) ? response.members.length : 0
    });
  } catch (error) {
    if (handleUnauthorizedError(error)) return;
    if (tableWrap) tableWrap.innerHTML = `<div class="error">${escapeHtml(getDisplayErrorMessage(error, '수료 판정 조회 중 오류'))}</div>`;
    if (matrixWrap) matrixWrap.innerHTML = '';
    if (loadMoreWrap) loadMoreWrap.innerHTML = '';
    if (matrixMeta) matrixMeta.textContent = '표시 0명 / 전체 0명';
    endPerfMark(perfToken, {
      status: 'exception',
      code: error && error.code ? error.code : ''
    });
  }
}

function openExcuseModal(state) {
  excuseModalState = state;

  const modal = document.getElementById('excuseModal');
  const target = document.getElementById('excuseModalTargetText');
  const disclosure = document.getElementById('excuseModalDisclosureText');
  const input = document.getElementById('excuseCommentInput');

  if (!modal || !target || !disclosure || !input) return;

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
    invalidateSeasonOperationalCaches(season);

    await Promise.all([
      loadGraduationReport({ forceReload: true }),
      loadRankings({ forceReload: true })
    ]);
    await refreshStatusDashboardIfVisible();
    return response;
  } catch (error) {
    if (handleUnauthorizedError(error)) return;
    alert(getDisplayErrorMessage(error, '유고 처리 중 오류가 발생했습니다.'));
    return null;
  }
}
