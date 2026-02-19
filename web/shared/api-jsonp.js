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
      ['adminKey', 'adminToken', 'phone', 'comment', 'sessionKey', 'confirmSessionKey', 'itemsJson', 'rowsJson', 'schemaSummaryJson', 'diffToken'].forEach(function (key) {
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

  global.CloudClubApi = {
    call: call
  };
})(window);
