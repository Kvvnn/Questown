import { getDaysInMonth } from "./date";
import { DailyBuilding, Floor, SurpriseQuest, TownMonth } from "./game-types";
import { createTownLayout, getTownMonthProgress } from "./town-map";

const uniqueStrings = (values: string[]) => Array.from(new Set(values.filter((value) => value.trim().length > 0)));

export const getTownSeasonTheme = (monthKey: string): TownMonth["seasonTheme"] => {
  const month = Number(monthKey.slice(5, 7));
  if (month >= 3 && month <= 5) return "spring";
  if (month >= 6 && month <= 8) return "summer";
  if (month >= 9 && month <= 11) return "autumn";
  return "winter";
};

export const getCompletedOrnamentQuestIdsForDate = (
  dateKey: string,
  surpriseQuestsById: Record<string, SurpriseQuest>
) =>
  uniqueStrings(
    Object.values(surpriseQuestsById)
      .filter((quest) => quest.dateKey === dateKey && quest.rewardType === "ornament" && quest.status === "completed")
      .sort((left, right) => (left.completedAt ?? left.id).localeCompare(right.completedAt ?? right.id, "en"))
      .map((quest) => quest.id)
  );

export const buildBuildingOrnamentIds = ({
  dateKey,
  surpriseQuestsById,
  existingOrnamentIds = []
}: {
  dateKey: string;
  surpriseQuestsById: Record<string, SurpriseQuest>;
  existingOrnamentIds?: string[];
}) => uniqueStrings([...existingOrnamentIds, ...getCompletedOrnamentQuestIdsForDate(dateKey, surpriseQuestsById)]);

export const buildTownMonthSnapshot = ({
  monthKey,
  dailyBuildingsByDate,
  floorsById,
  surpriseQuestsById,
  currentGameDateKey,
  generatedAt = new Date().toISOString()
}: {
  monthKey: string;
  dailyBuildingsByDate: Record<string, DailyBuilding>;
  floorsById: Record<string, Floor>;
  surpriseQuestsById: Record<string, SurpriseQuest>;
  currentGameDateKey: string;
  generatedAt?: string;
}): TownMonth => {
  const seasonTheme = getTownSeasonTheme(monthKey);
  const plotSnapshots = Object.entries(dailyBuildingsByDate)
    .filter(([dateKey, building]) => dateKey.startsWith(`${monthKey}-`) && dateKey <= currentGameDateKey && building.floorIds.length > 0)
    .sort(([left], [right]) => left.localeCompare(right, "en"))
    .map(([dateKey, building]) => {
      const resolvedFloorCount = building.floorIds.filter((floorId) => !!floorsById[floorId]).length;
      const floorCount = resolvedFloorCount > 0 ? resolvedFloorCount : building.floorIds.length;

      return {
        dateKey,
        floorCount,
        roofType: building.finalizedAt ? building.roofType : ("none" as const),
        ornamentIds: buildBuildingOrnamentIds({
          dateKey,
          surpriseQuestsById,
          existingOrnamentIds: building.ornamentIds
        })
      };
    });
  const totalFloorCount = plotSnapshots.reduce((sum, snapshot) => sum + snapshot.floorCount, 0);
  const draftMonth: TownMonth = {
    monthKey,
    seasonTheme,
    plotSnapshots,
    landmarkIds: [],
    totalFloorCount,
    generatedAt
  };
  const layout = createTownLayout(monthKey, getDaysInMonth(monthKey));
  const monthProgress = getTownMonthProgress(layout, draftMonth);
  const landmarkIds = uniqueStrings([
    ...layout.districts
      .filter((district) => monthProgress.districtProgressByName[district.name]?.unlocked)
      .map((district) => `district:${district.name}`),
    monthProgress.monumentTier > 0 ? `monument:${monthKey}:tier-${monthProgress.monumentTier}` : ""
  ]);

  return {
    ...draftMonth,
    landmarkIds
  };
};

export const buildTownMonthCache = ({
  monthKeys,
  dailyBuildingsByDate,
  floorsById,
  surpriseQuestsById,
  currentGameDateKey,
  generatedAt = new Date().toISOString()
}: {
  monthKeys: string[];
  dailyBuildingsByDate: Record<string, DailyBuilding>;
  floorsById: Record<string, Floor>;
  surpriseQuestsById: Record<string, SurpriseQuest>;
  currentGameDateKey: string;
  generatedAt?: string;
}) =>
  Object.fromEntries(
    uniqueStrings(monthKeys)
      .sort((left, right) => left.localeCompare(right, "en"))
      .map((monthKey) => [
        monthKey,
        buildTownMonthSnapshot({
          monthKey,
          dailyBuildingsByDate,
          floorsById,
          surpriseQuestsById,
          currentGameDateKey,
          generatedAt
        })
      ])
  );
