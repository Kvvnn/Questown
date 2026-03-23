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

const GRID_COLS = 12;
const GRID_ROWS = 9;
const TILE = 44;
const GAP = 10;
const PADDING = 24;
const SLOT = TILE + GAP;

const ROAD_COLS = [3, 8];
const ROAD_ROWS = [2, 6];

const DISTRICTS: DistrictZone[] = [
  { name: "Harbor", rowStart: 0, rowEnd: 1, tintClass: "from-cyan-200/45 to-blue-200/20" },
  { name: "Market", rowStart: 2, rowEnd: 3, tintClass: "from-violet-200/45 to-indigo-200/20" },
  { name: "Garden", rowStart: 4, rowEnd: 5, tintClass: "from-emerald-200/45 to-lime-200/20" },
  { name: "Hill", rowStart: 6, rowEnd: 8, tintClass: "from-amber-200/45 to-orange-200/20" }
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

const shuffle = <T>(items: T[], rng: () => number) => {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
};

const isRoad = (col: number, row: number) => ROAD_COLS.includes(col) || ROAD_ROWS.includes(row);

const districtForRow = (row: number) => DISTRICTS.find((zone) => row >= zone.rowStart && row <= zone.rowEnd)?.name ?? "Central";

const toDate = (monthKey: string, day: number) => `${monthKey}-${String(day).padStart(2, "0")}`;

export const createTownLayout = (monthKey: string, dayCount: number): TownLayout => {
  const rng = createRng(hashString(monthKey));

  const candidates: Array<{ col: number; row: number }> = [];
  for (let row = 0; row < GRID_ROWS; row += 1) {
    for (let col = 0; col < GRID_COLS; col += 1) {
      if (!isRoad(col, row)) {
        candidates.push({ col, row });
      }
    }
  }

  const shuffled = shuffle(candidates, rng);
  const selected = shuffled.slice(0, dayCount);
  const rest = shuffled.slice(dayCount);

  const plots = selected.map((slot, index) => ({
    day: index + 1,
    date: toDate(monthKey, index + 1),
    col: slot.col,
    row: slot.row,
    district: districtForRow(slot.row)
  }));

  const sceneryKinds: TownSceneryTile["kind"][] = ["park", "plaza", "pond"];
  const scenery = rest.slice(0, Math.min(20, rest.length)).map((slot, index) => ({
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
    roadCols: ROAD_COLS,
    roadRows: ROAD_ROWS
  };
};
