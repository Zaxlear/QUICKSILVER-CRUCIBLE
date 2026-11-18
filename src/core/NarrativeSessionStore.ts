/**
 * 跨场景叙事递进、武器悬吊瓶图鉴与双结局/隐藏 P3 状态机（src/core/NarrativeSessionStore.ts）。
 *
 * 严格遵循 core 层单向依赖铁律：仅依赖 src/data/，零 Phaser/DOM 引用，
 * 为 Milestone 10 的 CRDT MetaProgressionRecord 提供 1:1 内存态底座。
 */

import {
  ALL_TRUE_ENDING_SEALS,
  LORE_ROOMS_CATALOG,
  NPC_DIALOGUE_LINES,
  type BossId,
  type EndingOutcomeId,
  type LoreRoomEntrySpec,
  type NpcDialogueLineSpec,
  type NpcGuardContext,
  type NpcSpeakerId,
  type TrueEndingSealFlag,
} from '../data/dialogue.data';
import { ALL_RUNE_IDS, type RuneId } from '../data/runes.data';
import type { MetaProgressionRecord } from '../data/storage.data';
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
    case 'vesper_01': return ctx.currentBiomeId === 'biome_01_slag_retort';
    case 'vesper_02': return ctx.currentBiomeId === 'biome_01_slag_retort';
    case 'vesper_03': return ctx.currentBiomeId === 'biome_02_vitriol_sewers';
    case 'vesper_04': return ctx.currentBiomeId === 'biome_02_vitriol_sewers' && hasRune('rune_mercury_conduit');
    case 'vesper_05': return ctx.currentBiomeId === 'biome_03_clockwork_ossuary';
    case 'vesper_06': return ctx.currentBiomeId === 'biome_03_clockwork_ossuary';
    case 'vesper_07': return ctx.isPlayerCursed;
    case 'vesper_08': return ctx.currentBiomeId === 'biome_04_crucible_apex';
    case 'vesper_09': return ctx.currentBiomeId === 'biome_04_crucible_apex';
    case 'vesper_10': return ctx.normalEndingCleared;
    case 'vesper_11': return ctx.currentBiomeId === 'biome_04_crucible_apex' && ctx.sealCount >= 3;
    default: return false;
  }
}

export class NarrativeSessionStore {
  private readonly seenDialogues = new Set<string>();
  private readonly discoveredLore = new Set<string>();
  private readonly seals = new Set<TrueEndingSealFlag>();
  private readonly weapons = new Set<WeaponId>([
    'wpn_rust_scalpel', 'wpn_alembic_bow', 'wpn_slag_buckler', 'wpn_quicksilver_rapier',
  ]);
  private readonly runes = new Set<RuneId>(['rune_magnetic_claws', 'rune_calcined_ram']);
  private readonly defeatedBosses = new Set<BossId>();

  public prologueCompleted = false;
  public deathCount = 0;
  public forgeUpgradeCount = 0;
  public forgePlusPct = 0;
  public forgeDoublePlusPct = 0;
  public maxCrucibleHeat: 0 | 1 | 2 | 3 | 4 | 5 = 0;
  public normalEndingCleared = false;
  public trueEndingCleared = false;
  public unlockedPurePrimaSkin = false;
  private endingState: EndingOutcomeId = 'NONE';

  public get seenNpcDialogueIds(): readonly string[] { return Array.from(this.seenDialogues); }
  public get discoveredLoreIds(): readonly string[] { return Array.from(this.discoveredLore); }
  public get collectedSeals(): readonly TrueEndingSealFlag[] { return Array.from(this.seals); }
  public get unlockedWeapons(): readonly WeaponId[] { return Array.from(this.weapons); }
  public get unlockedRunes(): readonly RuneId[] { return Array.from(this.runes); }
  public get currentEndingState(): EndingOutcomeId { return this.endingState; }
  public get hasAllThreeSeals(): boolean { return ALL_TRUE_ENDING_SEALS.every((f) => this.seals.has(f)); }

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
  public syncUnlockedRunes(runeIds: readonly RuneId[]): void { for (const r of runeIds) this.runes.add(r); }

