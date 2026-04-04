function getCurrentAdminRole() {
  return String((currentAdminUser && currentAdminUser.role) || '').trim().toLowerCase();
}

function isSuperAdminUser(user) {
  return String((user && user.role) || '').trim().toLowerCase() === ADMIN_ROLE_SUPER;
}

function isSuperAdmin() {
  return isSuperAdminUser(currentAdminUser);
}

function logGoogleLoginFailure(error) {
  const code = String((error && error.code) || '').trim();
  const payload = {
    code: code,
    message: error && error.message,
    debugUrl: error && error.debugUrl,
    error: error
  };

  if (EXPECTED_AUTH_REJECTION_CODES.has(code)) {
    console.info('Google 로그인 거절:', payload);
    return;
  }

  if (code === 'AUTH_SERVER_SCOPE_MISSING') {
    console.warn('Google 로그인 차단(서버 권한 누락):', payload);
    return;
  }

  if (code === 'TIMEOUT') {
    console.warn('Google 로그인 지연:', payload);
    return;
  }

  console.error('Google 로그인 실패:', payload);
}

function updateAdminSessionBar() {
  const nameNode = document.getElementById('adminSessionName');
  const emailNode = document.getElementById('adminSessionEmail');
  const roleNode = document.getElementById('adminSessionRole');
  const seasonNode = document.getElementById('adminSessionSeason');
  const user = currentAdminUser || {};
  const role = getCurrentAdminRole() || ADMIN_ROLE_SEASON_ADMIN;
  const seasonAlias = String(user.seasonAlias || '').trim();
  const seasonValue = role === ADMIN_ROLE_SUPER ? 'all_seasons' : (seasonAlias || 'season_unknown');

  if (nameNode) {
    const safeName = String(user.name || '').trim();
    nameNode.textContent = safeName || '관리자';
  }
  if (emailNode) {
    emailNode.textContent = String(user.email || '-');
  }
  if (roleNode) {
    roleNode.textContent = role;
  }
  if (seasonNode) {
    seasonNode.textContent = seasonValue;
  }
}

function updateRoleBasedUi() {
  const isSuper = isSuperAdmin();

  document.querySelectorAll('[data-super-only="true"]').forEach(node => {
    node.classList.toggle('is-hidden', !isSuper);
  });

  Object.keys(SUPER_ONLY_TABS).forEach(tabName => {
    const panel = document.getElementById(tabName);
    if (panel) {
      panel.classList.toggle('is-hidden', !isSuper);
    }
  });

  const seasonSelect = document.getElementById('sheetSelect');
  if (seasonSelect) {
    seasonSelect.disabled = !isSuper;
  }
}

function redirectToFirstAllowedTab() {
  const activeTab = getActiveTabName();
  if (SUPER_ONLY_TABS[activeTab] && !isSuperAdmin()) {
    const fallbackButton = getTabButtonByName('attend');
    if (fallbackButton) {
      openTab('attend', { currentTarget: fallbackButton });
    }
  }
}

function resetAdminAuthState(options) {
  const opts = options || {};
  adminToken = '';
  currentAdminUser = null;
  adminQrCodeLoaded = false;
  seasonSourceReady = false;
  seasonSourceBlockMessage = '';
  adminUsersCache = [];
  adminUsersEditingEmail = '';
  if (typeof clearAttendanceDashboardAutoRefresh === 'function') {
    clearAttendanceDashboardAutoRefresh();
  }
  if (!opts.preserveSessionToken) {
    sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
  }
  showAuthGate();
  updateRoleBasedUi();

  if (!opts.silent) {
    setAuthGateMessage(opts.message || '관리자 인증이 필요합니다. Google 로그인 후 다시 시도해주세요.', !!opts.isError);
  }
}

function setAdminAuthState(token, user) {
  adminToken = String(token || '').trim();
  currentAdminUser = user || null;
  if (adminToken) {
    sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, adminToken);
  } else {
    sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
  }
  updateAdminSessionBar();
  updateRoleBasedUi();
}

