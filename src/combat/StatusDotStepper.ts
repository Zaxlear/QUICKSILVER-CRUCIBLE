/**
 * 120Hz 元素异常状态衰减、DoT 跳伤与 ⑤ 电解超导（Electrolytic Surge）传导纯步进器
 * （src/combat/StatusDotStepper.ts）。
 */

import type { TypedEventBus } from '../core/EventBus';
import {
  CHEMICAL_REACTION_CONSTANTS,
  ELEMENT_STATUS_SPECS,
  type ElementStatusKey,
} from '../data/affixes.data';
import type { CombatTargetView } from './CombatTypes';
import {
  computeBurnTickDamage,
  isElectrolyticSurgeCondition,
  resetStatusSlot,
  type EntityStatusRecord,
  type ShockConductionArc,
  type StatusDamageEvent,
} from './StatusReactionMath';

export const ALL_STATUS_KEYS: readonly ElementStatusKey[] = [
  'oiled',
  'ignited',
  'bleeding',
  'frozen',
  'electrified',
  'poisoned',
] as const;

function findNearestNeighbor(
  excludeId: string,
  x: number,
  y: number,
  maxRad: number,
  targets: readonly CombatTargetView[]
): CombatTargetView | null {
  let best: CombatTargetView | null = null;
  let bestDist = maxRad;
  for (let i = 0; i < targets.length; i++) {
    const c = targets[i]!;
    if (!c.isAlive || c.id === excludeId) continue;
    const d = Math.hypot(c.x - x, c.y - c.height * 0.5 - y);
    if (d <= bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

function resolveStatusDotTick(
  t: CombatTargetView,
  rec: EntityStatusRecord,
  key: ElementStatusKey,
  targets: readonly CombatTargetView[],
  bus: TypedEventBus,
  outEvents: StatusDamageEvent[],
  outArcs: ShockConductionArc[]
): void {
  const slot = rec.slots[key];
  const cy = t.y - t.height * 0.5;

  if (key === 'ignited') {
    const dmg = computeBurnTickDamage(rec);
    outEvents.push({
      targetId: t.id,
      amount: dmg,
      isCrit: rec.isVioletNapalm,
      status: key,
      reactionId: rec.isVioletNapalm ? 'VIOLET_NAPALM' : null,
      worldX: t.x,
      worldY: cy,
      aoeRadiusPx: 0,
    });
    return;
  }

  if (key === 'electrified') {
    const surge = isElectrolyticSurgeCondition(rec);
    const critMult = surge ? CHEMICAL_REACTION_CONSTANTS.SHOCK_SURGE_CRIT_MULT : 1.0;
    const baseDmg = Math.max(
      1,
      Math.round(ELEMENT_STATUS_SPECS.electrified.baseTickDamage * slot.stacks * slot.statScale * critMult)
    );
    if (surge) {
      bus.emit('status:reaction_triggered', {
        targetId: t.id,
        reactionId: 'ELECTROLYTIC_SURGE',
        worldX: t.x,
        worldY: cy,
        burstDamage: baseDmg,
      });
    }
    outEvents.push({
      targetId: t.id,
      amount: baseDmg,
      isCrit: surge,
      status: key,
      reactionId: surge ? 'ELECTROLYTIC_SURGE' : null,
      worldX: t.x,
      worldY: cy,
      aoeRadiusPx: 0,
    });

    const chainRad = surge
      ? CHEMICAL_REACTION_CONSTANTS.SHOCK_SURGE_CHAIN_RADIUS_PX
      : CHEMICAL_REACTION_CONSTANTS.SHOCK_BASE_CHAIN_RADIUS_PX;
    const neighbor = findNearestNeighbor(t.id, t.x, cy, chainRad, targets);
    if (neighbor) {
      const ny = neighbor.y - neighbor.height * 0.5;
      outArcs.push({ x0: t.x, y0: cy, x1: neighbor.x, y1: ny, isSurgeCrit: surge });
      outEvents.push({
        targetId: neighbor.id,
        amount: Math.max(1, Math.round(baseDmg * CHEMICAL_REACTION_CONSTANTS.SHOCK_CHAIN_DAMAGE_RATIO)),
        isCrit: surge,
        status: key,
        reactionId: surge ? 'ELECTROLYTIC_SURGE' : null,
        worldX: neighbor.x,
        worldY: ny,
        aoeRadiusPx: 0,
      });
    }
    return;
  }

  const base =
    slot.customBaseTickDmg > 0 ? slot.customBaseTickDmg : ELEMENT_STATUS_SPECS[key].baseTickDamage;
  const dmg = Math.max(1, Math.round(base * slot.stacks * slot.statScale));
  outEvents.push({
    targetId: t.id,
    amount: dmg,
    isCrit: false,
    status: key,
    reactionId: null,
    worldX: t.x,
    worldY: cy,
    aoeRadiusPx: 0,
  });
}

export function stepStatusRecordsFixed(
  dtSec: number,
  targets: readonly CombatTargetView[],
  records: Map<string, EntityStatusRecord>,
  bus: TypedEventBus,
  onClearTarget: (id: string) => void,
  outEvents: StatusDamageEvent[],
  outArcs: ShockConductionArc[]
): void {
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i]!;
    const rec = records.get(t.id);
    if (!rec) continue;
    if (!t.isAlive) {
      onClearTarget(t.id);
      continue;
    }

    rec.inConductiveLiquid = t.inConductiveHazard;
    if (rec.rootedSec > 0) rec.rootedSec = Math.max(0, rec.rootedSec - dtSec);
    if (rec.brittleResidualSlowSec > 0) {
      rec.brittleResidualSlowSec = Math.max(0, rec.brittleResidualSlowSec - dtSec);
    }

    for (let k = 0; k < ALL_STATUS_KEYS.length; k++) {
      const key = ALL_STATUS_KEYS[k]!;
      const slot = rec.slots[key];
      if (slot.stacks <= 0) continue;

      const spec = ELEMENT_STATUS_SPECS[key];
      if (spec.tickIntervalSec !== null) {
        slot.tickAccumSec += dtSec;
        if (slot.tickAccumSec >= spec.tickIntervalSec) {
          slot.tickAccumSec -= spec.tickIntervalSec;
          resolveStatusDotTick(t, rec, key, targets, bus, outEvents, outArcs);
        }
      }

      slot.remainingSec -= dtSec;
      if (slot.remainingSec <= 0) {
        resetStatusSlot(slot);
        if (key === 'ignited') rec.isVioletNapalm = false;
        if (key === 'frozen') rec.cryoExtraBrittleRatio = 0;
        bus.emit('status:expired', { targetId: t.id, status: key });
      }
    }
  }
}
