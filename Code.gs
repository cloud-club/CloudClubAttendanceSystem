// Code.gs

// 현재 선택된 시트명을 저장하는 스크립트 속성
function doGet(e) {
  const mode = e.parameter.mode;
  const season = e.parameter.season;
  
  if (mode === 'student') {
    // 학생용 인터페이스 (출석하기 + 출석현황만)
    const template = HtmlService.createTemplateFromFile('StudentInterface');
    template.season = season || '';
    return template.evaluate()
      .setTitle('출석체크')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  } else {
    // 관리자용 인터페이스 (기존 전체 기능)
    return HtmlService.createHtmlOutputFromFile('AdminInterface')
      .setTitle('Cloud Club 출석체크 관리자')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
}

/**
 * 모든 시트 목록을 반환합니다.
 * @returns {Array<{name: string, isActive: boolean}>}
 */
function getAllSheets() {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheets = ss.getSheets();
    const scriptProperties = PropertiesService.getScriptProperties();
    const activeSheetName = scriptProperties.getProperty('activeSheet');
    
    const sheetList = sheets
      .map(sheet => sheet.getName())
      .filter(name => name !== '설정' && name !== 'Settings') // 설정 시트는 제외
      .sort((a, b) => b.localeCompare(a)) // 최신 시트가 위로 오도록 정렬
      .map(name => ({
        name: name,
        isActive: name === activeSheetName
      }));
    
    // 활성 시트가 설정되지 않았으면 첫 번째 시트를 활성화
    if (!activeSheetName && sheetList.length > 0) {
      scriptProperties.setProperty('activeSheet', sheetList[0].name);
      sheetList[0].isActive = true;
    }
    
    return sheetList;
  } catch (error) {
    Logger.log('시트 목록 가져오기 오류:', error);
    return [];
  }
}

/**
 * 활성 시트를 변경합니다.
 * @param {string} sheetName - 활성화할 시트명
 * @returns {{success: boolean, message: string}}
 */
function setActiveSheet(sheetName) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(sheetName);
    
    if (!sheet) {
      return { success: false, message: "시트를 찾을 수 없습니다." };
    }
    
    const scriptProperties = PropertiesService.getScriptProperties();
    scriptProperties.setProperty('activeSheet', sheetName);
    
    return { success: true, message: `${sheetName} 시트가 활성화되었습니다.` };
  } catch (error) {
    Logger.log('시트 변경 오류:', error);
    return { success: false, message: "시트 변경 중 오류가 발생했습니다." };
  }
}

/**
 * 현재 활성화된 시트를 가져옵니다. (관리자용)
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getActiveAttendanceSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const scriptProperties = PropertiesService.getScriptProperties();
  let activeSheetName = scriptProperties.getProperty('activeSheet');
  
  if (!activeSheetName) {
    // 활성 시트가 설정되지 않았으면 첫 번째 시트를 사용
    const sheets = ss.getSheets().filter(sheet => 
      sheet.getName() !== '설정' && sheet.getName() !== 'Settings'
    );
    if (sheets.length > 0) {
      activeSheetName = sheets[0].getName();
      scriptProperties.setProperty('activeSheet', activeSheetName);
    }
  }
  
  return ss.getSheetByName(activeSheetName);
}

/**
 * 시즌별 시트를 가져옵니다. (학생용)
 * @param {string} seasonName - 시즌명 (시트명)
 * @returns {GoogleAppsScript.Spreadsheet.Sheet}
 */
function getSeasonSheet(seasonName) {
  if (!seasonName) {
    return getActiveAttendanceSheet(); // 시즌이 없으면 관리자 활성 시트 사용
  }
  
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(seasonName);
  
  if (!sheet) {
    throw new Error(`시즌 '${seasonName}'에 해당하는 시트를 찾을 수 없습니다.`);
  }
  
  return sheet;
}

