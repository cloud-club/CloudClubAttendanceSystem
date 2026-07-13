// Appsscript/01_constants_access.gs

const SESSION_HEADER_REGEX = /^(\d{4})-(\d{2})-(\d{2})-(\d{2}):(\d{2})(?:~(\d{2}):(\d{2}))?$/;
const SESSION_LOCATION_POLICY_VERSION = '1';
const ATTENDANCE_LOCATION_RADIUS_M = 500;
const ATTENDANCE_LOCATION_MAX_ACCURACY_M = 100;
const GOOGLE_MAPS_SERVER_API_KEY_PROPERTY = 'GOOGLE_MAPS_SERVER_API_KEY';
const GOOGLE_PLACE_TARGET_CACHE_PREFIX = 'google_place_target_v1_';
const GOOGLE_PLACE_TARGET_CACHE_TTL_SECONDS = 6 * 60 * 60;
const LOCATION_ATTENDANCE_REQUEST_MAX_BYTES = 8 * 1024;
const LOCATION_ATTENDANCE_RESULT_CACHE_PREFIX = 'location_attendance_result_v1_';
const LOCATION_ATTENDANCE_PROCESSING_CACHE_PREFIX = 'location_attendance_processing_v1_';
const LOCATION_ATTENDANCE_RESULT_TTL_SECONDS = 120;
const SEASON_NAME_REGEX = /^season_(\d{2})$/;
const LEGACY_SEASON_NAME_REGEX = /^(\d{1,2})$/;

const ON_TIME_COLOR = '#d9ead3';
const LATE_COLOR = '#fce5cd';
const EXCUSED_COLOR = '#d9e2f3';
const ABSENT_COLOR = '#f4cccc';

const ADMIN_SESSION_TTL_SECONDS = 6 * 60 * 60;
const ADMIN_SESSION_CACHE_PREFIX = 'admin_session_';
const ADMIN_SUPER_EMAIL = 'cloudclub2022@gmail.com';
const ADMIN_ROLE_SUPER = 'super';
const ADMIN_ROLE_SEASON_ADMIN = 'season_admin';
const ADMINS_SHEET_NAME = '_admins';
const ADMINS_SHEET_HEADERS = ['name', 'season', 'phone', 'email', 'role', 'is_active', 'created_at', 'updated_at'];
const ADMIN_SEASON_SYNC_CACHE_KEY = 'admin_season_sync_latest_v1';
const ADMIN_SEASON_SYNC_CACHE_TTL_SECONDS = 60;
const ADMIN_RECORDS_CACHE_KEY = 'admin_records_v1';
const ADMIN_RECORDS_CACHE_TTL_SECONDS = 300;
const SEASON_SHEET_META_CACHE_KEY = 'season_sheet_meta_v1';
const SEASON_SHEET_META_CACHE_TTL_SECONDS = 300;
const GOOGLE_TOKENINFO_ENDPOINT = 'https://oauth2.googleapis.com/tokeninfo?id_token=';
const API_VERSION = '2026.07.14-v6.2';
const ATTENDANCE_DASHBOARD_CACHE_TTL_SECONDS = 90;
const ATTENDANCE_DASHBOARD_LIVE_CACHE_TTL_SECONDS = 15;
const ATTENDANCE_DASHBOARD_CACHE_MAX_BYTES = 90000;

const VARIABLE_SHEET_NAME = 'variable';
const VARIABLE_TABLE_HEADER_ROW = 1;
const VARIABLE_TABLE_FIRST_DATA_ROW = 2;
const VARIABLE_TABLE_HEADERS = ['key', 'value', 'type', 'description', 'editable', 'updated_at', 'applies_to', 'applies_when', 'used_in'];

