/**
 * 6 大元素异常状态机（src/combat/StatusEffectMachine.ts）：
 * 统一管理全实体元素层数、6 大跨元素化学反应质变与 120Hz 零 GC DoT 结算。
 */

import { EventBus, type TypedEventBus } from '../core/EventBus';
import {
  CHEMICAL_REACTION_CONSTANTS,
  ELEMENT_STATUS_SPECS,
  type ElementStatusKey,
} from '../data/affixes.data';
import type { CombatTargetView } from './CombatTypes';
import { ALL_STATUS_KEYS, stepStatusRecordsFixed } from './StatusDotStepper';
import {
  computeHemorrhageBurstDamage,
  computePoisonVulnerabilityMultiplier,
  computeThermalShockBurstDamage,
  computeVitriolDetonationDamage,
  createEntityStatusRecord,
  resetStatusSlot,
  type EntityStatusRecord,
  type ShockConductionArc,
  type StatusDamageEvent,
} from './StatusReactionMath';

export interface StatusApplyOptions {
  readonly worldX?: number;
  readonly worldY?: number;
  readonly isElite?: boolean;
  readonly durationOverrideSec?: number;
  readonly customBaseTickDmg?: number;
  readonly extraCryoBrittleRatio?: number;
}

export class StatusEffectMachine {
  private readonly records = new Map<string, EntityStatusRecord>();
  private readonly scratchEvents: StatusDamageEvent[] = [];
  private readonly scratchShockArcs: ShockConductionArc[] = [];
  private readonly pendingBurstEvents: StatusDamageEvent[] = [];

  public constructor(private readonly bus: TypedEventBus = EventBus) {}

  public getRecord(targetId: string): EntityStatusRecord | undefined {
    return this.records.get(targetId);
  }

  public has(targetId: string, status: ElementStatusKey): boolean {
    return (this.records.get(targetId)?.slots[status].stacks ?? 0) > 0;
  }

  public getStacks(targetId: string, status: ElementStatusKey): number {
    return this.records.get(targetId)?.slots[status].stacks ?? 0;
  }

  public isVioletNapalm(targetId: string): boolean {
    const rec = this.records.get(targetId);
    return Boolean(rec && rec.isVioletNapalm && rec.slots.ignited.stacks > 0);
  }

  public isRooted(targetId: string): boolean {
    return (this.records.get(targetId)?.rootedSec ?? 0) > 0;
  }

  public isSlowedOrFrozen(targetId: string): boolean {
    const rec = this.records.get(targetId);
    return Boolean(
      rec && (rec.slots.frozen.stacks > 0 || rec.brittleResidualSlowSec > 0 || rec.slots.oiled.stacks > 0)
    );
  }

  public isImmobilized(targetId: string, targetIsStunned = false): boolean {
    if (targetIsStunned) return true;
    const rec = this.records.get(targetId);
    return Boolean(rec && (rec.rootedSec > 0 || rec.slots.frozen.stacks > 0));
  }

  public setConductiveLiquid(targetId: string, inLiquid: boolean): void {
    this.ensureRecord(targetId).inConductiveLiquid = inLiquid;
  }

  public applyRoot(targetId: string, durationSec: number): void {
    const rec = this.ensureRecord(targetId);
    rec.rootedSec = Math.max(rec.rootedSec, durationSec);
  }

