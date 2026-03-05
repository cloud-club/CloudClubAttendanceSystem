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
  if (isAdminPerfUiEnabled()) {
    document.body.classList.add('perf-ui');
  }
  if (isAdminLiteModeEnabled() || prefersReducedMotion) {
    document.body.classList.add('lite-mode');
  }
  initializeAdminPerfMonitors();

  const cloudNodes = Array.from(document.querySelectorAll('.cloud-animation'));
  let cloudScrollResumeTimer = null;
  const pauseCloudAnimations = () => {
    cloudNodes.forEach((node) => {
      node.style.animationPlayState = 'paused';
    });
  };
  const resumeCloudAnimations = () => {
    cloudNodes.forEach((node) => {
      node.style.animationPlayState = 'running';
    });
  };

  setTimeout(() => {
    pauseCloudAnimations();
  }, 25000);

  if (isAdminPerfUiEnabled() && cloudNodes.length > 0 && !prefersReducedMotion) {
    window.addEventListener('scroll', () => {
      pauseCloudAnimations();
      if (cloudScrollResumeTimer) {
        clearTimeout(cloudScrollResumeTimer);
      }
      cloudScrollResumeTimer = setTimeout(() => {
        if (!document.hidden) {
          resumeCloudAnimations();
        }
      }, 180);
    }, { passive: true });
  }

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
      if (isAdminPerfUiEnabled()) {
        pauseCloudAnimations();
      }
      return;
    }

    if (isAdminPerfUiEnabled() && !prefersReducedMotion) {
      resumeCloudAnimations();
    }

    if (typeof checkAttendanceSession === 'function' && adminToken && seasonSourceReady) {
      checkAttendanceSession();
    }

    if (typeof refreshStatusDashboardIfVisible === 'function' && adminToken && seasonSourceReady) {
      refreshStatusDashboardIfVisible();
    }
  });

  handleAdminRoleChange();
  resetAdminAuthState({ silent: true, preserveSessionToken: true });
  bootstrapAdminAuth().catch((error) => {
    setAuthGateMessage(getDisplayErrorMessage(error, '초기 인증 처리 중 오류가 발생했습니다.'), true);
    console.error(error);
  });
});
