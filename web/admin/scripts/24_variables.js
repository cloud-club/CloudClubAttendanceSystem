const variableUsageTabOrder = [
  '출석하기',
  '출석현황',
  '일정 관리',
  '유고 처리',
  'QR코드 관리',
  '변수명 관리',
  '수료 판정',
  '시즌 생성/업로드'
];

const variableTabMapByKey = {
  attendance_open_offset_min: ['출석하기', '출석현황', '일정 관리', '유고 처리', '수료 판정'],
  late_threshold_min: ['출석하기', '출석현황', '일정 관리', '유고 처리', '수료 판정'],
  absence_threshold_min: ['출석하기', '출석현황', '일정 관리', '유고 처리', '수료 판정'],
  required_attendance_count: ['유고 처리', '수료 판정'],
  late_to_absence_ratio: ['유고 처리', '수료 판정'],
  required_session_positions: ['유고 처리', '수료 판정'],
  max_absence_equivalent: ['유고 처리', '수료 판정'],
  official_session_min_recommended: ['수료 판정'],
  official_session_max_recommended: ['수료 판정'],
  default_session_start_time: ['일정 관리']
};

function setVariableActionButtonsDisabled(disabled) {
  const buttonIds = [
    'variablesSaveBtn',
    'variablesReloadBtn',
    'variablesTemplatePreserveBtn',
    'variablesTemplateResetBtn'
  ];

  buttonIds.forEach(id => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.disabled = !!disabled;
  });
}

function renderVariableCompatibilityNotice(state) {
  const node = document.getElementById('variablesCompatibilityNotice');
  if (!node) return;

  const info = state || {};
  const maskedUrl = maskApiBaseUrl(getConfiguredApiBaseUrl());
  const versionText = info.apiVersion ? `API 버전: ${escapeHtml(info.apiVersion)}` : 'API 버전: 확인 불가';
  const serverTimeText = info.serverTime ? `서버 시각: ${escapeHtml(info.serverTime)}` : '';
  const baseLine = `<div><strong>현재 API URL:</strong> <code>${escapeHtml(maskedUrl)}</code></div>`;
  const versionLine = `<div><strong>${versionText}</strong>${serverTimeText ? ` / ${serverTimeText}` : ''}</div>`;

  if (info.blocked) {
    node.className = 'compat-notice blocked';
    node.innerHTML = `
      <div><strong>백엔드 구버전 연결됨</strong></div>
      <div>${escapeHtml(info.message || 'Apps Script 재배포 + GitHub Pages 재배포가 필요합니다.')}</div>
      ${versionLine}
      ${baseLine}
    `;
    return;
  }

  node.className = 'compat-notice';
  node.innerHTML = `
    <div><strong>변수 API 호환성 정상</strong></div>
    ${versionLine}
    ${baseLine}
  `;
}

function setVariableTabBlocked(blocked, message, info) {
  variableTabBlocked = !!blocked;
  const payload = Object.assign({}, info || {}, {
    blocked: !!blocked,
    message: message || ''
  });
  renderVariableCompatibilityNotice(payload);
  setVariableActionButtonsDisabled(!!blocked);

  if (!blocked) {
    return;
  }

  const tableWrap = document.getElementById('variablesTableWrap');
  const help = document.getElementById('variablesHelpPanel');
  if (tableWrap) {
    tableWrap.innerHTML = `<div class="error">${escapeHtml(message || '백엔드 구버전으로 변수 탭을 사용할 수 없습니다.')}</div>`;
  }
  if (help) {
    help.innerHTML = `
      <h4>백엔드 배포 버전을 확인해주세요.</h4>
      <p class="help-muted">Apps Script 최신 버전 배포 후, GitHub Pages를 workflow_dispatch로 재배포하면 정상 동작합니다.</p>
    `;
  }
}

function hasRequiredVariableActions(supportedActions) {
  const required = ['apiInfo', 'variablesGet', 'variablesNormalize', 'variablesResetTemplate'];
  const actionSet = {};
  (supportedActions || []).forEach(action => {
    actionSet[String(action || '').trim()] = true;
  });
  return required.every(action => !!actionSet[action]);
}

