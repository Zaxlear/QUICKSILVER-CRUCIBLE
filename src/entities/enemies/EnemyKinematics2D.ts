/**
 * 地面怪物 120Hz 帧率无关纵向重力、Swept AABB 平台着陆、单向木桥下穿与高坠眩晕伤动力学引擎
 * （src/entities/enemies/EnemyKinematics2D.ts，严格 <= 205 行）。
 */

import type { SolidWallRect } from '../../combat/CombatTypes';
import type { EnemyOneWayRect } from './EnemyTypes';

export const ENEMY_KINEMATICS_CONSTANTS = {
  GRAVITY_PX_S2: 1380,
  TERMINAL_VY_PX_S: 560,
  FALL_DAMAGE_MIN_HEIGHT_PX: 112,
  FALL_DAMAGE_BASE_MAX_HP_RATIO: 0.18,
  FALL_IMPACT_STUN_MS: 800,
  ONEWAY_DROP_THROUGH_MS: 220,
  LEDGE_HOP_CROUCH_MS: 160,
  LEDGE_HOP_COOLDOWN_MS: 2200,
} as const;

export class EnemyKinematicsState {
  public vy = 0;
  public vxAir = 0;
  public grounded = true;
  public onOneWay = false;
  public dropThroughTimerMs = 0;
  public fallStartHeightY = 0;
  public hopWindupMs = 0;
  public hopCooldownMs = 0;
  public pendingHopVx = 0;
  public pendingHopVy = 0;
}

export interface KinematicsStepResult {
  x: number; y: number; landedNewSegment: boolean;
  fallDistancePx: number; fallDamageAmount: number;
  newSegMinX: number; newSegMaxX: number;
}

const kinematicsStepOut: KinematicsStepResult = {
  x: 0, y: 0, landedNewSegment: false, fallDistancePx: 0, fallDamageAmount: 0, newSegMinX: 0, newSegMaxX: 0,
};

/** 水平实心墙碰撞推进（允许走出高台边缘坠崖，但绝不穿透垂直砖墙） */
export function moveEnemyHorizontalWithWalls(
  x: number, y: number, dx: number, colliderWidth: number, colliderHeight: number, solidRects: readonly SolidWallRect[]
): number {
  if (Math.abs(dx) < 1e-5) return x;
  const halfW = colliderWidth * 0.5;
  const topY = y - colliderHeight + 5;
  const botY = y - 4;
  let nextX = x + dx;

  for (let i = 0; i < solidRects.length; i++) {
    const r = solidRects[i]!;
    if (r.y + r.h <= topY || r.y >= botY) continue;
    if (dx > 0 && x + halfW <= r.x + 1 && nextX + halfW > r.x) nextX = Math.min(nextX, r.x - halfW);
    else if (dx < 0 && x - halfW >= r.x + r.w - 1 && nextX - halfW < r.x + r.w) nextX = Math.max(nextX, r.x + r.w + halfW);
  }
  return nextX;
}

function findStandingSupport(
  x: number, y: number, halfW: number, allowOneWay: boolean,
  solidRects: readonly SolidWallRect[], oneWays: readonly EnemyOneWayRect[]
): { found: boolean; snapY: number; isOneWay: boolean } {
  const minFootX = x - halfW + 3;
  const maxFootX = x + halfW - 3;
  for (let i = 0; i < solidRects.length; i++) {
    const r = solidRects[i]!;
    if (maxFootX > r.x && minFootX < r.x + r.w && Math.abs(r.y - y) <= 3) return { found: true, snapY: r.y, isOneWay: false };
  }
  if (allowOneWay) {
    for (let i = 0; i < oneWays.length; i++) {
      const p = oneWays[i]!;
      if (maxFootX > p.x && minFootX < p.x + p.w && Math.abs(p.y - y) <= 3) return { found: true, snapY: p.y, isOneWay: true };
    }
  }
  return { found: false, snapY: y, isOneWay: false };
}

