import { addDays, ensureDailyRecord, toDateKey } from "./date";
import { createNextDayQuestCopies, mergeGeneratedQuests } from "./recurrence";
import { finalizeRecord, recalcRecord } from "./record-ops";
import { getRecordForDate } from "./selectors";
import { DailyRecord } from "./types";

export const prepareNextDayRecord = (fromRecord: DailyRecord, targetRecord: DailyRecord, targetDateKey: string) => {
  const generated = fromRecord.quests.flatMap((quest) => createNextDayQuestCopies(quest, targetDateKey));
  const mergedQuests = mergeGeneratedQuests(targetRecord.quests, generated);

  return recalcRecord(
    {
      ...targetRecord,
      date: targetDateKey,
      quests: mergedQuests,
      isFinalized: false,
      roofType: "none"
    },
    false
  );
};

export const rollForwardRecords = (
  recordsByDate: Record<string, DailyRecord>,
  fromDateKey: string,
  toDateKeyValue: string
): Record<string, DailyRecord> => {
  const records = { ...recordsByDate };

  if (fromDateKey >= toDateKeyValue) {
    if (!records[toDateKeyValue]) records[toDateKeyValue] = ensureDailyRecord(toDateKeyValue);
    return records;
  }

  let cursorKey = fromDateKey;
  let cursorRecord = finalizeRecord(getRecordForDate(records, cursorKey));
  records[cursorKey] = cursorRecord;

  while (cursorKey < toDateKeyValue) {
    const nextKey = addDays(cursorKey, 1);
    const nextBase = getRecordForDate(records, nextKey);
    const nextPrepared = prepareNextDayRecord(cursorRecord, nextBase, nextKey);
    const shouldFinalize = nextKey !== toDateKeyValue;
    const nextRecord = shouldFinalize ? finalizeRecord(nextPrepared) : nextPrepared;

    records[nextKey] = nextRecord;
    cursorKey = nextKey;
    cursorRecord = nextRecord;
  }

  return records;
};

export const syncStateToToday = (recordsByDate: Record<string, DailyRecord>, candidateDateKey: string) => {
  const todayKey = toDateKey();

  if (candidateDateKey < todayKey) {
    return {
      currentDateKey: todayKey,
      recordsByDate: rollForwardRecords(recordsByDate, candidateDateKey, todayKey)
    };
  }

  const todayRecord = getRecordForDate(recordsByDate, todayKey);

  return {
    currentDateKey: todayKey,
    recordsByDate: {
      ...recordsByDate,
      [todayKey]: recalcRecord(todayRecord, false)
    }
  };
};
