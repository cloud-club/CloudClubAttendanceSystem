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
    const phoneInput = document.getElementById('phoneInput');
    const statusPhoneInput = document.getElementById('statusPhoneInput');
    const manualPhoneInput = document.getElementById('manualPhoneInput');

    if (phoneInput) phoneInput.value = savedPhone;
    if (statusPhoneInput) statusPhoneInput.value = savedPhone;
    if (manualPhoneInput) manualPhoneInput.value = savedPhone;
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

  document.getElementById('phoneInput').addEventListener('click', function () {
    this.focus();
  });
  document.getElementById('statusPhoneInput').addEventListener('click', function () {
    this.focus();
  });

  if (!calendarSelectedDateKey) {
    calendarSelectedDateKey = getDateKeyFromDate(new Date());
  }

  resetScheduleForm();
}

async function refreshSeasonData() {
  await Promise.all([
    refreshSessionAndRanking(),
    loadSheetLinkInfo()
  ]);

  const activeTab = getActiveTabName();
  if (activeTab === 'schedule' || activeTab === 'attend') {
    await loadScheduleList();
    return;
  }

  if (activeTab === 'variables') {
    await loadVariables();
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

async function loadRankings() {
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
        <td><span class="grade-badge">${escapeHtml(item.grade)}</span>${escapeHtml(item.name)}</td>
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
  attendBtn.disabled = false;

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
    loadRankings();
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

    let message = `✅ <span class="grade-badge">${escapeHtml(response.grade)}</span>${escapeHtml(response.name)}님, ${escapeHtml(response.time)} 출석 완료! ${typeBadge}`;

    if (response.attendanceInfo) {
      const info = response.attendanceInfo;
      message += `
        <div class="attendance-info">
          <h3><span class="grade-badge">${escapeHtml(response.grade)}</span>${escapeHtml(response.name)}님 출석 현황</h3>
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

    loadRankings();
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
          <h3><span class="grade-badge">${escapeHtml(data.grade)}</span>${escapeHtml(data.name)}님 출석 현황</h3>
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

function populateManualSessionSelect(items) {
  const select = document.getElementById('manualSessionSelect');
  if (!select) return;

  select.innerHTML = '';

  if (!items || items.length === 0) {
    select.innerHTML = '<option value="">회차가 없습니다</option>';
    return;
  }

  items.forEach(item => {
    const opt = document.createElement('option');
    opt.value = item.sessionKey;
    opt.textContent = `${item.sessionKey} (${item.startLabel} ~ ${item.endLabel})`;
    select.appendChild(opt);
  });
}

async function manualApprove(event) {
  event.preventDefault();

  const season = getSelectedSeasonAlias();
  const phone = document.getElementById('manualPhoneInput').value.trim();
  const sessionKey = document.getElementById('manualSessionSelect').value;

  if (!season) {
    alert('시즌이 선택되지 않았습니다.');
    return;
  }

  if (!/^010[0-9]{8}$/.test(phone)) {
    alert('전화번호 형식이 올바르지 않습니다. (예: 01012345678)');
    return;
  }

  if (!sessionKey) {
    alert('승인할 회차를 선택해주세요.');
    return;
  }

  const btn = document.getElementById('manualApproveBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="loader"></span> <span>처리 중...</span>';

  try {
    const response = await CloudClubApi.call('manualApprove', {
      season,
      phone,
      sessionKey,
      adminToken
    });

    if (!response.success) {
      showBoxMessage('manualApproveResult', `❌ ${escapeHtml(response.message || '수동 승인 실패')}`, false);
      return;
    }

    localStorage.setItem('lastUsedPhone', phone);
    showBoxMessage('manualApproveResult', `✅ ${escapeHtml(response.name)}님 ${escapeHtml(response.sessionKey)} 수동 승인 완료 (${escapeHtml(response.time)})`, true);
    showToast('<i class="fas fa-check-circle"></i> 수동 승인 완료', true);

    await Promise.all([
      refreshSessionAndRanking(),
      loadGraduationReport()
    ]);
  } catch (error) {
    if (handleUnauthorizedError(error)) return;
    showBoxMessage('manualApproveResult', `❌ ${escapeHtml(getDisplayErrorMessage(error, '수동 승인 중 오류'))}`, false);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-user-check"></i> <span>수동 승인 실행</span>';
  }
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

async function loadVariables() {
  try {
    const response = await CloudClubApi.call('variablesGet', {
      adminToken
    });

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
    document.getElementById('variablesTableWrap').innerHTML = `<div class="error">${escapeHtml(getDisplayErrorMessage(error, '변수 조회 중 오류'))}</div>`;
  }
}

async function saveVariables() {
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

async function loadMembers() {
  const season = getSelectedSeasonAlias();
  if (!season) return;

  try {
    const response = await CloudClubApi.call('members', {
      season,
      adminToken
    });

    if (!response.success) {
      membersCache = [];
      return;
    }

    membersCache = response.members || [];
  } catch (error) {
    if (handleUnauthorizedError(error)) return;
    console.error('회원 목록 로딩 실패:', error);
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
      <td><span class="grade-badge">${escapeHtml(member.grade)}</span>${escapeHtml(member.name)}</td>
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
    const grade = String(member.grade || '').toLowerCase();
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
          <span class="grade-badge">${escapeHtml(member.grade)}</span>${escapeHtml(member.name)}<br>
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
