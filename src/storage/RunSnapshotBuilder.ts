/**
 * 局内进度快照（ActiveRunSnapshot）与可视化异端冲突演练快照构建器
 * （src/storage/RunSnapshotBuilder.ts）。
 */

import { computeMaxHpFromStats } from '../combat/DamageCalculator';
import {
  BIOME_DEPTH_BY_ID,
  type ActiveRunSnapshot,
  type BiomeId,
  type LoadoutVisualSummary,
  type PlayerRunStateSnapshot,
  type RunLifecycleState,
  type SerializedSkillInstance,
  type SerializedWeaponInstance,
  type WorldDeltaSnapshot,
} from '../data/storage.data';
import type { RolledSkillInstance } from '../data/skills.data';
import type { RolledWeaponInstance, StatColor } from '../data/weapons.data';
import { createSecureUuid, signActiveRunSnapshot } from './SaveSchema';

export interface LiveRunCaptureInput {
  readonly runId: string;
  readonly lifecycleState: RunLifecycleState;
  readonly deviceId: string;
  readonly deviceLabel: string;
  readonly runSeed: number;
  readonly rngInternalState: number;
  readonly rngStepCount: number;
  readonly biomeId: BiomeId;
  readonly currentRoomId: string;
  readonly spawnCheckpointId: string;
  readonly playtimeMs: number;
  readonly currentHp: number;
  readonly maxHp: number;
  readonly rallyOrangeHp: number;
  readonly flaskChargesLeft: number;
  readonly maxFlaskCharges: number;
  readonly carriedGold: number;
  readonly unbankedIchor: number;
  readonly stats: Readonly<Record<StatColor, number>>;
  readonly primaryWeapon: RolledWeaponInstance;
  readonly secondaryWeapon: RolledWeaponInstance;
  readonly skillSlotOne: RolledSkillInstance;
  readonly skillSlotTwo: RolledSkillInstance;
  readonly activeMutationIds: readonly string[];
  readonly killStreakCount: number;
  readonly worldDelta: WorldDeltaSnapshot;
  readonly revision: number;
  readonly baseRevision: number;
}

export function serializeWeaponInstance(w: RolledWeaponInstance): SerializedWeaponInstance {
  return {
    instanceId: w.instanceId,
    weaponId: w.weaponId,
    level: w.level,
    forgeGrade: w.forgeGrade,
    bonusStatColor: w.bonusStatColor,
    affixIds: [...w.affixIds],
  };
}

export function serializeSkillInstance(s: RolledSkillInstance): SerializedSkillInstance {
  return {
    instanceId: s.instanceId,
    skillId: s.skillId,
    level: s.level,
    forgeGrade: s.forgeGrade,
    affixIds: [...s.affixIds],
    cooldownRemainingMs: Math.max(0, Math.round(s.cooldownRemainingSec * 1000)),
  };
}

export async function buildSignedActiveRunSnapshot(
  input: LiveRunCaptureInput
): Promise<ActiveRunSnapshot> {
  const primary = serializeWeaponInstance(input.primaryWeapon);
  const secondary = serializeWeaponInstance(input.secondaryWeapon);
  const s1 = serializeSkillInstance(input.skillSlotOne);
  const s2 = serializeSkillInstance(input.skillSlotTwo);

  const playerSnapshot: PlayerRunStateSnapshot = {
    currentHp: Math.max(0, Math.round(input.currentHp)),
    maxHp: Math.max(1, Math.round(input.maxHp)),
    rallyOrangeHp: Math.max(0, Math.round(input.rallyOrangeHp)),
    flaskChargesLeft: input.flaskChargesLeft,
    maxFlaskCharges: input.maxFlaskCharges,
    carriedGold: input.carriedGold,
    unbankedIchor: input.unbankedIchor,
    stats: { ...input.stats },
    primaryWeapon: primary,
    secondaryWeapon: secondary,
    skillSlotOne: s1,
    skillSlotTwo: s2,
    activeMutationIds: [...input.activeMutationIds],
    killStreakCount: input.killStreakCount,
  };

  const loadoutSummary: LoadoutVisualSummary = {
    primaryWeaponId: primary.weaponId,
    secondaryWeaponId: secondary.weaponId,
    skillOneId: s1.skillId,
    skillTwoId: s2.skillId,
    statCounts: { ...input.stats },
    currentHp: playerSnapshot.currentHp,
    maxHp: playerSnapshot.maxHp,
  };

  return signActiveRunSnapshot({
    runId: input.runId,
    schemaVersion: 1,
    lifecycleState: input.lifecycleState,
    deviceId: input.deviceId,
    deviceLabel: input.deviceLabel,
    runSeed: input.runSeed >>> 0,
    rngInternalState: input.rngInternalState >>> 0,
    rngStepCount: Math.max(0, Math.floor(input.rngStepCount)),
    biomeId: input.biomeId,
    biomeDepth: BIOME_DEPTH_BY_ID[input.biomeId],
    currentRoomId: input.currentRoomId,
    spawnCheckpointId: input.spawnCheckpointId,
    playtimeMs: Math.max(0, Math.round(input.playtimeMs)),
    playerSnapshot,
    loadoutSummary,
    worldDelta: {
      clearedRoomIds: [...input.worldDelta.clearedRoomIds],
      openedChestIds: [...input.worldDelta.openedChestIds],
      activatedTeleporterIds: [...input.worldDelta.activatedTeleporterIds],
      purchasedShopSlotIds: [...input.worldDelta.purchasedShopSlotIds],
      droppedFloorLoot: [...input.worldDelta.droppedFloorLoot],
    },
    revision: input.revision,
    baseRevision: input.baseRevision,
    clientSavedAt: new Date().toISOString(),
  });
}

