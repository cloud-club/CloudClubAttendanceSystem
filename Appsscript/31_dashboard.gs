function getAttendanceDashboardSummary(params) {
  try {
    const info = getRequestedSeasonSheetInfo(params.season || '');
    const sheet = info.sheet;
    const seasonAlias = info.seasonAlias || toSeasonAlias(sheet.getName());
    const seasonNo = getDashboardSeasonNo(seasonAlias);
    const now = new Date();
    const values = sheet.getDataRange().getValues();
    const memberSchema = resolveMemberSchemaFromHeaders(values[0] || []);
    const sessions = collectSessionsFromSheet(sheet, {
      createMissingMeta: false,
      memberSchema: memberSchema
    }).slice().sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

    const filters = normalizeAttendanceDashboardFilters(params, sessions);
    const disableCache = parseDashboardBooleanParam(params.disableCache);
    const cacheKey = buildAttendanceDashboardCacheKey(seasonAlias, filters);

    if (!disableCache) {
      const cached = readAttendanceDashboardCache(cacheKey);
      if (cached) {
        cached.meta = cached.meta || {};
        cached.meta.fromCache = true;
        return cached;
      }
    }

    const selectedSessions = filterSessionsForDashboard(sessions, filters);
    const selectedSessionSet = {};
    selectedSessions.forEach(session => {
      selectedSessionSet[session.sessionKey] = true;
    });

    const closedSelectedSessions = selectedSessions.filter(session => session.lateDeadline <= now);
    const closedSessionMap = {};
    closedSelectedSessions.forEach(session => {
      closedSessionMap[session.sessionKey] = {
        sessionKey: session.sessionKey,
        date: formatDateTimeMinute(session.startTime),
        dateKey: formatDateKey(session.startTime),
        startTime: session.startTime.getTime(),
        onTime: 0,
        late: 0,
        absent: 0,
        excused: 0,
        attended: 0,
        effective: 0,
        participants: 0
      };
    });

    const sessionStartCol = Math.max(0, memberSchema.sessionStartColIndex);
    const notesMatrix = getDashboardNotesMatrix(sheet, sessionStartCol);

    const memberRows = [];
    let totalMembers = 0;
    let obMembers = 0;
    let ybMembers = 0;
    let unknownMembers = 0;
    let totalAttended = 0;
    let totalLate = 0;
    let totalAbsent = 0;
    let totalEffective = 0;
    let minActualAttendanceMs = null;
    let maxActualAttendanceMs = null;

    for (let i = 1; i < values.length; i++) {
      const member = readMemberFromRow(values[i], memberSchema);
      if (!member.name || !member.phone) continue;

      const cohortTag = resolveDashboardMemberGroup(member.season, seasonNo);
      if (!isDashboardGroupAllowed(filters.group, cohortTag)) continue;

      totalMembers++;
      if (cohortTag === 'OB') obMembers++;
      if (cohortTag === 'YB') ybMembers++;
      if (cohortTag === 'UNKNOWN') unknownMembers++;

      let attendedCount = 0;
      let lateCount = 0;
      let absentCount = 0;
      let excusedCount = 0;
      let effectiveCount = 0;
      let totalAttendOffsetSeconds = 0;
      let validOffsetCount = 0;

      closedSelectedSessions.forEach(session => {
        const cellValue = values[i][session.colIndex];
        const status = getAttendanceDetailType(cellValue, session, now);
        const eventCounter = closedSessionMap[session.sessionKey];
        if (!eventCounter) return;

        if (status === 'excused') {
          excusedCount++;
          eventCounter.excused++;
          eventCounter.participants++;
          return;
        }

        if (status === 'on_time' || status === 'late' || status === 'absent') {
          effectiveCount++;
          eventCounter.effective++;
        }

        if (status === 'on_time' || status === 'late') {
          attendedCount++;
          eventCounter.attended++;
          eventCounter.participants++;

          if (status === 'late') {
            lateCount++;
            eventCounter.late++;
          } else {
            eventCounter.onTime++;
          }

          const attendTime = parseAttendanceTime(cellValue);
          if (!attendTime || isNaN(attendTime.getTime())) return;
          const attendMs = attendTime.getTime();
          if (minActualAttendanceMs === null || attendMs < minActualAttendanceMs) {
            minActualAttendanceMs = attendMs;
          }
          if (maxActualAttendanceMs === null || attendMs > maxActualAttendanceMs) {
            maxActualAttendanceMs = attendMs;
          }

          const diffSec = Math.floor((attendTime - session.startTime) / 1000);
          const minAllowed = Math.floor((session.openTime - session.startTime) / 1000);
          const maxAllowed = Math.floor((session.lateDeadline - session.startTime) / 1000);
          if (diffSec >= minAllowed && diffSec <= maxAllowed) {
            totalAttendOffsetSeconds += diffSec;
            validOffsetCount++;
          }
          return;
        }

        if (status === 'absent') {
          absentCount++;
          eventCounter.absent++;
        }
      });

      totalAttended += attendedCount;
      totalLate += lateCount;
      totalAbsent += absentCount;
      totalEffective += effectiveCount;

      const attendanceRate = effectiveCount > 0 ? Math.round((attendedCount / effectiveCount) * 100) : 0;
      const lateRate = effectiveCount > 0 ? Math.round((lateCount / effectiveCount) * 100) : 0;
      const absenceRate = effectiveCount > 0 ? Math.round((absentCount / effectiveCount) * 100) : 0;
      const avgAttendOffsetSeconds = validOffsetCount > 0 ? Math.round(totalAttendOffsetSeconds / validOffsetCount) : null;
      const avgAttendOffset = avgAttendOffsetSeconds === null ? '미출석' : formatSignedOffset(avgAttendOffsetSeconds);

      memberRows.push({
        memberKey: member.phone,
        name: member.name,
        grade: member.seasonLabel || formatSeasonLabel(member.season),
        season: member.season,
        seasonLabel: member.seasonLabel || formatSeasonLabel(member.season),
        cohortTag: cohortTag,
        attendedCount: attendedCount,
        lateCount: lateCount,
        absentCount: absentCount,
        excusedCount: excusedCount,
        effectiveCount: effectiveCount,
        attendanceRate: attendanceRate,
        lateRate: lateRate,
        absenceRate: absenceRate,
        avgAttendOffsetSeconds: avgAttendOffsetSeconds,
        avgAttendOffset: avgAttendOffset
      });
    }

    const sessionRows = closedSelectedSessions.map(session => {
      const counter = closedSessionMap[session.sessionKey] || {
        onTime: 0,
        late: 0,
        absent: 0,
        excused: 0,
        attended: 0,
        effective: 0,
        participants: 0
      };

      const attendanceRate = counter.effective > 0
        ? Math.round((counter.attended / counter.effective) * 100)
        : 0;
      const lateRate = counter.effective > 0
        ? Math.round((counter.late / counter.effective) * 100)
        : 0;
      const absenceRate = counter.effective > 0
        ? Math.round((counter.absent / counter.effective) * 100)
        : 0;

      return {
        sessionKey: session.sessionKey,
        date: formatDateTimeMinute(session.startTime),
        dateKey: formatDateKey(session.startTime),
        startTime: session.startTime.getTime(),
        attendanceRate: attendanceRate,
        lateRate: lateRate,
        absenceRate: absenceRate,
        onTimeCount: counter.onTime,
        lateCount: counter.late,
        absentCount: counter.absent,
        excusedCount: counter.excused,
        attendedCount: counter.attended,
        effectiveCount: counter.effective,
        participantCount: counter.participants
      };
    });

    const sortedEventRows = sortDashboardEventRows(sessionRows, filters.sortBy);
    const topEventRows = sortedEventRows.slice(0, filters.topN);

    const rankings = memberRows.slice().sort(compareAttendanceRankingRows).map((item, idx) => ({
      rank: idx + 1,
      name: item.name,
      grade: item.seasonLabel || item.grade || '-',
      season: item.season,
      seasonLabel: item.seasonLabel || item.grade || '-',
      attendedCount: item.attendedCount,
      totalSessions: item.effectiveCount,
      attendanceRate: item.attendanceRate,
      avgAttendOffsetSeconds: item.avgAttendOffsetSeconds,
      avgAttendOffset: item.avgAttendOffset,
      avgAttendTimeSeconds: item.avgAttendOffsetSeconds === null ? 999999 : item.avgAttendOffsetSeconds,
      avgAttendTime: item.avgAttendOffset,
      cohortTag: item.cohortTag
    }));

    const memberOptions = memberRows.slice().sort((a, b) => {
      if (b.attendedCount !== a.attendedCount) return b.attendedCount - a.attendedCount;
      if (b.attendanceRate !== a.attendanceRate) return b.attendanceRate - a.attendanceRate;
      return String(a.name || '').localeCompare(String(b.name || ''), 'ko');
    }).map(item => ({
      memberKey: item.memberKey,
      name: item.name,
      seasonLabel: item.seasonLabel || item.grade || '-',
      cohortTag: item.cohortTag,
      attendanceRate: item.attendanceRate,
      attendedCount: item.attendedCount
    }));

    const totalOnTime = sessionRows.reduce((sum, row) => sum + Number(row.onTimeCount || 0), 0);
    const totalLateCount = sessionRows.reduce((sum, row) => sum + Number(row.lateCount || 0), 0);
    const totalAbsentCount = sessionRows.reduce((sum, row) => sum + Number(row.absentCount || 0), 0);
    const totalExcusedCount = sessionRows.reduce((sum, row) => sum + Number(row.excusedCount || 0), 0);
    const selectedSessionDateRange = buildDashboardDateRangeFromSessions(selectedSessions);
    const closedSessionDateRange = buildDashboardDateRangeFromSessions(closedSelectedSessions);

    let defaultDateFrom = '';
    let defaultDateTo = '';
    let defaultDateSource = 'none';
    if (minActualAttendanceMs !== null && maxActualAttendanceMs !== null) {
      defaultDateFrom = formatDateKey(new Date(minActualAttendanceMs));
      defaultDateTo = formatDateKey(new Date(maxActualAttendanceMs));
      defaultDateSource = 'actual_attendance';
    } else if (closedSessionDateRange.fromDate && closedSessionDateRange.toDate) {
      defaultDateFrom = closedSessionDateRange.fromDate;
      defaultDateTo = closedSessionDateRange.toDate;
      defaultDateSource = 'closed_sessions';
    } else if (selectedSessionDateRange.fromDate && selectedSessionDateRange.toDate) {
      defaultDateFrom = selectedSessionDateRange.fromDate;
      defaultDateTo = selectedSessionDateRange.toDate;
      defaultDateSource = 'selected_sessions';
    }

    const payload = {
      success: true,
      seasonAlias: seasonAlias,
      generatedAt: new Date().getTime(),
      filtersEcho: {
        group: filters.group,
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
        sessionKeys: filters.sessionKeys,
        topN: filters.topN,
        sortBy: filters.sortBy,
        chartType: filters.chartType
      },
      kpi: {
        totalMembers: totalMembers,
        obMembers: obMembers,
        ybMembers: ybMembers,
        unknownMembers: unknownMembers,
        averageAttendanceRate: totalEffective > 0 ? Math.round((totalAttended / totalEffective) * 100) : 0,
        averageLateRate: totalEffective > 0 ? Math.round((totalLate / totalEffective) * 100) : 0,
        averageAbsenceRate: totalEffective > 0 ? Math.round((totalAbsent / totalEffective) * 100) : 0
      },
      charts: {
        attendanceRateBySession: sessionRows,
        statusDistributionBySession: sessionRows.map(row => ({
          sessionKey: row.sessionKey,
          date: row.date,
          onTimeCount: row.onTimeCount,
          lateCount: row.lateCount,
          absentCount: row.absentCount,
          excusedCount: row.excusedCount
        })),
        totals: {
          onTimeCount: totalOnTime,
          lateCount: totalLateCount,
          absentCount: totalAbsentCount,
          excusedCount: totalExcusedCount
        },
        donut: {
          statusRatio: {
            onTimeCount: totalOnTime,
            lateCount: totalLateCount,
            absentCount: totalAbsentCount,
            excusedCount: totalExcusedCount,
            totalCount: totalOnTime + totalLateCount + totalAbsentCount + totalExcusedCount
          },
          cohortRatio: {
            obCount: obMembers,
            ybCount: ybMembers,
            unknownCount: unknownMembers,
            totalCount: totalMembers
          }
        }
      },
      ranking: rankings.slice(0, 10),
      table: {
        eventTopRows: topEventRows
      },
      meta: {
        closedSessionCount: closedSelectedSessions.length,
        selectedSessionCount: selectedSessions.length,
        selectedClosedSessionKeys: closedSelectedSessions.map(session => session.sessionKey),
        availableSessions: sessions.map(session => ({
          sessionKey: session.sessionKey,
          date: formatDateTimeMinute(session.startTime),
          dateKey: formatDateKey(session.startTime),
          isClosed: session.lateDeadline <= now,
          isSelected: !!selectedSessionSet[session.sessionKey]
        })),
        memberOptions: memberOptions,
        defaultMemberKeys: memberOptions.slice(0, 3).map(item => item.memberKey),
        notesEnabled: true,
        actualAttendanceRange: {
          minAttendAtMs: minActualAttendanceMs,
          maxAttendAtMs: maxActualAttendanceMs,
          minAttendAt: minActualAttendanceMs === null ? '' : formatDateTimeMinute(new Date(minActualAttendanceMs)),
          maxAttendAt: maxActualAttendanceMs === null ? '' : formatDateTimeMinute(new Date(maxActualAttendanceMs))
        },
        defaultDateRange: {
          fromDate: defaultDateFrom,
          toDate: defaultDateTo,
          source: defaultDateSource
        },
        fromCache: false
      }
    };

    if (!disableCache) {
      writeAttendanceDashboardCache(cacheKey, payload);
    }

    return payload;
  } catch (error) {
    return {
      success: false,
      message: error.message || '출석 대시보드 요약 생성 중 오류가 발생했습니다.'
    };
  }
}

