function renderAdminQrLoadError(message) {
  const qrContainer = document.getElementById('qrcode');
  if (!qrContainer) return;
  qrContainer.classList.remove('blurred');
  qrContainer.innerHTML = `<div class="error" style="margin: 12px;">${escapeHtml(message)}</div>`;
}

async function loadAdminQrCode() {
  try {
    const response = await CloudClubApi.call('adminUrl', {
      adminToken: adminToken
    });
    if (!response || response.success === false || !response.url) {
      renderAdminQrLoadError((response && response.message) ? response.message : '관리자 URL을 불러오지 못했습니다.');
      return;
    }
    createQrCode(response.url);
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
    const response = await CloudClubApi.call('sheetLink', {
      season: alias,
      adminToken: adminToken
    });

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
    const response = await CloudClubApi.call('sheetLink', {
      season: alias,
      adminToken: adminToken
    });

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