function handleUnauthorizedError(error) {
  const code = String((error && error.code) || '').trim();
  const shouldResetAuth = code === 'UNAUTHORIZED'
    || code === 'AUTH_ADMIN_NOT_REGISTERED'
    || code === 'AUTH_ADMIN_INACTIVE'
    || code === 'AUTH_ADMIN_CONFIG_INVALID';

  if (shouldResetAuth) {
    resetAdminAuthState({
      message: getDisplayErrorMessage(error, '관리자 인증이 만료되었습니다. 등록된 Gmail 계정으로 다시 로그인해주세요.'),
      isError: true
    });
    renderGoogleLoginButton().catch((renderError) => {
      console.error('Google 로그인 버튼 재초기화 실패:', renderError);
    });
    return true;
  }

  return false;
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

function isAuthCanaryPassCode(code) {
  const normalized = String(code || '').trim();
  if (!normalized) return false;

  if (normalized === 'AUTH_ID_TOKEN_VERIFY_FAILED') return true;
  if (normalized === 'AUTH_ID_TOKEN_PAYLOAD_INVALID') return true;
  if (normalized.indexOf('AUTH_ID_TOKEN_') === 0) return true;
  return false;
}

async function runAuthScopeCanary() {
  try {
    await CloudClubApi.call('authGoogleLogin', { idToken: 'dummy' });
    return {
      ok: false,
      error: {
        code: 'AUTH_CANARY_UNEXPECTED_SUCCESS',
        message: 'authGoogleLogin(dummy) canary가 예외 없이 성공했습니다. 운영 설정을 다시 확인해주세요.'
      }
    };
  } catch (error) {
    const code = String((error && error.code) || '').trim();

    if (code === 'AUTH_SERVER_SCOPE_MISSING') {
      return { ok: false, error: error };
    }

    if (isAuthCanaryPassCode(code)) {
      return { ok: true, code: code };
    }

    return {
      ok: false,
      error: {
        code: code || 'AUTH_CANARY_FAILED',
        message: (error && error.message) || '관리자 인증 서버 canary 검증에 실패했습니다.',
        debugUrl: error && error.debugUrl
      }
    };
  }
}

async function renderGoogleLoginButton() {
  setAuthGateMessage('Google 로그인 설정을 확인하는 중입니다...');
  const response = await CloudClubApi.call('authGoogleConfig');
  const clientId = String((response && response.googleClientId) || '').trim();
  if (!clientId) {
    setAuthGateMessage('Google OAuth Client ID가 설정되지 않았습니다. 운영 환경 Script Properties를 확인해주세요.', true);
    return;
  }
  googleClientId = clientId;

  setAuthGateMessage('관리자 인증 서버 canary를 점검하는 중입니다...');
  const canary = await runAuthScopeCanary();
  if (!canary.ok) {
    console.error('관리자 인증 canary 실패:', canary.error);
    setAuthGateMessage(
      getDisplayErrorMessage(
        canary.error,
        '관리자 인증 서버 canary 점검에 실패했습니다. 운영 설정(배포/권한) 확인 후 다시 시도해주세요.'
      ),
      true
    );
    return;
  }
  console.debug('관리자 인증 canary 통과:', canary.code);

  const loaded = await waitForGoogleIdentityClient(12000);
  if (!loaded) {
    setAuthGateMessage('Google 로그인 SDK를 불러오지 못했습니다. 브라우저 확장/네트워크 차단 여부를 확인해주세요.', true);
    return;
  }

  const loginContainer = document.getElementById('googleLoginButton');
  if (!loginContainer) {
    throw new Error('Google 로그인 버튼 컨테이너를 찾을 수 없습니다.');
  }

  loginContainer.innerHTML = '';
  window.google.accounts.id.initialize({
    client_id: googleClientId,
    callback: handleGoogleCredentialResponse,
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

  setAuthGateMessage('등록된 관리자 Gmail 계정으로 로그인하세요.');
}

async function handleGoogleCredentialResponse(googleResponse) {
  if (authFlowLocked) return;
  authFlowLocked = true;
  const credential = String((googleResponse && googleResponse.credential) || '').trim();

  if (!credential) {
    setAuthGateMessage('Google 인증 토큰을 받지 못했습니다. 다시 시도해주세요.', true);
    authFlowLocked = false;
    return;
  }

  try {
    setAuthGateMessage('Google 토큰을 검증하는 중입니다...');
    const login = await CloudClubApi.call('authGoogleLogin', { idToken: credential });
    if (!login || !login.success || !login.token || !login.user) {
      throw new Error((login && login.message) || 'Google 로그인에 실패했습니다.');
    }

    setAdminAuthState(login.token, login.user);
    showAdminApp();
    await initializeDashboard();
  } catch (error) {
    logGoogleLoginFailure(error);
    resetAdminAuthState({
      message: getDisplayErrorMessage(error, '등록된 관리자 Gmail 계정만 로그인할 수 있습니다.'),
      isError: true
    });
  } finally {
    authFlowLocked = false;
  }
}

async function restoreAdminSession() {
  const cachedToken = sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
  if (!cachedToken) return false;

  try {
    const response = await CloudClubApi.call('authSession', { adminToken: cachedToken });
    if (!response || !response.success || !response.authenticated || !response.user) {
      sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
      return false;
    }

    setAdminAuthState(cachedToken, response.user);
    showAdminApp();
    await initializeDashboard();
    return true;
  } catch (error) {
    console.warn('세션 복구 실패:', error);
    sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
    return false;
  }
}

async function logoutAdmin() {
  const token = String(adminToken || '').trim();
  if (token) {
    try {
      await CloudClubApi.call('authLogout', { adminToken: token });
    } catch (error) {
      console.warn('로그아웃 API 호출 실패:', error);
    }
  }
  if (window.google && window.google.accounts && window.google.accounts.id) {
    window.google.accounts.id.disableAutoSelect();
  }

  resetAdminAuthState({
    message: '로그아웃되었습니다. Google 계정으로 다시 로그인하세요.',
    isError: false
  });
  try {
    await renderGoogleLoginButton();
  } catch (error) {
    console.error('로그아웃 후 로그인 버튼 초기화 실패:', error);
  }
}

async function bootstrapAdminAuth() {
  if (authFlowLocked) return;
  authFlowLocked = true;
  showAuthGate();
  setAuthGateMessage('관리자 세션을 확인하는 중입니다...');

  try {
    const restored = await restoreAdminSession();
    if (restored) {
      return;
    }
    resetAdminAuthState({ silent: true });
    await renderGoogleLoginButton();
  } catch (error) {
    console.error('인증 초기화 실패:', error);
    setAuthGateMessage(getDisplayErrorMessage(error, '관리자 인증 초기화 중 오류가 발생했습니다.'), true);
  } finally {
    authFlowLocked = false;
  }
}

async function initializeDashboard() {
  if (!adminToken) {
    throw new Error('관리자 세션 토큰이 없습니다.');
  }

  const firstInit = !dashboardInitialized;

  await loadSheets();

  const seasonSourceOk = ensureSeasonSourceReady({
    renderCountdown: true,
    renderRanking: true,
    renderSheetInfo: true
  });
  if (seasonSourceOk) {
    await Promise.all([
      refreshSessionAndRanking(),
      loadSheetLinkInfo()
    ]);
  } else {
    console.warn('시즌 목록 로드 실패로 운영 조회 API 호출을 중단합니다.');
    showToast(
      `<i class="fas fa-exclamation-triangle"></i> ${escapeHtml(getSeasonSourceBlockedMessage())}`,
      false
    );
  }

  const savedPhone = localStorage.getItem('lastUsedPhone');
  if (savedPhone) {
    const statusPhoneInput = document.getElementById('statusPhoneInput');

    if (statusPhoneInput) statusPhoneInput.value = savedPhone;
  }

  if (firstInit) {
    const statusPhoneInput = document.getElementById('statusPhoneInput');
    if (statusPhoneInput) {
      statusPhoneInput.addEventListener('click', function () {
        this.focus();
      });
    }

    initializeAttendanceDashboardUi();
    initializeManualApproveUi();
  }

  if (!calendarSelectedDateKey) {
    calendarSelectedDateKey = getDateKeyFromDate(new Date());
  }
  syncImportSeasonInputByCurrentSelection();
  resetImportFlow(false);
  updateImportModeHintFromInput();
  initializeImportCollapsibleCards();

  if (firstInit) {
    const importSeasonNoInput = document.getElementById('importSeasonNoInput');
    const debouncedImportSeasonPreview = debounce(() => {
      updateImportModeHintFromInput();
      if (importInference) {
        rebuildImportPreview();
      }
    }, 300);
    if (importSeasonNoInput) {
      importSeasonNoInput.addEventListener('input', () => {
        invalidatePendingImportPreparation('season-input-typing');
        importManualConfirmed = false;
        debouncedImportSeasonPreview();
      });
      importSeasonNoInput.addEventListener('blur', () => {
        invalidatePendingImportPreparation('season-input-blur');
        const parsed = normalizeSeasonInputFieldValue();
        updateImportModeHintFromInput();
        if (parsed && importInference) {
          rebuildImportPreview();
        }
      });
    }

    const importModeSelect = document.getElementById('importModeSelect');
    if (importModeSelect) {
      importModeSelect.addEventListener('change', () => {
        invalidatePendingImportPreparation('import-mode-changed');
        importManualConfirmed = false;
        if (importInference) {
          rebuildImportPreview();
        }
      });
    }
  }

  if (firstInit) {
    dashboardInitialized = true;
  }

  updateRoleBasedUi();
  redirectToFirstAllowedTab();

  const adminUsersWrap = document.getElementById('adminUsersTableWrap');
  if (adminUsersWrap) {
    if (!isSuperAdmin()) {
      adminUsersWrap.innerHTML = '<div class="info-text">Super Admin 권한에서만 관리자 목록을 확인할 수 있습니다.</div>';
    }
  }

  // Keep first-load data hydration aligned with the default active tab.
  if (getActiveTabName() === 'attend') {
    await loadScheduleList();
  }

}

async function refreshSeasonData() {
  if (!ensureSeasonSourceReady({
    renderCountdown: true,
    renderRanking: true,
    renderSheetInfo: true
  })) {
    return;
  }

  await Promise.all([
    refreshSessionAndRanking(),
    loadSheetLinkInfo()
  ]);

  const activeTab = getActiveTabName();
  if (activeTab === 'status') {
    await loadAttendanceDashboard({ forceReload: true });
    return;
  }

  if (activeTab === 'schedule' || activeTab === 'attend') {
    await loadScheduleList();
    return;
  }

  if (activeTab === 'fortune') {
    await refreshFortuneManagement();
    return;
  }

  if (activeTab === 'variables') {
    if (!isSuperAdmin()) return;
    await loadVariables();
    return;
  }

  if (activeTab === 'seasonImport') {
    if (!isSuperAdmin()) return;
    syncImportSeasonInputByCurrentSelection();
    await refreshSheetSchemaAudit();
    return;
  }

  if (activeTab === 'adminUsers') {
    if (!isSuperAdmin()) return;
    await loadAdminUsers();
    return;
  }

  if (activeTab === 'graduation' || activeTab === 'excused') {
    await loadGraduationReport();
  }
}

function getActiveTabName() {
  const activeTab = document.querySelector('.tab-content.active');
  return activeTab ? activeTab.id : 'attend';
}
