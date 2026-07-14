function getAdminTabButtons() {
  return Array.from(document.querySelectorAll('#adminTabNav .tab-button'));
}

function getAvailableAdminTabButtons() {
  return getAdminTabButtons().filter((button) => {
    return !button.classList.contains('is-hidden') && button.getAttribute('aria-disabled') !== 'true';
  });
}

function isAdminMobileMenuViewport() {
  return !!(window.matchMedia && window.matchMedia('(max-width: 768px)').matches);
}

function getActiveAdminTabName() {
  const activeButton = getAdminTabButtons().find((button) => button.classList.contains('active'));
  return activeButton ? String(activeButton.dataset.tab || '') : 'attend';
}

function syncAdminTabAccessibility(tabName) {
  const requestedName = String(tabName || '').trim();
  const availableButtons = getAvailableAdminTabButtons();
  const requestedButton = availableButtons.find((button) => button.dataset.tab === requestedName);
  const activeButton = requestedButton || availableButtons[0] || null;
  const activeName = activeButton ? String(activeButton.dataset.tab || '') : '';

  getAdminTabButtons().forEach((button) => {
    const selected = button === activeButton;
    button.classList.toggle('active', selected);
    button.setAttribute('aria-selected', selected ? 'true' : 'false');
    button.setAttribute('tabindex', selected ? '0' : '-1');
  });

  document.querySelectorAll('.tab-content').forEach((panel) => {
    panel.setAttribute('aria-hidden', panel.id === activeName ? 'false' : 'true');
  });
}

function closeAdminMenu(options) {
  const opts = options || {};
  const menuButton = document.getElementById('adminMenuButton');
  const backdrop = document.getElementById('adminMenuBackdrop');
  const controls = document.getElementById('adminTopbarControls');
  const nav = document.getElementById('adminTabNav');

  document.body.classList.remove('admin-menu-open');
  if (menuButton) menuButton.setAttribute('aria-expanded', 'false');
  if (backdrop) ariaSetHidden(backdrop, true);
  if (controls) controls.setAttribute('aria-hidden', isAdminMobileMenuViewport() ? 'true' : 'false');
  if (nav) nav.setAttribute('aria-orientation', isAdminMobileMenuViewport() ? 'vertical' : 'horizontal');

  if (opts.restoreFocus !== false && menuButton && !menuButton.classList.contains('is-hidden')) {
    window.requestAnimationFrame(() => menuButton.focus());
  }
}

function openAdminMenu() {
  if (!isAdminMobileMenuViewport()) return;

  const menuButton = document.getElementById('adminMenuButton');
  const backdrop = document.getElementById('adminMenuBackdrop');
  const controls = document.getElementById('adminTopbarControls');
  const activeButton = getAvailableAdminTabButtons().find((button) => button.classList.contains('active'))
    || getAvailableAdminTabButtons()[0];

  document.body.classList.add('admin-menu-open');
  if (menuButton) menuButton.setAttribute('aria-expanded', 'true');
  if (backdrop) ariaSetHidden(backdrop, false);
  if (controls) controls.setAttribute('aria-hidden', 'false');

  if (activeButton) {
    window.setTimeout(() => {
      if (document.body.classList.contains('admin-menu-open')) {
        activeButton.focus({ preventScroll: true });
      }
    }, 220);
  }
}

function toggleAdminMenu() {
  if (document.body.classList.contains('admin-menu-open')) {
    closeAdminMenu();
    return;
  }
  openAdminMenu();
}

function toggleSheetAccessInfo() {
  const button = document.getElementById('sheetAccessInfoButton');
  const panel = document.getElementById('sheetAccessInfoPopover');
  if (!button || !panel) return;

  const expanded = button.getAttribute('aria-expanded') === 'true';
  button.setAttribute('aria-expanded', expanded ? 'false' : 'true');
  panel.hidden = expanded;
}

function setAdminShellAuthenticated(isAuthenticated) {
  const controls = document.getElementById('adminTopbarControls');
  const menuButton = document.getElementById('adminMenuButton');
  const authenticated = isAuthenticated === true;

  if (controls) controls.classList.toggle('is-hidden', !authenticated);
  if (menuButton) menuButton.classList.toggle('is-hidden', !authenticated);

  if (!authenticated) {
    closeAdminMenu({ restoreFocus: false });
    if (controls) controls.setAttribute('aria-hidden', 'true');
    return;
  }

  syncAdminTabAccessibility(getActiveAdminTabName());
  if (controls) controls.setAttribute('aria-hidden', isAdminMobileMenuViewport() ? 'true' : 'false');
}

function moveAdminTabFocus(currentButton, direction) {
  const buttons = getAvailableAdminTabButtons();
  const currentIndex = buttons.indexOf(currentButton);
  if (currentIndex < 0 || buttons.length === 0) return;

  let nextIndex = currentIndex;
  if (direction === 'first') nextIndex = 0;
  if (direction === 'last') nextIndex = buttons.length - 1;
  if (direction === 'next') nextIndex = (currentIndex + 1) % buttons.length;
  if (direction === 'previous') nextIndex = (currentIndex - 1 + buttons.length) % buttons.length;

  const nextButton = buttons[nextIndex];
  nextButton.focus();
  nextButton.click();
}

function handleAdminTabListKeydown(event) {
  const button = event.target.closest('.tab-button');
  if (!button) return;

  const directionByKey = {
    ArrowRight: 'next',
    ArrowDown: 'next',
    ArrowLeft: 'previous',
    ArrowUp: 'previous',
    Home: 'first',
    End: 'last'
  };
  const direction = directionByKey[event.key];
  if (!direction) return;

  event.preventDefault();
  moveAdminTabFocus(button, direction);
}

function trapAdminMenuFocus(event) {
  if (event.key !== 'Tab' || !document.body.classList.contains('admin-menu-open')) return;

  const controls = document.getElementById('adminTopbarControls');
  if (!controls) return;

  const focusable = Array.from(controls.querySelectorAll('button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'))
    .filter((node) => !node.classList.contains('is-hidden') && getComputedStyle(node).visibility !== 'hidden');
  if (focusable.length === 0) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;

  if (!controls.contains(active)) {
    event.preventDefault();
    first.focus();
    return;
  }
  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
    return;
  }
  if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

function ariaSetHidden(node, hidden) {
  if (!node) return;
  node.setAttribute('aria-hidden', hidden ? 'true' : 'false');
  node.setAttribute('tabindex', hidden ? '-1' : '0');
}

function initializeAdminShell() {
  const nav = document.getElementById('adminTabNav');
  if (nav) nav.addEventListener('keydown', handleAdminTabListKeydown);

  document.addEventListener('keydown', (event) => {
    trapAdminMenuFocus(event);
    if (event.key === 'Escape' && document.body.classList.contains('admin-menu-open')) {
      closeAdminMenu();
    }
  });

  window.addEventListener('resize', () => {
    const controls = document.getElementById('adminTopbarControls');
    if (nav) {
      nav.setAttribute('aria-orientation', isAdminMobileMenuViewport() ? 'vertical' : 'horizontal');
    }
    if (!isAdminMobileMenuViewport()) {
      closeAdminMenu({ restoreFocus: false });
      if (controls && !controls.classList.contains('is-hidden')) {
        controls.setAttribute('aria-hidden', 'false');
      }
    } else if (controls && !document.body.classList.contains('admin-menu-open')) {
      controls.setAttribute('aria-hidden', 'true');
    }
  });

  syncAdminTabAccessibility(getActiveAdminTabName());
}

document.addEventListener('DOMContentLoaded', initializeAdminShell);
