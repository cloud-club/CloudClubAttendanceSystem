(function (global) {
  var env = global.CLOUDCLUB_ENV || {};
  var injectedApiBase = '__API_BASE_URL__';
  var injectedGoogleMapsKey = '__GOOGLE_MAPS_BROWSER_API_KEY__';
  var scriptApiPattern = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec(?:\?.*)?$/;

  if (scriptApiPattern.test(String(injectedApiBase || '').trim())) {
    env.API_BASE_URL = injectedApiBase;
  }
  if (injectedGoogleMapsKey && injectedGoogleMapsKey.indexOf('__GOOGLE_MAPS_') !== 0) {
    env.GOOGLE_MAPS_BROWSER_API_KEY = injectedGoogleMapsKey;
  }

  global.CLOUDCLUB_ENV = env;
})(window);
