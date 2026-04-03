import { addDays } from "./date";

const DATE_KEY_PARTS = /^(\d{4})-(\d{2})-(\d{2})$/;

const pad = (value: number) => String(value).padStart(2, "0");

export interface LocalTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
  weekday: number;
}

export interface LocalTimeContext {
  getParts: (date: Date) => LocalTimeParts;
  createDate: (parts: {
    year: number;
    month: number;
    day: number;
    hour?: number;
    minute?: number;
    second?: number;
    millisecond?: number;
  }) => Date;
}

const parseDateKey = (dateKey: string) => {
  const match = DATE_KEY_PARTS.exec(dateKey);
  if (!match) {
    throw new Error(`Invalid date key: ${dateKey}`);
  }

  return {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  };
};

export const systemLocalTimeContext: LocalTimeContext = {
  getParts: (date) => ({
    year: date.getFullYear(),
    month: date.getMonth() + 1,
    day: date.getDate(),
    hour: date.getHours(),
    minute: date.getMinutes(),
    second: date.getSeconds(),
    millisecond: date.getMilliseconds(),
    weekday: date.getDay()
  }),
  createDate: ({ year, month, day, hour = 0, minute = 0, second = 0, millisecond = 0 }) =>
    new Date(year, month - 1, day, hour, minute, second, millisecond)
};

export const createFixedOffsetTimeContext = (offsetMinutes: number): LocalTimeContext => ({
  getParts: (date) => {
    const shifted = new Date(date.getTime() + offsetMinutes * 60_000);
    return {
      year: shifted.getUTCFullYear(),
      month: shifted.getUTCMonth() + 1,
      day: shifted.getUTCDate(),
      hour: shifted.getUTCHours(),
      minute: shifted.getUTCMinutes(),
      second: shifted.getUTCSeconds(),
      millisecond: shifted.getUTCMilliseconds(),
      weekday: shifted.getUTCDay()
    };
  },
  createDate: ({ year, month, day, hour = 0, minute = 0, second = 0, millisecond = 0 }) =>
    new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond) - offsetMinutes * 60_000)
});

export const getDefaultLocalTimeContext = () =>
  typeof window === "undefined" ? createFixedOffsetTimeContext(9 * 60) : systemLocalTimeContext;

export const getLocalTimeOffsetMinutes = (date = new Date()) => -date.getTimezoneOffset();

export const formatLocalDateKey = ({ year, month, day }: Pick<LocalTimeParts, "year" | "month" | "day">) =>
  `${year}-${pad(month)}-${pad(day)}`;

export const getLocalDateKey = (date = new Date(), timeContext: LocalTimeContext = getDefaultLocalTimeContext()) =>
  formatLocalDateKey(timeContext.getParts(date));

export const getLocalMinuteOfDay = (date = new Date(), timeContext: LocalTimeContext = getDefaultLocalTimeContext()) => {
  const parts = timeContext.getParts(date);
  return parts.hour * 60 + parts.minute;
};

export const dateKeyMinuteOfDayToDate = (
  dateKey: string,
  minuteOfDay: number,
  timeContext: LocalTimeContext = getDefaultLocalTimeContext()
) => {
  const { year, month, day } = parseDateKey(dateKey);
  return timeContext.createDate({
    year,
    month,
    day,
    hour: Math.floor(minuteOfDay / 60),
    minute: minuteOfDay % 60
  });
};

export const getWeekdayForDateKey = (dateKey: string, timeContext: LocalTimeContext = getDefaultLocalTimeContext()) =>
  timeContext.getParts(dateKeyMinuteOfDayToDate(dateKey, 12 * 60, timeContext)).weekday;

export const addLocalDays = (dateKey: string, delta: number) => addDays(dateKey, delta);
