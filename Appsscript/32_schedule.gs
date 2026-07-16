function validateScheduleEventName(value) {
  const eventName = String(value || '').trim();
  if (/\r|\n|\u0085|\u2028|\u2029/.test(eventName)) {
    return { valid: false, message: '행사명은 줄바꿈 없이 한 줄로 입력해 주세요.' };
  }
  if (Array.from(eventName).length > SCHEDULE_EVENT_NAME_MAX_CODE_POINTS) {
    return { valid: false, message: `행사명은 ${SCHEDULE_EVENT_NAME_MAX_CODE_POINTS}자 이내로 입력해 주세요.` };
  }
  return { valid: true, eventName: eventName };
}

function resolveScheduleHeaderNoteUnderLock(options) {
  const opts = options || {};
  const latestRaw = String(opts.lockedTarget && opts.lockedTarget.headerNoteRaw || '').trim();
  const isExplicitEdit = !!opts.eventNameProvided || !!opts.locationPolicyProvided;
  if (!isExplicitEdit) {
    return { valid: true, headerNote: latestRaw };
  }

  const initialRaw = String(opts.initialTarget && opts.initialTarget.headerNoteRaw || '').trim();
  if (opts.initialTarget && latestRaw !== initialRaw) {
    return {
      valid: false,
      errorCode: 'SCHEDULE_CHANGED_RETRY',
      message: '행사명 또는 회차 메모가 다른 요청에서 변경되었습니다. 새로고침 후 다시 시도해 주세요.'
    };
  }

  const latest = parseSessionHeaderNote(latestRaw);
  const eventName = opts.eventNameProvided ? opts.requestedEventName : latest.eventName;
  const locationNote = opts.locationPolicyProvided ? opts.requestedLocationNote : latest.locationNote;
  return { valid: true, headerNote: buildSessionHeaderNote(eventName, locationNote) };
}

function getSheetLink(seasonName) {
  try {
    const info = getRequestedSeasonSheetInfo(seasonName);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const baseUrl = ss.getUrl();
    const sheetUrl = `${baseUrl}#gid=${info.sheet.getSheetId()}`;

    return {
      success: true,
      spreadsheetUrl: baseUrl,
      sheetUrl: sheetUrl,
      sheetName: info.currentSheet,
      seasonAlias: info.seasonAlias,
      gid: info.sheet.getSheetId()
    };
  } catch (error) {
    return {
      success: false,
      message: error.message || '시트 링크 생성 중 오류가 발생했습니다.'
    };
  }
}

function buildSheetSchemaAuditReport(sheet, seasonAlias) {
  const values = sheet.getDataRange().getValues();
  const headers = values[0] || [];
  const schema = resolveMemberSchemaFromHeaders(headers);

  const strictRequired = ['name', 'season', 'phone', 'email'];
  const requiredMissingCounts = {};
  strictRequired.forEach(field => {
    requiredMissingCounts[field] = 0;
  });

  const phoneRowsByValue = {};
  for (let i = 1; i < values.length; i++) {
    const row = values[i];
    const member = readMemberFromRow(row, schema);

    if (!member.name) requiredMissingCounts.name++;
    if (!member.phone) requiredMissingCounts.phone++;
    if (member.season === null || isNaN(Number(member.season))) requiredMissingCounts.season++;
    if (!member.email || !isValidImportEmail(member.email)) requiredMissingCounts.email++;

    if (member.phone) {
      if (!phoneRowsByValue[member.phone]) {
        phoneRowsByValue[member.phone] = [];
      }
      phoneRowsByValue[member.phone].push(i + 1);
    }
  }

  const duplicatePhones = [];
  Object.keys(phoneRowsByValue).forEach(phone => {
    const rows = phoneRowsByValue[phone];
    if (rows.length > 1) {
      duplicatePhones.push({ phone: phone, rows: rows });
    }
  });

  return {
    seasonAlias: seasonAlias || toSeasonAlias(sheet.getName()),
    sheetName: sheet.getName(),
    headerMap: schema.fieldMap,
    headerRow: headers,
    mode: schema.isV2 ? 'v2' : 'v1_or_custom',
    modeDetail: schema.mode || (schema.isV2 ? 'v2_strict' : 'custom'),
    sessionStartColIndex: schema.sessionStartColIndex,
    profileEndColIndex: schema.profileEndColIndex,
    customProfileColumns: (schema.customProfileColumns || []).map(item => ({
      colIndex: item.colIndex,
      col: item.colIndex + 1,
      header: item.header
    })),
    sessionDetectedCount: schema.sessionColumns.length,
    requiredMissingCounts: requiredMissingCounts,
    duplicatePhones: duplicatePhones,
    strictMissingRequired: schema.strictMissingRequired
  };
}

