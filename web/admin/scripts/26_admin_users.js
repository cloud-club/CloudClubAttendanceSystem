function handleAdminRoleChange() {
  const roleSelect = document.getElementById('adminUserRoleSelect');
  const seasonInput = document.getElementById('adminUserSeasonInput');
  if (!roleSelect || !seasonInput) return;
  const role = String(roleSelect.value || '').trim().toLowerCase();
  const seasonRequired = role !== ADMIN_ROLE_SUPER;
  seasonInput.required = seasonRequired;
  seasonInput.disabled = !seasonRequired;
  if (!seasonRequired) {
    seasonInput.value = '';
  }
}

function resetAdminUserForm() {
  adminUsersEditingEmail = '';
  const emailInput = document.getElementById('adminUserEmailInput');
  const nameInput = document.getElementById('adminUserNameInput');
  const seasonInput = document.getElementById('adminUserSeasonInput');
  const phoneInput = document.getElementById('adminUserPhoneInput');
  const roleSelect = document.getElementById('adminUserRoleSelect');
  const activeInput = document.getElementById('adminUserIsActiveInput');

  if (emailInput) {
    emailInput.value = '';
    emailInput.readOnly = false;
  }
  if (nameInput) nameInput.value = '';
  if (seasonInput) seasonInput.value = '';
  if (phoneInput) phoneInput.value = '';
  if (roleSelect) roleSelect.value = ADMIN_ROLE_SEASON_ADMIN;
  if (activeInput) activeInput.checked = true;
  handleAdminRoleChange();
}

function getAdminSeasonText(item) {
  if (!item) return '-';
  if (String(item.role || '').toLowerCase() === ADMIN_ROLE_SUPER) return 'all';
  const alias = String(item.seasonAlias || '').trim();
  if (alias) return alias;
  const seasonNo = Number(item.season);
  if (!isNaN(seasonNo) && seasonNo > 0) {
    return `season_${String(seasonNo).padStart(2, '0')}`;
  }
  return '-';
}