/**
 * 构造一份高真实度异设备分叉快照（例如玩家通勤途中在 iPhone 16 Pro PWA 上离线打到了发条骸骨堂），
 * 用于实机检验 SaveConflictModal 左右卡片展示与点击无刷新热切换。
 */
export async function buildSimulatedDivergentRemoteSnapshot(
  localFallbackSeed = 0x51c0ffee
): Promise<ActiveRunSnapshot> {
  const remoteBiome: BiomeId = 'biome_03_clockwork_ossuary';
  const savedThreeMinAgo = new Date(Date.now() - 3 * 60 * 1000).toISOString();
  const stats = { rubedo: 7, citrinitas: 3, albedo: 5 } as const;
  const maxHp = computeMaxHpFromStats(stats);
  const currentHp = Math.min(maxHp, 685);

  const primary: SerializedWeaponInstance = {
    instanceId: 'wpn_remote_rapier_s',
    weaponId: 'wpn_quicksilver_rapier',
    level: 'IV',
    forgeGrade: 'S',
    bonusStatColor: 'rubedo',
    affixIds: ['afx_dmg_on_bleed', 'afx_apply_oil_hit'],
  };
  const secondary: SerializedWeaponInstance = {
    instanceId: 'wpn_remote_aegis_s',
    weaponId: 'wpn_mirror_aegis',
    level: 'IV',
    forgeGrade: 'S',
    bonusStatColor: 'albedo',
    affixIds: ['afx_shield_parry_freeze', 'afx_shield_parry_poison'],
  };
  const skillOne: SerializedSkillInstance = {
    instanceId: 'skl_remote_cryo',
    skillId: 'skl_cryo_mercury_nova',
    level: 'III',
    forgeGrade: 'PLUS',
    affixIds: ['afx_dmg_on_oil_burn'],
    cooldownRemainingMs: 0,
  };
  const skillTwo: SerializedSkillInstance = {
    instanceId: 'skl_remote_turret',
    skillId: 'skl_tesla_coil_turret',
    level: 'III',
    forgeGrade: 'S',
    affixIds: ['afx_grenade_voltaic_net'],
    cooldownRemainingMs: 0,
  };

  const remoteSeed = ((localFallbackSeed ^ 0x2468ace1) >>> 0) || 0x51c0ffee;
  return signActiveRunSnapshot({
    runId: createSecureUuid(),
    schemaVersion: 1,
    lifecycleState: 'ACTIVE',
    deviceId: 'dev_iphone16pro_pwa',
    deviceLabel: 'iPhone 16 Pro · Standalone PWA',
    runSeed: remoteSeed,
    rngInternalState: (remoteSeed + 0x6d2b79f5 * 18) >>> 0,
    rngStepCount: 18,
    biomeId: remoteBiome,
    biomeDepth: 3,
    currentRoomId: 'room_00_entrance',
    spawnCheckpointId: 'stele_room_00_entrance',
    playtimeMs: 28 * 60 * 1000 + 14 * 1000,
    playerSnapshot: {
      currentHp,
      maxHp,
      rallyOrangeHp: 0,
      flaskChargesLeft: 3,
      maxFlaskCharges: 3,
      carriedGold: 1480,
      unbankedIchor: 96,
      stats,
      primaryWeapon: primary,
      secondaryWeapon: secondary,
      skillSlotOne: skillOne,
      skillSlotTwo: skillTwo,
      activeMutationIds: ['mut_crimson_frenzy', 'mut_mercury_ward', 'mut_tactical_reload'],
      killStreakCount: 19,
    },
    loadoutSummary: {
      primaryWeaponId: primary.weaponId,
      secondaryWeaponId: secondary.weaponId,
      skillOneId: skillOne.skillId,
      skillTwoId: skillTwo.skillId,
      statCounts: stats,
      currentHp,
      maxHp,
    },
    worldDelta: {
      clearedRoomIds: ['room_00_entrance'],
      openedChestIds: ['scroll_ent_0'],
      activatedTeleporterIds: ['room_00_entrance'],
      purchasedShopSlotIds: [],
      droppedFloorLoot: [],
    },
    revision: 4,
    baseRevision: 4,
    clientSavedAt: savedThreeMinAgo,
  });
}
