window.AdminApp = window.AdminApp || {};

if (window.CloudClubApi && typeof window.CloudClubApi.call === 'function' && !window.CloudClubApi.__adminPerfWrapped) {
  const rawCloudClubApiCall = window.CloudClubApi.call.bind(window.CloudClubApi);
  window.CloudClubApi.call = async function wrappedCloudClubApiCall(action, payload, options) {
    const perfToken = startPerfMark(`api:${action}`, {
      action: String(action || ''),
      payloadKeys: payload && typeof payload === 'object' ? Object.keys(payload).length : 0
    });
    try {
      const response = await rawCloudClubApiCall(action, payload, options);
      endPerfMark(perfToken, { status: 'ok' });
      return response;
    } catch (error) {
      endPerfMark(perfToken, {
        status: 'error',
        code: error && error.code ? error.code : ''
      });
      throw error;
    }
  };
  window.CloudClubApi.__adminPerfWrapped = true;
}

window.AdminApp.api = {
  call(action, payload) {
    return CloudClubApi.call(action, payload);
  }
};