const SESSION_META_SHEET_NAME = '_session_meta';
const SESSION_META_HEADERS = ['seasonSheet', 'sessionKey', 'openOffsetMin', 'lateThresholdMin', 'absenceThresholdMin', 'explicitEndAt', 'createdAt'];
const IMPORT_META_SHEET_NAME = '_import_meta';
const IMPORT_META_HEADERS = [
  'importId',
  'seasonAlias',
  'stagingSheetName',
  'status',
  'importMode',
  'targetMode',
  'targetSheetName',
  'schemaSummaryJson',
  'createdAt',
  'updatedAt',
  'insertedCount',
  'skippedDuplicateCount',
  'droppedInvalidCount',
  'skippedNonTargetCount'
];
const IMPORT_STATUS_ACTIVE = 'active';
const IMPORT_STATUS_FINALIZED = 'finalized';
const IMPORT_STATUS_ABORTED = 'aborted';
const IMPORT_TARGET_MODE_CREATE = 'create';
const IMPORT_TARGET_MODE_UPDATE = 'update';
const IMPORT_EFFECTIVE_SCOPE_ALL = 'all';
const IMPORT_EFFECTIVE_SCOPE_TARGET_ONLY = 'targetSeasonOnly';
const FORTUNE_VERSION_SHEET_NAME = '_fortune_versions';
const FORTUNE_VERSION_HEADERS = [
  'version_id',
  'created_at',
  'created_by_email',
  'source_type',
  'row_count',
  'is_current',
  'note'
];
const FORTUNE_ENTRY_SHEET_NAME = '_fortune_entries';
const FORTUNE_ENTRY_HEADERS = [
  'version_id',
  'row_no',
  'fortune_text'
];
const FORTUNE_VERSION_ROWS_CACHE_KEY = 'fortune_version_rows_v1';
const FORTUNE_VERSION_ENTRY_CACHE_PREFIX = 'fortune_version_entries_';
const FORTUNE_VERSION_CACHE_TTL_SECONDS = 300;
const FORTUNE_UPLOAD_META_SHEET_NAME = '_fortune_upload_meta';
const FORTUNE_UPLOAD_META_HEADERS = [
  'upload_id',
  'staging_sheet_name',
  'status',
  'created_at',
  'updated_at',
  'created_by_email',
  'expected_rows',
  'received_rows'
];
const FORTUNE_UPLOAD_STAGING_PREFIX = '_fortune_stg_';
const FORTUNE_UPLOAD_STATUS_ACTIVE = 'active';
const FORTUNE_UPLOAD_STATUS_FINALIZED = 'finalized';
const FORTUNE_UPLOAD_STATUS_ABORTED = 'aborted';
const FORTUNE_MAX_TEXT_LENGTH = 200;
const FORTUNE_CACHE_KEY = 'fortune_current_v1';
const FORTUNE_CACHE_TTL_SECONDS = 300;
const MEMBER_V2_SHEET_HEADERS = [
  'Name',
  'Season',
  'Phone',
  'Email',
  'Github ID',
  'Github Email',
  'Notion Email',
  'Discord ID',
  'Slack Email',
  '회비 체크',
  '수료 여부',
  '운영진 여부'
];
const MEMBER_IMPORT_INTERNAL_PHONE_KEY_HEADER = '_phone_key';
const MEMBER_FIELD_ORDER = [
  'name',
  'season',
  'phone',
  'email',
  'githubId',
  'githubEmail',
  'notionEmail',
  'discordId',
  'slackEmail',
  'feeChecked',
  'completed',
  'isStaff'
];
const SUPPORTED_API_ACTIONS = [
  'health',
  'apiInfo',
  'authGoogleConfig',
  'authGoogleLogin',
  'authSession',
  'authLogout',
  'adminSeasonList',
  'adminUsersList',
  'adminUsersUpsert',
  'adminUsersDelete',
  'session',
  'attendance',
  'attendanceLocation',
  'locationResult',
  'status',
  'ranking',
  'latestSeason',
  'attendanceDashboardSummary',
  'attendanceDashboardDrilldown',
  'sheets',
  'setActiveSheet',
  'verifyAdminKey',
  'studentUrl',
  'adminUrl',
  'sheetLink',
  'variablesGet',
  'variablesUpdate',
  'variablesNormalize',
  'variablesResetTemplate',
  'scheduleList',
  'scheduleSave',
  'scheduleDelete',
  'members',
  'manualApproveStatus',
  'manualApprove',
  'manualApproveBatch',
  'excusedSet',
  'graduationReport',
  'sheetSchemaAudit',
  'seasonImportBegin',
  'seasonImportChunk',
  'seasonImportDiff',
  'seasonImportFinalize',
  'seasonImportAbort',
  'fortuneVersionList',
  'fortuneVersionGet',
  'fortuneUploadBegin',
  'fortuneUploadChunk',
  'fortuneUploadFinalize',
  'fortuneUploadAbort'
];
const ACTION_ACCESS_PUBLIC = 'public';
const ACTION_ACCESS_ADMIN = 'admin';
const ACTION_ACCESS_SUPER = 'super';
const ACTION_ACCESS_LEVELS = Object.freeze({
  health: ACTION_ACCESS_PUBLIC,
  apiInfo: ACTION_ACCESS_PUBLIC,
  authGoogleConfig: ACTION_ACCESS_PUBLIC,
  authGoogleLogin: ACTION_ACCESS_PUBLIC,
  session: ACTION_ACCESS_PUBLIC,
  attendance: ACTION_ACCESS_PUBLIC,
  attendanceLocation: ACTION_ACCESS_PUBLIC,
  locationResult: ACTION_ACCESS_PUBLIC,
  status: ACTION_ACCESS_PUBLIC,
  ranking: ACTION_ACCESS_PUBLIC,
  latestSeason: ACTION_ACCESS_PUBLIC,
  sheets: ACTION_ACCESS_PUBLIC,
  verifyAdminKey: ACTION_ACCESS_PUBLIC,
  authSession: ACTION_ACCESS_ADMIN,
  authLogout: ACTION_ACCESS_ADMIN,
  adminSeasonList: ACTION_ACCESS_ADMIN,
  attendanceDashboardSummary: ACTION_ACCESS_ADMIN,
  attendanceDashboardDrilldown: ACTION_ACCESS_ADMIN,
  studentUrl: ACTION_ACCESS_ADMIN,
  adminUrl: ACTION_ACCESS_ADMIN,
  sheetLink: ACTION_ACCESS_ADMIN,
  scheduleList: ACTION_ACCESS_ADMIN,
  scheduleSave: ACTION_ACCESS_ADMIN,
  scheduleDelete: ACTION_ACCESS_ADMIN,
  members: ACTION_ACCESS_ADMIN,
  manualApproveStatus: ACTION_ACCESS_ADMIN,
  manualApprove: ACTION_ACCESS_ADMIN,
  manualApproveBatch: ACTION_ACCESS_ADMIN,
  excusedSet: ACTION_ACCESS_ADMIN,
  graduationReport: ACTION_ACCESS_ADMIN,
  sheetSchemaAudit: ACTION_ACCESS_ADMIN,
  adminUsersList: ACTION_ACCESS_SUPER,
  adminUsersUpsert: ACTION_ACCESS_SUPER,
  adminUsersDelete: ACTION_ACCESS_SUPER,
  setActiveSheet: ACTION_ACCESS_SUPER,
  variablesGet: ACTION_ACCESS_ADMIN,
  variablesUpdate: ACTION_ACCESS_ADMIN,
  variablesNormalize: ACTION_ACCESS_ADMIN,
  variablesResetTemplate: ACTION_ACCESS_ADMIN,
  seasonImportBegin: ACTION_ACCESS_SUPER,
  seasonImportChunk: ACTION_ACCESS_SUPER,
  seasonImportDiff: ACTION_ACCESS_SUPER,
  seasonImportFinalize: ACTION_ACCESS_SUPER,
  seasonImportAbort: ACTION_ACCESS_SUPER,
  fortuneVersionList: ACTION_ACCESS_ADMIN,
  fortuneVersionGet: ACTION_ACCESS_ADMIN,
  fortuneUploadBegin: ACTION_ACCESS_ADMIN,
  fortuneUploadChunk: ACTION_ACCESS_ADMIN,
  fortuneUploadFinalize: ACTION_ACCESS_ADMIN,
  fortuneUploadAbort: ACTION_ACCESS_ADMIN
});

