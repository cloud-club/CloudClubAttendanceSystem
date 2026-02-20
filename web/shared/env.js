(function (global) {
  var env = global.CLOUDCLUB_ENV || {};
  var injectedApiBase = '__API_BASE_URL__';
  var scriptApiPattern = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec(?:\?.*)?$/;

  if (scriptApiPattern.test(String(injectedApiBase || '').trim())) {
    env.API_BASE_URL = injectedApiBase;
  }

  global.CLOUDCLUB_ENV = env;
})(window);