function renderAdminUsers(items) {
  const wrap = document.getElementById('adminUsersTableWrap');
  if (!wrap) return;

  if (!Array.isArray(items) || items.length === 0) {
    wrap.innerHTML = '<div class="info-text">등록된 관리자 계정이 없습니다.</div>';
    return;
  }

  const rows = items.map(item => {
    const email = String(item.email || '').trim();
    const role = String(item.role || '').trim() || ADMIN_ROLE_SEASON_ADMIN;
    const activeClass = item.isActive === false ? 'inactive' : 'active';
    const activeLabel = item.isActive === false ? 'inactive' : 'active';
    const isFixedSuper = !!item.isSuperFixed;

    const editButton = isFixedSuper
      ? '<span class="admin-users-role-chip super">고정 정책</span>'
      : `<button type="button" class="btn btn-secondary" onclick="editAdminUser('${encodeURIComponent(email)}')"><i class="fas fa-pen"></i><span>수정</span></button>`;
    const deleteButton = isFixedSuper
      ? ''
      : `<button type="button" class="btn btn-secondary" onclick="deleteAdminUser('${encodeURIComponent(email)}')"><i class="fas fa-trash"></i><span>삭제</span></button>`;

    return `
      <tr>
        <td>${escapeHtml(item.name || '-')}</td>
        <td>${escapeHtml(email)}</td>
        <td>${escapeHtml(getAdminSeasonText(item))}</td>
        <td>${escapeHtml(item.phone || '-')}</td>
        <td><span class="admin-users-role-chip ${escapeHtml(role)}">${escapeHtml(role)}</span></td>
        <td><span class="admin-users-active-chip ${activeClass}">${activeLabel}</span></td>
        <td>
          <div class="admin-users-row-actions">
            ${editButton}
            ${deleteButton}
          </div>
        </td>
      </tr>
    `;
  }).join('');

  wrap.innerHTML = `
    <table class="management-table">
      <thead>
        <tr>
          <th>이름</th>
          <th>이메일</th>
          <th>시즌</th>
          <th>전화번호</th>
          <th>role</th>
          <th>active</th>
          <th>동작</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}

async function loadAdminUsers(options) {
  const opts = options || {};
  if (!isSuperAdmin()) return;

  const cache = getFrontCache();
  const cacheKey = 'adminUsers:list';
  if (!opts.forceReload && cache) {
    const cached = cache.get(cacheKey);
    if (Array.isArray(cached && cached.items)) {
      adminUsersCache = cached.items;
      renderAdminUsers(cached.items);
      return;
    }
  }

  const wrap = document.getElementById('adminUsersTableWrap');
  if (wrap) {
    wrap.innerHTML = '<div class="loader" style="margin: 24px auto;"></div>';
  }

  try {
    const response = cache
      ? await cache.remember(
        cacheKey,
        FRONT_CACHE_TTL_ADMIN_USERS_MS,
        () => CloudClubApi.call('adminUsersList', {
          adminToken: adminToken
        }),
        { force: !!opts.forceReload }
      )
      : await CloudClubApi.call('adminUsersList', {
        adminToken: adminToken
      });

    const items = Array.isArray(response && response.items) ? response.items : [];
    adminUsersCache = items;
    renderAdminUsers(items);
  } catch (error) {
    if (handleUnauthorizedError(error)) return;
    if (wrap) {
      wrap.innerHTML = `<div class="error">${escapeHtml(getDisplayErrorMessage(error, '관리자 목록 조회 중 오류가 발생했습니다.'))}</div>`;
    }
  }
}

function editAdminUser(encodedEmail) {
  if (!isSuperAdmin()) return;
  const email = decodeURIComponent(String(encodedEmail || '')).trim().toLowerCase();
  const found = adminUsersCache.find(item => String(item.email || '').trim().toLowerCase() === email);
  if (!found) {
    alert('수정할 관리자 정보를 찾을 수 없습니다.');
    return;
  }

  if (found.isSuperFixed) {
    alert('고정 Super Admin은 수정할 수 없습니다.');
    return;
  }

  adminUsersEditingEmail = email;
  const emailInput = document.getElementById('adminUserEmailInput');
  const nameInput = document.getElementById('adminUserNameInput');
  const seasonInput = document.getElementById('adminUserSeasonInput');
  const phoneInput = document.getElementById('adminUserPhoneInput');
  const roleSelect = document.getElementById('adminUserRoleSelect');
  const activeInput = document.getElementById('adminUserIsActiveInput');

  if (emailInput) {
    emailInput.value = found.email || '';
    emailInput.readOnly = true;
  }
  if (nameInput) nameInput.value = found.name || '';
  if (seasonInput) seasonInput.value = getAdminSeasonText(found) === 'all' ? '' : getAdminSeasonText(found);
  if (phoneInput) phoneInput.value = found.phone || '';
  if (roleSelect) roleSelect.value = found.role || ADMIN_ROLE_SEASON_ADMIN;
  if (activeInput) activeInput.checked = found.isActive !== false;
  handleAdminRoleChange();

  const result = document.getElementById('adminUsersResult');
  if (result) {
    result.className = 'success';
    result.style.display = 'block';
    result.textContent = `${found.email} 항목을 수정 중입니다. 저장 버튼으로 반영하세요.`;
  }
}

async function saveAdminUser(event) {
  if (event) event.preventDefault();
  if (!isSuperAdmin()) {
    alert('Super Admin 권한에서만 관리자 변경이 가능합니다.');
    return;
  }

  const emailInput = document.getElementById('adminUserEmailInput');
  const nameInput = document.getElementById('adminUserNameInput');
  const seasonInput = document.getElementById('adminUserSeasonInput');
  const phoneInput = document.getElementById('adminUserPhoneInput');
  const roleSelect = document.getElementById('adminUserRoleSelect');
  const activeInput = document.getElementById('adminUserIsActiveInput');

  const email = String(emailInput && emailInput.value || '').trim().toLowerCase();
  const role = String(roleSelect && roleSelect.value || ADMIN_ROLE_SEASON_ADMIN).trim().toLowerCase();
  const seasonText = String(seasonInput && seasonInput.value || '').trim();
  if (!email) {
    alert('관리자 이메일을 입력해주세요.');
    return;
  }
  if (role !== ADMIN_ROLE_SUPER && !seasonText) {
    alert('season_admin은 시즌 값을 입력해야 합니다.');
    return;
  }

  const payload = {
    adminToken: adminToken,
    email: email,
    name: String(nameInput && nameInput.value || '').trim(),
    season: role === ADMIN_ROLE_SUPER ? '' : seasonText,
    phone: String(phoneInput && phoneInput.value || '').trim(),
    role: role,
    isActive: activeInput && activeInput.checked ? 'true' : 'false'
  };

  try {
    const response = await CloudClubApi.call('adminUsersUpsert', payload);
    const successMessage = (response && response.message) ? response.message : '관리자 정보가 저장되었습니다.';
    showBoxMessage('adminUsersResult', `✅ ${escapeHtml(successMessage)}`, true);
    invalidateAdminUsersCache();
    await loadAdminUsers({ forceReload: true });
    resetAdminUserForm();
  } catch (error) {
    if (handleUnauthorizedError(error)) return;
    showBoxMessage('adminUsersResult', `❌ ${escapeHtml(getDisplayErrorMessage(error, '관리자 저장 중 오류가 발생했습니다.'))}`, false);
  }
}

async function deleteAdminUser(encodedEmail) {
  if (!isSuperAdmin()) {
    alert('Super Admin 권한에서만 삭제할 수 있습니다.');
    return;
  }

  const email = decodeURIComponent(String(encodedEmail || '')).trim().toLowerCase();
  if (!email) return;
  if (!window.confirm(`${email} 계정을 관리자 목록에서 삭제하시겠습니까?`)) {
    return;
  }

  try {
    const response = await CloudClubApi.call('adminUsersDelete', {
      adminToken: adminToken,
      email: email
    });
    if (!response || !response.success) {
      alert((response && response.message) || '관리자 삭제에 실패했습니다.');
      return;
    }

    showToast('<i class="fas fa-check-circle"></i> 관리자 계정이 삭제되었습니다.', true);
    invalidateAdminUsersCache();
    await loadAdminUsers({ forceReload: true });
    if (adminUsersEditingEmail === email) {
      resetAdminUserForm();
    }
  } catch (error) {
    if (handleUnauthorizedError(error)) return;
    alert(getDisplayErrorMessage(error, '관리자 삭제 중 오류가 발생했습니다.'));
  }
}
