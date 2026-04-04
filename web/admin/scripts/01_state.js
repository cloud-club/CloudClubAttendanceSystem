let countdownInterval;
let isAttendanceActive = false;
let currentSeasonUrl = '';
let adminQrCodeLoaded = false;
let adminToken = '';
let currentAdminUser = null;
let currentSheetName = '';
let currentSeasonAlias = '';
let seasonSourceReady = false;
let seasonSourceBlockMessage = '';
let dashboardInitialized = false;
let authFlowLocked = false;
let googleClientId = '';
let adminUsersCache = [];
let adminUsersEditingEmail = '';
let scheduleItems = [];
let membersCache = [];
let variableItems = [];
let variableConfig = {};
let selectedVariableIndex = -1;
let graduationReportCache = null;
let excuseModalState = null;
let excuseOverrideState = null;
let graduationVisibleCount = 20;
let graduationSortState = { key: 'attendedCount', direction: 'desc' };
let scheduleDeleteForceState = null;
let scheduleDefaults = {};
let scheduleByDateMap = {};
let scheduleDateConflicts = [];
let calendarCursorYear = new Date().getFullYear();
let calendarCursorMonth = new Date().getMonth();
let calendarSelectedDateKey = '';
let scheduleCalendarModalState = null;
let excusedSearchKeyword = '';
let excusedAbsentOnly = false;
let graduationMatrixRenderToken = 0;
let variableApiInfo = null;
let variableTabBlocked = false;
let variableAutoNormalizedOnce = false;
let importRawMatrix = [];
let importFileMeta = null;
let importInference = null;
let importManualMapping = {};
let importManualConfirmed = false;
let importPreviewState = null;
let importDebugReport = null;
let importServerMode = 'create';
let importServerModeHint = 'create';
let importPendingImportId = '';
let importDiffState = null;
let importDiffToken = '';
let importAbortInFlight = null;
let importDiffFilterMode = 'all';
let fortuneCurrentVersion = null;
let fortuneCurrentVersionId = 'builtin';
let fortuneVersionItems = [];
let fortunePreviewRows = [];
let fortunePreviewPage = 1;
let fortunePreviewPageSize = 50;
let fortunePreviewTotalPages = 1;
let fortuneValidationState = null;
let fortunePendingUploadId = '';
let fortuneTabBlocked = false;
let fortuneApiInfo = null;
let fortuneRefreshInFlight = null;
let fortuneCurrentSnapshotReqSeq = 0;
let attendanceDashboardInitialized = false;
let attendanceDashboardLoading = false;
let attendanceDashboardPayload = null;
let attendanceDashboardDrilldownPayload = null;
let attendanceDashboardMemberSeriesCache = {};
let attendanceDashboardMemberHistoryCache = {};
let attendanceDashboardEventDrilldownCache = {};
let attendanceDashboardEventRateChart = null;
let attendanceDashboardEventStatusChart = null;
let attendanceDashboardMemberTrendChart = null;
let attendanceDashboardStatusDonutChart = null;
let attendanceDashboardCohortDonutChart = null;
let attendanceDashboardCountDonutChart = null;
let attendanceDashboardLastEventRows = [];
let attendanceDashboardActiveSliceFilter = null;
let attendanceDashboardActiveSliceMembers = [];
let attendanceDashboardActiveStatusRankingRows = [];
let attendanceDashboardActiveDrilldownMode = '';
let attendanceDashboardCountDistributionItems = [];
let attendanceDashboardMemberHistoryModalState = null;
let attendanceDashboardDateRangeUserEdited = false;
let attendanceDashboardAutoDateHydratedOnce = false;
let attendanceDashboardDateInputSyncing = false;
let attendanceDashboardActivePopover = '';
let attendanceDashboardLastFetchKey = '';
let attendanceDashboardLastFetchedAt = 0;
let attendanceDashboardSessionPickerRenderSignature = '';
let attendanceDashboardMemberPickerRenderSignature = '';
let attendanceDashboardSessionPickerLastOptionsRef = null;
let attendanceDashboardMemberPickerLastOptionsRef = null;
let attendanceDashboardLastRenderSignature = '';
let attendanceDashboardPendingMemberTrendRender = false;
let attendanceDashboardRefreshInterval = null;
let attendanceDashboardEventStatusRequestSeq = 0;
let attendanceDashboardState = {
  group: 'all',
  dateFrom: '',
  dateTo: '',
  sessionSearch: '',
  sessionKeys: [],
  sessionScopeMode: 'auto',
  topN: 10,
  sortBy: 'attendanceRate',
  chartType: 'bar',
  selectedMemberKeys: [],
  memberSearch: ''
};

