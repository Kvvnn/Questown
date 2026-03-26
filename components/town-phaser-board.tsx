"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { getBuildingHeight, getDisplayedRoofType } from "@/domain/building";
import { getDominantQuestType } from "@/domain/quest";
import { TownLayout } from "@/domain/town-map";
import { DailyRecord, QuestType } from "@/domain/types";
import { cn } from "@/lib/utils";

type PhaserModule = typeof import("phaser");

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const districtGround = ["0xd2f4e8", "0xd8ecff", "0xe7ddff", "0xffebcc", "0xffd9ea", "0xe6edf7"].map((value) =>
  Number(value)
);

const typePalette: Record<
  QuestType | "empty",
  { top: number; left: number; right: number; roof: number; accent: number; label: string }
> = {
  daily: {
    top: 0x6ee7b7,
    left: 0x2bb98e,
    right: 0x45d1a0,
    roof: 0x0f766e,
    accent: 0x042f2e,
    label: "루틴"
  },
  main: {
    top: 0xfbbf24,
    left: 0xea8c1e,
    right: 0xf5a524,
    roof: 0xc2410c,
    accent: 0x7c2d12,
    label: "메인"
  },
  sub: {
    top: 0xc4b5fd,
    left: 0x8b5cf6,
    right: 0xa78bfa,
    roof: 0x6d28d9,
    accent: 0x4c1d95,
    label: "서브"
  },
  empty: {
    top: 0xe2e8f0,
    left: 0xcbd5e1,
    right: 0xd9e2ec,
    roof: 0x94a3b8,
    accent: 0x475569,
    label: "빈 부지"
  }
};

const sceneryPalette = {
  park: {
    canopy: 0x34d399,
    canopyDark: 0x059669,
    trunk: 0x8b5a2b
  },
  plaza: {
    stone: 0xcbd5e1,
    stoneDark: 0x94a3b8,
    accent: 0xffffff
  },
  pond: {
    water: 0x7dd3fc,
    waterDark: 0x38bdf8,
    accent: 0xe0f2fe
  }
} as const;

interface PlotPoint {
  x: number;
  y: number;
  totalFloors: number;
}

interface TownBoardSnapshot {
  currentDateKey: string;
  layout: TownLayout;
  recordsByDate: Record<string, DailyRecord>;
  selectedDate: string;
}

interface TownBoardControls {
  sync: (snapshot: TownBoardSnapshot) => void;
  resize: (width: number, height: number) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  resetView: () => void;
  focusDate: (date: string) => void;
  destroy: () => void;
}

export interface TownPhaserBoardHandle {
  focusDate: (date: string) => void;
  resetView: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
}

interface TownPhaserBoardProps {
  currentDateKey: string;
  layout: TownLayout;
  onSelect: (date: string) => void;
  recordsByDate: Record<string, DailyRecord>;
  selectedDate: string;
  className?: string;
}

const questBadgeLabel = (type: QuestType | null) => typePalette[type ?? "empty"].label;

const toIso = (col: number, row: number, tileWidth: number, tileHeight: number) => ({
  x: (col - row) * (tileWidth / 2),
  y: (col + row) * (tileHeight / 2)
});

const getVisibleBuildingHeight = (totalFloors: number) => {
  if (totalFloors <= 0) return 0;
  const visibleFloors = Math.min(totalFloors, 6);
  return 20 + visibleFloors * 10;
};

const floorCountLabel = (totalFloors: number) => {
  if (totalFloors <= 0) return "빈 부지";
  if (totalFloors <= 6) return `${totalFloors}F`;
  return `6F+${totalFloors - 6}`;
};

const drawPolygon = (
  graphics: Phaser.GameObjects.Graphics,
  points: Array<[number, number]>,
  fillColor: number,
  alpha = 1,
  strokeColor = 0xffffff,
  strokeAlpha = 0.78,
  lineWidth = 1
) => {
  graphics.lineStyle(lineWidth, strokeColor, strokeAlpha);
  graphics.fillStyle(fillColor, alpha);
  graphics.beginPath();
  graphics.moveTo(points[0][0], points[0][1]);
  for (let index = 1; index < points.length; index += 1) {
    graphics.lineTo(points[index][0], points[index][1]);
  }
  graphics.closePath();
  graphics.fillPath();
  graphics.strokePath();
};

