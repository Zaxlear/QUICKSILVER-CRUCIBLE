/**
 * 地面怪物零 GC 巡逻悬崖/尖刺止步探针与仇恨态跨平台下穿/跃升弹道导航求解器
 * （src/entities/enemies/EnemyPlatformNavigator.ts，严格 <= 190 行）。
 */

import type { SolidWallRect } from '../../combat/CombatTypes';
import type { EnemyId } from '../../data/biomes.data';
import {
  ENEMY_KINEMATICS_CONSTANTS,
  moveEnemyHorizontalWithWalls,
  type EnemyKinematicsState,
} from './EnemyKinematics2D';
import type { EnemyHazardRect, EnemyOneWayRect, EnemyStepContext } from './EnemyTypes';
import { clampGroundX } from './PerceptionSensor';

export interface PatrolProbeResult {
  shouldTurn: boolean;
  nextFacing: -1 | 1;
  safeNextX: number;
}

export type VerticalPursuitAction = 'NONE' | 'DROP_THROUGH_ONEWAY' | 'WALK_OFF_LEDGE' | 'START_LEDGE_HOP';

export interface VerticalPursuitIntent {
  action: VerticalPursuitAction;
  hopVx: number;
  hopVy: number;
}

const patrolProbeOut: PatrolProbeResult = { shouldTurn: false, nextFacing: -1, safeNextX: 0 };
const pursuitIntentOut: VerticalPursuitIntent = { action: 'NONE', hopVx: 0, hopVy: 0 };
const EMPTY_ONEWAYS: readonly EnemyOneWayRect[] = [];
const EMPTY_HAZARDS: readonly EnemyHazardRect[] = [];

export function isAgileHopperSpecies(speciesId: EnemyId): boolean {
  return (
    speciesId === 'mob_02_frenzied_miner' ||
    speciesId === 'mob_08_clockwork_tick' ||
    speciesId === 'mob_11_mercury_stalker'
  );
}

function overlapsFloorHazard(x: number, y: number, hazards: readonly EnemyHazardRect[]): boolean {
  for (let i = 0; i < hazards.length; i++) {
    const h = hazards[i]!;
    if ((h.kind === 'SPIKE_BED' || h.kind === 'ACID_GEYSER') && x >= h.x - 8 && x <= h.x + h.w + 8 && Math.abs(y - h.y) <= 28) {
      return true;
    }
  }
  return false;
}

function hasSupportWithinRayDown(
  probeX: number, fromY: number, rayLenPx: number,
  solidRects: readonly SolidWallRect[], oneWays: readonly EnemyOneWayRect[]
): number | null {
  let bestY = Infinity;
  const maxY = fromY + rayLenPx;
  for (let i = 0; i < solidRects.length; i++) {
    const r = solidRects[i]!;
    if (probeX >= r.x && probeX <= r.x + r.w && r.y >= fromY - 3 && r.y <= maxY && r.y < bestY) bestY = r.y;
  }
  for (let i = 0; i < oneWays.length; i++) {
    const p = oneWays[i]!;
    if (probeX >= p.x && probeX <= p.x + p.w && p.y >= fromY - 3 && p.y <= maxY && p.y < bestY) bestY = p.y;
  }
  return Number.isFinite(bestY) ? bestY : null;
}

/** 巡逻态（!aggroed）悬崖与尖刺/酸池 20px 前探针 */
export function probeSafePatrolStep(params: {
  readonly x: number; readonly y: number; readonly facing: -1 | 1; readonly stepAbsPx: number;
  readonly colliderWidth: number; readonly colliderHeight: number;
  readonly patrolMinX: number; readonly patrolMaxX: number;
  readonly solidRects: readonly SolidWallRect[]; readonly oneWayPlatforms: readonly EnemyOneWayRect[];
  readonly hazardZones: readonly EnemyHazardRect[];
}): PatrolProbeResult {
  const { x, y, facing, stepAbsPx, colliderWidth, colliderHeight, patrolMinX, patrolMaxX, solidRects, oneWayPlatforms, hazardZones } = params;
  const rawNextX = x + facing * stepAbsPx;
  const turn = (sx: number): PatrolProbeResult => {
    patrolProbeOut.shouldTurn = true; patrolProbeOut.nextFacing = (-facing) as -1 | 1; patrolProbeOut.safeNextX = sx;
    return patrolProbeOut;
  };

  if (rawNextX <= patrolMinX + 2 || rawNextX >= patrolMaxX - 2) return turn(clampGroundX(rawNextX, patrolMinX, patrolMaxX));
  const wallCheckedX = moveEnemyHorizontalWithWalls(x, y, facing * stepAbsPx, colliderWidth, colliderHeight, solidRects);
  if (Math.abs(wallCheckedX - rawNextX) > 0.5) return turn(wallCheckedX);

  const probeX = x + facing * (colliderWidth * 0.5 + 8);
  if (overlapsFloorHazard(probeX, y, hazardZones)) return turn(x);
  if (solidRects.length > 0 || oneWayPlatforms.length > 0) {
    const floorAheadY = hasSupportWithinRayDown(probeX, y, 20, solidRects, oneWayPlatforms);
    if (floorAheadY === null || overlapsFloorHazard(probeX, floorAheadY, hazardZones)) return turn(x);
  }

  patrolProbeOut.shouldTurn = false; patrolProbeOut.nextFacing = facing; patrolProbeOut.safeNextX = wallCheckedX;
  return patrolProbeOut;
}

