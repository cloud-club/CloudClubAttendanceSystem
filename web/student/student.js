let countdownInterval;
let isAttendanceActive = false;
let currentAttendancePhase = '';
let currentSeason = '';
let latestSeason = '';
let requestedSeason = '';
let requiresHistoricalAdminAuth = false;
let studentAdminToken = '';
let studentAuthFlowLocked = false;
let studentPageInitialized = false;
let studentRankingCache = {
  season: '',
  loadedAt: 0,
  response: null
};
const LATEST_SEASON_STORAGE_KEY = 'cloudclub.latestSeasonAlias';
const STUDENT_ADMIN_TOKEN_STORAGE_KEY = 'cc_student_admin_token';
const STUDENT_RANKING_CACHE_TTL_MS = 10000;
const ATTENDANCE_PHASE_NOTICE_TEXT = '지각 허용 시간 이후부터는 결석 처리됩니다';
const STUDENT_ALLOWED_ACTIONS = {
  sheets: true,
  latestSeason: true,
  session: true,
  ranking: true,
  attendance: true,
  status: true,
  authGoogleConfig: true,
  authGoogleLogin: true,
  authSession: true,
  authLogout: true
};

function createStudentApiError(code, message) {
  const err = new Error(message || '요청을 처리할 수 없습니다.');
  err.code = String(code || 'UNKNOWN');
  return err;
}

function callStudentApi(action, params) {
  const normalizedAction = String(action || '').trim();
  if (!normalizedAction || !STUDENT_ALLOWED_ACTIONS[normalizedAction]) {
    return Promise.reject(createStudentApiError('FORBIDDEN_STUDENT_ACTION', `학생 페이지에서 허용되지 않은 API 호출입니다: ${normalizedAction}`));
  }

  if (!window.CloudClubApi || typeof window.CloudClubApi.call !== 'function') {
    return Promise.reject(createStudentApiError('API_UNAVAILABLE', 'CloudClubApi를 사용할 수 없습니다.'));
  }

  return window.CloudClubApi.call(normalizedAction, params || {});
}

function normalizeSeasonAlias(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';

  const seasonMatch = raw.match(/^season[_-]?(\d{1,2})$/);
  if (seasonMatch) {
    return `season_${seasonMatch[1].padStart(2, '0')}`;
  }

  const numberMatch = raw.match(/^(\d{1,2})$/);
  if (numberMatch) {
    return `season_${numberMatch[1].padStart(2, '0')}`;
  }
  return '';
}

function parseSeasonNo(alias) {
  const match = String(alias || '').trim().toLowerCase().match(/^season_(\d{1,2})$/);
  if (!match) return NaN;
  return parseInt(match[1], 10);
}

function pickLatestSeasonAliasFromSheets(sheets) {
  const list = Array.isArray(sheets) ? sheets : [];
  let bestAlias = '';
  let bestNo = -1;

  list.forEach(item => {
    const alias = normalizeSeasonAlias(item && item.alias);
    const seasonNo = parseSeasonNo(alias);
    if (!isNaN(seasonNo) && seasonNo > bestNo) {
      bestNo = seasonNo;
      bestAlias = alias;
    }
  });

  if (bestAlias) return bestAlias;

  const active = list.find(item => item && item.isActive && normalizeSeasonAlias(item.alias));
  return active ? normalizeSeasonAlias(active.alias) : '';
}

function readCachedLatestSeasonAlias() {
  try {
    return normalizeSeasonAlias(localStorage.getItem(LATEST_SEASON_STORAGE_KEY));
  } catch (error) {
    return '';
  }
}

function writeCachedLatestSeasonAlias(alias) {
  const normalized = normalizeSeasonAlias(alias);
  if (!normalized) return;

  try {
    localStorage.setItem(LATEST_SEASON_STORAGE_KEY, normalized);
  } catch (error) {
    // Ignore storage failures in restricted browser mode.
  }
}

function updateSeasonInfoBadge() {
  const seasonInfo = document.getElementById('seasonInfo');
  if (!seasonInfo) return;

  if (!currentSeason) {
    seasonInfo.style.display = 'none';
    seasonInfo.innerHTML = '';
    return;
  }

  seasonInfo.style.display = 'inline-flex';
  seasonInfo.innerHTML = `<i class="fas fa-calendar-alt"></i> ${currentSeason}`;
}

