let countdownInterval;
let isAttendanceActive = false;
let currentSeason = '';

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

function buildSeasonParams(extraParams) {
  const params = Object.assign({}, extraParams || {});
  if (currentSeason) {
    params.season = currentSeason;
  }
  return params;
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
      countdownTitle.textContent = '정시 마감까지 남은 시간';
      target = onTimeDeadline;
    } else {
      countdownTitle.textContent = '지각 마감까지 남은 시간';
      target = lateDeadline;
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
  try {
    const session = await CloudClubApi.call('session', buildSeasonParams());
    renderCountdown(session);
  } catch (error) {
    renderCountdown({ active: false, message: error.message || '세션 정보를 불러올 수 없습니다.' });
  }
}

async function loadRankings() {
  try {
    const response = await CloudClubApi.call('ranking', buildSeasonParams());
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
  rankingBoard.innerHTML = '<div class="error">순위를 불러오는 중 오류가 발생했습니다.</div>';
  console.error('Ranking error:', error);
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

  const attendBtn = document.getElementById('attendBtn');
  attendBtn.disabled = true;
  attendBtn.innerHTML = '<span class="loader"></span> <span>처리 중...</span>';

  localStorage.setItem('lastUsedPhone', phoneNumber);

  try {
    const response = await CloudClubApi.call('attendance', buildSeasonParams({ phone: phoneNumber }));
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

  resultDiv.innerHTML = `❌ 오류가 발생했습니다: ${error.message || '알 수 없는 오류'}`;
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

  localStorage.setItem('lastUsedPhone', phoneNumber);

  const statusResult = document.getElementById('statusResult');
  statusResult.innerHTML = '<div class="loader" style="margin: 32px auto;"></div>';
  statusResult.style.display = 'block';

  try {
    const response = await CloudClubApi.call('status', buildSeasonParams({ phone: phoneNumber }));
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
  statusResult.innerHTML = `<div class="error">❌ 오류가 발생했습니다: ${error.message || '알 수 없는 오류'}</div>`;
  statusResult.style.display = 'block';
}

function showSeasonWarning() {
  const warning = document.createElement('div');
  warning.className = 'error';
  warning.style.cssText = 'position: fixed; top: 20px; left: 50%; transform: translateX(-50%); padding: 16px 24px; border-radius: 12px; z-index: 1000; max-width: 420px; text-align: center;';
  warning.innerHTML = '<i class="fas fa-exclamation-triangle"></i> 시즌 정보가 없습니다. 관리자에게 전달받은 URL로 접속해주세요.';
  document.body.appendChild(warning);

  setTimeout(() => {
    warning.remove();
  }, 5000);
}

document.addEventListener('DOMContentLoaded', async () => {
  const query = new URLSearchParams(window.location.search);
  currentSeason = (query.get('season') || '').trim();
  const seasonInfo = document.getElementById('seasonInfo');

  if (!currentSeason) {
    showSeasonWarning();
  } else if (seasonInfo) {
    seasonInfo.style.display = 'inline-flex';
    seasonInfo.innerHTML = `<i class="fas fa-calendar-alt"></i> ${currentSeason}`;
  }

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

  await Promise.all([
    checkAttendanceSession(),
    loadRankings()
  ]);
});