/** 仇恨态（aggroed）立体跨平台追击决策：单向木平台下穿、实心高台跳落、机动怪跃上高台 */
export function solveVerticalPursuitIntent(params: {
  readonly speciesId: EnemyId; readonly enemyX: number; readonly enemyY: number;
  readonly playerX: number; readonly playerY: number; readonly colliderWidth: number;
  readonly kinematics: EnemyKinematicsState;
  readonly solidRects: readonly SolidWallRect[]; readonly oneWayPlatforms: readonly EnemyOneWayRect[];
  readonly hazardZones: readonly EnemyHazardRect[];
}): VerticalPursuitIntent {
  pursuitIntentOut.action = 'NONE'; pursuitIntentOut.hopVx = 0; pursuitIntentOut.hopVy = 0;
  const { speciesId, enemyX, enemyY, playerX, playerY, colliderWidth, kinematics, solidRects, oneWayPlatforms, hazardZones } = params;
  if (!kinematics.grounded || kinematics.hopWindupMs > 0) return pursuitIntentOut;

  const dx = playerX - enemyX;
  const absDx = Math.abs(dx);
  const dyDown = playerY - enemyY;

  if (dyDown >= 32 && dyDown <= 176 && absDx <= 180) {
    if (kinematics.onOneWay) {
      const belowY = hasSupportWithinRayDown(enemyX, enemyY + 8, 192, solidRects, oneWayPlatforms);
      if (belowY !== null && !overlapsFloorHazard(enemyX, belowY, hazardZones)) {
        pursuitIntentOut.action = 'DROP_THROUGH_ONEWAY';
        return pursuitIntentOut;
      }
    } else {
      const dir: -1 | 1 = dx >= 0 ? 1 : -1;
      const edgeProbeX = enemyX + dir * (colliderWidth * 0.5 + 16);
      const lowerFloorY = hasSupportWithinRayDown(edgeProbeX, enemyY + 12, 192, solidRects, oneWayPlatforms);
      if (lowerFloorY !== null && !overlapsFloorHazard(edgeProbeX, lowerFloorY, hazardZones)) {
        pursuitIntentOut.action = 'WALK_OFF_LEDGE';
        return pursuitIntentOut;
      }
    }
  }

  const dH = enemyY - playerY;
  if (isAgileHopperSpecies(speciesId) && kinematics.hopCooldownMs <= 0 && dH >= 28 && dH <= 88 && absDx >= 8 && absDx <= 104) {
    const g = ENEMY_KINEMATICS_CONSTANTS.GRAVITY_PX_S2;
    const vy0 = -Math.sqrt(2 * g * (dH + 20));
    const tFlight = Math.max(0.16, -vy0 / g + Math.sqrt((2 * 20) / g));
    pursuitIntentOut.action = 'START_LEDGE_HOP';
    pursuitIntentOut.hopVy = vy0;
    pursuitIntentOut.hopVx = Math.max(-290, Math.min(290, dx / tFlight));
  }
  return pursuitIntentOut;
}

/** 供 BaseEnemy 统一调用的地面巡逻/追击/后退位移执行器（零 GC） */
export function executeGroundLocomotionStep(
  host: { speciesId: EnemyId; x: number; y: number; facing: -1 | 1; patrolMinX: number; patrolMaxX: number; kinematics: EnemyKinematicsState },
  colliderW: number, colliderH: number, ctx: EnemyStepContext, signedSpeedPxS: number, dtSec: number, isPatrol: boolean
): void {
  const oneWays = ctx.oneWayPlatforms ?? EMPTY_ONEWAYS;
  const hazards = ctx.hazardZones ?? EMPTY_HAZARDS;
  if (isPatrol) {
    const pr = probeSafePatrolStep({
      x: host.x, y: host.y, facing: host.facing, stepAbsPx: Math.abs(signedSpeedPxS) * dtSec,
      colliderWidth: colliderW, colliderHeight: colliderH, patrolMinX: host.patrolMinX, patrolMaxX: host.patrolMaxX,
      solidRects: ctx.solidRects, oneWayPlatforms: oneWays, hazardZones: hazards,
    });
    host.facing = pr.nextFacing;
    host.x = pr.safeNextX;
    return;
  }
  const intent = solveVerticalPursuitIntent({
    speciesId: host.speciesId, enemyX: host.x, enemyY: host.y, playerX: ctx.playerX, playerY: ctx.playerY,
    colliderWidth: colliderW, kinematics: host.kinematics, solidRects: ctx.solidRects, oneWayPlatforms: oneWays, hazardZones: hazards,
  });
  if (intent.action === 'START_LEDGE_HOP') {
    host.kinematics.hopWindupMs = ENEMY_KINEMATICS_CONSTANTS.LEDGE_HOP_CROUCH_MS;
    host.kinematics.hopCooldownMs = ENEMY_KINEMATICS_CONSTANTS.LEDGE_HOP_COOLDOWN_MS;
    host.kinematics.pendingHopVx = intent.hopVx;
    host.kinematics.pendingHopVy = intent.hopVy;
    return;
  }
  if (intent.action === 'DROP_THROUGH_ONEWAY') {
    host.kinematics.dropThroughTimerMs = ENEMY_KINEMATICS_CONSTANTS.ONEWAY_DROP_THROUGH_MS;
  }
  const wallX = moveEnemyHorizontalWithWalls(host.x, host.y, signedSpeedPxS * dtSec, colliderW, colliderH, ctx.solidRects);
  host.x = intent.action === 'WALK_OFF_LEDGE' ? wallX : clampGroundX(wallX, host.patrolMinX - 36, host.patrolMaxX + 36);
}