function getRequestedSeasonAliasFromUrl() {
  try {
    const query = new URLSearchParams(window.location.search);
    return normalizeSeasonAlias(query.get('season'));
  } catch (error) {
    return '';
  }
}

function removeSeasonQueryFromCurrentUrl() {
  try {
    const url = new URL(window.location.href);
    if (!url.searchParams.has('season')) return;
    url.searchParams.delete('season');
    const nextUrl = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState({}, '', nextUrl);
  } catch (error) {
    // Ignore URL rewrite errors.
  }
}

function redirectToLatestPath(message) {
  if (message) {
    showSeasonWarning(message);
  }

  setTimeout(() => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('season');
      window.location.replace(`${url.pathname}${url.search}${url.hash}`);
    } catch (error) {
      window.location.replace(window.location.pathname || '/');
    }
  }, 650);
}

function readStudentAdminTokenFromSession() {
  try {
    return String(sessionStorage.getItem(STUDENT_ADMIN_TOKEN_STORAGE_KEY) || '').trim();
  } catch (error) {
    return '';
  }
}

function writeStudentAdminTokenToSession(token) {
  const normalized = String(token || '').trim();
  if (!normalized) return;
  try {
    sessionStorage.setItem(STUDENT_ADMIN_TOKEN_STORAGE_KEY, normalized);
  } catch (error) {
    // Ignore storage write failures.
  }
}

function clearStudentAdminTokenFromSession() {
  studentAdminToken = '';
  try {
    sessionStorage.removeItem(STUDENT_ADMIN_TOKEN_STORAGE_KEY);
  } catch (error) {
    // Ignore storage cleanup failures.
  }
}

function setStudentAuthGateMessage(message, isError) {
  const node = document.getElementById('studentAuthGateMessage');
  if (!node) return;
  node.textContent = String(message || '').trim();
  node.classList.toggle('error', !!isError);
}

function showStudentAuthGate() {
  const gate = document.getElementById('studentAuthGate');
  if (!gate) return;
  gate.classList.remove('is-hidden');
}

function hideStudentAuthGate() {
  const gate = document.getElementById('studentAuthGate');
  if (!gate) return;
  gate.classList.add('is-hidden');
}

async function waitForGoogleIdentityClient(timeoutMs) {
  const timeout = Math.max(2000, Number(timeoutMs || 10000));
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeout) {
    if (window.google && window.google.accounts && window.google.accounts.id) {
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, 120));
  }
  return false;
}

async function validateHistoricalSeasonAccess(token) {
  const seasonAlias = normalizeSeasonAlias(requestedSeason);
  if (!seasonAlias) {
    throw createStudentApiError('INVALID_SEASON', '과거 시즌 파라미터가 유효하지 않습니다.');
  }
  await callStudentApi('session', { season: seasonAlias, adminToken: String(token || '').trim() });
}

async function restoreHistoricalStudentAdminSession() {
  const cachedToken = readStudentAdminTokenFromSession();
  if (!cachedToken) return false;

  try {
    const authSession = await callStudentApi('authSession', { adminToken: cachedToken });
    if (!authSession || !authSession.success || !authSession.authenticated) {
      clearStudentAdminTokenFromSession();
      return false;
    }

    await validateHistoricalSeasonAccess(cachedToken);
    studentAdminToken = cachedToken;
    return true;
  } catch (error) {
    clearStudentAdminTokenFromSession();
    return false;
  }
}

async function handleStudentGoogleCredentialResponse(googleResponse) {
  if (studentAuthFlowLocked) return;
  studentAuthFlowLocked = true;

  const credential = String((googleResponse && googleResponse.credential) || '').trim();
  if (!credential) {
    setStudentAuthGateMessage('Google 인증 토큰을 받지 못했습니다. 다시 시도해주세요.', true);
    studentAuthFlowLocked = false;
    return;
  }

  try {
    setStudentAuthGateMessage('Google 토큰을 검증하는 중입니다...');
    const login = await callStudentApi('authGoogleLogin', { idToken: credential });
    if (!login || !login.success || !login.token) {
      throw createStudentApiError('UNAUTHORIZED', 'Google 로그인 검증에 실패했습니다.');
    }

    await validateHistoricalSeasonAccess(login.token);
    studentAdminToken = String(login.token || '').trim();
    writeStudentAdminTokenToSession(studentAdminToken);
    hideStudentAuthGate();
    updateSeasonInfoBadge();
    await initializeStudentPage();
  } catch (error) {
    clearStudentAdminTokenFromSession();
    setStudentAuthGateMessage(getDisplayErrorMessage(error, '과거 시즌 접근 권한이 없습니다. 최신 시즌으로 이동합니다.'), true);
    redirectToLatestPath('과거 시즌 접근 권한이 없어 최신 시즌으로 이동합니다.');
  } finally {
    studentAuthFlowLocked = false;
  }
}

