/**
 * 武器面板缩放 DPS 计算、20 词条确定性互斥抽签与跨槽化学联动对比投影纯函数
 * （src/entities/player/WeaponCompareProjection.ts）。
 */

import {
  computeAffixDamageMultiplier,
  computeGearTierMultiplier,
  computeStatDamageMultiplier,
} from '../../combat/DamageCalculator';
import { FIXED_SIM_HZ } from '../../core/Constants';
import type { DeterministicRng } from '../../core/DeterministicRng';
import {
  AFFIX_BY_ID,
  AFFIX_CATALOG,
  type AffixDefinition,
  type AffixId,
  type SynergySemanticTag,
} from '../../data/affixes.data';
import type { SkillArchetype } from '../../data/skills.data';
import {
  FORGE_GRADE_BONUS,
  WEAPON_CATALOG,
  type ForgeGrade,
  type QualityTier,
  type RolledWeaponInstance,
  type StatColor,
  type WeaponCategory,
  type WeaponCompareSlotView,
} from '../../data/weapons.data';

export function isAffixEligibleForWeapon(affix: AffixDefinition, cat: WeaponCategory): boolean {
  const isMelee =
    cat === 'MELEE_LIGHT' ||
    cat === 'MELEE_THRUST' ||
    cat === 'MELEE_TWINBLADES' ||
    cat === 'MELEE_HEAVY' ||
    cat === 'MELEE_HALBERD';
  switch (affix.slotFilter) {
    case 'ALL_GEAR':
    case 'ALL_WEAPONS':
      return true;
    case 'HEAVY_OR_CROSSBOW':
      return cat === 'MELEE_HEAVY' || cat === 'MELEE_HALBERD' || cat === 'RANGED_CROSSBOW';
    case 'MELEE_OR_RANGED_BOW':
      return isMelee || cat === 'RANGED_BOW' || cat === 'RANGED_CROSSBOW';
    case 'MELEE_OR_THROWN':
      return isMelee || cat === 'THROWN_FLASK';
    case 'DEPLOY_OR_THROWN':
      return cat === 'THROWN_FLASK';
    case 'MELEE_OR_SHIELD':
      return isMelee || cat === 'SHIELD';
    case 'SKILL_OR_SHIELD':
      return cat === 'SHIELD';
    case 'RANGED_BOW_OR_CROSSBOW':
      return cat === 'RANGED_BOW' || cat === 'RANGED_CROSSBOW';
    case 'SHIELD_ONLY':
      return cat === 'SHIELD';
    case 'MELEE_ONLY':
      return isMelee;
    case 'HEAVY_ONLY':
      return cat === 'MELEE_HEAVY' || cat === 'MELEE_HALBERD';
  }
}

export function isAffixEligibleForSkill(affix: AffixDefinition, arch: SkillArchetype): boolean {
  const isDeployOrThrown =
    arch === 'THROWN_CATALYST' || arch === 'FLOOR_TRAP' || arch === 'DEPLOY_TURRET';
  return (
    affix.slotFilter === 'ALL_GEAR' ||
    affix.slotFilter === 'SKILL_OR_SHIELD' ||
    (affix.slotFilter === 'DEPLOY_OR_THROWN' && isDeployOrThrown)
  );
}

/**
 * 基于 Mulberry32 子流抽取不冲突词条列表：
 * - 严格遵守 mutexGroup 互斥去重；
 * - S 级品质强制保底至少携带 1 条 RARE (★) 词条（docs/02 §3.5.2）。
 */
export function rollDeterministicAffixIds(
  lootRng: DeterministicRng,
  eligiblePool: readonly AffixDefinition[],
  forgeGrade: ForgeGrade
): readonly string[] {
  const slotBudget = FORGE_GRADE_BONUS[forgeGrade].affixSlots;
  if (eligiblePool.length === 0 || slotBudget <= 0) return [];

  const chosen: string[] = [];
  const usedMutex = new Set<string>();

  if (forgeGrade === 'S') {
    const rares = eligiblePool.filter((a) => a.rarity === 'RARE');
    if (rares.length > 0) {
      const pickedRare = lootRng.pick(rares);
      chosen.push(pickedRare.id);
      usedMutex.add(pickedRare.mutexGroup);
    }
  }

  const startIdx = lootRng.nextInt(0, eligiblePool.length - 1);
  for (let i = 0; i < eligiblePool.length && chosen.length < slotBudget; i++) {
    const cand = eligiblePool[(startIdx + i) % eligiblePool.length]!;
    if (usedMutex.has(cand.mutexGroup)) continue;
    if (cand.rarity === 'LEGENDARY' && forgeGrade !== 'S' && lootRng.nextFloat() >= 0.18) continue;
    usedMutex.add(cand.mutexGroup);
    chosen.push(cand.id);
  }
  return chosen;
}