const ATTENDANCE_DASHBOARD_STORAGE_KEY = 'cc_admin_attendance_dashboard_v2';
const ADMIN_TOKEN_STORAGE_KEY = 'cc_admin_token';
const ADMIN_ROLE_SUPER = 'super';
const ADMIN_ROLE_SEASON_ADMIN = 'season_admin';
const SUPER_ONLY_TABS = {
  variables: true,
  seasonImport: true,
  adminUsers: true
};
const ATTENDANCE_DASHBOARD_MAX_MEMBER_SELECTION = 5;
const ATTENDANCE_DASHBOARD_SEARCH_DEBOUNCE_MS = 120;
const ATTENDANCE_DASHBOARD_FRONT_CACHE_TTL_MS = 60000;
const ATTENDANCE_DASHBOARD_MEMBER_HISTORY_CACHE_TTL_MS = 60000;
const ATTENDANCE_DASHBOARD_REFRESH_INTERVAL_MS = 30000;
const FRONT_CACHE_TTL_SCHEDULE_MS = 45000;
const FRONT_CACHE_TTL_GRADUATION_MS = 45000;
const FRONT_CACHE_TTL_ADMIN_USERS_MS = 120000;
const FRONT_CACHE_TTL_SHEET_LINK_MS = 300000;
const FRONT_CACHE_TTL_ADMIN_URL_MS = 300000;
const FRONT_CACHE_TTL_RANKING_MS = 30000;
const MANUAL_MEMBER_SEARCH_DEBOUNCE_MS = 120;
const MANUAL_MEMBER_RENDER_CHUNK_SIZE = 24;
const MANUAL_MEMBER_CONTENT_VISIBILITY_THRESHOLD = 60;
const MATRIX_STICKY_ROW_LIMIT = 40;
const MATRIX_RENDER_CHUNK_SIZE = 24;
const ATTENDANCE_DASHBOARD_STATUS_LABELS = {
  on_time: '출석',
  late: '지각',
  absent: '결석',
  excused: '유고',
  pending: '미확정',
  future: '예정'
};
const MANUAL_APPROVE_BATCH_CHUNK_SIZE = 100;
const MANUAL_MEMBER_STATUS_LABELS = {
  none: '미기록',
  on_time: '출석',
  late: '지각',
  excused: '유고',
  absent: '미기록(결석)',
  future: '미기록(예정)',
  recorded: '기록됨'
};
const EXPECTED_AUTH_REJECTION_CODES = new Set([
  'UNAUTHORIZED',
  'AUTH_ADMIN_NOT_REGISTERED',
  'AUTH_ADMIN_INACTIVE',
  'AUTH_ADMIN_CONFIG_INVALID'
]);

let manualApproveState = null;
let manualMemberListRenderToken = 0;

let scheduleManualMemberListRender = null;

const IMPORT_FIELD_ORDER = [
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
const IMPORT_REQUIRED_FIELDS = ['name', 'season', 'phone', 'email'];
const IMPORT_FIELD_LABELS = {
  ignore: '무시',
  name: '이름',
  season: 'Season',
  phone: '전화번호',
  email: '이메일',
  githubId: 'Github ID',
  githubEmail: 'Github Email',
  notionEmail: 'Notion Email',
  discordId: 'Discord ID',
  slackEmail: 'Slack Email',
  feeChecked: '회비 체크',
  completed: '수료 여부',
  isStaff: '운영진 여부'
};