async function renderHistoricalAuthGate() {
  showStudentAuthGate();
  setStudentAuthGateMessage('과거 시즌 접근을 확인하는 중입니다...');

  try {
    const config = await callStudentApi('authGoogleConfig');
    const clientId = String((config && config.googleClientId) || '').trim();
    if (!clientId) {
      throw createStudentApiError('AUTH_CLIENT_ID_NOT_CONFIGURED', 'Google OAuth Client ID가 설정되지 않았습니다.');
    }

    const loaded = await waitForGoogleIdentityClient(12000);
    if (!loaded) {
      throw createStudentApiError('GOOGLE_SDK_UNAVAILABLE', 'Google 로그인 SDK를 불러오지 못했습니다.');
    }

    const loginContainer = document.getElementById('studentGoogleLoginButton');
    if (!loginContainer) {
      throw createStudentApiError('AUTH_UI_MISSING', '학생 인증 버튼 컨테이너를 찾을 수 없습니다.');
    }

    loginContainer.innerHTML = '';
    window.google.accounts.id.initialize({
      client_id: clientId,
      callback: handleStudentGoogleCredentialResponse,
      auto_select: false,
      cancel_on_tap_outside: true
    });
    window.google.accounts.id.renderButton(loginContainer, {
      theme: 'outline',
      size: 'large',
      text: 'signin_with',
      shape: 'pill',
      width: 320,
      logo_alignment: 'left'
    });

    setStudentAuthGateMessage('관리자 권한이 있는 Google 계정으로 로그인하세요.');
    return true;
  } catch (error) {
    setStudentAuthGateMessage(getDisplayErrorMessage(error, '인증 화면을 준비하지 못했습니다. 최신 시즌으로 이동합니다.'), true);
    redirectToLatestPath('과거 시즌 인증 준비에 실패해 최신 시즌으로 이동합니다.');
    return false;
  }
}

async function resolveLatestSeasonAlias() {
  try {
    const payload = await callStudentApi('latestSeason');
    const latestAlias = normalizeSeasonAlias(payload && payload.seasonAlias);
    if (latestAlias) {
      return latestAlias;
    }
  } catch (error) {
    console.warn('latestSeason API 조회 실패, sheets fallback 사용:', error);
  }

  const sheets = await callStudentApi('sheets');
  const latest = pickLatestSeasonAliasFromSheets(sheets);
  if (!latest) {
    throw new Error('최신 시즌을 찾을 수 없습니다.');
  }
  return latest;
}

async function ensureInitialSeasonAlias() {
  const cachedLatest = readCachedLatestSeasonAlias();
  if (cachedLatest) {
    latestSeason = cachedLatest;
    currentSeason = cachedLatest;
  }

  requestedSeason = getRequestedSeasonAliasFromUrl();

  try {
    const latestAlias = await resolveLatestSeasonAlias();
    latestSeason = latestAlias;
    currentSeason = latestAlias;
    writeCachedLatestSeasonAlias(latestAlias);
  } catch (error) {
    console.warn('학생 페이지 최신 시즌 조회 실패:', error);
  }

  if (!latestSeason) {
    return { resolved: false, source: 'none' };
  }

  if (!requestedSeason) {
    requiresHistoricalAdminAuth = false;
    currentSeason = latestSeason;
    hideStudentAuthGate();
    return { resolved: true, source: 'latest' };
  }

  if (requestedSeason === latestSeason) {
    requiresHistoricalAdminAuth = false;
    currentSeason = latestSeason;
    removeSeasonQueryFromCurrentUrl();
    hideStudentAuthGate();
    return { resolved: true, source: 'query_latest' };
  }

  requiresHistoricalAdminAuth = true;
  currentSeason = requestedSeason;

  const restored = await restoreHistoricalStudentAdminSession();
  if (restored) {
    hideStudentAuthGate();
    return { resolved: true, source: 'historical_cached_admin' };
  }

  const gateReady = await renderHistoricalAuthGate();
  if (!gateReady) {
    return { resolved: false, source: 'historical_gate_failed' };
  }

  return { resolved: false, source: 'historical_auth_required' };
}

