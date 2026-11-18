/**
 * DoorSocket 像素级世界坐标对齐、走廊过渡桥接与碰撞无重叠求解器
 * （src/world/DoorSocketStitcher.ts）。
 *
 * 严格遵循单向依赖铁律：零 Phaser / UI / Entities 依赖，支持无头 500 种子高速单测。
 */

import { TILE_SIZE_PX } from '../core/Constants';
import type { RuneId } from '../data/runes.data';
import type { DoorDirection, DoorSocketSpec, RoomChunkTemplate } from './RoomChunkSchema';

export { bakeStitchedWorldGeometry } from './StitchedWorldBaker';

export interface PlacedRoomNode {
  readonly nodeId: string;
  readonly chunk: RoomChunkTemplate;
  readonly worldTileX: number;
  readonly worldTileY: number;
  readonly parentNodeId: string | null;
  readonly isMainSpine: boolean;
}

export interface StitchedCorridorBridge {
  readonly bridgeId: string;
  readonly fromNodeId: string;
  readonly toNodeId: string;
  readonly fromSocketId: string;
  readonly toSocketId: string;
  readonly direction: DoorDirection;
  readonly lengthTiles: number;
  readonly worldTileX: number;
  readonly worldTileY: number;
  readonly widthTiles: number;
  readonly heightTiles: number;
  readonly parentDoorFloorY: number;
  readonly childDoorFloorY: number;
  readonly bridgeFloorY: number;
  readonly shaftLeftWorldX: number;
  readonly requiredRune: RuneId | null;
  readonly checkpointWorldX: number;
  readonly checkpointWorldY: number;
}

export interface BakedBreakableFloor {
  readonly id: string;
  readonly nodeId: string;
  readonly worldTileX: number;
  readonly worldTileY: number;
  readonly widthTiles: number;
  readonly rectPx: { readonly x: number; readonly y: number; readonly w: number; readonly h: number };
  shattered: boolean;
}

export interface BakedStitchedWorld {
  readonly solidRects: { readonly x: number; readonly y: number; readonly w: number; readonly h: number }[];
  readonly oneWayPlatforms: { readonly x: number; readonly y: number; readonly w: number }[];
  readonly climbableWalls: {
    readonly x: number;
    readonly topY: number;
    readonly bottomY: number;
    readonly normalX: -1 | 1;
  }[];
  readonly breakableFloors: BakedBreakableFloor[];
  readonly solidTileKeys: ReadonlySet<number>;
  readonly backWallTileKeys: ReadonlySet<number>;
  readonly worldBoundsPx: {
    readonly minX: number;
    readonly minY: number;
    readonly maxX: number;
    readonly maxY: number;
  };
}

export const OPPOSITE_DOOR_DIR: Readonly<Record<DoorDirection, DoorDirection>> = {
  WEST: 'EAST',
  EAST: 'WEST',
  NORTH: 'SOUTH',
  SOUTH: 'NORTH',
};

const KEY_OFFSET = 16384;
const KEY_STRIDE = 32768;

export function packWorldTileKey(tx: number, ty: number): number {
  return (tx + KEY_OFFSET) * KEY_STRIDE + (ty + KEY_OFFSET);
}

export function unpackWorldTileKey(key: number): { readonly tx: number; readonly ty: number } {
  const shiftedX = Math.floor(key / KEY_STRIDE);
  const shiftedY = key - shiftedX * KEY_STRIDE;
  return { tx: shiftedX - KEY_OFFSET, ty: shiftedY - KEY_OFFSET };
}

export function solveSocketAlignment(
  parent: PlacedRoomNode,
  parentSocket: DoorSocketSpec,
  childChunk: RoomChunkTemplate,
  childSocket: DoorSocketSpec,
  bridgeTiles: number
): { readonly worldTileX: number; readonly worldTileY: number } {
  switch (parentSocket.direction) {
    case 'EAST':
      return {
        worldTileX: parent.worldTileX + parent.chunk.widthTiles + bridgeTiles,
        worldTileY: parent.worldTileY + parentSocket.tileY - childSocket.tileY,
      };
    case 'WEST':
      return {
        worldTileX: parent.worldTileX - bridgeTiles - childChunk.widthTiles,
        worldTileY: parent.worldTileY + parentSocket.tileY - childSocket.tileY,
      };
    case 'SOUTH':
      return {
        worldTileX: parent.worldTileX + parentSocket.tileX - childSocket.tileX,
        worldTileY: parent.worldTileY + parent.chunk.heightTiles + bridgeTiles,
      };
    case 'NORTH':
      return {
        worldTileX: parent.worldTileX + parentSocket.tileX - childSocket.tileX,
        worldTileY: parent.worldTileY - bridgeTiles - childChunk.heightTiles,
      };
  }
}

