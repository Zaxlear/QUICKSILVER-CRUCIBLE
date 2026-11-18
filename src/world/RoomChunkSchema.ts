/**
 * 手工房间切片（RoomChunk）强类型 JSON Schema、门锚点契约与运动学可达性校验器
 * （src/world/RoomChunkSchema.ts）。
 *
 * 严格遵循单向依赖铁律：仅依赖 src/core 与 src/data，零 Phaser 场景/UI 耦合。
 */

import { TILE_SIZE_PX } from '../core/Constants';
import type { LightPresetId } from '../data/palette.data';
import { ALL_RUNE_IDS, type RuneId, type TrapKind } from '../data/runes.data';

export type { RuneId, TrapKind };

export type RoomRole =
  | 'ENTRANCE'
  | 'COMBAT'
  | 'ELITE'
  | 'TELEPORTER_HUB'
  | 'SHOP'
  | 'TREASURE'
  | 'CURSED_VAULT'
  | 'LORE'
  | 'RUNE_SECRET'
  | 'CORRIDOR_BRIDGE'
  | 'EXIT';

export type DoorDirection = 'WEST' | 'EAST' | 'NORTH' | 'SOUTH';

export type EnemyArchetypeTag =
  | 'MELEE_FODDER'
  | 'RANGED_HARASS'
  | 'SHIELD_TANK'
  | 'SUPPORT_CASTER'
  | 'FLANKER'
  | 'ELITE_GUARD';

/** 运动学安全可达包络常量（.agents/rules/level-topology-and-determinism.md §1.2） */
export const KINEMATIC_ENVELOPE = {
  MIN_ROOM_WIDTH_TILES: 40,
  MIN_ROOM_HEIGHT_TILES: 30,
  DOOR_APERTURE_TILES: 4,
  SINGLE_JUMP_SAFE_PX: 56,
  DOUBLE_JUMP_SAFE_PX: 96,
  HORIZONTAL_GAP_SAFE_PX: 144,
} as const;

export interface DoorSocketSpec {
  readonly socketId: string;
  readonly direction: DoorDirection;
  readonly tileX: number;
  readonly tileY: number;
  readonly apertureTiles: 4;
  readonly requiredRune: RuneId | null;
}

export interface RectSpan {
  readonly tileX: number;
  readonly tileY: number;
  readonly widthTiles: number;
  readonly heightTiles: number;
}

export interface OneWayPlatformSpan {
  readonly tileX: number;
  readonly tileY: number;
  readonly widthTiles: number;
}

export interface ClimbableWallSpan {
  readonly tileX: number;
  readonly topTileY: number;
  readonly heightTiles: number;
  readonly normalSide: 'LEFT' | 'RIGHT';
}

export interface BreakableSlagFloorSpan {
  readonly tileX: number;
  readonly tileY: number;
  readonly widthTiles: number;
}

export interface EnemySpawnSlot {
  readonly slotId: string;
  readonly tileX: number;
  readonly tileY: number;
  readonly allowedArchetypes: readonly EnemyArchetypeTag[];
  readonly minCrucibleHeat: 0 | 1 | 2 | 3 | 4 | 5;
  readonly patrolSpanTiles: readonly [number, number];
}

export interface TrapSlotSpec {
  readonly slotId: string;
  readonly trapType: TrapKind;
  readonly tileX: number;
  readonly tileY: number;
  readonly widthTiles: number;
  readonly phaseOffsetMs: number;
  readonly cyclePeriodMs: number;
}

export interface LightAnchorSpec {
  readonly tileX: number;
  readonly tileY: number;
  readonly preset: LightPresetId;
  readonly radiusPx: number;
  readonly flickerAmplitude: number;
}

export interface ConduitPairAnchorSpec {
  readonly pairId: string;
  readonly entryTileX: number;
  readonly entryTileY: number;
  readonly exitTileX: number;
  readonly exitTileY: number;
}

export interface RoomChunkTemplate {
  readonly chunkId: string;
  readonly biomePool: readonly string[];
  readonly role: RoomRole;
  readonly widthTiles: number;
  readonly heightTiles: number;
  readonly solidRects: readonly RectSpan[];
  readonly oneWayPlatforms: readonly OneWayPlatformSpan[];
  readonly climbableWalls: readonly ClimbableWallSpan[];
  readonly breakableSlagFloors: readonly BreakableSlagFloorSpan[];
  readonly doorSockets: readonly DoorSocketSpec[];
  readonly enemySpawns: readonly EnemySpawnSlot[];
  readonly trapSlots: readonly TrapSlotSpec[];
  readonly teleporterTilePos: { readonly tileX: number; readonly tileY: number } | null;
  readonly rewardPedestalTilePos: { readonly tileX: number; readonly tileY: number } | null;
  readonly loreAnchor: {
    readonly tileX: number;
    readonly tileY: number;
    readonly lorePoolTag: string;
  } | null;
  readonly lightAnchors: readonly LightAnchorSpec[];
  readonly conduitPairs?: readonly ConduitPairAnchorSpec[];
}

const VALID_RUNES = new Set<string>(ALL_RUNE_IDS);

