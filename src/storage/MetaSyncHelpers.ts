/**
 * 局外进度运行态同步、状态面板投影与圣所冲突演练兜底快照辅助纯函数
 * （src/storage/MetaSyncHelpers.ts）。
 */

import { computeMaxHpFromStats } from '../combat/DamageCalculator';
import { NarrativeStore } from '../core/NarrativeSessionStore';
import type {
  ActiveRunSnapshot,
  CloudSyncStatusSnapshot,
  MetaProgressionRecord,
  RunHistoryLogEntry,
  SnapshotConflictState,
  SyncConnectionMode,
} from '../data/storage.data';
import { bumpLocalMetaRevision } from './CrdtMetaMerger';
import { createSecureUuid, signActiveRunSnapshot } from './SaveSchema';
import type { AuthSessionSummary } from './SupabaseClient';

/** 将 NarrativeStore 中产生的新符文/武器蓝图/剧情/真名封印增量并入持久化 MetaProgressionRecord */
export async function syncNarrativeIntoMetaRecord(
  current: MetaProgressionRecord,
  extraPatch?: {
    readonly killArchetypeId?: string;
    readonly killBatch?: Readonly<Record<string, number>>;
    readonly forgeSpendIchor?: number;
    readonly bankedIchorDelta?: number;
    readonly startedNewRun?: boolean;
    readonly clearedRun?: boolean;
  }
): Promise<MetaProgressionRecord> {
  const nextKills = { ...current.bestiaryKillCounts };
  if (extraPatch?.killArchetypeId) {
    const key = extraPatch.killArchetypeId;
    nextKills[key] = (nextKills[key] ?? 0) + 1;
  }
  if (extraPatch?.killBatch) {
    for (const [key, delta] of Object.entries(extraPatch.killBatch)) {
      if (delta > 0) nextKills[key] = (nextKills[key] ?? 0) + delta;
    }
  }

  const nextForge = {
    ...current.forgeTierProgress,
    plus_tier_ichor: Math.max(
      current.forgeTierProgress.plus_tier_ichor,
      Math.round((NarrativeStore.forgePlusPct / 100) * 320) + (extraPatch?.forgeSpendIchor ?? 0)
    ),
    s_tier_ichor: Math.max(
      current.forgeTierProgress.s_tier_ichor,
      Math.round((NarrativeStore.forgeDoublePlusPct / 100) * 480)
    ),
  };

  return bumpLocalMetaRevision(current, {
    unlockedRunes: NarrativeStore.unlockedRunes,
    unlockedWeapons: NarrativeStore.unlockedWeapons,
    discoveredLoreIds: NarrativeStore.discoveredLoreIds,
    seenNpcDialogueIds: NarrativeStore.seenNpcDialogueIds,
    trueEndingFlags: NarrativeStore.collectedSeals,
    bestiaryKillCounts: nextKills,
    forgeTierProgress: nextForge,
    maxCrucibleHeat: Math.max(current.maxCrucibleHeat, NarrativeStore.maxCrucibleHeat) as 0 | 1 | 2 | 3 | 4 | 5,
    bankedIchor: Math.max(0, current.bankedIchor + (extraPatch?.bankedIchorDelta ?? 0)),
    totalRunsStarted: current.totalRunsStarted + (extraPatch?.startedNewRun ? 1 : 0),
    totalRunsCleared: current.totalRunsCleared + (extraPatch?.clearedRun ? 1 : 0),
  });
}

export function buildCloudSyncStatusSnapshot(params: {
  readonly drawerOpen: boolean;
  readonly gatewayMode: SyncConnectionMode;
  readonly isOnline: boolean;
  readonly pwaSwReady: boolean;
  readonly fsmState: SnapshotConflictState;
  readonly session: AuthSessionSummary;
  readonly deviceId: string;
  readonly deviceLabel: string;
  readonly lastSyncedAt: string | null;
  readonly statusMessageZh: string;
  readonly tamperInterceptCount: number;
  readonly meta: MetaProgressionRecord;
  readonly activeRun: ActiveRunSnapshot | null;
}): CloudSyncStatusSnapshot {
  const { meta } = params;
  const totalBestiaryKills = Object.values(meta.bestiaryKillCounts).reduce((s, n) => s + n, 0);
  const effectiveMode: SyncConnectionMode = !params.isOnline ? 'OFFLINE' : params.gatewayMode;

  return {
    drawerOpen: params.drawerOpen,
    connectionMode: effectiveMode,
    isNetworkOnline: params.isOnline,
    pwaSwReady: params.pwaSwReady,
    fsmState: params.fsmState,
    userId: params.session.userId,
    displayMoniker: params.session.displayMoniker,
    isPromotedAccount: params.session.isPromotedAccount,
    boundEmail: params.session.boundEmail,
    deviceId: params.deviceId,
    deviceLabel: params.deviceLabel,
    lastSyncedAt: params.lastSyncedAt,
    statusMessageZh: params.statusMessageZh,
    tamperInterceptCount: params.tamperInterceptCount,
    metaSha256Short: meta.payloadSha256.slice(0, 16),
    hasActiveLocalRun: params.activeRun?.lifecycleState === 'ACTIVE',
    metaSummary: {
      crdtRevision: meta.crdtRevision,
      unlockedRunesCount: meta.unlockedRunes.length,
      unlockedWeaponsCount: meta.unlockedWeapons.length,
      sealCount: meta.trueEndingFlags.length,
      bankedIchor: meta.bankedIchor,
      maxCrucibleHeat: meta.maxCrucibleHeat,
      totalRunsStarted: meta.totalRunsStarted,
      totalRunsCleared: meta.totalRunsCleared,
      totalBestiaryKills,
    },
  };
}