  /** 施加元素异常状态并即时触发 6 大跨元素化学反应 */
  public apply(
    targetId: string,
    status: ElementStatusKey,
    stacksToAdd = 1,
    statScale = 1.0,
    opts?: StatusApplyOptions
  ): void {
    if (stacksToAdd <= 0) return;
    const rec = this.ensureRecord(targetId);
    const wx = opts?.worldX ?? 0;
    const wy = opts?.worldY ?? 0;

    // 反应 ②：火 + 冰 -> Thermal Shock（180% 热震爆裂并解除冰冻）
    if ((status === 'ignited' && rec.slots.frozen.stacks > 0) || (status === 'frozen' && rec.slots.ignited.stacks > 0)) {
      const burst = computeThermalShockBurstDamage(rec, status === 'ignited' ? stacksToAdd : 0, statScale);
      resetStatusSlot(rec.slots.frozen);
      if (status === 'frozen') {
        resetStatusSlot(rec.slots.ignited);
        rec.isVioletNapalm = false;
      }
      this.bus.emit('status:expired', { targetId, status: 'frozen' });
      this.emitReaction(targetId, 'THERMAL_SHOCK', wx, wy, burst, 72);
      if (status === 'frozen') return;
    }

    const spec = ELEMENT_STATUS_SPECS[status];
    const slot = rec.slots[status];
    const wasEmpty = slot.stacks === 0;
    const baseDur = opts?.durationOverrideSec ?? (opts?.isElite ? spec.eliteDurationSec : spec.durationSec);

    slot.stacks = Math.min(spec.maxStacks, slot.stacks + stacksToAdd);
    slot.remainingSec = Math.max(slot.remainingSec, baseDur);
    slot.statScale = Math.max(slot.statScale, statScale);
    if (opts?.customBaseTickDmg && opts.customBaseTickDmg > slot.customBaseTickDmg) {
      slot.customBaseTickDmg = opts.customBaseTickDmg;
    }
    if (status === 'frozen' && opts?.extraCryoBrittleRatio) {
      rec.cryoExtraBrittleRatio = Math.max(rec.cryoExtraBrittleRatio, opts.extraCryoBrittleRatio);
    }
    this.bus.emit(wasEmpty ? 'status:applied' : 'status:stacked', { targetId, status, stacks: slot.stacks });

    // 反应 ①-B：油 + 冰 -> 延长冰冻 +1.5s
    if ((status === 'frozen' && rec.slots.oiled.stacks > 0) || (status === 'oiled' && rec.slots.frozen.stacks > 0)) {
      rec.slots.frozen.remainingSec += CHEMICAL_REACTION_CONSTANTS.OIL_EXTEND_FROZEN_SEC;
      this.bus.emit('status:reaction_triggered', { targetId, reactionId: 'OIL_CRYO_EXTEND', worldX: wx, worldY: wy });
    }

    // 反应 ①-A：油 + 火 -> Violet Napalm（双倍伤紫火，刷新至 6.0s）
    if ((status === 'ignited' && rec.slots.oiled.stacks > 0) || (status === 'oiled' && rec.slots.ignited.stacks > 0)) {
      rec.isVioletNapalm = true;
      rec.slots.ignited.remainingSec = CHEMICAL_REACTION_CONSTANTS.VIOLET_NAPALM_DURATION_SEC;
      rec.slots.oiled.remainingSec = Math.max(rec.slots.oiled.remainingSec, CHEMICAL_REACTION_CONSTANTS.VIOLET_NAPALM_DURATION_SEC);
      this.bus.emit('status:reaction_triggered', { targetId, reactionId: 'VIOLET_NAPALM', worldX: wx, worldY: wy });
    }

    // 反应 ③：满 5 层流血 -> Hemorrhage Burst（清空层数引爆 135% 剩余总流血伤）
    if (status === 'bleeding' && rec.slots.bleeding.stacks >= CHEMICAL_REACTION_CONSTANTS.HEMORRHAGE_MAX_STACKS) {
      const burst = computeHemorrhageBurstDamage(rec);
      resetStatusSlot(rec.slots.bleeding);
      this.bus.emit('status:expired', { targetId, status: 'bleeding' });
      this.emitReaction(targetId, 'HEMORRHAGE_BURST', wx, wy, burst, 0);
    }

    // 反应 ⑥：>=3 层矾毒 + 炼金紫火 -> Vitriol Detonation（消耗毒层触发 104px 爆燃）
    if (rec.isVioletNapalm && rec.slots.ignited.stacks > 0 && rec.slots.poisoned.stacks >= CHEMICAL_REACTION_CONSTANTS.VITRIOL_DETONATION_MIN_POISON_STACKS) {
      const pScale = Math.max(rec.slots.poisoned.statScale, rec.slots.ignited.statScale);
      const detDmg = computeVitriolDetonationDamage(rec.slots.poisoned.stacks, pScale);
      resetStatusSlot(rec.slots.poisoned);
      this.bus.emit('status:expired', { targetId, status: 'poisoned' });
      this.emitReaction(targetId, 'VITRIOL_DETONATION', wx, wy, detDmg, CHEMICAL_REACTION_CONSTANTS.VITRIOL_DETONATION_RADIUS_PX);
    }
  }

