function getSelectedSheetName() {
  const sheetSelect = document.getElementById('sheetSelect');
  return sheetSelect ? sheetSelect.value : '';
}

function getSelectedSeasonAlias() {
  const sheetSelect = document.getElementById('sheetSelect');
  if (!sheetSelect) return currentSeasonAlias;

  const option = sheetSelect.options[sheetSelect.selectedIndex];
  if (option && option.dataset && option.dataset.alias) {
    return option.dataset.alias;
  }

  return normalizeSeasonAlias(sheetSelect.value || currentSeasonAlias);
}

function getTabButtonByName(tabName) {
  return Array.from(document.querySelectorAll('.tab-button'))
    .find(btn => btn.getAttribute('onclick') && btn.getAttribute('onclick').indexOf(`openTab('${tabName}'`) >= 0);
}

function setAuthGateMessage(message, isError) {
  const node = document.getElementById('authGateMessage');
  if (!node) return;
  node.textContent = message || '';
  node.classList.toggle('error', !!isError);
}

function closeAuthInfoPopover() {
  const popover = document.getElementById('authInfoPopover');
  const button = document.getElementById('authInfoButton');
  if (popover) popover.hidden = true;
  if (button) button.setAttribute('aria-expanded', 'false');
}

function toggleAuthInfoPopover() {
  const popover = document.getElementById('authInfoPopover');
  const button = document.getElementById('authInfoButton');
  if (!popover || !button) return;

  const isExpanded = button.getAttribute('aria-expanded') === 'true';
  const next = !isExpanded;
  button.setAttribute('aria-expanded', next ? 'true' : 'false');
  popover.hidden = !next;
}

function showAuthGate() {
  const gate = document.getElementById('authGate');
  const app = document.getElementById('adminApp');
  if (gate) gate.classList.remove('is-hidden');
  if (app) app.classList.add('is-hidden');
}

function showAdminApp() {
  const gate = document.getElementById('authGate');
  const app = document.getElementById('adminApp');
  if (gate) gate.classList.add('is-hidden');
  if (app) app.classList.remove('is-hidden');
}
