function getGoogleOAuthClientId() {
  const raw = PropertiesService.getScriptProperties().getProperty('GOOGLE_OAUTH_CLIENT_ID');
  return String(raw || '').trim();
}

function normalizeAdminEmail(value) {
  return normalizeImportEmail(value || '');
}

function isAllowedAdminEmail(email) {
  const normalized = normalizeAdminEmail(email);
  if (!isValidImportEmail(normalized)) return false;
  return /@(gmail\.com|googlemail\.com)$/i.test(normalized);
}

function toSeasonAliasFromNumber(seasonNo) {
  const parsed = normalizeSeasonNumber(seasonNo);
  if (isNaN(parsed)) return '';
  return `season_${String(parsed).padStart(2, '0')}`;
}

function normalizeAdminRole(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === ADMIN_ROLE_SUPER) return ADMIN_ROLE_SUPER;
  return ADMIN_ROLE_SEASON_ADMIN;
}

function getAdminsSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(ADMINS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(ADMINS_SHEET_NAME, ss.getNumSheets() + 1);
    sheet.getRange(1, 1, 1, ADMINS_SHEET_HEADERS.length).setValues([ADMINS_SHEET_HEADERS]);
    sheet.hideSheet();
    return sheet;
  }

  const lastCol = Math.max(sheet.getLastColumn(), ADMINS_SHEET_HEADERS.length);
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0] || [];
  const normalized = ADMINS_SHEET_HEADERS.map((header, idx) => {
    const existing = String(headers[idx] || '').trim();
    return existing || header;
  });
  sheet.getRange(1, 1, 1, normalized.length).setValues([normalized]);
  if (!sheet.isSheetHidden()) {
    sheet.hideSheet();
  }
  return sheet;
}

