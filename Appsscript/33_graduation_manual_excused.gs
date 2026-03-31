function getMembers(seasonName) {
  try {
    const info = getRequestedSeasonSheetInfo(seasonName);
    const sheet = info.sheet;
    const values = sheet.getDataRange().getValues();
    const memberSchema = resolveMemberSchemaFromHeaders(values[0] || []);

    const members = [];
    for (let i = 1; i < values.length; i++) {
      const member = readMemberFromRow(values[i], memberSchema);
      if (!member.name || !member.phone) continue;

      members.push({
        name: member.name,
        grade: member.seasonLabel || formatSeasonLabel(member.season),
        season: member.season,
        seasonLabel: member.seasonLabel || formatSeasonLabel(member.season),
        phone: member.phone,
        email: member.email,
        githubId: member.githubId,
        githubEmail: member.githubEmail,
        notionEmail: member.notionEmail,
        discordId: member.discordId,
        slackEmail: member.slackEmail,
        feeChecked: member.feeChecked,
        completed: member.completed,
        isStaff: member.isStaff,
        rowIndex: i + 1
      });
    }

    return {
      success: true,
      seasonAlias: info.seasonAlias,
      currentSheet: info.currentSheet,
      members: members
    };
  } catch (error) {
    return {
      success: false,
      message: error.message || '회원 목록 조회 중 오류가 발생했습니다.'
    };
  }
}

function manualApproveAttendance(params) {
  const seasonName = String(params.season || '').trim();
  const phone = String(params.phone || '').trim();
  const sessionKey = String(params.sessionKey || '').trim();
  const defaultComment = String(params.comment || params.defaultComment || '').trim();

  if (!seasonName || !phone || !sessionKey) {
    return { success: false, message: 'season, phone, sessionKey 파라미터가 필요합니다.' };
  }

  const cleanedPhone = normalizePhone(phone);
  if (!isValidPhoneNumber(cleanedPhone)) {
    return { success: false, message: '올바른 전화번호 형식이 아닙니다.' };
  }

  const lock = LockService.getDocumentLock();
  lock.waitLock(5000);

  try {
    const info = resolveSeasonSheetInfo(seasonName);
    const sheet = info.sheet;
    const values = sheet.getDataRange().getValues();
    const memberSchema = resolveMemberSchemaFromHeaders(values[0] || []);
    const sessions = collectSessionsFromSheet(sheet, { createMissingMeta: true, memberSchema: memberSchema });
    const session = sessions.find(s => s.sessionKey === sessionKey);

    if (!session) {
      return { success: false, message: '회차를 찾을 수 없습니다.' };
    }

    const lookup = findMemberRowIndexByPhone(values, memberSchema, cleanedPhone);
    if (lookup.duplicateRowIndexes.length > 0) {
      return buildPhoneSuperkeyDuplicateResult(lookup.duplicateRowIndexes);
    }

    const rowIndex = lookup.rowIndex;
    if (rowIndex < 0) {
      return { success: false, message: '해당 전화번호의 회원을 찾을 수 없습니다.' };
    }
    const member = readMemberFromRow(values[rowIndex], memberSchema);

    const targetRange = sheet.getRange(rowIndex + 1, session.colIndex + 1);
    const existingValue = targetRange.getValue();
    const existingRecord = buildManualApproveExistingRecordInfo(existingValue, targetRange.getNote(), session);
    if (existingRecord.hasValue) {
      return { success: false, message: '이미 값이 있는 회차입니다. 수동 승인 불가.' };
    }

    const processedAt = new Date();
    const writeMeta = computeManualApprovalWriteTime(processedAt, session);
    const writeTime = writeMeta.writeTime;
    const approvedAt = writeMeta.approvedAt;
    const formattedTime = formatDateTime(writeTime);
    const noteText = buildManualApproveNoteText({
      processedAt: processedAt,
      writtenAt: writeTime,
      boundaryAdjusted: writeMeta.boundaryAdjusted,
      boundaryAdjustReason: writeMeta.boundaryAdjustReason,
      defaultComment: defaultComment,
      memberComment: '',
      overwritten: false,
      existingRecord: existingRecord
    });

    targetRange.setValue(formattedTime);
    targetRange.setBackground(getManualApprovalBackgroundColor(writeTime, session));
    targetRange.setNote(noteText);

    return {
      success: true,
      message: '수동 출석 승인 완료',
      seasonAlias: info.seasonAlias,
      sessionKey: session.sessionKey,
      attendanceType: getAttendanceType(writeTime, session),
      time: formattedTime,
      writtenAt: formattedTime,
      actualApprovedAt: formatDateTime(approvedAt),
      boundaryAdjusted: writeMeta.boundaryAdjusted,
      boundaryAdjustReason: writeMeta.boundaryAdjustReason,
      timePolicy: 'actual_click_with_clamp',
      name: member.name,
      grade: member.seasonLabel || formatSeasonLabel(member.season),
      season: member.season,
      seasonLabel: member.seasonLabel || formatSeasonLabel(member.season),
      phone: cleanedPhone,
      processedAt: formatDateTime(processedAt),
      note: noteText
    };
  } finally {
    lock.releaseLock();
  }
}

