import { DailyRecord } from "../domain/types";
import { getMonthKeyFromDateKey, getPreferredTownSelection, resolveTownMonth } from "../domain/selectors";

export { getMonthKeyFromDateKey, resolveTownMonth };

export const resolveSelectedTownDate = (
  selectedMonth: string,
  currentDateKey: string,
  selectedDateInTown: string | undefined,
  recordsByDate: Record<string, DailyRecord>
) => getPreferredTownSelection(selectedMonth, currentDateKey, selectedDateInTown, recordsByDate).dateKey;