/**
 * 현재 진행 중인 출석 세션 정보를 반환합니다. (관리자용)
 * 카운트다운을 위해 클라이언트로 세션 종료 시간을 전달합니다.
 * @returns {{active: boolean, endTime?: number, message?: string, currentSheet?: string}}
 */
function getAttendanceSession() {
  const sheet = getActiveAttendanceSheet();
  if (!sheet) {
    return { active: false, message: "활성화된 출석 시트가 없습니다." };
  }
  
  return getAttendanceSessionFromSheet(sheet);
}

/**
 * 시즌별 출석 세션 정보를 반환합니다. (학생용)
 * @param {string} seasonName - 시즌명 (시트명)
 * @returns {{active: boolean, endTime?: number, message?: string, currentSheet?: string}}
 */
function getSeasonAttendanceSession(seasonName) {
  try {
    const sheet = getSeasonSheet(seasonName);
    if (!sheet) {
      return { active: false, message: `시즌 '${seasonName}'에 해당하는 시트가 없습니다.` };
    }
    
    const result = getAttendanceSessionFromSheet(sheet);
    result.currentSheet = seasonName;
    return result;
  } catch (error) {
    Logger.log('시즌별 출석 세션 조회 오류:', error);
    return { active: false, message: error.message };
  }
}

/**
 * 특정 시트에서 출석 세션 정보를 조회합니다.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - 조회할 시트
 * @returns {{active: boolean, endTime?: number, message?: string, currentSheet?: string}}
 */
function getAttendanceSessionFromSheet(sheet) {
  
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  const now = new Date();

  // D열(4열)부터 출석일 확인
  for (let j = 3; j < headers.length; j++) {
    const sessionHeader = headers[j];
    if (typeof sessionHeader !== 'string' || sessionHeader.trim() === '') continue;
    
    const parts = sessionHeader.match(/(\d{4})-(\d{2})-(\d{2})-(\d{2}):(\d{2})/);
    if (!parts) continue;
    
    const sessionStartTime = new Date(parts[1], parseInt(parts[2], 10) - 1, parts[3], parts[4], parts[5]);
    const sessionEndTime = new Date(sessionStartTime.getTime() + 30 * 60 * 1000);
    
    if (now >= sessionStartTime && now <= sessionEndTime) {
      // 클라이언트에서 new Date(endTime)으로 사용할 수 있도록 Unix 타임스탬프(밀리초)로 전달
      return { 
        active: true, 
        endTime: sessionEndTime.getTime(),
        currentSheet: sheet.getName()
      };
    }
  }

  // 유효한 세션이 없는 경우
  return { 
    active: false, 
    message: "지금은 출석 가능한 시간이 아닙니다.",
    currentSheet: sheet.getName()
  };
}

/**
 * 전화번호 기반으로 출석을 처리합니다. (관리자용)
 */
function markAttendance(phoneNumber) {
  if (!phoneNumber) {
    return { success: false, message: "전화번호가 입력되지 않았습니다." };
  }
  
  try {
    const sheet = getActiveAttendanceSheet();
    if (!sheet) {
      return { success: false, message: "활성화된 출석 시트가 없습니다." };
    }
    
    return markAttendanceInSheet(phoneNumber, sheet);
  } catch (error) {
    Logger.log(error);
    return { success: false, message: "서버 오류가 발생했습니다: " + error.toString() };
  }
}

/**
 * 시즌별 전화번호 기반 출석 처리합니다. (학생용)
 * @param {string} phoneNumber - 전화번호
 * @param {string} seasonName - 시즌명 (시트명)
 */
