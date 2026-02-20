window.AdminApp = window.AdminApp || {};
window.AdminApp.compat = window.AdminApp.compat || {};

(function registerCompatHandlers() {
  const names = [
  "toggleAuthInfoPopover",
  "logoutAdmin",
  "changeSheet",
  "openCurrentSheet",
  "refreshSeasonData",
  "openTab",
  "generateSeasonQRCode",
  "copyUrl",
  "toggleQRBlur",
  "submitManualApproveBatch",
  "onManualSessionChanged",
  "onManualMemberSearchInput",
  "setManualAbsentOnly",
  "setManualSelectedOnly",
  "toggleManualSelectFiltered",
  "onManualDefaultCommentInput",
  "setManualForceOverride",
  "applyAttendanceDashboardPreset",
  "dashboardSelectAllSessions",
  "dashboardSelectClosedSessions",
  "dashboardSelectRecentSessions",
  "dashboardClearSessionSelection",
  "dashboardSelectTopMembers",
  "dashboardClearMemberSelection",
  "applyAttendanceDashboardFilters",
  "resetAttendanceDashboardFilters",
  "copyAttendanceDashboardShareLink",
  "downloadAttendanceDashboardCsv",
  "checkAttendanceStatus",
  "saveSchedule",
  "deleteSelectedSchedule",
  "resetScheduleForm",
  "moveCalendarMonth",
  "goCalendarToday",
  "analyzeImportFile",
  "resetImportFlow",
  "toggleImportCard",
  "handleImportCardHeaderKey",
  "refreshSheetSchemaAudit",
  "confirmImportManualMapping",
  "downloadImportDebugJson",
  "onImportDiffFilterChange",
  "refreshImportExecuteButtonState",
  "executeSeasonImport",
  "saveVariables",
  "loadVariables",
  "resetVariablesTemplate",
  "loadGraduationReport",
  "setExcusedSearchKeyword",
  "setExcusedAbsentOnly",
  "saveAdminUser",
  "handleAdminRoleChange",
  "resetAdminUserForm",
  "loadAdminUsers",
  "closeExcuseModal",
  "submitExcuseModal",
  "closeExcuseOverrideModal",
  "submitExcuseOverrideModal",
  "onScheduleCalendarStartTimeChanged",
  "onScheduleCalendarEndInputChanged",
  "closeScheduleCalendarModal",
  "deleteFromCalendarModal",
  "submitScheduleCalendarModal",
  "closeScheduleDeleteForceModal",
  "submitScheduleDeleteForceModal"
];
  names.forEach((name) => {
    if (typeof window[name] === 'function') {
      window.AdminApp.compat[name] = window[name];
      return;
    }
    console.warn('[AdminApp] compat handler missing:', name);
  });
})();
