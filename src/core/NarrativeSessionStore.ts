/**
 * 跨场景叙事递进、蓝图暂存/归档、大熔炉淬火池、秘银金库与双结局状态机
 * （src/core/NarrativeSessionStore.ts）。
 *
 * 严格遵循 core 层单向依赖铁律：仅依赖 src/data/ 与同层纯函数，行数严格 <= 240 行。
 */

import {
  ALL_TRUE_ENDING_SEALS, LORE_ROOMS_CATALOG, NPC_DIALOGUE_LINES,
  type BossId, type EndingOutcomeId, type LoreRoomEntrySpec, type NpcDialogueLineSpec,
  type NpcGuardContext, type NpcSpeakerId, type TrueEndingSealFlag,
} from '../data/dialogue.data';
import {
  BLUEPRINT_BY_ID, computeInheritedGoldOnDeath, ECONOMY_CONSTANTS, type CollectorBlueprintEntryView,
} from '../data/economy.data';
import type { ForgeUpgradeId, MutationId } from '../data/mutations.data';
import type { RuneId } from '../data/runes.data';
import type { SkillId } from '../data/skills.data';
import {
  DEFAULT_FORGE_TIER_PROGRESS, DEFAULT_STARTER_MUTATIONS, DEFAULT_STARTER_SKILLS, DEFAULT_STARTER_WEAPONS,
  type ForgeTierProgressMap, type MetaProgressionRecord,
} from '../data/storage.data';
import type { WeaponId } from '../data/weapons.data';
import {
  hydrateSetsFromMetaRecord, investIntoBlueprintPool, isNpcDialogueGuardSatisfied,
  projectCollectorEntries, reduceForgeTierSpend,
} from './NarrativeGuardEvaluator';

export { isNpcDialogueGuardSatisfied };

export class NarrativeSessionStore {
  private readonly seenDialogues = new Set<string>();
  private readonly discoveredLore = new Set<string>();
  private readonly seals = new Set<TrueEndingSealFlag>();
  private readonly weapons = new Set<WeaponId>(DEFAULT_STARTER_WEAPONS as readonly WeaponId[]);
  private readonly skills = new Set<SkillId>(DEFAULT_STARTER_SKILLS as readonly SkillId[]);
  private readonly mutations = new Set<MutationId>(DEFAULT_STARTER_MUTATIONS as readonly MutationId[]);
  private readonly runes = new Set<RuneId>();
  private readonly defeatedBosses = new Set<BossId>();
  private readonly blueprintIchor = new Map<string, number>();
  private readonly runCarriedBlueprints = new Set<string>();

  public forgeTiers: ForgeTierProgressMap = { ...DEFAULT_FORGE_TIER_PROGRESS };
  public prologueCompleted = false;
  public deathCount = 0;
  public forgeUpgradeCount = 0;
  public maxCrucibleHeat: 0 | 1 | 2 | 3 | 4 | 5 = 0;
  public normalEndingCleared = false;
  public trueEndingCleared = false;
  public unlockedPurePrimaSkin = false;
  private endingState: EndingOutcomeId = 'NONE';

  public get seenNpcDialogueIds(): readonly string[] { return Array.from(this.seenDialogues); }
  public get discoveredLoreIds(): readonly string[] { return Array.from(this.discoveredLore); }
  public get collectedSeals(): readonly TrueEndingSealFlag[] { return Array.from(this.seals); }
  public get unlockedWeapons(): readonly WeaponId[] { return Array.from(this.weapons); }
  public get unlockedSkills(): readonly SkillId[] { return Array.from(this.skills); }
  public get unlockedMutations(): readonly MutationId[] { return Array.from(this.mutations); }
  public get unlockedRunes(): readonly RuneId[] { return Array.from(this.runes); }
  public get carriedBlueprints(): readonly string[] { return Array.from(this.runCarriedBlueprints); }
  public get blueprintIchorRecord(): Readonly<Record<string, number>> { return Object.fromEntries(this.blueprintIchor); }
  public get currentEndingState(): EndingOutcomeId { return this.endingState; }
  public get hasAllThreeSeals(): boolean { return ALL_TRUE_ENDING_SEALS.every((f) => this.seals.has(f)); }
  public get forgePlusPct(): number {
    return Math.min(100, Math.round((this.forgeTiers.plus_tier_ichor / ECONOMY_CONSTANTS.FORGE_PLUS_MAX_ICHOR) * 100));
  }
  public get forgeDoublePlusPct(): number {
    return Math.min(100, Math.round(((this.forgeTiers.pp_tier_ichor ?? 0) / ECONOMY_CONSTANTS.FORGE_PP_MAX_ICHOR) * 100));
  }

