/**
 * 敌方视线射线遮挡检测（LOS）、听觉警戒半径、光学隐身脱战与跨平台瞬移落点解算器
 * （src/entities/enemies/PerceptionSensor.ts）。
 *
 * 严格遵循单向依赖与零 GC 铁律：纯几何数值运算，100% 支持无头 Vitest 单测。
 */

import { pointHitsIndexedRects } from '../../core/SpatialRectIndex';
import type { SolidWallRect } from '../../combat/CombatTypes';

export interface PerceptionQuery {
  readonly enemyX: number;
  readonly enemyY: number;
  readonly eyeHeightPx: number;
  readonly facing: -1 | 1;
  readonly losRadiusPx: number;
  readonly hearingRadiusPx: number;
  readonly ignoresWallLos: boolean;
  readonly alreadyAggroed: boolean;
}

export interface PerceptionResult {
  readonly detected: boolean;
  readonly dx: number;
  readonly dy: number;
  readonly distPx: number;
  readonly dirToPlayer: -1 | 1;
  readonly hasClearLos: boolean;
}

const RAY_STEP_PX = 12;

export function pointInsideAnySolid(x: number, y: number, solidRects: readonly SolidWallRect[]): boolean {
  return pointHitsIndexedRects(x, y, solidRects);
}

/**
 * 从怪物眼部向玩家躯干发射离散步进射线，检测是否被实心砖墙阻挡。
 */
export function hasLineOfSight(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  solidRects: readonly SolidWallRect[]
): boolean {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  if (dist <= RAY_STEP_PX) return true;

  const steps = Math.min(48, Math.ceil(dist / RAY_STEP_PX));
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    const sx = x0 + dx * t;
    const sy = y0 + dy * t;
    if (pointInsideAnySolid(sx, sy, solidRects)) {
      return false;
    }
  }
  return true;
}

/**
 * 综合评估怪物对玩家的视觉与听觉感知（兼容「水银光学拟态」近战击杀隐身脱战机制）。
 */
export function evaluateEnemyPerception(
  query: PerceptionQuery,
  playerX: number,
  playerY: number,
  playerStealthed: boolean,
  solidRects: readonly SolidWallRect[]
): PerceptionResult {
  const dx = playerX - query.enemyX;
  const dy = playerY - query.enemyY;
  const distPx = Math.hypot(dx, dy);
  const dirToPlayer: -1 | 1 = dx >= 0 ? 1 : -1;

  // 玩家处于 mut_predator_veil 光学隐身期间，非贴身碰撞（>28px）的普通/精英怪丢失锁定
  if (playerStealthed && distPx > 28) {
    return {
      detected: false,
      dx,
      dy,
      distPx,
      dirToPlayer,
      hasClearLos: false,
    };
  }

  const maxSense = Math.max(query.losRadiusPx, query.hearingRadiusPx);
  if (distPx > maxSense * (query.alreadyAggroed ? 1.25 : 1.0)) {
    return {
      detected: false,
      dx,
      dy,
      distPx,
      dirToPlayer,
      hasClearLos: false,
    };
  }

  const clearLos =
    query.ignoresWallLos ||
    hasLineOfSight(
      query.enemyX,
      query.enemyY - query.eyeHeightPx,
      playerX,
      playerY - 16,
      solidRects
    );

  // 1. 听觉球形感知（背后近身跑动同样惊醒）
  if (distPx <= query.hearingRadiusPx && (clearLos || Math.abs(dy) <= 48)) {
    return { detected: true, dx, dy, distPx, dirToPlayer, hasClearLos: clearLos };
  }

  // 2. 视觉锥体感知（已仇恨状态下保持 360° 追踪，未仇恨时需面朝玩家半平面）
  const facingPlayer = query.alreadyAggroed || dx * query.facing >= -14;
  const detected = facingPlayer && distPx <= query.losRadiusPx && clearLos;
  return { detected, dx, dy, distPx, dirToPlayer, hasClearLos: clearLos };
}

/**
 * 将地面巡逻/追击坐标钳制于平台安全包络内，防止普通怪无脑走出悬崖掉进酸池。
 */
export function clampGroundX(nextX: number, patrolMinX: number, patrolMaxX: number): number {
  if (patrolMaxX <= patrolMinX) return patrolMinX;
  return Math.min(patrolMaxX, Math.max(patrolMinX, nextX));
}

/**
 * 为「钟摆影刺客」与精英怪跨平台瞬移解算玩家背后的无碰撞安全落点。
 */
export function solveBehindPlayerTeleport(
  playerX: number,
  playerY: number,
  playerFacing: -1 | 1,
  behindOffsetPx: number,
  solidRects: readonly SolidWallRect[]
): { readonly x: number; readonly y: number; readonly facing: -1 | 1 } {
  const behindX = playerX - playerFacing * behindOffsetPx;
  const frontX = playerX + playerFacing * behindOffsetPx;

  if (!pointInsideAnySolid(behindX, playerY - 12, solidRects)) {
    return { x: behindX, y: playerY, facing: playerFacing };
  }
  if (!pointInsideAnySolid(frontX, playerY - 12, solidRects)) {
    return { x: frontX, y: playerY, facing: (-playerFacing) as -1 | 1 };
  }
  return { x: playerX, y: playerY, facing: playerFacing };
}