function getSheetSchemaAudit(seasonName) {
  try {
    const requested = String(seasonName || '').trim();
    const reports = [];

    if (requested) {
      const info = getRequestedSeasonSheetInfo(requested);
      reports.push(buildSheetSchemaAuditReport(info.sheet, info.seasonAlias));
    } else {
      const candidates = getSeasonSheetCandidates();
      candidates.forEach(item => {
        reports.push(buildSheetSchemaAuditReport(item.sheet, item.alias));
      });
    }

    return {
      success: true,
      generatedAt: new Date().getTime(),
      reports: reports
    };
  } catch (error) {
    return {
      success: false,
      message: error.message || '시트 스키마 감사 중 오류가 발생했습니다.'
    };
  }
}

function getScheduleList(seasonName) {
  try {
    const info = getRequestedSeasonSheetInfo(seasonName);
    const now = new Date();
    const variableConfig = getVariableConfig();
    const sessions = collectSessionsFromSheet(info.sheet, { variableConfig: variableConfig, createMissingMeta: false });
    const dateMap = {};

    const items = sessions.map(session => {
      const dateKey = formatDateKey(session.startTime);
      if (!dateMap[dateKey]) {
        dateMap[dateKey] = [];
      }
      dateMap[dateKey].push(session.sessionKey);

      return {
        sessionKey: session.sessionKey,
        header: session.header,
        startTime: session.startTime.getTime(),
        openTime: session.openTime.getTime(),
        onTimeDeadline: session.onTimeDeadline.getTime(),
        lateDeadline: session.lateDeadline.getTime(),
        explicitEndAt: session.explicitEndAt,
        startLabel: formatDateTimeMinute(session.startTime),
        openLabel: formatDateTimeMinute(session.openTime),
        endLabel: formatDateTimeMinute(session.lateDeadline),
        dateKey: dateKey,
        startHhmm: formatTimeHhmm(session.startTime),
        isPast: now > session.lateDeadline,
        isActive: now >= session.openTime && now <= session.lateDeadline,
        locationPolicyPresent: session.locationPolicyPresent,
        locationRequired: session.locationRequired,
        locationPolicyValid: session.locationPolicyValid,
        locationPolicyErrorCode: session.locationPolicyErrorCode,
        googlePlaceId: session.googlePlaceId,
        radiusM: session.radiusM,
        eventName: session.eventName,
        locationNote: session.locationNote
      };
    });

    const dateConflicts = Object.keys(dateMap)
      .filter(dateKey => dateMap[dateKey].length > 1)
      .sort()
      .map(dateKey => ({
        dateKey: dateKey,
        sessionKeys: dateMap[dateKey]
      }));

    return {
      success: true,
      seasonAlias: info.seasonAlias,
      currentSheet: info.currentSheet,
      defaults: {
        default_session_start_time: variableConfig.default_session_start_time,
        absence_threshold_min: variableConfig.absence_threshold_min,
        attendance_open_offset_min: variableConfig.attendance_open_offset_min
      },
      items: items,
      dateConflicts: dateConflicts
    };
  } catch (error) {
    return {
      success: false,
      message: error.message || '일정 조회 중 오류가 발생했습니다.'
    };
  }
}