function getDisplayErrorMessage(error, fallbackMessage) {
  if (error && error.code === 'NETWORK_ERROR') {
    return 'API 서버 응답 스크립트를 불러오지 못했습니다. (리다이렉트/ORB 가능성) 잠시 후 다시 시도해주세요.';
  }

  if (error && error.code === 'UNAUTHORIZED') {
    return '관리자 인증이 필요합니다. 과거 시즌은 관리자 Google 로그인 후 접근할 수 있습니다.';
  }

  if (error && error.code === 'FORBIDDEN_SEASON') {
    return '해당 시즌 접근 권한이 없습니다. 최신 시즌으로 이동합니다.';
  }

  if (error && error.code === 'AUTH_ADMIN_NOT_REGISTERED') {
    return 'Google 로그인은 성공했지만 관리자 권한이 등록되지 않은 계정입니다.';
  }

  if (error && error.code === 'AUTH_ADMIN_INACTIVE') {
    return 'Google 로그인은 성공했지만 비활성화된 관리자 계정입니다.';
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
  if (requiresHistoricalAdminAuth && studentAdminToken) {
    params.adminToken = studentAdminToken;
  }
  return params;
}

function toSafeInteger(value, fallbackValue) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return Number.isFinite(Number(fallbackValue)) ? Number(fallbackValue) : 0;
  }
  return Math.floor(parsed);
}

function clearAttendButtonPhaseClassNames(attendBtn) {
  if (!attendBtn) return;
  attendBtn.classList.remove('is-on-time', 'is-late');
}

function setAttendancePhaseNoticeVisible(visible) {
  const notice = document.getElementById('attendancePhaseNotice');
  if (!notice) return;

  if (visible) {
    notice.textContent = ATTENDANCE_PHASE_NOTICE_TEXT;
    notice.style.display = 'block';
  } else {
    notice.style.display = 'none';
  }
}

function setAttendButtonByPhase(phase, options) {
  const attendBtn = document.getElementById('attendBtn');
  if (!attendBtn) return;

  const opts = options || {};
  const preserveDisabledLabel = opts.preserveDisabledLabel !== false;
  const normalizedPhase = phase === 'late' ? 'late' : 'on_time';
  currentAttendancePhase = normalizedPhase;

  clearAttendButtonPhaseClassNames(attendBtn);
  attendBtn.classList.add(normalizedPhase === 'late' ? 'is-late' : 'is-on-time');

  if (attendBtn.disabled && preserveDisabledLabel) {
    return;
  }

  if (normalizedPhase === 'late') {
    attendBtn.innerHTML = '<i class="fas fa-hand-point-up"></i> <span>출석체크 (지각)</span>';
  } else {
    attendBtn.innerHTML = '<i class="fas fa-hand-point-up"></i> <span>출석하기 (정시)</span>';
  }
}

function buildLiveAttendanceProgress(attendanceInfo) {
  const info = attendanceInfo || {};
  const baseAttended = Math.max(0, toSafeInteger(info.attended, 0));
  const baseCurrentSession = Math.max(0, toSafeInteger(info.currentSession, 0));
  const baseEffectiveTotal = Math.max(0, toSafeInteger(info.effectiveTotal, baseCurrentSession));

  const attended = baseAttended + 1;
  const currentSession = Math.max(baseCurrentSession + 1, attended);
  const effectiveTotal = Math.max(baseEffectiveTotal + 1, attended);
  const rate = effectiveTotal > 0
    ? Math.round((attended / effectiveTotal) * 100)
    : 0;

  return {
    attended: attended,
    currentSession: currentSession,
    effectiveTotal: effectiveTotal,
    rate: rate
  };
}

