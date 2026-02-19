(function () {
  'use strict';

  var LATEST_SEASON_STORAGE_KEY = 'cloudclub.latestSeasonAlias';
  var DEFAULT_STUDENT_PATH = './student/';

  function parseSeasonNo(alias) {
    var match = String(alias || '').trim().toLowerCase().match(/^season_(\d{1,2})$/);
    if (!match) return NaN;
    return parseInt(match[1], 10);
  }

  function normalizeSeasonAlias(value) {
    var raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';

    var seasonMatch = raw.match(/^season[_-]?(\d{1,2})$/);
    if (seasonMatch) {
      return 'season_' + seasonMatch[1].padStart(2, '0');
    }

    var onlyNumber = raw.match(/^(\d{1,2})$/);
    if (onlyNumber) {
      return 'season_' + onlyNumber[1].padStart(2, '0');
    }
    return '';
  }

  function pickLatestSeasonAlias(sheets) {
    var list = Array.isArray(sheets) ? sheets : [];
    var bestAlias = '';
    var bestNo = -1;

    list.forEach(function (item) {
      var alias = normalizeSeasonAlias(item && item.alias);
      var seasonNo = parseSeasonNo(alias);
      if (!isNaN(seasonNo) && seasonNo > bestNo) {
        bestNo = seasonNo;
        bestAlias = alias;
      }
    });

    if (bestAlias) return bestAlias;

    var active = list.find(function (item) {
      return item && item.isActive && normalizeSeasonAlias(item.alias);
    });

    return active ? normalizeSeasonAlias(active.alias) : '';
  }

  function readCachedLatestSeason() {
    try {
      return normalizeSeasonAlias(window.localStorage.getItem(LATEST_SEASON_STORAGE_KEY));
    } catch (error) {
      return '';
    }
  }

  function writeCachedLatestSeason(alias) {
    var normalized = normalizeSeasonAlias(alias);
    if (!normalized) return;

    try {
      window.localStorage.setItem(LATEST_SEASON_STORAGE_KEY, normalized);
    } catch (error) {
      // Ignore write failures in private mode or restricted storage environments.
    }
  }

  function buildStudentUrl(alias) {
    var normalized = normalizeSeasonAlias(alias);
    if (!normalized) return DEFAULT_STUDENT_PATH;
    return DEFAULT_STUDENT_PATH + '?season=' + encodeURIComponent(normalized);
  }

  function setStatus(message, isError) {
    var statusEl = document.getElementById('latestSeasonStatus');
    if (!statusEl) return;

    statusEl.textContent = String(message || '').trim();
    statusEl.classList.toggle('is-error', !!isError);
  }

  function updateSeasonBadge(alias) {
    var normalized = normalizeSeasonAlias(alias);
    var badge = document.getElementById('latestSeasonBadge');
    var label = document.getElementById('latestSeasonLabel');
    if (!badge || !label) return;

    if (!normalized) {
      badge.hidden = true;
      label.textContent = 'season_--';
      return;
    }

    badge.hidden = false;
    label.textContent = normalized;
  }

  function updateStudentLink(alias) {
    var link = document.getElementById('studentLink');
    if (!link) return;

    var normalized = normalizeSeasonAlias(alias);
    link.href = buildStudentUrl(normalized);

    if (normalized) {
      link.dataset.season = normalized;
      link.setAttribute('aria-label', normalized + ' 시즌 출석 페이지로 이동');
      return;
    }

    delete link.dataset.season;
    link.setAttribute('aria-label', '출석 페이지로 이동');
  }

  function applyLatestSeason(alias, sourceLabel) {
    var normalized = normalizeSeasonAlias(alias);
    updateStudentLink(normalized);
    updateSeasonBadge(normalized);

    if (!normalized) {
      setStatus('최신 시즌을 확인하지 못했습니다. 기본 출석 페이지로 이동합니다.', true);
      return;
    }

    if (sourceLabel === 'cache') {
      setStatus('최근 확인된 ' + normalized + ' 기준으로 먼저 연결합니다. 최신 정보를 확인 중입니다.', false);
      return;
    }

    setStatus('최신 시즌 ' + normalized + '로 출석하기 이동 준비가 완료되었습니다.', false);
  }

  async function fetchLatestSeasonAlias() {
    if (!window.CloudClubApi || typeof window.CloudClubApi.call !== 'function') {
      throw new Error('CloudClubApi를 사용할 수 없습니다.');
    }

    var sheets = await window.CloudClubApi.call('sheets');
    var latest = pickLatestSeasonAlias(sheets);

    if (!latest) {
      throw new Error('시즌 시트가 없어 최신 시즌을 결정할 수 없습니다.');
    }

    return latest;
  }

  async function initializeLandingLinks() {
    var cached = readCachedLatestSeason();
    if (cached) {
      applyLatestSeason(cached, 'cache');
    } else {
      setStatus('최신 시즌 확인 중...', false);
    }

    try {
      var latest = await fetchLatestSeasonAlias();
      writeCachedLatestSeason(latest);
      applyLatestSeason(latest, 'api');
    } catch (error) {
      if (!cached) {
        updateStudentLink('');
        updateSeasonBadge('');
        setStatus('최신 시즌 조회에 실패했습니다. 기본 출석 페이지로 이동합니다.', true);
      }
      console.warn('최신 시즌 조회 실패:', error);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeLandingLinks);
  } else {
    initializeLandingLinks();
  }
})();
