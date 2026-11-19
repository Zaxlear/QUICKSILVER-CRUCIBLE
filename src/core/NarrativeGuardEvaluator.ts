/**
 * NPC 台词前置条件守卫求值器与大熔炉/蓝图池纯状态规约函数
 * （src/core/NarrativeGuardEvaluator.ts）。
 *
 * 严格遵循 core 层单向依赖铁律：仅依赖 src/data/，零运行时副作用。
 */

import { ALL_TRUE_ENDING_SEALS, type NpcGuardContext, type TrueEndingSealFlag } from '../data/dialogue.data';
import {
  BLUEPRINT_BY_ID,
  BLUEPRINT_UNLOCK_CATALOG,
  type CollectorBlueprintEntryView,
} from '../data/economy.data';
import { ALL_MUTATION_IDS, type ForgeUpgradeId, type MutationId } from '../data/mutations.data';
import { ALL_RUNE_IDS, type RuneId } from '../data/runes.data';
import { ALL_SKILL_IDS, type SkillId } from '../data/skills.data';
import type { ForgeTierProgressMap, MetaProgressionRecord } from '../data/storage.data';
import { ALL_WEAPON_IDS, type WeaponId } from '../data/weapons.data';

export function isNpcDialogueGuardSatisfied(lineId: string, ctx: NpcGuardContext): boolean {
  const hasRune = (r: RuneId): boolean => ctx.unlockedRunes.includes(r);
  switch (lineId) {
    case 'corvus_01': return true;
    case 'corvus_02': return ctx.forgeUpgradeCount >= 1;
    case 'corvus_03': return ctx.deathCount >= 1;
    case 'corvus_04': return hasRune('rune_vitriol_tendril');
    case 'corvus_05': return hasRune('rune_mercury_conduit');
    case 'corvus_06': return ctx.currentBiomeId === 'biome_02_vitriol_sewers';
    case 'corvus_07': return ctx.defeatedBoss1;
    case 'corvus_08': return hasRune('rune_magnetic_claws');
    case 'corvus_09': return ctx.unlockedWeaponCount >= 8;
    case 'corvus_10': return ctx.normalEndingCleared || ctx.crucibleHeat >= 1;
    case 'corvus_11': return ctx.sealCount >= 1 && ctx.sealCount < 3;
    case 'corvus_12': return ctx.sealCount >= 3;
    case 'isolde_01': return true;
    case 'isolde_02': return ctx.forgePlusPct >= 50;
    case 'isolde_03': return ctx.forgePlusPct >= 100;
    case 'isolde_04': return ctx.holdingHeavyWeapon;
    case 'isolde_05': return ctx.holdingClockworkRepeater;
    case 'isolde_06': return ctx.defeatedBoss1 || ctx.currentBiomeId === 'sanctum';
    case 'isolde_07': return ctx.currentBiomeId === 'biome_04_crucible_apex';
    case 'isolde_08': return ctx.forgeDoublePlusPct >= 50;
    case 'isolde_09': return ctx.isPlayerLowHp;
    case 'isolde_10': return ctx.crucibleHeat >= 2;
    case 'isolde_11': return ctx.sealCount >= 3;
    case 'vesper_01':
    case 'vesper_02': return ctx.currentBiomeId === 'biome_01_slag_retort';
    case 'vesper_03': return ctx.currentBiomeId === 'biome_02_vitriol_sewers';
    case 'vesper_04': return ctx.currentBiomeId === 'biome_02_vitriol_sewers' && hasRune('rune_mercury_conduit');
    case 'vesper_05':
    case 'vesper_06': return ctx.currentBiomeId === 'biome_03_clockwork_ossuary';
    case 'vesper_07': return ctx.isPlayerCursed;
    case 'vesper_08':
    case 'vesper_09': return ctx.currentBiomeId === 'biome_04_crucible_apex';
    case 'vesper_10': return ctx.normalEndingCleared;
    case 'vesper_11': return ctx.currentBiomeId === 'biome_04_crucible_apex' && ctx.sealCount >= 3;
    default: return false;
  }
}

export function reduceForgeTierSpend(
  cur: ForgeTierProgressMap,
  upgradeId: ForgeUpgradeId,
  spentIchor: number
): ForgeTierProgressMap {
  switch (upgradeId) {
    case 'upg_legendary_forge_plus':
      return { ...cur, plus_tier_ichor: Math.min(800, cur.plus_tier_ichor + spentIchor) };
    case 'upg_legendary_forge_pp':
      return { ...cur, pp_tier_ichor: Math.min(1800, (cur.pp_tier_ichor ?? 0) + spentIchor) };
    case 'upg_legendary_forge_s':
      return { ...cur, s_tier_ichor: Math.min(3600, cur.s_tier_ichor + spentIchor) };
    case 'upg_flask_tier':
      return { ...cur, flask_charges: Math.min(4, cur.flask_charges + 1) };
    case 'upg_gold_reserve':
      return { ...cur, gold_reserve_lvl: Math.min(4, cur.gold_reserve_lvl + 1) };
    case 'upg_starting_recycle':
      return { ...cur, recycle_lvl: Math.min(2, (cur.recycle_lvl ?? 0) + 1) };
    case 'upg_starter_tubes':
      return { ...cur, starter_tubes_lvl: 1 };
    case 'upg_shop_restock':
      return { ...cur, shop_restock_lvl: Math.min(2, (cur.shop_restock_lvl ?? 0) + 1) };
  }
}

