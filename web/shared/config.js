(function (global) {
  var defaults = {
    // Apps Script 웹앱 배포 URL (예: https://script.google.com/macros/s/AKfycb.../exec)
    API_BASE_URL: 'https://script.google.com/macros/s/AKfycbzxNBS7VqOgk39yGlJEwG_GQQ3oJaFPFc8YrSnFlpP5QrROGO8Kut_gMqrS0CWvniLgjg/exec'
  };

  // 운영 환경에서 필요 시 window.CLOUDCLUB_ENV.API_BASE_URL 로 덮어쓸 수 있습니다.
  var env = global.CLOUDCLUB_ENV || {};
  var existing = global.CLOUDCLUB_CONFIG || {};

  global.CLOUDCLUB_CONFIG = Object.assign({}, defaults, env, existing);
})(window);
