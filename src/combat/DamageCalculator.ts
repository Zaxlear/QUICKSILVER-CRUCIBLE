/**
 * 核心战斗伤害结算、三系指数成长、全部 12 把武器专属暴击判定与全 20 词条乘区纯函数
 * （src/combat/DamageCalculator.ts）。
 *
 * 严格遵循单向依赖铁律：零运行时副作用，100% 确定性可测。
 */

import {
  ALL_STAT_COLORS,
  COMBAT_CONSTANTS,
  FORGE_GRADE_BONUS,
  QUALITY_TIERS,
  WEAPON_CATALOG,
  type ForgeGrade,
  type QualityTier,
  type StatColor,
  type WeaponCritRuleId,
  type WeaponId,
} from '../data/weapons.data';
import {
  EMPTY_TARGET_STATUS_FOR_AFFIX,
  evaluateAffixDamageMultiplier,
  type TargetStatusSnapshotForAffix,
} from './AffixMultiplierMath';

export interface CritEvaluationInput {
  readonly rule: WeaponCritRuleId;
  readonly attackerX: number;
  readonly targetX: number;
  readonly targetFacing: -1 | 1;
  readonly rapierCritWindowMs: number;
  readonly comboIndex: number;
  readonly cleaverRhythmPrimed: boolean;
  readonly distancePx: number;
  readonly targetStuckArrows: number;
  readonly inConductiveHazard: boolean;
  readonly chainBounceIndex: number;
  readonly forceParryCrit?: boolean;
  readonly targetStatuses?: TargetStatusSnapshotForAffix;
}

export interface ShieldBlockInput {
  readonly attackerX: number;
  readonly targetX: number;
  readonly targetFacing: -1 | 1;
  readonly targetHasFrontShield: boolean;
  readonly targetIsStunned: boolean;
  readonly stageBreach: number;
  readonly bypassFrontShield: boolean;
}

export interface HitDamageInput {
  readonly weaponId: WeaponId;
  readonly stageIndex: number;
  readonly level: QualityTier;
  readonly forgeGrade: ForgeGrade;
  readonly bonusStatColor: StatColor | null;
  readonly isColorlessLegendary?: boolean;
  readonly affixIds: readonly string[];
  readonly playerStats: Readonly<Record<StatColor, number>>;
  readonly critInput: CritEvaluationInput;
  readonly targetIsStunnedOrRooted?: boolean;
  readonly targetStatuses?: TargetStatusSnapshotForAffix;
  readonly externalDamageMultiplier?: number;
  readonly flatBonusDamage?: number;
}

export interface HitDamageOutput {
  readonly finalDamage: number;
  readonly breachDamage: number;
  readonly isCrit: boolean;
  readonly critMultiplierApplied: number;
  readonly statMultiplier: number;
  readonly gearMultiplier: number;
  readonly affixMultiplier: number;
}

/** 计算三系属性指数伤害倍率：1.15^(S_max - 1)（双色武器自动取最高项） */
export function computeStatDamageMultiplier(
  colors: readonly StatColor[],
  stats: Readonly<Record<StatColor, number>>
): number {
  let maxLevel = 1;
  for (let i = 0; i < colors.length; i++) {
    const lv = stats[colors[i]!] ?? 1;
    if (lv > maxLevel) maxLevel = lv;
  }
  return Math.pow(COMBAT_CONSTANTS.STAT_DMG_BASE, Math.max(0, maxLevel - 1));
}

/** 计算三系单级边际递减生命增幅比例（docs/02 §3.1） */
export function computeScrollMarginalHpRatio(color: StatColor, nextLevel: number): number {
  if (nextLevel < 2) return 0;
  const exp = nextLevel - 2;
  switch (color) {
    case 'albedo':
      return Math.max(0.08, 0.7 * Math.pow(0.88, exp));
    case 'rubedo':
      return Math.max(0.05, 0.58 * Math.pow(0.85, exp));
    case 'citrinitas':
      return Math.max(0.04, 0.48 * Math.pow(0.83, exp));
  }
}

/** 根据当前三围总等级计算角色最大生命值上限 */
export function computeMaxHpFromStats(stats: Readonly<Record<StatColor, number>>): number {
  let bonusSum = 0;
  const keys: readonly StatColor[] = ['rubedo', 'citrinitas', 'albedo'];
  for (let i = 0; i < keys.length; i++) {
    const c = keys[i]!;
    const lv = Math.max(1, Math.floor(stats[c] ?? 1));
    for (let k = 2; k <= lv; k++) bonusSum += computeScrollMarginalHpRatio(c, k);
  }
  return Math.round(COMBAT_CONSTANTS.BASE_PLAYER_HP * (1 + bonusSum));
}

/** 计算武器品质（I~VI）与锻炉精炼阶位（BASE/+/++/S）综合倍率 */
export function computeGearTierMultiplier(level: QualityTier, forgeGrade: ForgeGrade): number {
  const tierIdx = Math.max(0, QUALITY_TIERS.indexOf(level));
  const extra = FORGE_GRADE_BONUS[forgeGrade].effectiveExtraLevels;
  return 1 + (tierIdx + extra) * COMBAT_CONSTANTS.GEAR_TIER_DMG_STEP;
}

export function isBackstabPosition(attackerX: number, targetX: number, targetFacing: -1 | 1): boolean {
  return (attackerX - targetX) * targetFacing < 0;
}

export function isWithinCleaverRhythmWindow(elapsedSinceS1HitMs: number, mashedEarly: boolean): boolean {
  if (mashedEarly) return false;
  return (
    elapsedSinceS1HitMs >= COMBAT_CONSTANTS.CLEAVER_RHYTHM_MIN_MS &&
    elapsedSinceS1HitMs <= COMBAT_CONSTANTS.CLEAVER_RHYTHM_MAX_MS
  );
}

