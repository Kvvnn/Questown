export interface DistrictZone {
  name: string;
  rowStart: number;
  rowEnd: number;
  tintClass: string;
}

export interface TownPlot {
  day: number;
  date: string;
  col: number;
  row: number;
  district: string;
}

export interface TownSceneryTile {
  key: string;
  col: number;
  row: number;
  kind: "park" | "plaza" | "pond";
}

export interface TownLayout {
  plots: TownPlot[];
  scenery: TownSceneryTile[];
  districts: DistrictZone[];
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
  { name: "Week 1", rowStart: 0, rowEnd: 0, tintClass: "from-cyan-200/45 to-blue-200/20" },
  { name: "Week 2", rowStart: 1, rowEnd: 1, tintClass: "from-violet-200/45 to-indigo-200/20" },
  { name: "Week 3", rowStart: 2, rowEnd: 2, tintClass: "from-emerald-200/45 to-lime-200/20" },
  { name: "Week 4", rowStart: 3, rowEnd: 3, tintClass: "from-amber-200/45 to-orange-200/20" },
  { name: "Week 5", rowStart: 4, rowEnd: 4, tintClass: "from-pink-200/45 to-fuchsia-200/20" },
  { name: "Week 6", rowStart: 5, rowEnd: 5, tintClass: "from-slate-200/45 to-slate-100/20" }
];

const hashString = (input: string) => {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const createRng = (seed: number) => {
  let t = seed || 1;
  return () => {
    t += 0x6d2b79f5;
    let value = Math.imul(t ^ (t >>> 15), 1 | t);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
};

const weekdayMap: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6
};

const getFirstWeekday = (monthKey: string) => {
  const date = new Date(`${monthKey}-01T00:00:00+09:00`);
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "Asia/Seoul", weekday: "short" }).format(date);
  return weekdayMap[weekday] ?? 0;
};

const districtForRow = (row: number) => DISTRICTS.find((zone) => row >= zone.rowStart && row <= zone.rowEnd)?.name ?? "Week 1";

const toDate = (monthKey: string, day: number) => `${monthKey}-${String(day).padStart(2, "0")}`;

const roadColumns = () => Array.from({ length: GRID_COLS - 1 }, (_, idx) => idx);
const roadRows = () => Array.from({ length: GRID_ROWS - 1 }, (_, idx) => idx);

export const createTownLayout = (monthKey: string, dayCount: number): TownLayout => {
  const firstWeekday = getFirstWeekday(monthKey);

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

  const rng = createRng(hashString(monthKey));
  const sceneryKinds: TownSceneryTile["kind"][] = ["park", "plaza", "pond"];
  const scenery = empties
    .filter(() => rng() > 0.35)
    .slice(0, Math.min(10, empties.length))
    .map((slot, index) => ({
      key: `${monthKey}-${slot.col}-${slot.row}-${index}`,
      col: slot.col,
      row: slot.row,
      kind: sceneryKinds[index % sceneryKinds.length]
    }));

  return {
    plots,
    scenery,
    districts: DISTRICTS,
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
