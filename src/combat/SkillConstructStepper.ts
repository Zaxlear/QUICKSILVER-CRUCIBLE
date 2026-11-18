/**
 * 地面元素反应区、发条锯刃捕兽夹与黄铜特斯拉哨塔（含 ≤140px 高压蓝色电弧绊线）
 * 池化实体结构与 120Hz 物理步进器（src/combat/SkillConstructStepper.ts）。
 */

import type { TypedEventBus } from '../core/EventBus';
import type { IPoolable, ObjectPool } from '../core/ObjectPool';
import { SKILL_CONSTANTS } from '../data/skills.data';
import type { CombatTargetView } from './CombatTypes';
import type { StatusEffectMachine } from './StatusEffectMachine';

export type HazardZoneKind =
  | 'VIOLET_NAPALM_POOL'
  | 'VITRIOL_ACID_FIRE_POOL'
  | 'TOXIC_MIST_CLOUD'
  | 'VIOLET_NAPALM_TRAIL';

export class PooledHazardZone implements IPoolable {
  public kind: HazardZoneKind = 'VIOLET_NAPALM_POOL';
  public x = 0;
  public y = 0;
  public radiusPx = 64;
  public remainingSec = 0;
  public tickAccumSec = 0;
  public statScale = 1.0;

  public reset(): void {
    this.remainingSec = 0;
    this.tickAccumSec = 0;
  }
}

export class PooledSawTrap implements IPoolable {
  public x = 0;
  public y = 0;
  public remainingSec = 0;
  public statScale = 1.0;
  public snappedTargetId = '';
  public bleedTickAccumSec = 0;
  public affixIds: readonly string[] = [];

  public reset(): void {
    this.remainingSec = 0;
    this.snappedTargetId = '';
    this.bleedTickAccumSec = 0;
    this.affixIds = [];
  }
}

export interface ActiveTeslaTurretState {
  active: boolean;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  remainingSec: number;
  fireAccumSec: number;
  tetherTickAccumSec: number;
  tetherLinkedToPlayer: boolean;
  statScale: number;
  affixIds: readonly string[];
}

export interface SkillRuntimeDamageHit {
  readonly targetId: string;
  readonly amount: number;
  readonly isCrit: boolean;
  readonly worldX: number;
  readonly worldY: number;
}

function pointToSegmentDist(px: number, py: number, x0: number, y0: number, x1: number, y1: number): number {
  const vx = x1 - x0;
  const vy = y1 - y0;
  const lenSq = vx * vx + vy * vy;
  if (lenSq <= 1e-4) return Math.hypot(px - x0, py - y0);
  const t = Math.max(0, Math.min(1, ((px - x0) * vx + (py - y0) * vy) / lenSq));
  return Math.hypot(px - (x0 + t * vx), py - (y0 + t * vy));
}

export function stepHazardZonesAndTraps(
  dtSec: number,
  hazardZones: ObjectPool<PooledHazardZone>,
  sawTraps: ObjectPool<PooledSawTrap>,
  activeTrapOrder: PooledSawTrap[],
  targets: readonly CombatTargetView[],
  statusMachine: StatusEffectMachine,
  bus: TypedEventBus,
  outHits: SkillRuntimeDamageHit[]
): void {
  hazardZones.forEachActive((z) => {
    z.remainingSec -= dtSec;
    if (z.remainingSec <= 0) {
      hazardZones.release(z);
      return;
    }
    z.tickAccumSec += dtSec;
    if (z.tickAccumSec < 0.5) return;
    z.tickAccumSec -= 0.5;
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i]!;
      if (!t.isAlive || Math.abs(t.x - z.x) > z.radiusPx || Math.abs(t.y - z.y) > 48) continue;
      if (z.kind === 'TOXIC_MIST_CLOUD') {
        statusMachine.apply(t.id, 'poisoned', 1, z.statScale, { worldX: t.x, worldY: t.y - 18 });
      } else if (z.kind === 'VITRIOL_ACID_FIRE_POOL') {
        statusMachine.apply(t.id, 'ignited', 1, z.statScale, { worldX: t.x, worldY: t.y - 18 });
      } else {
        statusMachine.apply(t.id, 'oiled', 1, z.statScale, { worldX: t.x, worldY: t.y - 18 });
        statusMachine.apply(t.id, 'ignited', 1, z.statScale, { worldX: t.x, worldY: t.y - 18 });
      }
    }
  });

  for (let idx = activeTrapOrder.length - 1; idx >= 0; idx--) {
    const tr = activeTrapOrder[idx]!;
    tr.remainingSec -= dtSec;
    if (tr.remainingSec <= 0) {
      bus.emit('combat:skill_expired', {
        skillId: 'skl_clockwork_saw_trap',
        worldX: tr.x,
        worldY: tr.y,
        affixIds: tr.affixIds,
        statScale: tr.statScale,
        baseDamage: 35,
      });
      activeTrapOrder.splice(idx, 1);
      sawTraps.release(tr);
      continue;
    }
    if (!tr.snappedTargetId) {
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i]!;
        if (t.isAlive && Math.abs(t.x - tr.x) <= 24 && Math.abs(t.y - tr.y) <= 28) {
          tr.snappedTargetId = t.id;
          const rootDur = t.isBoss ? 1.6 : SKILL_CONSTANTS.SAW_TRAP_ROOT_SEC;
          tr.remainingSec = Math.min(tr.remainingSec, rootDur);
          statusMachine.applyRoot(t.id, rootDur);
          outHits.push({
            targetId: t.id,
            amount: Math.max(1, Math.round(35 * tr.statScale)),
            isCrit: false,
            worldX: t.x,
            worldY: t.y - 14,
          });
          break;
        }
      }
    } else {
      tr.bleedTickAccumSec += dtSec;
      if (tr.bleedTickAccumSec >= SKILL_CONSTANTS.SAW_TRAP_BLEED_INTERVAL_SEC) {
        tr.bleedTickAccumSec -= SKILL_CONSTANTS.SAW_TRAP_BLEED_INTERVAL_SEC;
        statusMachine.apply(tr.snappedTargetId, 'bleeding', 1, tr.statScale, {
          worldX: tr.x,
          worldY: tr.y - 14,
        });
      }
    }
  }
}

