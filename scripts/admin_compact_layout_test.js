const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const repoRoot = path.resolve(__dirname, '..');

function readSource(relativePath, optional = false) {
  const absolutePath = path.join(repoRoot, relativePath);
  if (optional && !fs.existsSync(absolutePath)) return '';
  return fs.readFileSync(absolutePath, 'utf8');
}

function getAttribute(tag, attributeName) {
  const match = tag.match(new RegExp(`\\b${attributeName}\\s*=\\s*["']([^"']*)["']`, 'i'));
  return match ? match[1] : '';
}

function getOpeningTags(source, tagName) {
  return source.match(new RegExp(`<${tagName}\\b[^>]*>`, 'gi')) || [];
}

function extractFunctionSource(source, functionName) {
  const declarationIndex = source.search(new RegExp(`\\bfunction\\s+${functionName}\\s*\\(`));
  if (declarationIndex < 0) return '';

  const openingBraceIndex = source.indexOf('{', declarationIndex);
  if (openingBraceIndex < 0) return '';

  let depth = 0;
  for (let index = openingBraceIndex; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(declarationIndex, index + 1);
  }
  return '';
}

const html = readSource('web/admin/index.html');
const domRefsSource = readSource('web/admin/scripts/03_dom_refs.js');
const attendanceSource = readSource('web/admin/scripts/20_attendance.js');
const shellSource = readSource('web/admin/scripts/07_admin_shell.js', true);

const expectedTabNames = [
  'attend',
  'status',
  'schedule',
  'fortune',
  'excused',
  'generate',
  'variables',
  'graduation',
  'seasonImport',
  'adminUsers',
];

