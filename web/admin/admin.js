let countdownInterval;
let isAttendanceActive = false;
let currentSeasonUrl = '';
let adminToken = '';
let currentSheetName = '';

function getSelectedSheetName() {
  const sheetSelect = document.getElementById('sheetSelect');
  return sheetSelect ? sheetSelect.value : '';
}

function getDisplayErrorMessage(error, fallbackMessage) {
  if (error && error.code === 'NETWORK_ERROR') {
    return 'API 서버 응답 스크립트를 불러오지 못했습니다. (리다이렉트/ORB 가능성) 잠시 후 다시 시도해주세요.';
  }

  return (error && error.message) ? error.message : fallbackMessage;
}

function createConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const particles = [];
  const colors = ['#60a5fa', '#3b82f6', '#93bbfc', '#dbeafe', '#fbbf24', '#f59e0b', '#a78bfa', '#e9d5ff'];

  for (let i = 0; i < 150; i++) {
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
  }, 5000);
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

  await refreshSessionAndRanking();

  const savedPhone = localStorage.getItem('lastUsedPhone');
  if (savedPhone) {
    document.getElementById('phoneInput').value = savedPhone;
    document.getElementById('statusPhoneInput').value = savedPhone;
  }

  document.getElementById('phoneInput').addEventListener('click', function () {
    this.focus();
  });
  document.getElementById('statusPhoneInput').addEventListener('click', function () {
    this.focus();
  });
}

async function loadAdminQrCode() {
  try {
    const response = await CloudClubApi.call('adminUrl');
    createQrCode(response.url);
  } catch (error) {
    console.error('관리자 URL 로드 실패:', error);
  }
}

async function generateSeasonQRCode() {
  const selectedSeason = getSelectedSheetName();

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

  const successMsg = document.createElement('div');
  successMsg.className = 'success';
  successMsg.style.cssText = 'position: fixed; top: 20px; right: 20px; padding: 16px 24px; border-radius: 12px; z-index: 1000; max-width: 300px;';
  successMsg.innerHTML = '<i class="fas fa-check-circle"></i> 학생용 QR코드가 생성되었습니다!';
  document.body.appendChild(successMsg);

  setTimeout(() => {
    successMsg.remove();
  }, 3000);
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
    }, 2000);
  }).catch(() => {
    alert('URL 복사에 실패했습니다.');
  });
}