export function stepTeslaTurretAndTether(
  dtSec: number,
  turret: ActiveTeslaTurretState,
  px: number,
  py: number,
  targets: readonly CombatTargetView[],
  statusMachine: StatusEffectMachine,
  onExpire: () => void,
  outHits: SkillRuntimeDamageHit[],
  outArcs: Array<{ x0: number; y0: number; x1: number; y1: number }>
): void {
  turret.remainingSec -= dtSec;
  if (turret.remainingSec <= 0 || turret.hp <= 0) {
    onExpire();
    return;
  }

  const distToPlayer = Math.hypot(px - turret.x, py - (turret.y - 16));
  turret.tetherLinkedToPlayer = distToPlayer <= SKILL_CONSTANTS.TESLA_TURRET_TETHER_MAX_DIST_PX;

  const rateMult = turret.tetherLinkedToPlayer
    ? 1 + SKILL_CONSTANTS.TESLA_TURRET_TETHER_FIRE_RATE_BONUS
    : 1.0;
  const fireInterval = SKILL_CONSTANTS.TESLA_TURRET_BASE_INTERVAL_SEC / rateMult;
  turret.fireAccumSec += dtSec;
  if (turret.fireAccumSec >= fireInterval) {
    turret.fireAccumSec -= fireInterval;
    let best: CombatTargetView | null = null;
    let bestD: number = SKILL_CONSTANTS.TESLA_TURRET_RANGE_PX;
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i]!;
      if (!t.isAlive) continue;
      const d = Math.hypot(t.x - turret.x, t.y - t.height * 0.5 - (turret.y - 16));
      if (d <= bestD) {
        bestD = d;
        best = t;
      }
    }
    if (best) {
      const cy = best.y - best.height * 0.5;
      statusMachine.apply(best.id, 'electrified', 1, turret.statScale, { worldX: best.x, worldY: cy });
      outArcs.push({ x0: turret.x, y0: turret.y - 18, x1: best.x, y1: cy });
      outHits.push({
        targetId: best.id,
        amount: Math.max(1, Math.round(26 * turret.statScale)),
        isCrit: false,
        worldX: best.x,
        worldY: cy,
      });
    }
  }

  if (turret.tetherLinkedToPlayer) {
    turret.tetherTickAccumSec += dtSec;
    if (turret.tetherTickAccumSec >= 0.25) {
      turret.tetherTickAccumSec -= 0.25;
      const tetherDmg = Math.max(
        1,
        Math.round(SKILL_CONSTANTS.TESLA_TURRET_TETHER_DPS * 0.25 * turret.statScale)
      );
      for (let i = 0; i < targets.length; i++) {
        const t = targets[i]!;
        if (!t.isAlive) continue;
        const segDist = pointToSegmentDist(t.x, t.y - t.height * 0.5, px, py, turret.x, turret.y - 18);
        if (segDist <= t.width * 0.5 + 10) {
          statusMachine.apply(t.id, 'electrified', 1, turret.statScale, { worldX: t.x, worldY: t.y - 16 });
          outHits.push({ targetId: t.id, amount: tetherDmg, isCrit: true, worldX: t.x, worldY: t.y - 16 });
        }
      }
    }
  }
}