const VARIABLE_CATALOG = {
  attendance_open_offset_min: {
    labelKo: '출석 오픈 오프셋',
    formula: 'openTime = startTime + attendance_open_offset_min',
    example: '-30 이면 시작 30분 전 오픈',
    validation: { kind: 'number', min: -240, max: 0, required: true }
  },
  late_threshold_min: {
    labelKo: '지각 판정 기준',
    formula: 'onTimeDeadline = startTime + late_threshold_min',
    example: '50 이면 시작 50분까지 정시',
    validation: { kind: 'number', min: 1, max: 360, required: true }
  },
  absence_threshold_min: {
    labelKo: '기본 출석 마감 기준',
    formula: 'lateDeadline = startTime + absence_threshold_min',
    example: '180 이면 시작 3시간 후 마감',
    validation: { kind: 'number', min: 1, max: 600, required: true }
  },
  required_attendance_count: {
    labelKo: '수료 최소 출석 횟수',
    formula: 'attendedCount >= required_attendance_count',
    example: '3 이면 최소 3회 출석 필요',
    validation: { kind: 'number', min: 0, max: 100, required: true }
  },
  late_to_absence_ratio: {
    labelKo: '지각 결석 환산비',
    formula: 'absenceEquivalent = absent + floor(late / ratio)',
    example: '3 이면 지각 3회 = 결석 1회',
    validation: { kind: 'number', min: 1, max: 20, required: true }
  },
  required_session_positions: {
    labelKo: '필참 회차 위치',
    formula: '허용값: first,last 조합',
    example: 'first,last',
    validation: { kind: 'required_positions', required: true }
  },
  max_absence_equivalent: {
    labelKo: '결석환산 상한',
    formula: 'absenceEquivalent <= max_absence_equivalent',
    example: '빈값이면 자동 계산',
    validation: { kind: 'number', min: 0, max: 100, required: false, allowEmpty: true }
  },
  official_session_min_recommended: {
    labelKo: '권장 최소 공식행사 수',
    formula: '권장 구간 하한',
    example: '6',
    validation: { kind: 'number', min: 0, max: 100, required: true }
  },
  official_session_max_recommended: {
    labelKo: '권장 최대 공식행사 수',
    formula: '권장 구간 상한',
    example: '8',
    validation: { kind: 'number', min: 0, max: 100, required: true }
  },
  default_session_start_time: {
    labelKo: '일정 기본 시작시간',
    formula: '신규 회차 시작 시각 기본값',
    example: '19:00',
    validation: { kind: 'hhmm', required: true }
  }
};

