/**
 * 拼接后 DAG 世界气密碰撞体、走廊顶底板与单向井道烘焙器（src/world/StitchedWorldBaker.ts）。
 *
 * 核心保障：
 * 1. 已连接 DoorSocket 自动贯通 4 格通道，未连接 DoorSocket 自动封堵 3 格厚实心墙；
 * 2. 水平走廊地板与左右房间门脚底瓦片合并为连续无接缝 SolidRectPx（0px 台阶误差）；
 * 3. 裂纹矿渣地板独立导出为可实时击碎的 BakedBreakableFloor 实例。
 */

import { TILE_SIZE_PX } from '../core/Constants';
import {
  packWorldTileKey,
  unpackWorldTileKey,
  type BakedBreakableFloor,
  type BakedStitchedWorld,
  type PlacedRoomNode,
  type StitchedCorridorBridge,
} from './DoorSocketStitcher';

function stampBox(set: Set<number>, x0: number, y0: number, w: number, h: number, add: boolean): void {
  for (let ty = y0; ty < y0 + h; ty++) {
    for (let tx = x0; tx < x0 + w; tx++) {
      const k = packWorldTileKey(tx, ty);
      if (add) set.add(k);
      else set.delete(k);
    }
  }
}

function mergeTilesIntoSolidRects(
  tileSet: ReadonlySet<number>,
  excludedTiles: ReadonlySet<number>
): { readonly x: number; readonly y: number; readonly w: number; readonly h: number }[] {
  const rows = new Map<number, number[]>();
  for (const key of tileSet) {
    if (excludedTiles.has(key)) continue;
    const { tx, ty } = unpackWorldTileKey(key);
    const list = rows.get(ty);
    if (list) list.push(tx);
    else rows.set(ty, [tx]);
  }

  const sortedY = Array.from(rows.keys()).sort((a, b) => a - b);
  const active = new Map<string, { x: number; y: number; w: number; h: number }>();
  const finished: { readonly x: number; readonly y: number; readonly w: number; readonly h: number }[] = [];
  const flushSpan = (s: { x: number; y: number; w: number; h: number }): void => {
    finished.push({
      x: s.x * TILE_SIZE_PX,
      y: s.y * TILE_SIZE_PX,
      w: s.w * TILE_SIZE_PX,
      h: s.h * TILE_SIZE_PX,
    });
  };

  for (const ty of sortedY) {
    const xs = rows.get(ty)!.sort((a, b) => a - b);
    const next = new Map<string, { x: number; y: number; w: number; h: number }>();
    for (let i = 0; i < xs.length; ) {
      const startX = xs[i]!;
      let endX = startX;
      while (i + 1 < xs.length && xs[i + 1] === endX + 1) {
        endX += 1;
        i += 1;
      }
      i += 1;
      const w = endX - startX + 1;
      const sk = `${startX}:${w}`;
      const prev = active.get(sk);
      if (prev && prev.y + prev.h === ty) {
        prev.h += 1;
        next.set(sk, prev);
        active.delete(sk);
      } else {
        next.set(sk, { x: startX, y: ty, w, h: 1 });
      }
    }
    for (const ended of active.values()) flushSpan(ended);
    active.clear();
    for (const [k, v] of next) active.set(k, v);
  }
  for (const ended of active.values()) flushSpan(ended);
  return finished;
}

