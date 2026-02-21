function renderAdminQrLoadError(message) {
  const qrContainer = document.getElementById('qrcode');
  if (!qrContainer) return;
  qrContainer.classList.remove('blurred');
  qrContainer.innerHTML = `<div class="error" style="margin: 12px;">${escapeHtml(message)}</div>`;
}

async function ensureQrCodeDependency() {
  await ensureRuntimeDeps(['qrcode']);
}

async function fetchSheetLink(alias, options) {
  const seasonAlias = String(alias || '').trim();
  if (!seasonAlias) return null;
  const opts = options || {};
  const cache = getFrontCache();
  const cacheKey = buildFrontCacheKey('sheetLink', seasonAlias);
  if (!cache) {
    return CloudClubApi.call('sheetLink', {
      season: seasonAlias,
      adminToken: adminToken
    });
  }
  return cache.remember(
    cacheKey,
    FRONT_CACHE_TTL_SHEET_LINK_MS,
    () => CloudClubApi.call('sheetLink', {
      season: seasonAlias,
      adminToken: adminToken
    }),
    { force: !!opts.forceReload }
  );
}

async function loadAdminQrCode(options) {
  const opts = options || {};
  try {
    await ensureQrCodeDependency();
    const cache = getFrontCache();
    const response = cache
      ? await cache.remember(
        'adminUrl',
        FRONT_CACHE_TTL_ADMIN_URL_MS,
        () => CloudClubApi.call('adminUrl', {
          adminToken: adminToken
        }),
        { force: !!opts.forceReload }
      )
      : await CloudClubApi.call('adminUrl', {
        adminToken: adminToken
      });
    if (!response || response.success === false || !response.url) {
      renderAdminQrLoadError((response && response.message) ? response.message : '관리자 URL을 불러오지 못했습니다.');
      return;
    }
    createQrCode(response.url);
    adminQrCodeLoaded = true;
  } catch (error) {
    if (handleUnauthorizedError(error)) return;
    renderAdminQrLoadError(getDisplayErrorMessage(error, '관리자 URL을 불러오지 못했습니다.'));
    console.error('관리자 URL 로드 실패:', error);
  }
}

async function loadSheetLinkInfo() {
  const alias = getSelectedSeasonAlias();
  if (!alias) return;

  try {
    const response = await fetchSheetLink(alias);

    const info = document.getElementById('sheetLinkInfo');
    if (!info) return;

    if (!response.success) {
      info.textContent = response.message || '시트 링크를 불러오지 못했습니다.';
      return;
    }

    info.textContent = `현재 시즌: ${response.seasonAlias} (${response.sheetName})`;
  } catch (error) {
    if (handleUnauthorizedError(error)) return;
    console.error('시트 링크 정보 조회 실패:', error);
  }
}

async function openCurrentSheet() {
  const alias = getSelectedSeasonAlias();
  if (!alias) {
    alert('먼저 시즌 시트를 선택해주세요.');
    return;
  }

  try {
    const response = await fetchSheetLink(alias);

    if (!response.success || !response.sheetUrl) {
      alert(response.message || '시트 링크를 열 수 없습니다.');
      return;
    }

    window.open(response.sheetUrl, '_blank', 'noopener,noreferrer');
  } catch (error) {
    if (handleUnauthorizedError(error)) return;
    alert(getDisplayErrorMessage(error, '시트 링크를 여는 중 오류가 발생했습니다.'));
  }
}

async function generateSeasonQRCode() {
  try {
    await ensureQrCodeDependency();
    const response = await CloudClubApi.call('studentUrl', {
      adminToken: adminToken
    });
    handleSeasonQRCode(response.url);
  } catch (error) {
    handleSeasonQRCodeError(error);
  }
}

function handleSeasonQRCode(studentUrl) {
  currentSeasonUrl = studentUrl;

  const qrContainer = document.getElementById('seasonQrcode');
  qrContainer.innerHTML = '';

  const overlay = document.createElement('div');
  overlay.className = 'qr-overlay';
  overlay.innerHTML = '<span><i class="fas fa-eye"></i> 클릭하여 QR코드 보기</span>';
  qrContainer.appendChild(overlay);

  new QRCode(qrContainer, {
    text: studentUrl,
    width: 300,
    height: 300
  });

  qrContainer.onclick = () => toggleQRBlur('seasonQrcode');
  qrContainer.classList.add('blurred');
  qrContainer.style.display = 'flex';

  document.getElementById('urlText').textContent = studentUrl;
  document.getElementById('studentUrl').style.display = 'block';

  showToast('<i class="fas fa-check-circle"></i> 학생용 QR코드가 생성되었습니다!', true);
}

function handleSeasonQRCodeError(error) {
  if (handleUnauthorizedError(error)) return;
  alert('QR코드 생성 중 오류가 발생했습니다: ' + getDisplayErrorMessage(error, '알 수 없는 오류'));
}

function copyUrl() {
  if (!currentSeasonUrl) {
    alert('복사할 URL이 없습니다.');
    return;
  }

  navigator.clipboard.writeText(currentSeasonUrl).then(() => {
    const copyBtn = document.querySelector('.copy-btn');
    const originalText = copyBtn.innerHTML;
    copyBtn.innerHTML = '<i class="fas fa-check"></i> 복사됨!';
    copyBtn.style.background = 'rgba(34, 197, 94, 0.2)';
    copyBtn.style.borderColor = 'rgba(34, 197, 94, 0.3)';
    copyBtn.style.color = '#4ade80';

    setTimeout(() => {
      copyBtn.innerHTML = originalText;
      copyBtn.style.background = 'rgba(59, 130, 246, 0.2)';
      copyBtn.style.borderColor = 'rgba(59, 130, 246, 0.3)';
      copyBtn.style.color = '#60a5fa';
    }, 1800);
  }).catch(() => {
    alert('URL 복사에 실패했습니다.');
  });
}

function createQrCode(url) {
  if (typeof QRCode === 'undefined') {
    throw new Error('QRCode 라이브러리를 불러오지 못했습니다.');
  }
  const qrContainer = document.getElementById('qrcode');
  const existingQR = qrContainer.querySelector('canvas, img');
  if (existingQR) {
    existingQR.remove();
  }

  new QRCode(qrContainer, { text: url, width: 300, height: 300 });
  qrContainer.classList.add('blurred');
}

function toggleQRBlur(qrId) {
  const qrContainer = document.getElementById(qrId);
  const overlay = qrContainer.querySelector('.qr-overlay span');

  if (qrContainer.classList.contains('blurred')) {
    qrContainer.classList.remove('blurred');
    if (overlay) {
      overlay.innerHTML = '<i class="fas fa-eye-slash"></i> 클릭하여 QR코드 숨기기';
    }
  } else {
    qrContainer.classList.add('blurred');
    if (overlay) {
      overlay.innerHTML = '<i class="fas fa-eye"></i> 클릭하여 QR코드 보기';
    }
  }
}