  public hasSeal(flag: TrueEndingSealFlag): boolean { return this.seals.has(flag); }
  public grantSeal(flag: TrueEndingSealFlag): boolean {
    if (this.seals.has(flag)) return false;
    this.seals.add(flag);
    return true;
  }
  public toggleSeal(flag: TrueEndingSealFlag): boolean {
    if (this.seals.has(flag)) { this.seals.delete(flag); return false; }
    this.seals.add(flag);
    return true;
  }

  public unlockWeaponBlueprint(weaponId: WeaponId): void { this.weapons.add(weaponId); }
  public unlockSkillBlueprint(skillId: SkillId): void { this.skills.add(skillId); }
  public unlockMutationBlueprint(mutationId: MutationId): void { this.mutations.add(mutationId); }
  public syncUnlockedRunes(runeIds: readonly RuneId[]): void { for (const r of runeIds) this.runes.add(r); }
  public setUnlockedRunesExact(runeIds: readonly RuneId[]): void {
    this.runes.clear();
    for (const r of runeIds) this.runes.add(r);
  }

  public isBlueprintUnlockedOrRegistered(id: string): boolean {
    return (
      this.weapons.has(id as WeaponId) ||
      this.skills.has(id as SkillId) ||
      this.mutations.has(id as MutationId) ||
      this.blueprintIchor.has(id) ||
      this.runCarriedBlueprints.has(id)
    );
  }

  public stageCarriedBlueprint(blueprintId: string): boolean {
    if (!BLUEPRINT_BY_ID[blueprintId] || this.isBlueprintUnlockedOrRegistered(blueprintId)) return false;
    this.runCarriedBlueprints.add(blueprintId);
    return true;
  }

  public restoreCarriedBlueprints(ids: readonly string[] | undefined): void {
    this.runCarriedBlueprints.clear();
    for (const id of ids ?? []) if (BLUEPRINT_BY_ID[id]) this.runCarriedBlueprints.add(id);
  }

  public clearCarriedBlueprintsOnDeath(): void { this.runCarriedBlueprints.clear(); }

  public archiveCarriedBlueprints(): number {
    let added = 0;
    for (const id of this.runCarriedBlueprints) {
      if (!this.blueprintIchor.has(id)) { this.blueprintIchor.set(id, 0); added += 1; }
    }
    this.runCarriedBlueprints.clear();
    return added;
  }

  public investBlueprintIchor(blueprintId: string, availableIchor: number, requestedStep?: number): {
    readonly spent: number; readonly unlockedNow: boolean;
  } {
    return investIntoBlueprintPool({
      blueprintId, availableIchor, requestedStep,
      blueprintIchor: this.blueprintIchor, weapons: this.weapons, skills: this.skills, mutations: this.mutations,
    });
  }

  public buildCollectorEntries(): readonly CollectorBlueprintEntryView[] {
    return projectCollectorEntries(this.weapons, this.skills, this.mutations, this.blueprintIchor);
  }

  public computeDeathInheritedGold(carriedGold: number): number {
    return computeInheritedGoldOnDeath(carriedGold, this.forgeTiers.gold_reserve_lvl);
  }

  public applyForgeUpgradeSpend(upgradeId: ForgeUpgradeId, spentIchor: number): void {
    if (spentIchor <= 0) return;
    this.forgeUpgradeCount += 1;
    this.forgeTiers = reduceForgeTierSpend(this.forgeTiers, upgradeId, spentIchor);
  }

  public recordForgeInvestment(plusDeltaPct = 10): void {
    const addIchor = Math.max(1, Math.round((plusDeltaPct / 100) * ECONOMY_CONSTANTS.FORGE_PLUS_MAX_ICHOR));
    if (this.forgeTiers.plus_tier_ichor < ECONOMY_CONSTANTS.FORGE_PLUS_MAX_ICHOR) {
      this.applyForgeUpgradeSpend('upg_legendary_forge_plus', addIchor);
    } else {
      this.applyForgeUpgradeSpend('upg_legendary_forge_pp', Math.round((plusDeltaPct / 100) * ECONOMY_CONSTANTS.FORGE_PP_MAX_ICHOR));
    }
  }

