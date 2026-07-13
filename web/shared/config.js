(function (global) {
  var defaults = {
    // 기본값은 placeholder를 유지하고, 실제 운영 URL은 web/shared/env.js에 주입합니다.
    API_BASE_URL: 'REPLACE_WITH_APPS_SCRIPT_WEB_APP_URL',
    GOOGLE_MAPS_BROWSER_API_KEY: '',
    // JSONP 스크립트를 쿠키 비의존으로 로드해 Google 계정 리다이렉트 이슈를 줄입니다.
    JSONP_CROSSORIGIN: 'anonymous',
    JSONP_REFERRER_POLICY: 'no-referrer',
    API_TIMEOUT_MS: 15000
  };

  // 운영 환경에서 필요 시 window.CLOUDCLUB_ENV.* 로 덮어쓸 수 있습니다.
  var env = global.CLOUDCLUB_ENV || {};
  var existing = global.CLOUDCLUB_CONFIG || {};

  // 우선순위: defaults < 기존 설정 < env 주입값
  global.CLOUDCLUB_CONFIG = Object.assign({}, defaults, existing, env);
})(window);