function getAttendanceStatusLabelKo(status) {
  switch (String(status || '')) {
    case 'on_time': return '출석';
    case 'late': return '지각';
    case 'excused': return '유고';
    case 'absent': return '결석';
    case 'future': return '예정';
    case 'recorded': return '기록';
    case 'empty': return '없음';
    default: return '기록';
  }
}

function buildManualApproveExistingRecordInfo(existingValue, existingNote, session) {
  const rawText = existingValue === undefined || existingValue === null ? '' : String(existingValue).trim();
  const noteText = String(existingNote || '').trim();
  const isExcused = isExcusedValue(existingValue);
  const parsedTime = parseAttendanceTime(existingValue);
  const hasParsedTime = !!(parsedTime && !isNaN(parsedTime.getTime()));
  const hasValue = rawText !== '';

  let status = hasValue ? 'recorded' : 'empty';
  if (isExcused) {
    status = 'excused';
  } else if (hasParsedTime) {
    const computed = getAttendanceType(parsedTime, session);
    if (computed === 'on_time' || computed === 'late' || computed === 'absent') {
      status = computed;
    } else {
      status = 'recorded';
    }
  }

  return {
    hasValue: hasValue,
    status: status,
    existingTimeText: hasParsedTime ? formatDateTime(parsedTime) : rawText,
    existingNote: noteText
  };
}

function buildManualApproveNoteText(options) {
  const processedAt = options && options.processedAt instanceof Date ? options.processedAt : new Date();
  const writtenAt = options && options.writtenAt instanceof Date ? options.writtenAt : processedAt;
  const boundaryAdjusted = !!(options && options.boundaryAdjusted);
  const boundaryAdjustReason = String(options && options.boundaryAdjustReason || 'none').trim();
  const defaultComment = String(options && options.defaultComment || '').trim();
  const memberComment = String(options && options.memberComment || '').trim();
  const overwritten = !!(options && options.overwritten);
  const existingRecord = options && options.existingRecord ? options.existingRecord : {
    hasValue: false,
    status: 'empty',
    existingTimeText: '',
    existingNote: ''
  };

  const lines = [
    `[수동출석] 처리일시: ${formatDateTime(processedAt)}`,
    `기록시각: ${formatDateTime(writtenAt)}`,
    '기록정책: 실제 승인시각(경계보정 적용)'
  ];

  if (boundaryAdjusted) {
    if (boundaryAdjustReason === 'before_open') {
      lines.push('경계보정: 회차 오픈 시각으로 보정');
    } else if (boundaryAdjustReason === 'after_close') {
      lines.push('경계보정: 회차 마감 시각으로 보정');
    } else {
      lines.push('경계보정: 회차 경계 시각으로 보정');
    }
  }

  if (defaultComment) {
    lines.push(`관리자 공통멘트: ${defaultComment}`);
  }

  if (memberComment) {
    lines.push(`개별멘트: ${memberComment}`);
  }

  lines.push(`처리결과: ${overwritten ? '덮어쓰기' : '신규기록'}`);

  if (overwritten && existingRecord.hasValue) {
    const statusText = getAttendanceStatusLabelKo(existingRecord.status);
    const valueText = existingRecord.existingTimeText ? ` (${existingRecord.existingTimeText})` : '';
    lines.push(`기존기록: ${statusText}${valueText}`);
    if (existingRecord.existingNote) {
      lines.push(`기존메모: ${existingRecord.existingNote}`);
    }
  }

  return lines.join('\n');
}