function readAdminRecordsCache() {
  try {
    const raw = CacheService.getScriptCache().get(ADMIN_RECORDS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch (error) {
    return null;
  }
}

function writeAdminRecordsCache(records) {
  if (!Array.isArray(records)) return;
  try {
    CacheService.getScriptCache().put(
      ADMIN_RECORDS_CACHE_KEY,
      JSON.stringify(records),
      ADMIN_RECORDS_CACHE_TTL_SECONDS
    );
  } catch (error) {
    Logger.log('관리자 레코드 캐시 저장 실패: ' + error.toString());
  }
}

function invalidateAdminRecordsCache() {
  try {
    CacheService.getScriptCache().remove(ADMIN_RECORDS_CACHE_KEY);
  } catch (error) {
    Logger.log('관리자 레코드 캐시 삭제 실패: ' + error.toString());
  }
}

function getAdminRecords(options) {
  const opts = options || {};
  if (!opts.forceRefresh) {
    const cached = readAdminRecordsCache();
    if (cached) return cached;
  }

  const sheet = getAdminsSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const rows = sheet.getRange(2, 1, lastRow - 1, ADMINS_SHEET_HEADERS.length).getValues();
  const records = [];

  rows.forEach((row, idx) => {
    const email = normalizeAdminEmail(row[3]);
    if (!email) return;

    const role = normalizeAdminRole(row[4]);
    const seasonNo = normalizeSeasonNumber(row[1]);
    const isActiveParsed = parseBooleanLikeValue(row[5]);
    const isActive = isActiveParsed.value === null ? true : !!isActiveParsed.value;

    records.push({
      rowIndex: idx + 2,
      name: String(row[0] || '').trim(),
      season: role === ADMIN_ROLE_SUPER ? null : (isNaN(seasonNo) ? null : seasonNo),
      phone: normalizePhone(row[2]),
      email: email,
      role: role,
      isActive: isActive,
      createdAt: String(row[6] || '').trim(),
      updatedAt: String(row[7] || '').trim()
    });
  });

  writeAdminRecordsCache(records);
  return records;
}

function parseSeasonNoFromAlias(alias) {
  const normalizedAlias = toSeasonAlias(alias || '');
  if (!normalizedAlias) return NaN;

  const parts = normalizedAlias.split('_');
  if (parts.length !== 2) return NaN;
  const parsed = parseInt(parts[1], 10);
  return isNaN(parsed) ? NaN : parsed;
}

function getLatestSeasonSheetCandidate() {
  const candidates = getSeasonSheetCandidates();
  if (!candidates || candidates.length === 0) {
    return null;
  }
  return candidates[0];
}

function collectLatestSeasonStaffAdminCandidates() {
  const latest = getLatestSeasonSheetCandidate();
  if (!latest || !latest.sheet) {
    return {
      seasonAlias: '',
      seasonNo: null,
      items: [],
      map: {}
    };
  }

  const seasonAlias = toSeasonAlias(latest.alias || latest.name || '');
  let seasonNo = latest.seasonNo;
  if (isNaN(seasonNo) || seasonNo < 1) {
    seasonNo = parseSeasonNoFromAlias(seasonAlias);
  }

  const values = latest.sheet.getDataRange().getValues();
  if (!values || values.length < 2) {
    return {
      seasonAlias: seasonAlias,
      seasonNo: isNaN(seasonNo) ? null : seasonNo,
      items: [],
      map: {}
    };
  }

  const memberSchema = resolveMemberSchemaFromHeaders(values[0] || []);
  const map = {};
  const items = [];

  for (let i = 1; i < values.length; i++) {
    const member = readMemberFromRow(values[i], memberSchema);
    if (!member || member.isStaff !== true) continue;

    const email = normalizeAdminEmail(member.email || '');
    if (!email || !isAllowedAdminEmail(email)) continue;
    if (map[email]) continue;

    const item = {
      email: email,
      name: String(member.name || '').trim(),
      phone: normalizePhone(member.phone),
      seasonNo: isNaN(seasonNo) ? null : seasonNo,
      seasonAlias: seasonAlias,
      sourceRowIndex: i + 1
    };

    map[email] = item;
    items.push(item);
  }

  return {
    seasonAlias: seasonAlias,
    seasonNo: isNaN(seasonNo) ? null : seasonNo,
    items: items,
    map: map
  };
}

function syncSeasonAdminsFromLatestSeason(options) {
  const opts = options || {};
  const force = opts.force === true;
  const source = String(opts.source || '').trim();
  const cache = CacheService.getScriptCache();

  if (!force && cache.get(ADMIN_SEASON_SYNC_CACHE_KEY) === '1') {
    return {
      success: true,
      skipped: true,
      reason: 'cache',
      source: source
    };
  }

  const lock = LockService.getDocumentLock();
  let locked = false;

  try {
    lock.waitLock(5000);
    locked = true;

    if (!force && cache.get(ADMIN_SEASON_SYNC_CACHE_KEY) === '1') {
      return {
        success: true,
        skipped: true,
        reason: 'cache_after_lock',
        source: source
      };
    }

    const candidatePack = collectLatestSeasonStaffAdminCandidates();
    const latestMap = candidatePack.map || {};
    const latestItems = candidatePack.items || [];
    const latestSeasonNo = normalizeSeasonNumber(candidatePack.seasonNo);
    const latestSeasonAlias = String(candidatePack.seasonAlias || '').trim();

    if (!latestSeasonAlias || isNaN(latestSeasonNo)) {
      return {
        success: false,
        skipped: true,
        source: source,
        reason: 'latest_season_unavailable',
        message: '최신 시즌 시트를 식별하지 못해 season_admin 자동 동기화를 건너뜁니다.'
      };
    }

    const sheet = getAdminsSheet();
    const records = getAdminRecords({ forceRefresh: true });
    const nowText = formatDateTime(new Date());
    const existingEmailMap = {};

    let updatedCount = 0;
    let insertedCount = 0;
    let deactivatedCount = 0;
    let unchangedCount = 0;
    let manualInactiveKeptCount = 0;

    records.forEach(record => {
      if (!record || !record.email) return;

      existingEmailMap[record.email] = true;
      if (record.role !== ADMIN_ROLE_SEASON_ADMIN) return;

      const candidate = latestMap[record.email] || null;
      const currentName = String(record.name || '').trim();
      const currentPhone = normalizePhone(record.phone);
      const currentSeasonNo = normalizeSeasonNumber(record.season);
      const currentSeasonCell = isNaN(currentSeasonNo) ? '' : currentSeasonNo;
      const currentActive = !!record.isActive;

      const nextName = candidate ? String(candidate.name || currentName).trim() : currentName;
      const nextPhone = candidate ? normalizePhone(candidate.phone) : currentPhone;
      let nextSeasonCell = currentSeasonCell;

      if (candidate && !isNaN(latestSeasonNo)) {
        nextSeasonCell = latestSeasonNo;
      }

      let nextActive = false;
      if (candidate) {
        // 수동 비활성(is_active=false)은 자동으로 복구하지 않는다.
        nextActive = currentActive === false ? false : true;
        if (currentActive === false) {
          manualInactiveKeptCount++;
        }
      } else {
        nextActive = false;
        if (currentActive) {
          deactivatedCount++;
        }
      }

      const createdAt = String(record.createdAt || nowText).trim() || nowText;
      const seasonChanged = String(nextSeasonCell) !== String(currentSeasonCell);
      const changed = (
        nextName !== currentName ||
        nextPhone !== currentPhone ||
        seasonChanged ||
        nextActive !== currentActive
      );

      if (!changed) {
        unchangedCount++;
        return;
      }

      const rowValues = [
        nextName,
        nextSeasonCell,
        nextPhone,
        record.email,
        ADMIN_ROLE_SEASON_ADMIN,
        nextActive,
        createdAt,
        nowText
      ];

      sheet.getRange(record.rowIndex, 1, 1, ADMINS_SHEET_HEADERS.length).setValues([rowValues]);
      updatedCount++;
    });

    latestItems.forEach(candidate => {
      if (!candidate || !candidate.email) return;
      if (existingEmailMap[candidate.email]) return;
      if (isNaN(latestSeasonNo)) return;

      const rowValues = [
        String(candidate.name || '').trim(),
        latestSeasonNo,
        normalizePhone(candidate.phone),
        candidate.email,
        ADMIN_ROLE_SEASON_ADMIN,
        true,
        nowText,
        nowText
      ];

      const nextRow = sheet.getLastRow() + 1;
      sheet.getRange(nextRow, 1, 1, ADMINS_SHEET_HEADERS.length).setValues([rowValues]);
      insertedCount++;
    });

    invalidateAdminRecordsCache();
    cache.put(ADMIN_SEASON_SYNC_CACHE_KEY, '1', ADMIN_SEASON_SYNC_CACHE_TTL_SECONDS);

    return {
      success: true,
      skipped: false,
      source: source,
      seasonAlias: String(candidatePack.seasonAlias || ''),
      seasonNo: isNaN(latestSeasonNo) ? null : latestSeasonNo,
      candidateCount: latestItems.length,
      updatedCount: updatedCount,
      insertedCount: insertedCount,
      deactivatedCount: deactivatedCount,
      manualInactiveKeptCount: manualInactiveKeptCount,
      unchangedCount: unchangedCount
    };
  } catch (error) {
    Logger.log('season_admin 자동 동기화 오류: ' + error.toString());
    Logger.log(error.stack || '');
    return {
      success: false,
      skipped: true,
      source: source,
      message: error.message || 'season_admin 동기화 중 오류가 발생했습니다.'
    };
  } finally {
    if (locked) {
      lock.releaseLock();
    }
  }
}

function sanitizeAdminContext(input) {
  const base = input || {};
  const normalizedEmail = normalizeAdminEmail(base.email || '');
  const role = normalizeAdminRole(base.role || ADMIN_ROLE_SEASON_ADMIN);
  const seasonNo = normalizeSeasonNumber(base.season);
  const normalizedSeason = role === ADMIN_ROLE_SUPER ? null : (isNaN(seasonNo) ? null : seasonNo);
  const seasonAlias = normalizedSeason === null ? '' : toSeasonAliasFromNumber(normalizedSeason);

  return {
    email: normalizedEmail,
    name: String(base.name || '').trim(),
    phone: normalizePhone(base.phone),
    role: role,
    season: normalizedSeason,
    seasonAlias: seasonAlias,
    isActive: base.isActive !== false,
    isSuperFixed: !!base.isSuperFixed
  };
}

function buildAdminContextByEmail(email) {
  const resolved = resolveAdminAccessByEmail(email);
  return resolved && resolved.context ? resolved.context : null;
}

function resolveAdminAccessByEmail(email) {
  const normalizedEmail = normalizeAdminEmail(email);
  if (!normalizedEmail || !isAllowedAdminEmail(normalizedEmail)) {
    return {
      ok: false,
      context: null,
      reasonCode: 'AUTH_EMAIL_DOMAIN_NOT_ALLOWED',
      reasonMessage: '허용된 Gmail 계정으로만 로그인할 수 있습니다.'
    };
  }

  if (normalizedEmail === ADMIN_SUPER_EMAIL) {
    return {
      ok: true,
      context: sanitizeAdminContext({
        email: normalizedEmail,
        name: 'CloudClub Super Admin',
        phone: '',
        role: ADMIN_ROLE_SUPER,
        season: null,
        isActive: true,
        isSuperFixed: true
      })
    };
  }

  const records = getAdminRecords();
  const record = records.find(item => item.email === normalizedEmail);
  if (!record) {
    return {
      ok: false,
      context: null,
      reasonCode: 'AUTH_ADMIN_NOT_REGISTERED',
      reasonMessage: '관리자 권한이 등록되지 않은 계정입니다.'
    };
  }

  if (!record.isActive) {
    return {
      ok: false,
      context: null,
      reasonCode: 'AUTH_ADMIN_INACTIVE',
      reasonMessage: '비활성화된 관리자 계정입니다. 운영진에게 활성화 여부를 확인하세요.'
    };
  }

  if (record.role === ADMIN_ROLE_SEASON_ADMIN && record.season === null) {
    return {
      ok: false,
      context: null,
      reasonCode: 'AUTH_ADMIN_CONFIG_INVALID',
      reasonMessage: '관리자 계정의 시즌 설정이 올바르지 않습니다.'
    };
  }

  return {
    ok: true,
    context: sanitizeAdminContext(record)
  };
}

function validateGoogleIdToken(idToken) {
  const token = String(idToken || '').trim();
  if (!token) {
    throwApiException('AUTH_ID_TOKEN_MISSING', 'Google ID token이 필요합니다.');
  }

  const clientId = getGoogleOAuthClientId();
  if (!clientId) {
    throwApiException('AUTH_CLIENT_ID_NOT_CONFIGURED', 'GOOGLE_OAUTH_CLIENT_ID가 설정되지 않았습니다.');
  }

  let response;
  try {
    response = UrlFetchApp.fetch(
      GOOGLE_TOKENINFO_ENDPOINT + encodeURIComponent(token),
      { method: 'get', muteHttpExceptions: true }
    );
  } catch (error) {
    if (isUrlFetchPermissionError(error)) {
      throwApiException('AUTH_SERVER_SCOPE_MISSING', getAuthServerScopeMissingMessage());
    }
    throw error;
  }

  const statusCode = response.getResponseCode();
  if (statusCode !== 200) {
    throwApiException('AUTH_ID_TOKEN_VERIFY_FAILED', 'Google ID token 검증에 실패했습니다.');
  }

  let payload;
  try {
    payload = JSON.parse(response.getContentText() || '{}');
  } catch (error) {
    throwApiException('AUTH_ID_TOKEN_PAYLOAD_INVALID', 'Google ID token 응답이 올바르지 않습니다.');
  }

  const aud = String(payload.aud || '').trim();
  const iss = String(payload.iss || '').trim();
  const exp = Number(payload.exp || 0);
  const email = normalizeAdminEmail(payload.email || '');
  const emailVerified = String(payload.email_verified || '').toLowerCase() === 'true';

  if (aud !== clientId) {
    throwApiException('AUTH_CLIENT_ID_MISMATCH', 'Google OAuth clientId가 일치하지 않습니다.');
  }

  if (!(iss === 'https://accounts.google.com' || iss === 'accounts.google.com')) {
    throwApiException('AUTH_ID_TOKEN_ISSUER_INVALID', 'Google 발급 토큰이 아닙니다.');
  }

  if (!exp || Date.now() >= exp * 1000) {
    throwApiException('AUTH_ID_TOKEN_EXPIRED', '만료된 Google 토큰입니다.');
  }

  if (!emailVerified) {
    throwApiException('AUTH_EMAIL_NOT_VERIFIED', '이메일 인증이 완료된 Google 계정으로 로그인해야 합니다.');
  }

  if (!isAllowedAdminEmail(email)) {
    throwApiException('AUTH_EMAIL_DOMAIN_NOT_ALLOWED', '허용된 Gmail 계정으로만 로그인할 수 있습니다.');
  }

  return {
    sub: String(payload.sub || '').trim(),
    email: email,
    name: String(payload.name || '').trim(),
    picture: String(payload.picture || '').trim()
  };
}

function issueAdminSession(context) {
  const token = Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
  const normalized = sanitizeAdminContext(context);
  const cache = CacheService.getScriptCache();
  cache.put(
    ADMIN_SESSION_CACHE_PREFIX + token,
    JSON.stringify(normalized),
    ADMIN_SESSION_TTL_SECONDS
  );
  return token;
}

function verifyAdminSession(token) {
  const rawToken = String(token || '').trim();
  if (!rawToken) return null;

  const cache = CacheService.getScriptCache();
  const key = ADMIN_SESSION_CACHE_PREFIX + rawToken;
  const raw = cache.get(key);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    const normalized = sanitizeAdminContext(parsed);
    cache.put(key, JSON.stringify(normalized), ADMIN_SESSION_TTL_SECONDS);
    return normalized;
  } catch (error) {
    return null;
  }
}

function revokeAdminSession(token) {
  const rawToken = String(token || '').trim();
  if (!rawToken) return;
  CacheService.getScriptCache().remove(ADMIN_SESSION_CACHE_PREFIX + rawToken);
}

function verifyAdminToken(token) {
  return !!verifyAdminSession(token);
}

function requireAdmin(params) {
  const token = String((params && params.adminToken) || '').trim();
  if (!token) {
    throwApiException('UNAUTHORIZED', '관리자 인증이 필요합니다.');
  }

  const sessionContext = verifyAdminSession(token);
  if (!sessionContext || !sessionContext.email) {
    throwApiException('UNAUTHORIZED', '관리자 세션이 유효하지 않습니다.');
  }

  syncSeasonAdminsFromLatestSeason({
    force: false,
    source: 'requireAdmin'
  });

  const resolved = resolveAdminAccessByEmail(sessionContext.email);
  const latestContext = resolved && resolved.context ? resolved.context : null;
  if (!latestContext || !latestContext.isActive) {
    revokeAdminSession(token);
    throwApiException(
      (resolved && resolved.reasonCode) || 'UNAUTHORIZED',
      (resolved && resolved.reasonMessage) || '관리자 계정 권한이 없습니다.'
    );
  }

  // 최신 관리자 정보를 기준으로 세션 컨텍스트를 갱신한다.
  CacheService.getScriptCache().put(
    ADMIN_SESSION_CACHE_PREFIX + token,
    JSON.stringify(latestContext),
    ADMIN_SESSION_TTL_SECONDS
  );

  return latestContext;
}

function requireSuperAdmin(adminContext) {
  const ctx = sanitizeAdminContext(adminContext || {});
  if (ctx.role !== ADMIN_ROLE_SUPER) {
    throwApiException('FORBIDDEN', 'Super Admin 권한이 필요합니다.');
  }
  return ctx;
}

function requireSeasonAccess(adminContext, seasonInput) {
  const ctx = sanitizeAdminContext(adminContext || {});
  const requestedRaw = String(seasonInput || '').trim();
  const requestedAlias = requestedRaw ? toSeasonAlias(requestedRaw) : '';

  if (requestedRaw && !requestedAlias) {
    throwApiException('INVALID_SEASON', '유효한 season 파라미터가 필요합니다. (예: season_07)');
  }

  if (ctx.role === ADMIN_ROLE_SUPER) {
    return requestedAlias || '';
  }

  const ownAlias = ctx.seasonAlias || toSeasonAliasFromNumber(ctx.season);
  if (!ownAlias) {
    throwApiException('FORBIDDEN', '시즌 관리자 권한이 올바르지 않습니다.');
  }

  if (!requestedAlias) {
    return ownAlias;
  }

  if (requestedAlias !== ownAlias) {
    throwApiException('FORBIDDEN_SEASON', '해당 시즌 접근 권한이 없습니다.');
  }

  return ownAlias;
}

function resolveLatestSeasonAlias() {
  const latest = getLatestSeasonSheetCandidate();
  if (!latest) {
    throwApiException('INVALID_SEASON', '최신 시즌 시트를 찾을 수 없습니다.');
  }

  const latestAlias = toSeasonAlias(latest.alias || latest.name || '');
  if (!latestAlias) {
    throwApiException('INVALID_SEASON', '최신 시즌 alias를 해석할 수 없습니다.');
  }

  return latestAlias;
}

function getLatestSeasonInfo() {
  const seasonAlias = resolveLatestSeasonAlias();
  const seasonNo = parseSeasonNoFromAlias(seasonAlias);
  return {
    success: true,
    seasonAlias: seasonAlias,
    seasonNo: isNaN(seasonNo) ? null : seasonNo
  };
}

function resolvePublicSeasonAccess(params, ensureAdminFn) {
  const latestAlias = resolveLatestSeasonAlias();
  const requestedRaw = String((params && params.season) || '').trim();

  if (!requestedRaw) {
    return {
      seasonAlias: latestAlias,
      latestAlias: latestAlias,
      isLatest: true,
      requiresAdmin: false
    };
  }

  const requestedAlias = toSeasonAlias(requestedRaw);
  if (!requestedAlias) {
    throwApiException('INVALID_SEASON', '유효한 season 파라미터가 필요합니다. (예: season_07)');
  }

  if (requestedAlias === latestAlias) {
    return {
      seasonAlias: latestAlias,
      latestAlias: latestAlias,
      isLatest: true,
      requiresAdmin: false
    };
  }

  const adminContext = ensureAdminFn ? ensureAdminFn() : requireAdmin(params || {});
  const seasonAlias = requireSeasonAccess(adminContext, requestedAlias);
  return {
    seasonAlias: seasonAlias,
    latestAlias: latestAlias,
    isLatest: false,
    requiresAdmin: true
  };
}

function getAuthGoogleConfig() {
  const clientId = getGoogleOAuthClientId();
  const frontendAdminBaseUrl = getFrontendAdminUrl();
  return {
    success: !!clientId,
    loginMode: 'google_only',
    gmailOnly: true,
    googleClientId: clientId,
    frontendAdminBaseUrl: frontendAdminBaseUrl,
    checks: {
      clientIdConfigured: !!clientId,
      frontendAdminUrlConfigured: isFrontendUrlConfigured(frontendAdminBaseUrl)
    },
    message: clientId ? '' : 'GOOGLE_OAUTH_CLIENT_ID가 설정되지 않았습니다.'
  };
}

function authGoogleLogin(idToken) {
  // 로그인 직전 최신 시즌 운영진 기반 관리자 권한을 강제 동기화한다.
  syncSeasonAdminsFromLatestSeason({
    force: true,
    source: 'authGoogleLogin'
  });

  const tokenPayload = validateGoogleIdToken(idToken);
  const resolved = resolveAdminAccessByEmail(tokenPayload.email);
  const context = resolved && resolved.context ? resolved.context : null;
  if (!context || !context.isActive) {
    throwApiException(
      (resolved && resolved.reasonCode) || 'UNAUTHORIZED',
      (resolved && resolved.reasonMessage) || '등록된 관리자 Gmail 계정만 로그인할 수 있습니다.'
    );
  }

  const token = issueAdminSession(context);
  return {
    success: true,
    token: token,
    expiresInSeconds: ADMIN_SESSION_TTL_SECONDS,
    user: context
  };
}

function getAdminSeasonList(adminContext) {
  const ctx = sanitizeAdminContext(adminContext || {});
  const active = getActiveAttendanceSheetInfo();
  const activeAlias = active ? active.seasonAlias : '';
  const candidates = getSeasonSheetCandidates();
  let list = candidates;

  if (ctx.role !== ADMIN_ROLE_SUPER) {
    const ownAlias = ctx.seasonAlias || toSeasonAliasFromNumber(ctx.season);
    list = candidates.filter(item => item.alias === ownAlias);
  }

  return {
    success: true,
    role: ctx.role,
    season: ctx.season,
    seasonAlias: ctx.seasonAlias || toSeasonAliasFromNumber(ctx.season),
    sheets: list.map(item => ({
      name: item.name,
      alias: item.alias,
      isActive: item.alias === activeAlias,
      isLegacy: item.isLegacy,
      isSeason: true
    }))
  };
}

function parseAdminSeasonParam(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const alias = toSeasonAlias(raw);
  if (alias) {
    const parsed = parseInt(alias.split('_')[1], 10);
    return isNaN(parsed) ? NaN : parsed;
  }
  const parsedNumber = normalizeSeasonNumber(raw);
  return isNaN(parsedNumber) ? NaN : parsedNumber;
}

function adminUsersList(adminContext) {
  const ctx = sanitizeAdminContext(adminContext || {});
  requireSuperAdmin(ctx);

  const rows = getAdminRecords()
    .filter(item => item.email !== ADMIN_SUPER_EMAIL)
    .sort((a, b) => {
      if (a.role !== b.role) {
        return a.role === ADMIN_ROLE_SUPER ? -1 : 1;
      }
      return String(a.email || '').localeCompare(String(b.email || ''));
    });

  const fixedSuper = sanitizeAdminContext({
    email: ADMIN_SUPER_EMAIL,
    name: 'CloudClub Super Admin',
    role: ADMIN_ROLE_SUPER,
    season: null,
    phone: '',
    isActive: true,
    isSuperFixed: true
  });

  return {
    success: true,
    items: [fixedSuper].concat(rows.map(item => sanitizeAdminContext(item)))
  };
}

function adminUsersUpsert(adminContext, params) {
  const ctx = sanitizeAdminContext(adminContext || {});
  requireSuperAdmin(ctx);

  const email = normalizeAdminEmail(params.email || '');
  if (!email || !isAllowedAdminEmail(email)) {
    throwApiException('INVALID_EMAIL', 'Gmail 형식의 관리자 이메일이 필요합니다.');
  }

  if (email === ADMIN_SUPER_EMAIL) {
    if (String(params.role || ADMIN_ROLE_SUPER).trim().toLowerCase() !== ADMIN_ROLE_SUPER) {
      throwApiException('FORBIDDEN', '고정 Super Admin의 role은 변경할 수 없습니다.');
    }
    const requestedActive = parseBooleanLikeValue(params.isActive);
    if (requestedActive.value === false) {
      throwApiException('FORBIDDEN', '고정 Super Admin은 비활성화할 수 없습니다.');
    }
    return {
      success: true,
      message: '고정 Super Admin 정책이 유지됩니다.',
      item: sanitizeAdminContext({
        email: ADMIN_SUPER_EMAIL,
        name: 'CloudClub Super Admin',
        role: ADMIN_ROLE_SUPER,
        season: null,
        phone: '',
        isActive: true,
        isSuperFixed: true
      })
    };
  }

  const role = normalizeAdminRole(params.role || ADMIN_ROLE_SEASON_ADMIN);
  const seasonNo = parseAdminSeasonParam(params.season);
  if (role === ADMIN_ROLE_SEASON_ADMIN && (seasonNo === null || isNaN(seasonNo))) {
    throwApiException('INVALID_SEASON', 'season_admin은 유효한 season 값을 가져야 합니다.');
  }

  const normalizedPhone = normalizePhone(params.phone);
  const normalizedName = String(params.name || '').trim();
  const activeParsed = parseBooleanLikeValue(params.isActive);
  const isActive = activeParsed.value === null ? true : !!activeParsed.value;
  const nowText = formatDateTime(new Date());

  const sheet = getAdminsSheet();
  const records = getAdminRecords({ forceRefresh: true });
  const matched = records.filter(item => item.email === email);
  if (matched.length > 1) {
    throwApiException('CONFLICT_EMAIL', '동일 이메일이 _admins 시트에 중복되어 있습니다. 중복 행을 정리 후 다시 시도하세요.');
  }
  const existing = matched.length === 1 ? matched[0] : null;

  const rowValues = [
    normalizedName,
    role === ADMIN_ROLE_SUPER ? '' : seasonNo,
    normalizedPhone,
    email,
    role,
    isActive,
    existing ? String(existing.createdAt || nowText) : nowText,
    nowText
  ];

  if (existing) {
    sheet.getRange(existing.rowIndex, 1, 1, ADMINS_SHEET_HEADERS.length).setValues([rowValues]);
  } else {
    const nextRow = sheet.getLastRow() + 1;
    sheet.getRange(nextRow, 1, 1, ADMINS_SHEET_HEADERS.length).setValues([rowValues]);
  }

  invalidateAdminRecordsCache();

  return {
    success: true,
    message: existing ? '관리자 정보가 수정되었습니다.' : '관리자가 추가되었습니다.',
    item: sanitizeAdminContext({
      name: normalizedName,
      season: role === ADMIN_ROLE_SUPER ? null : seasonNo,
      phone: normalizedPhone,
      email: email,
      role: role,
      isActive: isActive,
      isSuperFixed: false
    })
  };
}

function adminUsersDelete(adminContext, params) {
  const ctx = sanitizeAdminContext(adminContext || {});
  requireSuperAdmin(ctx);

  const email = normalizeAdminEmail(params.email || '');
  if (!email) {
    throwApiException('INVALID_EMAIL', '삭제할 관리자 email 파라미터가 필요합니다.');
  }

  if (email === ADMIN_SUPER_EMAIL) {
    throwApiException('FORBIDDEN', '고정 Super Admin은 삭제할 수 없습니다.');
  }

  const records = getAdminRecords({ forceRefresh: true });
  const matched = records.filter(item => item.email === email);
  if (matched.length > 1) {
    throwApiException('CONFLICT_EMAIL', '동일 이메일이 _admins 시트에 중복되어 있습니다. 중복 행을 정리 후 다시 시도하세요.');
  }
  const found = matched.length === 1 ? matched[0] : null;
  if (!found) {
    return {
      success: false,
      message: '삭제 대상 관리자를 찾을 수 없습니다.'
    };
  }

  const sheet = getAdminsSheet();
  sheet.deleteRow(found.rowIndex);
  invalidateAdminRecordsCache();
  return {
    success: true,
    message: '관리자가 삭제되었습니다.',
    email: email
  };
}

function sha256Hex(value) {
  const bytes = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    value,
    Utilities.Charset.UTF_8
  );

  return bytes
    .map(b => {
      const v = (b + 256) % 256;
      return ('0' + v.toString(16)).slice(-2);
    })
    .join('');
}

