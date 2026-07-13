(function (global) {
  'use strict';

  var pending = {};
  var sequence = 0;

  function getConfig() {
    return global.CLOUDCLUB_CONFIG || {};
  }

  function getApiBaseUrl() {
    var cfg = getConfig();
    return String(cfg.API_BASE_URL || '').trim();
  }

  function getTimeoutMs(options) {
    if (options && typeof options.timeoutMs === 'number' && options.timeoutMs > 0) {
      return options.timeoutMs;
    }

    var configured = parseInt(getConfig().API_TIMEOUT_MS, 10);
    if (!isNaN(configured) && configured > 0) {
      return configured;
    }

    return 12000;
  }

  function getJsonpCrossOrigin() {
    var value = String(getConfig().JSONP_CROSSORIGIN || 'anonymous').trim();
    return value || 'anonymous';
  }

  function getJsonpReferrerPolicy() {
    var value = String(getConfig().JSONP_REFERRER_POLICY || 'no-referrer').trim();
    return value || 'no-referrer';
  }

  function toQueryString(params) {
    var pairs = [];
    Object.keys(params || {}).forEach(function (key) {
      var value = params[key];
      if (value === undefined || value === null) return;
      pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
    });
    return pairs.join('&');
  }

  function sanitizeUrl(url) {
    try {
      var parsed = new URL(url, global.location && global.location.href ? global.location.href : undefined);
      ['adminKey', 'adminToken', 'phone', 'comment', 'sessionKey', 'confirmSessionKey', 'itemsJson', 'rowsJson', 'schemaSummaryJson', 'diffToken', 'idToken', 'credential', 'latitude', 'longitude', 'accuracy', 'locationCapturedAt', 'requestId'].forEach(function (key) {
        if (parsed.searchParams.has(key)) {
          parsed.searchParams.set(key, 'REDACTED');
        }
      });
      return parsed.toString();
    } catch (err) {
      return '[unavailable]';
    }
  }

  function createError(message, code, details) {
    var err = new Error(message || '요청 중 오류가 발생했습니다.');
    err.code = code || 'UNKNOWN';

    if (details && typeof details === 'object') {
      Object.keys(details).forEach(function (key) {
        err[key] = details[key];
      });
    }

    return err;
  }

  function buildNetworkErrorMessage(action) {
    return 'API 서버 응답 스크립트를 불러오지 못했습니다. (action: ' + action + ') Google 리다이렉트/ORB 차단 여부를 확인하세요.';
  }

  function call(action, params, options) {
    var baseUrl = getApiBaseUrl();
    if (!baseUrl || baseUrl.indexOf('REPLACE_WITH_APPS_SCRIPT_WEB_APP_URL') >= 0) {
      return Promise.reject(createError('API_BASE_URL이 설정되지 않았습니다. GitHub Pages를 workflow_dispatch로 재배포해 env.js 주입 상태를 확인하세요.', 'MISSING_API_BASE_URL'));
    }

    var timeoutMs = getTimeoutMs(options);
    var callbackName = '__ccJsonpCb_' + Date.now() + '_' + (sequence++);
    var query = Object.assign({}, params || {}, {
      api: action,
      callback: callbackName,
      _: Date.now()
    });

    var url = baseUrl + (baseUrl.indexOf('?') === -1 ? '?' : '&') + toQueryString(query);
    var debugUrl = sanitizeUrl(url);

    return new Promise(function (resolve, reject) {
      var script = document.createElement('script');
      var timeoutId;

      function cleanup() {
        if (timeoutId) {
          clearTimeout(timeoutId);
        }

        if (script.parentNode) {
          script.parentNode.removeChild(script);
        }

        try {
          delete global[callbackName];
        } catch (err) {
          global[callbackName] = undefined;
        }

        delete pending[callbackName];
      }

      global[callbackName] = function (payload) {
        cleanup();

        if (!payload || payload.ok !== true) {
          var message = payload && payload.error ? payload.error.message : 'API 응답 형식이 올바르지 않습니다.';
          var code = payload && payload.error ? payload.error.code : 'INVALID_RESPONSE';
          reject(createError(message, code, {
            action: action,
            debugUrl: debugUrl
          }));
          return;
        }

        resolve(payload.data);
      };

      pending[callbackName] = true;

      script.onerror = function () {
        cleanup();
        reject(createError(buildNetworkErrorMessage(action), 'NETWORK_ERROR', {
          action: action,
          debugUrl: debugUrl
        }));
      };

      timeoutId = setTimeout(function () {
        cleanup();
        reject(createError('요청 시간이 초과되었습니다. (action: ' + action + ')', 'TIMEOUT', {
          action: action,
          debugUrl: debugUrl
        }));
      }, timeoutMs);

      script.crossOrigin = getJsonpCrossOrigin();
      script.referrerPolicy = getJsonpReferrerPolicy();
      script.src = url;
      script.async = true;
      document.head.appendChild(script);
    });
  }

  function createLocationRequestId() {
    if (!global.crypto || typeof global.crypto.getRandomValues !== 'function') {
      throw createError('안전한 위치 출석 요청 식별자를 만들 수 없습니다.', 'CRYPTO_UNAVAILABLE');
    }
    var bytes = new Uint8Array(16);
    global.crypto.getRandomValues(bytes);
    return Array.prototype.map.call(bytes, function (value) {
      return value.toString(16).padStart(2, '0');
    }).join('');
  }

  function delay(ms) {
    return new Promise(function (resolve) {
      global.setTimeout(resolve, ms);
    });
  }

  async function postLocationAttendance(params, options) {
    var baseUrl = getApiBaseUrl();
    if (!baseUrl || baseUrl.indexOf('REPLACE_WITH_APPS_SCRIPT_WEB_APP_URL') >= 0) {
      throw createError('API_BASE_URL이 설정되지 않았습니다.', 'MISSING_API_BASE_URL');
    }

    var requestId = createLocationRequestId();
    var payload = Object.assign({}, params || {}, {
      api: 'attendanceLocation',
      requestId: requestId
    });
    await global.fetch(baseUrl, {
      method: 'POST',
      mode: 'no-cors',
      cache: 'no-store',
      redirect: 'follow',
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify(payload)
    });

    var timeoutMs = getTimeoutMs(options);
    var startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      var status = await call('locationResult', { requestId: requestId }, { timeoutMs: Math.min(timeoutMs, 8000) });
      if (status && status.ready) {
        var envelope = status.result;
        if (!envelope || envelope.ok !== true) {
          throw createError(
            envelope && envelope.error ? envelope.error.message : '위치 출석 처리 결과가 올바르지 않습니다.',
            envelope && envelope.error ? envelope.error.code : 'LOCATION_RESULT_INVALID'
          );
        }
        return envelope.data;
      }
      await delay(600);
    }
    throw createError('위치 출석 처리 시간이 초과되었습니다. 다시 시도해 주세요.', 'LOCATION_RESULT_TIMEOUT');
  }

  global.CloudClubApi = {
    call: call,
    postLocationAttendance: postLocationAttendance
  };
})(window);
