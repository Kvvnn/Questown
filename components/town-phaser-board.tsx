"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import { getBuildingHeight, getDisplayedRoofType } from "@/domain/building";
import {
  districtGroundPalette,
  getFloorCountLabel,
  getIsometricPalette,
  getRoofPalette,
  getVisibleCompletedFloorTypes,
  getVisibleFloorCount,
  toPhaserColor
} from "@/domain/isometric-building";
import { getCompletedQuestTypes } from "@/domain/quest";
import { DistrictProgress, TownLayout, TownMonthProgress, TownSceneryTile } from "@/domain/town-map";
import { DailyRecord } from "@/domain/types";
import { cn } from "@/lib/utils";

type PhaserModule = typeof import("phaser");

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

interface PlotPoint {
  x: number;
  y: number;
  totalFloors: number;
}

interface TownBoardSnapshot {
  currentDateKey: string;
  layout: TownLayout;
  monthProgress: TownMonthProgress;
  districtProgressByName: Record<string, DistrictProgress>;
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
  monthProgress: TownMonthProgress;
  districtProgressByName: Record<string, DistrictProgress>;
  onSelect: (date: string) => void;
  recordsByDate: Record<string, DailyRecord>;
  selectedDate: string;
  className?: string;
}

const districtRewardPalette: Record<string, { primary: string; secondary: string; accent: string; soft: string }> = {
  주거지: { primary: "#2dd4bf", secondary: "#14b8a6", accent: "#0f766e", soft: "#d9fffa" },
  상점가: { primary: "#60a5fa", secondary: "#3b82f6", accent: "#1d4ed8", soft: "#deefff" },
  문화지구: { primary: "#a78bfa", secondary: "#8b5cf6", accent: "#6d28d9", soft: "#efe5ff" },
  "랜드마크 지구": { primary: "#f59e0b", secondary: "#ea580c", accent: "#9a3412", soft: "#fff1d8" },
  "축제 확장지": { primary: "#f472b6", secondary: "#ec4899", accent: "#be185d", soft: "#ffe0f0" },
  "아카이브/오버플로우": { primary: "#94a3b8", secondary: "#64748b", accent: "#334155", soft: "#ecf3fb" }
};

const toIso = (col: number, row: number, tileWidth: number, tileHeight: number) => ({
  x: (col - row) * (tileWidth / 2),
  y: (col + row) * (tileHeight / 2)
});