function getAttendanceDashboardDrilldown(params) {
  try {
    const info = getRequestedSeasonSheetInfo(params.season || '');
    const sheet = info.sheet;
    const seasonAlias = info.seasonAlias || toSeasonAlias(sheet.getName());
    const seasonNo = getDashboardSeasonNo(seasonAlias);
    const values = sheet.getDataRange().getValues();
    const memberSchema = resolveMemberSchemaFromHeaders(values[0] || []);
    const sessions = collectSessionsFromSheet(sheet, {
      createMissingMeta: false,
      memberSchema: memberSchema
    }).slice().sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    const now = new Date();

    const filters = normalizeAttendanceDashboardFilters(params, sessions);
    const selectedSessions = filterSessionsForDashboard(sessions, filters);
    const sessionStartCol = Math.max(0, memberSchema.sessionStartColIndex);
    const notesMatrix = getDashboardNotesMatrix(sheet, sessionStartCol);

    const drillType = normalizeDashboardDrillType(params.drillType || params.type);
    const key = String(params.key || '').trim();
    if (!drillType || !key) {
      return { success: false, message: 'drillType(type)과 key 파라미터가 필요합니다.' };
    }

    if (drillType === 'event') {
      const targetSession = selectedSessions.find(session => session.sessionKey === key);
      if (!targetSession) {
        return { success: false, message: '선택된 필터 범위에서 회차를 찾을 수 없습니다.' };
      }

      const rows = [];
      const summary = { onTimeCount: 0, lateCount: 0, absentCount: 0, excusedCount: 0, participants: 0, effectiveCount: 0 };

      for (let i = 1; i < values.length; i++) {
        const member = readMemberFromRow(values[i], memberSchema);
        if (!member.name || !member.phone) continue;

        const cohortTag = resolveDashboardMemberGroup(member.season, seasonNo);
        if (!isDashboardGroupAllowed(filters.group, cohortTag)) continue;

        const cellValue = values[i][targetSession.colIndex];
        const status = getAttendanceDetailType(cellValue, targetSession, now);
        const note = getDashboardNoteValue(notesMatrix, i, targetSession.colIndex, sessionStartCol);
        const attendTime = status === 'on_time' || status === 'late'
          ? getDashboardAttendTimeText(cellValue)
          : '';

        if (status === 'on_time') {
          summary.onTimeCount++;
          summary.participants++;
          summary.effectiveCount++;
        } else if (status === 'late') {
          summary.lateCount++;
          summary.participants++;
          summary.effectiveCount++;
        } else if (status === 'absent') {
          summary.absentCount++;
          summary.effectiveCount++;
        } else if (status === 'excused') {
          summary.excusedCount++;
          summary.participants++;
        }

        rows.push({
          memberKey: member.phone,
          name: member.name,
          seasonLabel: member.seasonLabel || formatSeasonLabel(member.season),
          cohortTag: cohortTag,
          status: status,
          attendTime: attendTime,
          note: note
        });
      }

      rows.sort((a, b) => {
        const statusDiff = getDashboardStatusOrder(a.status) - getDashboardStatusOrder(b.status);
        if (statusDiff !== 0) return statusDiff;
        return String(a.name || '').localeCompare(String(b.name || ''), 'ko');
      });

      return {
        success: true,
        seasonAlias: seasonAlias,
        drillType: 'event',
        key: key,
        session: {
          sessionKey: targetSession.sessionKey,
          date: formatDateTimeMinute(targetSession.startTime)
        },
        rows: rows,
        summary: summary
      };
    }

    if (drillType === 'member') {
      const targetPhone = normalizePhone(key);
      if (!targetPhone) {
        return { success: false, message: 'member drilldown key(전화번호)가 올바르지 않습니다.' };
      }

      let targetRowIndex = -1;
      let targetMember = null;
      for (let i = 1; i < values.length; i++) {
        const member = readMemberFromRow(values[i], memberSchema);
        if (!member.name || !member.phone) continue;
        if (normalizePhone(member.phone) !== targetPhone) continue;
        targetRowIndex = i;
        targetMember = member;
        break;
      }

      if (targetRowIndex < 0 || !targetMember) {
        return { success: false, message: '대상 회원을 찾을 수 없습니다.' };
      }

      const cohortTag = resolveDashboardMemberGroup(targetMember.season, seasonNo);
      if (!isDashboardGroupAllowed(filters.group, cohortTag)) {
        return { success: false, message: '현재 그룹 필터에 포함되지 않는 회원입니다.' };
      }

      const rows = [];
      const summary = {
        onTimeCount: 0,
        lateCount: 0,
        absentCount: 0,
        excusedCount: 0,
        futureCount: 0,
        effectiveCount: 0,
        attendedCount: 0
      };

      selectedSessions.forEach(session => {
        const cellValue = values[targetRowIndex][session.colIndex];
        const status = getAttendanceDetailType(cellValue, session, now);
        const note = getDashboardNoteValue(notesMatrix, targetRowIndex, session.colIndex, sessionStartCol);
        const attendTime = status === 'on_time' || status === 'late'
          ? getDashboardAttendTimeText(cellValue)
          : '';
        const attendDate = parseAttendanceTime(cellValue);

        let offsetSeconds = null;
        if (attendDate && !isNaN(attendDate.getTime()) && (status === 'on_time' || status === 'late')) {
          offsetSeconds = Math.floor((attendDate - session.startTime) / 1000);
        }

        if (status === 'on_time') {
          summary.onTimeCount++;
          summary.attendedCount++;
          summary.effectiveCount++;
        } else if (status === 'late') {
          summary.lateCount++;
          summary.attendedCount++;
          summary.effectiveCount++;
        } else if (status === 'absent') {
          summary.absentCount++;
          summary.effectiveCount++;
        } else if (status === 'excused') {
          summary.excusedCount++;
        } else {
          summary.futureCount++;
        }

        rows.push({
          sessionKey: session.sessionKey,
          date: formatDateTimeMinute(session.startTime),
          status: status,
          attendTime: attendTime,
          note: note,
          offsetSeconds: offsetSeconds,
          offsetLabel: offsetSeconds === null ? '' : formatSignedOffset(offsetSeconds),
          isPast: now > session.lateDeadline
        });
      });

      const attendanceRate = summary.effectiveCount > 0
        ? Math.round((summary.attendedCount / summary.effectiveCount) * 100)
        : 0;
      const lateRate = summary.effectiveCount > 0
        ? Math.round((summary.lateCount / summary.effectiveCount) * 100)
        : 0;
      const absenceRate = summary.effectiveCount > 0
        ? Math.round((summary.absentCount / summary.effectiveCount) * 100)
        : 0;

      return {
        success: true,
        seasonAlias: seasonAlias,
        drillType: 'member',
        key: targetPhone,
        member: {
          memberKey: targetPhone,
          name: targetMember.name,
          seasonLabel: targetMember.seasonLabel || formatSeasonLabel(targetMember.season),
          cohortTag: cohortTag
        },
        rows: rows,
        summary: {
          onTimeCount: summary.onTimeCount,
          lateCount: summary.lateCount,
          absentCount: summary.absentCount,
          excusedCount: summary.excusedCount,
          futureCount: summary.futureCount,
          effectiveCount: summary.effectiveCount,
          attendedCount: summary.attendedCount,
          attendanceRate: attendanceRate,
          lateRate: lateRate,
          absenceRate: absenceRate
        }
      };
    }

    return { success: false, message: '지원하지 않는 drillType입니다. (event/member)' };
  } catch (error) {
    return {
      success: false,
      message: error.message || '출석 대시보드 드릴다운 생성 중 오류가 발생했습니다.'
    };
  }
}