function markSeasonAttendance(phoneNumber, seasonName) {
  if (!phoneNumber) {
    return { success: false, message: "전화번호가 입력되지 않았습니다." };
  }
  
  if (!seasonName) {
    return { success: false, message: "시즌 정보가 없습니다." };
  }
  
  try {
    const sheet = getSeasonSheet(seasonName);
    if (!sheet) {
      return { success: false, message: `시즌 '${seasonName}'에 해당하는 시트가 없습니다.` };
    }
    
    return markAttendanceInSheet(phoneNumber, sheet);
  } catch (error) {
    Logger.log('시즌별 출석 처리 오류:', error);
    return { success: false, message: "서버 오류가 발생했습니다: " + error.toString() };
  }
}

/**
 * 특정 시트에서 출석을 처리합니다.
 * @param {string} phoneNumber - 전화번호
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - 대상 시트
 */
function markAttendanceInSheet(phoneNumber, sheet) {
    
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    const headers = values[0];
    const now = new Date();

    let targetColIndex = -1;
    let currentSessionIndex = 0; // 현재 세션이 전체 중 몇 번째인지
    let sessionStartTime = null;

    // 유효한 출석 세션을 다시 한번 서버에서 검증합니다.
    const validSessions = [];
    // D열(4열)부터 시작
    for (let j = 3; j < headers.length; j++) {
      const sessionHeader = headers[j];
      if (typeof sessionHeader !== 'string' || sessionHeader.trim() === '') continue;
      const parts = sessionHeader.match(/(\d{4})-(\d{2})-(\d{2})-(\d{2}):(\d{2})/);
      if (!parts) continue;
      
      const startTime = new Date(parts[1], parseInt(parts[2], 10) - 1, parts[3], parts[4], parts[5]);
      validSessions.push({ colIndex: j, startTime: startTime });
      
      const sessionEndTime = new Date(startTime.getTime() + 30 * 60 * 1000);
      if (now >= startTime && now <= sessionEndTime) {
        targetColIndex = j;
        currentSessionIndex = validSessions.length; // 1-based index
        sessionStartTime = startTime;
      }
    }

    if (targetColIndex === -1) {
      return { success: false, message: "출석 가능한 시간이 종료되었습니다." };
    }

    // 전화번호로 학생 찾기 (하이픈 제거하고 비교)
    const cleanedInputPhone = phoneNumber.toString().replace(/-/g, '');
    let targetRowIndex = -1;
    
    for (let i = 1; i < values.length; i++) {
      const storedPhone = values[i][2] ? values[i][2].toString().replace(/-/g, '') : ''; // C열(3열)이 연락처
      if (storedPhone === cleanedInputPhone) {
        targetRowIndex = i;
        break;
      }
    }

    if (targetRowIndex === -1) {
      return { success: false, message: "등록되지 않은 전화번호입니다." };
    }

    // 이미 출석했는지 확인
    if (values[targetRowIndex][targetColIndex] && values[targetRowIndex][targetColIndex].toString().trim() !== "") {
      const name = values[targetRowIndex][0];
      const grade = values[targetRowIndex][1];
      return { success: false, message: `(${grade}) ${name}님은 이미 출석체크를 완료했습니다.` };
    }

    // 출석 시간 기록
    const formattedTime = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm:ss');
    sheet.getRange(targetRowIndex + 1, targetColIndex + 1).setValue(formattedTime);

    // 학생 정보 가져오기
    const name = values[targetRowIndex][0];
    const grade = values[targetRowIndex][1];

    // 출석률 계산 (방금 출석한 것 포함)
    let attendedCount = 1; // 방금 출석한 것 포함
    for (let i = 0; i < currentSessionIndex - 1; i++) {
      const colIndex = validSessions[i].colIndex;
      if (values[targetRowIndex][colIndex] && values[targetRowIndex][colIndex].toString().trim() !== "") {
        attendedCount++;
      }
    }
    
    const attendanceRate = currentSessionIndex > 0 ? Math.round((attendedCount / currentSessionIndex) * 100) : 0;
    
    // 오늘의 운세 가져오기
    const fortune = getRandomFortune();

    return { 
      success: true, 
      name: name,
      grade: grade,
      time: formattedTime,
      attendanceInfo: {
        attended: attendedCount,
        total: validSessions.length,
        currentSession: currentSessionIndex,
        rate: attendanceRate
      },
      fortune: fortune
    };
}

