function getLocationPolicyFingerprint(session) {
  const item = session || {};
  return [
    item.sessionKey || '',
    item.header || '',
    item.locationPolicyValid ? '1' : '0',
    item.locationRequired ? '1' : '0',
    item.googlePlaceId || '',
    Number(item.radiusM || ATTENDANCE_LOCATION_RADIUS_M)
  ].join('|');
}

function calculateDistanceMeters(from, to) {
  const fromLat = Number(from && from.latitude);
  const fromLng = Number(from && from.longitude);
  const toLat = Number(to && to.latitude);
  const toLng = Number(to && to.longitude);
  const earthRadiusM = 6371000;
  const toRadians = degrees => degrees * Math.PI / 180;
  const deltaLat = toRadians(toLat - fromLat);
  const deltaLng = toRadians(toLng - fromLng);
  const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2)
    + Math.cos(toRadians(fromLat)) * Math.cos(toRadians(toLat))
    * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  return earthRadiusM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isWithinAttendanceRadius(distanceM, radiusM) {
  return Number(distanceM) <= Number(radiusM);
}

function normalizeAttendanceLocation(input) {
  const raw = input || {};
  if (raw.latitude === '' || raw.latitude === undefined || raw.latitude === null
    || raw.longitude === '' || raw.longitude === undefined || raw.longitude === null
    || raw.accuracy === '' || raw.accuracy === undefined || raw.accuracy === null) {
    return { valid: false, errorCode: 'LOCATION_REQUIRED', message: '현재 위치 정보가 필요합니다.' };
  }

  const latitude = Number(raw.latitude);
  const longitude = Number(raw.longitude);
  const accuracy = Number(raw.accuracy);
  if (!isFinite(latitude) || !isFinite(longitude) || !isFinite(accuracy)
    || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180 || accuracy < 0) {
    return { valid: false, errorCode: 'LOCATION_INVALID', message: '현재 위치 정보가 올바르지 않습니다.' };
  }
  if (accuracy > ATTENDANCE_LOCATION_MAX_ACCURACY_M) {
    return {
      valid: false,
      errorCode: 'LOCATION_ACCURACY_TOO_LOW',
      message: `위치 정확도가 부족합니다. 정확도 ${ATTENDANCE_LOCATION_MAX_ACCURACY_M}m 이내에서 다시 시도해 주세요.`
    };
  }

  return { valid: true, latitude: latitude, longitude: longitude, accuracy: accuracy };
}

function isGooglePlacesServerConfigured() {
  return !!String(PropertiesService.getScriptProperties().getProperty(GOOGLE_MAPS_SERVER_API_KEY_PROPERTY) || '').trim();
}

function getGooglePlaceCacheKey(placeId) {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(placeId || ''), Utilities.Charset.UTF_8);
  return GOOGLE_PLACE_TARGET_CACHE_PREFIX + Utilities.base64EncodeWebSafe(digest).replace(/=+$/g, '');
}

function resolveGooglePlaceTarget(placeId) {
  const normalizedPlaceId = String(placeId || '').trim();
  if (!normalizedPlaceId) {
    throw createApiException('GOOGLE_PLACE_ID_MISSING', 'Google Place ID가 비어 있습니다. 장소를 다시 선택해 주세요.');
  }

  const cache = CacheService.getScriptCache();
  const cacheKey = getGooglePlaceCacheKey(normalizedPlaceId);
  const cached = cache.get(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached);
      const normalized = normalizeAttendanceLocation({
        latitude: parsed.latitude,
        longitude: parsed.longitude,
        accuracy: 0
      });
      if (normalized.valid) {
        return { latitude: normalized.latitude, longitude: normalized.longitude };
      }
    } catch (error) {
      // 손상된 캐시는 무시하고 Google Places에서 다시 조회합니다.
    }
  }

  const apiKey = String(PropertiesService.getScriptProperties().getProperty(GOOGLE_MAPS_SERVER_API_KEY_PROPERTY) || '').trim();
  if (!apiKey) {
    throw createApiException('GOOGLE_PLACES_SERVER_NOT_CONFIGURED', '장소 검증 서버 키가 설정되지 않았습니다. 운영진에게 문의해 주세요.');
  }

  const response = UrlFetchApp.fetch(
    `https://places.googleapis.com/v1/places/${encodeURIComponent(normalizedPlaceId)}`,
    {
      method: 'get',
      muteHttpExceptions: true,
      headers: {
        'X-Goog-Api-Key': apiKey,
        'X-Goog-FieldMask': 'id,location'
      }
    }
  );
  const status = response.getResponseCode();
  if (status === 404) {
    throw createApiException('GOOGLE_PLACE_NOT_FOUND', '등록된 장소를 찾을 수 없습니다. 운영진이 장소를 다시 선택해야 합니다.');
  }
  if (status === 403) {
    throw createApiException('GOOGLE_PLACES_FORBIDDEN', '장소 검증 권한 또는 API 설정을 확인해 주세요.');
  }
  if (status === 429) {
    throw createApiException('GOOGLE_PLACES_QUOTA_EXCEEDED', '장소 검증 요청이 일시적으로 많습니다. 잠시 후 다시 시도해 주세요.');
  }
  if (status < 200 || status >= 300) {
    throw createApiException('GOOGLE_PLACES_UNAVAILABLE', '장소 검증 서비스를 사용할 수 없습니다. 잠시 후 다시 시도해 주세요.');
  }

  let payload;
  try {
    payload = JSON.parse(response.getContentText());
  } catch (error) {
    throw createApiException('GOOGLE_PLACES_RESPONSE_INVALID', '장소 검증 응답을 해석할 수 없습니다.');
  }

  const normalized = normalizeAttendanceLocation({
    latitude: payload && payload.location ? payload.location.latitude : '',
    longitude: payload && payload.location ? payload.location.longitude : '',
    accuracy: 0
  });
  if (!normalized.valid) {
    throw createApiException('GOOGLE_PLACES_LOCATION_INVALID', '등록된 장소의 위치 정보가 올바르지 않습니다.');
  }

  const target = { latitude: normalized.latitude, longitude: normalized.longitude };
  cache.put(cacheKey, JSON.stringify(target), GOOGLE_PLACE_TARGET_CACHE_TTL_SECONDS);
  return target;
}