async function ensureVariableApiCompatibility() {
  try {
    const info = await CloudClubApi.call('apiInfo', {
      adminToken
    });
    if (!info || info.success === false) {
      setVariableTabBlocked(
        true,
        (info && info.message) ? info.message : 'apiInfo 응답이 올바르지 않습니다. 백엔드를 재배포하세요.',
        info || {}
      );
      return false;
    }

    const supportedActions = Array.isArray(info.supportedActions) ? info.supportedActions : [];
    const compatible = hasRequiredVariableActions(supportedActions);
    variableApiInfo = info;

    if (!compatible) {
      setVariableTabBlocked(
        true,
        'variablesGet/variablesNormalize/variablesResetTemplate 미지원 백엔드입니다. Apps Script와 GitHub Pages를 최신으로 재배포하세요.',
        info
      );
      return false;
    }

    setVariableTabBlocked(false, '', info);
    return true;
  } catch (error) {
    if (handleUnauthorizedError(error)) return false;
    const message = error && error.code === 'UNSUPPORTED_ACTION'
      ? 'apiInfo 미지원 백엔드입니다. Apps Script 최신 배포 후 GitHub Pages를 다시 배포하세요.'
      : getDisplayErrorMessage(error, '백엔드 버전 확인 중 오류가 발생했습니다.');
    setVariableTabBlocked(true, message, variableApiInfo || {});
    return false;
  }
}

function getFallbackVariableMetaText(value) {
  return String(value || '').trim() || '미정(템플릿 복구 필요)';
}

function sortVariableTabsForDisplay(tabs) {
  const orderMap = {};
  variableUsageTabOrder.forEach((tab, idx) => {
    orderMap[tab] = idx;
  });

  const seen = {};
  const unique = [];
  (tabs || []).forEach(tab => {
    const t = String(tab || '').trim();
    if (!t || seen[t]) return;
    seen[t] = true;
    unique.push(t);
  });

  unique.sort((a, b) => {
    const aOrder = Object.prototype.hasOwnProperty.call(orderMap, a) ? orderMap[a] : 999;
    const bOrder = Object.prototype.hasOwnProperty.call(orderMap, b) ? orderMap[b] : 999;
    if (aOrder !== bOrder) return aOrder - bOrder;
    return a.localeCompare(b, 'ko');
  });

  return unique;
}

function mapVariableUsedTabs(key, usedInText) {
  const normalizedKey = String(key || '').trim().toLowerCase();
  const usedIn = String(usedInText || '').trim();
  const tabs = ['변수명 관리'].concat(variableTabMapByKey[normalizedKey] || []);

  if (usedIn) {
    if (/getgraduationreport|evaluaterequiredsessions/i.test(usedIn)) {
      tabs.push('수료 판정', '유고 처리');
    }
    if (/getschedulelist|schedulesave|suggestscheduleendtime|defaults/i.test(usedIn)) {
      tabs.push('일정 관리');
    }
    if (/collectsessionsfromsheet|markattendance|getattendancesession|getattendancestatus|getattendanceranking/i.test(usedIn)) {
      tabs.push('출석하기', '출석현황');
    }
  }

  return sortVariableTabsForDisplay(tabs);
}

function normalizeVariableItemMeta(item) {
  const normalized = Object.assign({}, item || {});
  const appliesToRaw = normalized.appliesTo !== undefined ? normalized.appliesTo : normalized.applies_to;
  const appliesWhenRaw = normalized.appliesWhen !== undefined ? normalized.appliesWhen : normalized.applies_when;
  const usedInRaw = normalized.usedIn !== undefined ? normalized.usedIn : normalized.used_in;
  const usedTabsRaw = Array.isArray(normalized.usedTabs)
    ? normalized.usedTabs
    : (Array.isArray(normalized.used_tabs) ? normalized.used_tabs : []);
  const usedTabsTextRaw = normalized.usedTabsText !== undefined
    ? normalized.usedTabsText
    : normalized.used_tabs_text;

  const appliesTo = String(appliesToRaw || '').trim();
  const appliesWhen = String(appliesWhenRaw || '').trim();
  const usedIn = String(usedInRaw || '').trim();
  const usedTabs = usedTabsRaw.length > 0
    ? sortVariableTabsForDisplay(usedTabsRaw)
    : mapVariableUsedTabs(normalized.key, usedIn);
  const usedTabsText = String(usedTabsTextRaw || '').trim() || usedTabs.join(', ');

  normalized.appliesTo = appliesTo;
  normalized.appliesWhen = appliesWhen;
  normalized.usedIn = usedIn;
  normalized.usedTabs = usedTabs;
  normalized.usedTabsText = usedTabsText;
  return normalized;
}

function getVariableUsedInText(item) {
  if (!item) return '미정(템플릿 복구 필요)';
  const text = String(item.usedTabsText || '').trim();
  if (text) return text;

  const tabs = Array.isArray(item.usedTabs) ? item.usedTabs : mapVariableUsedTabs(item.key, item.usedIn || '');
  if (!tabs || tabs.length === 0) return '미정(템플릿 복구 필요)';
  return tabs.join(', ');
}

