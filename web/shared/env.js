(function (global) {
  var env = global.CLOUDCLUB_ENV || {};
  var injectedApiBase = '__API_BASE_URL__';

  if (injectedApiBase && injectedApiBase.indexOf('__API_BASE_URL__') === -1) {
    env.API_BASE_URL = injectedApiBase;
  }

  global.CLOUDCLUB_ENV = env;
})(window);