export function buildCorridorBridge(
  bridgeId: string,
  parent: PlacedRoomNode,
  outSocket: DoorSocketSpec,
  child: PlacedRoomNode,
  inSocket: DoorSocketSpec,
  bridgeTiles: number
): StitchedCorridorBridge {
  const dir = outSocket.direction;
  if (dir === 'EAST' || dir === 'WEST') {
    const bx =
      dir === 'EAST'
        ? parent.worldTileX + parent.chunk.widthTiles
        : child.worldTileX + child.chunk.widthTiles;
    const sockWorldY = parent.worldTileY + outSocket.tileY;
    const parentFloorY = (parent.worldTileY + outSocket.tileY + 1) * TILE_SIZE_PX;
    const childFloorY = (child.worldTileY + inSocket.tileY + 1) * TILE_SIZE_PX;
    return {
      bridgeId,
      fromNodeId: parent.nodeId,
      toNodeId: child.nodeId,
      fromSocketId: outSocket.socketId,
      toSocketId: inSocket.socketId,
      direction: dir,
      lengthTiles: bridgeTiles,
      worldTileX: bx,
      worldTileY: sockWorldY - 6,
      widthTiles: bridgeTiles,
      heightTiles: 10,
      parentDoorFloorY: parentFloorY,
      childDoorFloorY: childFloorY,
      bridgeFloorY: parentFloorY,
      shaftLeftWorldX: bx * TILE_SIZE_PX,
      requiredRune: outSocket.requiredRune ?? inSocket.requiredRune,
      checkpointWorldX: (bx + bridgeTiles * 0.5) * TILE_SIZE_PX,
      checkpointWorldY: parentFloorY,
    };
  }
  const by =
    dir === 'SOUTH'
      ? parent.worldTileY + parent.chunk.heightTiles
      : child.worldTileY + child.chunk.heightTiles;
  const shaftTileX = parent.worldTileX + outSocket.tileX;
  return {
    bridgeId,
    fromNodeId: parent.nodeId,
    toNodeId: child.nodeId,
    fromSocketId: outSocket.socketId,
    toSocketId: inSocket.socketId,
    direction: dir,
    lengthTiles: bridgeTiles,
    worldTileX: shaftTileX - 3,
    worldTileY: by,
    widthTiles: 10,
    heightTiles: bridgeTiles,
    parentDoorFloorY: (parent.worldTileY + outSocket.tileY) * TILE_SIZE_PX,
    childDoorFloorY: (child.worldTileY + inSocket.tileY) * TILE_SIZE_PX,
    bridgeFloorY: (by + bridgeTiles) * TILE_SIZE_PX,
    shaftLeftWorldX: shaftTileX * TILE_SIZE_PX,
    requiredRune: outSocket.requiredRune ?? inSocket.requiredRune,
    checkpointWorldX: (shaftTileX + 2) * TILE_SIZE_PX,
    checkpointWorldY: (by + bridgeTiles * 0.5) * TILE_SIZE_PX,
  };
}

interface TileBox {
  readonly worldTileX: number;
  readonly worldTileY: number;
  readonly widthTiles: number;
  readonly heightTiles: number;
}

function boxesOverlap(a: TileBox, b: TileBox, pad: number): boolean {
  return !(
    a.worldTileX + a.widthTiles + pad <= b.worldTileX ||
    b.worldTileX + b.widthTiles + pad <= a.worldTileX ||
    a.worldTileY + a.heightTiles + pad <= b.worldTileY ||
    b.worldTileY + b.heightTiles + pad <= a.worldTileY
  );
}

export function hasPlacementCollision(
  candRoom: PlacedRoomNode,
  candBridge: StitchedCorridorBridge,
  placedRooms: readonly PlacedRoomNode[],
  placedBridges: readonly StitchedCorridorBridge[],
  paddingTiles = 2
): boolean {
  const cBox: TileBox = {
    worldTileX: candRoom.worldTileX,
    worldTileY: candRoom.worldTileY,
    widthTiles: candRoom.chunk.widthTiles,
    heightTiles: candRoom.chunk.heightTiles,
  };
  for (const r of placedRooms) {
    const rBox: TileBox = {
      worldTileX: r.worldTileX,
      worldTileY: r.worldTileY,
      widthTiles: r.chunk.widthTiles,
      heightTiles: r.chunk.heightTiles,
    };
    if (boxesOverlap(cBox, rBox, paddingTiles)) return true;
    if (r.nodeId !== candBridge.fromNodeId && boxesOverlap(candBridge, rBox, 1)) return true;
  }
  for (const b of placedBridges) {
    if (boxesOverlap(cBox, b, 1) || boxesOverlap(candBridge, b, 1)) return true;
  }
  return false;
}