async function loadRankings() {
  const season = currentSheetName || getSelectedSheetName();

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
    rankingBoard.innerHTML = `<div class="error">순위를 불러올 수 없습니다: ${response.message || ''}</div>`;
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
      : `<span style="color: #60a5fa;">${item.avgAttendTime}</span>`;

    tableHTML += `
      <tr>
        <td>${rankDisplay}</td>
        <td><span class="grade-badge">${item.grade}</span>${item.name}</td>
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
  rankingBoard.innerHTML = `<div class="error">${getDisplayErrorMessage(error, '순위를 불러오는 중 오류가 발생했습니다.')}</div>`;
  console.error('Ranking error:', error);
}

async function loadSheets() {
  try {
    const sheets = await CloudClubApi.call('sheets');
    const sheetSelect = document.getElementById('sheetSelect');
    sheetSelect.innerHTML = '';

    if (!Array.isArray(sheets) || sheets.length === 0) {
      sheetSelect.innerHTML = '<option value="">사용 가능한 시트가 없습니다</option>';
      currentSheetName = '';
      return;
    }

    sheets.forEach(sheet => {
      const option = document.createElement('option');
      option.value = sheet.name;
      option.textContent = sheet.name;
      if (sheet.isActive) {
        option.selected = true;
      }
      sheetSelect.appendChild(option);
    });

    currentSheetName = sheetSelect.value;
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

    handleSheetChange(response);
  } catch (error) {
    handleSheetChangeError(error);
  }
}

async function handleSheetChange(response) {
  if (response.success) {
    currentSheetName = getSelectedSheetName();

    const resultDiv = document.createElement('div');
    resultDiv.className = 'success';
    resultDiv.style.cssText = 'position: fixed; top: 20px; right: 20px; padding: 16px 24px; border-radius: 12px; z-index: 1000;';
    resultDiv.innerHTML = `<i class="fas fa-check-circle"></i> ${response.message}`;
    document.body.appendChild(resultDiv);

    setTimeout(() => {
      resultDiv.remove();
    }, 3000);

    await refreshSessionAndRanking();

    const seasonQR = document.getElementById('seasonQrcode');
    const studentUrlDiv = document.getElementById('studentUrl');
    seasonQR.style.display = 'none';
    seasonQR.classList.add('blurred');
    studentUrlDiv.style.display = 'none';
  } else {
    alert(response.message);
  }
}

function handleSheetChangeError(error) {
  if (error.code === 'UNAUTHORIZED') {
    sessionStorage.removeItem('cc_admin_token');
    alert('관리자 인증이 만료되었습니다. 페이지를 새로고침 후 다시 인증해주세요.');
    return;
  }

  alert('시트 변경 중 오류가 발생했습니다: ' + getDisplayErrorMessage(error, '알 수 없는 오류'));
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

  if (!session.active) {
    countdownTitle.textContent = '출석 대기 중';
    countdownDiv.textContent = session.message || '지금은 출석 가능한 시간이 아닙니다.';
    isAttendanceActive = false;
    attendBtn.disabled = true;
    attendBtn.innerHTML = '<i class="fas fa-times"></i> <span>출석 불가</span>';
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
      isAttendanceActive = false;
      attendBtn.disabled = true;
      attendBtn.innerHTML = '<i class="fas fa-times"></i> <span>출석 마감</span>';
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
  const season = currentSheetName || getSelectedSheetName();

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

  const season = currentSheetName || getSelectedSheetName();
  if (!season) {
    alert('선택된 시트가 없습니다.');
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

    let message = `✅ <span class="grade-badge">${response.grade}</span>${response.name}님, ${response.time} 출석 완료! ${typeBadge}`;

    if (response.attendanceInfo) {
      const info = response.attendanceInfo;
      message += `
        <div class="attendance-info">
          <h3><span class="grade-badge">${response.grade}</span>${response.name}님 출석 현황</h3>
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
            현재까지 ${info.currentSession}회차 중 ${info.attended}회 출석
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
          <p class="fortune-text">${response.fortune}</p>
        </div>
      `;
    }

    resultDiv.innerHTML = message;
    resultDiv.className = 'success';
    attendBtn.innerHTML = '<i class="fas fa-check-circle"></i> <span>출석 완료</span>';
  } else {
    resultDiv.innerHTML = `❌ ${response.message}`;
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
  }, response.success ? 15000 : 5000);
}

function handleAttendanceError(error) {
  const resultDiv = document.getElementById('result');
  const attendBtn = document.getElementById('attendBtn');

  resultDiv.innerHTML = `❌ 오류가 발생했습니다: ${getDisplayErrorMessage(error, '알 수 없는 오류')}`;
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

  const season = currentSheetName || getSelectedSheetName();
  if (!season) {
    alert('선택된 시트가 없습니다.');
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
        statusText = '정시';
      } else if (detail.attendanceType === 'late') {
        statusClass = 'late';
        statusIcon = '<i class="fas fa-hourglass-half"></i>';
        statusText = '지각';
      } else {
        statusClass = 'absent';
        statusIcon = '<i class="fas fa-times-circle"></i>';
        statusText = '결석';
      }

      const itemClass = detail.attendanceType === 'future' ? 'future' : '';

      detailsHTML += `
        <div class="attendance-item ${itemClass}">
          <div class="attendance-date">${detail.date}</div>
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
          <h3><span class="grade-badge">${data.grade}</span>${data.name}님 출석 현황</h3>
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
            현재까지 ${data.currentSession}회차 중 ${data.attended}회 출석
          </p>
        </div>
        <div class="attendance-details">
          <h4 style="color: #e2e8f0; margin-bottom: 16px; font-size: 18px;">출석 상세 내역</h4>
          ${detailsHTML}
        </div>
      </div>
    `;
  } else {
    statusResult.innerHTML = `<div class="error">❌ ${response.message}</div>`;
  }

  statusResult.style.display = 'block';
}

function handleStatusError(error) {
  const statusResult = document.getElementById('statusResult');
  statusResult.innerHTML = `<div class="error">❌ 오류가 발생했습니다: ${getDisplayErrorMessage(error, '알 수 없는 오류')}</div>`;
  statusResult.style.display = 'block';
}

document.addEventListener('DOMContentLoaded', () => {
  initializeDashboard().catch((error) => {
    alert(getDisplayErrorMessage(error, '초기화 중 오류가 발생했습니다.'));
    console.error(error);
  });
});