function renderVariablesTable(items) {
  const wrap = document.getElementById('variablesTableWrap');
  if (!wrap) return;

  if (!items || items.length === 0) {
    wrap.innerHTML = '<p class="info-text">변수 데이터가 없습니다.</p>';
    return;
  }

  const rows = items.map((item, idx) => {
    const disabledAttr = item.editable ? '' : 'disabled';
    const valueText = item.value === null || item.value === undefined ? '' : String(item.value);
    const activeClass = idx === selectedVariableIndex ? 'active' : '';

    return `
      <tr class="variable-row ${activeClass}" onclick="selectVariableRow(${idx})">
        <td>${escapeHtml(item.key)}</td>
        <td>
          <input class="table-input" id="var-value-${idx}" data-key="${escapeHtml(item.key)}" data-type="${escapeHtml(item.type || 'string')}" data-description="${escapeHtml(item.description || '')}" ${disabledAttr} value="${escapeHtml(valueText)}" oninput="onVariableInputChanged(${idx}, event)">
        </td>
        <td>${escapeHtml(item.type || 'string')}</td>
        <td>${escapeHtml(item.description || '')}</td>
        <td>${escapeHtml(getFallbackVariableMetaText(item.appliesTo))}</td>
        <td>${escapeHtml(getFallbackVariableMetaText(item.appliesWhen))}</td>
        <td>${escapeHtml(getVariableUsedInText(item))}</td>
        <td>${item.editable ? 'Y' : 'N'}</td>
        <td>${escapeHtml(item.updatedAt || '')}</td>
      </tr>
    `;
  }).join('');

  wrap.innerHTML = `
    <table class="management-table">
      <thead>
        <tr>
          <th>key</th>
          <th>value</th>
          <th>type</th>
          <th>description</th>
          <th>적용 위치</th>
          <th>적용 시점</th>
          <th>실제 사용처</th>
          <th>editable</th>
          <th>updated_at</th>
        </tr>
      </thead>
      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
}

function getVariableInputValue(idx) {
  const input = document.getElementById(`var-value-${idx}`);
  return input ? input.value : '';
}

function getVariableValueByKey(key) {
  const index = variableItems.findIndex(item => item.key === key);
  if (index === -1) return '';
  return getVariableInputValue(index);
}

function renderVariableHelpPanel(item) {
  const panel = document.getElementById('variablesHelpPanel');
  if (!panel) return;

  if (!item) {
    panel.innerHTML = `
      <h4>변수를 선택하면 설명이 표시됩니다.</h4>
      <p class="help-muted">값을 바꾸기 전에 “이 값이 어디에 적용되는지”를 먼저 확인하세요.</p>
    `;
    return;
  }

  const value = getVariableInputValue(selectedVariableIndex);
  const hasTimePreview = ['attendance_open_offset_min', 'late_threshold_min', 'absence_threshold_min'].indexOf(item.key) !== -1;
  let previewHtml = '';

  if (hasTimePreview) {
    const openOffsetMin = Number(getVariableValueByKey('attendance_open_offset_min') || -30);
    const lateThresholdMin = Number(getVariableValueByKey('late_threshold_min') || 50);
    const absenceThresholdMin = Number(getVariableValueByKey('absence_threshold_min') || 180);
    const base = new Date('2026-01-01T19:00:00');
    const openTime = new Date(base.getTime() + openOffsetMin * 60 * 1000);
    const onTimeDeadline = new Date(base.getTime() + lateThresholdMin * 60 * 1000);
    const lateDeadline = new Date(base.getTime() + absenceThresholdMin * 60 * 1000);
    const hhmm = (d) => `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;

    previewHtml = `
      <p><strong>시간 미리보기 (기준 시작시각 19:00)</strong></p>
      <p>출석 오픈: ${hhmm(openTime)} / 정시 경계: ${hhmm(onTimeDeadline)} / 기본 마감: ${hhmm(lateDeadline)}</p>
    `;
  }

  panel.innerHTML = `
    <h4>${escapeHtml(item.labelKo || item.key)}</h4>
    <p><strong>현재 입력값:</strong> ${escapeHtml(value || '(빈값)')}</p>
    <p><strong>설정 주체:</strong> 운영자(관리자)</p>
    <p><strong>설정 위치:</strong> 관리자 페이지 &gt; 변수명 관리 탭</p>
    <p><strong>어떤 효과:</strong> ${escapeHtml(getFallbackVariableMetaText(item.appliesTo))}</p>
    <p><strong>언제 반영:</strong> ${escapeHtml(getFallbackVariableMetaText(item.appliesWhen))}</p>
    <p><strong>실제 사용처:</strong> ${escapeHtml(getVariableUsedInText(item))}</p>
    <p><strong>영향 범위:</strong> 저장 즉시 계산 기준이 갱신됩니다. 이미 확정된 과거 회차는 메타 스냅샷 기준을 유지합니다.</p>
    <p><strong>설명:</strong> ${escapeHtml(item.description || '-')}</p>
    <p><strong>공식:</strong> ${escapeHtml(item.formula || '-')}</p>
    <p><strong>예시:</strong> ${escapeHtml(item.example || '-')}</p>
    <p><strong>검증 규칙:</strong> ${escapeHtml(item.validationText || '-')}</p>
    ${previewHtml}
  `;
}