const toIsoPoint = (col: number, row: number, tileWidth: number, tileHeight: number): [number, number] => {
  const point = toIso(col, row, tileWidth, tileHeight);
  return [point.x, point.y];
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

const drawGridQuad = (
  graphics: Phaser.GameObjects.Graphics,
  corners: Array<[number, number]>,
  tileWidth: number,
  tileHeight: number,
  fillColor: number,
  alpha: number,
  strokeColor: number,
  strokeAlpha: number,
  lineWidth: number
) =>
  drawPolygon(
    graphics,
    corners.map(([col, row]) => toIsoPoint(col, row, tileWidth, tileHeight)),
    fillColor,
    alpha,
    strokeColor,
    strokeAlpha,
    lineWidth
  );

const drawFloorPrism = ({
  graphics,
  width,
  depth,
  sideHeight,
  baseOffset,
  topColor,
  leftColor,
  rightColor,
  strokeColor,
  strokeAlpha,
  lineWidth
}: {
  graphics: Phaser.GameObjects.Graphics;
  width: number;
  depth: number;
  sideHeight: number;
  baseOffset: number;
  topColor: number;
  leftColor: number;
  rightColor: number;
  strokeColor: number;
  strokeAlpha: number;
  lineWidth: number;
}) => {
  const halfWidth = width / 2;
  const topDiamond: Array<[number, number]> = [
    [0, -baseOffset - sideHeight - depth / 2],
    [halfWidth, -baseOffset - sideHeight],
    [0, -baseOffset - sideHeight + depth / 2],
    [-halfWidth, -baseOffset - sideHeight]
  ];
  const rightFace: Array<[number, number]> = [
    [halfWidth, -baseOffset - sideHeight],
    [0, -baseOffset - sideHeight + depth / 2],
    [0, -baseOffset + depth / 2],
    [halfWidth, -baseOffset]
  ];
  const leftFace: Array<[number, number]> = [
    [0, -baseOffset - sideHeight + depth / 2],
    [-halfWidth, -baseOffset - sideHeight],
    [-halfWidth, -baseOffset],
    [0, -baseOffset + depth / 2]
  ];

  drawPolygon(graphics, leftFace, leftColor, 1, strokeColor, strokeAlpha, lineWidth);
  drawPolygon(graphics, rightFace, rightColor, 1, strokeColor, strokeAlpha, lineWidth);
  drawPolygon(graphics, topDiamond, topColor, 1, strokeColor, strokeAlpha, lineWidth);
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

  const drawDistrictBand = (districtIndex: number) => {
    if (!scene || !world || !snapshot) return;

    const district = snapshot.layout.districts[districtIndex];
    if (!district) return;

    const graphics = scene.add.graphics();
    const fill = toPhaserColor(districtGroundPalette[districtIndex % districtGroundPalette.length]);
    drawGridQuad(
      graphics,
      [
        [-0.55, district.rowStart - 0.16],
        [snapshot.layout.cols - 0.35, district.rowStart - 0.16],
        [snapshot.layout.cols - 0.35, district.rowEnd + 1.08],
        [-0.55, district.rowEnd + 1.08]
      ],
      tileWidth,
      tileHeight,
      fill,
      0.2,
      0xffffff,
      0.16,
      2
    );
    world.add(graphics);

    const labelPoint = toIso(0.1, district.rowStart + 0.18, tileWidth, tileHeight);
    const label = scene.add
      .text(labelPoint.x - tileWidth * 0.25, labelPoint.y - tileHeight * 1.1, district.name, {
        fontFamily: "system-ui, sans-serif",
        fontSize: "10px",
        fontStyle: "700",
        color: "#334155",
        backgroundColor: "#ffffff"
      })
      .setOrigin(0.5);
    label.setPadding(8, 3, 8, 3);
    label.setAlpha(0.86);
    world.add(label);
  };

  const drawRoad = (road: TownLayout["roads"][number]) => {
    if (!scene || !world || !snapshot) return;

    const graphics = scene.add.graphics();
    const fill = road.orientation === "vertical" ? 0xb7c7d8 : 0xc7d4e1;
    if (road.orientation === "horizontal") {
      const roadRow = (road.row ?? 0) + 0.5;
      drawGridQuad(
        graphics,
        [
          [-0.45, roadRow - 0.18],
          [snapshot.layout.cols - 0.35, roadRow - 0.18],
          [snapshot.layout.cols - 0.35, roadRow + 0.18],
          [-0.45, roadRow + 0.18]
        ],
        tileWidth,
        tileHeight,
        fill,
        0.62,
        0xffffff,
        0.22,
        1
      );
    } else {
      const roadCol = road.col ?? 3;
      drawGridQuad(
        graphics,
        [
          [roadCol - 0.18, -0.15],
          [roadCol + 0.18, -0.15],
          [roadCol + 0.18, snapshot.layout.rows - 0.12],
          [roadCol - 0.18, snapshot.layout.rows - 0.12]
        ],
        tileWidth,
        tileHeight,
        fill,
        0.58,
        0xffffff,
        0.22,
        1
      );
    }

    world.add(graphics);
  };

  const drawRewardObject = (tile: TownSceneryTile) => {
    if (!scene || !world || !snapshot) return;

    const point = toIso(tile.col, tile.row, tileWidth, tileHeight);
    const container = scene.add.container(point.x, point.y);
    const districtProgress = tile.district ? snapshot.districtProgressByName[tile.district] : undefined;
    const palette =
      districtRewardPalette[tile.district ?? "주거지"] ?? districtRewardPalette.주거지;
    const primaryColor = toPhaserColor(palette.primary);
    const secondaryColor = toPhaserColor(palette.secondary);
    const accentColor = toPhaserColor(palette.accent);
    const softColor = toPhaserColor(palette.soft);

    const base = scene.add.graphics();
    drawFloorPrism({
      graphics: base,
      width: tileWidth * 0.68,
      depth: tileHeight * 0.58,
      sideHeight: Math.max(5, Math.round(tileHeight * 0.4)),
      baseOffset: 0,
      topColor: softColor,
      leftColor: secondaryColor,
      rightColor: primaryColor,
      strokeColor: 0xffffff,
      strokeAlpha: 0.7,
      lineWidth: 1
    });
    container.add(base);

    if (tile.kind === "district_gate") {
      const graphics = scene.add.graphics();
      const unlocked = districtProgress?.unlocked ?? false;
      graphics.fillStyle(unlocked ? primaryColor : toPhaserColor("#cbd5e1"), 1);
      graphics.fillRoundedRect(-tileWidth * 0.18, -tileHeight * 1.12, tileWidth * 0.1, tileHeight * 0.88, 6);
      graphics.fillRoundedRect(tileWidth * 0.08, -tileHeight * 1.12, tileWidth * 0.1, tileHeight * 0.88, 6);
      graphics.fillStyle(unlocked ? secondaryColor : toPhaserColor("#94a3b8"), 1);
      graphics.fillRoundedRect(-tileWidth * 0.22, -tileHeight * 1.2, tileWidth * 0.44, tileHeight * 0.16, 8);
      container.add(graphics);
    }

    if (tile.kind === "district_landmark") {
      const graphics = scene.add.graphics();
      const unlocked = districtProgress?.unlocked ?? false;
      if (!unlocked) {
        drawFloorPrism({
          graphics,
          width: tileWidth * 0.38,
          depth: tileHeight * 0.34,
          sideHeight: Math.max(6, Math.round(tileHeight * 0.32)),
          baseOffset: Math.max(4, Math.round(tileHeight * 0.22)),
          topColor: toPhaserColor("#e2e8f0"),
          leftColor: toPhaserColor("#cbd5e1"),
          rightColor: toPhaserColor("#d8e3ee"),
          strokeColor: 0xffffff,
          strokeAlpha: 0.72,
          lineWidth: 1
        });
      } else {
        const isTall = tile.district === "랜드마크 지구";
        const stageCount = isTall ? 3 : 2;
        for (let index = 0; index < stageCount; index += 1) {
          drawFloorPrism({
            graphics,
            width: tileWidth * (isTall ? 0.42 - index * 0.04 : 0.38 - index * 0.03),
            depth: tileHeight * (0.32 - index * 0.02),
            sideHeight: Math.max(6, Math.round(tileHeight * (isTall ? 0.46 : 0.34))),
            baseOffset: tileHeight * 0.24 + index * Math.max(8, Math.round(tileHeight * 0.36)),
            topColor: index % 2 === 0 ? primaryColor : secondaryColor,
            leftColor: secondaryColor,
            rightColor: primaryColor,
            strokeColor: 0xffffff,
            strokeAlpha: 0.72,
            lineWidth: 1
          });
        }
      }
      container.add(graphics);
    }

    if (tile.kind === "monthly_monument") {
      const graphics = scene.add.graphics();
      const tier = snapshot.monthProgress.monumentTier;
      drawFloorPrism({
        graphics,
        width: tileWidth * 0.46,
        depth: tileHeight * 0.36,
        sideHeight: Math.max(6, Math.round(tileHeight * 0.32)),
        baseOffset: tileHeight * 0.22,
        topColor: toPhaserColor("#dbeafe"),
        leftColor: toPhaserColor("#bfdbfe"),
        rightColor: toPhaserColor("#93c5fd"),
        strokeColor: 0xffffff,
        strokeAlpha: 0.74,
        lineWidth: 1
      });

      for (let index = 1; index <= tier; index += 1) {
        drawFloorPrism({
          graphics,
          width: tileWidth * (0.38 - index * 0.03),
          depth: tileHeight * (0.3 - index * 0.02),
          sideHeight: Math.max(7, Math.round(tileHeight * 0.38)),
          baseOffset: tileHeight * 0.4 + (index - 1) * Math.max(8, Math.round(tileHeight * 0.38)),
          topColor: index % 2 === 0 ? toPhaserColor("#fbbf24") : toPhaserColor("#fde68a"),
          leftColor: toPhaserColor("#d97706"),
          rightColor: toPhaserColor("#f59e0b"),
          strokeColor: 0xffffff,
          strokeAlpha: 0.76,
          lineWidth: 1
        });
      }

      container.add(graphics);
    }

    if (tile.kind === "season_banner") {
      const banner = scene.add.graphics();
      const active = snapshot.monthProgress.coreUnlockedCount > 0;
      banner.fillStyle(active ? accentColor : toPhaserColor("#94a3b8"), 1);
      banner.fillRoundedRect(-2, -tileHeight * 1.12, 4, tileHeight * 0.9, 2);
      banner.fillStyle(active ? primaryColor : toPhaserColor("#cbd5e1"), 1);
      banner.fillRoundedRect(2, -tileHeight * 1.05, tileWidth * 0.22, tileHeight * 0.18, 4);
      container.add(banner);
    }

    if (tile.kind === "monthly_monument" || tile.kind === "district_landmark") {
      const label = scene.add
        .text(0, tileHeight * 0.45, tile.kind === "monthly_monument" ? "월 보상" : "랜드마크", {
          fontFamily: "system-ui, sans-serif",
          fontSize: "9px",
          fontStyle: "700",
          color: "#334155",
          backgroundColor: "#ffffff"
        })
        .setOrigin(0.5);
      label.setPadding(6, 2, 6, 2);
      label.setAlpha(0.88);
      container.add(label);
    }

    world.add(container);
  };

  const drawPlotGroundTile = ({
    day,
    row,
    col,
    districtIndex,
    isSelected,
    isCurrent
  }: {
    day: number;
    row: number;
    col: number;
    districtIndex: number;
    isSelected: boolean;
    isCurrent: boolean;
  }) => {
    if (!scene || !world) return;

    const point = toIso(col, row, tileWidth, tileHeight);
    const tile = scene.add.container(point.x, point.y);

    const glow = scene.add.graphics();
    if (isSelected) {
      drawPolygon(
        glow,
        [
          [0, -tileHeight * 0.62],
          [tileWidth * 0.58, 0],
          [0, tileHeight * 0.62],
          [-tileWidth * 0.58, 0]
        ],
        0x4f46e5,
        0.12,
        0xffffff,
        0.18,
        2
      );
      tile.add(glow);
    }

    const ground = scene.add.graphics();
    const fill = toPhaserColor(districtGroundPalette[districtIndex % districtGroundPalette.length]);
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
      isCurrent ? 0.82 : 0.34,
      isCurrent ? 1.6 : 1
    );
    tile.add(ground);

    const dayText = scene.add
      .text(0, tileHeight * 0.54, String(day), {
        fontFamily: "system-ui, sans-serif",
        fontSize: "10px",
        fontStyle: "700",
        color: isSelected ? "#0f172a" : "#475569"
      })
      .setOrigin(0.5, 0);
    tile.add(dayText);

    world.add(tile);
  };

  const drawBuilding = ({
    date,
    row,
    col,
    record,
    isSelected,
    isCurrent
  }: {
    date: string;
    row: number;
    col: number;
    record?: DailyRecord;
    isSelected: boolean;
    isCurrent: boolean;
  }) => {
    if (!scene || !world) return;

    const point = toIso(col, row, tileWidth, tileHeight);
    const totalFloors = getBuildingHeight(record?.completedCount ?? 0);
    const visibleFloors = getVisibleFloorCount(totalFloors, 6);
    const completedQuestTypes = getVisibleCompletedFloorTypes(totalFloors, getCompletedQuestTypes(record?.quests ?? []), 6);
    const roofType = getDisplayedRoofType(totalFloors, record?.roofType ?? "none", Boolean(record?.isFinalized));
    const roofPalette = getRoofPalette(roofType);
    const floorWidth = tileWidth * 0.74;
    const floorDepth = tileHeight * 0.82;
    const floorSideHeight = Math.max(8, Math.round(tileHeight * 0.62));
    const roofWidth = floorWidth * 0.8;
    const roofDepth = floorDepth * 0.84;
    const roofSideHeight = Math.max(7, floorSideHeight - 1);
    const container = scene.add.container(point.x, point.y);
    const stackHeight = visibleFloors * floorSideHeight;

    plotPoints.set(date, { x: point.x, y: point.y - stackHeight * 0.72, totalFloors });

    const shadow = scene.add.ellipse(0, tileHeight * 0.44, tileWidth * 0.68, tileHeight * 0.38, 0x0f172a, 0.12);
    container.add(shadow);

    if (visibleFloors <= 0) {
      const pad = scene.add.graphics();
      const emptyPalette = getIsometricPalette(null);
      drawFloorPrism({
        graphics: pad,
        width: floorWidth * 0.82,
        depth: floorDepth * 0.6,
        sideHeight: Math.max(4, Math.round(floorSideHeight * 0.45)),
        baseOffset: 0,
        topColor: toPhaserColor(emptyPalette.top),
        leftColor: toPhaserColor(emptyPalette.left),
        rightColor: toPhaserColor(emptyPalette.right),
        strokeColor: 0xffffff,
        strokeAlpha: 0.7,
        lineWidth: 1
      });
      container.add(pad);
    } else {
      const graphics = scene.add.graphics();
      completedQuestTypes.forEach((floorType, index) => {
        const palette = getIsometricPalette(floorType);
        drawFloorPrism({
          graphics,
          width: floorWidth,
          depth: floorDepth,
          sideHeight: floorSideHeight,
          baseOffset: index * floorSideHeight,
          topColor: toPhaserColor(palette.top),
          leftColor: toPhaserColor(palette.left),
          rightColor: toPhaserColor(palette.right),
          strokeColor: isSelected ? 0xffffff : toPhaserColor(palette.accent),
          strokeAlpha: isSelected ? 0.9 : 0.14,
          lineWidth: isSelected ? 2 : 1
        });
      });

      if (roofPalette) {
        drawFloorPrism({
          graphics,
          width: roofWidth,
          depth: roofDepth,
          sideHeight: roofSideHeight,
          baseOffset: visibleFloors * floorSideHeight + 2,
          topColor: toPhaserColor(roofPalette.top),
          leftColor: toPhaserColor(roofPalette.left),
          rightColor: toPhaserColor(roofPalette.right),
          strokeColor: 0xffffff,
          strokeAlpha: 0.88,
          lineWidth: 1
        });
      }

      container.add(graphics);
    }

    if (roofType === "high") {
      const flag = scene.add.graphics();
      flag.lineStyle(2, 0xffffff, 0.9);
      flag.beginPath();
      flag.moveTo(0, -stackHeight - tileHeight * 0.95);
      flag.lineTo(0, -stackHeight - tileHeight * 1.28);
      flag.strokePath();
      flag.fillStyle(0xfacc15, 1);
      flag.fillTriangle(0, -stackHeight - tileHeight * 1.28, tileWidth * 0.16, -stackHeight - tileHeight * 1.2, 0, -stackHeight - tileHeight * 1.12);
      container.add(flag);
    } else if (roofType === "mid") {
      const gem = scene.add.graphics();
      gem.fillStyle(0xf59e0b, 0.95);
      gem.fillCircle(0, -stackHeight - tileHeight * 0.98, 4);
      container.add(gem);
    }

    if (isSelected || isCurrent) {
      const marker = scene.add.graphics();
      marker.fillStyle(isSelected ? 0x4f46e5 : 0x0f766e, 1);
      marker.fillCircle(0, -stackHeight - tileHeight * 0.82 - (roofPalette ? roofSideHeight : 0), isSelected ? 8 : 6);
      container.add(marker);

      const markerText = scene.add
        .text(0, -stackHeight - tileHeight * 0.82 - (roofPalette ? roofSideHeight : 0), isSelected ? "선택" : "오늘", {
          fontFamily: "system-ui, sans-serif",
          fontSize: "8px",
          fontStyle: "700",
          color: "#ffffff"
        })
        .setOrigin(0.5);
      container.add(markerText);
    }

    if (totalFloors > 0) {
      const badge = scene.add
        .text(0, -stackHeight - tileHeight * 0.2, getFloorCountLabel(totalFloors, 6), {
          fontFamily: "system-ui, sans-serif",
          fontSize: "9px",
          fontStyle: "700",
          color: "#0f172a",
          backgroundColor: "#ffffff"
        })
        .setOrigin(0.5);

      badge.setPadding(5, 2, 5, 2);
      badge.setAlpha(0.9);
      container.add(badge);
    }

    const hitZone = scene.add.zone(0, -stackHeight * 0.36, tileWidth * 0.96, tileHeight + stackHeight + 26);
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

    localSnapshot.layout.districts.forEach((_, index) => drawDistrictBand(index));
    localSnapshot.layout.roads.forEach((road) => drawRoad(road));

    [...localSnapshot.layout.scenery]
      .sort((a, b) => a.row + a.col - (b.row + b.col) || a.col - b.col)
      .forEach((tile) => drawRewardObject(tile));

    [...localSnapshot.layout.plots]
      .sort((a, b) => a.row + a.col - (b.row + b.col) || a.col - b.col)
      .forEach((plot) => {
        const districtIndex = localSnapshot.layout.districts.findIndex((district) => district.name === plot.district);
        drawPlotGroundTile({
          day: plot.day,
          row: plot.row,
          col: plot.col,
          districtIndex: districtIndex >= 0 ? districtIndex : plot.row,
          isSelected: plot.date === localSnapshot.selectedDate,
          isCurrent: plot.date === localSnapshot.currentDateKey
        });
      });

    [...localSnapshot.layout.plots]
      .sort((a, b) => a.row + a.col - (b.row + b.col) || a.col - b.col)
      .forEach((plot) => {
        drawBuilding({
          date: plot.date,
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
  { currentDateKey, layout, monthProgress, districtProgressByName, onSelect, recordsByDate, selectedDate, className },
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
        monthProgress,
        districtProgressByName,
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
      monthProgress,
      districtProgressByName,
      recordsByDate,
      selectedDate
    });
  }, [currentDateKey, districtProgressByName, layout, monthProgress, recordsByDate, selectedDate]);

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
