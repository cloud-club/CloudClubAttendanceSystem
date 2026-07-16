#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const studentV63ApiVersion = '2026.07.14-v6.3';
const studentV63ReasonCapability = 'studentAttendanceReasonV1';
const studentV63ReasonRuntimeCheck = 'extractStudentDisplayReason';
const studentV63CacheBust = '../student.js?v=20260716-ui7';
const studentStudyDisclaimer = '이 화면에는 스터디 출석이 반영되지 않습니다. 최종 수료 여부는 스터디 출석률에 따라 달라질 수 있습니다.';
const studentV63ManualHeading = '학생 v6.3 수동 동기화 파일';
const studentV63ManualFiles = [
  'Appsscript/00_entry_api.gs',
  'Appsscript/01_constants_access.gs',
  'Appsscript/30_attendance_core.gs',
  'Appsscript/33_graduation_manual_excused.gs'
];
const studentV63PostDeployHeading = '학생 v6.3 배포 후 확인';
const studentV63PostDeployChecks = [
  'apiInfo.apiVersion = 2026.07.14-v6.3',
  'apiInfo.capabilities.studentAttendanceReasonV1 = true',
  'apiInfo.runtimeChecks.extractStudentDisplayReason = true'
];
const adminExcuseDisclosure = '입력한 사유는 학생 출석 현황에 공개됩니다. 최대 300자까지 입력할 수 있습니다.';
const studentV63CurrentPolicySnippets = [
  '현재 학생 기능 식별 계약은 2026.07.14-v6.3, studentAttendanceReasonV1=true, extractStudentDisplayReason=true입니다.',
  '기존 status와 insights를 유지하고 선택적 안전 필드 details[].displayReason만 additive로 추가합니다.',
  'Pages-first 배포에서도 구버전 Apps Script의 기존 기능은 유지되고, 사유가 없거나 legacy인 행은 비대화형으로 남습니다.',
  '공개 사유는 출석·지각·결석 Note의 선두 공개 영역에서만 읽으며, 유고는 사유를 공개하지 않습니다. 첫 번째 비어 있지 않은 비일치·내부 줄을 만나면 중단하므로 뒤의 일치 prefix는 공개하지 않습니다.',
  'Apps Script 배포는 운영자만 수행하며, 레포는 현재 외부 콘솔 상태를 단정하지 않습니다.',
  '문제가 생기면 Pages는 직전 artifact로, Apps Script는 운영자가 직전 정상 배포 버전으로 롤백합니다.'
];
const studentV63CurrentSsotFiles = [
  'DESIGN.md',
  'web/privacy.html',
  'Appsscript/README.md',
  'docs/agent/10_Usage_And_Operations.md',
  'docs/agent/30_Manual_Apps_Script_Work.md',
  'docs/Wiki/01_User_Side_Guide.md',
  'docs/Wiki/04_Operations_Runbook.md',
  'docs/Wiki/05_Data_And_RBAC_Reference.md',
  'docs/Wiki/06_Doublecheck_Regression_Gate.md'
];
const studentV63DeploymentSsotFiles = new Set([
  'Appsscript/README.md',
  'docs/agent/30_Manual_Apps_Script_Work.md',
  'docs/Wiki/04_Operations_Runbook.md',
  'docs/Wiki/06_Doublecheck_Regression_Gate.md'
]);

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

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractMarkdownSection(content, heading) {
  const escapedHeading = escapeRegex(heading);
  const match = content.match(new RegExp(`^#{2,3} ${escapedHeading}\\s*$`, 'm'));
  if (!match) throw new Error(`문서 섹션이 누락되었습니다: ${heading}`);
  const sectionStart = match.index + match[0].length;
  const tail = content.slice(sectionStart);
  const nextHeadingIndex = tail.search(/^#{1,3} /m);
  return nextHeadingIndex < 0 ? tail : tail.slice(0, nextHeadingIndex);
}

function assertExactStudentV63ManualFiles(content, label) {
  const section = extractMarkdownSection(content, studentV63ManualHeading);
  const files = Array.from(section.matchAll(/^- `([^`]+)`\s*$/gm), match => match[1]);
  if (JSON.stringify(files) !== JSON.stringify(studentV63ManualFiles)) {
    throw new Error(`${label}의 수동 동기화 파일은 정확히 네 개이며 순서도 고정되어야 합니다: ${files.join(', ')}`);
  }
}

function assertExactStudentV63PostDeployChecks(content, label) {
  const section = extractMarkdownSection(content, studentV63PostDeployHeading);
  const checks = Array.from(section.matchAll(/^\d+\. `([^`]+)`\s*$/gm), match => match[1]);
  if (JSON.stringify(checks) !== JSON.stringify(studentV63PostDeployChecks)) {
    throw new Error(`${label}의 배포 후 확인은 정확히 세 항목이며 순서도 고정되어야 합니다: ${checks.join(', ')}`);
  }
}

function extractNamedFunction(content, functionName, label) {
  const match = new RegExp(`function\\s+${escapeRegex(functionName)}\\s*\\(`).exec(content);
  if (!match) throw new Error(`${label}에서 함수를 찾지 못했습니다: ${functionName}`);
  const openingBraceIndex = content.indexOf('{', match.index);
  const closingBraceIndex = findClosingBrace(content, openingBraceIndex);
  return content.slice(match.index, closingBraceIndex + 1);
}

function assertRejected(assertion, message) {
  let rejected = false;
  try {
    assertion();
  } catch (error) {
    rejected = true;
  }
  if (!rejected) throw new Error(message);
}

function assertStudentV63CurrentSsotDocument(relativePath, content) {
  studentV63CurrentPolicySnippets.forEach(snippet => {
    if (!content.includes(snippet)) throw new Error(`${relativePath}의 v6.3 현재 정책 누락: ${snippet}`);
  });
  if (studentV63DeploymentSsotFiles.has(relativePath)) {
    assertExactStudentV63ManualFiles(content, relativePath);
    assertExactStudentV63PostDeployChecks(content, relativePath);
  }
}

function buildStudentV63CurrentSsotFixture(relativePath) {
  let fixture = studentV63CurrentPolicySnippets.join('\n');
  if (studentV63DeploymentSsotFiles.has(relativePath)) {
    fixture += `\n\n### ${studentV63ManualHeading}\n\n${studentV63ManualFiles.map(file => `- \`${file}\``).join('\n')}`;
    fixture += `\n\n### ${studentV63PostDeployHeading}\n\n${studentV63PostDeployChecks.map((check, index) => `${index + 1}. \`${check}\``).join('\n')}`;
  }
  return fixture;
}

function extractStyleText(html) {
  const styles = Array.from(html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)).map(match => match[1]);
  if (styles.length === 0) {
    throw new Error('학생 페이지의 style 블록을 찾지 못했습니다.');
  }
  return styles.join('\n');
}

function maskCssComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, comment => comment.replace(/[^\n]/g, ' '));
}

function maskHtmlComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, comment => comment.replace(/[^\n]/g, ' '));
}

function parseHtmlAttributes(openingTag) {
  const attributes = {};
  let index = 1;

  while (index < openingTag.length && !/[\s/>]/.test(openingTag[index])) index += 1;
  while (index < openingTag.length) {
    while (index < openingTag.length && /[\s/]/.test(openingTag[index])) index += 1;
    if (index >= openingTag.length || openingTag[index] === '>') break;

    const nameStart = index;
    while (index < openingTag.length && !/[\s=/>]/.test(openingTag[index])) index += 1;
    const name = openingTag.slice(nameStart, index).toLowerCase();
    while (index < openingTag.length && /\s/.test(openingTag[index])) index += 1;

    let value = '';
    if (openingTag[index] === '=') {
      index += 1;
      while (index < openingTag.length && /\s/.test(openingTag[index])) index += 1;
      const quote = openingTag[index] === '"' || openingTag[index] === "'" ? openingTag[index] : '';
      if (quote) {
        index += 1;
        const valueStart = index;
        while (index < openingTag.length && openingTag[index] !== quote) index += 1;
        value = openingTag.slice(valueStart, index);
        if (openingTag[index] === quote) index += 1;
      } else {
        const valueStart = index;
        while (index < openingTag.length && !/[\s>]/.test(openingTag[index])) index += 1;
        value = openingTag.slice(valueStart, index);
      }
    }
    if (name) attributes[name] = value;
  }
  return attributes;
}

function scanHtmlTags(html) {
  const source = maskHtmlComments(html);
  const tags = [];
  let cursor = 0;

  while (cursor < source.length) {
    const start = source.indexOf('<', cursor);
    if (start < 0) break;
    let index = start + 1;
    const isClosing = source[index] === '/';
    if (isClosing) index += 1;
    if (!/[A-Za-z]/.test(source[index] || '')) {
      cursor = start + 1;
      continue;
    }

    const nameStart = index;
    while (index < source.length && /[A-Za-z0-9:-]/.test(source[index])) index += 1;
    const tagName = source.slice(nameStart, index).toLowerCase();
    let quote = '';
    while (index < source.length) {
      const character = source[index];
      if (quote) {
        if (character === quote) quote = '';
      } else if (character === '"' || character === "'") {
        quote = character;
      } else if (character === '>') {
        break;
      }
      index += 1;
    }
    if (index >= source.length) throw new Error(`닫히지 않은 HTML 태그가 있습니다: ${tagName}`);

    const raw = source.slice(start, index + 1);
    tags.push({
      start,
      end: index + 1,
      raw,
      tagName,
      isClosing,
      isSelfClosing: /\/\s*>$/.test(raw),
      attributes: isClosing ? {} : parseHtmlAttributes(raw)
    });
    cursor = index + 1;
  }
  return tags;
}

function classTokens(attributes) {
  return (attributes.class || '').split(/\s+/).filter(Boolean);
}