function selectVariableRow(index) {
  selectedVariableIndex = index;
  const rows = document.querySelectorAll('#variablesTableWrap .variable-row');
  rows.forEach((row, idx) => {
    row.classList.toggle('active', idx === index);
  });
  renderVariableHelpPanel(variableItems[index] || null);
}

function onVariableInputChanged(index) {
  if (selectedVariableIndex === index) {
    renderVariableHelpPanel(variableItems[index] || null);
  }
  if (variableItems[index] && variableItems[index].key === 'absence_threshold_min') {
    updateSchedulePreview();
  }
  if (variableItems[index] && variableItems[index].key === 'attendance_open_offset_min') {
    updateSchedulePreview();
  }
}

function validateVariableDraft(item, value) {
  const validation = item.validation || null;
  const text = String(value === undefined || value === null ? '' : value).trim();

  if (!validation || !validation.kind) return { valid: true };

  if (validation.kind === 'number') {
    if (text === '') {
      if (validation.allowEmpty) return { valid: true };
      return { valid: false, message: `${item.key}: 빈값을 허용하지 않습니다.` };
    }

    const n = Number(text);
    if (Number.isNaN(n)) {
      return { valid: false, message: `${item.key}: 숫자값을 입력하세요.` };
    }
    if (validation.min !== undefined && n < validation.min) {
      return { valid: false, message: `${item.key}: ${validation.min} 이상이어야 합니다.` };
    }
    if (validation.max !== undefined && n > validation.max) {
      return { valid: false, message: `${item.key}: ${validation.max} 이하여야 합니다.` };
    }
    return { valid: true };
  }

  if (validation.kind === 'hhmm') {
    if (!/^([01]\d|2[0-3]):([0-5]\d)$/.test(text)) {
      return { valid: false, message: `${item.key}: HH:mm 형식으로 입력하세요. (예: 19:00)` };
    }
    return { valid: true };
  }

  if (validation.kind === 'required_positions') {
    const list = text.split(',').map(v => v.trim().toLowerCase()).filter(v => !!v);
    if (!list.length || list.some(v => v !== 'first' && v !== 'last')) {
      return { valid: false, message: `${item.key}: first,last 조합만 허용됩니다.` };
    }
    return { valid: true };
  }

  return { valid: true };
}

async function maybeAutoNormalizeVariableSheet(response) {
  if (variableAutoNormalizedOnce) {
    return response;
  }

  const stats = response && response.stats ? response.stats : {};
  const duplicateRemovedCount = Number(stats.duplicateRemovedCount || 0);
  const invalidValueDroppedCount = Number(stats.invalidValueDroppedCount || 0);

  if (duplicateRemovedCount <= 0 && invalidValueDroppedCount <= 0) {
    return response;
  }

  variableAutoNormalizedOnce = true;

  const normalized = await CloudClubApi.call('variablesNormalize', {
    adminToken
  });

  if (!normalized.success) {
    showBoxMessage('variablesResult', `❌ ${escapeHtml(normalized.message || '변수 정규화 실패')}`, false);
    return response;
  }

  showBoxMessage(
    'variablesResult',
    `✅ 변수 시트 자동 정규화 완료 (중복 ${normalized.duplicateRemovedCount || 0}건, 무효값 ${normalized.invalidValueDroppedCount || 0}건)`,
    true
  );
  showToast('<i class="fas fa-check-circle"></i> 변수 시트 자동 정규화 완료', true);

  const refreshed = await CloudClubApi.call('variablesGet', {
    adminToken
  });
  return refreshed;
}