export function buildRunHistoryArchiveEntry(
  closed: ActiveRunSnapshot,
  outcome: 'VICTORY' | 'DEAD' | 'ABANDONED',
  killedById: string | null
): RunHistoryLogEntry {
  return {
    runId: closed.runId,
    outcome,
    runSeed: closed.runSeed,
    reachedBiome: closed.biomeId,
    killedById,
    playtimeMs: closed.playtimeMs,
    finalLoadout: closed.loadoutSummary,
    finishedAt: new Date().toISOString(),
  };
}

/** 当玩家尚在圣所且未出发时触发冲突演练，为其生成一份代表本机矿渣蒸馏厂进度的签名快照 */
export async function buildFallbackSanctumLocalSnapshot(
  deviceId: string,
  deviceLabel: string
): Promise<ActiveRunSnapshot> {
  const stats = { rubedo: 3, citrinitas: 2, albedo: 2 } as const;
  const maxHp = computeMaxHpFromStats(stats);
  const currentHp = Math.min(maxHp, 248);
  return signActiveRunSnapshot({
    runId: createSecureUuid(),
    schemaVersion: 1,
    lifecycleState: 'ACTIVE',
    deviceId,
    deviceLabel,
    runSeed: 0x51c0ffee,
    rngInternalState: 0x51c0ffee,
    rngStepCount: 6,
    biomeId: 'biome_01_slag_retort',
    biomeDepth: 1,
    currentRoomId: 'room_00_entrance',
    spawnCheckpointId: 'stele_room_00_entrance',
    playtimeMs: 9 * 60 * 1000 + 42 * 1000,
    playerSnapshot: {
      currentHp,
      maxHp,
      rallyOrangeHp: 0,
      flaskChargesLeft: 1,
      maxFlaskCharges: 1,
      carriedGold: 320,
      unbankedIchor: 45,
      stats,
      primaryWeapon: {
        instanceId: 'wpn_local_cleaver',
        weaponId: 'wpn_athanor_cleaver',
        level: 'II',
        forgeGrade: 'PLUS',
        bonusStatColor: 'rubedo',
        affixIds: ['afx_dmg_on_oil_burn'],
      },
      secondaryWeapon: {
        instanceId: 'wpn_local_buckler',
        weaponId: 'wpn_slag_buckler',
        level: 'I',
        forgeGrade: 'BASE',
        bonusStatColor: null,
        affixIds: ['afx_shield_parry_poison'],
      },
      skillSlotOne: {
        instanceId: 'skl_local_flask',
        skillId: 'skl_vitriol_flask',
        level: 'II',
        forgeGrade: 'PLUS',
        affixIds: ['afx_dmg_on_oil_burn'],
        cooldownRemainingMs: 0,
      },
      skillSlotTwo: {
        instanceId: 'skl_local_turret',
        skillId: 'skl_tesla_coil_turret',
        level: 'II',
        forgeGrade: 'PLUS',
        affixIds: ['afx_grenade_voltaic_net'],
        cooldownRemainingMs: 0,
      },
      activeMutationIds: ['mut_crimson_frenzy', 'mut_tactical_reload'],
      killStreakCount: 6,
    },
    loadoutSummary: {
      primaryWeaponId: 'wpn_athanor_cleaver',
      secondaryWeaponId: 'wpn_slag_buckler',
      skillOneId: 'skl_vitriol_flask',
      skillTwoId: 'skl_tesla_coil_turret',
      statCounts: stats,
      currentHp,
      maxHp,
    },
    worldDelta: {
      clearedRoomIds: [],
      openedChestIds: [],
      activatedTeleporterIds: ['room_00_entrance'],
      purchasedShopSlotIds: [],
      droppedFloorLoot: [],
    },
    revision: 2,
    baseRevision: 1,
    clientSavedAt: new Date().toISOString(),
  });
}
