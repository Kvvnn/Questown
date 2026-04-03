import { getDefaultLocalTimeContext, getWeekdayForDateKey, LocalTimeContext } from "./local-time";
import { TownMonth } from "./game-types";

export interface DistrictZone {
  name: string;
  rowStart: number;
  rowEnd: number;
  tintClass: string;
  isCore: boolean;
  rewardLabel: string;
}

export interface TownPlot {
  day: number;
  date: string;
  col: number;
  row: number;
  district: string;
}

export interface TownRoad {
  key: string;
  orientation: "horizontal" | "vertical";
  row?: number;
  col?: number;
}

export interface TownSceneryTile {
  key: string;
  col: number;
  row: number;
  kind: "district_gate" | "district_landmark" | "monthly_monument" | "season_banner";
  district?: string;
}

export interface DistrictProgress {
  district: string;
  activePlotCount: number;
  completedMain: number;
  totalMain: number;
  targetMain: number;
  unlocked: boolean;
  remainingMain: number;
  isCore: boolean;
}

export interface TownMonthProgress {
  districtProgressByName: Record<string, DistrictProgress>;
  monthlyMainCompleted: number;
  monthlyMainTotal: number;
  coreUnlockedCount: number;
  monumentTier: number;
}

export interface TownLayout {
  plots: TownPlot[];
  scenery: TownSceneryTile[];
  districts: DistrictZone[];
  roads: TownRoad[];
  cols: number;
  rows: number;
  tile: number;
  gap: number;
  padding: number;
  slot: number;
  mapWidth: number;
  mapHeight: number;
  roadCols: number[];
  roadRows: number[];
}

const GRID_COLS = 7;
const GRID_ROWS = 6;
const TILE = 58;
const GAP = 18;
const PADDING = 28;
const SLOT = TILE + GAP;

const DISTRICTS: DistrictZone[] = [
  { name: "주거지", rowStart: 0, rowEnd: 0, tintClass: "from-cyan-200/45 to-blue-200/20", isCore: true, rewardLabel: "현관 게이트" },
  { name: "상점가", rowStart: 1, rowEnd: 1, tintClass: "from-violet-200/45 to-indigo-200/20", isCore: true, rewardLabel: "마켓 랜드마크" },
  { name: "문화지구", rowStart: 2, rowEnd: 2, tintClass: "from-emerald-200/45 to-lime-200/20", isCore: true, rewardLabel: "문화 랜드마크" },
  { name: "랜드마크 지구", rowStart: 3, rowEnd: 3, tintClass: "from-amber-200/45 to-orange-200/20", isCore: true, rewardLabel: "메인 타워" },
  { name: "축제 확장지", rowStart: 4, rowEnd: 4, tintClass: "from-pink-200/45 to-fuchsia-200/20", isCore: false, rewardLabel: "축제 장식" },
  { name: "아카이브/오버플로우", rowStart: 5, rowEnd: 5, tintClass: "from-slate-200/45 to-slate-100/20", isCore: false, rewardLabel: "기록 보관소" }
];

const weekdayMap: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
};

const getFirstWeekday = (monthKey: string, timeContext: LocalTimeContext) => getWeekdayForDateKey(`${monthKey}-01`, timeContext) ?? weekdayMap.Sun;

const districtForRow = (row: number) => DISTRICTS.find((zone) => row >= zone.rowStart && row <= zone.rowEnd)?.name ?? DISTRICTS[0].name;
const getDistrictByName = (districtName: string) => DISTRICTS.find((zone) => zone.name === districtName);
const toDate = (monthKey: string, day: number) => `${monthKey}-${String(day).padStart(2, "0")}`;
const roadColumns = () => Array.from({ length: GRID_COLS - 1 }, (_, idx) => idx);
const roadRows = () => Array.from({ length: GRID_ROWS - 1 }, (_, idx) => idx);

const getRowCenter = (zone: DistrictZone) => (zone.rowStart + zone.rowEnd) / 2;

const sortSlotsByScore = <T extends { col: number; row: number }>(slots: T[], score: (slot: T) => number) =>
  [...slots].sort((a, b) => {
    const scoreDiff = score(a) - score(b);
    if (scoreDiff !== 0) return scoreDiff;
    if (a.row !== b.row) return a.row - b.row;
    return a.col - b.col;
  });

const takeBestSlot = (
  slots: Array<{ col: number; row: number }>,
  score: (slot: { col: number; row: number }) => number
) => {
  const [best] = sortSlotsByScore(slots, score);
  return best;
};

const removeSlot = (slots: Array<{ col: number; row: number }>, slot: { col: number; row: number }) => {
  const index = slots.findIndex((candidate) => candidate.col === slot.col && candidate.row === slot.row);
  if (index >= 0) {
    slots.splice(index, 1);
  }
};

const scoreDistrictLandmarkSlot = (slot: { col: number; row: number }, district: DistrictZone) =>
  Math.abs(slot.row - getRowCenter(district)) * 100 + Math.abs(slot.col - 3) * 10 + slot.col;

const scoreDistrictGateSlot = (slot: { col: number; row: number }, district: DistrictZone) =>
  Math.abs(slot.row - getRowCenter(district)) * 100 + slot.col * 14 + Math.abs(slot.col - 1) * 4;

const scoreMonthlyMonumentSlot = (slot: { col: number; row: number }) =>
  Math.abs(slot.col - 3) * 10 + Math.abs(slot.row - 2.5) * 8 + slot.row;

const scoreSeasonBannerSlot = (slot: { col: number; row: number }) =>
  Math.abs(slot.row - 2.5) * 10 + Math.abs(slot.col - 3) * 6 + slot.col;

