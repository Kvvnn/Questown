import { getDaysInMonth, isMonthKey } from "../domain/date";
import { getPreferredTownDate } from "../domain/town-navigation";
import { DailyRecord } from "../domain/types";

export const getMonthKeyFromDateKey = (dateKey: string) => dateKey.slice(0, 7);

export const resolveTownMonth = (selectedMonth: string | undefined, fallbackDateKey: string) => {
  const fallbackMonth = getMonthKeyFromDateKey(fallbackDateKey);
  if (!isMonthKey(selectedMonth)) return fallbackMonth;
  return selectedMonth > fallbackMonth ? fallbackMonth : selectedMonth;
};

export const resolveSelectedTownDate = (
  selectedMonth: string,
  currentDateKey: string,
  selectedDateInTown: string | undefined,
  recordsByDate: Record<string, DailyRecord>
) =>
  getPreferredTownDate({
    monthKey: selectedMonth,
    dayCount: getDaysInMonth(selectedMonth),
    currentDate: currentDateKey,
    selectedDate: selectedDateInTown,
    availableDates: Object.keys(recordsByDate)
  });