const REQUIRED_VARIABLE_SPECS = [
  {
    key: 'attendance_open_offset_min',
    value: -30,
    type: 'number',
    description: '출석 오픈 오프셋(시작 n분 전)',
    appliesTo: '출석 오픈 시각 계산',
    appliesWhen: '회차 시작 시각 기준',
    usedIn: 'collectSessionsFromSheet.openTime'
  },
  {
    key: 'late_threshold_min',
    value: 50,
    type: 'number',
    description: '지각 판정 기준(시작 후 n분)',
    appliesTo: '정시/지각 경계 계산',
    appliesWhen: '회차 시작 이후',
    usedIn: 'collectSessionsFromSheet.onTimeDeadline'
  },
  {
    key: 'absence_threshold_min',
    value: 180,
    type: 'number',
    description: '기본 출석 마감 기준(종료 미입력 시)',
    appliesTo: '종료시간 미입력 회차 마감 계산',
    appliesWhen: '회차 종료시간이 비어 있을 때',
    usedIn: 'collectSessionsFromSheet.lateDeadline;web/admin.suggestScheduleEndTime'
  },
  {
    key: 'required_attendance_count',
    value: 3,
    type: 'number',
    description: '수료 최소 출석 횟수',
    appliesTo: '수료 최소 출석 조건 계산',
    appliesWhen: '수료 판정 계산 시',
    usedIn: 'getGraduationReport.requiredAttendance'
  },
  {
    key: 'late_to_absence_ratio',
    value: 3,
    type: 'number',
    description: '지각 n회 = 결석 1회',
    appliesTo: '결석환산 계산',
    appliesWhen: '수료 판정 계산 시',
    usedIn: 'getGraduationReport.absenceEquivalent'
  },
  {
    key: 'required_session_positions',
    value: 'first,last',
    type: 'string',
    description: '필참 회차 위치',
    appliesTo: '필참 회차 충족 여부 계산',
    appliesWhen: '수료 판정 계산 시',
    usedIn: 'evaluateRequiredSessions;getGraduationReport.requiredCheck'
  },
  {
    key: 'max_absence_equivalent',
    value: '',
    type: 'number',
    description: '결석환산 상한(빈값이면 자동 계산)',
    appliesTo: '결석환산 임계치 계산',
    appliesWhen: '수료 판정 계산 시',
    usedIn: 'getGraduationReport.absenceThreshold'
  },
  {
    key: 'official_session_min_recommended',
    value: 6,
    type: 'number',
    description: '권장 최소 공식 행사 수',
    appliesTo: '운영 가이드 표시값',
    appliesWhen: '수료 규칙 안내 렌더링 시',
    usedIn: 'getGraduationReport.variables'
  },
  {
    key: 'official_session_max_recommended',
    value: 8,
    type: 'number',
    description: '권장 최대 공식 행사 수',
    appliesTo: '운영 가이드 표시값',
    appliesWhen: '수료 규칙 안내 렌더링 시',
    usedIn: 'getGraduationReport.variables'
  },
  {
    key: 'default_session_start_time',
    value: '19:00',
    type: 'string',
    description: '일정 관리 기본 시작시간(HH:mm)',
    appliesTo: '신규 일정 시작시간 기본값',
    appliesWhen: '일정 관리 탭 신규 회차 입력 시',
    usedIn: 'getScheduleList.defaults;web/admin.getDefaultScheduleStartTime'
  }
];