function findClosingBrace(css, openingBraceIndex) {
  let depth = 0;
  let quote = '';
  let escaped = false;

  for (let index = openingBraceIndex; index < css.length; index += 1) {
    const character = css[index];
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = '';
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '{') {
      depth += 1;
    } else if (character === '}') {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  throw new Error('CSS 블록의 닫는 중괄호를 찾지 못했습니다.');
}

function findCssBlocks(css, headerRegex) {
  const flags = headerRegex.flags.includes('g') ? headerRegex.flags : `${headerRegex.flags}g`;
  const regex = new RegExp(headerRegex.source, flags);
  const blocks = [];
  let match = null;
  while ((match = regex.exec(css)) !== null) {
    const openingBraceIndex = css.indexOf('{', match.index);
    const closingBraceIndex = findClosingBrace(css, openingBraceIndex);
    blocks.push({
      start: match.index,
      openingBraceIndex,
      closingBraceIndex,
      end: closingBraceIndex + 1,
      body: css.slice(openingBraceIndex + 1, closingBraceIndex)
    });
  }
  return blocks;
}

function requireSingleCssBlock(css, headerRegex, message) {
  const blocks = findCssBlocks(css, headerRegex);
  if (blocks.length !== 1) {
    throw new Error(`${message} (found ${blocks.length})`);
  }
  return blocks[0];
}

function readCssProperty(ruleBody, propertyName) {
  const match = ruleBody.match(new RegExp(`(?:^|;)\\s*${escapeRegex(propertyName)}\\s*:\\s*([^;}]+)`, 'i'));
  return match ? match[1].trim() : '';
}

function normalizeCssValue(value) {
  return value.replace(/\s+/g, '').toLowerCase();
}

function findHtmlElementByClass(html, tagName, className) {
  const normalizedTagName = tagName.toLowerCase();
  const tags = scanHtmlTags(html);
  for (let tagIndex = 0; tagIndex < tags.length; tagIndex += 1) {
    const openingTag = tags[tagIndex];
    if (openingTag.isClosing || openingTag.tagName !== normalizedTagName || !classTokens(openingTag.attributes).includes(className)) continue;

    let depth = 1;
    for (let candidateIndex = tagIndex + 1; candidateIndex < tags.length; candidateIndex += 1) {
      const candidate = tags[candidateIndex];
      if (candidate.tagName !== normalizedTagName) continue;
      depth += candidate.isClosing ? -1 : 1;
      if (depth !== 0) continue;
      return {
        start: openingTag.start,
        openingTag: openingTag.raw,
        openingEnd: openingTag.end,
        closingStart: candidate.start,
        end: candidate.end,
        innerHtml: html.slice(openingTag.end, candidate.start),
        outerHtml: html.slice(openingTag.start, candidate.end)
      };
    }
    throw new Error(`${className} 요소의 닫는 ${tagName} 태그를 찾지 못했습니다.`);
  }
  throw new Error(`${className} 클래스를 가진 ${tagName} 요소를 찾지 못했습니다.`);
}

function findHtmlElementById(html, id) {
  const tags = scanHtmlTags(html);
  const tagIndex = tags.findIndex(tag => !tag.isClosing && tag.attributes.id === id);
  if (tagIndex < 0) throw new Error(`${id} ID를 가진 요소를 찾지 못했습니다.`);

  const openingTag = tags[tagIndex];
  let depth = 1;
  for (let candidateIndex = tagIndex + 1; candidateIndex < tags.length; candidateIndex += 1) {
    const candidate = tags[candidateIndex];
    if (candidate.tagName !== openingTag.tagName) continue;
    depth += candidate.isClosing ? -1 : 1;
    if (depth !== 0) continue;
    return {
      start: openingTag.start,
      openingTag: openingTag.raw,
      openingEnd: openingTag.end,
      closingStart: candidate.start,
      end: candidate.end,
      innerHtml: html.slice(openingTag.end, candidate.start),
      outerHtml: html.slice(openingTag.start, candidate.end)
    };
  }
  throw new Error(`${id} 요소의 닫는 ${openingTag.tagName} 태그를 찾지 못했습니다.`);
}

function getDirectChildElements(element) {
  const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  const children = [];
  const tags = scanHtmlTags(element.innerHtml);
  let depth = 0;
  for (const tag of tags) {
    if (tag.isClosing) {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (depth === 0) {
      children.push({tagName: tag.tagName, attributes: tag.attributes, classes: classTokens(tag.attributes)});
    }
    if (!tag.isSelfClosing && !voidTags.has(tag.tagName)) depth += 1;
  }
  return children;
}

function findFormBySubmitHandler(html, handler) {
  const tags = scanHtmlTags(html);
  const expectedHandler = `${handler}(event)`;
  for (let index = 0; index < tags.length; index += 1) {
    const openingTag = tags[index];
    if (openingTag.isClosing || openingTag.tagName !== 'form' || (openingTag.attributes.onsubmit || '').replace(/\s+/g, '') !== expectedHandler) continue;
    let depth = 1;
    for (let candidateIndex = index + 1; candidateIndex < tags.length; candidateIndex += 1) {
      const candidate = tags[candidateIndex];
      if (candidate.tagName !== 'form') continue;
      depth += candidate.isClosing ? -1 : 1;
      if (depth === 0) return html.slice(openingTag.start, candidate.end);
    }
    throw new Error(`${handler} 폼의 닫는 태그를 찾지 못했습니다.`);
  }
  throw new Error(`${handler} 제출 폼을 찾지 못했습니다.`);
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
  const expected = ['adminUsers', 'seasonImport'];
  if (JSON.stringify(keys) !== JSON.stringify(expected)) {
    throw new Error(`SUPER_ONLY_TABS 불일치: expected=${expected.join(',')} actual=${keys.join(',')}`);
  }
  if (keys.includes('fortune')) {
    throw new Error('fortune 탭이 SUPER_ONLY_TABS에 포함되어 있습니다.');
  }
}

function checkVariableManagementAccessPolicy() {
  const accessContent = readFile('Appsscript/01_constants_access.gs');
  const routerContent = readFile('Appsscript/00_entry_api.gs');
  const authContent = readFile('web/admin/scripts/10_auth.js');
  const variablesContent = readFile('web/admin/scripts/24_variables.js');
  const indexHtml = readFile('web/admin/index.html');
  const variableActions = [
    'variablesGet',
    'variablesUpdate',
    'variablesNormalize',
    'variablesResetTemplate'
  ];

  variableActions.forEach((action) => {
    if (!accessContent.includes(`${action}: ACTION_ACCESS_ADMIN`)) {
      throw new Error(`일반 운영진 변수 관리 권한 누락: ${action}`);
    }
  });

  const variableCases = routerContent.match(/case 'variablesGet':[\s\S]*?case 'scheduleList':/) || [];
  assertNotRegex(
    variableCases[0] || '',
    /ensureSuper\(\)/,
    'variables 라우터 case에 Super 전용 중복 가드가 남아 있습니다.'
  );
  assertRegex(
    authContent,
    /if \(activeTab === 'variables'\)\s*\{\s*await loadVariables\(\);\s*return;\s*\}/,
    'season_admin의 variables 탭 새로고침 경로가 열려 있지 않습니다.'
  );
  assertRegex(
    variablesContent,
    /const required = \['apiInfo', 'variablesGet', 'variablesUpdate', 'variablesNormalize', 'variablesResetTemplate'\];/,
    '변수 API 호환성 검사에 variablesUpdate가 포함되어 있지 않습니다.'
  );
  assertRegex(
    variablesContent,
    /variableActions\.every\(action => accessLevelByAction\[action\] === 'admin'\)/,
    'season_admin 변수 탭이 apiInfo의 admin 접근 레벨을 확인하지 않습니다.'
  );
  assertNotRegex(
    indexHtml,
    /<button[^>]*data-super-only="true"[^>]*openTab\('variables', event\)/,
    'variables 탭 버튼이 Super 전용으로 표시되어 있습니다.'
  );
  assertRegex(
    indexHtml,
    /<button[^>]*data-super-only="true"[^>]*openTab\('seasonImport', event\)/,
    'seasonImport 탭의 Super 전용 표시가 누락되었습니다.'
  );
  assertRegex(
    indexHtml,
    /<button[^>]*data-super-only="true"[^>]*openTab\('adminUsers', event\)/,
    'adminUsers 탭의 Super 전용 표시가 누락되었습니다.'
  );
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
    /<div\b(?=[^>]*\bid="fortune")(?=[^>]*\bclass="[^"]*\btab-content\b[^"]*")[^>]*>/,
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

function checkStudentInsightContracts() {
  const entryApi = readFile('Appsscript/00_entry_api.gs');
  const accessConstants = readFile('Appsscript/01_constants_access.gs');
  const attendanceCore = readFile('Appsscript/30_attendance_core.gs');
  const graduationCore = readFile('Appsscript/33_graduation_manual_excused.gs');

  assertRegex(
    attendanceCore,
    /function summarizeAttendanceComparison\(/,
    '학생 평균 비교 순수 helper가 누락되었습니다.'
  );
  assertRegex(
    graduationCore,
    /function buildGraduationAssessment\(/,
    '학생 수료 판정 순수 helper가 누락되었습니다.'
  );
  assertRegex(
    attendanceCore,
    /insights\s*:/,
    '학생 status 응답의 additive insights 계약이 누락되었습니다.'
  );
  assertRegex(attendanceCore, /graduationEffectivePastCount\+\+;/, '진행 중 출석을 수료 계산 분모에 반영하지 않습니다.');
  assertRegex(attendanceCore, /remainingSessions:\s*remainingSessionCount/, '수료 최종 판정이 남은 일정 수를 사용하지 않습니다.');
  assertRegex(graduationCore, /const isFinal = remainingSessions === 0;/, '수료 최종 판정이 일정 종료 여부와 분리되어 있지 않습니다.');
  assertRegex(graduationCore, /Math\.ceil\(Math\.max\(0, Number\(values\.requiredAttendanceCount\)/, '필수 출석 횟수의 정수 정규화가 누락되었습니다.');
  assertRegex(accessConstants, /const API_VERSION = '2026\.07\.14-v6\.3';/, '학생 사유 공개 Apps Script 버전 식별자가 갱신되지 않았습니다.');
  ['summarizeAttendanceComparison', 'resolveGraduationCriteria', 'buildGraduationAssessment', studentV63ReasonRuntimeCheck].forEach((name) => {
    assertRegex(entryApi, new RegExp(`${name}: typeof ${name} === 'function'`), `apiInfo.runtimeChecks 누락: ${name}`);
  });
  assertRegex(entryApi, /studentInsightsV1:\s*true/, '학생 인사이트 capability가 누락되었습니다.');
  assertRegex(entryApi, new RegExp(`${studentV63ReasonCapability}:\\s*true`), '학생 사유 공개 capability가 누락되었습니다.');
}

function checkStudentV63CacheBust() {
  // Given the v6.3 Pages asset, when the browser loads the student bundle,
  // then the exact reviewed cache key must be used.
  const studentHtml = readFile('web/student/latest/index.html');
  assertRegex(
    studentHtml,
    new RegExp(`<script src="${escapeRegex(studentV63CacheBust)}"><\\/script>`),
    `학생 스크립트 cache bust가 ${studentV63CacheBust}가 아닙니다.`
  );
}

function checkStudentV63CurrentSsot() {
  // Given a Pages-first rollout, when an operator reads any current deployment guide,
  // then the same additive contract, legacy behavior, version, capability, and runtime check must be present.
  studentV63CurrentSsotFiles.forEach(relativePath => {
    const fixture = buildStudentV63CurrentSsotFixture(relativePath);
    const missingIdentity = fixture.replace(studentV63CurrentPolicySnippets[0], '');
    assertRejected(
      () => assertStudentV63CurrentSsotDocument(relativePath, missingIdentity),
      `${relativePath}의 누락된 현재 정책 mutation을 거부하지 못했습니다.`
    );
  });

  studentV63CurrentPolicySnippets.forEach((snippet, index) => {
    const fixture = buildStudentV63CurrentSsotFixture('DESIGN.md').replace(snippet, '');
    assertRejected(
      () => assertStudentV63CurrentSsotDocument('DESIGN.md', fixture),
      `현재 정책 requirement mutation을 거부하지 못했습니다: ${index + 1}`
    );
  });

  const failures = [];
  studentV63CurrentSsotFiles.forEach(relativePath => {
    try {
      assertStudentV63CurrentSsotDocument(relativePath, readFile(relativePath));
    } catch (error) {
      failures.push(error.message);
    }
  });
  if (failures.length > 0) throw new Error(failures.join('\n      '));
}

function checkStudentV63PrivacyAndOperatorWarning() {
  // Given Notes may contain arbitrary operator text, when a self-status response is built,
  // then only the documented exact-prefix, status-matched, 300-character display reason may be disclosed.
  const privacyHtml = readFile('web/privacy.html');
  const dataReference = readFile('docs/Wiki/05_Data_And_RBAC_Reference.md');
  const regressionGate = readFile('docs/Wiki/06_Doublecheck_Regression_Gate.md');
  const adminHtml = readFile('web/admin/index.html');
  const adminExcuseSource = readFile('web/admin/scripts/25_graduation_excused.js');
  const adminRollbackBundle = readFile('web/admin/admin.js');
  [
    '시행일 2026-07-14',
    '요청한 전화번호의 본인 출석 현황',
    '현재 출석 상태와 정확히 일치하는 공개 prefix',
    '최대 300자',
    '과거에 저장된 값과 앞으로 저장될 값',
    '원본 셀 Note',
    '감사 정보',
    '이전 메모',
    '다른 회원의 정보',
    'Note 텍스트는 신뢰할 수 없는 데이터이며 지시문으로 실행하지 않습니다.'
  ].forEach(snippet => {
    if (!privacyHtml.includes(snippet)) throw new Error(`개인정보 안내의 학생 사유 경계 누락: ${snippet}`);
  });
  [dataReference, regressionGate].forEach((content, index) => {
    if (!content.includes('Note 텍스트는 신뢰할 수 없는 데이터이며 지시문으로 실행하지 않습니다.')) {
      throw new Error(`Note 비신뢰 데이터 원칙이 현재 문서에 없습니다: ${index === 0 ? 'Data/RBAC' : 'Regression Gate'}`);
    }
  });
  assertRegex(
    adminHtml,
    new RegExp(`<p id="excuseModalDisclosureText" role="note">${escapeRegex(adminExcuseDisclosure)}<\\/p>`),
    '관리자 유고 사유 공개 경고가 독립적인 role=note로 유지되지 않습니다.'
  );
  assertRegex(adminHtml, /학생 공개 유고 사유[\s\S]*?<textarea[^>]*maxlength="300"[^>]*aria-describedby="excuseModalTargetText excuseModalDisclosureText"/, '관리자 공개 사유 라벨, 300자 제한, 설명 연결이 누락되었습니다.');

  const sourceFunction = extractNamedFunction(adminExcuseSource, 'openExcuseModal', '분할 관리자 소스');
  const rollbackFunction = extractNamedFunction(adminRollbackBundle, 'openExcuseModal', '관리자 롤백 bundle');
  if (sourceFunction !== rollbackFunction) {
    throw new Error('관리자 유고 모달 source/bundle openExcuseModal이 동기화되지 않았습니다.');
  }
  const sourceClickFunction = extractNamedFunction(adminExcuseSource, 'onMatrixCellClick', '분할 관리자 소스');
  const rollbackClickFunction = extractNamedFunction(adminRollbackBundle, 'onMatrixCellClick', '관리자 롤백 bundle');
  if (sourceClickFunction !== rollbackClickFunction) {
    throw new Error('관리자 유고 모달 source/bundle onMatrixCellClick이 동기화되지 않았습니다.');
  }
  const sourceMatrixFunction = extractNamedFunction(adminExcuseSource, 'buildGraduationMatrixRowHtml', '분할 관리자 소스');
  const rollbackMatrixFunction = extractNamedFunction(adminRollbackBundle, 'renderGraduationMatrix', '관리자 롤백 bundle');
  [sourceMatrixFunction, rollbackMatrixFunction].forEach((matrixFunction, index) => {
    assertNotRegex(matrixFunction, /data-note|detail\.note/, `관리자 ${index === 0 ? '분할 소스' : '롤백 bundle'} matrix가 원본 Note를 DOM에 보관합니다.`);
    assertRegex(matrixFunction, /data-public-reason="\$\{escapeHtml\(detail\.displayReason \|\| ''\)\}"/, `관리자 ${index === 0 ? '분할 소스' : '롤백 bundle'} matrix의 공개 사유 필드가 누락되었습니다.`);
  });
  [sourceClickFunction, rollbackClickFunction].forEach((clickFunction, index) => {
    assertNotRegex(clickFunction, /dataset\.note|state\.note/, `관리자 ${index === 0 ? '분할 소스' : '롤백 bundle'} click 경로가 원본 Note를 사용합니다.`);
    assertRegex(clickFunction, /const publicReason = btn\.dataset\.publicReason \|\| '';/, `관리자 ${index === 0 ? '분할 소스' : '롤백 bundle'} click 경로가 공개 사유만 읽지 않습니다.`);
    assertRegex(clickFunction, /publicReason,/, `관리자 ${index === 0 ? '분할 소스' : '롤백 bundle'} modal state에 공개 사유가 누락되었습니다.`);
  });
  assertRegex(sourceFunction, /const disclosure = document\.getElementById\('excuseModalDisclosureText'\);/, '관리자 유고 모달이 독립 공개 경고를 확인하지 않습니다.');
  assertRegex(sourceFunction, /if \(!modal \|\| !target \|\| !disclosure \|\| !input\) return;/, '관리자 유고 모달의 공개 경고 필수 노드 가드가 누락되었습니다.');
  assertRegex(sourceFunction, /target\.textContent = `\$\{state\.memberName\} \/ \$\{state\.sessionKey\} 에 유고 사유를 저장합니다\.`;/, '관리자 유고 모달의 대상 문맥 textContent 갱신이 누락되었습니다.');
  assertRegex(sourceFunction, /input\.value = state\.publicReason \|\| '';/, '관리자 유고 모달이 안전한 공개 사유만 prefill하지 않습니다.');
  assertNotRegex(sourceFunction, /state\.note/, '관리자 유고 모달이 원본 Note를 prefill합니다.');
  assertNotRegex(sourceFunction, /disclosure\.(?:textContent|innerHTML)\s*=/, '관리자 유고 모달이 열릴 때 고정 공개 경고를 덮어씁니다.');
}

function checkStudentV63DesignAndUserDocs() {
  // Given the compact dashboard/detail design, when contributors read design, user, or QA guidance,
  // then the exact three-tab, responsive, dialog, and study-disclaimer contracts must agree.
  const design = readFile('DESIGN.md');
  const userGuide = readFile('docs/Wiki/01_User_Side_Guide.md');
  const regressionGate = readFile('docs/Wiki/06_Doublecheck_Regression_Gate.md');
  [design, userGuide, regressionGate].forEach((content, index) => {
    if (!content.includes(studentStudyDisclaimer)) {
      throw new Error(`스터디 출석 정적 안내가 현재 문서에 없습니다: ${['DESIGN', 'User Guide', 'Regression Gate'][index]}`);
    }
  });
  [
    '출석하기 → 출석 현황 → 수료 조건 확인',
    '1200px',
    '769px',
    'role="dialog"',
    '사유가 있는 행만'
  ].forEach(snippet => {
    if (!design.includes(snippet)) throw new Error(`DESIGN의 학생 컴팩트 dashboard/detail 계약 누락: ${snippet}`);
  });
  ['3개 탭', '사유가 있는 행만', 'Escape', '포커스'].forEach(snippet => {
    if (!userGuide.includes(snippet)) throw new Error(`사용자 가이드의 학생 사유/접근성 설명 누락: ${snippet}`);
  });
}

function checkStudentV63ManualHandoff() {
  // Given a four-file Apps Script handoff, when any current operator checklist is parsed,
  // then missing, extra, reordered, or partial synchronization must be rejected.
  [
    'Appsscript/README.md',
    'docs/agent/30_Manual_Apps_Script_Work.md',
    'docs/Wiki/04_Operations_Runbook.md',
    'docs/Wiki/06_Doublecheck_Regression_Gate.md'
  ].forEach(relativePath => {
    const content = readFile(relativePath);
    assertExactStudentV63ManualFiles(content, relativePath);
    assertExactStudentV63PostDeployChecks(content, relativePath);
  });

  const validFixture = `### ${studentV63ManualHeading}\n\n${studentV63ManualFiles.map(file => `- \`${file}\``).join('\n')}\n`;
  const malformedFixtures = [
    validFixture.replace(`- \`${studentV63ManualFiles[3]}\`\n`, ''),
    `${validFixture}- \`Appsscript/90_common_utils.gs\`\n`,
    validFixture.replace(
      `- \`${studentV63ManualFiles[1]}\`\n- \`${studentV63ManualFiles[2]}\``,
      `- \`${studentV63ManualFiles[2]}\`\n- \`${studentV63ManualFiles[1]}\``
    )
  ];
  malformedFixtures.forEach((fixture, index) => {
    let rejected = false;
    try {
      assertExactStudentV63ManualFiles(fixture, `malformed fixture ${index + 1}`);
    } catch (error) {
      rejected = true;
    }
    if (!rejected) throw new Error(`잘못된 수동 동기화 fixture를 거부하지 못했습니다: ${index + 1}`);
  });

  const validPostDeployFixture = `### ${studentV63PostDeployHeading}\n\n${studentV63PostDeployChecks.map((check, index) => `${index + 1}. \`${check}\``).join('\n')}\n`;
  const malformedPostDeployFixtures = [
    validPostDeployFixture.replace(`3. \`${studentV63PostDeployChecks[2]}\`\n`, ''),
    `${validPostDeployFixture}4. \`apiInfo.runtimeChecks.unexpected = true\`\n`,
    validPostDeployFixture.replace(
      `1. \`${studentV63PostDeployChecks[0]}\`\n2. \`${studentV63PostDeployChecks[1]}\``,
      `1. \`${studentV63PostDeployChecks[1]}\`\n2. \`${studentV63PostDeployChecks[0]}\``
    )
  ];
  malformedPostDeployFixtures.forEach((fixture, index) => {
    let rejected = false;
    try {
      assertExactStudentV63PostDeployChecks(fixture, `malformed post-deploy fixture ${index + 1}`);
    } catch (error) {
      rejected = true;
    }
    if (!rejected) throw new Error(`잘못된 배포 후 확인 fixture를 거부하지 못했습니다: ${index + 1}`);
  });
}