function getFrontendAdminUrl() {
  const raw = PropertiesService.getScriptProperties().getProperty('FRONTEND_ADMIN_BASE_URL');
  return (raw || '').trim();
}

function getFrontendStudentBaseUrl() {
  const raw = PropertiesService.getScriptProperties().getProperty('FRONTEND_STUDENT_BASE_URL');
  return (raw || '').trim();
}

function getFrontendStudentLatestUrlBase() {
  const configured = getFrontendStudentBaseUrl();
  if (!isFrontendUrlConfigured(configured)) {
    throw new Error('FRONTEND_STUDENT_BASE_URL이 설정되지 않았습니다.');
  }

  const matched = String(configured || '').trim().match(/^(https?:\/\/[^?#]+)(\?[^#]*)?(#.*)?$/i);
  if (!matched) {
    return configured;
  }

  let path = String(matched[1] || '').trim().replace(/\/+$/g, '');
  if (/\/index\.html$/i.test(path)) {
    path = path.replace(/\/index\.html$/i, '');
  }
  if (!/\/latest$/i.test(path)) {
    path = `${path}/latest`;
  }
  path = `${path}/`;

  return `${path}${matched[2] || ''}${matched[3] || ''}`;
}

function appendSeasonQueryToUrl(url, seasonAlias) {
  const normalized = toSeasonAlias(seasonAlias || '');
  if (!normalized) return String(url || '').trim();

  const base = String(url || '').trim();
  const separator = base.indexOf('?') === -1 ? '?' : '&';
  return `${base}${separator}season=${encodeURIComponent(normalized)}`;
}

function isFrontendUrlConfigured(url) {
  return /^https?:\/\//i.test(String(url || '').trim());
}

function getAdminAccessUrl() {
  const configured = getFrontendAdminUrl();
  if (isFrontendUrlConfigured(configured)) {
    return configured;
  }

  return '';
}

function toSeasonAlias(input) {
  const raw = String(input || '').trim();
  if (!raw) return '';

  const seasonMatch = raw.match(SEASON_NAME_REGEX);
  if (seasonMatch) {
    return `season_${seasonMatch[1]}`;
  }

  const legacyMatch = raw.match(LEGACY_SEASON_NAME_REGEX);
  if (legacyMatch) {
    const padded = String(parseInt(legacyMatch[1], 10)).padStart(2, '0');
    return `season_${padded}`;
  }

  return '';
}