/**
 * 전화번호로 출석 현황을 조회합니다. (관리자용)
 * @param {string} phoneNumber - 조회할 전화번호
 * @returns {{success: boolean, data?: Object, message?: string}}
 */
function getAttendanceStatus(phoneNumber) {
  if (!phoneNumber) {
    return { success: false, message: "전화번호가 입력되지 않았습니다." };
  }
  
  try {
    const sheet = getActiveAttendanceSheet();
    if (!sheet) {
      return { success: false, message: "활성화된 출석 시트가 없습니다." };
    }
    
    return getAttendanceStatusFromSheet(phoneNumber, sheet);
  } catch (error) {
    Logger.log('출석 현황 조회 오류:', error);
    return { success: false, message: "조회 중 오류가 발생했습니다: " + error.toString() };
  }
}

/**
 * 시즌별 전화번호로 출석 현황을 조회합니다. (학생용)
 * @param {string} phoneNumber - 조회할 전화번호
 * @param {string} seasonName - 시즌명 (시트명)
 * @returns {{success: boolean, data?: Object, message?: string}}
 */
function getSeasonAttendanceStatus(phoneNumber, seasonName) {
  if (!phoneNumber) {
    return { success: false, message: "전화번호가 입력되지 않았습니다." };
  }
  
  if (!seasonName) {
    return { success: false, message: "시즌 정보가 없습니다." };
  }
  
  try {
    const sheet = getSeasonSheet(seasonName);
    if (!sheet) {
      return { success: false, message: `시즌 '${seasonName}'에 해당하는 시트가 없습니다.` };
    }
    
    return getAttendanceStatusFromSheet(phoneNumber, sheet);
  } catch (error) {
    Logger.log('시즌별 출석 현황 조회 오류:', error);
    return { success: false, message: "조회 중 오류가 발생했습니다: " + error.toString() };
  }
}

/**
 * 특정 시트에서 출석 현황을 조회합니다.
 * @param {string} phoneNumber - 조회할 전화번호
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - 대상 시트
 * @returns {{success: boolean, data?: Object, message?: string}}
 */