function checkStudentV63History() {
  // Given the verified v6.3 change, when future operators inspect History,
  // then decisions, privacy rationale, verifier fixes, evidence, and rollout boundary must remain recoverable.
  const history = readFile('docs/History/student-page-v6.3-compact-dashboard-detail.md');
  [
    '기록일: 2026-07-14',
    '역사/배경 기록이며 현재 정책 정본이 아닙니다.',
    '현재 정책은 `docs/Wiki/*`와 `Appsscript/*`, `web/*` 코드를 우선합니다.',
    '## 목표',
    '## 결정',
    '## 개인정보 판단',
    '## 검증자가 발견한 수정',
    'prototype-key',
    '부분 동기화',
    'stale request',
    'cache sanitization',
    'detached focus',
    '## 검증',
    '## 배포 경계'
  ].forEach(snippet => {
    if (!history.includes(snippet)) throw new Error(`학생 v6.3 History 누락: ${snippet}`);
  });
}

function checkStudentFourTabNavigation() {
  const studentHtml = readFile('web/student/latest/index.html');
  const studentJs = readFile('web/student/student.js');

  ['attend', 'status', 'schedule', 'completion'].forEach((tabName) => {
    assertRegex(
      studentHtml,
      new RegExp(`role="tab"[^>]*data-student-tab="${tabName}"`),
      `학생 데스크톱 탭이 누락되었습니다: ${tabName}`
    );
    assertRegex(
      studentHtml,
      new RegExp(`class="mobile-drawer-button[^>]*"[^>]*data-student-tab="${tabName}"`),
      `학생 모바일 메뉴 항목이 누락되었습니다: ${tabName}`
    );
  });

  assertRegex(
    studentHtml,
    /id="studentMenuButton"[\s\S]*aria-controls="studentMobileMenu"[\s\S]*aria-expanded="false"/,
    '학생 모바일 메뉴 버튼의 접근성 상태가 누락되었습니다.'
  );
  assertRegex(
    studentHtml,
    /id="studentMobileMenu"[^>]*aria-hidden="true"[^>]*inert/,
    '학생 모바일 메뉴의 초기 비활성 상태가 누락되었습니다.'
  );
  assertRegex(
    studentJs,
    /drawer\.toggleAttribute\('inert', !shouldOpen\)/,
    '학생 모바일 메뉴의 inert 상태 동기화가 누락되었습니다.'
  );
  assertRegex(
    studentJs,
    /const firstButton = drawer\.querySelector\('\.mobile-drawer-button'\);[\s\S]*firstButton\.focus\(\)/,
    '학생 모바일 메뉴가 첫 메뉴 항목으로 포커스를 이동하지 않습니다.'
  );
  assertRegex(
    studentJs,
    /event\.key === 'Escape'[\s\S]*setStudentMenuOpen\(false\)/,
    '학생 모바일 메뉴 Escape 닫기가 누락되었습니다.'
  );
  assertRegex(
    studentJs,
    /const currentIndex = focusable\.indexOf\(document\.activeElement\);[\s\S]*event\.preventDefault\(\);[\s\S]*focusable\[\(currentIndex \+ offset \+ focusable\.length\) % focusable\.length\]\.focus\(\)/,
    '학생 모바일 메뉴의 양방향 순환 포커스가 누락되었습니다.'
  );
  assertRegex(
    studentJs,
    /if \(tabName === 'status' && currentSeason\) loadRankings\(\)/,
    '학생 순위의 출석 현황 탭 지연 로딩이 누락되었습니다.'
  );
  assertRegex(
    studentJs,
    /document\.getElementById\('status'\)\?\.classList\.contains\('active'\)[\s\S]*await loadRankings\(\)/,
    '시즌 확인 전에 출석 현황 탭을 연 경우의 순위 로딩 복구가 누락되었습니다.'
  );
  assertRegex(
    studentJs,
    /Apps Script 업데이트 후 확인 가능/,
    '구버전 Apps Script 연결 시 학생 인사이트 폴백 안내가 누락되었습니다.'
  );
  assertRegex(studentJs, /metric-grid single-metric[\s\S]*formatOneDecimal\(fallbackRate\)/, '구버전 Apps Script에서 본인 출석률 폴백이 누락되었습니다.');
  assertRegex(studentJs, /getStatusCounts\(data, completion\)/, '현재 회차 출석 횟수에 completion/detail 우선 계산이 적용되지 않았습니다.');
  assertRegex(studentJs, /studentStatusCacheGeneration\+\+/, '학생 상태 캐시 무효화 세대가 누락되었습니다.');
  assertRegex(studentJs, /studentRankingRequest\.promise && studentRankingRequest\.season === seasonAlias/, '학생 순위 중복 요청 합치기가 누락되었습니다.');
  assertRegex(studentJs, /requestGeneration !== studentRankingCacheGeneration/, '학생 순위 오래된 응답 차단이 누락되었습니다.');
  assertRegex(studentJs, /prefers-reduced-motion: reduce/, '감소된 모션 환경의 confetti 차단이 누락되었습니다.');
  assertRegex(
    studentHtml,
    /onsubmit="checkCompletionStatus\(event\)"/,
    '수료 조건 확인 제출 wiring이 누락되었습니다.'
  );
  assertRegex(studentHtml, /id="completionPhoneInput"/, '수료 조건 확인 전화번호 입력이 누락되었습니다.');
  assertRegex(
    studentHtml,
    /id="statusResult"[^>]*role="status"[^>]*aria-live="polite"/,
    '학생 출석 현황 결과의 실시간 상태 알림이 누락되었습니다.'
  );
  assertRegex(studentJs, /class="ranking-table-scroll"[^>]*tabindex="0"/, '모바일 순위 표의 가로 스크롤 영역이 누락되었습니다.');
  assertRegex(studentHtml, /\.legal-links a\s*\{[\s\S]*min-height:\s*44px/, '학생 정책 링크의 44px 터치 영역이 누락되었습니다.');
  assertRegex(studentHtml, /fa-xmark menu-icon-close/, '모바일 메뉴의 시각적 닫기 아이콘이 누락되었습니다.');
  assertRegex(studentHtml, /href="\.\.\/\.\.\/privacy\.html"/, '학생 개인정보 처리 안내 링크가 없습니다.');
  assertRegex(studentHtml, /href="\.\.\/\.\.\/terms\.html"/, '학생 이용약관 링크가 없습니다.');
}

function checkStudentDesktopTabTouchTarget() {
  const studentHtml = readFile('web/student/latest/index.html');
  const css = maskCssComments(extractStyleText(studentHtml));
  const desktopMedia = requireSingleCssBlock(
    css,
    /@media\s*\(\s*min-width\s*:\s*769px\s*\)\s*\{/gi,
    '학생 데스크톱 769px media block은 정확히 하나여야 합니다.'
  );
  const desktopTabButton = requireSingleCssBlock(
    desktopMedia.body,
    /\.tab-button\s*\{/gi,
    '학생 데스크톱 탭 버튼의 전용 크기 규칙이 유일하지 않습니다.'
  );
  const minHeight = Number.parseFloat(readCssProperty(desktopTabButton.body, 'min-height'));
  if (!Number.isFinite(minHeight) || minHeight < 44) {
    throw new Error('학생 데스크톱 탭 버튼은 최소 44px 높이를 가져야 합니다.');
  }
}

function checkStudentStatusFirstViewportComposition() {
  const studentHtml = readFile('web/student/latest/index.html');
  const studentJs = readFile('web/student/student.js');
  const css = maskCssComments(extractStyleText(studentHtml));
  const desktopMedia = requireSingleCssBlock(
    css,
    /@media\s*\(\s*min-width\s*:\s*769px\s*\)\s*\{/gi,
    '학생 데스크톱 769px media block은 정확히 하나여야 합니다.'
  );
  const mobileMedia = requireSingleCssBlock(
    css,
    /@media\s*\(\s*max-width\s*:\s*768px\s*\)\s*\{/gi,
    '학생 모바일 768px media block은 정확히 하나여야 합니다.'
  );

  assertRegex(
    studentJs,
    /class="status-dashboard-layout"[\s\S]*?class="status-dashboard-group status-comparison-group"[\s\S]*?renderStatusComparison\(comparison, displayRate\)[\s\S]*?class="status-dashboard-group status-count-group"[\s\S]*?class="metric-grid count-grid status-count-grid"[\s\S]*?<section class="status-details"/,
    '학생 현황의 비교·횟수 그룹 병렬 composition이 누락되었습니다.'
  );

  const desktopLayout = requireSingleCssBlock(
    desktopMedia.body,
    /\.status-dashboard-layout\s*\{/gi,
    '학생 현황 데스크톱 dashboard layout 규칙이 유일하지 않습니다.'
  );
  if (!/^minmax\(0,[^)]+\)minmax\(0,[^)]+\)$/.test(normalizeCssValue(readCssProperty(desktopLayout.body, 'grid-template-columns')))) {
    throw new Error('학생 현황 데스크톱 dashboard는 비교·횟수 2열이어야 합니다.');
  }

  const mobileLayout = requireSingleCssBlock(
    mobileMedia.body,
    /\.status-dashboard-layout\s*\{/gi,
    '학생 현황 모바일 dashboard layout 규칙이 유일하지 않습니다.'
  );
  if (normalizeCssValue(readCssProperty(mobileLayout.body, 'grid-template-columns')) !== 'minmax(0,1fr)') {
    throw new Error('학생 현황 모바일 dashboard는 읽기 순서를 유지한 1열이어야 합니다.');
  }
}

function checkStudentDrawerCloseControlSurface() {
  const studentHtml = readFile('web/student/latest/index.html');
  const studentJs = readFile('web/student/student.js');
  const structuralHtml = maskHtmlComments(studentHtml);
  const css = maskCssComments(extractStyleText(studentHtml));
  const container = findHtmlElementByClass(structuralHtml, 'div', 'container');
  const directChildren = getDirectChildElements(container);
  const buttonIndex = directChildren.findIndex(child => child.attributes.id === 'studentMenuButton');
  const drawerIndex = directChildren.findIndex(child => child.attributes.id === 'studentMobileMenu');
  if (buttonIndex < 0 || drawerIndex < 0 || buttonIndex >= drawerIndex) {
    throw new Error('열린 메뉴의 단일 닫기 버튼은 drawer와 같은 stacking context의 앞선 직접 자식이어야 합니다.');
  }

  const mobileMedia = requireSingleCssBlock(
    css,
    /@media\s*\(\s*max-width\s*:\s*768px\s*\)\s*\{/gi,
    '학생 모바일 768px media block은 정확히 하나여야 합니다.'
  );
  const menuButton = requireSingleCssBlock(mobileMedia.body, /\.mobile-menu-button\s*\{/gi, '학생 모바일 메뉴 버튼 규칙이 유일하지 않습니다.');
  const drawer = requireSingleCssBlock(mobileMedia.body, /\.mobile-menu-drawer\s*\{/gi, '학생 모바일 drawer 규칙이 유일하지 않습니다.');
  const buttonZIndex = Number.parseInt(readCssProperty(menuButton.body, 'z-index'), 10);
  const drawerZIndex = Number.parseInt(readCssProperty(drawer.body, 'z-index'), 10);
  const buttonHeight = Number.parseFloat(readCssProperty(menuButton.body, 'height'));
  const buttonWidth = Number.parseFloat(readCssProperty(menuButton.body, 'width'));
  if (!(buttonZIndex > drawerZIndex && buttonHeight >= 44 && buttonWidth >= 44)) {
    throw new Error('모바일 메뉴 닫기 버튼은 drawer 위에서 44x44px 이상이어야 합니다.');
  }
  assertRegex(
    studentJs,
    /Array\.from\(drawer\.querySelectorAll\('\.mobile-drawer-button'\)\)\.concat\(menuButton\)/,
    '열린 drawer의 순환 포커스에 보이는 닫기 버튼이 포함되지 않았습니다.'
  );
}

function checkStudentCompletionPersistentStudyNotice() {
  const studentHtml = maskHtmlComments(readFile('web/student/latest/index.html'));
  const studentJs = readFile('web/student/student.js');
  const exactNotice = '이 화면에는 스터디 출석이 반영되지 않습니다. 최종 수료 여부는 스터디 출석률에 따라 달라질 수 있습니다.';
  const noticeMatches = Array.from(studentHtml.matchAll(/<aside class="completion-study-note" role="note">([\s\S]*?)<\/aside>/g));

  if (noticeMatches.length !== 1) {
    throw new Error('스터디 출석 미반영 안내는 학생 HTML에 정확히 한 번 있어야 합니다.');
  }
  const noticeText = noticeMatches[0][1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
  if (noticeText !== exactNotice) {
    throw new Error('스터디 출석 미반영 안내의 화면 텍스트가 정본 문장과 다릅니다.');
  }
  assertRegex(
    studentHtml,
    /<aside class="completion-study-note" role="note">[\s\S]*?스터디 출석률에 따라 <span class="completion-study-note-tail">달라질 수 있습니다\.<\/span>[\s\S]*?<\/aside>\s*<div id="completionResult"/,
    '스터디 출석 미반영 안내는 completionResult 바로 앞의 정적 note여야 합니다.'
  );
  assertNotRegex(studentJs, new RegExp(escapeRegex(exactNotice)), '스터디 출석 미반영 안내가 동적 live-region HTML에 중복되었습니다.');
}

function checkStudentVisualPolishContracts() {
  const studentHtml = readFile('web/student/latest/index.html');
  const css = maskCssComments(extractStyleText(studentHtml));

  ['main-title', 'subtitle', 'season-info', 'divider', 'tab-nav'].forEach(className => {
    const rules = findCssBlocks(css, new RegExp(`\\.${className}\\s*\\{`, 'gi'));
    if (rules.length === 0) {
      throw new Error(`학생 ${className} 규칙이 누락되었습니다.`);
    }
    if (rules.some(rule => readCssProperty(rule.body, 'animation'))) {
      throw new Error(`학생 ${className}에 비상태성 진입 애니메이션이 남아 있습니다.`);
    }
  });
  if (findCssBlocks(css, /\.ranking-table\s+tr:hover\s*\{/gi).length !== 0) {
    throw new Error('비대화형 순위 행에 hover 처리가 남아 있습니다.');
  }

  const criteriaContent = requireSingleCssBlock(
    css,
    /\.criteria-item\s*>\s*div\s*\{/gi,
    '수료 기준 텍스트 열의 flex fallback 규칙이 유일하지 않습니다.'
  );
  if (normalizeCssValue(readCssProperty(criteriaContent.body, 'flex')) !== '11auto'
      || normalizeCssValue(readCssProperty(criteriaContent.body, 'min-width')) !== '0') {
    throw new Error('수료 기준 텍스트 열은 남은 폭을 사용하고 축소 가능한 flex item이어야 합니다.');
  }

  const criteriaText = requireSingleCssBlock(
    css,
    /\.criteria-item span\s*\{/gi,
    '수료 기준 설명 줄바꿈 규칙이 유일하지 않습니다.'
  );
  if (normalizeCssValue(readCssProperty(criteriaText.body, 'overflow-wrap')) !== 'break-word'
      || normalizeCssValue(readCssProperty(criteriaText.body, 'word-break')) !== 'keep-all') {
    throw new Error('수료 기준 설명은 한글 단어를 보존하면서 긴 토큰만 안전하게 줄바꿈해야 합니다.');
  }

  const noticeTail = requireSingleCssBlock(
    css,
    /\.completion-study-note-tail\s*\{/gi,
    '수료 정적 안내 마지막 구문의 no-break 규칙이 유일하지 않습니다.'
  );
  if (normalizeCssValue(readCssProperty(noticeTail.body, 'white-space')) !== 'nowrap') {
    throw new Error('수료 정적 안내의 마지막 구문은 모바일에서도 한 덩어리로 유지되어야 합니다.');
  }
}

function checkStudentCompletionDesktopComposition() {
  const studentHtml = readFile('web/student/latest/index.html');
  const studentJs = readFile('web/student/student.js');
  const css = maskCssComments(extractStyleText(studentHtml));

  assertRegex(
    studentJs,
    /class="completion-assessment-layout"[\s\S]*?<section class="completion-overview"[^>]*aria-label="수료 가능 여부와 출석 지표"[\s\S]*?<section class="completion-criteria"[^>]*aria-label="수료 기준"/,
    '수료 결과의 overview/criteria 시맨틱 2열 wrapper가 누락되었습니다.'
  );
  const layoutBlocks = findCssBlocks(css, /\.completion-assessment-layout\s*\{/gi);
  const desktopLayouts = layoutBlocks.filter(block => (
    normalizeCssValue(readCssProperty(block.body, 'grid-template-columns')) === 'minmax(0,1.55fr)minmax(280px,0.9fr)'
  ));
  const mobileLayouts = layoutBlocks.filter(block => (
    normalizeCssValue(readCssProperty(block.body, 'grid-template-columns')) === 'minmax(0,1fr)'
  ));
  if (desktopLayouts.length !== 1) {
    throw new Error('수료 결과 desktop wrapper는 eligibility/metrics와 criteria의 정확한 2열이어야 합니다.');
  }
  if (mobileLayouts.length !== 1) {
    throw new Error('수료 결과 mobile wrapper는 정확한 1열이어야 합니다.');
  }
}

function checkStudentAttendanceReasonDialog(studentHtmlSource = readFile('web/student/latest/index.html')) {
  const studentHtml = maskHtmlComments(studentHtmlSource);
  const studentJs = readFile('web/student/student.js');

  assertRegex(
    studentHtml,
    /id="studentAttendanceDetailDialog"[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-labelledby="studentAttendanceDetailTitle"[^>]*aria-describedby="studentAttendanceDetailDescription"[^>]*aria-hidden="true"[^>]*inert/,
    '학생 출석 사유 다이얼로그의 초기 ARIA/inert 계약이 누락되었습니다.'
  );
  assertRegex(studentHtml, /id="studentAttendanceDetailClose"[^>]*type="button"/, '학생 출석 사유 다이얼로그의 native 닫기 버튼이 누락되었습니다.');
  ['studentAttendanceDetailStatus', 'studentAttendanceDetailDate', 'studentAttendanceDetailTime', 'studentAttendanceDetailReason'].forEach(id => {
    assertRegex(studentHtml, new RegExp(`id="${id}"`), `학생 출석 사유 다이얼로그 필드가 누락되었습니다: ${id}`);
  });

  const startTags = scanHtmlTags(studentHtml).filter(tag => !tag.isClosing);
  const statusResult = findHtmlElementById(studentHtml, 'statusResult');
  const dialog = findHtmlElementById(studentHtml, 'studentAttendanceDetailDialog');
  if (dialog.start >= statusResult.openingEnd && dialog.end <= statusResult.closingStart) {
    throw new Error('학생 출석 사유 다이얼로그는 statusResult 원자적 live region 밖에 있어야 합니다.');
  }
  startTags
    .filter(tag => Object.prototype.hasOwnProperty.call(tag.attributes, 'aria-live') && tag.attributes.id)
    .forEach(tag => {
      const liveRegion = findHtmlElementById(studentHtml, tag.attributes.id);
      if (dialog.start >= liveRegion.openingEnd && dialog.end <= liveRegion.closingStart) {
        throw new Error(`학생 출석 사유 다이얼로그는 ${tag.attributes.id} 원자적 live region 밖에 있어야 합니다.`);
      }
    });

  assertRegex(studentJs, /data-attendance-detail-index="\$\{index\}"[\s\S]*aria-haspopup="dialog"/, '안전 사유 행의 숫자 인덱스 dialog trigger가 누락되었습니다.');
  assertNotRegex(studentJs, /data-[a-z0-9-]*(?:reason|note)[a-z0-9-]*=/i, '학생 사유 또는 Note가 data 속성으로 노출됩니다.');
  ['studentAttendanceDetailStatus', 'studentAttendanceDetailDate', 'studentAttendanceDetailTime', 'studentAttendanceDetailReason'].forEach(id => {
    assertRegex(studentJs, new RegExp(`getElementById\\('${id}'\\)[\\s\\S]*?\\.textContent\\s*=`), `학생 사유 다이얼로그가 textContent로 채워지지 않습니다: ${id}`);
  });
  assertRegex(studentJs, /statusResult\.addEventListener\('click',[\s\S]*closest\('\[data-attendance-detail-index\]'\)/, '학생 사유 행의 단일 위임 click listener가 누락되었습니다.');
  assertRegex(studentJs, /event\.key === 'Escape'[\s\S]*closeStudentAttendanceDetailDialog\(\)/, '학생 사유 다이얼로그 Escape 닫기가 누락되었습니다.');
  assertRegex(studentJs, /event\.key !== 'Tab'[\s\S]*event\.shiftKey[\s\S]*\.focus\(\)/, '학생 사유 다이얼로그 Tab/Shift+Tab 순환이 누락되었습니다.');
  assertRegex(studentJs, /studentAttendanceDetailPreviousBodyOverflow\s*=\s*document\.body\.style\.overflow[\s\S]*document\.body\.style\.overflow\s*=\s*'hidden'/, '학생 사유 다이얼로그의 기존 body overflow 보존/잠금이 누락되었습니다.');
  assertRegex(studentJs, /document\.body\.style\.overflow\s*=\s*studentAttendanceDetailPreviousBodyOverflow/, '학생 사유 다이얼로그의 body overflow 복원이 누락되었습니다.');
  assertRegex(studentJs, /studentAttendanceDetailTrigger[\s\S]*isConnected[\s\S]*\.focus\(\)/, '학생 사유 다이얼로그의 trigger focus 복원이 누락되었습니다.');
  assertRegex(studentHtml, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.student-attendance-detail-dialog[\s\S]*transition:\s*none/, '학생 사유 다이얼로그의 감소 모션 대체가 누락되었습니다.');
}

function checkStudentAttendanceDialogMotionTargetIntegrity() {
  const studentHtml = readFile('web/student/latest/index.html');
  const css = maskCssComments(extractStyleText(studentHtml));
  const firstMediaIndex = css.search(/@media\s*\(/i);
  const baseCss = firstMediaIndex < 0 ? css : css.slice(0, firstMediaIndex);
  const panel = requireSingleCssBlock(
    baseCss,
    /^\s*\.student-attendance-detail-panel\s*\{/gim,
    '학생 출석 사유 패널 기본 모션 규칙은 정확히 하나여야 합니다.'
  );
  const openPanel = requireSingleCssBlock(
    baseCss,
    /^\s*\.student-attendance-detail-dialog\.is-open\s+\.student-attendance-detail-panel\s*\{/gim,
    '학생 출석 사유 패널 열림 모션 규칙은 정확히 하나여야 합니다.'
  );
  const dialog = requireSingleCssBlock(
    baseCss,
    /^\s*\.student-attendance-detail-dialog\s*\{/gim,
    '학생 출석 사유 다이얼로그 기본 모션 규칙은 정확히 하나여야 합니다.'
  );
  const closedTransform = normalizeCssValue(readCssProperty(panel.body, 'transform'));
  const openTransform = normalizeCssValue(readCssProperty(openPanel.body, 'transform'));
  const panelTransition = normalizeCssValue(readCssProperty(panel.body, 'transition'));
  const dialogTransition = normalizeCssValue(readCssProperty(dialog.body, 'transition'));

  if (/(?:scale|matrix)/i.test(`${closedTransform} ${openTransform}`)
      || readCssProperty(panel.body, 'zoom')
      || readCssProperty(openPanel.body, 'zoom')) {
    throw new Error('학생 출석 사유 패널 모션은 자손의 44px 터치 대상을 축소하는 scale/zoom/matrix를 사용할 수 없습니다.');
  }
  if (!closedTransform.includes('translatey(') || openTransform !== 'translatey(0)') {
    throw new Error('학생 출석 사유 패널은 닫힘→열림 상태를 translateY로 표현해야 합니다.');
  }
  if (!panelTransition.includes('transform0.2sease') || !dialogTransition.includes('opacity0.2sease')) {
    throw new Error('학생 출석 사유 다이얼로그의 0.2s ease translateY/opacity 모션 계약이 변경되었습니다.');
  }
}

function checkStudentLayoutCharacterization(studentHtml = readFile('web/student/latest/index.html')) {
  const structuralHtml = maskHtmlComments(studentHtml);
  const startTags = scanHtmlTags(structuralHtml).filter(tag => !tag.isClosing);
  const desktopTabOrder = startTags
    .filter(tag => tag.tagName === 'button' && classTokens(tag.attributes).includes('tab-button'))
    .map(tag => tag.attributes['data-student-tab'])
    .filter(tabName => ['attend', 'status', 'completion'].includes(tabName));
  if (JSON.stringify(desktopTabOrder) !== JSON.stringify(['attend', 'status', 'completion'])) {
    throw new Error(`학생 데스크톱 탭 순서가 변경되었습니다: ${desktopTabOrder.join(' -> ')}`);
  }

  const panelIds = startTags
    .filter(tag => tag.tagName === 'div'
      && ['attend', 'status', 'completion'].includes(tag.attributes.id)
      && classTokens(tag.attributes).includes('tab-panel')
      && tag.attributes.role === 'tabpanel')
    .map(tag => tag.attributes.id);
  if (JSON.stringify(panelIds) !== JSON.stringify(['attend', 'status', 'completion'])) {
    throw new Error(`학생 tab-panel 계약이 변경되었습니다: ${panelIds.join(' -> ')}`);
  }

  const menuButton = startTags.find(tag => tag.attributes.id === 'studentMenuButton');
  if (!menuButton || menuButton.attributes['aria-controls'] !== 'studentMobileMenu' || menuButton.attributes['aria-expanded'] !== 'false') {
    throw new Error('학생 모바일 메뉴 버튼 ID/ARIA 계약이 변경되었습니다.');
  }
  const mobileMenu = startTags.find(tag => tag.attributes.id === 'studentMobileMenu');
  if (!mobileMenu
    || mobileMenu.attributes['aria-label'] !== '학생 메뉴'
    || mobileMenu.attributes['aria-hidden'] !== 'true'
    || !Object.prototype.hasOwnProperty.call(mobileMenu.attributes, 'inert')) {
    throw new Error('학생 모바일 drawer ID/비활성 의미가 변경되었습니다.');
  }

  const forms = [
    ['doAttendance', 'phoneInput'],
    ['checkAttendanceStatus', 'statusPhoneInput'],
    ['checkCompletionStatus', 'completionPhoneInput']
  ];
  forms.forEach(([handler, inputId]) => {
    const formHtml = findFormBySubmitHandler(structuralHtml, handler);
    const formTags = scanHtmlTags(formHtml).filter(tag => !tag.isClosing);
    const inputs = formTags.filter(tag => tag.tagName === 'input' && tag.attributes.id === inputId);
    if (inputs.length !== 1) {
      throw new Error(`학생 전화번호 입력은 해당 제출 폼 내부에 정확히 하나 있어야 합니다: ${handler}/${inputId}`);
    }
    const attributes = inputs[0].attributes;
    const normalizedOnInput = (attributes.oninput || '').replace(/\s+/g, ' ').trim();
    const expectedOnInput = "this.value = this.value.replace(/[^0-9]/g, '')";
    const validPhoneContract = attributes.pattern === '010[0-9]{8}'
      && attributes.maxlength === '11'
      && normalizedOnInput === expectedOnInput
      && Object.prototype.hasOwnProperty.call(attributes, 'required');
    if (!validPhoneContract) {
      throw new Error(`학생 전화번호 입력 검증 속성 계약이 변경되었습니다: ${handler}/${inputId}`);
    }
    if (handler === 'doAttendance') {
      const attendanceActions = formTags.filter(tag => tag.tagName === 'button'
        && tag.attributes.id === 'attendBtn'
        && tag.attributes.type === 'submit');
      if (attendanceActions.length !== 1) {
        throw new Error('학생 출석 action 버튼은 doAttendance 폼 내부에 정확히 하나 있어야 합니다.');
      }
    }
  });

  ['attendanceLocationStatus', 'result', 'statusResult', 'completionResult'].forEach(id => {
    const liveRegion = startTags.find(tag => tag.attributes.id === id);
    if (!liveRegion || liveRegion.attributes.role !== 'status' || liveRegion.attributes['aria-live'] !== 'polite') {
      throw new Error(`학생 live region 계약이 변경되었습니다: ${id}`);
    }
  });

  const statusResultIndex = startTags.find(tag => tag.attributes.id === 'statusResult')?.start ?? -1;
  const rankingBoardIndex = startTags.find(tag => tag.attributes.id === 'rankingBoard')?.start ?? -1;
  if (statusResultIndex < 0 || rankingBoardIndex <= statusResultIndex) {
    throw new Error('학생 순위 영역은 개인 출석 현황 결과 뒤에 있어야 합니다.');
  }

  assertRegex(structuralHtml, /<footer class="legal-links"[^>]*>[\s\S]*href="\.\.\/\.\.\/privacy\.html"[\s\S]*href="\.\.\/\.\.\/terms\.html"[\s\S]*<\/footer>/, '학생 법적 링크 계약이 변경되었습니다.');

  const ids = startTags.map(tag => tag.attributes.id).filter(Boolean);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length > 0) {
    throw new Error(`학생 HTML 중복 ID가 있습니다: ${Array.from(new Set(duplicates)).join(', ')}`);
  }
}

function checkStudentCompactResponsiveGeometry(studentHtml = readFile('web/student/latest/index.html')) {
  const structuralHtml = maskHtmlComments(studentHtml);
  const css = maskCssComments(extractStyleText(studentHtml));
  const desktopMedia = requireSingleCssBlock(
    css,
    /@media\s*\(\s*min-width\s*:\s*769px\s*\)\s*\{/gi,
    '학생 데스크톱 769px media block은 정확히 하나여야 합니다.'
  );
  const mobileMedia = requireSingleCssBlock(
    css,
    /@media\s*\(\s*max-width\s*:\s*768px\s*\)\s*\{/gi,
    '학생 모바일 768px media block은 정확히 하나여야 합니다.'
  );
  const desktopContainer = requireSingleCssBlock(
    desktopMedia.body,
    /\.container\s*\{/gi,
    '학생 데스크톱 media block의 container 규칙이 유일하지 않습니다.'
  );
  if (normalizeCssValue(readCssProperty(desktopContainer.body, 'max-width')) !== '1200px') {
    throw new Error('학생 데스크톱 셸은 769px 이상에서 정확히 1200px이어야 합니다.');
  }

  const maxWidth1200Matches = Array.from(css.matchAll(/max-width\s*:\s*1200px\b/gi));
  const rogueMaxWidth = maxWidth1200Matches.find(match => (
    match.index < desktopMedia.openingBraceIndex || match.index > desktopMedia.closingBraceIndex
  ));
  if (rogueMaxWidth) {
    throw new Error('1200px max-width는 정확한 데스크톱 769px media block 밖에 선언할 수 없습니다.');
  }

  assertRegex(
    desktopMedia.body,
    /\.header\s*\{[\s\S]*?padding:\s*16px 0[\s\S]*?\.card\s*\{[\s\S]*?padding:\s*20px[\s\S]*?margin-bottom:\s*16px/,
    '학생 데스크톱 헤더와 카드가 16~20px 세로 리듬을 사용하지 않습니다.'
  );

  const primaryGrid = findHtmlElementByClass(structuralHtml, 'div', 'attendance-primary-grid');
  const primaryChildren = getDirectChildElements(primaryGrid);
  const validPrimaryChildren = primaryChildren.length === 2
    && primaryChildren[0].tagName === 'div'
    && primaryChildren[0].classes.includes('countdown-card')
    && primaryChildren[1].tagName === 'div'
    && primaryChildren[1].classes.includes('card')
    && primaryChildren[1].classes.includes('attendance-action-card');
  if (!validPrimaryChildren) {
    throw new Error('학생 출석 primary grid는 카운트다운과 출석 action card를 직접 자식으로 가져야 합니다.');
  }

  const desktopPrimaryGrid = requireSingleCssBlock(
    desktopMedia.body,
    /\.attendance-primary-grid\s*\{/gi,
    '학생 데스크톱 primary grid 규칙이 유일하지 않습니다.'
  );
  if (normalizeCssValue(readCssProperty(desktopPrimaryGrid.body, 'grid-template-columns')) !== 'minmax(0,1fr)minmax(0,1fr)') {
    throw new Error('학생 출석 primary grid의 데스크톱 2열 규칙이 누락되었습니다.');
  }
  assertRegex(
    structuralHtml,
    /id="status"[\s\S]*?class="card compact-query-card"[\s\S]*?<form[^>]*class="compact-query-form"[^>]*onsubmit="checkAttendanceStatus\(event\)"[\s\S]*?class="form-group compact-query-field"/,
    '학생 출석 현황의 재사용 compact query 구조가 누락되었습니다.'
  );
  assertRegex(
    structuralHtml,
    /id="completion"[\s\S]*?class="card compact-query-card"[\s\S]*?<form[^>]*class="compact-query-form"[^>]*onsubmit="checkCompletionStatus\(event\)"[\s\S]*?class="form-group compact-query-field"/,
    '학생 수료 조건의 재사용 compact query 구조가 누락되었습니다.'
  );
  assertRegex(structuralHtml, /id="statusResult"[^>]*class="compact-result-region"/, '학생 출석 현황 compact result 구조가 누락되었습니다.');
  assertRegex(structuralHtml, /id="completionResult"[^>]*class="compact-result-region"/, '학생 수료 조건 compact result 구조가 누락되었습니다.');
  const mobilePrimaryGrid = requireSingleCssBlock(
    mobileMedia.body,
    /\.attendance-primary-grid\s*\{/gi,
    '학생 모바일 primary grid 규칙이 유일하지 않습니다.'
  );
  if (normalizeCssValue(readCssProperty(mobilePrimaryGrid.body, 'grid-template-columns')) !== 'minmax(0,1fr)') {
    throw new Error('학생 모바일 primary grid는 정확히 1열이어야 합니다.');
  }
  assertRegex(
    mobileMedia.body,
    /\.compact-query-form \.form-input\s*\{[\s\S]*?min-height:\s*44px[\s\S]*?\.compact-query-form \.btn\s*\{[\s\S]*?min-height:\s*44px/,
    '학생 모바일 compact control의 44px 규칙이 누락되었습니다.'
  );

  const baseCss = css.slice(0, desktopMedia.start);
  const baseAttendanceDetails = requireSingleCssBlock(
    baseCss,
    /\.attendance-details\s*\{/gi,
    '학생 기본 attendance details 규칙이 유일하지 않습니다.'
  );
  const baseRankingScroll = requireSingleCssBlock(
    baseCss,
    /\.ranking-table-scroll\s*\{/gi,
    '학생 기본 ranking scroll 규칙이 유일하지 않습니다.'
  );
  const desktopAttendanceDetails = requireSingleCssBlock(
    desktopMedia.body,
    /\.attendance-details\s*\{/gi,
    '학생 데스크톱 attendance details 규칙이 유일하지 않습니다.'
  );
  const desktopRankingScroll = requireSingleCssBlock(
    desktopMedia.body,
    /\.ranking-table-scroll\s*\{/gi,
    '학생 데스크톱 ranking scroll 규칙이 유일하지 않습니다.'
  );
  const overflowContract = normalizeCssValue(readCssProperty(baseAttendanceDetails.body, 'max-height')) === '400px'
    && normalizeCssValue(readCssProperty(baseAttendanceDetails.body, 'overflow-y')) === 'auto'
    && normalizeCssValue(readCssProperty(baseRankingScroll.body, 'overflow-x')) === 'auto'
    && normalizeCssValue(readCssProperty(desktopAttendanceDetails.body, 'max-height')) === '320px'
    && normalizeCssValue(readCssProperty(desktopRankingScroll.body, 'max-height')) === '320px'
    && normalizeCssValue(readCssProperty(desktopRankingScroll.body, 'overflow')) === 'auto';
  if (!overflowContract) {
    throw new Error('학생 상세/순위 overflow에는 400px 기본·320px 데스크톱 max-height 경계가 필요합니다.');
  }

  [
    ['attendance-details', /\.attendance-details\s*\{/gi],
    ['ranking-table-scroll', /\.ranking-table-scroll\s*\{/gi]
  ].forEach(([className, ruleRegex]) => {
    findCssBlocks(css, ruleRegex).forEach(block => {
      const maxHeight = normalizeCssValue(readCssProperty(block.body, 'max-height'));
      const overflow = normalizeCssValue(readCssProperty(block.body, 'overflow'));
      const overflowX = normalizeCssValue(readCssProperty(block.body, 'overflow-x'));
      const overflowY = normalizeCssValue(readCssProperty(block.body, 'overflow-y'));
      if (maxHeight === 'none' || overflow === 'visible' || overflowX === 'visible' || overflowY === 'visible') {
        throw new Error(`학생 ${className}에 경계를 해제하는 위험한 overflow override가 있습니다.`);
      }
    });
  });
}

function checkStudentLayoutStructuralFixtures() {
  const source = readFile('web/student/latest/index.html');
  const primaryGrid = findHtmlElementByClass(source, 'div', 'attendance-primary-grid');
  const actionCard = findHtmlElementByClass(primaryGrid.outerHtml, 'div', 'attendance-action-card').outerHtml;
  const statusResult = findHtmlElementByClass(source, 'div', 'compact-result-region');
  const reasonDialog = findHtmlElementById(source, 'studentAttendanceDetailDialog');
  if (!/\bid=["']statusResult["']/.test(statusResult.openingTag)) {
    throw new Error('mutation fixture용 statusResult를 찾지 못했습니다.');
  }
  const sourceWithoutReasonDialog = source.slice(0, reasonDialog.start) + source.slice(reasonDialog.end);
  const reasonDialogNestedInStatusResult = sourceWithoutReasonDialog.slice(0, statusResult.closingStart)
    + reasonDialog.outerHtml
    + sourceWithoutReasonDialog.slice(statusResult.closingStart);
  const phoneInputTag = scanHtmlTags(source).find(tag => !tag.isClosing && tag.tagName === 'input' && tag.attributes.id === 'phoneInput');
  if (!phoneInputTag) throw new Error('mutation fixture용 출석 전화번호 입력을 찾지 못했습니다.');
  const phoneInput = source.slice(phoneInputTag.start, phoneInputTag.end);

  const phoneOutsideForm = source
    .replace(phoneInput, '')
    .replace(/(<form\b[^>]*onsubmit\s*=\s*(["'])doAttendance\(event\)\2[^>]*>[\s\S]*?<\/form\s*>)/i, `$1\n${phoneInput}`);
  const actionOutsideGrid = source
    .replace(actionCard, '')
    .replace(/(<div\b[^>]*id\s*=\s*(["'])result\2)/i, `${actionCard}\n\n      $1`);
  const mobileTwoColumns = source.replace(
    /(@media\s*\(\s*max-width\s*:\s*768px\s*\)\s*\{[\s\S]*?\.attendance-primary-grid\s*\{[\s\S]*?grid-template-columns\s*:\s*)minmax\(\s*0\s*,\s*1fr\s*\)(\s*;)/i,
    '$1minmax(0, 1fr) minmax(0, 1fr)$2'
  );
  const overflowBoundsRemoved = source
    .replace(/(\.attendance-details\s*\{[\s\S]*?)max-height\s*:\s*400px\s*;/i, '$1')
    .replace(/(@media\s*\(\s*min-width\s*:\s*769px\s*\)[\s\S]*?\.attendance-details\s*\{[\s\S]*?)max-height\s*:\s*320px\s*;/i, '$1')
    .replace(/(@media\s*\(\s*min-width\s*:\s*769px\s*\)[\s\S]*?\.ranking-table-scroll\s*\{[\s\S]*?)max-height\s*:\s*320px\s*;/i, '$1');
  const rogueMaxWidth = source.replace(/<\/style>/i, '.mutation-rogue-width { max-width: 1200px; }\n  </style>');
  const requiredNodesOnlyInComment = source.replace(actionCard, `<!-- ${actionCard} -->`);
  const indirectActionWrapper = source.replace(actionCard, `<section class="mutation-wrapper">${actionCard}</section>`);
  const nestedDesktopMedia = source.replace(
    /(@media\s*\(\s*min-width\s*:\s*769px\s*\)\s*\{)/i,
    '$1\n      @media (min-width: 769px) { .mutation-nested-media { color: inherit; } }'
  );
  const dangerousMobileOverride = source.replace(
    /(@media\s*\(\s*max-width\s*:\s*768px\s*\)\s*\{)/i,
    '$1\n      .attendance-details { max-height: none; overflow-y: visible; }\n      .ranking-table-scroll { max-height: none; overflow-x: visible; }'
  );
  const commentedDuplicateId = source.replace(
    /<\/footer>/i,
    '<!-- <div id="phoneInput"></div> -->\n  </footer>'
  );
  const reorderedPhoneAttributes = source.replace(
    /pattern="010\[0-9\]\{8\}"\s+maxlength="11"/,
    'maxlength="11"\n                     pattern="010[0-9]{8}"'
  );

  const acceptedFixtures = [
    ['valid source', source],
    ['duplicate ID only inside HTML comment', commentedDuplicateId],
    ['harmless phone attribute reordering', reorderedPhoneAttributes]
  ];
  acceptedFixtures.forEach(([name, candidate]) => {
    if (name !== 'valid source' && candidate === source) {
      throw new Error(`학생 layout acceptance fixture가 원본을 변경하지 못했습니다: ${name}`);
    }
    try {
      checkStudentLayoutCharacterization(candidate);
      checkStudentCompactResponsiveGeometry(candidate);
      checkStudentAttendanceReasonDialog(candidate);
    } catch (error) {
      throw new Error(`학생 layout 가드가 harmless fixture를 거부했습니다: ${name}: ${error.message}`);
    }
  });

  const rejectedFixtures = [
    ['phone input outside form', phoneOutsideForm, '해당 제출 폼 내부에 정확히 하나'],
    ['attendance action card outside primary grid', actionOutsideGrid, '직접 자식'],
    ['mobile primary grid changed to two columns', mobileTwoColumns, '정확히 1열'],
    ['detail/ranking max-height bounds removed', overflowBoundsRemoved, 'max-height 경계'],
    ['1200px max-width outside desktop media', rogueMaxWidth, '밖에 선언'],
    ['required phone/action nodes only inside HTML comment', requiredNodesOnlyInComment, 'doAttendance 제출 폼'],
    ['section wrapper makes action card indirect', indirectActionWrapper, '직접 자식'],
    ['nested second desktop media block', nestedDesktopMedia, 'media block은 정확히 하나'],
    ['mobile dangerous scroll override', dangerousMobileOverride, '위험한 overflow override'],
    ['reason dialog nested inside statusResult live region', reasonDialogNestedInStatusResult, '원자적 live region 밖']
  ];
  rejectedFixtures.forEach(([name, candidate, expectedMessage]) => {
    if (candidate === source) throw new Error(`학생 layout rejection fixture가 원본을 변경하지 못했습니다: ${name}`);
    let rejectionMessage = '';
    try {
      checkStudentLayoutCharacterization(candidate);
      checkStudentCompactResponsiveGeometry(candidate);
      checkStudentAttendanceReasonDialog(candidate);
    } catch (error) {
      rejectionMessage = error.message;
    }
    if (!rejectionMessage) {
      throw new Error(`학생 layout 가드가 malformed fixture를 허용했습니다: ${name}`);
    }
    if (!rejectionMessage.includes(expectedMessage)) {
      throw new Error(`학생 layout fixture가 예상하지 않은 이유로 거부되었습니다: ${name}: ${rejectionMessage}`);
    }
  });
}

function checkSensitiveArtifactIgnore() {
  const gitignore = readFile('.gitignore');
  assertRegex(gitignore, /^\*\.har$/m, 'HAR 네트워크 캡처 파일 ignore 규칙이 누락되었습니다.');
  assertNotRegex(gitignore, /\\n/, '.gitignore에 리터럴 \\n 문자열이 남아 있습니다.');
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
    'web/admin/scripts/24_variables.js',
    'web/admin/scripts/28_fortune.js',
    'web/admin/scripts/99_compat_handlers.js',
    'web/student/student.js'
  ];
  jsFiles.forEach((relativePath) => {
    execSync(`node --check "${path.join(repoRoot, relativePath)}"`, { stdio: 'ignore' });
  });

  const gsFiles = [
    'Appsscript/30_attendance_core.gs',
    'Appsscript/33_graduation_manual_excused.gs',
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

function checkStudentInsightRegression() {
  execSync(`node "${path.join(repoRoot, 'scripts/student_insights_test.js')}"`, { stdio: 'ignore' });
  execSync(`node "${path.join(repoRoot, 'scripts/student_client_behavior_test.js')}"`, { stdio: 'ignore' });
  execSync(`node "${path.join(repoRoot, 'scripts/doublecheck_api_compare_test.js')}"`, { stdio: 'ignore' });
}

function checkLocationPrivacyAndPolicyUi() {
  const studentJs = readFile('web/student/student.js');
  const studentHtml = readFile('web/student/latest/index.html');
  const adminHtml = readFile('web/admin/index.html');
  const adminLocationJs = readFile('web/admin/scripts/22_location.js');
  const adminRuntimeDepsJs = readFile('web/admin/scripts/05_runtime_deps.js');
  const adminScheduleJs = readFile('web/admin/scripts/22_schedule.js');
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
  assertRegex(
    adminHtml,
    /class="schedule-calendar-modal-body"[\s\S]*class="schedule-calendar-modal-timing"[\s\S]*class="schedule-location-panel"[\s\S]*class="schedule-location-details-panel"/,
    '일정 모달이 시간·큰 지도·좌측 세부 설정 순서의 반응형 구조를 사용하지 않습니다.'
  );
  assertRegex(
    adminHtml,
    /\.schedule-calendar-modal-body\s*\{[\s\S]*?grid-template-areas:\s*['"]timing location['"]\s*['"]details location['"][\s\S]*?grid-template-rows:\s*auto minmax\(0,\s*1fr\)/,
    '데스크톱 일정 모달에서 장소 탐색 열이 두 행을 차지하지 않습니다.'
  );
  assertRegex(
    adminHtml,
    /@media \(max-width: 900px\)[\s\S]*?\.schedule-calendar-modal-body\s*\{[\s\S]*?grid-template-areas:\s*['"]timing['"]\s*['"]location['"]\s*['"]details['"][\s\S]*?grid-template-columns:\s*1fr/,
    '일정 모달의 900px 이하 시간·지도·세부 설정 단일 열 순서가 없습니다.'
  );
  assertRegex(
    adminHtml,
    /\.modal-panel\.schedule-calendar-location-modal \.form-input\s*\{[\s\S]*?min-height:\s*44px/,
    '일정 모달 입력의 최소 44px 터치 영역 규칙이 없습니다.'
  );
  assertRegex(
    adminHtml,
    /\.schedule-location-toggle\s*\{[\s\S]*?min-height:\s*44px/,
    '장소 확인 필수 토글의 최소 44px 터치 영역 규칙이 없습니다.'
  );
  assertRegex(
    adminHtml,
    /\.schedule-place-summary\s*\{[\s\S]*?text-wrap:\s*balance[\s\S]*?word-break:\s*keep-all/,
    '모바일 장소 주소의 마지막 토큰 고립을 막는 균형 줄바꿈 규칙이 없습니다.'
  );
  assertRegex(
    adminHtml,
    /id="schedulePlaceMap"[^>]*class="schedule-place-map"/,
    '일정 장소를 지도에서 직접 선택할 수 있는 지도 표면이 없습니다.'
  );
  assertRegex(
    adminHtml,
    /\.schedule-place-map\s*\{[\s\S]*?height:\s*100%[\s\S]*?min-height:\s*320px/,
    '일정 장소 지도가 데스크톱 남는 높이를 채우는 큰 선택 표면을 사용하지 않습니다.'
  );
  assertRegex(
    adminHtml,
    /id="scheduleLocationPolicyDetails"[^>]*class="schedule-location-policy-details"/,
    '장소 선택 결과와 반경을 좌측 세부 설정 패널에서 독립적으로 접을 수 없습니다.'
  );
  assertRegex(
    adminLocationJs,
    /scheduleLocationEditorState\.locationRequired\s*=\s*item\s*\?\s*!!item\.locationRequired\s*:\s*true/,
    '신규 회차의 장소 기반 출석 기본값이 ON이거나 기존 회차 저장값을 보존하지 않습니다.'
  );
  assertRegex(
    adminRuntimeDepsJs,
    /function ensureGoogleMaps\(\)[\s\S]*?importLibrary\('maps'\)[\s\S]*?importLibrary\('places'\)/,
    '관리자 지도와 장소 검색 라이브러리를 함께 준비하는 런타임 로더가 없습니다.'
  );
  assertRegex(
    adminLocationJs,
    /function handleSchedulePlaceMapClick\(event\)[\s\S]*?event\.placeId[\s\S]*?fetchFields\(\{ fields: \['id', 'displayName', 'formattedAddress', 'location'\] \}\)/,
    '지도 POI 클릭을 Place ID와 장소 좌표로 변환하는 선택 흐름이 없습니다.'
  );
  assertRegex(
    adminLocationJs,
    /function syncSchedulePlaceSelectorValue\(\)[\s\S]*?selector\.value\s*=\s*selectedText/,
    '지도에서 선택한 장소명 또는 주소를 Google 장소 검색 입력값에 반영하지 않습니다.'
  );
  assertRegex(
    adminLocationJs,
    /function handleSchedulePlaceMapClick\(event\)[\s\S]*?syncSchedulePlaceSelectorValue\(\)/,
    '지도 POI 선택 뒤 검색 입력값 동기화가 호출되지 않습니다.'
  );
  assertRegex(
    adminLocationJs,
    /map\.addListener\('click',\s*event\s*=>\s*handleSchedulePlaceMapClick\(event\)\)/,
    'Google 지도 클릭 이벤트가 장소 선택 핸들러에 연결되지 않았습니다.'
  );
  assertRegex(
    adminHtml,
    /\.modal-panel\.schedule-calendar-location-modal \.modal-actions\s*\{[\s\S]*?grid-template-columns:\s*repeat\(auto-fit,\s*minmax\(88px,\s*1fr\)\)/,
    '모바일 일정 모달의 2개·3개 행동 버튼을 함께 수용하는 반응형 그리드가 없습니다.'
  );
  assertRegex(
    adminHtml,
    /body\.schedule-calendar-modal-open\s*\{[\s\S]*?overflow:\s*hidden/,
    '일정 모달이 열린 동안 배경 문서 스크롤을 잠그는 스타일이 없습니다.'
  );
  assertRegex(
    adminHtml,
    /\.schedule-calendar-modal-body\s*\{[\s\S]*?overscroll-behavior:\s*contain[\s\S]*?scrollbar-width:\s*thin/,
    '일정 모달 본문 스크롤 격리 또는 저대비 스크롤바 스타일이 없습니다.'
  );
  assertRegex(
    adminScheduleJs,
    /document\.body\.classList\.add\('schedule-calendar-modal-open'\)[\s\S]*document\.body\.classList\.remove\('schedule-calendar-modal-open'\)/,
    '일정 모달의 배경 스크롤 잠금 수명주기 처리가 없습니다.'
  );
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
  ['일반 운영진 변수 관리 권한', checkVariableManagementAccessPolicy],
  ['운세 탭 wiring', checkFortuneTabWiring],
  ['openTab/refreshSeasonData 분기', checkFortuneBranchInOpenTabAndRefresh],
  ['호환 핸들러 등록', checkCompatHandlers],
  ['액션 접근 레벨', checkActionAccessLevels],
  ['학생 운세 escape', checkStudentFortuneEscape],
  ['학생 비교·수료 인사이트 계약', checkStudentInsightContracts],
  ['학생 v6.3 cache bust', checkStudentV63CacheBust],
  ['학생 v6.3 현재 정본', checkStudentV63CurrentSsot],
  ['학생 v6.3 개인정보·운영 경고', checkStudentV63PrivacyAndOperatorWarning],
  ['학생 v6.3 디자인·사용 문서', checkStudentV63DesignAndUserDocs],
  ['학생 v6.3 수동 동기화 handoff', checkStudentV63ManualHandoff],
  ['학생 v6.3 History', checkStudentV63History],
  ['학생 4탭·모바일 메뉴 wiring', checkStudentFourTabNavigation],
  ['학생 데스크톱 탭 44px 대상', checkStudentDesktopTabTouchTarget],
  ['학생 현황 첫 화면 병렬 구성', checkStudentStatusFirstViewportComposition],
  ['학생 drawer 닫기 버튼 표면', checkStudentDrawerCloseControlSurface],
  ['학생 수료 스터디 출석 정적 안내', checkStudentCompletionPersistentStudyNotice],
  ['학생 시각 모션·한글 줄바꿈 계약', checkStudentVisualPolishContracts],
  ['학생 수료 desktop 2열 구성', checkStudentCompletionDesktopComposition],
  ['학생 출석 사유 다이얼로그 계약', checkStudentAttendanceReasonDialog],
  ['학생 출석 사유 모션 44px 보존', checkStudentAttendanceDialogMotionTargetIntegrity],
  ['학생 레이아웃 보존 계약', checkStudentLayoutCharacterization],
  ['학생 컴팩트 반응형 geometry', checkStudentCompactResponsiveGeometry],
  ['학생 HTML/CSS 구조 fixture 계약', checkStudentLayoutStructuralFixtures],
  ['민감 네트워크 캡처 ignore', checkSensitiveArtifactIgnore],
  ['세션 헤더 동적 파싱 가드', checkSessionHeaderDynamicParsing],
  ['시즌업로드 컬럼 유연성 가드', checkImportUpdateColumnFlexibility],
  ['출석현황 드릴다운 helper 중복 선언 가드', checkAttendanceDashboardDrilldownHelpers],
  ['출석현황 live default scope persistence 가드', checkAttendanceDashboardLiveDefaultScopePersistence],
  ['위치 정책 회귀 테스트', checkLocationPolicyRegression],
  ['학생 비교·수료 인사이트 회귀 테스트', checkStudentInsightRegression],
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
