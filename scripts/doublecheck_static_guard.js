#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');

function readFile(relativePath) {
  return fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function assertRegex(content, regex, message) {
  if (!regex.test(content)) {
    throw new Error(message);
  }
}

function assertNotRegex(content, regex, message) {
  if (regex.test(content)) {
    throw new Error(message);
  }
}

function parseObjectKeys(objectLiteralText) {
  const keys = [];
  const keyRegex = /([A-Za-z_][A-Za-z0-9_]*)\s*:/g;
  let match = null;
  while ((match = keyRegex.exec(objectLiteralText)) !== null) {
    keys.push(match[1]);
  }
  return keys;
}

function checkApiRouterInvariance() {
  const content = readFile('Appsscript/00_entry_api.gs');
  const requiredSnippets = [
    "case 'session':",
    "data = getSeasonAttendanceSession(resolvePublicSeasonAccess(params, ensureAdmin).seasonAlias);",
    "case 'attendance':",
    "data = markSeasonAttendance(phone, resolvePublicSeasonAccess(params, ensureAdmin).seasonAlias);",
    "case 'status':",
    "data = getSeasonAttendanceStatus(phone, resolvePublicSeasonAccess(params, ensureAdmin).seasonAlias);",
    "case 'ranking':",
    "data = getSeasonAttendanceRanking(resolvePublicSeasonAccess(params, ensureAdmin).seasonAlias);",
    "case 'fortuneVersionList':",
    'data = fortuneVersionList(ensureAdmin(), params);',
    "case 'fortuneVersionGet':",
    'data = fortuneVersionGet(ensureAdmin(), params);',
    "case 'fortuneUploadBegin':",
    'data = fortuneUploadBegin(ensureAdmin(), params);',
    "case 'fortuneUploadChunk':",
    'data = fortuneUploadChunk(ensureAdmin(), params);',
    "case 'fortuneUploadFinalize':",
    'data = fortuneUploadFinalize(ensureAdmin(), params);',
    "case 'fortuneUploadAbort':",
    'data = fortuneUploadAbort(ensureAdmin(), params);'
  ];
  requiredSnippets.forEach((snippet) => {
    if (!content.includes(snippet)) {
      throw new Error(`API 라우터 불변성 검증 실패: 누락된 스니펫 -> ${snippet}`);
    }
  });
}

function checkSuperOnlyTabsInvariance() {
  const content = readFile('web/admin/scripts/01_state.js');
  const match = content.match(/const SUPER_ONLY_TABS = \{([\s\S]*?)\};/);
  if (!match) {
    throw new Error('SUPER_ONLY_TABS 선언을 찾지 못했습니다.');
  }
  const keys = parseObjectKeys(match[1]).sort();
  const expected = ['adminUsers', 'seasonImport', 'variables'];
  if (JSON.stringify(keys) !== JSON.stringify(expected)) {
    throw new Error(`SUPER_ONLY_TABS 불일치: expected=${expected.join(',')} actual=${keys.join(',')}`);
  }
  if (keys.includes('fortune')) {
    throw new Error('fortune 탭이 SUPER_ONLY_TABS에 포함되어 있습니다.');
  }
}

function checkFortuneTabWiring() {
  const indexHtml = readFile('web/admin/index.html');
  assertRegex(
    indexHtml,
    /openTab\('schedule', event\)[\s\S]*openTab\('fortune', event\)[\s\S]*openTab\('excused', event\)/,
    '탭 순서 검증 실패: schedule -> fortune -> excused 순서를 확인하세요.'
  );
  assertRegex(
    indexHtml,
    /<div id="fortune" class="tab-content">/,
    'fortune 탭 본문이 누락되었습니다.'
  );
  assertRegex(
    indexHtml,
    /<script src="\.\/scripts\/28_fortune\.js"><\/script>/,
    '28_fortune.js 스크립트 로딩이 누락되었습니다.'
  );
}

function checkFortuneBranchInOpenTabAndRefresh() {
  const attendanceContent = readFile('web/admin/scripts/20_attendance.js');
  assertRegex(
    attendanceContent,
    /if \(tabName === 'fortune'\)\s*\{\s*refreshFortuneManagement\(\);\s*\}/,
    'openTab()의 fortune 분기 연결이 누락되었습니다.'
  );
  const authContent = readFile('web/admin/scripts/10_auth.js');
  assertRegex(
    authContent,
    /if \(activeTab === 'fortune'\)\s*\{\s*await refreshFortuneManagement\(\);\s*return;\s*\}/,
    'refreshSeasonData()의 fortune 분기 연결이 누락되었습니다.'
  );
}

function checkCompatHandlers() {
  const content = readFile('web/admin/scripts/99_compat_handlers.js');
  const required = [
    'refreshFortuneManagement',
    'loadFortuneFromFile',
    'analyzeFortuneInput',
    'resetFortuneEditor',
    'loadCurrentFortuneIntoEditor',
    'executeFortuneUpload',
    'downloadCurrentFortuneCsv',
    'downloadCurrentFortuneXlsx',
    'loadFortuneVersionIntoEditor',
    'downloadFortuneVersionCsv',
    'downloadFortuneVersionXlsx'
  ];
  required.forEach((name) => {
    if (!content.includes(`"${name}"`)) {
      throw new Error(`99_compat_handlers 누락: ${name}`);
    }
  });
}

function checkActionAccessLevels() {
  const content = readFile('Appsscript/01_constants_access.gs');
  const required = [
    "fortuneVersionList: ACTION_ACCESS_ADMIN",
    "fortuneVersionGet: ACTION_ACCESS_ADMIN",
    "fortuneUploadBegin: ACTION_ACCESS_ADMIN",
    "fortuneUploadChunk: ACTION_ACCESS_ADMIN",
    "fortuneUploadFinalize: ACTION_ACCESS_ADMIN",
    "fortuneUploadAbort: ACTION_ACCESS_ADMIN"
  ];
  required.forEach((snippet) => {
    if (!content.includes(snippet)) {
      throw new Error(`ACTION_ACCESS_LEVELS 누락/오류: ${snippet}`);
    }
  });
}

function checkStudentFortuneEscape() {
  const content = readFile('web/student/student.js');
  if (!content.includes('<p class="fortune-text">${escapeHtml(response.fortune)}</p>')) {
    throw new Error('학생 페이지 운세 렌더링 escape 적용이 누락되었습니다.');
  }
}

function checkImportUpdateColumnFlexibility() {
  const content = readFile('Appsscript/34_season_import.gs');

  assertRegex(
    content,
    /missingRequired\s*=\s*\['name',\s*'season',\s*'phone',\s*'email'\]\.filter\(field\s*=>\s*!hasSchemaFieldIndex\(schema,\s*field\)\)/,
    'season_import update 경로가 필수 헤더 기반 검증을 사용하지 않습니다.'
  );
  assertRegex(
    content,
    /const changedCells = collectTargetSheetChangedCells\(currentRow,\s*member,\s*targetSchema\);/,
    'season_import update 경로가 필드 매핑 기반 변경 셀 계산을 사용하지 않습니다.'
  );
  assertRegex(
    content,
    /const appendRow = buildTargetSheetRowFromMember\(member,\s*targetSchema,\s*lastCol\);/,
    'season_import update 신규행 추가가 대상 시트 매핑 기반으로 구성되지 않습니다.'
  );

  assertNotRegex(
    content,
    /targetSheet\.getRange\(existing\.rowIndex,\s*1,\s*1,\s*MEMBER_V2_SHEET_HEADERS\.length\)\.getValues\(\)\[0\]/,
    'season_import update 경로에 고정 12열 읽기 결합이 남아 있습니다.'
  );
  assertNotRegex(
    content,
    /targetSheet\.getRange\(existing\.rowIndex,\s*1,\s*1,\s*MEMBER_V2_SHEET_HEADERS\.length\)\.setValues\(\[rowValues\]\)/,
    'season_import update 경로에 고정 12열 일괄쓰기 결합이 남아 있습니다.'
  );
}

function checkSessionHeaderDynamicParsing() {
  const content = readFile('Appsscript/21_variables_sessionmeta.gs');
  assertRegex(
    content,
    /for \(let j = Math\.max\(0,\s*memberSchema\.sessionStartColIndex\); j < headers\.length; j\+\+\)/,
    'collectSessionsFromSheet가 sessionStartColIndex 기반 순회를 사용하지 않습니다.'
  );
  assertRegex(
    content,
    /const parsed = parseSessionHeader\(headers\[j\]\);/,
    'collectSessionsFromSheet가 날짜 헤더 패턴 파싱을 사용하지 않습니다.'
  );
}

function checkAttendanceDashboardDrilldownHelpers() {
  const content = readFile('web/admin/scripts/21_dashboard.js');
  const updateMatches = content.match(/function updateAttendanceDashboardEventStatusSlice\(/g) || [];
  if (updateMatches.length !== 1) {
    throw new Error(`event status 드릴다운 갱신 helper가 ${updateMatches.length}회 선언되었습니다. 정확히 1회여야 합니다.`);
  }
  assertRegex(
    content,
    /function renderAttendanceDashboardEventStatusSliceMembers\(/,
    'event status 드릴다운 렌더 helper가 누락되었습니다.'
  );
}

function checkAttendanceDashboardLiveDefaultScopePersistence() {
  const content = readFile('web/admin/scripts/21_dashboard.js');
  assertRegex(
    content,
    /function getPersistedAttendanceDashboardState\(/,
    '출석현황 저장 상태 정규화 helper가 누락되었습니다.'
  );
  assertRegex(
    content,
    /JSON\.stringify\(\s*getPersistedAttendanceDashboardState\(attendanceDashboardState\)\s*\)/,
    '출석현황 localStorage 저장이 display prefs 전용 helper를 거치지 않습니다.'
  );
  assertRegex(
    content,
    /const hasManualScope = state\.sessionScopeMode === 'manual';/,
    '출석현황 공유 URL이 auto/manual scope를 구분하지 않습니다.'
  );
  assertRegex(
    content,
    /setOrDelete\('dash_from', hasManualScope \? state\.dateFrom : ''\);/,
    '출석현황 공유 URL이 auto 상태 날짜 범위를 제거하지 않습니다.'
  );
  assertRegex(
    content,
    /if \(!hasExplicitQueryScope\) \{\s*resetAttendanceDashboardScopeState\(\);\s*\}/,
    '출석현황 초기화가 query 없는 경우 live default scope로 복원되지 않습니다.'
  );
}

function checkSyntax() {
  const jsFiles = [
    'web/shared/env.js',
    'web/shared/config.js',
    'web/shared/api-jsonp.js',
    'web/admin/scripts/01_state.js',
    'web/admin/scripts/05_runtime_deps.js',
    'web/admin/scripts/10_auth.js',
    'web/admin/scripts/20_attendance.js',
    'web/admin/scripts/21_dashboard.js',
    'web/admin/scripts/22_location.js',
    'web/admin/scripts/22_schedule.js',
    'web/admin/scripts/23_import.js',
    'web/admin/scripts/28_fortune.js',
    'web/admin/scripts/99_compat_handlers.js',
    'web/student/student.js'
  ];
  jsFiles.forEach((relativePath) => {
    execSync(`node --check "${path.join(repoRoot, relativePath)}"`, { stdio: 'ignore' });
  });

  const gsFiles = [
    'Appsscript/30_attendance_core.gs',
    'Appsscript/32_schedule.gs',
    'Appsscript/34_season_import.gs',
    'Appsscript/35_fortune_admin.gs',
    'Appsscript/91_fortune.gs',
    'Appsscript/00_entry_api.gs',
    'Appsscript/01_constants_access.gs',
    'Appsscript/21_variables_sessionmeta.gs',
    'Appsscript/22_location_attendance.gs',
    'Appsscript/90_common_utils.gs'
  ];
  const tempDir = fs.mkdtempSync(path.join(repoRoot, '.tmp-doublecheck-'));
  try {
    gsFiles.forEach((relativePath) => {
      const target = path.join(tempDir, path.basename(relativePath, '.gs') + '.js');
      fs.copyFileSync(path.join(repoRoot, relativePath), target);
      execSync(`node --check "${target}"`, { stdio: 'ignore' });
    });
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

function checkLocationPolicyRegression() {
  execSync(`node "${path.join(repoRoot, 'scripts/location_policy_test.js')}"`, { stdio: 'ignore' });
}

function checkLocationPrivacyAndPolicyUi() {
  const studentJs = readFile('web/student/student.js');
  const studentHtml = readFile('web/student/latest/index.html');
  const adminHtml = readFile('web/admin/index.html');
  const privacyHtml = readFile('web/privacy.html');
  const termsHtml = readFile('web/terms.html');

  assertRegex(
    studentJs,
    /session\.locationPolicyValid === false[\s\S]*?위치 권한을 요청하지 않습니다/,
    '손상된 위치 정책에서 학생 GPS 권한 요청을 차단하는 안내가 없습니다.'
  );
  assertRegex(studentHtml, /href="\.\.\/\.\.\/privacy\.html"/, '학생 개인정보 처리 안내 링크가 없습니다.');
  assertRegex(adminHtml, /google-maps-attribution[^>]*" translate="no">Google Maps</, '관리자 Google Maps attribution이 없습니다.');
  assertRegex(adminHtml, /href="\.\.\/privacy\.html"/, '관리자 개인정보 처리 안내 링크가 없습니다.');
  assertRegex(privacyHtml, /현재 좌표[\s\S]*저장하지 않습니다/, '개인정보 안내에 참가자 좌표 미저장 정책이 없습니다.');
  assertRegex(termsHtml, /Google Maps\/Google Earth 추가 서비스 약관/, '이용약관에 Google Maps 약관 참조가 없습니다.');
}

function checkPagesEnvInjectionExitStatus() {
  const workflow = readFile('.github/workflows/deploy-gh-pages.yml');

  assertNotRegex(
    workflow,
    /grep -q "__(?:API_BASE_URL|GOOGLE_MAPS_BROWSER_API_KEY)__" web\/shared\/env\.js &&/,
    'Pages 환경 주입의 마지막 음수 검증이 성공 경로에서도 종료 코드 1을 반환할 수 있습니다.'
  );
  assertRegex(
    workflow,
    /if grep -q "__GOOGLE_MAPS_BROWSER_API_KEY__" web\/shared\/env\.js; then/,
    'Maps 키 placeholder 잔존 검증이 명시적인 if 블록이 아닙니다.'
  );
  assertRegex(
    workflow,
    /grep -F "\$GOOGLE_MAPS_BROWSER_API_KEY" web\/shared\/env\.js >\/dev\/null/,
    'Maps 브라우저 키가 env.js에 실제로 주입되었는지 확인하지 않습니다.'
  );
}

const checks = [
  ['API 라우터 불변성', checkApiRouterInvariance],
  ['SUPER_ONLY_TABS 불변성', checkSuperOnlyTabsInvariance],
  ['운세 탭 wiring', checkFortuneTabWiring],
  ['openTab/refreshSeasonData 분기', checkFortuneBranchInOpenTabAndRefresh],
  ['호환 핸들러 등록', checkCompatHandlers],
  ['액션 접근 레벨', checkActionAccessLevels],
  ['학생 운세 escape', checkStudentFortuneEscape],
  ['세션 헤더 동적 파싱 가드', checkSessionHeaderDynamicParsing],
  ['시즌업로드 컬럼 유연성 가드', checkImportUpdateColumnFlexibility],
  ['출석현황 드릴다운 helper 중복 선언 가드', checkAttendanceDashboardDrilldownHelpers],
  ['출석현황 live default scope persistence 가드', checkAttendanceDashboardLiveDefaultScopePersistence],
  ['위치 정책 회귀 테스트', checkLocationPolicyRegression],
  ['위치 개인정보·Google Maps 정책 표면', checkLocationPrivacyAndPolicyUi],
  ['Pages 환경 주입 종료 코드 가드', checkPagesEnvInjectionExitStatus],
  ['수정 파일 문법 체크', checkSyntax]
];

let failed = 0;
console.log('=== Doublecheck Static Guard ===');
checks.forEach(([name, fn]) => {
  try {
    fn();
    console.log(`PASS  ${name}`);
  } catch (error) {
    failed += 1;
    console.error(`FAIL  ${name}`);
    console.error(`      ${error.message}`);
  }
});

if (failed > 0) {
  console.error(`\nRESULT: FAIL (${failed} checks failed)`);
  process.exit(1);
}

console.log('\nRESULT: PASS (all static guards green)');
