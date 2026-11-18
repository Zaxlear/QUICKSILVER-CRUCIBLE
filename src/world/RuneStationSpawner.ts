/**
 * 房间符文机关、祭坛、军械架、剧情排班板与升降梯台座装配器
 * （src/world/RuneStationSpawner.ts）。
 */

import Phaser from 'phaser';
import { DepthLayer, TILE_SIZE_PX } from '../core/Constants';
import { BIOME_DAG_CONFIGS, EXPLORATION_RUNES } from '../data/runes.data';
import type { GeneratedBiomeDag } from './DagBiomeGenerator';
import type { BakedStitchedWorld, PlacedRoomNode } from './DoorSocketStitcher';
import type { IWorldDisplayRegistrar } from './ParallaxComposer';

export type StationKind =
  | 'TENDRIL_GRATE'
  | 'CONDUIT_COFFIN'
  | 'ELITE_ALTAR'
  | 'SHOP_RACK'
  | 'EXIT_LIFT';

export interface InteractiveStation {
  readonly id: string;
  readonly kind: StationKind;
  readonly x: number;
  readonly y: number;
  readonly targetX?: number;
  readonly targetY?: number;
  readonly vineTopY?: number;
  activated: boolean;
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly badgeSprite?: Phaser.GameObjects.Sprite;
}

function findNode(dag: GeneratedBiomeDag, id: string): PlacedRoomNode {
  return dag.nodes.find((n) => n.nodeId === id) ?? dag.nodes[0]!;
}

function findSupportBelowShaft(baked: BakedStitchedWorld, worldX: number, minY: number): number {
  let bestY = Infinity;
  for (const ow of baked.oneWayPlatforms) {
    if (worldX >= ow.x && worldX <= ow.x + ow.w && ow.y >= minY && ow.y < bestY) bestY = ow.y;
  }
  for (const sr of baked.solidRects) {
    if (worldX >= sr.x && worldX <= sr.x + sr.w && sr.y >= minY && sr.y < bestY) bestY = sr.y;
  }
  return Number.isFinite(bestY) ? bestY : minY + 160;
}