function getStudentSchedule(seasonName) {
  try {
    const info = getRequestedSeasonSheetInfo(seasonName);
    const variableConfig = getVariableConfig();
    const sessions = collectSessionsFromSheet(info.sheet, { variableConfig: variableConfig, createMissingMeta: false });
    const requiredPositions = parseRequiredSessionPositions(variableConfig.required_session_positions);

    return {
      success: true,
      seasonAlias: info.seasonAlias,
      items: sessions.map((session, index) => ({
        sessionKey: session.sessionKey,
        eventName: session.eventName || '',
        date: formatDateTimeMinute(session.startTime),
        endTime: formatDateTimeMinute(session.lateDeadline),
        locationRequired: !!session.locationRequired,
        locationNote: session.locationNote || '',
        mapsUrl: session.googlePlaceId
          ? `https://www.google.com/maps/search/?api=1&query=Google&query_place_id=${encodeURIComponent(session.googlePlaceId)}`
          : '',
        requiredPosition: index === 0 && requiredPositions.indexOf('first') >= 0
          ? 'first'
          : (index === sessions.length - 1 && requiredPositions.indexOf('last') >= 0 ? 'last' : '')
      })),
      completionPolicy: {
        requiredAttendanceCount: Math.max(0, Number(variableConfig.required_attendance_count || 0)),
        lateToAbsenceRatio: Math.max(1, Number(variableConfig.late_to_absence_ratio || 1)),
        maxAbsenceEquivalent: variableConfig.max_absence_equivalent,
        requiredSessionPositions: requiredPositions
      }
    };
  } catch (error) {
    return { success: false, message: error.message || '학생 일정 조회 중 오류가 발생했습니다.' };
  }
}