const createTownBoard = ({
  Phaser,
  host,
  onSelect
}: {
  Phaser: PhaserModule;
  host: HTMLDivElement;
  onSelect: (date: string) => void;
}): TownBoardControls => {
  let scene: Phaser.Scene | null = null;
  let world: Phaser.GameObjects.Container | null = null;
  let size = {
    width: Math.max(1, host.clientWidth || 360),
    height: Math.max(1, host.clientHeight || 360)
  };
  let snapshot: TownBoardSnapshot | null = null;
  let focusDate: string | undefined;
  let zoom = 1;
  let tileWidth = 58;
  let tileHeight = 30;
  let plotPoints = new Map<string, PlotPoint>();
  let pan = { x: 0, y: 0 };
  let drag = { pointerId: -1, startX: 0, startY: 0, lastX: 0, lastY: 0, moved: false };

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: host,
    width: size.width,
    height: size.height,
    transparent: true,
    backgroundColor: "#dff4ff",
    audio: { noAudio: true },
    render: {
      antialias: true,
      roundPixels: false
    },
    scale: {
      mode: Phaser.Scale.NONE,
      width: size.width,
      height: size.height
    },
    scene: {
      create() {
        scene = this;
        world = this.add.container(0, 0);
        this.input.setTopOnly(true);

        this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
          drag = {
            pointerId: pointer.id,
            startX: pointer.x,
            startY: pointer.y,
            lastX: pointer.x,
            lastY: pointer.y,
            moved: false
          };
        });

        this.input.on("pointermove", (pointer: Phaser.Input.Pointer) => {
          if (!pointer.isDown || pointer.id !== drag.pointerId) return;

          const dx = pointer.x - drag.lastX;
          const dy = pointer.y - drag.lastY;

          if (!drag.moved && Math.hypot(pointer.x - drag.startX, pointer.y - drag.startY) > 8) {
            drag.moved = true;
          }

          if (!drag.moved) return;

          pan = {
            x: clamp(pan.x + dx, -size.width * 0.34, size.width * 0.34),
            y: clamp(pan.y + dy, -size.height * 0.18, size.height * 0.22)
          };
          drag.lastX = pointer.x;
          drag.lastY = pointer.y;
          applyView();
        });

        this.input.on("pointerup", (pointer: Phaser.Input.Pointer) => {
          if (pointer.id !== drag.pointerId) return;
          drag.pointerId = -1;
        });

        this.input.on("pointerupoutside", () => {
          drag.pointerId = -1;
        });

        if (snapshot) {
          redraw(false);
        }
      }
    }
  });

  const getFocusPoint = () => {
    if (!snapshot) return { x: 0, y: 0 };
    const activeDate = focusDate && plotPoints.has(focusDate) ? focusDate : snapshot.selectedDate;
    const target = plotPoints.get(activeDate);
    return target ? { x: target.x, y: target.y } : { x: 0, y: 0 };
  };

  const applyView = (animate = false) => {
    if (!scene || !world) return;

    const focusPoint = getFocusPoint();
    const nextX = size.width / 2 - focusPoint.x * zoom + pan.x;
    const nextY = size.height * 0.58 - focusPoint.y * zoom + pan.y;

    scene.tweens.killTweensOf(world);

    if (animate) {
      scene.tweens.add({
        targets: world,
        x: nextX,
        y: nextY,
        scaleX: zoom,
        scaleY: zoom,
        duration: 220,
        ease: "Cubic.out"
      });
      return;
    }

    world.setPosition(nextX, nextY);
    world.setScale(zoom);
  };

  const drawGroundTile = (
    row: number,
    col: number,
    districtIndex: number,
    plotDate?: string,
    isSelected = false,
    isCurrent = false
  ) => {
    if (!scene || !world) return;

    const point = toIso(col, row, tileWidth, tileHeight);
    const tile = scene.add.container(point.x, point.y);

    const glow = scene.add.graphics();
    if (isSelected) {
      drawPolygon(
        glow,
        [
          [0, -tileHeight * 0.64],
          [tileWidth * 0.62, 0],
          [0, tileHeight * 0.64],
          [-tileWidth * 0.62, 0]
        ],
        0x6366f1,
        0.14,
        0xffffff,
        0.22,
        2
      );
      tile.add(glow);
    }

    const ground = scene.add.graphics();
    const fill = districtGround[districtIndex % districtGround.length];
    drawPolygon(
      ground,
      [
        [0, -tileHeight / 2],
        [tileWidth / 2, 0],
        [0, tileHeight / 2],
        [-tileWidth / 2, 0]
      ],
      fill,
      0.95,
      isCurrent ? 0xffffff : 0xa9bed3,
      isCurrent ? 0.95 : 0.48,
      isCurrent ? 2 : 1
    );
    tile.add(ground);

    if (plotDate) {
      const dayText = scene.add
        .text(0, tileHeight * 0.58, plotDate.slice(8, 10), {
          fontFamily: "system-ui, sans-serif",
          fontSize: "12px",
          fontStyle: "700",
          color: isSelected ? "#111827" : "#475569"
        })
        .setOrigin(0.5, 0);
      tile.add(dayText);
    }

    world.add(tile);
  };

  const drawScenery = (kind: TownLayout["scenery"][number]["kind"], x: number, y: number) => {
    if (!scene || !world) return;

    const container = scene.add.container(x, y);
    const graphics = scene.add.graphics();

    if (kind === "park") {
      graphics.fillStyle(sceneryPalette.park.trunk, 1);
      graphics.fillRect(-2, -8, 4, 10);
      graphics.fillStyle(sceneryPalette.park.canopyDark, 1);
      graphics.fillCircle(-8, -10, 7);
      graphics.fillCircle(0, -14, 9);
      graphics.fillCircle(8, -10, 7);
      graphics.fillStyle(sceneryPalette.park.canopy, 1);
      graphics.fillCircle(-5, -12, 7);
      graphics.fillCircle(4, -14, 8);
    } else if (kind === "plaza") {
      graphics.fillStyle(sceneryPalette.plaza.stoneDark, 1);
      graphics.fillRoundedRect(-11, -6, 22, 12, 4);
      graphics.fillStyle(sceneryPalette.plaza.stone, 1);
      graphics.fillRoundedRect(-9, -8, 18, 10, 4);
      graphics.fillStyle(sceneryPalette.plaza.accent, 0.72);
      graphics.fillCircle(0, -3, 3);
    } else {
      graphics.fillStyle(sceneryPalette.pond.waterDark, 1);
      graphics.fillEllipse(0, 0, 28, 16);
      graphics.fillStyle(sceneryPalette.pond.water, 1);
      graphics.fillEllipse(0, -1, 24, 12);
      graphics.fillStyle(sceneryPalette.pond.accent, 0.9);
      graphics.fillEllipse(6, -3, 8, 4);
    }

    container.add(graphics);
    world.add(container);
  };

  const drawBuilding = ({
    date,
    day,
    row,
    col,
    record,
    isSelected,
    isCurrent
  }: {
    date: string;
    day: number;
    row: number;
    col: number;
    record?: DailyRecord;
    isSelected: boolean;
    isCurrent: boolean;
  }) => {
    if (!scene || !world) return;

    const point = toIso(col, row, tileWidth, tileHeight);
    const totalFloors = getBuildingHeight(record?.completedCount ?? 0);
    const height = getVisibleBuildingHeight(totalFloors);
    const dominantType = getDominantQuestType(record, "completed") ?? getDominantQuestType(record, "total");
    const palette = typePalette[dominantType ?? "empty"];
    const roofType = getDisplayedRoofType(totalFloors, record?.roofType ?? "none", Boolean(record?.isFinalized));
    const container = scene.add.container(point.x, point.y);

    plotPoints.set(date, { x: point.x, y: point.y - height * 0.34, totalFloors });

    const shadow = scene.add.ellipse(0, tileHeight * 0.44, tileWidth * 0.68, tileHeight * 0.38, 0x0f172a, 0.12);
    container.add(shadow);

    if (height <= 0) {
      const pad = scene.add.graphics();
      drawPolygon(
        pad,
        [
          [0, -8],
          [tileWidth * 0.32, 4],
          [0, tileHeight * 0.34],
          [-tileWidth * 0.32, 4]
        ],
        palette.top,
        1,
        0xffffff,
        0.68,
        1
      );
      container.add(pad);
    } else {
      const graphics = scene.add.graphics();

      const topDiamond: Array<[number, number]> = [
        [0, -height - tileHeight / 2],
        [tileWidth / 2, -height],
        [0, -height + tileHeight / 2],
        [-tileWidth / 2, -height]
      ];
      const rightFace: Array<[number, number]> = [
        [tileWidth / 2, -height],
        [0, -height + tileHeight / 2],
        [0, tileHeight / 2],
        [tileWidth / 2, 0]
      ];
      const leftFace: Array<[number, number]> = [
        [0, -height + tileHeight / 2],
        [-tileWidth / 2, -height],
        [-tileWidth / 2, 0],
        [0, tileHeight / 2]
      ];

      drawPolygon(graphics, leftFace, palette.left, 1, 0xffffff, 0.5, 1);
      drawPolygon(graphics, rightFace, palette.right, 1, 0xffffff, 0.5, 1);
      drawPolygon(
        graphics,
        topDiamond,
        roofType === "none" ? palette.top : palette.roof,
        1,
        isSelected ? 0xffffff : 0xe2e8f0,
        isSelected ? 0.95 : 0.62,
        isSelected ? 2 : 1
      );

      if (roofType !== "none") {
        drawPolygon(
          graphics,
          [
            [0, -height - tileHeight * 0.64],
            [tileWidth * 0.24, -height - 4],
            [0, -height + tileHeight * 0.12],
            [-tileWidth * 0.24, -height - 4]
          ],
          0xffffff,
          0.24,
          0xffffff,
          0.4,
          1
        );
      }

      container.add(graphics);
    }

    if (isSelected || isCurrent) {
      const marker = scene.add.graphics();
      marker.fillStyle(isSelected ? 0x4f46e5 : 0x0f766e, 1);
      marker.fillCircle(0, -height - tileHeight * 0.7, isSelected ? 10 : 8);
      container.add(marker);

      const markerText = scene.add
        .text(0, -height - tileHeight * 0.7, isSelected ? "선택" : "오늘", {
          fontFamily: "system-ui, sans-serif",
          fontSize: "9px",
          fontStyle: "700",
          color: "#ffffff"
        })
        .setOrigin(0.5);
      container.add(markerText);
    }

    const badge = scene.add
      .text(0, -height - tileHeight * 0.16, height > 0 ? floorCountLabel(totalFloors) : questBadgeLabel(dominantType), {
        fontFamily: "system-ui, sans-serif",
        fontSize: "10px",
        fontStyle: "700",
        color: "#0f172a",
        backgroundColor: "#ffffff"
      })
      .setOrigin(0.5);

    badge.setPadding(6, 2, 6, 2);
    badge.setAlpha(0.92);
    container.add(badge);

    const questBadge = scene.add
      .text(0, tileHeight * 0.78, height > 0 ? String(day) : "빈", {
        fontFamily: "system-ui, sans-serif",
        fontSize: "11px",
        fontStyle: "700",
        color: "#475569"
      })
      .setOrigin(0.5, 0);
    container.add(questBadge);

    const hitZone = scene.add.zone(0, -height * 0.36, tileWidth * 0.96, tileHeight + height + 24);
    hitZone.setInteractive({ useHandCursor: true });
    hitZone.on("pointerup", () => {
      if (!drag.moved) onSelect(date);
    });
    container.add(hitZone);

    world.add(container);
  };

  const redraw = (animateFocus: boolean) => {
    const localSnapshot = snapshot;
    if (!scene || !world || !localSnapshot) return;

    world.removeAll(true);
    plotPoints = new Map();
    tileWidth = clamp(Math.round(size.width * 0.16), 46, 64);
    tileHeight = Math.round(tileWidth * 0.52);

    for (let row = 0; row < localSnapshot.layout.rows; row += 1) {
      for (let col = 0; col < localSnapshot.layout.cols; col += 1) {
        const hasPlot = localSnapshot.layout.plots.find((plot) => plot.row === row && plot.col === col);
        drawGroundTile(
          row,
          col,
          row,
          hasPlot?.date,
          hasPlot?.date === localSnapshot.selectedDate,
          hasPlot?.date === localSnapshot.currentDateKey
        );
      }
    }

    const scenery = [...localSnapshot.layout.scenery].sort((a, b) => a.row + a.col - (b.row + b.col) || a.col - b.col);
    scenery.forEach((tile) => {
      const point = toIso(tile.col, tile.row, tileWidth, tileHeight);
      drawScenery(tile.kind, point.x, point.y - 2);
    });

    const plots = [...localSnapshot.layout.plots].sort((a, b) => a.row + a.col - (b.row + b.col) || a.col - b.col);
    plots.forEach((plot) => {
      drawBuilding({
        date: plot.date,
        day: plot.day,
        row: plot.row,
        col: plot.col,
        record: localSnapshot.recordsByDate[plot.date],
        isSelected: plot.date === localSnapshot.selectedDate,
        isCurrent: plot.date === localSnapshot.currentDateKey
      });
    });

    applyView(animateFocus);
  };

  const sync = (nextSnapshot: TownBoardSnapshot) => {
    const shouldAnimate = nextSnapshot.selectedDate !== snapshot?.selectedDate;
    snapshot = nextSnapshot;
    focusDate = nextSnapshot.selectedDate;
    pan = shouldAnimate ? { x: 0, y: 0 } : pan;

    if (!scene || !world) return;
    redraw(shouldAnimate);
  };

  const resize = (width: number, height: number) => {
    size = {
      width: Math.max(1, width),
      height: Math.max(1, height)
    };
    game.scale.resize(size.width, size.height);
    if (scene && world && snapshot) {
      redraw(false);
    }
  };

  const setZoom = (nextZoom: number) => {
    zoom = clamp(nextZoom, 0.84, 1.36);
    applyView(true);
  };

  const wheelHandler = (event: WheelEvent) => {
    event.preventDefault();
    setZoom(zoom + (event.deltaY < 0 ? 0.08 : -0.08));
  };

  host.addEventListener("wheel", wheelHandler, { passive: false });

  return {
    sync,
    resize,
    zoomIn: () => setZoom(zoom + 0.1),
    zoomOut: () => setZoom(zoom - 0.1),
    resetView: () => {
      pan = { x: 0, y: 0 };
      zoom = 1;
      focusDate = snapshot?.selectedDate;
      applyView(true);
    },
    focusDate: (date) => {
      focusDate = date;
      pan = { x: 0, y: 0 };
      applyView(true);
    },
    destroy: () => {
      host.removeEventListener("wheel", wheelHandler);
      game.destroy(true);
    }
  };
};