export function spawnWorldInteractiveStations(
  scene: Phaser.Scene,
  registrar: IWorldDisplayRegistrar,
  dag: GeneratedBiomeDag,
  baked: BakedStitchedWorld
): {
  readonly stations: InteractiveStation[];
  readonly extraSprites: Phaser.GameObjects.Sprite[];
} {
  const stations: InteractiveStation[] = [];
  const extraSprites: Phaser.GameObjects.Sprite[] = [];
  const mk = (x: number, y: number, f: string): Phaser.GameObjects.Sprite =>
    registrar.registerWorldLit(
      scene.add
        .sprite(x, y, 'world_props_atlas', f)
        .setOrigin(0.5, 1.0)
        .setDepth(DepthLayer.LOOT)
        .setPipeline('Light2D')
    );

  for (const node of dag.nodes) {
    const rx = node.worldTileX;
    const ry = node.worldTileY;
    const ped = node.chunk.rewardPedestalTilePos;

    if (node.chunk.role === 'ENTRANCE' && ped) {
      extraSprites.push(mk((rx + ped.tileX) * 16 + 8, (ry + ped.tileY + 1) * 16, 'entrance_vessel_tube'));
    } else if (node.chunk.role === 'ELITE' && ped) {
      const ax = (rx + ped.tileX) * 16 + 8;
      const ay = (ry + ped.tileY + 1) * 16;
      const dropRune = BIOME_DAG_CONFIGS[dag.biomeId].altarDropRune ?? 'rune_vitriol_tendril';
      stations.push({
        id: `${node.nodeId}_altar`,
        kind: 'ELITE_ALTAR',
        x: ax,
        y: ay,
        activated: false,
        sprite: mk(ax, ay, 'rune_altar_pedestal'),
        badgeSprite: mk(ax, ay - 30, EXPLORATION_RUNES[dropRune].sigilFrame),
      });
    } else if ((node.chunk.role === 'SHOP' || node.chunk.role === 'RUNE_SECRET' || node.chunk.role === 'CURSED_VAULT' || node.chunk.role === 'TREASURE') && ped) {
      const sx = (rx + ped.tileX) * 16 + 8;
      const sy = (ry + ped.tileY + 1) * 16;
      stations.push({
        id: `${node.nodeId}_shop`,
        kind: 'SHOP_RACK',
        x: sx,
        y: sy,
        activated: false,
        sprite: mk(sx, sy, 'shop_armory_rack'),
        badgeSprite: mk(sx, sy - 38, 'rune_sigil_1'),
      });
    } else if (node.chunk.role === 'EXIT' && ped) {
      const ex = (rx + ped.tileX) * 16 + 8;
      const ey = (ry + ped.tileY + 1) * 16;
      stations.push({
        id: `${node.nodeId}_exit`,
        kind: 'EXIT_LIFT',
        x: ex,
        y: ey,
        activated: false,
        sprite: mk(ex, ey, 'exit_mercury_lift'),
      });
    }

    for (const cp of node.chunk.conduitPairs ?? []) {
      const x1 = (rx + cp.entryTileX) * 16 + 8;
      const y1 = (ry + cp.entryTileY + 1) * 16;
      const x2 = (rx + cp.exitTileX) * 16 + 8;
      const y2 = (ry + cp.exitTileY + 1) * 16;
      stations.push(
        {
          id: `${cp.pairId}_a`,
          kind: 'CONDUIT_COFFIN',
          x: x1,
          y: y1,
          targetX: x2,
          targetY: y2,
          activated: false,
          sprite: mk(x1, y1, 'conduit_coffin_idle'),
        },
        {
          id: `${cp.pairId}_b`,
          kind: 'CONDUIT_COFFIN',
          x: x2,
          y: y2,
          targetX: x1,
          targetY: y1,
          activated: false,
          sprite: mk(x2, y2, 'conduit_coffin_idle'),
        }
      );
    }
  }

  for (const b of dag.bridges) {
    if (b.requiredRune !== 'rune_vitriol_tendril' || (b.direction !== 'NORTH' && b.direction !== 'SOUTH')) {
      continue;
    }
    const na = findNode(dag, b.fromNodeId);
    const nb = findNode(dag, b.toNodeId);
    const lower = na.worldTileY > nb.worldTileY ? na : nb;
    const upper = lower.nodeId === na.nodeId ? nb : na;
    const cx = b.shaftLeftWorldX + 32;
    const grateY = findSupportBelowShaft(baked, cx, lower.worldTileY * TILE_SIZE_PX + 16);
    const topY = (upper.worldTileY + upper.chunk.heightTiles - 4) * TILE_SIZE_PX;
    stations.push({
      id: `${b.bridgeId}_tendril_grate`,
      kind: 'TENDRIL_GRATE',
      x: cx,
      y: grateY,
      vineTopY: topY,
      activated: false,
      sprite: mk(cx, grateY, 'tendril_grate'),
    });
  }

  return { stations, extraSprites };
}

export function sproutVitriolTendrilColumn(
  scene: Phaser.Scene,
  registrar: IWorldDisplayRegistrar,
  baked: BakedStitchedWorld,
  extraSprites: Phaser.GameObjects.Sprite[],
  x: number,
  bottomY: number,
  topY: number
): void {
  const mk = (vy: number, frame: string): Phaser.GameObjects.Sprite =>
    registrar.registerWorldLit(
      scene.add
        .sprite(x, vy, 'world_props_atlas', frame)
        .setOrigin(0.5, 1.0)
        .setDepth(DepthLayer.LOOT)
        .setPipeline('Light2D')
    );

  for (let y = bottomY; y > topY + 16; y -= 28) {
    extraSprites.push(mk(y, 'tendril_vine_stem'));
    baked.oneWayPlatforms.push({ x: x - 24, y: y - 16, w: 48 });
  }
  extraSprites.push(mk(topY + 16, 'tendril_vine_crown'));
}