function saveSchedule(params) {
  try {
    const info = getRequestedSeasonSheetInfo(params.season || '');
    const sessionKey = String(params.sessionKey || '').trim();
    const startAt = String(params.startAt || '').trim();
    const endAt = String(params.endAt || '').trim();
    const locationPolicyProvided = parseBooleanParam(params.locationPolicyPresent);
    const eventNameProvided = parseBooleanParam(params.eventNameProvided);
    const eventNameValidation = validateScheduleEventName(params.eventName || '');
    if (eventNameProvided && !eventNameValidation.valid) {
      return { success: false, message: eventNameValidation.message };
    }
    let eventName = eventNameProvided ? eventNameValidation.eventName : '';

    if (!startAt) {
      return { success: false, message: 'startAt 파라미터가 필요합니다.' };
    }

    const startTime = parseDateTimeInput(startAt);
    if (!startTime || isNaN(startTime.getTime())) {
      return { success: false, message: 'startAt 형식이 올바르지 않습니다. (예: 2026-03-01T19:00)' };
    }

    if (endAt && !/^(\d{2}):(\d{2})$/.test(endAt)) {
      return { success: false, message: 'endAt 형식이 올바르지 않습니다. (예: 21:30)' };
    }

    const sheet = info.sheet;
    const variableConfig = getVariableConfig();
    const initialSessions = collectSessionsFromSheet(sheet, { variableConfig: variableConfig, createMissingMeta: false });
    const initialTarget = sessionKey ? initialSessions.find(s => s.sessionKey === sessionKey) : null;
    if (sessionKey && !initialTarget) {
      return { success: false, message: '수정 대상 회차를 찾을 수 없습니다.' };
    }

    let locationPolicy = null;
    let locationNote = '';
    if (locationPolicyProvided) {
      const locationRequired = parseBooleanParam(params.locationRequired);
      const googlePlaceId = String(params.googlePlaceId || params.placeId || '').trim();
      locationNote = String(params.locationNote || '').trim();
      if (locationNote.length > 500) {
        return { success: false, message: '장소 메모는 500자 이내로 입력해 주세요.' };
      }

      locationPolicy = {
        locationRequired: locationRequired,
        googlePlaceId: googlePlaceId,
        radiusM: ATTENDANCE_LOCATION_RADIUS_M
      };
      if (locationRequired) {
        if (!googlePlaceId) {
          return { success: false, errorCode: 'GOOGLE_PLACE_ID_MISSING', message: 'Google 장소를 검색해 하나 선택해 주세요.' };
        }
        if (googlePlaceId.length > 4096) {
          return { success: false, errorCode: 'GOOGLE_PLACE_ID_INVALID', message: 'Google Place ID가 너무 깁니다. 장소를 다시 선택해 주세요.' };
        }
        resolveGooglePlaceTarget(googlePlaceId);
      }
    } else if (initialTarget) {
      if (initialTarget.locationPolicyPresent && !initialTarget.locationPolicyValid) {
        return {
          success: false,
          errorCode: initialTarget.locationPolicyErrorCode || 'LOCATION_POLICY_INVALID',
          message: '현재 회차의 장소 정책 문자열이 올바르지 않습니다. 새 관리자 화면에서 장소 정책을 다시 저장해 주세요.'
        };
      }
      locationPolicy = initialTarget.locationPolicyPresent
        ? {
          locationRequired: initialTarget.locationRequired,
          googlePlaceId: initialTarget.googlePlaceId,
          radiusM: initialTarget.radiusM
        }
        : null;
      locationNote = initialTarget.locationNote || '';
    }
    if (!eventNameProvided && initialTarget) {
      eventName = initialTarget.eventName || '';
    }

    const newSessionKey = formatSessionKey(startTime);
    const targetDateKey = formatDateKey(startTime);
    const headerValue = buildSessionHeader(startTime, endAt, locationPolicy);
    const lock = LockService.getDocumentLock();
    lock.waitLock(5000);

    try {
      const sessions = collectSessionsFromSheet(sheet, { variableConfig: variableConfig, createMissingMeta: true });
      const duplicate = sessions.find(s => s.sessionKey === newSessionKey && s.sessionKey !== sessionKey);
      if (duplicate) {
        return { success: false, message: `동일한 시작시각의 회차가 이미 존재합니다. (${newSessionKey})` };
      }

      const duplicateDate = sessions.find(s => formatDateKey(s.startTime) === targetDateKey && s.sessionKey !== sessionKey);
      if (duplicateDate) {
        return {
          success: false,
          errorCode: 'SCHEDULE_DATE_DUPLICATE',
          message: `같은 날짜(${targetDateKey})에는 회차를 1개만 등록할 수 있습니다. 기존 회차(${duplicateDate.sessionKey})를 먼저 수정/삭제하세요.`,
          conflictSessionKey: duplicateDate.sessionKey,
          conflictDateKey: targetDateKey
        };
      }

      if (sessionKey) {
        const target = sessions.find(s => s.sessionKey === sessionKey);
        if (!target) {
          return { success: false, message: '수정 대상 회차를 찾을 수 없습니다.' };
        }
        if (initialTarget && target.header !== initialTarget.header) {
          return { success: false, errorCode: 'SCHEDULE_CHANGED_RETRY', message: '회차가 다른 요청에서 변경되었습니다. 새로고침 후 다시 시도해 주세요.' };
        }

        const headerNoteResolution = resolveScheduleHeaderNoteUnderLock({
          eventNameProvided: eventNameProvided,
          requestedEventName: eventName,
          locationPolicyProvided: locationPolicyProvided,
          requestedLocationNote: locationNote,
          initialTarget: initialTarget,
          lockedTarget: target
        });
        if (!headerNoteResolution.valid) {
          return {
            success: false,
            errorCode: headerNoteResolution.errorCode,
            message: headerNoteResolution.message
          };
        }

        sheet.getRange(1, target.colIndex + 1).setValue(headerValue).setNote(headerNoteResolution.headerNote);

        if (sessionKey !== newSessionKey) {
          removeSessionMetaRow(sheet.getName(), sessionKey);
        }

        upsertSessionMetaRow(sheet.getName(), newSessionKey, {
          openOffsetMin: variableConfig.attendance_open_offset_min,
          lateThresholdMin: variableConfig.late_threshold_min,
          absenceThresholdMin: variableConfig.absence_threshold_min,
          explicitEndAt: endAt
        });
      } else {
        const insertCol = sheet.getLastColumn() + 1;
        sheet.getRange(1, insertCol).setValue(headerValue).setNote(buildSessionHeaderNote(eventName, locationNote));

        upsertSessionMetaRow(sheet.getName(), newSessionKey, {
          openOffsetMin: variableConfig.attendance_open_offset_min,
          lateThresholdMin: variableConfig.late_threshold_min,
          absenceThresholdMin: variableConfig.absence_threshold_min,
          explicitEndAt: endAt
        });
      }
    } finally {
      lock.releaseLock();
    }

    return {
      success: true,
      message: sessionKey ? '일정이 수정되었습니다.' : '일정이 추가되었습니다.',
      seasonAlias: info.seasonAlias,
      sessionKey: newSessionKey,
      eventName: eventName,
      locationRequired: !!(locationPolicy && locationPolicy.locationRequired),
      radiusM: ATTENDANCE_LOCATION_RADIUS_M
    };
  } catch (error) {
    return {
      success: false,
      errorCode: error && error.apiCode ? error.apiCode : 'SCHEDULE_SAVE_ERROR',
      message: error.message || '일정 저장 중 오류가 발생했습니다.'
    };
  }
}