export function computeWeaponScaledDps(
  weapon: RolledWeaponInstance,
  stats: Readonly<Record<StatColor, number>>
): { readonly baseDps: number; readonly critDps: number; readonly avgBreach: number } {
  const def = WEAPON_CATALOG[weapon.weaponId];
  let totalDmg = 0;
  let totalTicks = 0;
  let totalBreach = 0;
  const pelletMult = def.id === 'wpn_clockwork_repeater' ? 3 : 1;

  for (let i = 0; i < def.stages.length; i++) {
    const st = def.stages[i]!;
    totalDmg += st.baseDamage * pelletMult;
    totalBreach += st.breach * pelletMult;
    totalTicks += st.startupTicks + st.activeTicks + st.recoveryTicks;
  }

  const effectiveStats: Record<StatColor, number> = { ...stats };
  if (weapon.bonusStatColor) {
    effectiveStats[weapon.bonusStatColor] += FORGE_GRADE_BONUS[weapon.forgeGrade].bonusScrollCount;
  }

  const mult =
    computeStatDamageMultiplier(def.colors, effectiveStats) *
    computeGearTierMultiplier(weapon.level, weapon.forgeGrade) *
    computeAffixDamageMultiplier(weapon.affixIds, false);

  const cycleSec = Math.max(0.12, totalTicks / FIXED_SIM_HZ);
  const baseDps = Math.max(1, Math.round((totalDmg * mult) / cycleSec));
  const critDps = Math.max(1, Math.round(baseDps * def.critMultiplier));
  const avgBreach = Number((totalBreach / def.stages.length).toFixed(2));
  return { baseDps, critDps, avgBreach };
}

export function formatWeaponQualityBadge(level: QualityTier, grade: ForgeGrade): string {
  return `${level}${FORGE_GRADE_BONUS[grade].suffix}`;
}

export function projectWeaponSlotView(
  inst: RolledWeaponInstance,
  stats: Readonly<Record<StatColor, number>>,
  partnerAffixIds: readonly string[],
  partnerSkillProvidedTags: readonly SynergySemanticTag[] = []
): WeaponCompareSlotView {
  const def = WEAPON_CATALOG[inst.weaponId];
  const { baseDps, critDps, avgBreach } = computeWeaponScaledDps(inst, stats);

  const partnerProvides = new Set<SynergySemanticTag>(partnerSkillProvidedTags);
  const partnerConsumes = new Set<SynergySemanticTag>();
  for (const pid of partnerAffixIds) {
    const spec = AFFIX_BY_ID[pid as AffixId];
    if (!spec) continue;
    spec.providesTags.forEach((t) => partnerProvides.add(t));
    spec.consumesTags.forEach((t) => partnerConsumes.add(t));
  }

  return {
    weapon: inst,
    nameZh: def.nameZh,
    nameEn: def.nameEn,
    iconSlot: def.iconSlot,
    qualityBadge: formatWeaponQualityBadge(inst.level, inst.forgeGrade),
    colors: def.colors,
    scaledDps: baseDps,
    critDps,
    avgBreach,
    critSummaryZh: def.critSummaryZh,
    mechanicSummaryZh: def.mechanicSummaryZh,
    flavorInscriptionZh: def.flavorInscriptionZh,
    affixes: inst.affixIds.map((id) => {
      const spec = AFFIX_BY_ID[id as AffixId];
      const matchesPartner = Boolean(
        spec &&
          (spec.consumesTags.some((t) => partnerProvides.has(t)) ||
            spec.providesTags.some((t) => partnerConsumes.has(t)))
      );
      return {
        id,
        rarity: spec?.rarity ?? 'COMMON',
        labelZh: spec?.labelZh ?? id,
        hasSynergyWithOtherSlot: matchesPartner,
      };
    }),
  };
}

export { AFFIX_CATALOG };
