function normalizeSeasonAlias(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';

  const seasonMatch = value.match(/^season_(\d{2})$/i);
  if (seasonMatch) {
    return `season_${seasonMatch[1]}`;
  }

  const legacy = value.match(/^(\d{1,2})$/);
  if (legacy) {
    return `season_${String(parseInt(legacy[1], 10)).padStart(2, '0')}`;
  }

  return '';
}

function debounce(fn, waitMs) {
  let timerId = null;
  const delay = Math.max(0, Number(waitMs || 0));
  return function debounced(...args) {
    if (timerId) {
      clearTimeout(timerId);
    }
    timerId = setTimeout(() => {
      timerId = null;
      fn.apply(this, args);
    }, delay);
  };
}

function getDisplayErrorMessage(error, fallbackMessage) {
  if (error && error.code === 'NETWORK_ERROR') {
    return 'API 서버 응답 스크립트를 불러오지 못했습니다. (리다이렉트/ORB 가능성) 잠시 후 다시 시도해주세요.';
  }

  if (error && error.code === 'AUTH_SERVER_SCOPE_MISSING') {
    return '관리자 인증 서버 권한(script.external_request)이 누락되었습니다. Apps Script 배포 소유자 계정으로 UrlFetchApp 권한 승인을 완료한 뒤, Deploy > Manage deployments > Edit > Deploy로 동일 배포를 재배포해주세요.';
  }

  if (error && error.code === 'AUTH_ADMIN_NOT_REGISTERED') {
    return 'Google 로그인은 성공했지만 관리자 권한이 등록되지 않은 계정입니다.';
  }

  if (error && error.code === 'AUTH_ADMIN_INACTIVE') {
    return 'Google 로그인은 성공했지만 비활성화된 관리자 계정입니다. 운영진에게 활성화 상태를 확인해주세요.';
  }

  if (error && error.code === 'AUTH_ADMIN_CONFIG_INVALID') {
    return '관리자 계정 설정이 올바르지 않습니다. (_admins의 role/season 설정 확인 필요)';
  }

  if (error && error.code === 'AUTH_CLIENT_ID_NOT_CONFIGURED') {
    return 'GOOGLE_OAUTH_CLIENT_ID가 설정되지 않았습니다. Apps Script Script Properties를 확인해주세요.';
  }

  if (error && error.code === 'AUTH_CLIENT_ID_MISMATCH') {
    return 'Google OAuth Client ID가 서버 설정과 일치하지 않습니다. 운영 Client ID 구성을 확인해주세요.';
  }

  if (error && error.code === 'AUTH_EMAIL_DOMAIN_NOT_ALLOWED') {
    return '허용된 Gmail 계정(@gmail.com / @googlemail.com)으로만 로그인할 수 있습니다.';
  }

  if (error && error.code === 'AUTH_EMAIL_NOT_VERIFIED') {
    return '이메일 인증이 완료된 Google 계정으로 로그인해야 합니다.';
  }

  if (error && error.code === 'AUTH_ID_TOKEN_EXPIRED') {
    return 'Google 로그인 토큰이 만료되었습니다. 다시 로그인해주세요.';
  }

  return (error && error.message) ? error.message : fallbackMessage;
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDateTimeFromMs(ms) {
  if (!ms) return '-';
  const date = new Date(Number(ms));
  if (isNaN(date.getTime())) return '-';

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');

  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function formatDatetimeLocal(ms) {
  const date = new Date(Number(ms));
  if (isNaN(date.getTime())) return '';

  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');

  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

function getDateKeyFromDate(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) return '';
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function getDateKeyFromMs(ms) {
  const date = new Date(Number(ms));
  if (isNaN(date.getTime())) return '';
  return getDateKeyFromDate(date);
}

function parseDateKeyToDate(dateKey) {
  const match = String(dateKey || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(
    parseInt(match[1], 10),
    parseInt(match[2], 10) - 1,
    parseInt(match[3], 10),
    0,
    0,
    0,
    0
  );
}

function formatMonthTitle(year, month) {
  return `${year}년 ${month + 1}월`;
}

function formatDateKeyLabel(dateKey) {
  const date = parseDateKeyToDate(dateKey);
  if (!date) return dateKey;
  const weekdays = ['일', '월', '화', '수', '목', '금', '토'];
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')} (${weekdays[date.getDay()]})`;
}

function formatHhmmFromMs(ms) {
  const date = new Date(Number(ms));
  if (isNaN(date.getTime())) return '';
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function getConfiguredApiBaseUrl() {
  const cfg = window.CLOUDCLUB_CONFIG || {};
  return String(cfg.API_BASE_URL || '').trim();
}

function maskApiBaseUrl(url) {
  const raw = String(url || '').trim();
  if (!raw) return '-';

  try {
    const parsed = new URL(raw, window.location.href);
    const match = parsed.pathname.match(/\/macros\/s\/([^/]+)\/exec/i);
    if (!match) {
      return `${parsed.origin}${parsed.pathname}`;
    }

    const token = match[1];
    const maskedToken = token.length > 14
      ? `${token.slice(0, 8)}...${token.slice(-6)}`
      : `${token.slice(0, 4)}...${token.slice(-2)}`;

    return `${parsed.origin}/macros/s/${maskedToken}/exec`;
  } catch (error) {
    return '[invalid-url]';
  }
}

function showBoxMessage(targetId, message, success) {
  const node = document.getElementById(targetId);
  if (!node) return;

  node.className = success ? 'success' : 'error';
  node.innerHTML = message;
  node.style.display = 'block';

  setTimeout(() => {
    node.style.display = 'none';
  }, 5000);
}

function showToast(message, success) {
  const node = document.createElement('div');
  node.className = success ? 'success' : 'error';
  node.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 9999; padding: 14px 18px; border-radius: 10px; max-width: 360px;';
  node.innerHTML = message;
  document.body.appendChild(node);

  setTimeout(() => {
    node.remove();
  }, 3000);
}

function createConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const particles = [];
  const colors = ['#60a5fa', '#3b82f6', '#93bbfc', '#dbeafe', '#fbbf24', '#f59e0b', '#a78bfa', '#e9d5ff'];

  for (let i = 0; i < 120; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      vx: Math.random() * 3 - 1.5,
      vy: Math.random() * 3 + 2,
      color: colors[Math.floor(Math.random() * colors.length)],
      size: Math.random() * 8 + 4,
      angle: Math.random() * 360,
      angleV: Math.random() * 6 - 3
    });
  }

  let animationId;

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    particles.forEach((p, index) => {
      p.x += p.vx;
      p.y += p.vy;
      p.angle += p.angleV;
      p.vy += 0.1;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle * Math.PI / 180);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.restore();

      if (p.y > canvas.height) {
        particles.splice(index, 1);
      }
    });

    if (particles.length > 0) {
      animationId = requestAnimationFrame(animate);
    } else {
      canvas.style.display = 'none';
    }
  }

  canvas.style.display = 'block';
  animate();

  setTimeout(() => {
    cancelAnimationFrame(animationId);
    canvas.style.display = 'none';
  }, 3500);
}