function parseDashboardBooleanParam(value) {
  const raw = String(value || '').trim().toLowerCase();
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'y';
}

function normalizeAttendanceDashboardFilters(params, sessions) {
  const group = normalizeDashboardGroup(params.group || 'all');
  const dateFrom = parseDashboardDateKey(params.dateFrom || '');
  const dateTo = parseDashboardDateKey(params.dateTo || '');
  const topN = parseDashboardTopN(params.topN);
  const sortBy = normalizeDashboardSortBy(params.sortBy || 'attendanceRate');
  const chartType = normalizeDashboardChartType(params.chartType || params.chartTypePref || 'bar');

  let rangeFrom = dateFrom;
  let rangeTo = dateTo;
  if (rangeFrom && rangeTo && rangeFrom > rangeTo) {
    const temp = rangeFrom;
    rangeFrom = rangeTo;
    rangeTo = temp;
  }

  const validSessionMap = {};
  (sessions || []).forEach(session => {
    validSessionMap[session.sessionKey] = true;
  });
  const requestedSessionKeys = parseDashboardCsv(params.sessionKeysCsv || params.sessionKeys || '');
  const sessionKeys = requestedSessionKeys.filter(key => !!validSessionMap[key]);

  return {
    group: group,
    dateFrom: rangeFrom,
    dateTo: rangeTo,
    sessionKeys: sessionKeys,
    topN: topN,
    sortBy: sortBy,
    chartType: chartType
  };
}