export const TownPhaserBoard = forwardRef<TownPhaserBoardHandle, TownPhaserBoardProps>(function TownPhaserBoard(
  { currentDateKey, layout, onSelect, recordsByDate, selectedDate, className },
  ref
) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const controlsRef = useRef<TownBoardControls | null>(null);
  const onSelectRef = useRef(onSelect);
  const [isReady, setIsReady] = useState(false);

  onSelectRef.current = onSelect;

  useImperativeHandle(
    ref,
    () => ({
      focusDate: (date) => controlsRef.current?.focusDate(date),
      resetView: () => controlsRef.current?.resetView(),
      zoomIn: () => controlsRef.current?.zoomIn(),
      zoomOut: () => controlsRef.current?.zoomOut()
    }),
    []
  );

  useEffect(() => {
    let mounted = true;
    let resizeObserver: ResizeObserver | null = null;

    const boot = async () => {
      if (!hostRef.current) return;

      const module = await import("phaser");
      const Phaser = (module.default ?? module) as PhaserModule;

      if (!mounted || !hostRef.current) return;

      const controls = createTownBoard({
        Phaser,
        host: hostRef.current,
        onSelect: (date) => onSelectRef.current(date)
      });

      controlsRef.current = controls;
      controls.sync({
        currentDateKey,
        layout,
        recordsByDate,
        selectedDate
      });

      resizeObserver = new ResizeObserver((entries) => {
        const entry = entries[0];
        if (!entry) return;
        controls.resize(entry.contentRect.width, entry.contentRect.height);
      });
      resizeObserver.observe(hostRef.current);
      setIsReady(true);
    };

    void boot();

    return () => {
      mounted = false;
      resizeObserver?.disconnect();
      controlsRef.current?.destroy();
      controlsRef.current = null;
    };
  }, []);

  useEffect(() => {
    controlsRef.current?.sync({
      currentDateKey,
      layout,
      recordsByDate,
      selectedDate
    });
  }, [currentDateKey, layout, recordsByDate, selectedDate]);

  return (
    <div className={cn("relative h-full w-full overflow-hidden rounded-[30px]", className)}>
      <div ref={hostRef} className="absolute inset-0" />

      {!isReady ? (
        <div className="absolute inset-0 flex items-center justify-center bg-white/30 text-sm font-semibold text-slate-600 backdrop-blur-[2px]">
          타운 씬 준비 중...
        </div>
      ) : null}
    </div>
  );
});