function computeManualApprovalWriteTime(processedAt, session) {
  const approvedAt = processedAt instanceof Date && !isNaN(processedAt.getTime())
    ? processedAt
    : new Date();
  const openTime = session && session.openTime instanceof Date ? session.openTime : null;
  const lateDeadline = session && session.lateDeadline instanceof Date ? session.lateDeadline : null;

  let writeTime = new Date(approvedAt.getTime());
  let boundaryAdjusted = false;
  let boundaryAdjustReason = 'none';

  if (openTime && approvedAt.getTime() < openTime.getTime()) {
    writeTime = new Date(openTime.getTime());
    boundaryAdjusted = true;
    boundaryAdjustReason = 'before_open';
  } else if (lateDeadline && approvedAt.getTime() > lateDeadline.getTime()) {
    writeTime = new Date(lateDeadline.getTime());
    boundaryAdjusted = true;
    boundaryAdjustReason = 'after_close';
  }

  return {
    approvedAt: approvedAt,
    writeTime: writeTime,
    boundaryAdjusted: boundaryAdjusted,
    boundaryAdjustReason: boundaryAdjustReason
  };
}

function getManualApprovalBackgroundColor(writeTime, session) {
  return getAttendanceType(writeTime, session) === 'on_time'
    ? ON_TIME_COLOR
    : LATE_COLOR;
}