const createRewardSlots = (monthKey: string, empties: Array<{ col: number; row: number }>) => {
  const remaining = [...empties];
  const scenery: TownSceneryTile[] = [];

  DISTRICTS.forEach((district) => {
    const slot = takeBestSlot(remaining, (candidate) => scoreDistrictLandmarkSlot(candidate, district));
    if (!slot) return;

    scenery.push({
      key: `${monthKey}-${district.name}-landmark`,
      col: slot.col,
      row: slot.row,
      kind: "district_landmark",
      district: district.name
    });
    removeSlot(remaining, slot);
  });

  const monumentSlot = takeBestSlot(remaining, scoreMonthlyMonumentSlot);
  if (monumentSlot) {
    scenery.push({
      key: `${monthKey}-monthly-monument`,
      col: monumentSlot.col,
      row: monumentSlot.row,
      kind: "monthly_monument"
    });
    removeSlot(remaining, monumentSlot);
  }

  DISTRICTS.filter((district) => district.isCore).forEach((district) => {
    const slot = takeBestSlot(remaining, (candidate) => scoreDistrictGateSlot(candidate, district));
    if (!slot) return;

    scenery.push({
      key: `${monthKey}-${district.name}-gate`,
      col: slot.col,
      row: slot.row,
      kind: "district_gate",
      district: district.name
    });
    removeSlot(remaining, slot);
  });

  sortSlotsByScore(remaining, scoreSeasonBannerSlot)
    .slice(0, Math.min(2, remaining.length))
    .forEach((slot, index) => {
      scenery.push({
        key: `${monthKey}-season-banner-${index}`,
        col: slot.col,
        row: slot.row,
        kind: "season_banner"
      });
      removeSlot(remaining, slot);
    });

  return scenery;
};

export const getMonthlyMonumentTier = (monthProgress: Pick<TownMonthProgress, "coreUnlockedCount"> | number) => {
  const unlockedCount = typeof monthProgress === "number" ? monthProgress : monthProgress.coreUnlockedCount;
  if (unlockedCount <= 0) return 0;
  if (unlockedCount >= 4) return 4;
  return unlockedCount;
};

export const getDistrictProgress = (
  layout: TownLayout,
  districtName: string,
  townMonth: TownMonth
): DistrictProgress => {
  const district = layout.districts.find((zone) => zone.name === districtName) ?? getDistrictByName(districtName);
  const plots = layout.plots.filter((plot) => plot.district === districtName);
  const plotSnapshotsByDate = Object.fromEntries(townMonth.plotSnapshots.map((snapshot) => [snapshot.dateKey, snapshot]));
  const activePlotCount = plots.length;
  const completedMain = plots.reduce((sum, plot) => sum + (plotSnapshotsByDate[plot.date]?.floorCount ?? 0), 0);
  const totalMain = completedMain;
  const targetMain = activePlotCount * (district?.isCore ? 2 : 1);
  const unlocked = activePlotCount > 0 && completedMain >= targetMain;

  return {
    district: districtName,
    activePlotCount,
    completedMain,
    totalMain,
    targetMain,
    unlocked,
    remainingMain: Math.max(0, targetMain - completedMain),
    isCore: district?.isCore ?? false
  };
};

export const getTownMonthProgress = (
  layout: TownLayout,
  townMonth: TownMonth
): TownMonthProgress => {
  const districtProgressByName = Object.fromEntries(
    layout.districts.map((district) => [
      district.name,
      getDistrictProgress(layout, district.name, townMonth)
    ])
  ) as Record<string, DistrictProgress>;

  const monthlyMainCompleted = townMonth.totalFloorCount;
  const monthlyMainTotal = townMonth.totalFloorCount;
  const coreUnlockedCount = layout.districts.filter((district) => district.isCore && districtProgressByName[district.name]?.unlocked).length;

  return {
    districtProgressByName,
    monthlyMainCompleted,
    monthlyMainTotal,
    coreUnlockedCount,
    monumentTier: getMonthlyMonumentTier(coreUnlockedCount)
  };
};

export const createTownLayout = (
  monthKey: string,
  dayCount: number,
  timeContext: LocalTimeContext = getDefaultLocalTimeContext()
): TownLayout => {
  const firstWeekday = getFirstWeekday(monthKey, timeContext);

  const plots: TownPlot[] = Array.from({ length: dayCount }, (_, index) => {
    const day = index + 1;
    const slotIndex = firstWeekday + index;
    const row = Math.floor(slotIndex / GRID_COLS);
    const col = slotIndex % GRID_COLS;

    return {
      day,
      date: toDate(monthKey, day),
      col,
      row,
      district: districtForRow(row)
    };
  });

  const used = new Set(plots.map((plot) => `${plot.col}-${plot.row}`));
  const empties: Array<{ col: number; row: number }> = [];

  for (let row = 0; row < GRID_ROWS; row += 1) {
    for (let col = 0; col < GRID_COLS; col += 1) {
      const key = `${col}-${row}`;
      if (!used.has(key)) empties.push({ col, row });
    }
  }

  const scenery = createRewardSlots(monthKey, empties);
  const roads: TownRoad[] = [
    { key: `${monthKey}-avenue-main`, orientation: "vertical", col: 3 },
    ...Array.from({ length: GRID_ROWS - 1 }, (_, row) => ({
      key: `${monthKey}-road-row-${row}`,
      orientation: "horizontal" as const,
      row
    }))
  ];

  return {
    plots,
    scenery,
    districts: DISTRICTS,
    roads,
    cols: GRID_COLS,
    rows: GRID_ROWS,
    tile: TILE,
    gap: GAP,
    padding: PADDING,
    slot: SLOT,
    mapWidth: GRID_COLS * SLOT + PADDING * 2,
    mapHeight: GRID_ROWS * SLOT + PADDING * 2,
    roadCols: roadColumns(),
    roadRows: roadRows()
  };
};
