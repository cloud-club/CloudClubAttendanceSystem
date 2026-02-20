function parseSessionHeader(headerValue) {
  if (typeof headerValue !== 'string') return null;
  const text = headerValue.trim();
  if (!text) return null;

  const parts = text.match(SESSION_HEADER_REGEX);
  if (!parts) return null;

  const year = parseInt(parts[1], 10);
  const month = parseInt(parts[2], 10) - 1;
  const day = parseInt(parts[3], 10);
  const hour = parseInt(parts[4], 10);
  const minute = parseInt(parts[5], 10);

  const startTime = new Date(year, month, day, hour, minute, 0, 0);
  if (isNaN(startTime.getTime())) return null;

  let explicitEndAt = '';
  let explicitEndTime = null;
  if (parts[6] && parts[7]) {
    explicitEndAt = `${parts[6]}:${parts[7]}`;
    explicitEndTime = new Date(year, month, day, parseInt(parts[6], 10), parseInt(parts[7], 10), 0, 0);
    if (explicitEndTime.getTime() < startTime.getTime()) {
      explicitEndTime = new Date(explicitEndTime.getTime() + 24 * 60 * 60 * 1000);
    }
  }

  return {
    header: text,
    sessionKey: formatSessionKey(startTime),
    startTime: startTime,
    explicitEndAt: explicitEndAt,
    explicitEndTime: explicitEndTime
  };
}

function formatSessionKey(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd-HH:mm');
}

function formatDateTime(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
}

function formatDateTimeMinute(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
}

function formatDateKey(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

function formatTimeHhmm(date) {
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'HH:mm');
}

function formatSignedOffset(seconds) {
  if (seconds === null || seconds === undefined || isNaN(Number(seconds))) {
    return '미출석';
  }

  const value = Number(seconds);
  const sign = value < 0 ? '-' : '+';
  const abs = Math.abs(Math.round(value));
  const mm = Math.floor(abs / 60);
  const ss = abs % 60;

  return `${sign}${String(mm).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
}

function parseTimeOnDate(date, hhmm) {
  if (!hhmm) return null;
  const match = String(hhmm).trim().match(/^(\d{2}):(\d{2})$/);
  if (!match) return null;

  const d = new Date(
    date.getFullYear(),
    date.getMonth(),
    date.getDate(),
    parseInt(match[1], 10),
    parseInt(match[2], 10),
    0,
    0
  );

  if (d.getTime() < date.getTime()) {
    return new Date(d.getTime() + 24 * 60 * 60 * 1000);
  }

  return d;
}

function parseDateTimeInput(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;

  const normalized = raw.replace(' ', 'T');
  const direct = new Date(normalized);
  if (!isNaN(direct.getTime())) {
    return direct;
  }

  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})$/);
  if (!match) return null;

  return new Date(
    parseInt(match[1], 10),
    parseInt(match[2], 10) - 1,
    parseInt(match[3], 10),
    parseInt(match[4], 10),
    parseInt(match[5], 10),
    0,
    0
  );
}

