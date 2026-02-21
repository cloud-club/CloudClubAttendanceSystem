if (!manualApproveState && typeof createManualApproveInitialState === 'function') {
  manualApproveState = createManualApproveInitialState();
}

if (!scheduleManualMemberListRender && typeof debounce === 'function') {
  scheduleManualMemberListRender = debounce(() => {
    if (typeof renderManualMemberList === 'function') {
      renderManualMemberList();
    }
  }, MANUAL_MEMBER_SEARCH_DEBOUNCE_MS);
}

document.addEventListener('DOMContentLoaded', () => {
  const prefersReducedMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  if (isAdminLiteModeEnabled() || prefersReducedMotion) {
    document.body.classList.add('lite-mode');
  }

  setTimeout(() => {
    document.querySelectorAll('.cloud-animation').forEach((node) => {
      node.style.animationPlayState = 'paused';
    });
  }, 25000);

  document.addEventListener('click', (event) => {
    const popover = document.getElementById('authInfoPopover');
    const button = document.getElementById('authInfoButton');
    if (!popover || popover.hidden || !button) return;
    if (button.contains(event.target) || popover.contains(event.target)) return;
    closeAuthInfoPopover();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeAuthInfoPopover();
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (countdownInterval) {
        clearInterval(countdownInterval);
        countdownInterval = null;
      }
      return;
    }

    if (typeof checkAttendanceSession === 'function' && adminToken && seasonSourceReady) {
      checkAttendanceSession();
    }

    if (typeof refreshStatusDashboardIfVisible === 'function' && adminToken && seasonSourceReady) {
      refreshStatusDashboardIfVisible();
    }
  });

  handleAdminRoleChange();
  resetAdminAuthState({ silent: true });
  bootstrapAdminAuth().catch((error) => {
    setAuthGateMessage(getDisplayErrorMessage(error, '초기 인증 처리 중 오류가 발생했습니다.'), true);
    console.error(error);
  });
});
