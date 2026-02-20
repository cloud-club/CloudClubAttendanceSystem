window.AdminApp = window.AdminApp || {};

window.AdminApp.api = {
  call(action, payload) {
    return CloudClubApi.call(action, payload);
  }
};