function manualApproveBatchAttendance(params) {
  const seasonName = String(params.season || '').trim();
  const sessionKey = String(params.sessionKey || '').trim();
  const defaultComment = String(params.defaultComment || '').trim();
  const forceOverride = parseBooleanParam(params.forceOverride);
  const rawItems = parseItemsJson(params.itemsJson || params.items || '[]');

  if (!seasonName || !sessionKey) {
    return { success: false, message: 'season, sessionKey 파라미터가 필요합니다.' };
  }

  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return { success: false, message: '승인할 대상(itemsJson)이 없습니다.' };
  }

  const normalizedItems = [];
  const seenPhoneMap = {};
  rawItems.forEach(item => {
    const obj = item && typeof item === 'object' ? item : {};
    const rawPhone = String(obj.phone || '').trim();
    const cleanedPhone = normalizePhone(rawPhone);
    if (!cleanedPhone) return;
    if (seenPhoneMap[cleanedPhone]) return;
    seenPhoneMap[cleanedPhone] = true;
    normalizedItems.push({
      phone: cleanedPhone,
      comment: String(obj.comment || '').trim()
    });
  });

  if (normalizedItems.length === 0) {
    return { success: false, message: '유효한 전화번호 대상이 없습니다.' };
  }

  const lock = LockService.getDocumentLock();
  lock.waitLock(5000);

  try {
    const info = resolveSeasonSheetInfo(seasonName);
    const sheet = info.sheet;
    const values = sheet.getDataRange().getValues();
    const memberSchema = resolveMemberSchemaFromHeaders(values[0] || []);
    const sessions = collectSessionsFromSheet(sheet, { createMissingMeta: true, memberSchema: memberSchema });
    const session = sessions.find(s => s.sessionKey === sessionKey);

    if (!session) {
      return { success: false, message: '회차를 찾을 수 없습니다.' };
    }

    const processedAt = new Date();
    const writeMeta = computeManualApprovalWriteTime(processedAt, session);
    const writeTime = writeMeta.writeTime;
    const approvedAt = writeMeta.approvedAt;
    const formattedTime = formatDateTime(writeTime);
    const results = [];
    const summary = {
      requested: normalizedItems.length,
      approved: 0,
      skipped: 0,
      overridden: 0,
      failed: 0
    };

    normalizedItems.forEach(item => {
      const rowResult = {
        phone: item.phone,
        status: 'failed',
        reasonCode: '',
        message: ''
      };

      try {
        if (!isValidPhoneNumber(item.phone)) {
          summary.failed++;
          rowResult.reasonCode = 'INVALID_PHONE';
          rowResult.message = '전화번호 형식이 올바르지 않습니다.';
          results.push(rowResult);
          return;
        }

        const lookup = findMemberRowIndexByPhone(values, memberSchema, item.phone);
        if (lookup.duplicateRowIndexes.length > 0) {
          summary.failed++;
          rowResult.reasonCode = 'DUPLICATE_PHONE';
          rowResult.message = '동일 전화번호 중복 행이 있어 처리할 수 없습니다.';
          results.push(rowResult);
          return;
        }

        const rowIndex = lookup.rowIndex;
        if (rowIndex < 0) {
          summary.failed++;
          rowResult.reasonCode = 'MEMBER_NOT_FOUND';
          rowResult.message = '해당 전화번호의 회원을 찾을 수 없습니다.';
          results.push(rowResult);
          return;
        }

        const member = readMemberFromRow(values[rowIndex], memberSchema);
        rowResult.name = member.name;
        rowResult.seasonLabel = member.seasonLabel || formatSeasonLabel(member.season);

        const targetRange = sheet.getRange(rowIndex + 1, session.colIndex + 1);
        const existingRecord = buildManualApproveExistingRecordInfo(targetRange.getValue(), targetRange.getNote(), session);

        if (existingRecord.hasValue && !forceOverride) {
          summary.skipped++;
          rowResult.status = 'skipped';
          rowResult.reasonCode = 'EXISTING_VALUE';
          rowResult.message = '이미 값이 있어 건너뜀 (덮어쓰기 비활성)';
          rowResult.previousStatus = existingRecord.status;
          rowResult.previousStatusLabel = getAttendanceStatusLabelKo(existingRecord.status);
          rowResult.previousValue = existingRecord.existingTimeText;
          rowResult.previousNote = existingRecord.existingNote;
          results.push(rowResult);
          return;
        }

        const noteText = buildManualApproveNoteText({
          processedAt: processedAt,
          writtenAt: writeTime,
          boundaryAdjusted: writeMeta.boundaryAdjusted,
          boundaryAdjustReason: writeMeta.boundaryAdjustReason,
          defaultComment: defaultComment,
          memberComment: item.comment,
          overwritten: existingRecord.hasValue,
          existingRecord: existingRecord
        });

        targetRange.setValue(formattedTime);
        targetRange.setBackground(getManualApprovalBackgroundColor(writeTime, session));
        targetRange.setNote(noteText);

        summary.approved++;
        if (existingRecord.hasValue) {
          summary.overridden++;
        }

        rowResult.status = 'approved';
        rowResult.reasonCode = existingRecord.hasValue ? 'OVERRIDDEN' : 'CREATED';
        rowResult.message = existingRecord.hasValue ? '기존 값을 덮어써 수동 승인 완료' : '수동 승인 완료';
        rowResult.overridden = !!existingRecord.hasValue;
        rowResult.time = formattedTime;
        rowResult.writtenAt = formattedTime;
        rowResult.actualApprovedAt = formatDateTime(approvedAt);
        rowResult.boundaryAdjusted = writeMeta.boundaryAdjusted;
        rowResult.boundaryAdjustReason = writeMeta.boundaryAdjustReason;
        rowResult.attendanceType = getAttendanceType(writeTime, session);
        results.push(rowResult);
      } catch (itemError) {
        summary.failed++;
        rowResult.reasonCode = 'INTERNAL_ITEM_ERROR';
        rowResult.message = itemError && itemError.message
          ? itemError.message
          : '처리 중 알 수 없는 오류가 발생했습니다.';
        results.push(rowResult);
      }
    });

    return {
      success: true,
      message: '관리자 수동 출석 배치 처리가 완료되었습니다.',
      seasonAlias: info.seasonAlias,
      sessionKey: session.sessionKey,
      attendanceType: getAttendanceType(writeTime, session),
      timePolicy: 'actual_click_with_clamp',
      time: formattedTime,
      writtenAt: formattedTime,
      actualApprovedAt: formatDateTime(approvedAt),
      boundaryAdjusted: writeMeta.boundaryAdjusted,
      boundaryAdjustReason: writeMeta.boundaryAdjustReason,
      processedAt: formatDateTime(processedAt),
      forceOverride: forceOverride,
      summary: summary,
      results: results
    };
  } finally {
    lock.releaseLock();
  }
}