/** 统一判定全部 12 把标志性武器的专属暴击触发条件 */
export function evaluateWeaponCrit(ctx: CritEvaluationInput): boolean {
  if (ctx.forceParryCrit) return true;
  const st = ctx.targetStatuses ?? EMPTY_TARGET_STATUS_FOR_AFFIX;
  switch (ctx.rule) {
    case 'BACKSTAB_180':
      return isBackstabPosition(ctx.attackerX, ctx.targetX, ctx.targetFacing);
    case 'POST_DODGE_OR_PARRY_1800MS':
      return ctx.rapierCritWindowMs > 0;
    case 'COMBO_STAGE_3_AND_5':
      return ctx.comboIndex === 2 || ctx.comboIndex === 4;
    case 'RHYTHM_WINDOW_220_380MS':
      return ctx.comboIndex === 1 && ctx.cleaverRhythmPrimed;
    case 'CRUSH_FROZEN_STUN_ROOT':
      return st.isFrozen || st.isStunnedOrRooted;
    case 'HALBERD_SWEETSPOT_64_112PX':
      return (
        ctx.distancePx >= COMBAT_CONSTANTS.HALBERD_SWEETSPOT_MIN_PX &&
        ctx.distancePx <= COMBAT_CONSTANTS.HALBERD_SWEETSPOT_MAX_PX
      );
    case 'SNIPER_160PX_OR_3_STUCK_ARROWS':
      return (
        ctx.distancePx >= COMBAT_CONSTANTS.BOW_SNIPER_MIN_DIST_PX ||
        ctx.targetStuckArrows >= COMBAT_CONSTANTS.BOW_STUCK_ARROW_CRIT_THRESHOLD
      );
    case 'ELECTRIFIED_OR_ROOTED':
      return st.isElectrified || st.isStunnedOrRooted;
    case 'CATALYST_OILED_OR_IGNITED':
      return st.isVioletNapalm || st.isIgnited || Boolean((st as { isOiled?: boolean }).isOiled);
    case 'LIQUID_CONDUCTOR_OR_CHAIN_BOUNCE':
      return ctx.inConductiveHazard || ctx.chainBounceIndex >= 1;
    case 'PARRY_SHOCKWAVE':
    case 'PRISM_PARRY_TRIPLE_BEAM':
      return true;
  }
}

export function isBlockedByFrontShield(input: ShieldBlockInput): boolean {
  if (!input.targetHasFrontShield || input.targetIsStunned || input.bypassFrontShield) return false;
  if (input.stageBreach >= 1.5) return false;
  return (input.attackerX - input.targetX) * input.targetFacing >= 0;
}

export function computeAffixDamageMultiplier(
  affixIds: readonly string[],
  targetIsStunnedOrRooted = false,
  targetStatuses?: TargetStatusSnapshotForAffix
): number {
  const merged: TargetStatusSnapshotForAffix = targetStatuses
    ? { ...targetStatuses, isStunnedOrRooted: targetStatuses.isStunnedOrRooted || targetIsStunnedOrRooted }
    : { ...EMPTY_TARGET_STATUS_FOR_AFFIX, isStunnedOrRooted: targetIsStunnedOrRooted };
  return evaluateAffixDamageMultiplier(affixIds, merged);
}

/** 执行完整单次命中伤害与破盾韧性削减结算 */
export function calculateFinalHitDamage(input: HitDamageInput): HitDamageOutput {
  const def = WEAPON_CATALOG[input.weaponId];
  const stage = def.stages[input.stageIndex % def.stages.length]!;

  const effectiveStats: Record<StatColor, number> = { ...input.playerStats };
  if (input.bonusStatColor) {
    effectiveStats[input.bonusStatColor] += FORGE_GRADE_BONUS[input.forgeGrade].bonusScrollCount;
  }

  const scalingColors = input.isColorlessLegendary ? ALL_STAT_COLORS : def.colors;
  const statMult = computeStatDamageMultiplier(scalingColors, effectiveStats);
  const gearMult = computeGearTierMultiplier(input.level, input.forgeGrade);
  const affixMult = computeAffixDamageMultiplier(
    input.affixIds,
    input.targetIsStunnedOrRooted,
    input.targetStatuses
  );
  const critWithStatus = input.targetStatuses
    ? { ...input.critInput, targetStatuses: input.targetStatuses }
    : input.critInput;
  const isCrit = evaluateWeaponCrit(critWithStatus);

  let critMult = 1.0;
  if (isCrit) {
    if (def.critRule === 'COMBO_STAGE_3_AND_5') {
      critMult =
        input.critInput.comboIndex === 2
          ? COMBAT_CONSTANTS.TWINBLADES_STAGE3_CRIT_MULT
          : COMBAT_CONSTANTS.TWINBLADES_STAGE5_CRIT_MULT;
    } else {
      critMult = def.critMultiplier;
    }
  }

  const extMult = input.externalDamageMultiplier ?? 1.0;
  const raw = stage.baseDamage * statMult * gearMult * affixMult * critMult * extMult + (input.flatBonusDamage ?? 0);
  const finalDamage = Math.max(1, Math.round(raw));
  const breachDamage = Number((stage.breach * (isCrit ? 1.25 : 1.0)).toFixed(2));

  return {
    finalDamage,
    breachDamage,
    isCrit,
    critMultiplierApplied: critMult,
    statMultiplier: statMult,
    gearMultiplier: gearMult,
    affixMultiplier: affixMult,
  };
}
