export type TownDirection = "left" | "right" | "up" | "down" | "home" | "end";

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const getDayFromDate = (date: string | undefined, monthKey: string): number | null => {
  if (!date || !date.startsWith(monthKey)) return null;
  const day = Number(date.slice(8, 10));
  return Number.isFinite(day) && day > 0 ? day : null;
};

export const toDateFromDay = (monthKey: string, day: number) => `${monthKey}-${String(day).padStart(2, "0")}`;

export const getPreferredTownDate = ({
  monthKey,
  dayCount,
  currentDate,
  selectedDate,
  availableDates = []
}: {
  monthKey: string;
  dayCount: number;
  currentDate?: string;
  selectedDate?: string;
  availableDates?: string[];
}) => {
  const selectedDay = getDayFromDate(selectedDate, monthKey);
  if (selectedDay) return toDateFromDay(monthKey, clamp(selectedDay, 1, dayCount));

  const currentDay = getDayFromDate(currentDate, monthKey);
  if (currentDay) return toDateFromDay(monthKey, clamp(currentDay, 1, dayCount));

  const recordedDates = availableDates
    .filter((date) => {
      const day = getDayFromDate(date, monthKey);
      return day !== null && day <= dayCount;
    })
    .sort();

  const recordedDate = recordedDates[recordedDates.length - 1];

  return recordedDate ?? toDateFromDay(monthKey, 1);
};

const deltaByDirection: Record<Exclude<TownDirection, "home" | "end">, number> = {
  left: -1,
  right: 1,
  up: -7,
  down: 7
};

export const moveDateInMonth = (
  currentDate: string | undefined,
  monthKey: string,
  dayCount: number,
  direction: TownDirection
) => {
  const currentDay = getDayFromDate(currentDate, monthKey) ?? 1;

  if (direction === "home") return toDateFromDay(monthKey, 1);
  if (direction === "end") return toDateFromDay(monthKey, dayCount);

  const nextDay = clamp(currentDay + deltaByDirection[direction], 1, dayCount);
  return toDateFromDay(monthKey, nextDay);
};