function parseBooleanParam(value) {
  if (typeof value === 'boolean') return value;
  const raw = String(value || '').trim().toLowerCase();
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'y';
}

function buildExcusedExistingRecordInfo(existingValue, existingNote, session) {
  const rawText = existingValue === undefined || existingValue === null ? '' : String(existingValue).trim();
  const noteText = String(existingNote || '').trim();
  const isExcused = isExcusedValue(existingValue);
  const parsedTime = parseAttendanceTime(existingValue);
  const hasParsedTime = !!(parsedTime && !isNaN(parsedTime.getTime()));
  const hasDateValue = existingValue instanceof Date && !isNaN(existingValue.getTime());
  const hasNumericValue = typeof existingValue === 'number' && isFinite(existingValue);
  const hasFallbackTextRecord = !isExcused && rawText !== '' && (/\d/.test(rawText) || /(출석|지각)/.test(rawText));
  const hasAttendanceRecord = !isExcused && (hasParsedTime || hasDateValue || hasNumericValue || hasFallbackTextRecord);

  let status = '';
  if (hasAttendanceRecord) {
    if (hasParsedTime) {
      const computedStatus = getAttendanceType(parsedTime, session);
      status = (computedStatus === 'on_time' || computedStatus === 'late') ? computedStatus : 'recorded';
    } else {
      status = 'recorded';
    }
  }

  return {
    hasAttendanceRecord: hasAttendanceRecord,
    existingStatus: status,
    existingTimeText: hasParsedTime ? formatDateTime(parsedTime) : rawText,
    existingNote: noteText
  };
}