async function loadVariables() {
  try {
    const isCompatible = await ensureVariableApiCompatibility();
    if (!isCompatible) {
      return;
    }

    const rawResponse = await CloudClubApi.call('variablesGet', {
      adminToken
    });
    const response = await maybeAutoNormalizeVariableSheet(rawResponse);

    if (!response.success) {
      document.getElementById('variablesTableWrap').innerHTML = `<div class="error">${escapeHtml(response.message || '변수 조회 실패')}</div>`;
      return;
    }

    variableItems = (response.items || []).map(item => normalizeVariableItemMeta(item));
    variableConfig = response.config || {};
    selectedVariableIndex = variableItems.length > 0 ? 0 : -1;
    renderVariablesTable(variableItems);
    if (selectedVariableIndex >= 0) {
      selectVariableRow(selectedVariableIndex);
    } else {
      renderVariableHelpPanel(null);
    }
    updateSchedulePreview();
  } catch (error) {
    if (handleUnauthorizedError(error)) return;
    if (error && error.code === 'UNSUPPORTED_ACTION') {
      setVariableTabBlocked(
        true,
        '변수 API 일부가 구버전입니다. Apps Script 재배포 후 GitHub Pages를 다시 배포하세요.',
        variableApiInfo || {}
      );
      return;
    }
    document.getElementById('variablesTableWrap').innerHTML = `<div class="error">${escapeHtml(getDisplayErrorMessage(error, '변수 조회 중 오류'))}</div>`;
  }
}

async function saveVariables() {
  if (variableTabBlocked) {
    alert('백엔드 구버전으로 변수 저장이 차단되었습니다. Apps Script와 GitHub Pages를 재배포하세요.');
    return;
  }

  if (!variableItems || variableItems.length === 0) {
    alert('저장할 변수 데이터가 없습니다.');
    return;
  }

  try {
    const payload = [];
    variableItems.forEach((item, idx) => {
      if (item.editable === false) return;
      const input = document.getElementById(`var-value-${idx}`);
      const value = input ? input.value : item.value;

      const validation = validateVariableDraft(item, value);
      if (!validation.valid) {
        throw new Error(validation.message || `${item.key} 값이 올바르지 않습니다.`);
      }

      payload.push({
        key: item.key,
        value
      });
    });

    const response = await CloudClubApi.call('variablesUpdate', {
      adminToken,
      itemsJson: JSON.stringify(payload)
    });

    if (!response.success) {
      showBoxMessage('variablesResult', `❌ ${escapeHtml(response.message || '변수 저장 실패')}`, false);
      return;
    }

    showBoxMessage('variablesResult', '✅ 변수 저장 완료', true);
    showToast('<i class="fas fa-check-circle"></i> 변수 저장 완료', true);

    await Promise.all([
      loadVariables(),
      checkAttendanceSession(),
      loadGraduationReport()
    ]);
  } catch (error) {
    if (handleUnauthorizedError(error)) return;
    showBoxMessage('variablesResult', `❌ ${escapeHtml(getDisplayErrorMessage(error, '변수 저장 중 오류'))}`, false);
  }
}

async function resetVariablesTemplate(mode) {
  if (variableTabBlocked) {
    alert('백엔드 구버전으로 템플릿 복구가 차단되었습니다. Apps Script와 GitHub Pages를 재배포하세요.');
    return;
  }

  const resetMode = mode === 'reset' ? 'reset' : 'preserve';
  const confirmMessage = resetMode === 'reset'
    ? '정말 변수 템플릿을 완전 초기화할까요? 현재 value 값이 기본값으로 바뀝니다.'
    : '변수 템플릿 메타(설명/적용 위치/사용처)를 표준값으로 복구할까요? value는 유지됩니다.';
  if (!confirm(confirmMessage)) return;

  try {
    const response = await CloudClubApi.call('variablesResetTemplate', {
      adminToken,
      mode: resetMode
    });

    if (!response.success) {
      showBoxMessage('variablesResult', `❌ ${escapeHtml(response.message || '변수 템플릿 복구 실패')}`, false);
      return;
    }

    showBoxMessage('variablesResult', `✅ ${escapeHtml(response.message || '변수 템플릿 복구 완료')}`, true);
    showToast('<i class="fas fa-check-circle"></i> 변수 템플릿 반영 완료', true);

    await Promise.all([
      loadVariables(),
      checkAttendanceSession(),
      loadGraduationReport()
    ]);
  } catch (error) {
    if (handleUnauthorizedError(error)) return;
    showBoxMessage('variablesResult', `❌ ${escapeHtml(getDisplayErrorMessage(error, '변수 템플릿 복구 중 오류'))}`, false);
  }
}