  /** ④ 重击破冰与毒蚀易伤钩子：直接命中时消费破冰 +40% 碎裂乘区并残留 3.0s 霜缓 */
  public consumeDirectHitModifiers(targetId: string, worldX: number, worldY: number): {
    readonly brittleMultiplier: number;
    readonly poisonVulnerabilityMultiplier: number;
    readonly shatteredIce: boolean;
  } {
    const rec = this.records.get(targetId);
    if (!rec) return { brittleMultiplier: 1.0, poisonVulnerabilityMultiplier: 1.0, shatteredIce: false };
    const poisonMult = computePoisonVulnerabilityMultiplier(rec);
    if (rec.slots.frozen.stacks > 0) {
      const bonus = CHEMICAL_REACTION_CONSTANTS.BRITTLE_SHATTER_BONUS_RATIO + rec.cryoExtraBrittleRatio;
      resetStatusSlot(rec.slots.frozen);
      rec.cryoExtraBrittleRatio = 0;
      rec.brittleResidualSlowSec = CHEMICAL_REACTION_CONSTANTS.BRITTLE_RESIDUAL_SLOW_SEC;
      this.bus.emit('status:expired', { targetId, status: 'frozen' });
      this.bus.emit('status:reaction_triggered', { targetId, reactionId: 'BRITTLE_SHATTER', worldX, worldY });
      return { brittleMultiplier: 1.0 + bonus, poisonVulnerabilityMultiplier: poisonMult, shatteredIce: true };
    }
    return { brittleMultiplier: 1.0, poisonVulnerabilityMultiplier: poisonMult, shatteredIce: false };
  }

  public applyRadius(centerX: number, centerY: number, radiusPx: number, targets: readonly CombatTargetView[], status: ElementStatusKey, stacks: number, statScale: number, durationOverrideSec?: number): void {
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i]!;
      if (t.isAlive && Math.hypot(t.x - centerX, t.y - t.height * 0.5 - centerY) <= radiusPx) {
        this.apply(t.id, status, stacks, statScale, { worldX: t.x, worldY: t.y - t.height * 0.5, durationOverrideSec });
      }
    }
  }

  public transferStacksInRadius(victimId: string, worldX: number, worldY: number, radiusPx: number, statuses: readonly ElementStatusKey[], targets: readonly CombatTargetView[]): void {
    const src = this.records.get(victimId);
    if (!src) return;
    for (let s = 0; s < statuses.length; s++) {
      const stKey = statuses[s]!;
      const slot = src.slots[stKey];
      if (slot.stacks > 0) this.applyRadius(worldX, worldY, radiusPx, targets, stKey, slot.stacks, slot.statScale);
    }
  }

  public stepFixed(dtSec: number, targets: readonly CombatTargetView[]): {
    readonly damageEvents: readonly StatusDamageEvent[];
    readonly shockArcs: readonly ShockConductionArc[];
  } {
    this.scratchEvents.length = 0;
    this.scratchShockArcs.length = 0;
    while (this.pendingBurstEvents.length > 0) this.scratchEvents.push(this.pendingBurstEvents.pop()!);
    stepStatusRecordsFixed(dtSec, targets, this.records, this.bus, (id) => this.clearTarget(id), this.scratchEvents, this.scratchShockArcs);
    return { damageEvents: this.scratchEvents, shockArcs: this.scratchShockArcs };
  }

  public clearTarget(targetId: string): void {
    const rec = this.records.get(targetId);
    if (!rec) return;
    for (let k = 0; k < ALL_STATUS_KEYS.length; k++) resetStatusSlot(rec.slots[ALL_STATUS_KEYS[k]!]);
    rec.isVioletNapalm = false;
    rec.rootedSec = 0;
    rec.brittleResidualSlowSec = 0;
    rec.cryoExtraBrittleRatio = 0;
  }

  public resetAll(): void {
    this.records.clear();
    this.pendingBurstEvents.length = 0;
  }

  private emitReaction(targetId: string, reactionId: 'THERMAL_SHOCK' | 'HEMORRHAGE_BURST' | 'VITRIOL_DETONATION', worldX: number, worldY: number, burstDamage: number, aoeRadiusPx: number): void {
    this.bus.emit('status:reaction_triggered', { targetId, reactionId, worldX, worldY, burstDamage });
    this.pendingBurstEvents.push({ targetId, amount: burstDamage, isCrit: true, status: null, reactionId, worldX, worldY, aoeRadiusPx });
  }

  private ensureRecord(targetId: string): EntityStatusRecord {
    let rec = this.records.get(targetId);
    if (!rec) {
      rec = createEntityStatusRecord();
      this.records.set(targetId, rec);
    }
    return rec;
  }
}