/**
 * 严格校验 RoomChunk JSON 模板尺寸边界、门锚点贴边规范与符文枚举合法性。
 */
export function validateRoomChunkTemplate(raw: unknown): RoomChunkTemplate {
  if (!raw || typeof raw !== 'object') {
    throw new Error('RoomChunkTemplate must be a non-null JSON object.');
  }
  const chunk = raw as RoomChunkTemplate;
  if (!chunk.chunkId || typeof chunk.chunkId !== 'string') {
    throw new Error('RoomChunkTemplate missing chunkId.');
  }
  if (chunk.widthTiles < KINEMATIC_ENVELOPE.MIN_ROOM_WIDTH_TILES) {
    throw new Error(`Chunk ${chunk.chunkId} widthTiles < 40`);
  }
  if (chunk.heightTiles < KINEMATIC_ENVELOPE.MIN_ROOM_HEIGHT_TILES) {
    throw new Error(`Chunk ${chunk.chunkId} heightTiles < 30`);
  }
  if (!Array.isArray(chunk.doorSockets) || chunk.doorSockets.length === 0) {
    throw new Error(`Chunk ${chunk.chunkId} must declare at least 1 DoorSocket.`);
  }

  for (const sock of chunk.doorSockets) {
    if (sock.apertureTiles !== KINEMATIC_ENVELOPE.DOOR_APERTURE_TILES) {
      throw new Error(`Chunk ${chunk.chunkId} socket ${sock.socketId} apertureTiles !== 4.`);
    }
    if (sock.requiredRune !== null && !VALID_RUNES.has(sock.requiredRune)) {
      throw new Error(`Chunk ${chunk.chunkId} socket ${sock.socketId} invalid requiredRune.`);
    }
    if (sock.direction === 'WEST' && sock.tileX !== 0) {
      throw new Error(`Chunk ${chunk.chunkId} WEST socket ${sock.socketId} tileX !== 0.`);
    }
    if (sock.direction === 'EAST' && sock.tileX !== chunk.widthTiles - 1) {
      throw new Error(`Chunk ${chunk.chunkId} EAST socket ${sock.socketId} tileX !== width-1.`);
    }
    if (sock.direction === 'NORTH' && sock.tileY !== 0) {
      throw new Error(`Chunk ${chunk.chunkId} NORTH socket ${sock.socketId} tileY !== 0.`);
    }
    if (sock.direction === 'SOUTH' && sock.tileY !== chunk.heightTiles - 1) {
      throw new Error(`Chunk ${chunk.chunkId} SOUTH socket ${sock.socketId} tileY !== height-1.`);
    }
  }
  return chunk;
}

/**
 * 运动学包络核验：验证房间内部所有无符文支撑面与无符文门锚点构成连通跳跃图
 * （相邻可达台阶垂直高差 <= DOUBLE_JUMP_SAFE_PX 96px，水平净距 <= HORIZONTAL_GAP_SAFE_PX 144px）。
 */
export function verifyChunkInternalReachability(chunk: RoomChunkTemplate): {
  readonly ok: boolean;
  readonly reason?: string;
} {
  interface DeckSpan {
    readonly x0: number;
    readonly x1: number;
    readonly yPx: number;
  }

  const decks: DeckSpan[] = [];
  for (const r of chunk.solidRects) {
    if (r.tileY >= 3) {
      decks.push({
        x0: r.tileX * TILE_SIZE_PX,
        x1: (r.tileX + r.widthTiles) * TILE_SIZE_PX,
        yPx: r.tileY * TILE_SIZE_PX,
      });
    }
  }
  for (const p of chunk.oneWayPlatforms) {
    decks.push({
      x0: p.tileX * TILE_SIZE_PX,
      x1: (p.tileX + p.widthTiles) * TILE_SIZE_PX,
      yPx: p.tileY * TILE_SIZE_PX,
    });
  }

  const ungatedSockets = chunk.doorSockets.filter((s) => s.requiredRune === null);
  for (const s of ungatedSockets) {
    const targetY =
      s.direction === 'NORTH'
        ? 4 * TILE_SIZE_PX
        : s.direction === 'SOUTH'
          ? (chunk.heightTiles - 3) * TILE_SIZE_PX
          : (s.tileY + 1) * TILE_SIZE_PX;
    const sxPx = s.tileX * TILE_SIZE_PX;
    const hasSupportNearSocket = decks.some(
      (d) =>
        Math.abs(d.yPx - targetY) <= KINEMATIC_ENVELOPE.DOUBLE_JUMP_SAFE_PX &&
        sxPx + 64 >= d.x0 - KINEMATIC_ENVELOPE.HORIZONTAL_GAP_SAFE_PX &&
        sxPx <= d.x1 + KINEMATIC_ENVELOPE.HORIZONTAL_GAP_SAFE_PX
    );
    if (!hasSupportNearSocket) {
      return {
        ok: false,
        reason: `Chunk ${chunk.chunkId} ungated socket ${s.socketId} lacks reachable deck near y=${targetY}px`,
      };
    }
  }
  return { ok: true };
}
