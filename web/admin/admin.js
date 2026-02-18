let countdownInterval;
let isAttendanceActive = false;
let currentSeasonUrl = '';
let adminToken = '';
let currentSheetName = '';
let currentSeasonAlias = '';
let scheduleItems = [];
let membersCache = [];
let variableItems = [];
let graduationReportCache = null;
let excuseModalState = null;

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
    loadSheets(),
    loadVariables()
  ]);

  await refreshSeasonData();

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

  document.getElementById('phoneInput').addEventListener('click', function () {
    this.focus();
  });
  document.getElementById('statusPhoneInput').addEventListener('click', function () {
    this.focus();
  });
}

async function refreshSeasonData() {
  await Promise.all([
    refreshSessionAndRanking(),
    loadScheduleList(),
    loadMembers(),
    loadSheetLinkInfo()
  ]);
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

function displayRankings(response) {
  const rankingBoard = document.getElementById('rankingBoard');

  if (!response.success) {
    rankingBoard.innerHTML = `<div class="error">순위를 불러올 수 없습니다: ${escapeHtml(response.message || '')}</div>`;
    return;
  }

  const rankings = response.data;
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
          <th>평균 출석 시간</th>
        </tr>
      </thead>
      <tbody>
  `;

  rankings.forEach(item => {
    const rankDisplay = item.rank <= 3
      ? `<span class="rank-medal rank-${item.rank}">${item.rank}</span>`
      : `<span style="color: #94a3b8;">${item.rank}</span>`;

    const avgTimeDisplay = item.avgAttendTime === '미출석'
      ? '<span style="color: #64748b;">-</span>'
      : `<span style="color: #60a5fa;">${escapeHtml(item.avgAttendTime)}</span>`;

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

        const minutes = Math.floor((remain % (1000 * 60 * 60)) / (1000 * 60));
        const seconds = Math.floor((remain % (1000 * 60)) / 1000);
        countdownTitle.textContent = '출석 오픈까지 남은 시간';
        countdownDiv.textContent = `${String(minutes).padStart(2, '0')}분 ${String(seconds).padStart(2, '0')}초`;
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
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
    countdownDiv.textContent = `${String(minutes).padStart(2, '0')}분 ${String(seconds).padStart(2, '0')}초`;
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

function resetScheduleForm() {
  const select = document.getElementById('scheduleSessionSelect');
  const startInput = document.getElementById('scheduleStartInput');
  const endInput = document.getElementById('scheduleEndInput');

  if (select) select.value = '';
  if (startInput) startInput.value = '';
  if (endInput) endInput.value = '';
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
  if (!key) {
    document.getElementById('scheduleStartInput').value = '';
    document.getElementById('scheduleEndInput').value = '';
    return;
  }

  const found = scheduleItems.find(item => item.sessionKey === key);
  if (!found) return;

  document.getElementById('scheduleStartInput').value = formatDatetimeLocal(found.startTime);
  document.getElementById('scheduleEndInput').value = found.explicitEndAt || '';
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
      return;
    }

    scheduleItems = response.items || [];
    renderScheduleTable(scheduleItems);
    populateScheduleSelect(scheduleItems);
    populateManualSessionSelect(scheduleItems);
  } catch (error) {
    if (handleUnauthorizedError(error)) return;
    const wrap = document.getElementById('scheduleTableWrap');
    if (wrap) {
      wrap.innerHTML = `<div class="error">${escapeHtml(getDisplayErrorMessage(error, '일정 조회 중 오류'))}</div>`;
    }
  }
}

async function saveSchedule(event) {
  event.preventDefault();

  const season = getSelectedSeasonAlias();
  const sessionKey = document.getElementById('scheduleSessionSelect').value;
  const startAt = document.getElementById('scheduleStartInput').value;
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
  btn.innerHTML = '<span class="loader"></span> <span>저장 중...</span>';

  try {
    const response = await CloudClubApi.call('scheduleSave', {
      season,
      sessionKey,
      startAt,
      endAt,
      adminToken
    });

    if (!response.success) {
      showBoxMessage('scheduleActionResult', `❌ ${escapeHtml(response.message || '일정 저장 실패')}`, false);
      return;
    }

    showBoxMessage('scheduleActionResult', `✅ ${escapeHtml(response.message || '일정 저장 완료')}`, true);
    showToast('<i class="fas fa-check-circle"></i> 일정 저장 완료', true);

    await Promise.all([
      loadScheduleList(),
      checkAttendanceSession(),
      loadGraduationReport()
    ]);

    resetScheduleForm();
  } catch (error) {
    if (handleUnauthorizedError(error)) return;
    showBoxMessage('scheduleActionResult', `❌ ${escapeHtml(getDisplayErrorMessage(error, '일정 저장 중 오류'))}`, false);
  } finally {
    btn.disabled = false;
    btn.innerHTML = '<i class="fas fa-save"></i> <span>일정 저장</span>';
  }
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

  try {
    const response = await CloudClubApi.call('scheduleDelete', {
      season,
      sessionKey,
      adminToken
    });

    if (!response.success) {
      showBoxMessage('scheduleActionResult', `❌ ${escapeHtml(response.message || '일정 삭제 실패')}`, false);
      return;
    }

    showBoxMessage('scheduleActionResult', `✅ ${escapeHtml(response.message || '일정 삭제 완료')}`, true);

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

    return `
      <tr>
        <td>${escapeHtml(item.key)}</td>
        <td>
          <input class="table-input" id="var-value-${idx}" data-key="${escapeHtml(item.key)}" data-type="${escapeHtml(item.type || 'string')}" data-description="${escapeHtml(item.description || '')}" ${disabledAttr} value="${escapeHtml(valueText)}">
        </td>
        <td>${escapeHtml(item.type || 'string')}</td>
        <td>${escapeHtml(item.description || '')}</td>
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

async function loadVariables() {
  try {
    const response = await CloudClubApi.call('variablesGet', {
      adminToken
    });

    if (!response.success) {
      document.getElementById('variablesTableWrap').innerHTML = `<div class="error">${escapeHtml(response.message || '변수 조회 실패')}</div>`;
      return;
    }

    variableItems = response.items || [];
    renderVariablesTable(variableItems);
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

  const payload = variableItems.map((item, idx) => {
    const input = document.getElementById(`var-value-${idx}`);
    const value = input ? input.value : item.value;

    return {
      key: item.key,
      value,
      type: item.type,
      description: item.description,
      editable: item.editable
    };
  });

  try {
    const response = await CloudClubApi.call('variablesUpdate', {
      adminToken,
      itemsJson: JSON.stringify(payload)
    });

    if (!response.success) {
      showBoxMessage('variablesResult', `❌ ${escapeHtml(response.message || '변수 저장 실패')}`, false);
      return;
    }

    showBoxMessage('variablesResult', '✅ 변수 저장 완료 (legacy A2:C2 동기화 포함)', true);
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

function renderGraduationTable(report) {
  const wrap = document.getElementById('graduationTableWrap');
  if (!wrap) return;

  const members = report.members || [];
  if (members.length === 0) {
    wrap.innerHTML = '<p class="info-text">회원 데이터가 없습니다.</p>';
    return;
  }

  const rows = members.map(member => `
    <tr>
      <td><span class="grade-badge">${escapeHtml(member.grade)}</span>${escapeHtml(member.name)}</td>
      <td>${escapeHtml(member.phone)}</td>
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
          <th>회원</th>
          <th>연락처</th>
          <th>출석</th>
          <th>지각</th>
          <th>결석</th>
          <th>유고</th>
          <th>결석환산</th>
          <th>판정</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
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

function renderGraduationMatrix(report) {
  const wrap = document.getElementById('graduationMatrixWrap');
  if (!wrap) return;

  const sessions = report.sessions || [];
  const members = report.members || [];

  if (sessions.length === 0 || members.length === 0) {
    wrap.innerHTML = '<p class="info-text">매트릭스를 표시할 데이터가 없습니다.</p>';
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
  const matrixWrap = document.getElementById('graduationMatrixWrap');

  if (tableWrap) tableWrap.innerHTML = '<div class="loader" style="margin: 24px auto;"></div>';
  if (matrixWrap) matrixWrap.innerHTML = '<div class="loader" style="margin: 24px auto;"></div>';

  try {
    const response = await CloudClubApi.call('graduationReport', {
      season,
      adminToken
    });

    if (!response.success) {
      if (tableWrap) tableWrap.innerHTML = `<div class="error">${escapeHtml(response.message || '수료 판정 조회 실패')}</div>`;
      if (matrixWrap) matrixWrap.innerHTML = '';
      return;
    }

    graduationReportCache = response;

    renderGraduationSummary(response);
    renderGraduationTable(response);
    renderGraduationMatrix(response);
  } catch (error) {
    if (handleUnauthorizedError(error)) return;
    if (tableWrap) tableWrap.innerHTML = `<div class="error">${escapeHtml(getDisplayErrorMessage(error, '수료 판정 조회 중 오류'))}</div>`;
    if (matrixWrap) matrixWrap.innerHTML = '';
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

  await applyExcusedChange({
    phone: excuseModalState.phone,
    sessionKey: excuseModalState.sessionKey,
    enabled: true,
    comment
  });

  closeExcuseModal();
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

  openExcuseModal({
    phone,
    sessionKey,
    memberName,
    note
  });
}

async function applyExcusedChange(payload) {
  const season = getSelectedSeasonAlias();
  if (!season) {
    alert('시즌 정보가 없습니다.');
    return;
  }

  try {
    const response = await CloudClubApi.call('excusedSet', {
      season,
      phone: payload.phone,
      sessionKey: payload.sessionKey,
      enabled: payload.enabled ? 'true' : 'false',
      comment: payload.comment || '',
      adminToken
    });

    if (!response.success) {
      alert(response.message || '유고 처리에 실패했습니다.');
      return;
    }

    showToast(`<i class="fas fa-check-circle"></i> ${escapeHtml(response.message || '유고 반영 완료')}`, true);

    await Promise.all([
      loadGraduationReport(),
      loadRankings()
    ]);
  } catch (error) {
    if (handleUnauthorizedError(error)) return;
    alert(getDisplayErrorMessage(error, '유고 처리 중 오류가 발생했습니다.'));
  }
}

document.addEventListener('DOMContentLoaded', () => {
  initializeDashboard().catch((error) => {
    alert(getDisplayErrorMessage(error, '초기화 중 오류가 발생했습니다.'));
    console.error(error);
  });
});