function setExcusedAttendance(params) {
  const seasonName = String(params.season || '').trim();
  const phone = String(params.phone || '').trim();
  const sessionKey = String(params.sessionKey || '').trim();
  const enabled = parseBooleanParam(params.enabled);
  const previewOnly = parseBooleanParam(params.previewOnly);
  const forceOverride = parseBooleanParam(params.forceOverride);
  const comment = String(params.comment || '').trim();

  if (!seasonName || !phone || !sessionKey) {
    return { success: false, message: 'season, phone, sessionKey 파라미터가 필요합니다.' };
  }

  const cleanedPhone = normalizePhone(phone);
  if (!isValidPhoneNumber(cleanedPhone)) {
    return { success: false, message: '올바른 전화번호 형식이 아닙니다.' };
  }

  const lock = LockService.getDocumentLock();
  lock.waitLock(5000);

  try {
    const info = resolveSeasonSheetInfo(seasonName);
    const sheet = info.sheet;
    const values = sheet.getDataRange().getValues();
    const memberSchema = resolveMemberSchemaFromHeaders(values[0] || []);
    const sessions = collectSessionsFromSheet(sheet, { createMissingMeta: true, memberSchema: memberSchema });
    const session = sessions.find(s => s.sessionKey === sessionKey);

    if (!session) {
      return { success: false, message: '회차를 찾을 수 없습니다.' };
    }

    const lookup = findMemberRowIndexByPhone(values, memberSchema, cleanedPhone);
    if (lookup.duplicateRowIndexes.length > 0) {
      return buildPhoneSuperkeyDuplicateResult(lookup.duplicateRowIndexes);
    }

    const rowIndex = lookup.rowIndex;
    if (rowIndex < 0) {
      return { success: false, message: '해당 전화번호의 회원을 찾을 수 없습니다.' };
    }

    const targetRange = sheet.getRange(rowIndex + 1, session.colIndex + 1);
    const existingValue = targetRange.getValue();
    const existingRecord = buildExcusedExistingRecordInfo(existingValue, targetRange.getNote(), session);
    const isAttendanceRecord = existingRecord.hasAttendanceRecord;

    if (enabled) {
      if (isAttendanceRecord && !forceOverride) {
        return {
          success: false,
          errorCode: 'EXCUSE_OVERRIDE_CONFIRM_REQUIRED',
          message: '이미 출석/지각 기록이 있습니다. 유고로 덮어쓸지 다시 확인해주세요.',
          existingStatus: existingRecord.existingStatus,
          existingTime: existingRecord.existingTimeText,
          existingNote: existingRecord.existingNote,
          requiresOverride: true
        };
      }

      if (previewOnly) {
        return {
          success: true,
          message: '유고 처리 사전 확인 완료',
          previewOnly: true,
          existingStatus: existingRecord.existingStatus,
          existingTime: existingRecord.existingTimeText,
          existingNote: existingRecord.existingNote,
          requiresOverride: false
        };
      }

      const noteLines = [];
      if (comment) {
        noteLines.push(`유고 사유: ${comment}`);
      }
      if (isAttendanceRecord) {
        const statusText = existingRecord.existingStatus === 'on_time'
          ? '출석'
          : (existingRecord.existingStatus === 'late' ? '지각' : '기록');
        noteLines.push(`[덮어쓰기] 기존 기록: ${statusText}${existingRecord.existingTimeText ? ` (${existingRecord.existingTimeText})` : ''}`);
        if (existingRecord.existingNote) {
          noteLines.push(`[기존 메모] ${existingRecord.existingNote}`);
        }
      }

      targetRange.setValue('유고');
      targetRange.setBackground(EXCUSED_COLOR);
      targetRange.setNote(noteLines.join('\n'));

      return {
        success: true,
        message: '유고 처리 완료',
        seasonAlias: info.seasonAlias,
        sessionKey: session.sessionKey,
        phone: cleanedPhone,
        enabled: true,
        comment: comment,
        overwrittenAttendance: isAttendanceRecord,
        previousStatus: isAttendanceRecord ? existingRecord.existingStatus : ''
      };
    }

    if (isExcusedValue(existingValue)) {
      targetRange.clearContent();
      targetRange.setBackground('#ffffff');
      targetRange.clearNote();
    }

    return {
      success: true,
      message: '유고 해제 완료',
      seasonAlias: info.seasonAlias,
      sessionKey: session.sessionKey,
      phone: cleanedPhone,
      enabled: false
    };
  } finally {
    lock.releaseLock();
  }
}

function parseRequiredSessionPositions(raw) {
  const text = String(raw || '').trim();
  if (!text) return ['first', 'last'];

  const allowed = { first: true, last: true };
  const list = text.split(',').map(v => String(v || '').trim().toLowerCase()).filter(v => !!allowed[v]);

  if (list.length === 0) return ['first', 'last'];
  return list;
}

function evaluateRequiredSessions(requiredPositions, sessions, statusBySessionKey) {
  const results = [];

  requiredPositions.forEach(pos => {
    let targetSession = null;

    if (pos === 'first' && sessions.length > 0) {
      targetSession = sessions[0];
    }

    if (pos === 'last' && sessions.length > 0) {
      targetSession = sessions[sessions.length - 1];
    }

    if (!targetSession) return;

    const status = statusBySessionKey[targetSession.sessionKey] || 'future';
    const satisfied = status === 'on_time' || status === 'late' || status === 'excused';
    const possible = satisfied || status === 'future';

    results.push({
      position: pos,
      sessionKey: targetSession.sessionKey,
      status: status,
      satisfied: satisfied,
      possible: possible
    });
  });

  const allSatisfied = results.every(item => item.satisfied);
  const allPossible = results.every(item => item.possible);

  return {
    details: results,
    satisfied: allSatisfied,
    possible: allPossible
  };
}