test('관리자 대형 hero를 compact topbar로 대체한다', () => {
  // Given: 현재 관리자 페이지의 전체 HTML이 준비되어 있다.
  const heroMarkers = ['sparkle-badge', 'main-title', 'subtitle', 'divider'];

  // When: hero와 compact shell 표식을 조회한다.
  const remainingHeroMarkers = heroMarkers.filter((marker) => html.includes(`class="${marker}`));

  // Then: 대형 hero는 없고 topbar와 브랜드가 존재해야 한다.
  assert.deepEqual(remainingHeroMarkers, []);
  assert.match(html, /<header\b[^>]*class=["'][^"']*\badmin-topbar\b/i);
  assert.match(html, /class=["'][^"']*\badmin-brand\b/i);
  assert.doesNotMatch(html, /ADMIN DASHBOARD|출석체크 관리자 시스템/);
});

test('단일 tablist가 10개 관리자 탭을 명시적으로 연결한다', () => {
  // Given: 관리자 페이지에서 tablist와 탭 버튼을 수집한다.
  const tablists = getOpeningTags(html, 'nav').filter((tag) => getAttribute(tag, 'role') === 'tablist');
  const tabButtons = getOpeningTags(html, 'button').filter((tag) => {
    return getAttribute(tag, 'class').split(/\s+/).includes('tab-button');
  });

  // When: 각 버튼의 data-tab과 aria-controls 값을 정규화한다.
  const buttonContracts = tabButtons.map((tag) => ({
    tabName: getAttribute(tag, 'data-tab'),
    controls: getAttribute(tag, 'aria-controls'),
    role: getAttribute(tag, 'role'),
  }));

  // Then: 중복 tablist 없이 10개 탭이 각 패널을 직접 가리켜야 한다.
  assert.equal(tablists.length, 1);
  assert.equal(getAttribute(tablists[0], 'id'), 'adminTabNav');
  assert.equal(tabButtons.length, expectedTabNames.length);
  assert.deepEqual(buttonContracts.map(({ tabName }) => tabName).sort(), [...expectedTabNames].sort());
  buttonContracts.forEach(({ tabName, controls, role }) => {
    assert.equal(role, 'tab', `${tabName} 버튼은 role="tab"이어야 합니다.`);
    assert.equal(controls, tabName, `${tabName} 버튼은 같은 이름의 패널을 제어해야 합니다.`);
  });
});

test('모바일 메뉴 버튼과 backdrop이 동일한 tablist의 열림 상태를 표현한다', () => {
  // Given: compact shell의 메뉴 버튼과 backdrop 후보를 수집한다.
  const menuButton = getOpeningTags(html, 'button').find((tag) => getAttribute(tag, 'id') === 'adminMenuButton') || '';
  const backdrop = getOpeningTags(html, 'button').find((tag) => getAttribute(tag, 'id') === 'adminMenuBackdrop') || '';

  // When: 두 요소의 초기 ARIA 상태를 읽는다.
  const menuContract = {
    controls: getAttribute(menuButton, 'aria-controls'),
    expanded: getAttribute(menuButton, 'aria-expanded'),
    label: getAttribute(menuButton, 'aria-label'),
    backdropHidden: getAttribute(backdrop, 'aria-hidden'),
  };
  const initializeShellSource = extractFunctionSource(shellSource, 'initializeAdminShell');

  // Then: 메뉴는 닫힌 상태로 시작하고 backdrop도 보조기술에서 숨겨져야 한다.
  assert.notEqual(menuButton, '', 'adminMenuButton이 필요합니다.');
  assert.notEqual(backdrop, '', 'adminMenuBackdrop이 필요합니다.');
  assert.equal(menuContract.controls, 'adminTabNav');
  assert.equal(menuContract.expanded, 'false');
  assert.notEqual(menuContract.label, '');
  assert.equal(menuContract.backdropHidden, 'true');
  assert.match(initializeShellSource, /nav\.setAttribute\('aria-orientation', isAdminMobileMenuViewport\(\) \? 'vertical' : 'horizontal'\)/);
  assert.match(initializeShellSource, /trapAdminMenuFocus\s*\(\s*event\s*\)/);
});

test('10개 탭 패널이 해당 탭 버튼의 접근성 이름을 공유한다', () => {
  // Given: data-tab이 있는 버튼을 패널 이름 기준으로 색인한다.
  const tabButtons = getOpeningTags(html, 'button').filter((tag) => getAttribute(tag, 'data-tab'));
  const buttonByTabName = new Map(tabButtons.map((tag) => [getAttribute(tag, 'data-tab'), tag]));

  // When: 각 탭 이름에 대응하는 tab-content 시작 태그를 찾는다.
  const panels = getOpeningTags(html, 'div').filter((tag) => {
    return getAttribute(tag, 'class').split(/\s+/).includes('tab-content');
  });
  const panelById = new Map(panels.map((tag) => [getAttribute(tag, 'id'), tag]));

  // Then: 모든 패널은 role="tabpanel"이고 aria-labelledby가 실제 버튼 ID와 일치해야 한다.
  assert.equal(panels.length, expectedTabNames.length);
  expectedTabNames.forEach((tabName) => {
    const button = buttonByTabName.get(tabName) || '';
    const panel = panelById.get(tabName) || '';
    assert.notEqual(button, '', `${tabName} 탭 버튼이 필요합니다.`);
    assert.notEqual(panel, '', `${tabName} 탭 패널이 필요합니다.`);
    assert.equal(getAttribute(panel, 'role'), 'tabpanel');
    assert.equal(getAttribute(panel, 'aria-labelledby'), getAttribute(button, 'id'));
    assert.notEqual(getAttribute(button, 'id'), '', `${tabName} 탭 버튼 ID가 필요합니다.`);
  });
});

test('compact density와 탭 grid가 지정된 desktop breakpoint에만 확장된다', () => {
  // Given: 인라인 스타일을 포함한 관리자 HTML이 준비되어 있다.
  const breakpointPatterns = [
    /@media\s*\([^)]*max-width\s*:\s*768px[^)]*\)/,
    /@media\s*\([^)]*min-width\s*:\s*1200px[^)]*\)/,
    /@media\s*\([^)]*min-width\s*:\s*1440px[^)]*\)/,
    /@media\s*\([^)]*min-width\s*:\s*1600px[^)]*\)/,
  ];

  // When: compact 토큰, active grid, breakpoint 표식을 조회한다.
  const hasCompactTokens = /--admin-container-max\s*:\s*1760px/.test(html)
    && /--admin-card-padding\s*:/.test(html);
  const hasActiveGrid = /\.tab-content\.active\s*\{[^}]*display\s*:\s*grid/s.test(html);

  // Then: 밀도 토큰과 grid 및 네 개 핵심 breakpoint가 모두 존재해야 한다.
  assert.equal(hasCompactTokens, true);
  assert.equal(hasActiveGrid, true);
  breakpointPatterns.forEach((pattern) => assert.match(html, pattern));
});