function buildStatusProgressFromDetails(details) {
  const list = Array.isArray(details) ? details : [];
  let attended = 0;
  let currentSession = 0;
  let effectiveTotal = 0;

  list.forEach(detail => {
    const type = String((detail && detail.attendanceType) || '').trim();
    if (type === 'future') return;

    currentSession++;

    if (type === 'excused') {
      return;
    }

    effectiveTotal++;
    if (type === 'on_time' || type === 'late') {
      attended++;
    }
  });

  const rate = effectiveTotal > 0
    ? Math.round((attended / effectiveTotal) * 100)
    : 0;

  return {
    attended: attended,
    currentSession: currentSession,
    effectiveTotal: effectiveTotal,
    rate: rate
  };
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

  if (!session.active) {
    currentAttendancePhase = '';
    setAttendancePhaseNoticeVisible(false);
    clearAttendButtonPhaseClassNames(attendBtn);

    if (session.nextOpenTime) {
      const nextOpenTime = Number(session.nextOpenTime || 0);

      const updateOpenCountdown = () => {
        const now = Date.now();
        const remain = Math.max(0, nextOpenTime - now);

        if (remain <= 0) {
          clearInterval(countdownInterval);
          countdownTitle.textContent = '출석 가능 시간 확인 중...';
          countdownDiv.textContent = '잠시 후 자동 갱신됩니다.';
          isAttendanceActive = false;
          attendBtn.disabled = true;
          clearAttendButtonPhaseClassNames(attendBtn);
          attendBtn.innerHTML = '<i class="fas fa-clock"></i> <span>오픈 대기</span>';
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
      isAttendanceActive = false;
      attendBtn.disabled = true;
      clearAttendButtonPhaseClassNames(attendBtn);
      attendBtn.innerHTML = '<i class="fas fa-clock"></i> <span>오픈 대기</span>';
      return;
    }

    countdownTitle.textContent = '출석 대기 중';
    countdownDiv.textContent = session.message || '지금은 출석 가능한 시간이 아닙니다.';
    isAttendanceActive = false;
    attendBtn.disabled = true;
    clearAttendButtonPhaseClassNames(attendBtn);
    attendBtn.innerHTML = '<i class="fas fa-times"></i> <span>출석 불가</span>';
    return;
  }

  isAttendanceActive = true;
  setAttendancePhaseNoticeVisible(true);
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
      currentAttendancePhase = '';
      setAttendancePhaseNoticeVisible(false);
      attendBtn.disabled = true;
      clearAttendButtonPhaseClassNames(attendBtn);
      attendBtn.innerHTML = '<i class="fas fa-times"></i> <span>출석 마감</span>';
      return;
    }

    let target = lateDeadline;
    let phase = 'late';
    if (onTimeDeadline && now <= onTimeDeadline) {
      countdownTitle.textContent = '정시 마감까지 남은 시간';
      target = onTimeDeadline;
      phase = 'on_time';
    } else {
      countdownTitle.textContent = '지각 마감까지 남은 시간';
      target = lateDeadline;
      phase = 'late';
    }

    setAttendButtonByPhase(phase);

    const remaining = Math.max(0, target - now);
    countdownDiv.textContent = formatDurationKorean(remaining);
  };

  updateClock();
  countdownInterval = setInterval(updateClock, 1000);
}

async function checkAttendanceSession() {
  try {
    const session = await callStudentApi('session', buildSeasonParams());
    renderCountdown(session);
  } catch (error) {
    if (handleHistoricalAccessError(error)) return;
    renderCountdown({ active: false, message: getDisplayErrorMessage(error, '세션 정보를 불러올 수 없습니다.') });
  }
}

async function loadRankings() {
  const seasonAlias = normalizeSeasonAlias(currentSeason);
  const now = Date.now();
  if (
    studentRankingCache
    && studentRankingCache.response
    && studentRankingCache.season === seasonAlias
    && (now - Number(studentRankingCache.loadedAt || 0)) < STUDENT_RANKING_CACHE_TTL_MS
  ) {
    displayRankings(studentRankingCache.response);
    return;
  }

  try {
    const response = await callStudentApi('ranking', buildSeasonParams());
    if (response && response.success) {
      studentRankingCache = {
        season: seasonAlias,
        loadedAt: Date.now(),
        response: response
      };
    }
    displayRankings(response);
  } catch (error) {
    if (handleHistoricalAccessError(error)) return;
    handleRankingError(error);
  }
}

