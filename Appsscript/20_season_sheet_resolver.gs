function getLegacySeasonName(alias) {
  const m = String(alias || '').match(SEASON_NAME_REGEX);
  if (!m) return '';
  return m[1];
}

function isSeasonSheetName(name) {
  return SEASON_NAME_REGEX.test(String(name || '').trim());
}

function isLegacySeasonSheetName(name) {
  return LEGACY_SEASON_NAME_REGEX.test(String(name || '').trim());
}

function getSeasonSheetCandidates() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const candidates = [];

  ss.getSheets().forEach(sheet => {
    const name = sheet.getName();

    if (isSeasonSheetName(name) || isLegacySeasonSheetName(name)) {
      const alias = toSeasonAlias(name);
      const seasonNo = parseInt(alias.split('_')[1], 10);

      candidates.push({
        sheet: sheet,
        name: name,
        alias: alias,
        seasonNo: isNaN(seasonNo) ? -1 : seasonNo,
        isLegacy: !isSeasonSheetName(name)
      });
    }
  });

  candidates.sort((a, b) => {
    if (b.seasonNo !== a.seasonNo) {
      return b.seasonNo - a.seasonNo;
    }
    return b.name.localeCompare(a.name);
  });

  return candidates;
}

function resolveSeasonSheetInfo(seasonInput) {
  const alias = toSeasonAlias(seasonInput);
  if (!alias) {
    throw new Error('유효한 season 파라미터가 필요합니다. (예: season_07)');
  }

  const ss = SpreadsheetApp.getActiveSpreadsheet();

  const exact = ss.getSheetByName(alias);
  if (exact) {
    return {
      sheet: exact,
      seasonAlias: alias,
      currentSheet: exact.getName(),
      mappedLegacy: false
    };
  }

  const legacyName = getLegacySeasonName(alias);
  const legacy = ss.getSheetByName(legacyName);
  if (legacy) {
    return {
      sheet: legacy,
      seasonAlias: alias,
      currentSheet: legacy.getName(),
      mappedLegacy: true
    };
  }

  throw new Error(`시즌 '${alias}'에 해당하는 시트를 찾을 수 없습니다.`);
}

function getActiveAttendanceSheetInfo() {
  const candidates = getSeasonSheetCandidates();
  if (candidates.length === 0) {
    return null;
  }

  const scriptProperties = PropertiesService.getScriptProperties();
  const activeRaw = (scriptProperties.getProperty('activeSheet') || '').trim();

  if (activeRaw) {
    const found = candidates.find(item => item.name === activeRaw || item.alias === activeRaw);
    if (found) {
      scriptProperties.setProperty('activeSheet', found.name);
      return {
        sheet: found.sheet,
        seasonAlias: found.alias,
        currentSheet: found.name,
        mappedLegacy: found.isLegacy
      };
    }
  }

  const fallback = candidates[0];
  scriptProperties.setProperty('activeSheet', fallback.name);
  return {
    sheet: fallback.sheet,
    seasonAlias: fallback.alias,
    currentSheet: fallback.name,
    mappedLegacy: fallback.isLegacy
  };
}

/**
 * 모든 시즌 시트 목록을 반환합니다.
 * @returns {Array<{name: string, alias: string, isActive: boolean, isLegacy: boolean}>}
 */
function getAllSheets() {
  try {
    const activeInfo = getActiveAttendanceSheetInfo();
    const activeName = activeInfo ? activeInfo.currentSheet : '';

    return getSeasonSheetCandidates().map(item => ({
      name: item.name,
      alias: item.alias,
      isActive: item.name === activeName,
      isLegacy: item.isLegacy,
      isSeason: true
    }));
  } catch (error) {
    Logger.log('시트 목록 가져오기 오류: ' + error.toString());
    return [];
  }
}

/**
 * 활성 시트를 변경합니다.
 */
function setActiveSheet(sheetName) {
  try {
    const target = String(sheetName || '').trim();
    if (!target) {
      return { success: false, message: '시트명이 필요합니다.' };
    }

    const candidates = getSeasonSheetCandidates();
    const found = candidates.find(item => item.name === target || item.alias === target);
    if (!found) {
      return { success: false, message: '시즌 시트를 찾을 수 없습니다. (season_nn 형식 권장)' };
    }

    PropertiesService.getScriptProperties().setProperty('activeSheet', found.name);

    return {
      success: true,
      message: `${found.alias} 시트가 활성화되었습니다.`,
      activeSheet: found.name,
      seasonAlias: found.alias,
      mappedLegacy: found.isLegacy
    };
  } catch (error) {
    Logger.log('시트 변경 오류: ' + error.toString());
    return { success: false, message: '시트 변경 중 오류가 발생했습니다.' };
  }
}

/**
 * 현재 활성화된 시트를 가져옵니다. (관리자용)
 */
function getActiveAttendanceSheet() {
  const info = getActiveAttendanceSheetInfo();
  return info ? info.sheet : null;
}

/**
 * 시즌별 시트를 가져옵니다. (학생용)
 */
function getSeasonSheet(seasonName) {
  if (!seasonName) {
    return getActiveAttendanceSheet();
  }

  return resolveSeasonSheetInfo(seasonName).sheet;
}

function getRequestedSeasonSheetInfo(seasonName) {
  if (!seasonName) {
    const active = getActiveAttendanceSheetInfo();
    if (!active) {
      throw new Error('활성화된 시즌 시트가 없습니다.');
    }
    return active;
  }

  return resolveSeasonSheetInfo(seasonName);
}