/** 在 120Hz 固定步长内推进地面怪物的纵向重力、起跳抛物线、单向木桥下穿与着陆高坠伤 */
export function stepEnemyKinematics2D(
  state: EnemyKinematicsState,
  params: {
    readonly dtSec: number; readonly x: number; readonly y: number;
    readonly colliderWidth: number; readonly colliderHeight: number; readonly maxHp: number;
    readonly solidRects: readonly SolidWallRect[]; readonly oneWayPlatforms: readonly EnemyOneWayRect[];
  }
): KinematicsStepResult {
  const { dtSec, colliderWidth, colliderHeight, maxHp, solidRects, oneWayPlatforms } = params;
  const dtMs = dtSec * 1000;
  const halfW = colliderWidth * 0.5;
  let curX = params.x;
  let curY = params.y;

  kinematicsStepOut.landedNewSegment = false;
  kinematicsStepOut.fallDistancePx = 0;
  kinematicsStepOut.fallDamageAmount = 0;
  kinematicsStepOut.newSegMinX = curX - 64;
  kinematicsStepOut.newSegMaxX = curX + 64;

  if (state.dropThroughTimerMs > 0) state.dropThroughTimerMs = Math.max(0, state.dropThroughTimerMs - dtMs);
  if (state.hopCooldownMs > 0) state.hopCooldownMs = Math.max(0, state.hopCooldownMs - dtMs);

  if (state.hopWindupMs > 0) {
    state.hopWindupMs = Math.max(0, state.hopWindupMs - dtMs);
    if (state.hopWindupMs <= 0) {
      state.vxAir = state.pendingHopVx;
      state.vy = state.pendingHopVy;
      state.grounded = false;
      state.onOneWay = false;
      state.fallStartHeightY = curY;
    }
  }

  if (solidRects.length === 0 && oneWayPlatforms.length === 0 && state.grounded && state.vy === 0) {
    kinematicsStepOut.x = curX; kinematicsStepOut.y = curY;
    return kinematicsStepOut;
  }

  const allowOneWay = state.dropThroughTimerMs <= 0;
  if (state.grounded && state.vy >= 0) {
    const sup = findStandingSupport(curX, curY, halfW, allowOneWay, solidRects, oneWayPlatforms);
    if (sup.found) {
      state.onOneWay = sup.isOneWay; state.vxAir = 0;
      kinematicsStepOut.x = curX; kinematicsStepOut.y = sup.snapY;
      return kinematicsStepOut;
    }
    state.grounded = false; state.onOneWay = false; state.fallStartHeightY = curY;
  }

  if (Math.abs(state.vxAir) > 0.5) {
    curX = moveEnemyHorizontalWithWalls(curX, curY, state.vxAir * dtSec, colliderWidth, colliderHeight, solidRects);
  }

  const prevY = curY;
  state.vy = Math.min(ENEMY_KINEMATICS_CONSTANTS.TERMINAL_VY_PX_S, state.vy + ENEMY_KINEMATICS_CONSTANTS.GRAVITY_PX_S2 * dtSec);
  const nextY = prevY + state.vy * dtSec;

  if (state.vy < 0) {
    const headNextY = nextY - colliderHeight;
    let clampedY = nextY;
    for (let i = 0; i < solidRects.length; i++) {
      const r = solidRects[i]!;
      if (curX + halfW - 3 > r.x && curX - halfW + 3 < r.x + r.w && prevY - colliderHeight >= r.y + r.h - 2 && headNextY < r.y + r.h) {
        clampedY = r.y + r.h + colliderHeight; state.vy = 0; break;
      }
    }
    state.fallStartHeightY = Math.min(state.fallStartHeightY, clampedY);
    kinematicsStepOut.x = curX; kinematicsStepOut.y = clampedY;
    return kinematicsStepOut;
  }

  let bestLandY = Infinity;
  let landedOneWay = false;
  let segMinX = curX - 80;
  let segMaxX = curX + 80;
  const minFootX = curX - halfW + 3;
  const maxFootX = curX + halfW - 3;

  for (let i = 0; i < solidRects.length; i++) {
    const r = solidRects[i]!;
    if (maxFootX > r.x && minFootX < r.x + r.w && prevY <= r.y + 4 && nextY >= r.y && r.y < bestLandY) {
      bestLandY = r.y; landedOneWay = false; segMinX = r.x + halfW; segMaxX = r.x + r.w - halfW;
    }
  }
  if (allowOneWay) {
    for (let i = 0; i < oneWayPlatforms.length; i++) {
      const p = oneWayPlatforms[i]!;
      if (maxFootX > p.x && minFootX < p.x + p.w && prevY <= p.y + 4 && nextY >= p.y && p.y < bestLandY) {
        bestLandY = p.y; landedOneWay = true; segMinX = p.x + halfW; segMaxX = p.x + p.w - halfW;
      }
    }
  }

  if (Number.isFinite(bestLandY)) {
    const fallDist = Math.max(0, bestLandY - state.fallStartHeightY);
    state.grounded = true; state.onOneWay = landedOneWay; state.vy = 0; state.vxAir = 0;
    kinematicsStepOut.x = curX; kinematicsStepOut.y = bestLandY;
    kinematicsStepOut.landedNewSegment = true; kinematicsStepOut.fallDistancePx = fallDist;
    kinematicsStepOut.newSegMinX = segMinX; kinematicsStepOut.newSegMaxX = Math.max(segMinX, segMaxX);
    if (fallDist >= ENEMY_KINEMATICS_CONSTANTS.FALL_DAMAGE_MIN_HEIGHT_PX) {
      kinematicsStepOut.fallDamageAmount = Math.max(1, Math.round(
        ENEMY_KINEMATICS_CONSTANTS.FALL_DAMAGE_BASE_MAX_HP_RATIO * maxHp * (fallDist / ENEMY_KINEMATICS_CONSTANTS.FALL_DAMAGE_MIN_HEIGHT_PX)
      ));
    }
    return kinematicsStepOut;
  }

  kinematicsStepOut.x = curX; kinematicsStepOut.y = nextY;
  return kinematicsStepOut;
}