function markSeasonAttendanceWithLocation(phoneNumber, seasonName, locationInput) {
  if (!phoneNumber) {
    return { success: false, errorCode: 'INVALID_PHONE', message: '전화번호가 입력되지 않았습니다.' };
  }
  if (!seasonName) {
    return { success: false, errorCode: 'INVALID_SEASON', message: '시즌 정보가 없습니다.' };
  }

  try {
    const info = resolveSeasonSheetInfo(seasonName);
    const sessions = collectSessionsFromSheet(info.sheet, { createMissingMeta: false });
    const activeSession = findActiveSession(sessions, new Date());
    if (!activeSession) {
      return markAttendanceInSheet(phoneNumber, info.sheet, info.seasonAlias);
    }
    if (!activeSession.locationPolicyValid) {
      return {
        success: false,
        errorCode: activeSession.locationPolicyErrorCode || 'LOCATION_POLICY_INVALID',
        message: '현재 회차의 장소 정책이 올바르지 않습니다. 운영진에게 문의해 주세요.'
      };
    }
    if (!activeSession.locationRequired) {
      return markAttendanceInSheet(phoneNumber, info.sheet, info.seasonAlias);
    }

    const attendeeLocation = normalizeAttendanceLocation(locationInput);
    if (!attendeeLocation.valid) {
      return attendeeLocation;
    }
    const targetLocation = resolveGooglePlaceTarget(activeSession.googlePlaceId);

    return markAttendanceInSheet(phoneNumber, info.sheet, info.seasonAlias, {
      locationCheck: true,
      expectedLocationPolicyFingerprint: getLocationPolicyFingerprint(activeSession),
      attendeeLocation: attendeeLocation,
      targetLocation: targetLocation
    });
  } catch (error) {
    Logger.log('시즌별 위치 출석 처리 오류: ' + getErrorMessageText(error));
    return {
      success: false,
      errorCode: error && error.apiCode ? error.apiCode : 'LOCATION_ATTENDANCE_ERROR',
      message: error && error.message ? error.message : '위치 출석 처리 중 오류가 발생했습니다.'
    };
  }
}

function normalizeLocationAttendanceRequestId(requestId) {
  const value = String(requestId || '').trim().toLowerCase();
  if (!/^[a-f0-9]{32}$/.test(value)) {
    throw createApiException('LOCATION_REQUEST_ID_INVALID', '위치 출석 요청 식별자가 올바르지 않습니다.');
  }
  return value;
}

function processLocationAttendancePost(payload) {
  const request = payload || {};
  const requestId = normalizeLocationAttendanceRequestId(request.requestId);
  const phone = normalizePhone(request.phone || '');
  if (!isValidPhoneNumber(phone)) {
    throw createApiException('INVALID_PHONE', '올바른 전화번호 형식이 아닙니다.');
  }
  const resultCacheKey = LOCATION_ATTENDANCE_RESULT_CACHE_PREFIX + requestId;
  const processingCacheKey = LOCATION_ATTENDANCE_PROCESSING_CACHE_PREFIX + requestId;
  const cache = CacheService.getScriptCache();
  if (cache.get(resultCacheKey)) {
    return { accepted: true, requestId: requestId };
  }

  const claimLock = LockService.getScriptLock();
  claimLock.waitLock(3000);
  try {
    if (cache.get(resultCacheKey) || cache.get(processingCacheKey)) {
      return { accepted: true, requestId: requestId };
    }
    cache.put(processingCacheKey, '1', 30);
  } finally {
    claimLock.releaseLock();
  }

  let resultEnvelope;
  try {
    const access = resolvePublicSeasonAccess(request, () => requireAdmin(request));
    const result = markSeasonAttendanceWithLocation(phone, access.seasonAlias, {
      latitude: request.latitude,
      longitude: request.longitude,
      accuracy: request.accuracy
    });
    resultEnvelope = apiSuccess(result);
  } catch (error) {
    resultEnvelope = apiError(
      error && error.apiCode ? error.apiCode : 'LOCATION_ATTENDANCE_ERROR',
      error && error.message ? error.message : '위치 출석 처리 중 오류가 발생했습니다.'
    );
  }

  cache.put(resultCacheKey, JSON.stringify(resultEnvelope), LOCATION_ATTENDANCE_RESULT_TTL_SECONDS);
  cache.remove(processingCacheKey);
  return { accepted: true, requestId: requestId };
}

function getLocationAttendanceResult(requestId) {
  const normalizedRequestId = normalizeLocationAttendanceRequestId(requestId);
  const cache = CacheService.getScriptCache();
  const raw = cache.get(LOCATION_ATTENDANCE_RESULT_CACHE_PREFIX + normalizedRequestId);
  if (!raw) {
    return {
      ready: false,
      processing: !!cache.get(LOCATION_ATTENDANCE_PROCESSING_CACHE_PREFIX + normalizedRequestId)
    };
  }

  try {
    return { ready: true, result: JSON.parse(raw) };
  } catch (error) {
    return { ready: false, processing: false };
  }
}
