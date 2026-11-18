/**
 * 6 大元素异常状态槽数据结构与 6 大跨元素化学反应纯数学解算器
 * （src/combat/StatusReactionMath.ts）。
 *
 * 严格遵循单向依赖铁律：仅依赖 src/data，零副作用，100% 确定性可测。
 */

import {
  CHEMICAL_REACTION_CONSTANTS,
  ELEMENT_STATUS_SPECS,
  type ChemicalReactionId,
  type ElementStatusKey,
} from '../data/affixes.data';

export interface StatusSlotState {
  stacks: number;
  remainingSec: number;
  tickAccumSec: number;
  statScale: number;
  customBaseTickDmg: number;
}

export interface EntityStatusRecord {
  readonly slots: Record<ElementStatusKey, StatusSlotState>;
  isVioletNapalm: boolean;
  rootedSec: number;
  brittleResidualSlowSec: number;
  cryoExtraBrittleRatio: number;
  inConductiveLiquid: boolean;
}

export interface StatusDamageEvent {
  readonly targetId: string;
  readonly amount: number;
  readonly isCrit: boolean;
  readonly status: ElementStatusKey | null;
  readonly reactionId: ChemicalReactionId | null;
  readonly worldX: number;
  readonly worldY: number;
  readonly aoeRadiusPx: number;
}

export interface ShockConductionArc {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
  readonly isSurgeCrit: boolean;
}

export function createEmptyStatusSlot(): StatusSlotState {
  return {
    stacks: 0,
    remainingSec: 0,
    tickAccumSec: 0,
    statScale: 1,
    customBaseTickDmg: 0,
  };
}

export function createEntityStatusRecord(): EntityStatusRecord {
  return {
    slots: {
      oiled: createEmptyStatusSlot(),
      ignited: createEmptyStatusSlot(),
      bleeding: createEmptyStatusSlot(),
      frozen: createEmptyStatusSlot(),
      electrified: createEmptyStatusSlot(),
      poisoned: createEmptyStatusSlot(),
    },
    isVioletNapalm: false,
    rootedSec: 0,
    brittleResidualSlowSec: 0,
    cryoExtraBrittleRatio: 0,
    inConductiveLiquid: false,
  };
}

export function resetStatusSlot(slot: StatusSlotState): void {
  slot.stacks = 0;
  slot.remainingSec = 0;
  slot.tickAccumSec = 0;
  slot.statScale = 1;
  slot.customBaseTickDmg = 0;
}

/** 计算单次燃烧 DoT 跳字伤害（炼金紫火状态下伤害精确翻倍 2.0×） */
export function computeBurnTickDamage(rec: EntityStatusRecord): number {
  const slot = rec.slots.ignited;
  if (slot.stacks <= 0) return 0;
  const base = slot.customBaseTickDmg > 0 ? slot.customBaseTickDmg : ELEMENT_STATUS_SPECS.ignited.baseTickDamage;
  const napalmMult = rec.isVioletNapalm ? CHEMICAL_REACTION_CONSTANTS.VIOLET_NAPALM_BURN_MULT : 1.0;
  return Math.max(1, Math.round(base * slot.stacks * slot.statScale * napalmMult));
}

/** 计算当前剩余燃烧总潜在伤害池（用于火+冰热震爆裂结算） */
export function computeRemainingBurnPool(rec: EntityStatusRecord, incomingStacks = 0, incomingScale = 1): number {
  const slot = rec.slots.ignited;
  const effStacks = Math.min(ELEMENT_STATUS_SPECS.ignited.maxStacks, Math.max(1, slot.stacks + incomingStacks));
  const effScale = Math.max(slot.statScale, incomingScale);
  const effRemSec = slot.remainingSec > 0 ? slot.remainingSec : ELEMENT_STATUS_SPECS.ignited.durationSec;
  const ticksLeft = Math.max(1, Math.ceil(effRemSec / (ELEMENT_STATUS_SPECS.ignited.tickIntervalSec ?? 0.33)));
  const napalmMult = rec.isVioletNapalm ? CHEMICAL_REACTION_CONSTANTS.VIOLET_NAPALM_BURN_MULT : 1.0;
  return ELEMENT_STATUS_SPECS.ignited.baseTickDamage * effStacks * effScale * napalmMult * ticksLeft;
}