function getAttendanceStatusFromSheet(phoneNumber, sheet) {
    
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    const headers = values[0];
    
    // 전화번호로 학생 찾기
    const cleanedInputPhone = phoneNumber.toString().replace(/-/g, '');
    let targetRowIndex = -1;
    
    for (let i = 1; i < values.length; i++) {
      const storedPhone = values[i][2] ? values[i][2].toString().replace(/-/g, '') : ''; // C열(3열)이 연락처
      if (storedPhone === cleanedInputPhone) {
        targetRowIndex = i;
        break;
      }
    }

    if (targetRowIndex === -1) {
      return { success: false, message: "등록되지 않은 전화번호입니다." };
    }

    // 학생 정보
    const name = values[targetRowIndex][0];
    const grade = values[targetRowIndex][1];

    // 출석 정보 수집
    const attendanceDetails = [];
    let attendedCount = 0;
    let currentSessionCount = 0;
    const now = new Date();
    
    // D열(4열)부터 시작
    for (let j = 3; j < headers.length; j++) {
      const sessionHeader = headers[j];
      if (!sessionHeader || typeof sessionHeader !== 'string' || sessionHeader.trim() === '') continue;
      
      const parts = sessionHeader.match(/(\d{4})-(\d{2})-(\d{2})-(\d{2}):(\d{2})/);
      if (!parts) continue;
      
      const year = parseInt(parts[1]);
      const month = parseInt(parts[2]) - 1; // JavaScript months are 0-based
      const day = parseInt(parts[3]);
      const hour = parseInt(parts[4]);
      const minute = parseInt(parts[5]);
      
      const sessionDate = new Date(year, month, day, hour, minute);
      
      // 현재 시간 이전의 세션만 카운트
      if (sessionDate <= now) {
        currentSessionCount++;
      }
      
      const cellValue = values[targetRowIndex][j];
      const attended = cellValue && cellValue.toString().trim() !== "";
      if (attended && sessionDate <= now) {
        attendedCount++;
      }
      
      attendanceDetails.push({
        date: Utilities.formatDate(sessionDate, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm'),
        attended: attended,
        attendTime: attended ? cellValue.toString() : null,
        isPast: sessionDate <= now
      });
    }
    
    const attendanceRate = currentSessionCount > 0 ? Math.round((attendedCount / currentSessionCount) * 100) : 0;
    
    return {
      success: true,
      data: {
        name: name,
        grade: grade,
        attended: attendedCount,
        total: attendanceDetails.length,
        currentSession: currentSessionCount,
        rate: attendanceRate,
        details: attendanceDetails
      }
    };
}

/**
 * 모든 등록된 전화번호 목록을 반환합니다.
 * 클라이언트에서 유효성 검증용으로 사용됩니다.
 */
function getAllPhoneNumbers() {
  try {
    const sheet = getActiveAttendanceSheet();
    if (!sheet) return [];
    
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    
    const phoneNumbers = [];
    for (let i = 1; i < values.length; i++) {
      if (values[i][2]) { // C열(3열)이 연락처
        // 하이픈 제거한 형태로 저장
        phoneNumbers.push(values[i][2].toString().replace(/-/g, ''));
      }
    }
    return phoneNumbers;
  } catch (error) {
    Logger.log('전화번호 목록 가져오기 오류:', error);
    return [];
  }
}

// QR 코드 URL 생성 함수
function getQRCodeUrl() {
  return ScriptApp.getService().getUrl();
}

/**
 * 시즌별 학생용 QR코드 URL을 생성합니다.
 * @param {string} seasonName - 시즌명 (시트명)
 * @returns {string} QR코드용 학생 접속 URL
 */
function generateStudentQRCodeUrl(seasonName) {
  const baseUrl = ScriptApp.getService().getUrl();
  const studentUrl = `${baseUrl}?mode=student&season=${encodeURIComponent(seasonName)}`;
  return studentUrl;
}

/**
 * Google Charts API를 사용하여 QR코드 이미지 URL을 생성합니다.
 * @param {string} seasonName - 시즌명 (시트명)
 * @returns {string} QR코드 이미지 URL
 */
function generateQRCodeImageUrl(seasonName) {
  const studentUrl = generateStudentQRCodeUrl(seasonName);
  const qrCodeImageUrl = `https://chart.googleapis.com/chart?cht=qr&chl=${encodeURIComponent(studentUrl)}&chs=300x300`;
  return qrCodeImageUrl;
}

/**
 * 날짜 값을 Date 객체로 변환하는 헬퍼 함수
 */
function parseAttendanceTime(value) {
  if (!value) return null;
  
  try {
    // 이미 Date 객체인 경우
    if (value instanceof Date) {
      return value;
    }
    
    // 문자열인 경우
    if (typeof value === 'string') {
      const str = value.trim();
      
      // "2025-08-03 18:36:07" 형식
      const match = str.match(/(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):(\d{2})/);
      if (match) {
        return new Date(
          parseInt(match[1]),     // 년
          parseInt(match[2]) - 1, // 월 (0-based)
          parseInt(match[3]),     // 일
          parseInt(match[4]),     // 시
          parseInt(match[5]),     // 분
          parseInt(match[6])      // 초
        );
      }
    }
    
    // 숫자인 경우 (Google Sheets 날짜 시리얼)
    if (typeof value === 'number') {
      // Google Sheets는 1900년 1월 1일부터 시작 (실제로는 1899년 12월 30일)
      // JavaScript는 1970년 1월 1일부터 시작
      // 25569 = 1970년 1월 1일까지의 일수
      return new Date((value - 25569) * 86400 * 1000);
    }
    
  } catch (e) {
    Logger.log('날짜 파싱 오류: ' + e.toString());
  }
  
  return null;
}

/**
 * 출석률 순위를 계산합니다. (관리자용)
 * @returns {Array} 순위 정보 배열
 */
function getAttendanceRanking() {
  Logger.log('!!!! getAttendanceRanking 함수 시작 !!!!');
  
  try {
    const sheet = getActiveAttendanceSheet();
    if (!sheet) {
      Logger.log('시트를 찾을 수 없음');
      return { success: false, message: "활성화된 출석 시트가 없습니다." };
    }
    
    return getAttendanceRankingFromSheet(sheet);
  } catch (error) {
    Logger.log('순위 계산 오류: ' + error.toString());
    Logger.log('오류 스택: ' + error.stack);
    return { success: false, message: "순위 계산 중 오류가 발생했습니다." };
  }
}

/**
 * 시즌별 출석률 순위를 계산합니다. (학생용)
 * @param {string} seasonName - 시즌명 (시트명)
 * @returns {Array} 순위 정보 배열
 */
function getSeasonAttendanceRanking(seasonName) {
  Logger.log('!!!! getSeasonAttendanceRanking 함수 시작 !!!!');
  
  if (!seasonName) {
    return { success: false, message: "시즌 정보가 없습니다." };
  }
  
  try {
    const sheet = getSeasonSheet(seasonName);
    if (!sheet) {
      Logger.log('시트를 찾을 수 없음');
      return { success: false, message: `시즌 '${seasonName}'에 해당하는 시트가 없습니다.` };
    }
    
    return getAttendanceRankingFromSheet(sheet);
  } catch (error) {
    Logger.log('시즌별 순위 계산 오류: ' + error.toString());
    Logger.log('오류 스택: ' + error.stack);
    return { success: false, message: "순위 계산 중 오류가 발생했습니다." };
  }
}

/**
 * 특정 시트에서 출석률 순위를 계산합니다.
 * @param {GoogleAppsScript.Spreadsheet.Sheet} sheet - 대상 시트
 * @returns {Array} 순위 정보 배열
 */
function getAttendanceRankingFromSheet(sheet) {
    
    const dataRange = sheet.getDataRange();
    const values = dataRange.getValues();
    const headers = values[0];
    const now = new Date();
    
    Logger.log('현재 시간: ' + now);
    Logger.log('헤더 수: ' + headers.length);
    
    // 유효한 세션 찾기 (D열부터)
    const validSessions = [];
    for (let j = 3; j < headers.length; j++) {
      const sessionHeader = headers[j];
      Logger.log(`헤더 [${j}]: ${sessionHeader}`);
      
      if (!sessionHeader || typeof sessionHeader !== 'string' || sessionHeader.trim() === '') continue;
      
      const parts = sessionHeader.match(/(\d{4})-(\d{2})-(\d{2})-(\d{2}):(\d{2})/);
      if (!parts) {
        Logger.log('  -> 매치 실패');
        continue;
      }
      
      // 세션 시작 시간을 정확히 생성 (초는 0으로 설정)
      const sessionDate = new Date(
        parseInt(parts[1]), 
        parseInt(parts[2]) - 1, 
        parseInt(parts[3]), 
        parseInt(parts[4]), 
        parseInt(parts[5]),
        0, // 초
        0  // 밀리초
      );
      
      Logger.log(`  -> 세션 날짜: ${sessionDate}`);
      
      if (sessionDate <= now) {
        validSessions.push({ 
          colIndex: j, 
          startTime: sessionDate,
          header: sessionHeader 
        });
        Logger.log('  -> 유효한 세션으로 추가됨');
      }
    }
    
    const currentSessionCount = validSessions.length;
    Logger.log(`총 유효한 세션 수: ${currentSessionCount}`);
    
    if (currentSessionCount === 0) {
      return { success: true, data: [] };
    }
    
    const rankings = [];
    
    // 각 학생의 출석 정보 수집
    for (let i = 1; i < values.length; i++) {
      const name = values[i][0];
      const grade = values[i][1];
      const phone = values[i][2];
      if (!name || !phone) continue;
      
      let attendedCount = 0;
      let totalAttendTimeSeconds = 0;
      let validAttendTimeCount = 0;
      
      // 각 세션별로 출석 확인
      validSessions.forEach((session) => {
        const cellValue = values[i][session.colIndex];
        
        if (cellValue && cellValue.toString().trim() !== "") {
          attendedCount++;
          
          // Date 객체로 직접 받거나 파싱
          let attendTime = null;
          if (cellValue instanceof Date) {
            attendTime = cellValue;
          } else {
            attendTime = parseAttendanceTime(cellValue);
          }
          
          if (attendTime && !isNaN(attendTime.getTime())) {
            const timeDiffSeconds = Math.floor((attendTime - session.startTime) / 1000);
            
            // 0초 이상 30분(1800초) 이내의 출석만 유효
            if (timeDiffSeconds >= 0 && timeDiffSeconds <= 1800) {
              totalAttendTimeSeconds += timeDiffSeconds;
              validAttendTimeCount++;
            }
          }
        }
      });
      
      const attendanceRate = (attendedCount / currentSessionCount) * 100;
      
      // 평균 출석 시간 계산
      let avgAttendTimeSeconds;
      let avgAttendTimeFormatted;
      
      if (validAttendTimeCount > 0) {
        // 유효한 출석 시간이 있는 경우
        avgAttendTimeSeconds = Math.round(totalAttendTimeSeconds / validAttendTimeCount);
        const avgMinutes = Math.floor(avgAttendTimeSeconds / 60);
        const avgSeconds = avgAttendTimeSeconds % 60;
        avgAttendTimeFormatted = `${avgMinutes}:${String(avgSeconds).padStart(2, '0')}`;
      } else if (attendedCount > 0) {
        // 출석은 했지만 시간 계산이 안 된 경우 (기본값 30분)
        avgAttendTimeSeconds = 1800;
        avgAttendTimeFormatted = "30:00";
      } else {
        // 한 번도 출석하지 않은 경우
        avgAttendTimeSeconds = 999999;
        avgAttendTimeFormatted = "미출석";
      }
      
      rankings.push({
        name: name,
        grade: grade,
        attendedCount: attendedCount,
        totalSessions: currentSessionCount,
        attendanceRate: Math.round(attendanceRate),
        avgAttendTimeSeconds: avgAttendTimeSeconds,
        avgAttendTime: avgAttendTimeFormatted
      });
    }
    
    // 정렬: 출석률 내림차순, 같으면 평균 출석 시간 오름차순
    rankings.sort((a, b) => {
      if (b.attendanceRate !== a.attendanceRate) {
        return b.attendanceRate - a.attendanceRate;
      }
      // 미출석자는 맨 뒤로
      if (a.avgAttendTimeSeconds === 999999) return 1;
      if (b.avgAttendTimeSeconds === 999999) return -1;
      return a.avgAttendTimeSeconds - b.avgAttendTimeSeconds;
    });
    
    // 순위 부여
    rankings.forEach((item, index) => {
      item.rank = index + 1;
    });
    
    Logger.log('\n=== 최종 순위 ===');
    rankings.slice(0, 10).forEach(item => {
      Logger.log(`${item.rank}위: (${item.grade}) ${item.name} - 출석률: ${item.attendanceRate}%, 평균: ${item.avgAttendTime}`);
    });
    
    return { success: true, data: rankings.slice(0, 10) };
}