export function projectCollectorEntries(
  weapons: ReadonlySet<WeaponId>,
  skills: ReadonlySet<SkillId>,
  mutations: ReadonlySet<MutationId>,
  blueprintIchor: ReadonlyMap<string, number>
): readonly CollectorBlueprintEntryView[] {
  return BLUEPRINT_UNLOCK_CATALOG.map((spec) => {
    const id = spec.blueprintId;
    const isUnlocked =
      weapons.has(id as WeaponId) || skills.has(id as SkillId) || mutations.has(id as MutationId);
    const invested = isUnlocked ? spec.ichorCost : (blueprintIchor.get(id) ?? 0);
    return {
      spec,
      status: isUnlocked ? 'UNLOCKED' : blueprintIchor.has(id) ? 'REGISTERED' : 'UNDISCOVERED',
      investedIchor: invested,
    };
  });
}

export function investIntoBlueprintPool(params: {
  readonly blueprintId: string;
  readonly availableIchor: number;
  readonly requestedStep?: number;
  readonly blueprintIchor: Map<string, number>;
  readonly weapons: Set<WeaponId>;
  readonly skills: Set<SkillId>;
  readonly mutations: Set<MutationId>;
}): { readonly spent: number; readonly unlockedNow: boolean } {
  const { blueprintId, availableIchor, requestedStep, blueprintIchor, weapons, skills, mutations } = params;
  const spec = BLUEPRINT_BY_ID[blueprintId];
  if (!spec || availableIchor <= 0 || !blueprintIchor.has(blueprintId)) return { spent: 0, unlockedNow: false };
  const cur = blueprintIchor.get(blueprintId) ?? 0;
  if (cur >= spec.ichorCost) return { spent: 0, unlockedNow: false };
  const spent = Math.min(availableIchor, spec.ichorCost - cur, requestedStep ?? spec.ichorCost - cur);
  const next = cur + spent;
  blueprintIchor.set(blueprintId, next);
  const unlockedNow = next >= spec.ichorCost;
  if (unlockedNow) {
    if (spec.category === 'WEAPON') weapons.add(spec.blueprintId as WeaponId);
    else if (spec.category === 'SKILL') skills.add(spec.blueprintId as SkillId);
    else mutations.add(spec.blueprintId as MutationId);
  }
  return { spent, unlockedNow };
}

export function hydrateSetsFromMetaRecord(
  meta: MetaProgressionRecord,
  targets: {
    readonly runes: Set<RuneId>;
    readonly weapons: Set<WeaponId>;
    readonly skills: Set<SkillId>;
    readonly mutations: Set<MutationId>;
    readonly discoveredLore: Set<string>;
    readonly seenDialogues: Set<string>;
    readonly seals: Set<TrueEndingSealFlag>;
    readonly blueprintIchor: Map<string, number>;
    readonly currentForge: ForgeTierProgressMap;
  }
): ForgeTierProgressMap {
  for (const r of meta.unlockedRunes) if ((ALL_RUNE_IDS as readonly string[]).includes(r)) targets.runes.add(r as RuneId);
  for (const w of meta.unlockedWeapons) if ((ALL_WEAPON_IDS as readonly string[]).includes(w)) targets.weapons.add(w as WeaponId);
  for (const sk of meta.unlockedSkills) if ((ALL_SKILL_IDS as readonly string[]).includes(sk)) targets.skills.add(sk as SkillId);
  for (const m of meta.unlockedMutations) if ((ALL_MUTATION_IDS as readonly string[]).includes(m)) targets.mutations.add(m as MutationId);
  for (const l of meta.discoveredLoreIds) targets.discoveredLore.add(l);
  for (const d of meta.seenNpcDialogueIds) targets.seenDialogues.add(d);
  for (const s of meta.trueEndingFlags) if ((ALL_TRUE_ENDING_SEALS as readonly string[]).includes(s)) targets.seals.add(s as TrueEndingSealFlag);
  for (const [bpId, amt] of Object.entries(meta.blueprintIchorMap)) {
    targets.blueprintIchor.set(bpId, Math.max(targets.blueprintIchor.get(bpId) ?? 0, amt));
  }
  return {
    ...targets.currentForge,
    ...meta.forgeTierProgress,
    plus_tier_ichor: Math.max(targets.currentForge.plus_tier_ichor, meta.forgeTierProgress.plus_tier_ichor),
    s_tier_ichor: Math.max(targets.currentForge.s_tier_ichor, meta.forgeTierProgress.s_tier_ichor),
    flask_charges: Math.max(targets.currentForge.flask_charges, meta.forgeTierProgress.flask_charges),
    gold_reserve_lvl: Math.max(targets.currentForge.gold_reserve_lvl, meta.forgeTierProgress.gold_reserve_lvl),
  };
}
