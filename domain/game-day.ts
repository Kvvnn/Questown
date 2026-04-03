import { addLocalDays, dateKeyMinuteOfDayToDate, getDefaultLocalTimeContext, getLocalDateKey, getLocalMinuteOfDay, getWeekdayForDateKey, LocalTimeContext } from "./local-time";
export const GAME_DAY_START_HOUR = 5;
const GAME_DAY_START_MINUTE = GAME_DAY_START_HOUR * 60;

export const toGameDateKey = (date = new Date(), timeContext: LocalTimeContext = getDefaultLocalTimeContext()) => {
  const localDateKey = getLocalDateKey(date, timeContext);
  return getLocalMinuteOfDay(date, timeContext) < GAME_DAY_START_MINUTE ? addLocalDays(localDateKey, -1) : localDateKey;
};

export const toGameMonthKey = (date = new Date(), timeContext: LocalTimeContext = getDefaultLocalTimeContext()) =>
  toGameDateKey(date, timeContext).slice(0, 7);

export const gameDateKeyToStartDate = (dateKey: string, timeContext: LocalTimeContext = getDefaultLocalTimeContext()) =>
  dateKeyMinuteOfDayToDate(dateKey, GAME_DAY_START_MINUTE, timeContext);

export const getGameDayWindow = (date = new Date(), timeContext: LocalTimeContext = getDefaultLocalTimeContext()) => {
  const dateKey = toGameDateKey(date, timeContext);
  const startAt = gameDateKeyToStartDate(dateKey, timeContext);
  const endAt = new Date(startAt.getTime() + 24 * 60 * 60 * 1000);

  return {
    dateKey,
    monthKey: toGameMonthKey(date, timeContext),
    startAt,
    endAt,
    nextDateKey: addLocalDays(dateKey, 1)
  };
};

export const getWeekdayForDateKeyInLocalTime = (dateKey: string, timeContext: LocalTimeContext = getDefaultLocalTimeContext()) =>
  getWeekdayForDateKey(dateKey, timeContext);

export const dateKeyMinuteOfDayToDateInLocalTime = (
  dateKey: string,
  minuteOfDay: number,
  timeContext: LocalTimeContext = getDefaultLocalTimeContext()
) => dateKeyMinuteOfDayToDate(dateKey, minuteOfDay, timeContext);
