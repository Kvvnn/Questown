import { getDaysInMonth, isMonthKey } from "../domain/date";
import { DailyBuilding } from "../domain/game-types";
import { getPreferredTownDate } from "../domain/town-navigation";

export const getMonthKeyFromDateKey = (dateKey: string) => dateKey.slice(0, 7);

export const resolveTownMonth = (selectedMonth: string | undefined, currentDateKey: string) => {
  const fallbackMonth = getMonthKeyFromDateKey(currentDateKey);
  if (!isMonthKey(selectedMonth)) return fallbackMonth;
  return selectedMonth > fallbackMonth ? fallbackMonth : selectedMonth;
};

export const resolveSelectedTownDate = (
  selectedMonth: string,
  currentDateKey: string,
  selectedDateInTown: string | undefined,
  dailyBuildingsByDate: Record<string, DailyBuilding>
) =>
  getPreferredTownDate({
    monthKey: selectedMonth,
    dayCount: getDaysInMonth(selectedMonth),
    currentDate: getMonthKeyFromDateKey(currentDateKey) === selectedMonth ? currentDateKey : undefined,
    selectedDate: selectedDateInTown,
    availableDates: Object.keys(dailyBuildingsByDate)
  });