export function bakeStitchedWorldGeometry(
  nodes: readonly PlacedRoomNode[],
  bridges: readonly StitchedCorridorBridge[]
): BakedStitchedWorld {
  const solidTiles = new Set<number>();
  const backWallTiles = new Set<number>();
  const breakableTileMask = new Set<number>();
  const oneWayPlatforms: { readonly x: number; readonly y: number; readonly w: number }[] = [];
  const climbableWalls: BakedStitchedWorld['climbableWalls'] = [];
  const breakableFloors: BakedBreakableFloor[] = [];

  const connSet = new Set<string>();
  for (const b of bridges) {
    connSet.add(`${b.fromNodeId}::${b.fromSocketId}`);
    connSet.add(`${b.toNodeId}::${b.toSocketId}`);
  }

  let minTileX = Infinity;
  let minTileY = Infinity;
  let maxTileX = -Infinity;
  let maxTileY = -Infinity;

  for (const node of nodes) {
    const { worldTileX: rx, worldTileY: ry, chunk } = node;
    const { widthTiles: rw, heightTiles: rh } = chunk;
    minTileX = Math.min(minTileX, rx);
    minTileY = Math.min(minTileY, ry);
    maxTileX = Math.max(maxTileX, rx + rw);
    maxTileY = Math.max(maxTileY, ry + rh);

    for (const sr of chunk.solidRects) {
      stampBox(solidTiles, rx + sr.tileX, ry + sr.tileY, sr.widthTiles, sr.heightTiles, true);
    }
    stampBox(backWallTiles, rx + Math.floor(rw * 0.5) - 4, ry + rh - 9, 8, 5, true);

    for (const sock of chunk.doorSockets) {
      const isConn = connSet.has(`${node.nodeId}::${sock.socketId}`);
      if (sock.direction === 'WEST' || sock.direction === 'EAST') {
        const wallX = sock.direction === 'WEST' ? rx : rx + rw - 3;
        stampBox(solidTiles, wallX, ry + sock.tileY - 3, 3, 4, !isConn);
        if (isConn) stampBox(solidTiles, wallX, ry + sock.tileY + 1, 3, 3, true);
      } else if (sock.direction === 'NORTH') {
        stampBox(solidTiles, rx + sock.tileX, ry, 4, 3, !isConn);
      } else {
        stampBox(solidTiles, rx + sock.tileX, ry + rh - 4, 4, 4, !isConn);
        if (isConn) {
          oneWayPlatforms.push({
            x: (rx + sock.tileX) * TILE_SIZE_PX,
            y: (ry + rh - 4) * TILE_SIZE_PX,
            w: 4 * TILE_SIZE_PX,
          });
        }
      }
    }

    for (const ow of chunk.oneWayPlatforms) {
      oneWayPlatforms.push({
        x: (rx + ow.tileX) * TILE_SIZE_PX,
        y: (ry + ow.tileY) * TILE_SIZE_PX,
        w: ow.widthTiles * TILE_SIZE_PX,
      });
    }
    for (const cw of chunk.climbableWalls) {
      climbableWalls.push({
        x: (rx + cw.tileX) * TILE_SIZE_PX,
        topY: (ry + cw.topTileY) * TILE_SIZE_PX,
        bottomY: (ry + cw.topTileY + cw.heightTiles) * TILE_SIZE_PX,
        normalX: cw.normalSide === 'RIGHT' ? 1 : -1,
      });
    }

    chunk.breakableSlagFloors.forEach((bf, idx) => {
      const wx = rx + bf.tileX;
      const wy = ry + bf.tileY;
      stampBox(breakableTileMask, wx, wy, bf.widthTiles, 1, true);
      stampBox(solidTiles, wx, wy, bf.widthTiles, 1, false);
      const rectPx = {
        x: wx * TILE_SIZE_PX,
        y: wy * TILE_SIZE_PX,
        w: bf.widthTiles * TILE_SIZE_PX,
        h: TILE_SIZE_PX,
      };
      breakableFloors.push({
        id: `${node.nodeId}::bf_${idx}`,
        nodeId: node.nodeId,
        worldTileX: wx,
        worldTileY: wy,
        widthTiles: bf.widthTiles,
        rectPx,
        shattered: false,
      });
    });
  }

  for (const b of bridges) {
    if (b.direction === 'EAST' || b.direction === 'WEST') {
      const fy = Math.round(b.bridgeFloorY / TILE_SIZE_PX);
      stampBox(solidTiles, b.worldTileX, fy - 7, b.lengthTiles, 3, true);
      stampBox(solidTiles, b.worldTileX, fy, b.lengthTiles, 3, true);
      stampBox(backWallTiles, b.worldTileX, fy - 4, b.lengthTiles, 4, true);
    } else {
      const sx = Math.round(b.shaftLeftWorldX / TILE_SIZE_PX);
      stampBox(solidTiles, sx - 3, b.worldTileY, 3, b.lengthTiles, true);
      stampBox(solidTiles, sx + 4, b.worldTileY, 3, b.lengthTiles, true);
      stampBox(backWallTiles, sx, b.worldTileY, 4, b.lengthTiles, true);
      if (b.requiredRune === null) {
        for (let stepY = b.worldTileY + 3; stepY < b.worldTileY + b.lengthTiles; stepY += 3) {
          oneWayPlatforms.push({ x: sx * TILE_SIZE_PX, y: stepY * TILE_SIZE_PX, w: 4 * TILE_SIZE_PX });
        }
      }
    }
  }

  const solidRects = mergeTilesIntoSolidRects(solidTiles, breakableTileMask);
  for (const bf of breakableFloors) solidRects.push(bf.rectPx);

  return {
    solidRects,
    oneWayPlatforms,
    climbableWalls,
    breakableFloors,
    solidTileKeys: solidTiles,
    backWallTileKeys: backWallTiles,
    worldBoundsPx: {
      minX: minTileX * TILE_SIZE_PX,
      minY: minTileY * TILE_SIZE_PX,
      maxX: maxTileX * TILE_SIZE_PX,
      maxY: maxTileY * TILE_SIZE_PX,
    },
  };
}
