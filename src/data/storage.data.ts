/**
 * 《水银坩埚（QUICKSILVER CRUCIBLE）》双轨存档协议（Local-First + Cloud Sync）纯静态类型契约与常量表
 * （src/data/storage.data.ts）。
 *
 * 严格遵循单向依赖铁律：零运行时模块依赖，100% 对齐 docs/01_ARCHITECTURE_AND_SYNC.md §3.1 ~ §3.4。
 */

import type { BiomeId } from './runes.data';
import type { SkillId } from './skills.data';
import type { ForgeGrade, QualityTier, StatColor, WeaponId } from './weapons.data';

export type { BiomeId, ForgeGrade, QualityTier, SkillId, StatColor, WeaponId };

export type RunLifecycleState = 'ACTIVE' | 'VICTORY' | 'DEAD' | 'ABANDONED';

export interface SerializedWeaponInstance {
  readonly instanceId: string;
  readonly weaponId: WeaponId;
  readonly level: QualityTier;
  readonly forgeGrade: ForgeGrade;
  readonly bonusStatColor: StatColor | null;
  readonly affixIds: readonly string[];
  readonly isColorlessLegendary?: boolean;
}

export interface SerializedSkillInstance {
  readonly instanceId: string;
  readonly skillId: SkillId;
  readonly level: QualityTier;
  readonly forgeGrade: ForgeGrade;
  readonly affixIds: readonly string[];
  readonly cooldownRemainingMs: number;
}

export interface LoadoutVisualSummary {
  readonly primaryWeaponId: WeaponId | null;
  readonly secondaryWeaponId: WeaponId | null;
  readonly skillOneId: SkillId | null;
  readonly skillTwoId: SkillId | null;
  readonly statCounts: Readonly<Record<StatColor, number>>;
  readonly currentHp: number;
  readonly maxHp: number;
}

export interface PlayerRunStateSnapshot {
  readonly currentHp: number;
  readonly maxHp: number;
  readonly rallyOrangeHp: number;
  readonly flaskChargesLeft: number;
  readonly maxFlaskCharges: number;
  readonly carriedGold: number;
  readonly unbankedIchor: number;
  readonly stats: Readonly<Record<StatColor, number>>;
  readonly primaryWeapon: SerializedWeaponInstance | null;
  readonly secondaryWeapon: SerializedWeaponInstance | null;
  readonly skillSlotOne: SerializedSkillInstance | null;
  readonly skillSlotTwo: SerializedSkillInstance | null;
  readonly activeMutationIds: readonly string[];
  readonly killStreakCount: number;
  readonly cursedKillsRemaining?: number;
  readonly carriedBlueprints?: readonly string[];
}

export interface DroppedFloorLootEntry {
  readonly roomId: string;
  readonly x: number;
  readonly y: number;
  readonly item: SerializedWeaponInstance | SerializedSkillInstance;
}

export interface WorldDeltaSnapshot {
  readonly clearedRoomIds: readonly string[];
  readonly openedChestIds: readonly string[];
  readonly activatedTeleporterIds: readonly string[];
  readonly purchasedShopSlotIds: readonly string[];
  readonly droppedFloorLoot: readonly DroppedFloorLootEntry[];
}

export interface ActiveRunSnapshot {
  readonly runId: string;
  readonly schemaVersion: 1;
  readonly lifecycleState: RunLifecycleState;
  readonly deviceId: string;
  readonly deviceLabel: string;
  readonly runSeed: number;
  readonly rngInternalState: number;
  readonly rngStepCount: number;
  readonly biomeId: BiomeId;
  readonly biomeDepth: 1 | 2 | 3 | 4;
  readonly currentRoomId: string;
  readonly spawnCheckpointId: string;
  readonly playtimeMs: number;
  readonly playerSnapshot: PlayerRunStateSnapshot;
  readonly loadoutSummary: LoadoutVisualSummary;
  readonly worldDelta: WorldDeltaSnapshot;
  readonly revision: number;
  readonly baseRevision: number;
  readonly clientSavedAt: string;
  readonly payloadSha256: string;
}

export interface ForgeTierProgressMap {
  readonly plus_tier_ichor: number;
  readonly pp_tier_ichor?: number;
  readonly s_tier_ichor: number;
  readonly flask_charges: number;
  readonly gold_reserve_lvl: number;
  readonly recycle_lvl?: number;
  readonly starter_tubes_lvl?: number;
  readonly shop_restock_lvl?: number;
}

export interface MetaProgressionRecord {
  readonly schemaVersion: 1;
  readonly unlockedRunes: readonly string[];
  readonly unlockedWeapons: readonly string[];
  readonly unlockedSkills: readonly string[];
  readonly unlockedMutations: readonly string[];
  readonly discoveredLoreIds: readonly string[];
  readonly seenNpcDialogueIds: readonly string[];
  readonly trueEndingFlags: readonly string[];
  readonly blueprintIchorMap: Readonly<Record<string, number>>;
  readonly forgeTierProgress: ForgeTierProgressMap;
  readonly bestiaryKillCounts: Readonly<Record<string, number>>;
  readonly bankedIchor: number;
  readonly maxCrucibleHeat: 0 | 1 | 2 | 3 | 4 | 5;
  readonly totalRunsStarted: number;
  readonly totalRunsCleared: number;
  readonly crdtRevision: number;
  readonly payloadSha256: string;
}

