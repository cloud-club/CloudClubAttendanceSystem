function doGet(e) {
  const params = (e && e.parameter) ? e.parameter : {};

  if (params.api) {
    return handleApiRequest(params);
  }

  const mode = params.mode;

  if (mode === 'student') {
    try {
      const studentUrl = generateStudentQRCodeUrl(params.season || '');
      return createRedirectOutput(studentUrl);
    } catch (error) {
      return createMessageOutput('학생 페이지 URL 미설정', error.message || 'FRONTEND_STUDENT_BASE_URL을 설정하세요.');
    }
  }

  const adminUrl = getAdminAccessUrl();
  if (adminUrl) {
    return createRedirectOutput(adminUrl);
  }

  return createMessageOutput('관리자 페이지 URL 미설정', 'FRONTEND_ADMIN_BASE_URL을 설정하세요.')
    .setTitle('Cloud Club 출석체크 관리자')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function createMessageOutput(title, message) {
  const html = [
    '<!DOCTYPE html>',
    '<html><head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    '</head><body style="font-family:Arial,sans-serif;padding:24px;line-height:1.6;">',
    `<h2 style="margin-top:0;">${escapeHtmlAttr(title || '알림')}</h2>`,
    `<p>${escapeHtmlAttr(message || '')}</p>`,
    '</body></html>'
  ].join('');

  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function createRedirectOutput(url) {
  const target = String(url || '').trim();
  const html = [
    '<!DOCTYPE html>',
    '<html><head>',
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<meta http-equiv="refresh" content="0;url=${escapeHtmlAttr(target)}">`,
    `<script>window.location.replace(${JSON.stringify(target)});</script>`,
    '</head><body>',
    '<p>페이지로 이동 중입니다...</p>',
    '</body></html>'
  ].join('');

  return HtmlService.createHtmlOutput(html)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function escapeHtmlAttr(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function handleApiRequest(params) {
  const callback = params.callback;
  if (!validateCallback(callback)) {
    return createJavascriptOutput('throw new Error("INVALID_CALLBACK");');
  }

  try {
    const action = (params.api || '').trim();
    if (!action) {
      return jsonp(callback, apiError('INVALID_ACTION', 'api 파라미터가 필요합니다.'));
    }

    let data;
    let adminContext = null;
    const ensureAdmin = () => {
      if (!adminContext) {
        adminContext = requireAdmin(params);
      }
      return adminContext;
    };
    const ensureSuper = () => requireSuperAdmin(ensureAdmin());
    const ensureSeasonAlias = (seasonInput) => requireSeasonAccess(ensureAdmin(), seasonInput);
    const accessLevel = ACTION_ACCESS_LEVELS[action];
    if (!accessLevel) {
      return jsonp(callback, apiError('UNSUPPORTED_ACTION', `지원하지 않는 api입니다: ${action}`));
    }
    if (accessLevel === ACTION_ACCESS_ADMIN) {
      ensureAdmin();
    } else if (accessLevel === ACTION_ACCESS_SUPER) {
      ensureSuper();
    }

    switch (action) {
      case 'health':
        data = {
          status: 'ok',
          timestamp: new Date().getTime(),
          timezone: Session.getScriptTimeZone()
        };
        break;

      case 'apiInfo':
        data = getApiInfo();
        break;

      case 'authGoogleConfig':
        data = getAuthGoogleConfig();
        break;

      case 'authGoogleLogin':
        data = authGoogleLogin((params.idToken || params.credential || '').trim());
        break;

      case 'authSession': {
        const ctx = ensureAdmin();
        data = {
          success: true,
          authenticated: true,
          user: ctx
        };
        break;
      }

      case 'authLogout': {
        const token = String(params.adminToken || '').trim();
        if (token) {
          revokeAdminSession(token);
        }
        data = { success: true };
        break;
      }

      case 'adminSeasonList':
        data = getAdminSeasonList(ensureAdmin());
        break;

      case 'adminUsersList':
        data = adminUsersList(ensureSuper());
        break;

      case 'adminUsersUpsert':
        data = adminUsersUpsert(ensureSuper(), params);
        break;

      case 'adminUsersDelete':
        data = adminUsersDelete(ensureSuper(), params);
        break;

      case 'session':
        data = getSeasonAttendanceSession(resolvePublicSeasonAccess(params, ensureAdmin).seasonAlias);
        break;

      case 'attendance': {
        const phone = (params.phone || '').trim();
        if (!phone) {
          return jsonp(callback, apiError('INVALID_PHONE', '전화번호가 입력되지 않았습니다.'));
        }
        data = markSeasonAttendance(phone, resolvePublicSeasonAccess(params, ensureAdmin).seasonAlias);
        break;
      }

      case 'status': {
        const phone = (params.phone || '').trim();
        if (!phone) {
          return jsonp(callback, apiError('INVALID_PHONE', '전화번호가 입력되지 않았습니다.'));
        }
        data = getSeasonAttendanceStatus(phone, resolvePublicSeasonAccess(params, ensureAdmin).seasonAlias);
        break;
      }

      case 'ranking':
        data = getSeasonAttendanceRanking(resolvePublicSeasonAccess(params, ensureAdmin).seasonAlias);
        break;

      case 'latestSeason':
        data = getLatestSeasonInfo();
        break;

      case 'attendanceDashboardSummary': {
        const seasonAlias = ensureSeasonAlias(params.season || '');
        data = getAttendanceDashboardSummary(Object.assign({}, params, { season: seasonAlias }));
        break;
      }

      case 'attendanceDashboardDrilldown': {
        const seasonAlias = ensureSeasonAlias(params.season || '');
        data = getAttendanceDashboardDrilldown(Object.assign({}, params, { season: seasonAlias }));
        break;
      }

      case 'sheets':
        data = getAllSheets();
        break;

      case 'setActiveSheet': {
        ensureSuper();
        const sheetName = (params.sheet || '').trim();
        if (!sheetName) {
          return jsonp(callback, apiError('INVALID_SHEET', 'sheet 파라미터가 필요합니다.'));
        }
        data = setActiveSheet(sheetName);
        break;
      }

      case 'verifyAdminKey':
        data = verifyAdminKey((params.adminKey || '').trim());
        break;

      case 'studentUrl': {
        const requestedSeason = String(params.season || '').trim();
        let seasonAlias = '';
        if (requestedSeason) {
          seasonAlias = ensureSeasonAlias(requestedSeason);
        }
        data = { url: generateStudentQRCodeUrl(seasonAlias) };
        break;
      }

      case 'adminUrl':
        data = { url: getAdminAccessUrl() };
        break;

      case 'sheetLink': {
        const seasonAlias = ensureSeasonAlias(params.season || '');
        data = getSheetLink(seasonAlias);
        break;
      }

      case 'variablesGet':
        ensureSuper();
        data = getVariablesPayload();
        break;

      case 'variablesUpdate': {
        ensureSuper();
        const items = parseItemsJson(params.itemsJson || params.items || '[]');
        data = updateVariables(items);
        break;
      }

      case 'variablesNormalize':
        ensureSuper();
        data = normalizeVariablesPayload();
        break;

      case 'variablesResetTemplate':
        ensureSuper();
        data = resetVariablesTemplate(params.mode || 'preserve');
        break;

      case 'scheduleList': {
        const seasonAlias = ensureSeasonAlias(params.season || '');
        data = getScheduleList(seasonAlias);
        break;
      }

      case 'scheduleSave': {
        const seasonAlias = ensureSeasonAlias(params.season || '');
        data = saveSchedule(Object.assign({}, params, { season: seasonAlias }));
        break;
      }

      case 'scheduleDelete': {
        const seasonAlias = ensureSeasonAlias(params.season || '');
        data = deleteSchedule(Object.assign({}, params, { season: seasonAlias }));
        break;
      }

      case 'members': {
        const seasonAlias = ensureSeasonAlias(params.season || '');
        data = getMembers(seasonAlias);
        break;
      }

      case 'manualApprove': {
        const seasonAlias = ensureSeasonAlias(params.season || '');
        data = manualApproveAttendance(Object.assign({}, params, { season: seasonAlias }));
        break;
      }

      case 'manualApproveBatch': {
        const seasonAlias = ensureSeasonAlias(params.season || '');
        data = manualApproveBatchAttendance(Object.assign({}, params, { season: seasonAlias }));
        break;
      }

      case 'excusedSet': {
        const seasonAlias = ensureSeasonAlias(params.season || '');
        data = setExcusedAttendance(Object.assign({}, params, { season: seasonAlias }));
        break;
      }

      case 'graduationReport': {
        const seasonAlias = ensureSeasonAlias(params.season || '');
        data = getGraduationReport(seasonAlias);
        break;
      }

      case 'sheetSchemaAudit': {
        const seasonAlias = ensureSeasonAlias(params.season || '');
        data = getSheetSchemaAudit(seasonAlias);
        break;
      }

      case 'seasonImportBegin':
        ensureSuper();
        data = beginSeasonImport(params);
        break;

      case 'seasonImportChunk':
        ensureSuper();
        data = importSeasonChunk(params);
        break;

      case 'seasonImportDiff':
        ensureSuper();
        data = getSeasonImportDiff(params);
        break;

      case 'seasonImportFinalize':
        ensureSuper();
        data = finalizeSeasonImport(params);
        break;

      case 'seasonImportAbort':
        ensureSuper();
        data = abortSeasonImport(params);
        break;

      default:
        return jsonp(callback, apiError('UNSUPPORTED_ACTION', `지원하지 않는 api입니다: ${action}`));
    }

    return jsonp(callback, apiSuccess(data));
  } catch (error) {
    if (error && error.apiCode) {
      return jsonp(callback, apiError(error.apiCode, error.message || '요청 처리 중 오류가 발생했습니다.'));
    }
    if (isUrlFetchPermissionError(error)) {
      return jsonp(callback, apiError('AUTH_SERVER_SCOPE_MISSING', getAuthServerScopeMissingMessage()));
    }
    Logger.log('API 오류: ' + error.toString());
    Logger.log(error.stack || '');
    return jsonp(callback, apiError('INTERNAL_ERROR', error.message || '내부 오류가 발생했습니다.'));
  }
}

function parseItemsJson(raw) {
  if (!raw) return [];

  if (Array.isArray(raw)) {
    return raw;
  }

  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (error) {
      throw new Error('itemsJson 파싱 실패');
    }
  }

  return [];
}

function validateCallback(callback) {
  if (!callback) return false;
  return /^[A-Za-z_$][0-9A-Za-z_$\.]{0,64}$/.test(callback);
}

function jsonp(callback, payload) {
  const body = `${callback}(${JSON.stringify(payload)});`;
  return createJavascriptOutput(body);
}

function createJavascriptOutput(body) {
  return ContentService
    .createTextOutput(body)
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function apiSuccess(data) {
  return {
    ok: true,
    data: data,
    ts: new Date().getTime()
  };
}

function apiError(code, message) {
  return {
    ok: false,
    error: {
      code: code,
      message: message
    },
    ts: new Date().getTime()
  };
}

function getApiInfo() {
  const accessLevelByAction = {};
  SUPPORTED_API_ACTIONS.forEach(action => {
    accessLevelByAction[action] = ACTION_ACCESS_LEVELS[action] || ACTION_ACCESS_PUBLIC;
  });

  return {
    success: true,
    apiVersion: API_VERSION,
    supportedActions: SUPPORTED_API_ACTIONS.slice(),
    accessLevelByAction: accessLevelByAction,
    scriptTimeZone: Session.getScriptTimeZone(),
    serverTime: formatDateTime(new Date())
  };
}

function verifyAdminKey(adminKey) {
  return {
    success: false,
    code: 'PASSWORD_LOGIN_DISABLED',
    message: '비밀번호 로그인은 비활성화되었습니다. Google 로그인만 사용할 수 있습니다.'
  };
}

function createApiException(code, message) {
  const err = new Error(message || '요청 처리 중 오류가 발생했습니다.');
  err.apiCode = String(code || 'INTERNAL_ERROR');
  return err;
}

function throwApiException(code, message) {
  throw createApiException(code, message);
}

function getErrorMessageText(error) {
  if (!error) return '';
  if (typeof error === 'string') return error;
  if (error && error.message !== undefined && error.message !== null) {
    return String(error.message);
  }
  return String(error);
}

function isUrlFetchPermissionError(error) {
  const text = getErrorMessageText(error);
  if (!text) return false;
  return /script\.external_request/i.test(text)
    || /UrlFetchApp\.fetch/i.test(text)
    || /UrlFetchApp\.fetch을\(를\)\s*호출할\s*수\s*있는\s*권한이\s*없습니다/i.test(text);
}

function getAuthServerScopeMissingMessage() {
  return [
    'Apps Script Web App에 UrlFetchApp.fetch 권한(script.external_request)이 없습니다.',
    '배포 소유자 계정으로 UrlFetchApp 권한을 승인한 뒤 Deploy > Manage deployments > Edit > Deploy로 동일 배포를 재배포하세요.'
  ].join(' ');
}

