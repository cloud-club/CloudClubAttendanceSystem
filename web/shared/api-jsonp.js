(function (global) {
  'use strict';

  var pending = {};
  var sequence = 0;

  function getApiBaseUrl() {
    var cfg = global.CLOUDCLUB_CONFIG || {};
    return String(cfg.API_BASE_URL || '').trim();
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

  function createError(message, code) {
    var err = new Error(message || '요청 중 오류가 발생했습니다.');
    err.code = code || 'UNKNOWN';
    return err;
  }

  function call(action, params, options) {
    var baseUrl = getApiBaseUrl();
    if (!baseUrl || baseUrl.indexOf('REPLACE_WITH_APPS_SCRIPT_WEB_APP_URL') >= 0) {
      return Promise.reject(createError('API_BASE_URL이 설정되지 않았습니다. web/shared/config.js를 확인하세요.', 'MISSING_API_BASE_URL'));
    }

    var timeoutMs = (options && options.timeoutMs) || 12000;
    var callbackName = '__ccJsonpCb_' + Date.now() + '_' + (sequence++);
    var query = Object.assign({}, params || {}, {
      api: action,
      callback: callbackName,
      _: Date.now()
    });

    var url = baseUrl + (baseUrl.indexOf('?') === -1 ? '?' : '&') + toQueryString(query);

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
          reject(createError(message, code));
          return;
        }

        resolve(payload.data);
      };

      pending[callbackName] = true;

      script.onerror = function () {
        cleanup();
        reject(createError('네트워크 오류가 발생했습니다.', 'NETWORK_ERROR'));
      };

      timeoutId = setTimeout(function () {
        cleanup();
        reject(createError('요청 시간이 초과되었습니다.', 'TIMEOUT'));
      }, timeoutMs);

      script.src = url;
      script.async = true;
      document.head.appendChild(script);
    });
  }

  global.CloudClubApi = {
    call: call
  };
})(window);