export interface RunHistoryLogEntry {
  readonly runId: string;
  readonly outcome: 'VICTORY' | 'DEAD' | 'ABANDONED';
  readonly runSeed: number;
  readonly reachedBiome: BiomeId;
  readonly killedById: string | null;
  readonly playtimeMs: number;
  readonly finalLoadout: LoadoutVisualSummary;
  readonly finishedAt: string;
}

export type SnapshotConflictState =
  | 'BOOT_LOCAL_READ'
  | 'OFFLINE_PLAYING'
  | 'META_CRDT_SYNC'
  | 'SNAPSHOT_ARBITRATION'
  | 'SYNCED_IDLE'
  | 'AUTO_PULL_REMOTE'
  | 'AUTO_PUSH_LOCAL'
  | 'CONFLICT_MODAL_OPEN'
  | 'FORCE_PUSH_LOCAL'
  | 'ADOPT_REMOTE_SNAPSHOT';

export type SyncConnectionMode = 'SUPABASE_CLOUD' | 'LOCAL_LOOPBACK' | 'OFFLINE';
export type SaveConflictChoice = 'KEEP_LOCAL' | 'ADOPT_REMOTE';
export type AuthPromoteMethod = 'magic_link' | 'github' | 'google';

export interface CloudSyncStatusSnapshot {
  readonly drawerOpen: boolean;
  readonly connectionMode: SyncConnectionMode;
  readonly isNetworkOnline: boolean;
  readonly pwaSwReady: boolean;
  readonly fsmState: SnapshotConflictState;
  readonly userId: string;
  readonly displayMoniker: string;
  readonly isPromotedAccount: boolean;
  readonly boundEmail: string | null;
  readonly deviceId: string;
  readonly deviceLabel: string;
  readonly lastSyncedAt: string | null;
  readonly statusMessageZh: string;
  readonly tamperInterceptCount: number;
  readonly metaSha256Short: string;
  readonly hasActiveLocalRun: boolean;
  readonly metaSummary: {
    readonly crdtRevision: number;
    readonly unlockedRunesCount: number;
    readonly unlockedWeaponsCount: number;
    readonly sealCount: number;
    readonly bankedIchor: number;
    readonly maxCrucibleHeat: number;
    readonly totalRunsStarted: number;
    readonly totalRunsCleared: number;
    readonly totalBestiaryKills: number;
  };
}

export interface SaveConflictModalPayload {
  readonly open: boolean;
  readonly localSnapshot: ActiveRunSnapshot;
  readonly remoteSnapshot: ActiveRunSnapshot;
  readonly detectedAt: string;
}

export const INTEGRITY_DOMAIN_SALT = 'QUICKSILVER_CRUCIBLE_V1_INTEGRITY' as const;

export const DEFAULT_STARTER_WEAPONS: readonly string[] = [
  'wpn_alembic_bow',
  'wpn_athanor_cleaver',
  'wpn_rust_scalpel',
  'wpn_slag_buckler',
] as const;

export const DEFAULT_STARTER_SKILLS: readonly string[] = [
  'skl_clockwork_saw_trap',
  'skl_cryo_mercury_nova',
  'skl_vitriol_flask',
] as const;

export const DEFAULT_STARTER_MUTATIONS: readonly string[] = [
  'mut_crimson_frenzy',
  'mut_emergency_carapace',
  'mut_gastronomy_distill',
  'mut_point_blank',
  'mut_predator_veil',
  'mut_tactical_reload',
] as const;

export const DEFAULT_FORGE_TIER_PROGRESS: ForgeTierProgressMap = {
  plus_tier_ichor: 0,
  s_tier_ichor: 0,
  flask_charges: 1,
  gold_reserve_lvl: 0,
} as const;

export const BIOME_DEPTH_BY_ID: Readonly<Record<BiomeId, 1 | 2 | 3 | 4>> = {
  biome_01_slag_retort: 1,
  biome_02_vitriol_sewers: 2,
  biome_03_clockwork_ossuary: 3,
  biome_04_crucible_apex: 4,
} as const;

export const BIOME_BANNER_Meta: Readonly<
  Record<
    BiomeId,
    {
      readonly depthRoman: 'I' | 'II' | 'III' | 'IV';
      readonly titleZh: string;
      readonly bannerUrl: string;
      readonly accentHex: string;
    }
  >
> = {
  biome_01_slag_retort: {
    depthRoman: 'I',
    titleZh: '第一层：矿渣蒸馏厂',
    bannerUrl: '/assets/tilemaps/biome01_parallax_L2.png',
    accentHex: '#FF5E2B',
  },
  biome_02_vitriol_sewers: {
    depthRoman: 'II',
    titleZh: '第二层：矾酸暗渠',
    bannerUrl: '/assets/tilemaps/biome02_parallax_L2.png',
    accentHex: '#3CE682',
  },
  biome_03_clockwork_ossuary: {
    depthRoman: 'III',
    titleZh: '第三层：发条骸骨堂',
    bannerUrl: '/assets/tilemaps/biome03_parallax_L2.png',
    accentHex: '#38BDF8',
  },
  biome_04_crucible_apex: {
    depthRoman: 'IV',
    titleZh: '第四层：星界熔炉之巅',
    bannerUrl: '/assets/tilemaps/biome04_parallax_L2.png',
    accentHex: '#E0AE53',
  },
} as const;