function deleteSchedule(params) {
  try {
    const info = getRequestedSeasonSheetInfo(params.season || '');
    const sessionKey = String(params.sessionKey || '').trim();
    const forceDelete = parseBooleanParam(params.forceDelete);
    const confirmSessionKey = String(params.confirmSessionKey || '').trim();
    if (!sessionKey) {
      return { success: false, message: 'sessionKey 파라미터가 필요합니다.' };
    }

    const sheet = info.sheet;
    const lock = LockService.getDocumentLock();
    lock.waitLock(5000);

    try {
      const sessions = collectSessionsFromSheet(sheet, { createMissingMeta: true });
      const target = sessions.find(s => s.sessionKey === sessionKey);

      if (!target) {
        return { success: false, message: '삭제 대상 회차를 찾을 수 없습니다.' };
      }

      const attendanceRecordCount = countAttendanceRecordsInSession(sheet, target.colIndex);
      if (attendanceRecordCount > 0 && !forceDelete) {
        return {
          success: false,
          errorCode: 'SCHEDULE_DELETE_HAS_ATTENDANCE',
          message: `이미 ${attendanceRecordCount}건의 출석 기록이 있어 삭제하려면 강제 삭제 확인이 필요합니다.`,
          attendanceRecordCount: attendanceRecordCount,
          sessionKey: sessionKey
        };
      }

      if (attendanceRecordCount > 0 && forceDelete && confirmSessionKey !== sessionKey) {
        return {
          success: false,
          errorCode: 'SCHEDULE_DELETE_CONFIRM_KEY_MISMATCH',
          message: '강제 삭제 확인이 실패했습니다. 표시된 회차 키를 그대로 입력해 주세요.'
        };
      }

      sheet.deleteColumn(target.colIndex + 1);
      removeSessionMetaRow(sheet.getName(), sessionKey);

      return {
        success: true,
        message: attendanceRecordCount > 0 ? '강제 삭제로 일정이 삭제되었습니다.' : '일정이 삭제되었습니다.',
        sessionKey: sessionKey,
        seasonAlias: info.seasonAlias,
        forceDeleted: attendanceRecordCount > 0,
        attendanceRecordCount: attendanceRecordCount
      };
    } finally {
      lock.releaseLock();
    }
  } catch (error) {
    return {
      success: false,
      message: error.message || '일정 삭제 중 오류가 발생했습니다.'
    };
  }
}
