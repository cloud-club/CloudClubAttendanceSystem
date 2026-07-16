let countdownInterval;
let isAttendanceActive = false;
let currentAttendancePhase = '';
let currentAttendanceSession = null;
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
let studentRankingRequest = {
  season: '',
  promise: null
};
let studentRankingCacheGeneration = 0;
let studentStatusCache = {
  key: '',
  loadedAt: 0,
  response: null
};
let studentStatusCacheGeneration = 0;
let studentStatusRequestSequence = 0;
let studentStatusViewGeneration = 0;
let studentCompletionRequestGeneration = 0;
let studentCompletionRequestKey = '';
let studentStatusDetails = [];
let studentAttendanceDetailTrigger = null;
let studentAttendanceDetailPreviousBodyOverflow = null;
let studentAttendanceDetailInitialized = false;
let studentAttendanceDetailFocusGeneration = 0;
let studentAttendanceDetailFocusTimer = null;
let studentMenuReturnFocus = null;
let studentScheduleRequest = null;
let completionPolicyDialogTrigger = null;
let completionPolicyDialogPreviousBodyOverflow = null;
const LATEST_SEASON_STORAGE_KEY = 'cloudclub.latestSeasonAlias';
const STUDENT_ADMIN_TOKEN_STORAGE_KEY = 'cc_student_admin_token';
const STUDENT_RANKING_CACHE_TTL_MS = 10000;
const STUDENT_STATUS_CACHE_TTL_MS = 10000;
const ATTENDANCE_PHASE_NOTICE_TEXT = '지각 허용 시간 이후부터는 결석 처리됩니다';
const STUDENT_ALLOWED_ACTIONS = {
  sheets: true,
  latestSeason: true,
  session: true,
  ranking: true,
  attendance: true,
  status: true,
  studentSchedule: true,
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
  if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

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

function normalizeStudentPhone(value) {
  return String(value || '').replace(/[^0-9]/g, '').slice(0, 11);
}

function isValidStudentPhone(value) {
  return /^010[0-9]{8}$/.test(normalizeStudentPhone(value));
}

function syncStudentPhoneInputs(value, sourceInput) {
  const phone = normalizeStudentPhone(value);
  ['phoneInput', 'statusPhoneInput', 'completionPhoneInput'].forEach(id => {
    const input = document.getElementById(id);
    if (input && input !== sourceInput) input.value = phone;
  });
  return phone;
}

function saveLastUsedStudentPhone(value) {
  const phone = syncStudentPhoneInputs(value);
  try {
    localStorage.setItem('lastUsedPhone', phone);
  } catch (error) {
    return phone;
  }
  return phone;
}

function invalidateStudentStatusCache() {
  studentStatusCacheGeneration++;
  studentStatusRequestSequence++;
  studentStatusViewGeneration++;
  clearStudentAttendanceDetailState();
  studentStatusCache = {
    key: '',
    loadedAt: 0,
    response: null
  };
}

function invalidateStudentCompletionRequest() {
  studentCompletionRequestGeneration++;
  studentCompletionRequestKey = '';
}

function invalidateStudentRankingCache() {
  studentRankingCacheGeneration++;
  studentRankingCache = {
    season: '',
    loadedAt: 0,
    response: null
  };
  studentRankingRequest = {
    season: '',
    promise: null
  };
}

async function fetchStudentStatus(phoneNumber) {
  const phone = normalizeStudentPhone(phoneNumber);
  const cacheKey = `${normalizeSeasonAlias(currentSeason)}:${phone}`;
  const now = Date.now();
  if (
    studentStatusCache.response
    && studentStatusCache.key === cacheKey
    && (now - Number(studentStatusCache.loadedAt || 0)) < STUDENT_STATUS_CACHE_TTL_MS
  ) {
    return studentStatusCache.response;
  }

  const requestGeneration = studentStatusCacheGeneration;
  const requestSequence = ++studentStatusRequestSequence;
  const response = await callStudentApi('status', buildSeasonParams({ phone: phone }));
  if (requestGeneration !== studentStatusCacheGeneration) {
    return fetchStudentStatus(phone);
  }
  if (response && response.success && requestSequence === studentStatusRequestSequence) {
    const cachedResponse = sanitizeStudentStatusResponseForCache(response);
    studentStatusCache = {
      key: cacheKey,
      loadedAt: Date.now(),
      response: cachedResponse
    };
    return cachedResponse;
  }
  return response;
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

function renderAttendanceLocationPolicy(session) {
  const summary = document.getElementById('sessionVenueSummary');
  if (!summary) return;
  const eventName = String(session && (session.eventName || session.nextEventName) || '').trim();
  summary.classList.remove('is-error');
  if (session && session.active && session.locationPolicyValid === false) {
    summary.textContent = `${eventName ? `${eventName} · ` : ''}장소 설정을 확인할 수 없어 위치 권한을 요청하지 않습니다. 운영진에게 문의해 주세요.`;
    summary.classList.add('is-error');
    return;
  }
  if (!session || (!session.active && !session.nextLocationRequired) || (session.active && !session.locationRequired)) {
    summary.textContent = eventName ? `행사: ${eventName}` : '';
    return;
  }

  const radius = Number(session.radiusM || session.nextRadiusM || 500);
  const note = String(session.locationNote || '').trim();
  summary.textContent = note
    ? `${eventName ? `행사: ${eventName} · ` : ''}위치 확인 필수 · 지정 장소 ${radius}m 이내 · ${note} · 출석 버튼을 누르면 현재 위치를 한 번 확인하며 좌표는 저장하지 않습니다.`
    : `${eventName ? `행사: ${eventName} · ` : ''}위치 확인 필수 · 지정 장소 ${radius}m 이내 · 출석 버튼을 누르면 현재 위치를 한 번 확인하며 좌표는 저장하지 않습니다.`;
}

function setAttendanceLocationStatus(message, tone) {
  const status = document.getElementById('attendanceLocationStatus');
  if (!status) return;
  status.textContent = String(message || '');
  status.classList.remove('is-error', 'is-success');
  if (tone === 'error') status.classList.add('is-error');
  if (tone === 'success') status.classList.add('is-success');
}

function renderCountdown(session) {
  const countdownTitle = document.getElementById('countdown-title');
  const countdownDiv = document.getElementById('countdown');
  const attendBtn = document.getElementById('attendBtn');

  clearInterval(countdownInterval);
  countdownDiv.classList.remove('message-state');
  renderAttendanceLocationPolicy(session);

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
    countdownDiv.classList.add('message-state');
    countdownDiv.textContent = session.message || '지금은 출석 가능한 시간이 아닙니다.';
    isAttendanceActive = false;
    attendBtn.disabled = true;
    clearAttendButtonPhaseClassNames(attendBtn);
    attendBtn.innerHTML = '<i class="fas fa-times"></i> <span>출석 불가</span>';
    return;
  }

  if (session.locationPolicyValid === false) {
    countdownTitle.textContent = '출석 장소 설정 확인 필요';
    countdownDiv.classList.add('message-state');
    countdownDiv.textContent = '운영진이 장소 설정을 수정한 뒤 출석할 수 있습니다.';
    isAttendanceActive = false;
    currentAttendancePhase = '';
    setAttendancePhaseNoticeVisible(false);
    attendBtn.disabled = true;
    clearAttendButtonPhaseClassNames(attendBtn);
    attendBtn.innerHTML = '<i class="fas fa-triangle-exclamation"></i> <span>장소 설정 오류</span>';
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
    currentAttendanceSession = session && session.active && session.locationPolicyValid !== false ? session : null;
    setAttendanceLocationStatus('');
    renderCountdown(session);
    return session;
  } catch (error) {
    if (handleHistoricalAccessError(error)) return;
    currentAttendanceSession = null;
    setAttendanceLocationStatus('');
    renderCountdown({ active: false, message: getDisplayErrorMessage(error, '세션 정보를 불러올 수 없습니다.') });
    return null;
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

  if (studentRankingRequest.promise && studentRankingRequest.season === seasonAlias) {
    return studentRankingRequest.promise;
  }

  const requestGeneration = studentRankingCacheGeneration;
  const requestPromise = (async () => {
    try {
      const response = await callStudentApi('ranking', buildSeasonParams());
      if (requestGeneration !== studentRankingCacheGeneration) return;
      if (response && response.success) {
        studentRankingCache = {
          season: seasonAlias,
          loadedAt: Date.now(),
          response: response
        };
      }
      displayRankings(response);
    } catch (error) {
      if (requestGeneration !== studentRankingCacheGeneration) return;
      if (handleHistoricalAccessError(error)) return;
      handleRankingError(error);
    } finally {
      if (studentRankingRequest.promise === requestPromise) {
        studentRankingRequest = { season: '', promise: null };
      }
    }
  })();

  studentRankingRequest = { season: seasonAlias, promise: requestPromise };
  return requestPromise;
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
  const hasServerRanks = list.length > 0 && list.every(item => Number.isFinite(Number(item && item.rank)) && Number(item.rank) > 0);

  if (hasServerRanks) {
    return list
      .sort((a, b) => Number(a.rank) - Number(b.rank))
      .map(item => Object.assign({}, item, { rank: Math.trunc(Number(item.rank)) }));
  }

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

    return String(a && a.name || '').localeCompare(String(b && b.name || ''));
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
    <div class="ranking-table-scroll" role="region" aria-label="출석률 순위 표" tabindex="0">
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

  tableHTML += '</tbody></table></div>';
  rankingBoard.innerHTML = tableHTML;
}

function handleRankingError(error) {
  const rankingBoard = document.getElementById('rankingBoard');
  rankingBoard.innerHTML = `<div class="error">${escapeHtml(getDisplayErrorMessage(error, '순위를 불러오는 중 오류가 발생했습니다.'))}</div>`;
  console.error('Ranking error:', error);
}

function setStudentMenuOpen(open, options) {
  const menuButton = document.getElementById('studentMenuButton');
  const drawer = document.getElementById('studentMobileMenu');
  const backdrop = document.getElementById('studentMenuBackdrop');
  if (!menuButton || !drawer || !backdrop) return;

  const shouldOpen = !!open;
  const opts = options || {};
  menuButton.setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
  menuButton.setAttribute('aria-label', shouldOpen ? '메뉴 닫기' : '메뉴 열기');
  drawer.setAttribute('aria-hidden', shouldOpen ? 'false' : 'true');
  drawer.toggleAttribute('inert', !shouldOpen);
  drawer.classList.toggle('is-open', shouldOpen);
  backdrop.classList.toggle('is-open', shouldOpen);
  document.body.classList.toggle('menu-open', shouldOpen);

  if (shouldOpen) {
    studentMenuReturnFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : menuButton;
    const firstButton = drawer.querySelector('.mobile-drawer-button');
    if (firstButton) firstButton.focus();
    return;
  }

  if (opts.restoreFocus !== false && studentMenuReturnFocus instanceof HTMLElement) {
    studentMenuReturnFocus.focus();
  }
  studentMenuReturnFocus = null;
}

function openTab(tabName) {
  const targetPanel = document.getElementById(tabName);
  if (!targetPanel || !targetPanel.classList.contains('tab-content')) return;

  document.querySelectorAll('.tab-content').forEach(panel => {
    const isActive = panel === targetPanel;
    panel.classList.toggle('active', isActive);
    panel.setAttribute('aria-hidden', isActive ? 'false' : 'true');
  });

  document.querySelectorAll('[data-student-tab]').forEach(button => {
    const isActive = button.getAttribute('data-student-tab') === tabName;
    button.classList.toggle('active', isActive);
    if (button.getAttribute('role') === 'tab') {
      button.setAttribute('aria-selected', isActive ? 'true' : 'false');
      button.setAttribute('tabindex', isActive ? '0' : '-1');
    }
  });

  setStudentMenuOpen(false);
  if (tabName !== 'status') resetStudentStatusResult();
  if (tabName !== 'completion') invalidateStudentCompletionRequest();
  if (tabName === 'status' && currentSeason) loadRankings();
  if ((tabName === 'schedule' || tabName === 'completion') && currentSeason) {
    loadStudentSchedule({
      renderResult: tabName === 'schedule',
      showLoading: tabName === 'schedule'
    });
  }
}

let studentSchedulePayload = null;

function renderStudentSchedule(payload) {
  const wrap = document.getElementById('studentScheduleList');
  if (!wrap) return;
  if (!payload || !payload.success) {
    wrap.innerHTML = `<div class="upgrade-notice">${escapeHtml(payload && payload.message || 'Apps Script 업데이트 후 행사 일정을 확인할 수 있습니다.')}</div>`;
    return;
  }
  const items = Array.isArray(payload.items) ? payload.items : [];
  wrap.innerHTML = items.length ? items.map(item => {
    const requiredLabel = item.requiredPosition === 'first'
      ? '<span class="grade-badge">첫 행사 · 필수</span>'
      : (item.requiredPosition === 'last' ? '<span class="grade-badge">마지막 행사 · 필수</span>' : '');
    const mapLink = item.mapsUrl
      ? `<a class="btn btn-secondary" href="${escapeHtml(item.mapsUrl)}" target="_blank" rel="noopener noreferrer">지도에서 위치 확인</a>`
      : '';
    return `<article class="attendance-item">
      <div class="attendance-date">${requiredLabel}<strong>${escapeHtml(item.eventName || item.sessionKey || '행사')}</strong><span>${escapeHtml(item.date || '-')}</span></div>
      <div class="attendance-status future"><span>${escapeHtml(item.locationNote || (item.locationRequired ? '지정 장소' : '위치 제한 없음'))}</span>${mapLink}</div>
    </article>`;
  }).join('') : '<p class="info-text">등록된 행사가 없습니다.</p>';
}

async function loadStudentSchedule(options) {
  const opts = options || {};
  const wrap = document.getElementById('studentScheduleList');
  if (studentSchedulePayload && studentSchedulePayload.success && !opts.forceReload) {
    if (opts.renderResult !== false) renderStudentSchedule(studentSchedulePayload);
    return studentSchedulePayload;
  }
  if (studentScheduleRequest) {
    const pendingPayload = await studentScheduleRequest;
    if (opts.renderResult !== false) renderStudentSchedule(pendingPayload);
    return pendingPayload;
  }
  if (wrap && opts.showLoading !== false) wrap.innerHTML = '<div class="loader"></div>';
  studentScheduleRequest = callStudentApi('studentSchedule', buildSeasonParams());
  try {
    studentSchedulePayload = await studentScheduleRequest;
    if (opts.renderResult !== false) renderStudentSchedule(studentSchedulePayload);
    return studentSchedulePayload;
  } catch (error) {
    studentSchedulePayload = null;
    const failure = { success: false, message: 'Apps Script 업데이트 후 행사 일정을 확인할 수 있습니다.' };
    if (opts.renderResult !== false) renderStudentSchedule(failure);
    return failure;
  } finally {
    studentScheduleRequest = null;
  }
}

function renderCompletionPolicyDialogBody(payload) {
  const body = document.getElementById('completionPolicyDialogBody');
  if (!body) return;
  const policy = payload && payload.success && payload.completionPolicy;
  body.innerHTML = policy
    ? `<p>최소 출석 ${Number(policy.requiredAttendanceCount || 0)}회, 지각 ${Number(policy.lateToAbsenceRatio || 1)}회는 결석 1회로 환산합니다.</p><p>첫 행사와 마지막 행사는 필수 참여 회차입니다. 유고는 별도 운영 기준에 따라 처리됩니다.</p>`
    : '<p>현재 시즌의 정확한 수료 기준을 불러오지 못했습니다. 첫 행사와 마지막 행사는 필수 참여 회차입니다.</p>';
}

async function openCompletionPolicyDialog(trigger) {
  const dialog = document.getElementById('completionPolicyDialog');
  const body = document.getElementById('completionPolicyDialogBody');
  const closeButton = document.getElementById('completionPolicyDialogClose');
  if (!dialog || !body || !closeButton) return;
  completionPolicyDialogTrigger = trigger && typeof trigger.focus === 'function'
    ? trigger
    : (document.activeElement instanceof HTMLElement ? document.activeElement : null);
  completionPolicyDialogPreviousBodyOverflow = document.body.style.overflow;
  document.body.style.overflow = 'hidden';
  body.innerHTML = '<p>현재 시즌 수료 조건을 불러오는 중입니다.</p>';
  dialog.removeAttribute('inert');
  dialog.setAttribute('aria-hidden', 'false');
  dialog.classList.add('is-open');
  closeButton.focus();

  const payload = await loadStudentSchedule({ renderResult: false, showLoading: false });
  if (dialog.getAttribute('aria-hidden') === 'false') {
    renderCompletionPolicyDialogBody(payload);
  }
}

function closeCompletionPolicyDialog() {
  const dialog = document.getElementById('completionPolicyDialog');
  if (!dialog) return;
  dialog.classList.remove('is-open');
  dialog.setAttribute('aria-hidden', 'true');
  dialog.setAttribute('inert', '');
  if (completionPolicyDialogPreviousBodyOverflow !== null) {
    document.body.style.overflow = completionPolicyDialogPreviousBodyOverflow;
    completionPolicyDialogPreviousBodyOverflow = null;
  }
  const trigger = completionPolicyDialogTrigger;
  completionPolicyDialogTrigger = null;
  if (trigger && trigger.isConnected && typeof trigger.focus === 'function') {
    trigger.focus();
  }
}

function handleCompletionPolicyDialogKeydown(event) {
  const dialog = document.getElementById('completionPolicyDialog');
  if (!dialog || dialog.getAttribute('aria-hidden') !== 'false') return;
  if (event.key === 'Escape') {
    event.preventDefault();
    closeCompletionPolicyDialog();
    return;
  }
  if (event.key !== 'Tab') return;
  const focusable = Array.from(dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]'))
    .filter(element => !element.disabled && !element.hidden && element.getAttribute('tabindex') !== '-1');
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function initializeCompletionPolicyDialog() {
  const dialog = document.getElementById('completionPolicyDialog');
  if (!dialog) return;
  dialog.addEventListener('click', event => {
    if (event.target === dialog) closeCompletionPolicyDialog();
  });
  dialog.addEventListener('keydown', handleCompletionPolicyDialogKeydown);
}

function initializeStudentNavigation() {
  const menuButton = document.getElementById('studentMenuButton');
  const backdrop = document.getElementById('studentMenuBackdrop');

  document.querySelectorAll('[data-student-tab]').forEach(button => {
    button.addEventListener('click', () => openTab(button.getAttribute('data-student-tab')));
  });

  if (menuButton) {
    menuButton.addEventListener('click', () => {
      setStudentMenuOpen(menuButton.getAttribute('aria-expanded') !== 'true');
    });
  }

  if (backdrop) {
    backdrop.addEventListener('click', () => setStudentMenuOpen(false));
  }

  document.addEventListener('keydown', event => {
    const menuIsOpen = menuButton && menuButton.getAttribute('aria-expanded') === 'true';
    if (event.key === 'Escape' && menuIsOpen) {
      event.preventDefault();
      setStudentMenuOpen(false);
      return;
    }

    if (event.key === 'Tab' && menuIsOpen) {
      const drawer = document.getElementById('studentMobileMenu');
      const focusable = drawer
        ? Array.from(drawer.querySelectorAll('.mobile-drawer-button')).concat(menuButton)
        : [];
      if (!focusable.length) return;
      const currentIndex = focusable.indexOf(document.activeElement);
      if (currentIndex < 0) return;
      event.preventDefault();
      const offset = event.shiftKey ? -1 : 1;
      focusable[(currentIndex + offset + focusable.length) % focusable.length].focus();
    }
  });

  document.querySelectorAll('.tab-button').forEach(button => {
    button.addEventListener('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault();
      const buttons = Array.from(document.querySelectorAll('.tab-button'));
      const currentIndex = buttons.indexOf(button);
      const offset = event.key === 'ArrowRight' ? 1 : -1;
      const nextButton = buttons[(currentIndex + offset + buttons.length) % buttons.length];
      openTab(nextButton.getAttribute('data-student-tab'));
      nextButton.focus();
    });
  });

  window.addEventListener('resize', () => {
    if (window.innerWidth > 768 && menuButton && menuButton.getAttribute('aria-expanded') === 'true') {
      setStudentMenuOpen(false, { restoreFocus: false });
    }
  });
}

function captureAttendanceLocation() {
  return new Promise((resolve, reject) => {
    if (!window.isSecureContext) {
      reject(createStudentApiError('LOCATION_INSECURE_CONTEXT', '안전한 HTTPS 페이지에서만 위치를 확인할 수 있습니다.'));
      return;
    }
    if (!navigator.geolocation) {
      reject(createStudentApiError('LOCATION_UNSUPPORTED', '이 브라우저는 위치 확인을 지원하지 않습니다.'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      position => {
        const coords = position && position.coords ? position.coords : {};
        if (!Number.isFinite(coords.latitude) || !Number.isFinite(coords.longitude) || !Number.isFinite(coords.accuracy)) {
          reject(createStudentApiError('LOCATION_INVALID', '현재 위치 정보를 확인하지 못했습니다.'));
          return;
        }
        resolve({
          latitude: coords.latitude,
          longitude: coords.longitude,
          accuracy: coords.accuracy
        });
      },
      error => {
        const codeByNative = {
          1: 'LOCATION_PERMISSION_DENIED',
          2: 'LOCATION_UNAVAILABLE',
          3: 'LOCATION_TIMEOUT'
        };
        const messageByNative = {
          1: '위치 권한을 허용한 뒤 다시 시도해 주세요.',
          2: '현재 위치를 확인할 수 없습니다. 위치 서비스를 켜고 다시 시도해 주세요.',
          3: '위치 확인 시간이 초과되었습니다. 하늘이 보이거나 신호가 좋은 곳에서 다시 시도해 주세요.'
        };
        reject(createStudentApiError(codeByNative[error && error.code] || 'LOCATION_ERROR', messageByNative[error && error.code] || '현재 위치 확인 중 오류가 발생했습니다.'));
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 12000 }
    );
  });
}

async function doAttendance(event) {
  event.preventDefault();

  const phoneNumber = normalizeStudentPhone(document.getElementById('phoneInput').value);

  if (!phoneNumber) {
    alert('전화번호를 입력해주세요.');
    return;
  }

  if (!isValidStudentPhone(phoneNumber)) {
    alert('올바른 전화번호 형식이 아닙니다. (예: 01012345678)');
    return;
  }

  if (!isAttendanceActive) {
    alert('현재는 출석 가능한 시간이 아닙니다.');
    return;
  }

  const attendBtn = document.getElementById('attendBtn');
  attendBtn.disabled = true;
  attendBtn.innerHTML = '<span class="loader"></span> <span>회차 확인 중...</span>';

  const refreshedSession = await checkAttendanceSession();
  if (!refreshedSession || !refreshedSession.active || refreshedSession.locationPolicyValid === false || !isAttendanceActive) {
    return;
  }

  currentAttendanceSession = refreshedSession;
  attendBtn.disabled = true;
  attendBtn.innerHTML = currentAttendanceSession && currentAttendanceSession.locationRequired
    ? '<span class="loader"></span> <span>위치 확인 중...</span>'
    : '<span class="loader"></span> <span>처리 중...</span>';

  saveLastUsedStudentPhone(phoneNumber);

  try {
    let response;
    if (currentAttendanceSession && currentAttendanceSession.locationRequired) {
      setAttendanceLocationStatus('출석 판정을 위해 현재 위치를 한 번 확인합니다. 위치 좌표는 출석 판정 후 저장하지 않습니다.');
      const location = await captureAttendanceLocation();
      setAttendanceLocationStatus('지정 장소와의 거리를 서버에서 확인하고 있습니다.');
      response = await window.CloudClubApi.postLocationAttendance(buildSeasonParams({
        phone: phoneNumber,
        latitude: location.latitude,
        longitude: location.longitude,
        accuracy: location.accuracy
      }), { timeoutMs: 20000 });
    } else {
      response = await callStudentApi('attendance', buildSeasonParams({ phone: phoneNumber }));
    }
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
    setAttendanceLocationStatus(response.locationVerified ? '현재 위치 확인이 완료되었습니다.' : '', response.locationVerified ? 'success' : '');
    invalidateStudentRankingCache();
    invalidateStudentStatusCache();

    createConfetti();

    const typeBadge = response.attendanceType === 'late'
      ? '<span class="attendance-badge late">지각</span>'
      : '<span class="attendance-badge on-time">정시</span>';
    const safeSeasonLabel = escapeHtml(response.seasonLabel || response.grade || '-');
    const safeName = escapeHtml(response.name || '회원');
    const safeTime = escapeHtml(response.time || '');

    let message = `
      <div class="attendance-result-headline">
        <i class="fas fa-circle-check" aria-hidden="true"></i>
        <span><span class="grade-badge">${safeSeasonLabel}</span>${safeName}님 출석 완료</span>
      </div>
      <p class="attendance-result-meta">${safeTime} ${typeBadge}</p>
    `;

    if (response.attendanceInfo) {
      const info = buildLiveAttendanceProgress(response.attendanceInfo);
      message += `
        <div class="attendance-info">
          <h3><span class="grade-badge">${safeSeasonLabel}</span>${safeName}님 출석 현황</h3>
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
    const isLocationError = response.errorCode && String(response.errorCode).indexOf('LOCATION_') === 0;
    if (isLocationError) {
      setAttendanceLocationStatus(response.message || '위치 확인에 실패했습니다. 다시 시도해 주세요.', 'error');
      resultDiv.textContent = '';
      resultDiv.className = '';
    } else {
      resultDiv.innerHTML = `❌ ${escapeHtml(response.message || '출석 처리에 실패했습니다.')}`;
      resultDiv.className = 'error';
    }
    attendBtn.disabled = false;
    setAttendButtonByPhase(currentAttendancePhase || 'on_time', { preserveDisabledLabel: false });
  }

  if (response.success) {
    setTimeout(() => {
      resultDiv.textContent = '';
      resultDiv.className = '';
    }, 15000);
  }
}

function handleAttendanceError(error) {
  const resultDiv = document.getElementById('result');
  const attendBtn = document.getElementById('attendBtn');

  const isLocationError = String(error && error.code || '').indexOf('LOCATION_') === 0;
  if (isLocationError) {
    setAttendanceLocationStatus(getDisplayErrorMessage(error, '위치 확인에 실패했습니다.'), 'error');
    resultDiv.textContent = '';
    resultDiv.className = '';
  } else {
    resultDiv.innerHTML = `❌ 오류가 발생했습니다: ${escapeHtml(getDisplayErrorMessage(error, '알 수 없는 오류'))}`;
    resultDiv.className = 'error';
  }

  if (isAttendanceActive) {
    attendBtn.disabled = false;
    setAttendButtonByPhase(currentAttendancePhase || 'on_time', { preserveDisabledLabel: false });
  } else {
    attendBtn.disabled = true;
    clearAttendButtonPhaseClassNames(attendBtn);
    attendBtn.innerHTML = '<i class="fas fa-times"></i> <span>출석 불가</span>';
  }

}

async function checkAttendanceStatus(event) {
  event.preventDefault();
  resetStudentStatusResult();
  const viewGeneration = studentStatusViewGeneration;

  const phoneNumber = normalizeStudentPhone(document.getElementById('statusPhoneInput').value);

  if (!phoneNumber) {
    alert('전화번호를 입력해주세요.');
    return;
  }

  if (!isValidStudentPhone(phoneNumber)) {
    alert('올바른 전화번호 형식이 아닙니다. (예: 01012345678)');
    return;
  }

  saveLastUsedStudentPhone(phoneNumber);

  const statusResult = document.getElementById('statusResult');
  statusResult.innerHTML = '<div class="loader" style="margin: 32px auto;"></div>';
  statusResult.style.display = 'block';

  try {
    const response = await fetchStudentStatus(phoneNumber);
    if (viewGeneration !== studentStatusViewGeneration) return;
    handleStatusResponse(response);
  } catch (error) {
    if (viewGeneration !== studentStatusViewGeneration) return;
    if (handleHistoricalAccessError(error)) return;
    handleStatusError(error);
  }
}

function toSafeNumber(value, fallbackValue) {
  const parsed = Number(value);
  if (Number.isFinite(parsed)) return parsed;
  const fallback = Number(fallbackValue);
  return Number.isFinite(fallback) ? fallback : 0;
}

function formatOneDecimal(value) {
  return toSafeNumber(value, 0).toFixed(1);
}

function getStatusCounts(data, completion) {
  const details = Array.isArray(data && data.details) ? data.details : [];
  const derived = { attended: 0, late: 0, absent: 0, excused: 0, future: 0 };

  details.forEach(detail => {
    const type = String((detail && detail.attendanceType) || '');
    if (type === 'on_time' || type === 'late') derived.attended++;
    if (type === 'late') derived.late++;
    if (type === 'absent') derived.absent++;
    if (type === 'excused') derived.excused++;
    if (type === 'future') derived.future++;
  });

  const currentCounts = completion && completion.currentCounts && typeof completion.currentCounts === 'object'
    ? completion.currentCounts
    : {};
  const hasDetails = details.length > 0;
  const resolveCount = (completionValue, derivedValue, legacyValue) => {
    if (Number.isFinite(Number(completionValue))) {
      return Math.max(0, toSafeInteger(completionValue, 0));
    }
    return Math.max(0, hasDetails ? derivedValue : toSafeInteger(legacyValue, derivedValue));
  };

  return {
    attended: resolveCount(currentCounts.attended ?? completion?.attendedCount, derived.attended, data && data.attended),
    late: resolveCount(currentCounts.late ?? completion?.lateCount, derived.late, data && data.lateCount),
    absent: resolveCount(currentCounts.absent ?? completion?.absentCount, derived.absent, data && data.absentCount),
    excused: resolveCount(currentCounts.excused ?? completion?.excusedCount, derived.excused, data && data.excusedCount),
    future: resolveCount(currentCounts.future ?? completion?.futureCount, derived.future, data && data.futureCount)
  };
}

function renderUpgradeNotice(title) {
  return `
    <div class="upgrade-notice">
      <strong>${escapeHtml(title || '추가 지표 준비 중')}</strong>
      Apps Script 업데이트 후 확인 가능
    </div>
  `;
}

function renderStatusComparison(comparison, fallbackRate) {
  if (!comparison || typeof comparison !== 'object') {
    return `
      <div class="metric-grid single-metric">
        <div class="metric-card" data-status-metric="personal-rate">
          <span class="metric-label">내 출석률</span>
          <span class="metric-value highlight">${formatOneDecimal(fallbackRate)}%</span>
          <span class="metric-note">현재까지 반영</span>
        </div>
      </div>
      ${renderUpgradeNotice('전체 평균 비교와 전체 순위')}
    `;
  }

  const finiteOrNull = value => {
    if (value === null || value === undefined || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const fallbackPersonalRate = finiteOrNull(fallbackRate) ?? 0;
  const personalMetric = finiteOrNull(comparison.personalAttendanceRate);
  const cohortRate = finiteOrNull(comparison.cohortAverageAttendanceRate);
  const suppliedDifference = finiteOrNull(comparison.differencePercentagePoints);
  const personalRate = personalMetric ?? fallbackPersonalRate;
  const difference = suppliedDifference ?? (cohortRate === null ? null : personalRate - cohortRate);
  const rankMetric = finiteOrNull(comparison.rank);
  const cohortMetric = finiteOrNull(comparison.cohortSize);
  const percentileMetric = finiteOrNull(comparison.topPercentile);
  const rank = rankMetric !== null && rankMetric > 0 ? Math.max(1, Math.floor(rankMetric)) : null;
  const cohortSize = cohortMetric !== null ? Math.max(0, Math.floor(cohortMetric)) : 0;
  const topPercentile = percentileMetric === null ? null : Math.min(100, Math.max(0, percentileMetric));
  const differenceValue = difference === null
    ? '-'
    : `${difference > 0 ? '+' : ''}${formatOneDecimal(difference)}%p`;
  const differenceNote = difference === null
    ? '비교 데이터 없음'
    : (Math.abs(difference) < 0.05 ? '평균과 동일' : `평균보다 ${difference > 0 ? '높음' : '낮음'}`);
  const summaryText = difference === null
    ? '전체 평균 비교 데이터가 아직 없습니다.'
    : (Math.abs(difference) < 0.05
      ? '전체 평균과 동일합니다.'
      : `전체 평균보다 ${formatOneDecimal(Math.abs(difference))}%p ${difference > 0 ? '높습니다.' : '낮습니다.'}`);
  const summaryIcon = difference === null
    ? 'fa-circle-info'
    : (Math.abs(difference) < 0.05 ? 'fa-equals' : (difference > 0 ? 'fa-arrow-trend-up' : 'fa-arrow-trend-down'));
  const rankText = `${rank === null ? '-' : rank} / ${cohortSize}`;
  const percentileText = topPercentile === null ? '-' : `${formatOneDecimal(topPercentile)}%`;
  const percentileNote = topPercentile === null
    ? (cohortSize > 0 ? '순위 집계 중' : '비교 대상 없음')
    : '전체 순위 기준';

  return `
    <div class="metric-grid status-comparison-grid" role="list" aria-label="출석률 비교 지표">
      <div class="metric-card" role="listitem" data-status-metric="personal-rate">
        <span class="metric-label">내 출석률</span>
        <span class="metric-value highlight">${formatOneDecimal(personalRate)}%</span>
        <span class="metric-note">현재까지 반영</span>
      </div>
      <div class="metric-card" role="listitem" data-status-metric="cohort-average">
        <span class="metric-label">전체 평균</span>
        <span class="metric-value">${cohortRate === null ? '-' : `${formatOneDecimal(cohortRate)}%`}</span>
        <span class="metric-note">비교 대상 기준</span>
      </div>
      <div class="metric-card" role="listitem" data-status-metric="difference">
        <span class="metric-label">평균 대비</span>
        <span class="metric-value">${differenceValue}</span>
        <span class="metric-note">${differenceNote}</span>
      </div>
      <div class="metric-card" role="listitem" data-status-metric="rank">
        <span class="metric-label">전체 순위</span>
        <span class="metric-value">${rankText}</span>
        <span class="metric-note">순위 / 전체 인원</span>
      </div>
      <div class="metric-card" role="listitem" data-status-metric="percentile">
        <span class="metric-label">상위 백분율</span>
        <span class="metric-value">${percentileText}</span>
        <span class="metric-note">${percentileNote}</span>
      </div>
    </div>
    <div class="comparison-summary">
      <i class="fas ${summaryIcon}" aria-hidden="true"></i>
      <span><strong>${summaryText}</strong><br>차이는 퍼센트포인트(%p) 기준입니다.</span>
    </div>
  `;
}

function getStudentAttendanceStatusMeta(type) {
  const statusByType = {
    future: { css: 'future', icon: 'fa-clock', text: '예정' },
    on_time: { css: 'present', icon: 'fa-check-circle', text: '출석' },
    late: { css: 'late', icon: 'fa-hourglass-half', text: '지각' },
    excused: { css: 'excused', icon: 'fa-notes-medical', text: '유고' },
    absent: { css: 'absent', icon: 'fa-times-circle', text: '결석' }
  };
  return statusByType[type] || statusByType.absent;
}

function sanitizeStudentAttendanceDetails(details) {
  const allowedTypes = ['future', 'on_time', 'late', 'excused', 'absent'];
  const reasonAllowedTypes = ['on_time', 'late', 'absent'];
  const list = Array.isArray(details) ? details : [];

  return list.map(detail => {
    const source = detail && typeof detail === 'object' ? detail : {};
    const sourceType = typeof source.attendanceType === 'string' ? source.attendanceType : '';
    const rawType = sourceType.trim();
    const attendanceType = allowedTypes.includes(rawType) ? rawType : 'absent';
    const rawDate = typeof source.date === 'string'
      ? source.date.trim()
      : (typeof source.sessionKey === 'string' ? source.sessionKey.trim() : '');
    const rawTime = typeof source.time === 'string' ? source.time.trim() : '';
    const dateTimeMatch = rawDate.match(/^(.+?)[T\s]+(\d{1,2}:\d{2})(?::\d{2})?$/);
    const date = dateTimeMatch ? dateTimeMatch[1].trim() : (rawDate || '-');
    const time = rawTime || (dateTimeMatch ? dateTimeMatch[2] : '-');
    const rawReason = typeof source.displayReason === 'string' ? source.displayReason : '';
    const trimmedReason = rawReason.trim();
    const displayReason = reasonAllowedTypes.includes(sourceType)
      && trimmedReason
      && Array.from(trimmedReason).length <= 300
      && !/[\r\n\u0085\u2028\u2029]/.test(rawReason)
      ? trimmedReason
      : '';

    return { attendanceType, date, time, displayReason };
  });
}

function sanitizeStudentStatusResponseForCache(response) {
  if (!response || typeof response !== 'object') return response;

  const cachedResponse = Object.assign({}, response);
  if (!response.data || typeof response.data !== 'object') return cachedResponse;

  const cachedData = Object.assign({}, response.data);
  if (Object.prototype.hasOwnProperty.call(response.data, 'details')) {
    cachedData.details = sanitizeStudentAttendanceDetails(response.data.details).map(detail => {
      const cachedDetail = {
        attendanceType: detail.attendanceType,
        date: detail.date,
        time: detail.time
      };
      if (detail.displayReason) cachedDetail.displayReason = detail.displayReason;
      return cachedDetail;
    });
  }
  cachedResponse.data = cachedData;
  return cachedResponse;
}

function closeStudentAttendanceDetailDialog(options) {
  const opts = options || {};
  const dialog = document.getElementById('studentAttendanceDetailDialog');
  const trigger = studentAttendanceDetailTrigger;
  const wasOpen = !!(dialog && dialog.getAttribute('aria-hidden') === 'false');
  const activeElement = document.activeElement;
  const focusWasInDialog = !!(dialog && dialog.contains(activeElement));
  const focusWasOnTrigger = !!(trigger && activeElement === trigger);
  const focusWasPending = studentAttendanceDetailFocusTimer !== null;
  if (focusWasPending) {
    clearTimeout(studentAttendanceDetailFocusTimer);
    studentAttendanceDetailFocusTimer = null;
  }
  studentAttendanceDetailFocusGeneration++;

  if (dialog) {
    dialog.classList.remove('is-open');
    dialog.setAttribute('aria-hidden', 'true');
    dialog.setAttribute('inert', '');
  }
  if (studentAttendanceDetailPreviousBodyOverflow !== null) {
    document.body.style.overflow = studentAttendanceDetailPreviousBodyOverflow;
    studentAttendanceDetailPreviousBodyOverflow = null;
  }
  studentAttendanceDetailTrigger = null;

  const fallbackFocus = document.getElementById('statusPhoneInput');
  const canFocusFallback = !!(
    fallbackFocus
    && fallbackFocus.isConnected
    && !fallbackFocus.disabled
    && !fallbackFocus.hidden
    && typeof fallbackFocus.focus === 'function'
  );
  const canRestoreTrigger = !!(
    trigger
    && trigger.isConnected
    && !trigger.disabled
    && !trigger.hidden
    && typeof trigger.focus === 'function'
  );

  if (opts.restoreFocus !== false && wasOpen && canRestoreTrigger) {
    trigger.focus();
  } else if (opts.restoreFocus !== false && wasOpen && canFocusFallback) {
    fallbackFocus.focus();
  } else if (
    opts.restoreFocus === false
    && wasOpen
    && (focusWasInDialog || focusWasOnTrigger || (focusWasPending && (!activeElement || activeElement === document.body)))
    && canFocusFallback
  ) {
    fallbackFocus.focus();
  }
}

function clearStudentAttendanceDetailState() {
  studentStatusDetails = [];
  closeStudentAttendanceDetailDialog({ restoreFocus: false });
}

function resetStudentStatusResult() {
  studentStatusViewGeneration++;
  clearStudentAttendanceDetailState();
  const statusResult = document.getElementById('statusResult');
  if (!statusResult) return;
  statusResult.innerHTML = '';
  statusResult.style.display = 'none';
}

function openStudentAttendanceDetailDialog(index, trigger) {
  const normalizedIndex = String(index);
  if (!/^(0|[1-9][0-9]*)$/.test(normalizedIndex)) return false;
  const detailIndex = Number(normalizedIndex);
  if (!Number.isInteger(detailIndex) || detailIndex < 0 || detailIndex >= studentStatusDetails.length) return false;

  const detail = studentStatusDetails[detailIndex];
  if (!detail || !detail.displayReason) return false;

  const dialog = document.getElementById('studentAttendanceDetailDialog');
  const closeButton = document.getElementById('studentAttendanceDetailClose');
  if (!dialog || !closeButton) return false;
  if (studentAttendanceDetailFocusTimer !== null) {
    clearTimeout(studentAttendanceDetailFocusTimer);
    studentAttendanceDetailFocusTimer = null;
  }
  const focusGeneration = ++studentAttendanceDetailFocusGeneration;

  const status = getStudentAttendanceStatusMeta(detail.attendanceType);
  document.getElementById('studentAttendanceDetailStatus').textContent = status.text;
  document.getElementById('studentAttendanceDetailDate').textContent = detail.date;
  document.getElementById('studentAttendanceDetailTime').textContent = detail.time;
  document.getElementById('studentAttendanceDetailReason').textContent = detail.displayReason;

  studentAttendanceDetailTrigger = trigger && typeof trigger.focus === 'function' ? trigger : null;
  if (dialog.getAttribute('aria-hidden') !== 'false') {
    studentAttendanceDetailPreviousBodyOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
  }
  dialog.removeAttribute('inert');
  dialog.setAttribute('aria-hidden', 'false');
  dialog.classList.add('is-open');
  let focusAttemptsRemaining = 16;
  const tryCloseButtonFocus = () => {
    if (focusGeneration !== studentAttendanceDetailFocusGeneration
        || dialog.getAttribute('aria-hidden') !== 'false'
        || dialog.hasAttribute('inert')
        || !closeButton.isConnected) return true;
    const activeElement = document.activeElement;
    if (activeElement === closeButton) return true;
    if (activeElement && activeElement !== document.body && activeElement !== studentAttendanceDetailTrigger) {
      return true;
    }
    closeButton.focus();
    return document.activeElement === closeButton;
  };
  const confirmCloseButtonFocus = () => {
    studentAttendanceDetailFocusTimer = null;
    if (tryCloseButtonFocus() || focusAttemptsRemaining <= 0) return;
    focusAttemptsRemaining--;
    studentAttendanceDetailFocusTimer = setTimeout(confirmCloseButtonFocus, 16);
  };
  tryCloseButtonFocus();
  studentAttendanceDetailFocusTimer = setTimeout(confirmCloseButtonFocus, 0);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      tryCloseButtonFocus();
    });
  });
  return true;
}

function handleStudentAttendanceDetailDialogKeydown(event) {
  const dialog = document.getElementById('studentAttendanceDetailDialog');
  if (!dialog || dialog.getAttribute('aria-hidden') !== 'false') return;

  if (event.key === 'Escape') {
    event.preventDefault();
    closeStudentAttendanceDetailDialog();
    return;
  }
  if (event.key !== 'Tab') return;

  const focusable = Array.from(dialog.querySelectorAll('button, [href], input, select, textarea, [tabindex]'))
    .filter(element => !element.disabled && !element.hidden && element.getAttribute('tabindex') !== '-1');
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;

  if (event.shiftKey && (active === first || !dialog.contains(active))) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (active === last || !dialog.contains(active))) {
    event.preventDefault();
    first.focus();
  }
}

function initializeStudentAttendanceDetailDialog() {
  if (studentAttendanceDetailInitialized) return;
  const statusResult = document.getElementById('statusResult');
  const dialog = document.getElementById('studentAttendanceDetailDialog');
  const closeButton = document.getElementById('studentAttendanceDetailClose');
  if (!statusResult || !dialog || !closeButton) return;

  studentAttendanceDetailInitialized = true;
  statusResult.addEventListener('click', event => {
    const trigger = event.target && typeof event.target.closest === 'function'
      ? event.target.closest('[data-attendance-detail-index]')
      : null;
    if (!trigger || !statusResult.contains(trigger)) return;
    openStudentAttendanceDetailDialog(trigger.getAttribute('data-attendance-detail-index'), trigger);
  });
  closeButton.addEventListener('click', () => closeStudentAttendanceDetailDialog());
  dialog.addEventListener('click', event => {
    if (event.target === dialog) closeStudentAttendanceDetailDialog();
  });
  document.addEventListener('keydown', handleStudentAttendanceDetailDialogKeydown);
}

function renderAttendanceDetails(details) {
  const list = sanitizeStudentAttendanceDetails(details);
  if (!list.length) return '<p class="info-text">표시할 회차별 출석 내역이 없습니다.</p>';

  return list.map((detail, index) => {
    const status = getStudentAttendanceStatusMeta(detail.attendanceType);
    const itemClass = detail.attendanceType === 'future' ? 'future' : '';
    const dateTime = detail.time === '-' ? detail.date : `${detail.date} ${detail.time}`;
    const content = `
        <span class="attendance-date">${escapeHtml(dateTime)}</span>
        <span class="attendance-status-group">
          <span class="attendance-status ${status.css}">
            <i class="fas ${status.icon}" aria-hidden="true"></i>
            <span>${status.text}</span>
          </span>
          ${detail.displayReason ? '<span class="attendance-detail-affordance" aria-hidden="true">사유 보기 <i class="fas fa-chevron-right"></i></span>' : ''}
        </span>`;

    if (!detail.displayReason) {
      return `<div class="attendance-item ${itemClass}">${content}</div>`;
    }
    return `
      <button type="button"
              class="attendance-item attendance-detail-trigger ${itemClass}"
              data-attendance-detail-index="${index}"
              aria-haspopup="dialog"
              aria-controls="studentAttendanceDetailDialog">${content}
      </button>
    `;
  }).join('');
}

function handleStatusResponse(response) {
  const statusResult = document.getElementById('statusResult');
  clearStudentAttendanceDetailState();

  if (response.success) {
    const data = response.data || {};
    const details = sanitizeStudentAttendanceDetails(data.details);
    studentStatusDetails = details;
    const liveProgress = buildStatusProgressFromDetails(details);
    const insights = data.insights && typeof data.insights === 'object' ? data.insights : {};
    const comparison = insights.comparison;
    const completion = insights.completion;
    const counts = getStatusCounts(data, completion);
    const comparisonRateValue = comparison && comparison.personalAttendanceRate;
    const hasComparisonRate = comparisonRateValue !== null
      && comparisonRateValue !== undefined
      && comparisonRateValue !== ''
      && Number.isFinite(Number(comparisonRateValue));
    const hasLegacyRate = data.rate !== null
      && data.rate !== undefined
      && data.rate !== ''
      && Number.isFinite(Number(data.rate));
    const displayRate = hasComparisonRate
      ? Number(comparisonRateValue)
      : (hasLegacyRate ? Number(data.rate) : liveProgress.rate);
    const safeSeasonLabel = escapeHtml(String(data.seasonLabel || data.grade || '-'));
    const safeName = escapeHtml(String(data.name || '회원'));

    statusResult.innerHTML = `
      <div class="card status-dashboard-card">
        <h3 class="identity-heading"><span class="grade-badge">${safeSeasonLabel}</span>${safeName}님 출석 현황</h3>
        <div class="status-dashboard-layout">
          <section class="status-dashboard-group status-comparison-group" aria-label="출석률 비교">
            ${renderStatusComparison(comparison, displayRate)}
          </section>
          <section class="status-dashboard-group status-count-group" aria-label="출석 횟수와 상세">
            <div class="metric-grid count-grid status-count-grid" role="list" aria-label="출석 횟수 지표">
              <div class="metric-card" role="listitem" data-status-count="attended">
                <span class="metric-label">출석</span>
                <span class="metric-value">${counts.attended}회</span>
              </div>
              <div class="metric-card" role="listitem" data-status-count="late">
                <span class="metric-label">지각</span>
                <span class="metric-value">${counts.late}회</span>
              </div>
              <div class="metric-card" role="listitem" data-status-count="absent">
                <span class="metric-label">결석</span>
                <span class="metric-value">${counts.absent}회</span>
              </div>
              <div class="metric-card" role="listitem" data-status-count="excused">
                <span class="metric-label">유고</span>
                <span class="metric-value">${counts.excused}회</span>
              </div>
              <div class="metric-card" role="listitem" data-status-count="future">
                <span class="metric-label">남은 수업</span>
                <span class="metric-value">${counts.future}회</span>
              </div>
            </div>
            <section class="status-details" aria-labelledby="studentStatusDetailHeading">
              <h3 id="studentStatusDetailHeading">회차별 출석 상세</h3>
              <div class="attendance-details">${renderAttendanceDetails(details)}</div>
            </section>
          </section>
        </div>
      </div>
    `;
  } else {
    statusResult.innerHTML = `<div class="error">❌ ${escapeHtml(response.message || '출석 현황을 불러오지 못했습니다.')}</div>`;
  }

  statusResult.style.display = 'block';
}

function handleStatusError(error) {
  clearStudentAttendanceDetailState();
  const statusResult = document.getElementById('statusResult');
  statusResult.innerHTML = `<div class="error">❌ 오류가 발생했습니다: ${escapeHtml(getDisplayErrorMessage(error, '알 수 없는 오류'))}</div>`;
  statusResult.style.display = 'block';
}

function getRequiredSessions(completion) {
  if (Array.isArray(completion && completion.requiredSessions)) return completion.requiredSessions;
  const requiredCheck = completion && completion.requiredCheck;
  return requiredCheck && Array.isArray(requiredCheck.details) ? requiredCheck.details : [];
}

function renderRequiredSessionCriteria(completion) {
  const sessions = getRequiredSessions(completion);
  if (!sessions.length) {
    return `
      <li class="criteria-item ${completion.requiredSessionsOk ? 'is-satisfied' : (completion.requiredSessionsPossible ? '' : 'is-blocked')}">
        <i class="fas ${completion.requiredSessionsOk ? 'fa-circle-check' : 'fa-calendar-check'}" aria-hidden="true"></i>
        <div>
          <strong>필수 회차 참여</strong>
          <span>${completion.requiredSessionsOk ? '필수 회차 조건을 충족했습니다.' : (completion.requiredSessionsPossible ? '남은 필수 회차에 참여하면 충족할 수 있습니다.' : '필수 회차 조건을 충족하기 어렵습니다.')}</span>
        </div>
      </li>
    `;
  }

  const statusText = {
    on_time: '출석',
    late: '지각',
    excused: '유고',
    absent: '결석',
    future: '예정'
  };

  return sessions.map((session, index) => {
    const satisfied = !!session.satisfied;
    const possible = !!session.possible;
    const css = satisfied ? 'is-satisfied' : (possible ? '' : 'is-blocked');
    const icon = satisfied ? 'fa-circle-check' : (possible ? 'fa-clock' : 'fa-circle-xmark');
    const position = String(session.position || '');
    const label = position === 'first'
      ? '첫 회차'
      : (position === 'last' ? '마지막 회차' : `필수 회차 ${index + 1}`);
    const date = String(session.date || session.sessionKey || '').trim();
    const state = statusText[String(session.status || '')] || (possible ? '참여 가능' : '미충족');
    const detail = date ? `${date} · ${state}` : state;

    return `
      <li class="criteria-item ${css}">
        <i class="fas ${icon}" aria-hidden="true"></i>
        <div>
          <strong>${escapeHtml(label)}</strong>
          <span>${escapeHtml(detail)}</span>
        </div>
      </li>
    `;
  }).join('');
}

function renderCompletionAssessment(data, completion) {
  const safeSeasonLabel = escapeHtml(String(data.seasonLabel || data.grade || '-'));
  const safeName = escapeHtml(String(data.name || '회원'));
  const requiredAttendanceCount = Math.max(0, toSafeInteger(completion.requiredAttendanceCount, 0));
  const attendedCount = Math.max(0, toSafeInteger(completion.attendedCount, data.attended));
  const lateCount = Math.max(0, toSafeInteger(completion.lateCount, data.lateCount));
  const absentCount = Math.max(0, toSafeInteger(completion.absentCount, data.absentCount));
  const excusedCount = Math.max(0, toSafeInteger(completion.excusedCount, data.excusedCount));
  const remainingSessions = Math.max(0, toSafeInteger(completion.remainingSessions, completion.futureCount));
  const minimumFutureParticipation = Math.max(0, toSafeInteger(completion.minimumFutureParticipation, 0));
  const lateRatio = Math.max(1, toSafeInteger(completion.lateToAbsenceRatio, 1));
  const absenceEquivalent = Math.max(0, toSafeNumber(completion.absenceEquivalent, absentCount));
  const absenceEquivalentRate = Math.max(0, toSafeNumber(completion.absenceEquivalentRate, 0));
  const maxAbsenceEquivalent = Math.max(0, toSafeNumber(completion.maxAbsenceEquivalent, 0));
  const remainingAllowance = Math.max(0, toSafeNumber(completion.remainingAbsenceAllowance, 0));
  const isFinal = !!completion.isFinal;
  const isEligible = isFinal ? !!completion.isGraduated : !!completion.isGraduationPossible;
  const summaryTitle = isFinal
    ? (isEligible ? '최종 수료 조건을 충족했습니다' : '최종 수료 조건을 충족하지 못했습니다')
    : (isEligible ? '현재 기준 수료 가능합니다' : '현재 기준 수료가 어렵습니다');
  const summaryDetail = isFinal
    ? '모든 예정 회차가 종료된 최종 판정입니다.'
    : (isEligible
      ? `남은 ${remainingSessions}회 중 최소 ${minimumFutureParticipation}회 참여가 필요합니다.`
      : '아래 미충족 조건과 남은 참여 가능 횟수를 확인해 주세요.');

  return `
    <div class="card completion-assessment-card">
      <h3 class="identity-heading"><span class="grade-badge">${safeSeasonLabel}</span>${safeName}님 수료 조건</h3>
      <div class="completion-assessment-layout">
        <section class="completion-overview" aria-label="수료 가능 여부와 출석 지표">
          <div class="completion-summary ${isEligible ? 'is-positive' : 'is-negative'}">
            <i class="fas ${isEligible ? 'fa-circle-check' : 'fa-circle-exclamation'}" aria-hidden="true"></i>
            <span><strong>${summaryTitle}</strong><br>${summaryDetail}</span>
          </div>
          <div class="metric-grid count-grid completion-metric-grid">
            <div class="metric-card">
              <span class="metric-label">수료 필요 출석</span>
              <span class="metric-value">${requiredAttendanceCount}회</span>
            </div>
            <div class="metric-card">
              <span class="metric-label">현재 출석</span>
              <span class="metric-value highlight">${attendedCount}회</span>
              <span class="metric-note">유고 ${excusedCount}회</span>
            </div>
            <div class="metric-card">
              <span class="metric-label">남은 수업</span>
              <span class="metric-value">${remainingSessions}회</span>
            </div>
            <div class="metric-card">
              <span class="metric-label">최소 참여 필요</span>
              <span class="metric-value">${minimumFutureParticipation}회</span>
            </div>
          </div>
          <div class="metric-grid count-grid completion-metric-grid">
            <div class="metric-card">
              <span class="metric-label">현재 지각</span>
              <span class="metric-value">${lateCount}회</span>
              <span class="metric-note">지각 ${lateRatio}회 = 결석 1회</span>
            </div>
            <div class="metric-card">
              <span class="metric-label">환산 결석</span>
              <span class="metric-value">${formatOneDecimal(absenceEquivalent)}회</span>
              <span class="metric-note">결석 ${absentCount}회 포함</span>
            </div>
            <div class="metric-card">
              <span class="metric-label">현재 환산 결석률</span>
              <span class="metric-value">${formatOneDecimal(absenceEquivalentRate)}%</span>
              <span class="metric-note">지각을 결석으로 환산</span>
            </div>
            <div class="metric-card">
              <span class="metric-label">남은 결석 여유</span>
              <span class="metric-value">${formatOneDecimal(remainingAllowance)}회</span>
              <span class="metric-note">최대 ${formatOneDecimal(maxAbsenceEquivalent)}회</span>
            </div>
          </div>
        </section>
        <section class="completion-criteria" aria-label="수료 기준">
          <h4 class="completion-section-title">수료 기준</h4>
          <ul class="criteria-list">
            <li class="criteria-item ${completion.meetsAttendanceCount ? 'is-satisfied' : (completion.attendancePossible ? '' : 'is-blocked')}">
              <i class="fas ${completion.meetsAttendanceCount ? 'fa-circle-check' : 'fa-user-check'}" aria-hidden="true"></i>
              <div>
                <strong>출석 횟수 기준</strong>
                <span>${attendedCount}/${requiredAttendanceCount}회 · ${completion.meetsAttendanceCount ? '충족' : (completion.attendancePossible ? '남은 회차로 충족 가능' : '충족 불가')}</span>
              </div>
            </li>
            <li class="criteria-item ${completion.meetsAbsenceThreshold ? 'is-satisfied' : 'is-blocked'}">
              <i class="fas ${completion.meetsAbsenceThreshold ? 'fa-circle-check' : 'fa-circle-xmark'}" aria-hidden="true"></i>
              <div>
                <strong>환산 결석 기준</strong>
                <span>${formatOneDecimal(absenceEquivalent)}/${formatOneDecimal(maxAbsenceEquivalent)}회 · ${completion.meetsAbsenceThreshold ? '충족' : '초과'}</span>
              </div>
            </li>
            ${renderRequiredSessionCriteria(completion)}
          </ul>
        </section>
      </div>
    </div>
  `;
}

async function checkCompletionStatus(event) {
  event.preventDefault();
  invalidateStudentCompletionRequest();
  const completionPhoneInput = document.getElementById('completionPhoneInput');
  const phoneNumber = normalizeStudentPhone(completionPhoneInput.value);
  if (!phoneNumber) {
    alert('전화번호를 입력해주세요.');
    return;
  }
  if (!isValidStudentPhone(phoneNumber)) {
    alert('올바른 전화번호 형식이 아닙니다. (예: 01012345678)');
    return;
  }

  const requestGeneration = studentCompletionRequestGeneration;
  studentCompletionRequestKey = phoneNumber;
  const requestOwnsCompletionSurface = () => {
    const currentInput = document.getElementById('completionPhoneInput');
    return requestGeneration === studentCompletionRequestGeneration
      && studentCompletionRequestKey === phoneNumber
      && currentInput
      && normalizeStudentPhone(currentInput.value) === phoneNumber;
  };

  saveLastUsedStudentPhone(phoneNumber);
  const completionResult = document.getElementById('completionResult');
  completionResult.innerHTML = '<div class="loader" style="margin: 32px auto;"></div>';

  try {
    const response = await fetchStudentStatus(phoneNumber);
    if (!requestOwnsCompletionSurface()) return;
    if (!response || !response.success) {
      completionResult.innerHTML = `<div class="error">❌ ${escapeHtml((response && response.message) || '수료 조건을 불러오지 못했습니다.')}</div>`;
      return;
    }

    const data = response.data || {};
    const insights = data.insights && typeof data.insights === 'object' ? data.insights : {};
    if (!insights.completion || typeof insights.completion !== 'object') {
      completionResult.innerHTML = renderUpgradeNotice('수료 조건과 가능 여부');
      return;
    }
    completionResult.innerHTML = renderCompletionAssessment(data, insights.completion);
  } catch (error) {
    if (!requestOwnsCompletionSurface()) return;
    if (handleHistoricalAccessError(error)) return;
    completionResult.innerHTML = `<div class="error">❌ 오류가 발생했습니다: ${escapeHtml(getDisplayErrorMessage(error, '알 수 없는 오류'))}</div>`;
  }
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
  resetStudentStatusResult();

  const countdownTitle = document.getElementById('countdown-title');
  const countdownDiv = document.getElementById('countdown');
  const attendBtn = document.getElementById('attendBtn');
  const rankingBoard = document.getElementById('rankingBoard');

  if (countdownTitle) {
    countdownTitle.textContent = '시즌 정보를 확인하지 못했습니다.';
  }
  if (countdownDiv) {
    countdownDiv.classList.add('message-state');
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

  let savedPhone = '';
  try {
    savedPhone = normalizeStudentPhone(localStorage.getItem('lastUsedPhone'));
  } catch (error) {
    savedPhone = '';
  }
  if (savedPhone) syncStudentPhoneInputs(savedPhone);

  ['phoneInput', 'statusPhoneInput', 'completionPhoneInput'].forEach(id => {
    const input = document.getElementById(id);
    if (!input) return;
    input.addEventListener('click', function () {
      this.focus();
    });
    input.addEventListener('input', function () {
      this.value = normalizeStudentPhone(this.value);
      syncStudentPhoneInputs(this.value, this);
      invalidateStudentCompletionRequest();
    });
  });

  await checkAttendanceSession();
}

document.addEventListener('DOMContentLoaded', async () => {
  initializeStudentAttendanceDetailDialog();
  initializeCompletionPolicyDialog();
  initializeStudentNavigation();
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
  if (document.getElementById('status')?.classList.contains('active')) {
    await loadRankings();
  }
});
