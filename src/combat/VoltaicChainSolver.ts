/**
 * 星盘电弧法杖 ±35° 锥角首目标索敌与最多 4 目标链式弹射几何求解器
 * （src/combat/VoltaicChainSolver.ts）。
 *
 * 严格零 GC：复用传入数组与定长访问槽，热路径零临时 Set/Map 分配。
 */

import { COMBAT_CONSTANTS } from '../data/weapons.data';
import type {
  CombatTargetView,
  ResolvedWeaponHit,
  VoltaicChainSegment,
} from './CombatTypes';

export function solveVoltaicArcPulse(
  originX: number,
  originY: number,
  facing: -1 | 1,
  targets: readonly CombatTargetView[],
  scratchVisitedIds: string[],
  outHits: ResolvedWeaponHit[],
  outSegments: VoltaicChainSegment[]
): readonly ResolvedWeaponHit[] {
  outHits.length = 0;
  outSegments.length = 0;

  const maxCos = Math.cos((COMBAT_CONSTANTS.ARC_STAFF_HALF_CONE_DEG * Math.PI) / 180);
  let primary: CombatTargetView | null = null;
  let bestDist: number = COMBAT_CONSTANTS.ARC_STAFF_RANGE_PX;

  for (let i = 0; i < targets.length; i++) {
    const t = targets[i]!;
    if (!t.isAlive) continue;
    const dx = t.x - originX;
    const dy = t.y - t.height * 0.5 - originY;
    const dist = Math.hypot(dx, dy);
    if (dist <= 1e-3 || dist > bestDist) continue;
    const cosAngle = (dx * facing) / dist;
    if (cosAngle >= maxCos || dist <= 28) {
      bestDist = dist;
      primary = t;
    }
  }

  if (!primary) return outHits;

  let visitedCount = 0;
  let prevX = originX;
  let prevY = originY;
  let current: CombatTargetView | null = primary;

  for (
    let bounce = 0;
    bounce < COMBAT_CONSTANTS.ARC_STAFF_MAX_CHAIN_TARGETS && current !== null;
    bounce++
  ) {
    scratchVisitedIds[visitedCount] = current.id;
    visitedCount += 1;

    const cy = current.y - current.height * 0.5;
    outSegments.push({ x0: prevX, y0: prevY, x1: current.x, y1: cy, bounceIndex: bounce });
    outHits.push({
      weaponId: 'wpn_voltaic_arc_staff',
      stageIndex: 0,
      targetId: current.id,
      impactX: current.x,
      impactY: cy,
      blockedByFrontShield: false,
      bypassFrontShield: true,
      chainBounceIndex: bounce,
      forceParryCrit: false,
    });

    prevX = current.x;
    prevY = cy;
    let nextCandidate: CombatTargetView | null = null;
    let nextDist: number = COMBAT_CONSTANTS.ARC_STAFF_CHAIN_RADIUS_PX;

    for (let j = 0; j < targets.length; j++) {
      const cand = targets[j]!;
      if (!cand.isAlive) continue;
      let already = false;
      for (let k = 0; k < visitedCount; k++) {
        if (scratchVisitedIds[k] === cand.id) {
          already = true;
          break;
        }
      }
      if (already) continue;
      const d = Math.hypot(cand.x - prevX, cand.y - cand.height * 0.5 - prevY);
      if (d <= nextDist) {
        nextDist = d;
        nextCandidate = cand;
      }
    }
    current = nextCandidate;
  }

  return outHits;
}