function normalizeDashboardGroup(rawGroup) {
  const value = String(rawGroup || '').trim().toLowerCase();
  if (value === 'ob') return 'ob';
  if (value === 'yb') return 'yb';
  return 'all';
}

function normalizeDashboardSortBy(rawSortBy) {
  const value = String(rawSortBy || '').trim();
  if (value === 'absenceRate') return 'absenceRate';
  if (value === 'participants') return 'participants';
  return 'attendanceRate';
}

function normalizeDashboardChartType(rawType) {
  const value = String(rawType || '').trim().toLowerCase();
  return value === 'line' ? 'line' : 'bar';
}

function normalizeDashboardDrillType(rawType) {
  const value = String(rawType || '').trim().toLowerCase();
  if (value === 'event') return 'event';
  if (value === 'member') return 'member';
  return '';
}

function parseDashboardDateKey(rawDate) {
  const text = String(rawDate || '').trim();
  if (!text) return '';
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function parseDashboardTopN(rawTopN) {
  const n = parseInt(String(rawTopN || '10'), 10);
  if (isNaN(n) || n < 1) return 10;
  return Math.min(100, n);
}

function parseDashboardCsv(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return [];

  const unique = {};
  const rows = [];
  text.split(',').forEach(part => {
    const value = String(part || '').trim();
    if (!value || unique[value]) return;
    unique[value] = true;
    rows.push(value);
  });
  return rows;
}

function filterSessionsForDashboard(sessions, filters) {
  const list = Array.isArray(sessions) ? sessions : [];
  const selectedSet = {};
  (filters.sessionKeys || []).forEach(key => {
    selectedSet[key] = true;
  });

  return list.filter(session => {
    if (!session || !session.sessionKey) return false;
    if (filters.sessionKeys.length > 0 && !selectedSet[session.sessionKey]) return false;

    const dateKey = formatDateKey(session.startTime);
    if (filters.dateFrom && dateKey < filters.dateFrom) return false;
    if (filters.dateTo && dateKey > filters.dateTo) return false;
    return true;
  });
}

function buildDashboardDateRangeFromSessions(sessions) {
  const list = Array.isArray(sessions) ? sessions : [];
  if (list.length === 0) {
    return { fromDate: '', toDate: '' };
  }

  let minMs = null;
  let maxMs = null;
  list.forEach(session => {
    if (!session || !session.startTime || isNaN(session.startTime.getTime())) return;
    const startMs = session.startTime.getTime();
    if (minMs === null || startMs < minMs) minMs = startMs;
    if (maxMs === null || startMs > maxMs) maxMs = startMs;
  });

  if (minMs === null || maxMs === null) {
    return { fromDate: '', toDate: '' };
  }

  return {
    fromDate: formatDateKey(new Date(minMs)),
    toDate: formatDateKey(new Date(maxMs))
  };
}

function getDashboardSeasonNo(seasonAlias) {
  const alias = String(seasonAlias || '').trim();
  const match = alias.match(/^season_(\d{2})$/);
  if (!match) return NaN;
  return parseInt(match[1], 10);
}

function resolveDashboardMemberGroup(memberSeason, targetSeasonNo) {
  // TODO(member_role): member_role(현직자/학생) 컬럼 도입 시 cohort 축과 독립된 추가 분류를 병행합니다.
  const seasonNo = Number(memberSeason);
  if (isNaN(targetSeasonNo) || isNaN(seasonNo)) return 'UNKNOWN';
  if (seasonNo === targetSeasonNo) return 'YB';
  if (seasonNo < targetSeasonNo) return 'OB';
  return 'FUTURE';
}

function isDashboardGroupAllowed(groupFilter, cohortTag) {
  if (cohortTag === 'FUTURE') return false;
  if (groupFilter === 'ob') return cohortTag === 'OB';
  if (groupFilter === 'yb') return cohortTag === 'YB';
  return true;
}

function getDashboardStatusOrder(status) {
  switch (status) {
    case 'on_time': return 0;
    case 'late': return 1;
    case 'excused': return 2;
    case 'absent': return 3;
    default: return 4;
  }
}

function compareAttendanceRankingRows(a, b) {
  const aAttended = Number(a && a.attendedCount || 0);
  const bAttended = Number(b && b.attendedCount || 0);
  if (bAttended !== aAttended) {
    return bAttended - aAttended;
  }

  const aOffsetRaw = a ? a.avgAttendOffsetSeconds : null;
  const bOffsetRaw = b ? b.avgAttendOffsetSeconds : null;
  const aOffset = aOffsetRaw === null || aOffsetRaw === undefined
    ? Number.POSITIVE_INFINITY
    : Number(aOffsetRaw);
  const bOffset = bOffsetRaw === null || bOffsetRaw === undefined
    ? Number.POSITIVE_INFINITY
    : Number(bOffsetRaw);
  if (aOffset !== bOffset) {
    return aOffset - bOffset;
  }

  return String(a && a.name || '').localeCompare(String(b && b.name || ''), 'ko');
}

function sortDashboardEventRows(rows, sortBy) {
  const list = Array.isArray(rows) ? rows.slice() : [];
  list.sort((a, b) => {
    if (sortBy === 'absenceRate') {
      if (b.absenceRate !== a.absenceRate) return b.absenceRate - a.absenceRate;
      if (b.absentCount !== a.absentCount) return b.absentCount - a.absentCount;
    } else if (sortBy === 'participants') {
      if (b.participantCount !== a.participantCount) return b.participantCount - a.participantCount;
      if (b.attendedCount !== a.attendedCount) return b.attendedCount - a.attendedCount;
    } else {
      if (b.attendanceRate !== a.attendanceRate) return b.attendanceRate - a.attendanceRate;
      if (b.attendedCount !== a.attendedCount) return b.attendedCount - a.attendedCount;
    }

    return Number(a.startTime || 0) - Number(b.startTime || 0);
  });
  return list;
}

function getDashboardNotesMatrix(sheet, sessionStartCol) {
  const startCol = Math.max(0, Number(sessionStartCol || 0));
  if (sheet.getLastRow() < 2 || sheet.getLastColumn() <= startCol) {
    return [];
  }

  return sheet.getRange(2, startCol + 1, sheet.getLastRow() - 1, sheet.getLastColumn() - startCol).getNotes();
}

function getDashboardNoteValue(notesMatrix, rowIndex, colIndex, sessionStartCol) {
  if (!notesMatrix || notesMatrix.length === 0) return '';
  const row = notesMatrix[rowIndex - 1];
  if (!row) return '';
  const relative = colIndex - sessionStartCol;
  if (relative < 0 || relative >= row.length) return '';
  return String(row[relative] || '').trim();
}

function getDashboardAttendTimeText(cellValue) {
  const parsed = parseAttendanceTime(cellValue);
  if (parsed && !isNaN(parsed.getTime())) {
    return formatDateTime(parsed);
  }
  return String(cellValue || '').trim();
}

function buildAttendanceDashboardCacheKey(seasonAlias, filters) {
  const filterSessions = (filters.sessionKeys || []).slice().sort().join('|');
  return [
    'attdash',
    seasonAlias || '',
    filters.group || 'all',
    filters.dateFrom || '-',
    filters.dateTo || '-',
    filterSessions || '-',
    String(filters.topN || 10),
    filters.sortBy || 'attendanceRate',
    filters.chartType || 'bar'
  ].join(':');
}

function readAttendanceDashboardCache(key) {
  const cache = CacheService.getScriptCache();
  const raw = cache.get(key);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch (error) {
    return null;
  }
}

function writeAttendanceDashboardCache(key, payload) {
  if (!key || !payload || typeof payload !== 'object') return;

  try {
    const raw = JSON.stringify(payload);
    if (!raw || raw.length > ATTENDANCE_DASHBOARD_CACHE_MAX_BYTES) return;
    CacheService.getScriptCache().put(key, raw, ATTENDANCE_DASHBOARD_CACHE_TTL_SECONDS);
  } catch (error) {
    // no-op
  }
}