  public hydrateFromMeta(meta: MetaProgressionRecord): void {
    this.forgeTiers = hydrateSetsFromMetaRecord(meta, {
      runes: this.runes, weapons: this.weapons, skills: this.skills, mutations: this.mutations,
      discoveredLore: this.discoveredLore, seenDialogues: this.seenDialogues, seals: this.seals,
      blueprintIchor: this.blueprintIchor, currentForge: this.forgeTiers,
    });
    if (this.forgeTiers.plus_tier_ichor > 0 || this.forgeTiers.gold_reserve_lvl > 0) this.forgeUpgradeCount = Math.max(this.forgeUpgradeCount, 1);
    this.maxCrucibleHeat = Math.max(this.maxCrucibleHeat, meta.maxCrucibleHeat) as 0 | 1 | 2 | 3 | 4 | 5;
    if (meta.totalRunsCleared > 0 || meta.maxCrucibleHeat >= 1) this.normalEndingCleared = true;
    if (meta.seenNpcDialogueIds.length > 0 || meta.totalRunsStarted > 0) this.prologueCompleted = true;
  }

  public recordBossDefeated(bossId: BossId): void {
    this.defeatedBosses.add(bossId);
    if (bossId === 'boss_01_furnace_warden') {
      this.runes.add('rune_calcined_ram');
      this.stageCarriedBlueprint('skl_tesla_coil_turret');
    }
  }

  public hasDefeatedBoss(bossId: BossId): boolean { return this.defeatedBosses.has(bossId); }
  public recordPlayerDeath(): void { this.deathCount += 1; }

  public selectNextNpcDialogue(speakerId: NpcSpeakerId, ctx: NpcGuardContext): NpcDialogueLineSpec {
    const candidates = NPC_DIALOGUE_LINES.filter((l) => l.speakerId === speakerId && isNpcDialogueGuardSatisfied(l.id, ctx));
    const firstMeet = candidates.find((c) => c.id === `${speakerId}_01`);
    if (firstMeet && !this.seenDialogues.has(firstMeet.id) && ctx.sealCount < 3 && !ctx.isPlayerCursed) {
      this.seenDialogues.add(firstMeet.id);
      return firstMeet;
    }
    const unread = candidates.filter((c) => !this.seenDialogues.has(c.id)).sort((a, b) => b.priority - a.priority);
    const chosen = unread[0] ?? [...candidates].sort((a, b) => b.priority - a.priority)[0] ?? NPC_DIALOGUE_LINES.find((l) => l.speakerId === speakerId)!;
    this.seenDialogues.add(chosen.id);
    return chosen;
  }

  public discoverLoreEntry(loreId: string): {
    readonly entry: LoreRoomEntrySpec; readonly isFirstDiscovery: boolean;
    readonly ichorGranted: number; readonly newlyUnlockedSeal: TrueEndingSealFlag | null;
  } {
    const entry = LORE_ROOMS_CATALOG[loreId] ?? LORE_ROOMS_CATALOG.lore_01_quarantine_notice!;
    const isFirstDiscovery = !this.discoveredLore.has(entry.id);
    this.discoveredLore.add(entry.id);
    const newlyUnlockedSeal = entry.grantsSealFlag && this.grantSeal(entry.grantsSealFlag) ? entry.grantsSealFlag : null;
    return { entry, isFirstDiscovery, ichorGranted: isFirstDiscovery ? entry.firstReadIchorReward : 0, newlyUnlockedSeal };
  }

  public resetArenaEndingFlow(): void { this.endingState = 'NONE'; }
  public onParacelsusPhase2Defeated(): EndingOutcomeId {
    return !this.hasAllThreeSeals ? this.commitFalseEnding() : (this.endingState = 'AWAITING_ALKAHEST_CHOICE');
  }
  public resolveAlkahestChoice(choice: 'USURP_THRONE' | 'INJECT_ALKAHEST'): EndingOutcomeId {
    if (this.endingState !== 'AWAITING_ALKAHEST_CHOICE') return this.endingState;
    return choice === 'USURP_THRONE' ? this.commitFalseEnding() : (this.endingState = 'IN_PHASE_3_ALKAHEST');
  }
  public onParacelsusPhase3Defeated(): EndingOutcomeId {
    this.endingState = 'END_TRUE_RETURN_PAIN';
    this.trueEndingCleared = true;
    this.unlockedPurePrimaSkin = true;
    this.defeatedBosses.add('boss_02_grand_alchemist');
    this.maxCrucibleHeat = Math.min(5, this.maxCrucibleHeat + 1) as 0 | 1 | 2 | 3 | 4 | 5;
    return this.endingState;
  }
  private commitFalseEnding(): EndingOutcomeId {
    this.endingState = 'END_FALSE_CALCIFICATION';
    this.normalEndingCleared = true;
    this.defeatedBosses.add('boss_02_grand_alchemist');
    this.maxCrucibleHeat = Math.min(5, this.maxCrucibleHeat + 1) as 0 | 1 | 2 | 3 | 4 | 5;
    return this.endingState;
  }
}

export const NarrativeStore = new NarrativeSessionStore();