/** 计算当前剩余寒冰能量池（用于火+冰热震爆裂结算） */
export function computeRemainingFrostPool(rec: EntityStatusRecord, incomingScale = 1): number {
  const slot = rec.slots.frozen;
  const effScale = Math.max(slot.statScale, incomingScale);
  const ratio = slot.remainingSec > 0 ? slot.remainingSec / ELEMENT_STATUS_SPECS.frozen.durationSec : 1.0;
  return Math.max(18, ELEMENT_STATUS_SPECS.frozen.baseTickDamage * 2.2 * ratio * effScale);
}

/** ② 火 + 冰 -> Thermal Shock（热震爆裂）：结算剩余寒冰与火焰总值的 180% 蒸汽震波伤害 */
export function computeThermalShockBurstDamage(
  rec: EntityStatusRecord,
  incomingFireStacks: number,
  incomingScale: number
): number {
  const totalPool =
    computeRemainingFrostPool(rec, incomingScale) +
    computeRemainingBurnPool(rec, incomingFireStacks, incomingScale);
  return Math.max(1, Math.round(totalPool * CHEMICAL_REACTION_CONSTANTS.THERMAL_SHOCK_BURST_MULT));
}

/** ③ 5 层流血 -> Hemorrhage Burst（大动脉崩裂）：一次性引爆剩余总流血伤的 135% */
export function computeHemorrhageBurstDamage(rec: EntityStatusRecord): number {
  const slot = rec.slots.bleeding;
  const tickInt = ELEMENT_STATUS_SPECS.bleeding.tickIntervalSec ?? 0.4;
  const ticksLeft = Math.max(1, Math.ceil(slot.remainingSec / tickInt));
  const perTick =
    (slot.customBaseTickDmg > 0 ? slot.customBaseTickDmg : ELEMENT_STATUS_SPECS.bleeding.baseTickDamage) *
    slot.stacks *
    slot.statScale;
  const totalRemaining = perTick * ticksLeft;
  return Math.max(1, Math.round(totalRemaining * CHEMICAL_REACTION_CONSTANTS.HEMORRHAGE_BURST_MULT));
}

/** ⑤ 电 + 潮湿/油/毒 -> Electrolytic Surge（电解超导）：判定是否触发双倍传导半径与必暴 */
export function isElectrolyticSurgeCondition(rec: EntityStatusRecord): boolean {
  return (
    rec.inConductiveLiquid ||
    rec.slots.oiled.stacks > 0 ||
    rec.slots.poisoned.stacks > 0
  );
}

/** ⑥ 毒(>=3层) + 紫火 -> Vitriol Detonation（矾毒爆燃）：消耗毒层触发 104px 爆炸伤害 */
export function computeVitriolDetonationDamage(poisonStacks: number, statScale: number): number {
  return Math.max(
    1,
    Math.round(poisonStacks * CHEMICAL_REACTION_CONSTANTS.VITRIOL_DETONATION_BASE_PER_STACK * statScale)
  );
}

/** 计算矾酸毒蚀护甲削弱易伤倍率：每层 +3%，满 8 层 +24% */
export function computePoisonVulnerabilityMultiplier(rec: EntityStatusRecord | undefined): number {
  if (!rec || rec.slots.poisoned.stacks <= 0) return 1.0;
  return 1.0 + rec.slots.poisoned.stacks * CHEMICAL_REACTION_CONSTANTS.POISON_VULNERABILITY_PER_STACK;
}

/** 计算目标综合移速缩放（冰冻 0%，残余霜缓/Boss 霜缓 50%，黑油 -15%，定身 0%） */
export function computeTargetMoveSpeedMultiplier(rec: EntityStatusRecord | undefined, isBoss = false): number {
  if (!rec) return 1.0;
  if (rec.rootedSec > 0) return 0;
  if (rec.slots.frozen.stacks > 0) return isBoss ? 0.5 : 0;
  let mult = 1.0;
  if (rec.brittleResidualSlowSec > 0) mult *= 0.6;
  if (rec.slots.oiled.stacks > 0) mult *= 1 - ELEMENT_STATUS_SPECS.oiled.moveSpeedPenaltyRatio;
  return mult;
}