function getGraduationReport(seasonName) {
  try {
    const info = getRequestedSeasonSheetInfo(seasonName);
    const sheet = info.sheet;
    const values = sheet.getDataRange().getValues();
    const memberSchema = resolveMemberSchemaFromHeaders(values[0] || []);

    const variableConfig = getVariableConfig();
    const sessions = collectSessionsFromSheet(sheet, { variableConfig: variableConfig, createMissingMeta: false, memberSchema: memberSchema });
    const now = new Date();

    const requiredPositions = parseRequiredSessionPositions(variableConfig.required_session_positions);
    const lateToAbsenceRatio = Math.max(1, toNumberWithDefault(variableConfig.late_to_absence_ratio, 3));
    const requiredAttendanceCount = Math.max(0, toNumberWithDefault(variableConfig.required_attendance_count, 3));

    let maxAbsenceEquivalent = variableConfig.max_absence_equivalent;
    if (maxAbsenceEquivalent === '' || maxAbsenceEquivalent === null || maxAbsenceEquivalent === undefined) {
      maxAbsenceEquivalent = Math.max(0, sessions.length - requiredAttendanceCount);
    } else {
      maxAbsenceEquivalent = Math.max(0, toNumberWithDefault(maxAbsenceEquivalent, 0));
    }

    const sessionStartCol = Math.max(0, memberSchema.sessionStartColIndex);
    const notes = sheet.getLastRow() >= 2 && sheet.getLastColumn() > sessionStartCol
      ? sheet.getRange(2, sessionStartCol + 1, sheet.getLastRow() - 1, sheet.getLastColumn() - sessionStartCol).getNotes()
      : [];

    const members = [];

    for (let i = 1; i < values.length; i++) {
      const member = readMemberFromRow(values[i], memberSchema);
      if (!member.name || !member.phone) continue;

      let attendedCount = 0;
      let lateCount = 0;
      let absentCount = 0;
      let excusedCount = 0;
      let futureCount = 0;
      let effectivePastCount = 0;

      const details = [];
      const statusMap = {};

      sessions.forEach(session => {
        const cellValue = values[i][session.colIndex];
        const status = getAttendanceDetailType(cellValue, session, now);
        const attendTime = parseAttendanceTime(cellValue);

        const note = notes.length > 0 && notes[i - 1]
          ? String(notes[i - 1][session.colIndex - sessionStartCol] || '').trim()
          : '';

        statusMap[session.sessionKey] = status;

        if (status === 'future') {
          futureCount++;
        } else if (status === 'excused') {
          excusedCount++;
        } else {
          if (status === 'on_time' || status === 'late' || status === 'absent') {
            if (now > session.lateDeadline) {
              effectivePastCount++;
            }
          }

          if (status === 'on_time' || status === 'late') {
            attendedCount++;
          }
          if (status === 'late') {
            lateCount++;
          }
          if (status === 'absent') {
            absentCount++;
          }
        }

        details.push({
          sessionKey: session.sessionKey,
          date: formatDateTimeMinute(session.startTime),
          status: status,
          attendTime: attendTime ? formatDateTime(attendTime) : '',
          note: note,
          isPast: now > session.lateDeadline,
          isRequired: false
        });
      });

      const requiredCheck = evaluateRequiredSessions(requiredPositions, sessions, statusMap);
      requiredCheck.details.forEach(req => {
        const target = details.find(item => item.sessionKey === req.sessionKey);
        if (target) {
          target.isRequired = true;
          target.requiredPosition = req.position;
        }
      });

      const absenceEquivalent = absentCount + Math.floor(lateCount / lateToAbsenceRatio);
      const attendanceRate = effectivePastCount > 0
        ? Math.round((attendedCount / effectivePastCount) * 100)
        : 0;

      const meetsAttendance = attendedCount >= requiredAttendanceCount;
      const attendancePossible = attendedCount + futureCount >= requiredAttendanceCount;
      const meetsAbsence = absenceEquivalent <= maxAbsenceEquivalent;
      const requiredSatisfied = requiredCheck.satisfied;
      const requiredPossible = requiredCheck.possible;

      const isFinal = futureCount === 0;
      const isGraduated = isFinal && requiredSatisfied && meetsAttendance && meetsAbsence;
      const isGraduationPossible = requiredPossible && attendancePossible && meetsAbsence;

      members.push({
        name: member.name,
        grade: member.seasonLabel || formatSeasonLabel(member.season),
        season: member.season,
        seasonLabel: member.seasonLabel || formatSeasonLabel(member.season),
        phone: member.phone,
        email: member.email,
        githubId: member.githubId,
        githubEmail: member.githubEmail,
        notionEmail: member.notionEmail,
        discordId: member.discordId,
        slackEmail: member.slackEmail,
        feeChecked: member.feeChecked,
        completed: member.completed,
        isStaff: member.isStaff,
        attendedCount: attendedCount,
        lateCount: lateCount,
        absentCount: absentCount,
        excusedCount: excusedCount,
        effectivePastCount: effectivePastCount,
        futureCount: futureCount,
        attendanceRate: attendanceRate,
        absenceEquivalent: absenceEquivalent,
        requiredSessionsOk: requiredSatisfied,
        requiredSessionsPossible: requiredPossible,
        meetsAttendanceCount: meetsAttendance,
        meetsAbsenceThreshold: meetsAbsence,
        isGraduated: isGraduated,
        isGraduationPossible: isGraduationPossible,
        details: details
      });
    }

    members.sort((a, b) => {
      if (b.attendanceRate !== a.attendanceRate) {
        return b.attendanceRate - a.attendanceRate;
      }
      if (b.attendedCount !== a.attendedCount) {
        return b.attendedCount - a.attendedCount;
      }
      if (a.absenceEquivalent !== b.absenceEquivalent) {
        return a.absenceEquivalent - b.absenceEquivalent;
      }
      return String(a.name).localeCompare(String(b.name));
    });

    return {
      success: true,
      seasonAlias: info.seasonAlias,
      currentSheet: info.currentSheet,
      generatedAt: new Date().getTime(),
      variables: {
        required_attendance_count: requiredAttendanceCount,
        late_to_absence_ratio: lateToAbsenceRatio,
        max_absence_equivalent: maxAbsenceEquivalent,
        required_session_positions: requiredPositions.join(','),
        official_session_min_recommended: variableConfig.official_session_min_recommended,
        official_session_max_recommended: variableConfig.official_session_max_recommended
      },
      sessions: sessions.map(session => {
        const isRequired = requiredCheckBySession(requiredPositions, sessions, session.sessionKey);
        return {
          sessionKey: session.sessionKey,
          date: formatDateTimeMinute(session.startTime),
          isRequired: isRequired,
          openTime: session.openTime.getTime(),
          onTimeDeadline: session.onTimeDeadline.getTime(),
          lateDeadline: session.lateDeadline.getTime()
        };
      }),
      members: members,
      colorPalette: {
        on_time: ON_TIME_COLOR,
        late: LATE_COLOR,
        absent: ABSENT_COLOR,
        excused: EXCUSED_COLOR
      }
    };
  } catch (error) {
    return {
      success: false,
      message: error.message || '수료 판정 보고서 생성 중 오류가 발생했습니다.'
    };
  }
}

function requiredCheckBySession(requiredPositions, sessions, sessionKey) {
  for (let i = 0; i < requiredPositions.length; i++) {
    const pos = requiredPositions[i];
    if (pos === 'first' && sessions.length > 0 && sessions[0].sessionKey === sessionKey) {
      return true;
    }
    if (pos === 'last' && sessions.length > 0 && sessions[sessions.length - 1].sessionKey === sessionKey) {
      return true;
    }
  }

  return false;
}

function __authorizeExternalRequest() {
  UrlFetchApp.fetch("https://oauth2.googleapis.com/tokeninfo?id_token=dummy", {
    muteHttpExceptions: true
  });
}