function handleHistoricalAccessError(error) {
  if (!requiresHistoricalAdminAuth) return false;

  const code = String((error && error.code) || '').trim();
  const shouldRedirect = code === 'UNAUTHORIZED'
    || code === 'FORBIDDEN_SEASON'
    || code === 'AUTH_ADMIN_NOT_REGISTERED'
    || code === 'AUTH_ADMIN_INACTIVE';

  if (!shouldRedirect) return false;

  clearStudentAdminTokenFromSession();
  hideStudentAuthGate();
  redirectToLatestPath(getDisplayErrorMessage(error, '과거 시즌 접근 권한이 만료되어 최신 시즌으로 이동합니다.'));
  return true;
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
    const name = escapeHtml(String(item && item.name || '-'));
    const seasonLabel = escapeHtml(String((item && (item.seasonLabel || item.grade)) || '-'));
    const attendanceRate = Number(item && item.attendanceRate);
    const attendedCount = Number(item && item.attendedCount);
    const totalSessions = Number(item && item.totalSessions);

    const rankDisplay = item.rank <= 3
      ? `<span class="rank-medal rank-${item.rank}">${item.rank}</span>`
      : `<span style="color: #94a3b8;">${item.rank}</span>`;

    const avgOffset = item.avgAttendOffset || item.avgAttendTime;
    const avgOffsetText = String(avgOffset || '').trim();
    const avgTimeDisplay = avgOffsetText === '' || avgOffsetText === '미출석'
      ? '<span style="color: #64748b;">-</span>'
      : `<span style="color: #60a5fa;">${escapeHtml(avgOffsetText)}</span>`;

    tableHTML += `
      <tr>
        <td>${rankDisplay}</td>
        <td><span class="grade-badge">${seasonLabel}</span>${name}</td>
        <td><span class="highlight-text">${Number.isFinite(attendanceRate) ? attendanceRate : 0}%</span></td>
        <td>${Number.isFinite(attendedCount) ? attendedCount : 0}/${Number.isFinite(totalSessions) ? totalSessions : '-'}</td>
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
    const response = await callStudentApi('attendance', buildSeasonParams({ phone: phoneNumber }));
    handleAttendanceResponse(response);
  } catch (error) {
    if (handleHistoricalAccessError(error)) return;
    handleAttendanceError(error);
  }
}

function handleAttendanceResponse(response) {
  const resultDiv = document.getElementById('result');
  const attendBtn = document.getElementById('attendBtn');

  if (response.success) {
    studentRankingCache.loadedAt = 0;
    studentRankingCache.response = null;

    createConfetti();

    const typeBadge = response.attendanceType === 'late'
      ? '<span class="attendance-badge late">지각</span>'
      : '<span class="attendance-badge on-time">정시</span>';

    let message = `✅ <span class="grade-badge">${response.seasonLabel || response.grade || '-'}</span>${response.name}님, ${response.time} 출석 완료! ${typeBadge}`;

    if (response.attendanceInfo) {
      const info = buildLiveAttendanceProgress(response.attendanceInfo);
      message += `
        <div class="attendance-info">
          <h3><span class="grade-badge">${response.seasonLabel || response.grade || '-'}</span>${response.name}님 출석 현황</h3>
          <div class="attendance-stats">
            <div class="stat-item">
              <div class="stat-label">출석 횟수</div>
              <div class="stat-value">${info.attended}/${info.currentSession}</div>
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
          <p class="fortune-text">${escapeHtml(response.fortune)}</p>
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
    setAttendButtonByPhase(currentAttendancePhase || 'on_time', { preserveDisabledLabel: false });
  }

  resultDiv.style.display = 'block';

  setTimeout(() => {
    resultDiv.style.display = 'none';
    if (!response.success && isAttendanceActive) {
      attendBtn.disabled = false;
      setAttendButtonByPhase(currentAttendancePhase || 'on_time', { preserveDisabledLabel: false });
    }
  }, response.success ? 15000 : 5000);
}