const VARIABLE_DEFAULTS = {
  attendance_open_offset_min: -30,
  late_threshold_min: 50,
  absence_threshold_min: 180,
  required_attendance_count: 3,
  late_to_absence_ratio: 3,
  required_session_positions: 'first,last',
  max_absence_equivalent: '',
  official_session_min_recommended: 6,
  official_session_max_recommended: 8,
  default_session_start_time: '19:00'
};

const MINUTE_VARIABLE_KEYS = {
  attendance_open_offset_min: true,
  late_threshold_min: true,
  absence_threshold_min: true
};

const VARIABLE_USAGE_TAB_ORDER = [
  'QR코드 관리',
  '출석하기',
  '출석현황',
  '일정 관리',
  '변수명 관리',
  '유고 처리',
  '수료 판정'
];

const VARIABLE_KEY_TAB_MAP = {
  attendance_open_offset_min: ['출석하기', '출석현황', '일정 관리', '유고 처리', '수료 판정'],
  late_threshold_min: ['출석하기', '출석현황', '일정 관리', '유고 처리', '수료 판정'],
  absence_threshold_min: ['출석하기', '출석현황', '일정 관리', '유고 처리', '수료 판정'],
  required_attendance_count: ['유고 처리', '수료 판정'],
  late_to_absence_ratio: ['유고 처리', '수료 판정'],
  required_session_positions: ['유고 처리', '수료 판정'],
  max_absence_equivalent: ['유고 처리', '수료 판정'],
  official_session_min_recommended: ['수료 판정'],
  official_session_max_recommended: ['수료 판정'],
  default_session_start_time: ['일정 관리']
};

/**
 * 웹앱 진입점
 * - api 파라미터가 있으면 JSONP API 라우팅
 * - 그 외에는 GitHub Pages로 리디렉션
 */