  /** 从 CRDT 局外永久进度记录幂等水合内存态（绝不覆盖回退本地增量） */
  public hydrateFromMeta(meta: MetaProgressionRecord): void {
    for (const r of meta.unlockedRunes) {
      if ((ALL_RUNE_IDS as readonly string[]).includes(r)) this.runes.add(r as RuneId);
    }
    for (const w of meta.unlockedWeapons) {
      if ((ALL_WEAPON_IDS as readonly string[]).includes(w)) this.weapons.add(w as WeaponId);
    }
    for (const l of meta.discoveredLoreIds) this.discoveredLore.add(l);
    for (const d of meta.seenNpcDialogueIds) this.seenDialogues.add(d);
    for (const s of meta.trueEndingFlags) {
      if ((ALL_TRUE_ENDING_SEALS as readonly string[]).includes(s)) this.seals.add(s as TrueEndingSealFlag);
    }
    this.maxCrucibleHeat = Math.max(this.maxCrucibleHeat, meta.maxCrucibleHeat) as 0 | 1 | 2 | 3 | 4 | 5;
    if (meta.totalRunsCleared > 0 || meta.maxCrucibleHeat >= 1) this.normalEndingCleared = true;
    if (meta.forgeTierProgress.plus_tier_ichor > 0) {
      this.forgePlusPct = Math.max(this.forgePlusPct, Math.min(100, Math.round((meta.forgeTierProgress.plus_tier_ichor / 320) * 100)));
      this.forgeUpgradeCount = Math.max(this.forgeUpgradeCount, 1);
    }
    if (meta.seenNpcDialogueIds.length > 0 || meta.totalRunsStarted > 0) {
      this.prologueCompleted = true;
    }
  }

  public recordBossDefeated(bossId: BossId): void {
    this.defeatedBosses.add(bossId);
    if (bossId === 'boss_01_furnace_warden') {
      this.runes.add('rune_calcined_ram');
      this.weapons.add('wpn_athanor_cleaver');
    }
  }

  public hasDefeatedBoss(bossId: BossId): boolean { return this.defeatedBosses.has(bossId); }
  public recordPlayerDeath(): void { this.deathCount += 1; }

  public recordForgeInvestment(plusDeltaPct = 10): void {
    this.forgeUpgradeCount += 1;
    if (this.forgePlusPct < 100) this.forgePlusPct = Math.min(100, this.forgePlusPct + plusDeltaPct);
    else this.forgeDoublePlusPct = Math.min(100, this.forgeDoublePlusPct + plusDeltaPct);
  }

  public selectNextNpcDialogue(speakerId: NpcSpeakerId, ctx: NpcGuardContext): NpcDialogueLineSpec {
    const candidates = NPC_DIALOGUE_LINES.filter(
      (line) => line.speakerId === speakerId && isNpcDialogueGuardSatisfied(line.id, ctx)
    );
    const firstMeetId = `${speakerId}_01`;
    const firstMeet = candidates.find((c) => c.id === firstMeetId);
    if (firstMeet && !this.seenDialogues.has(firstMeetId) && ctx.sealCount < 3) {
      this.seenDialogues.add(firstMeet.id);
      return firstMeet;
    }
    const unread = candidates.filter((c) => !this.seenDialogues.has(c.id)).sort((a, b) => b.priority - a.priority);
    const chosen =
      unread[0] ??
      [...candidates].sort((a, b) => b.priority - a.priority)[0] ??
      NPC_DIALOGUE_LINES.find((l) => l.speakerId === speakerId)!;
    this.seenDialogues.add(chosen.id);
    return chosen;
  }

  public discoverLoreEntry(loreId: string): {
    readonly entry: LoreRoomEntrySpec;
    readonly isFirstDiscovery: boolean;
    readonly ichorGranted: number;
    readonly newlyUnlockedSeal: TrueEndingSealFlag | null;
  } {
    const entry = LORE_ROOMS_CATALOG[loreId] ?? LORE_ROOMS_CATALOG.lore_01_quarantine_notice!;
    const isFirstDiscovery = !this.discoveredLore.has(entry.id);
    this.discoveredLore.add(entry.id);
    let newlyUnlockedSeal: TrueEndingSealFlag | null = null;
    if (entry.grantsSealFlag && this.grantSeal(entry.grantsSealFlag)) {
      newlyUnlockedSeal = entry.grantsSealFlag;
    }
    return { entry, isFirstDiscovery, ichorGranted: isFirstDiscovery ? entry.firstReadIchorReward : 0, newlyUnlockedSeal };
  }

  public resetArenaEndingFlow(): void { this.endingState = 'NONE'; }

  public onParacelsusPhase2Defeated(): EndingOutcomeId {
    if (!this.hasAllThreeSeals) return this.commitFalseEnding();
    this.endingState = 'AWAITING_ALKAHEST_CHOICE';
    return this.endingState;
  }

  public resolveAlkahestChoice(choice: 'USURP_THRONE' | 'INJECT_ALKAHEST'): EndingOutcomeId {
    if (this.endingState !== 'AWAITING_ALKAHEST_CHOICE') return this.endingState;
    if (choice === 'USURP_THRONE') return this.commitFalseEnding();
    this.endingState = 'IN_PHASE_3_ALKAHEST';
    return this.endingState;
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