test('모바일은 한국어 단어와 44px 조작 영역을 보존한다', () => {
  // Given: 모바일 컴팩트 셸의 공통 텍스트와 조작 영역 규칙이 준비되어 있다.
  const keepsKoreanWords = /\.auth-gate,\s*#adminApp,\s*\.site-footer\s*\{[^}]*word-break\s*:\s*keep-all/s.test(html);
  const preservesTouchTargets = /button:not\(\.admin-menu-backdrop\),[^{]*\{[^}]*min-width\s*:\s*var\(--admin-control-height\)[^}]*min-height\s*:\s*var\(--admin-control-height\)/s.test(html);

  // When/Then: 한국어 음절 분리와 작은 모바일 버튼이 다시 생기지 않아야 한다.
  assert.equal(keepsKoreanWords, true);
  assert.equal(preservesTouchTargets, true);
});

test('인증 전환과 탭 전환이 shell 접근성 상태를 동기화한다', () => {
  // Given: 인증 gate와 탭 전환 함수의 실제 구현을 추출한다.
  const showAuthGateSource = extractFunctionSource(domRefsSource, 'showAuthGate');
  const showAdminAppSource = extractFunctionSource(domRefsSource, 'showAdminApp');
  const openTabSource = extractFunctionSource(attendanceSource, 'openTab');

  // When: shell 동기화 호출과 신규 shell 함수 정의를 조회한다.
  const shellDefinesAuthSync = /function\s+setAdminShellAuthenticated\s*\(/.test(shellSource);
  const shellDefinesTabSync = /function\s+syncAdminTabAccessibility\s*\(/.test(shellSource);

  // Then: 인증 표시와 활성 탭 상태가 하나의 shell 계약으로 연결되어야 한다.
  assert.match(showAuthGateSource, /setAdminShellAuthenticated\s*\(\s*false\s*\)/);
  assert.match(showAdminAppSource, /setAdminShellAuthenticated\s*\(\s*true\s*\)/);
  assert.match(openTabSource, /syncAdminTabAccessibility\s*\(\s*tabName\s*\)/);
  assert.equal(shellDefinesAuthSync, true);
  assert.equal(shellDefinesTabSync, true);
});

test('admin shell 스크립트가 인증 스크립트보다 먼저 로드된다', () => {
  // Given: 관리자 페이지의 스크립트 로드 순서를 확인한다.
  const shellScriptIndex = html.indexOf('<script src="./scripts/07_admin_shell.js"></script>');
  const authScriptIndex = html.indexOf('<script src="./scripts/10_auth.js"></script>');

  // When: 신규 shell 스크립트와 인증 스크립트의 위치를 비교한다.
  const loadsBeforeAuth = shellScriptIndex >= 0 && shellScriptIndex < authScriptIndex;

  // Then: 인증 함수가 shell 함수를 안전하게 호출할 수 있도록 선행 로드되어야 한다.
  assert.equal(loadsBeforeAuth, true);
});
