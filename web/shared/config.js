(function (global) {
  var defaults = {
    // Apps Script 웹앱 배포 URL (예: https://script.google.com/macros/s/AKfycb.../exec)
    API_BASE_URL: 'https://script.google.com/macros/s/AKfycbxdJ2h7EmkfcFBpaO-HCuhEWQwDhz_CyijAembJHUJWq5cCuzxCoHtd7HA0NZuHCp5hiw/exec',
    // JSONP 스크립트를 쿠키 비의존으로 로드해 Google 계정 리다이렉트 이슈를 줄입니다.
    JSONP_CROSSORIGIN: 'anonymous',
    JSONP_REFERRER_POLICY: 'no-referrer',
    API_TIMEOUT_MS: 15000
  };

  // 운영 환경에서 필요 시 window.CLOUDCLUB_ENV.* 로 덮어쓸 수 있습니다.
  var env = global.CLOUDCLUB_ENV || {};
  var existing = global.CLOUDCLUB_CONFIG || {};

  global.CLOUDCLUB_CONFIG = Object.assign({}, defaults, env, existing);
})(window);