function handleAttendanceError(error) {
  const resultDiv = document.getElementById('result');
  const attendBtn = document.getElementById('attendBtn');

  resultDiv.innerHTML = `❌ 오류가 발생했습니다: ${getDisplayErrorMessage(error, '알 수 없는 오류')}`;
  resultDiv.className = 'error';
  resultDiv.style.display = 'block';

  if (isAttendanceActive) {
    attendBtn.disabled = false;
    setAttendButtonByPhase(currentAttendancePhase || 'on_time', { preserveDisabledLabel: false });
  } else {
    attendBtn.disabled = true;
    clearAttendButtonPhaseClassNames(attendBtn);
    attendBtn.innerHTML = '<i class="fas fa-times"></i> <span>출석 불가</span>';
  }

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
    const response = await callStudentApi('status', buildSeasonParams({ phone: phoneNumber }));
    handleStatusResponse(response);
  } catch (error) {
    if (handleHistoricalAccessError(error)) return;
    handleStatusError(error);
  }
}

function handleStatusResponse(response) {
  const statusResult = document.getElementById('statusResult');

  if (response.success) {
    const data = response.data;
    const liveProgress = buildStatusProgressFromDetails(data.details);
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
          <h3><span class="grade-badge">${data.seasonLabel || data.grade || '-'}</span>${data.name}님 출석 현황</h3>
          <div class="attendance-stats">
            <div class="stat-item">
              <div class="stat-label">출석 횟수</div>
              <div class="stat-value">${liveProgress.attended}/${liveProgress.currentSession}</div>
            </div>
            <div class="stat-item">
              <div class="stat-label">출석률</div>
              <div class="stat-value highlight">${liveProgress.rate}%</div>
            </div>
          </div>
          <p class="info-text" style="margin-top: 12px;">
            현재까지 ${liveProgress.currentSession}회차 중 ${liveProgress.attended}회 출석
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

function showSeasonWarning(message) {
  const warning = document.createElement('div');
  warning.className = 'error';
  warning.style.cssText = 'position: fixed; top: 20px; left: 50%; transform: translateX(-50%); padding: 16px 24px; border-radius: 12px; z-index: 1000; max-width: 420px; text-align: center;';
  warning.innerHTML = `<i class="fas fa-exclamation-triangle"></i> ${message || '최신 시즌을 확인하지 못했습니다. 잠시 후 다시 시도해주세요.'}`;
  document.body.appendChild(warning);

  setTimeout(() => {
    warning.remove();
  }, 5000);
}

function applyBlockedStudentState(message) {
  clearInterval(countdownInterval);
  isAttendanceActive = false;

  const countdownTitle = document.getElementById('countdown-title');
  const countdownDiv = document.getElementById('countdown');
  const attendBtn = document.getElementById('attendBtn');
  const rankingBoard = document.getElementById('rankingBoard');

  if (countdownTitle) {
    countdownTitle.textContent = '시즌 정보를 확인하지 못했습니다.';
  }
  if (countdownDiv) {
    countdownDiv.textContent = message || '잠시 후 다시 시도해주세요.';
  }
  if (attendBtn) {
    attendBtn.disabled = true;
    attendBtn.innerHTML = '<i class="fas fa-ban"></i> <span>출석 불가</span>';
  }
  if (rankingBoard) {
    rankingBoard.innerHTML = `<div class="error">${escapeHtml(message || '최신 시즌을 확인하지 못했습니다.')}</div>`;
  }
}

async function initializeStudentPage() {
  if (studentPageInitialized) return;
  studentPageInitialized = true;

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
}

document.addEventListener('DOMContentLoaded', async () => {
  const seasonResult = await ensureInitialSeasonAlias();
  updateSeasonInfoBadge();

  if (!seasonResult.resolved) {
    if (seasonResult.source === 'historical_auth_required') {
      showSeasonWarning('과거 시즌 접근은 관리자 Google 로그인이 필요합니다.');
      return;
    }

    applyBlockedStudentState('최신 시즌 정보를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.');
    showSeasonWarning('최신 시즌 정보를 확인하지 못해 출석 기능이 잠시 중단되었습니다.');
    return;
  }

  if (requiresHistoricalAdminAuth) {
    showSeasonWarning(`${currentSeason} 과거 시즌 접근이 관리자 권한으로 승인되었습니다.`);
  }

  await initializeStudentPage();
});
