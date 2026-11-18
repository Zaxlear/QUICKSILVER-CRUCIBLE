import 'fake-indexeddb/auto';
import { afterEach, describe, expect, it } from 'vitest';
import type { ActiveRunSnapshot, BiomeId } from '../../src/data/storage.data';
import { CloudSyncCoordinator } from '../../src/storage/CloudSyncCoordinator';
import { LocalVault } from '../../src/storage/LocalVault';
import { LoopbackCloudGateway } from '../../src/storage/LoopbackCloudGateway';
import { createSecureUuid, signActiveRunSnapshot, signMetaProgression } from '../../src/storage/SaveSchema';
import {
  arbitrateRunSnapshots,
  SnapshotConflictMachine,
} from '../../src/storage/SnapshotConflictMachine';

async function makeSignedRun(overrides: Partial<Omit<ActiveRunSnapshot, 'payloadSha256'>> = {}): Promise<ActiveRunSnapshot> {
  const biomeId: BiomeId = overrides.biomeId ?? 'biome_02_vitriol_sewers';
  const hp = overrides.playerSnapshot?.currentHp ?? 185;
  const maxHp = overrides.playerSnapshot?.maxHp ?? 220;
  const stats = overrides.playerSnapshot?.stats ?? { rubedo: 4, citrinitas: 2, albedo: 3 };

  return signActiveRunSnapshot({
    runId: overrides.runId ?? '11111111-2222-4333-8444-555555555555',
    schemaVersion: 1,
    lifecycleState: overrides.lifecycleState ?? 'ACTIVE',
    deviceId: overrides.deviceId ?? 'dev_desktop_mac',
    deviceLabel: overrides.deviceLabel ?? 'macOS Desktop · WebGL',
    runSeed: overrides.runSeed ?? 0x51c0ffee,
    rngInternalState: overrides.rngInternalState ?? 0x9e3779b9,
    rngStepCount: overrides.rngStepCount ?? 12,
    biomeId,
    biomeDepth: overrides.biomeDepth ?? 2,
    currentRoomId: overrides.currentRoomId ?? 'room_02_combat',
    spawnCheckpointId: overrides.spawnCheckpointId ?? 'stele_room_02_combat',
    playtimeMs: overrides.playtimeMs ?? 640_000,
    playerSnapshot: overrides.playerSnapshot ?? {
      currentHp: hp,
      maxHp,
      rallyOrangeHp: 0,
      flaskChargesLeft: 2,
      maxFlaskCharges: 2,
      carriedGold: 520,
      unbankedIchor: 48,
      stats,
      primaryWeapon: {
        instanceId: 'wpn_1',
        weaponId: 'wpn_quicksilver_rapier',
        level: 'III',
        forgeGrade: 'PLUS',
        bonusStatColor: 'rubedo',
        affixIds: ['afx_dmg_on_bleed'],
      },
      secondaryWeapon: {
        instanceId: 'wpn_2',
        weaponId: 'wpn_mirror_aegis',
        level: 'III',
        forgeGrade: 'S',
        bonusStatColor: 'albedo',
        affixIds: ['afx_shield_parry_freeze'],
      },
      skillSlotOne: {
        instanceId: 'skl_1',
        skillId: 'skl_vitriol_flask',
        level: 'II',
        forgeGrade: 'PLUS',
        affixIds: ['afx_dmg_on_oil_burn'],
        cooldownRemainingMs: 0,
      },
      skillSlotTwo: {
        instanceId: 'skl_2',
        skillId: 'skl_tesla_coil_turret',
        level: 'II',
        forgeGrade: 'PLUS',
        affixIds: ['afx_grenade_voltaic_net'],
        cooldownRemainingMs: 0,
      },
      activeMutationIds: ['mut_crimson_frenzy', 'mut_mercury_ward'],
      killStreakCount: 14,
    },
    loadoutSummary: overrides.loadoutSummary ?? {
      primaryWeaponId: 'wpn_quicksilver_rapier',
      secondaryWeaponId: 'wpn_mirror_aegis',
      skillOneId: 'skl_vitriol_flask',
      skillTwoId: 'skl_tesla_coil_turret',
      statCounts: stats,
      currentHp: hp,
      maxHp,
    },
    worldDelta: overrides.worldDelta ?? {
      clearedRoomIds: ['room_00_entrance', 'room_01_combat'],
      openedChestIds: ['scroll_ent_0'],
      activatedTeleporterIds: ['room_00_entrance', 'room_02_combat'],
      purchasedShopSlotIds: [],
      droppedFloorLoot: [],
    },
    revision: overrides.revision ?? 2,
    baseRevision: overrides.baseRevision ?? 2,
    clientSavedAt: overrides.clientSavedAt ?? '2026-11-18T04:00:00.000Z',
  });
}

describe('Milestone 10 — SnapshotConflictMachine & LocalVault SHA-256 Tamper Rollback', () => {
  const vaultsToCleanup: LocalVault[] = [];

  afterEach(async () => {
    while (vaultsToCleanup.length > 0) {
      const v = vaultsToCleanup.pop()!;
      await v.closeAndDelete();
    }
  });

  it('auto fast-forwards same-run linear progression (push & pull) and cross-device idle relay', async () => {
    const remoteRev2 = await makeSignedRun({ revision: 2, baseRevision: 2, currentRoomId: 'room_02_combat' });
    const localLinearRev3 = await makeSignedRun({
      revision: 2,
      baseRevision: 2,
      currentRoomId: 'room_03_elite',
      playtimeMs: 790_000,
    });

    // 1. 本机基于云端最新基线 revision=2 推进至下一房间 -> AUTO_PUSH_LOCAL
    const pushDec = arbitrateRunSnapshots(localLinearRev3, remoteRev2, true);
    expect(pushDec.nextState).toBe('AUTO_PUSH_LOCAL');
    expect(pushDec.reason).toBe('LOCAL_FAST_FORWARD_SAME_RUN');

    // 2. 云端已由另一台设备推进至 revision=4，本机停留在旧版且无未推送脏改动 -> AUTO_PULL_REMOTE
    const remoteRev4 = await makeSignedRun({
      revision: 4,
      baseRevision: 4,
      currentRoomId: 'room_05_hub',
      deviceLabel: 'iPhone 16 Pro · PWA',
    });
    const pullDec = arbitrateRunSnapshots(remoteRev2, remoteRev4, false);
    expect(pullDec.nextState).toBe('AUTO_PULL_REMOTE');
    expect(pullDec.reason).toBe('REMOTE_FAST_FORWARD_SAME_RUN');

    // 3. 本机无活跃局，云端有活跃局 -> 跨设备无缝接力拉取
    const relayDec = arbitrateRunSnapshots(null, remoteRev4, false);
    expect(relayDec.nextState).toBe('AUTO_PULL_REMOTE');
    expect(relayDec.reason).toBe('REMOTE_RELAY_TO_IDLE_LOCAL');
  });

  it('precisely enters CONFLICT_MODAL_OPEN on dual-device offline fork & divergent runIds, then resolves cleanly', async () => {
    const fsm = new SnapshotConflictMachine();
    expect(fsm.state).toBe('BOOT_LOCAL_READ');
    expect(fsm.finishBootLocalRead(true)).toBe('META_CRDT_SYNC');
    expect(fsm.advanceMetaSyncToArbitration()).toBe('SNAPSHOT_ARBITRATION');

    // 场景 A：同一 runId 在双端离线各自推进（云端已是 rev 3，本机基于旧基线 baseRevision 1 离线修改）
    const cloudFork = await makeSignedRun({
      revision: 3,
      baseRevision: 3,
      deviceLabel: 'Windows 11 Desktop',
      currentRoomId: 'room_04_shop',
    });
    const localFork = await makeSignedRun({
      revision: 2,
      baseRevision: 1,
      deviceLabel: 'iPad Pro 120Hz',
      currentRoomId: 'room_03_cursed',
    });

    const resSameRunFork = fsm.evaluateSnapshots(localFork, cloudFork, true);
    expect(resSameRunFork.nextState).toBe('CONFLICT_MODAL_OPEN');
    expect(resSameRunFork.reason).toBe('CONCURRENT_OFFLINE_FORK_SAME_RUN');
    expect(fsm.activeConflict?.localSnapshot.currentRoomId).toBe('room_03_cursed');
    expect(fsm.activeConflict?.remoteSnapshot.currentRoomId).toBe('room_04_shop');

    const keepLocal = fsm.resolveUserConflictChoice('KEEP_LOCAL');
    expect(keepLocal.actionState).toBe('FORCE_PUSH_LOCAL');
    expect(keepLocal.chosenSnapshot.currentRoomId).toBe('room_03_cursed');
    expect(fsm.markTransferCompleted()).toBe('SYNCED_IDLE');

    // 场景 B：异 runId 同时处于 ACTIVE -> 再次进入 CONFLICT_MODAL_OPEN 并测试继承云端
    const otherActiveRun = await makeSignedRun({
      runId: '99999999-8888-4777-8666-555555555555',
      biomeId: 'biome_04_crucible_apex',
      biomeDepth: 4,
      currentRoomId: 'room_06_summit',
    });
    const resDiffRun = fsm.evaluateSnapshots(localFork, otherActiveRun, true);
    expect(resDiffRun.nextState).toBe('CONFLICT_MODAL_OPEN');
    expect(resDiffRun.reason).toBe('DIVERGENT_ACTIVE_RUN_IDS');

    const adoptRemote = fsm.resolveUserConflictChoice('ADOPT_REMOTE');
    expect(adoptRemote.actionState).toBe('ADOPT_REMOTE_SNAPSHOT');
    expect(adoptRemote.chosenSnapshot.biomeId).toBe('biome_04_crucible_apex');
    expect(fsm.markTransferCompleted()).toBe('SYNCED_IDLE');
  });

  it('intercepts IndexedDB field tampering via SHA-256 verification and rolls back to untampered backup slot', async () => {
    const vault = new LocalVault(`TestVault_Tamper_${createSecureUuid()}`);
    vaultsToCleanup.push(vault);

    // 第一次合法存档：room_01_combat，金币 300 -> 同时写入 primary 与 backup
    const goodBackupSnap = await makeSignedRun({
      currentRoomId: 'room_01_combat',
      playtimeMs: 310_000,
    });
    await vault.saveActiveRun(goodBackupSnap);

    // 第二次合法存档：room_04_elite，金币 780 -> 旧完好快照晋升至 backup，新快照写入 primary
    const goodLatestSnap = await makeSignedRun({
      currentRoomId: 'room_04_elite',
      playtimeMs: 620_000,
      playerSnapshot: {
        ...goodBackupSnap.playerSnapshot,
        carriedGold: 780,
      },
    });
    await vault.saveActiveRun(goodLatestSnap);

    // 模拟恶意篡改 IndexedDB：直接修改 primary 槽内的 carriedGold 为 999999（未重算或伪造哈希）
    const rawPrimary = await vault.rawDb.runSlots.get('primary');
    expect(rawPrimary).toBeDefined();
    await vault.rawDb.runSlots.put({
      slotKey: 'primary',
      updatedAtMs: Date.now(),
      snapshot: {
        ...rawPrimary!.snapshot,
        playerSnapshot: {
          ...rawPrimary!.snapshot.playerSnapshot,
          carriedGold: 999_999,
        },
      },
    });

    // 读取时必须精准拦截 SHA-256 失配，并无损回退至上一完好备份槽（room_01_combat，金币 520）
    const recoveredRun = await vault.loadActiveRun();
    expect(recoveredRun.tamperDetected).toBe(true);
    expect(recoveredRun.recoveredFromBackup).toBe(true);
    expect(vault.tamperInterceptCount).toBe(1);
    expect(recoveredRun.data).not.toBeNull();
    expect(recoveredRun.data!.currentRoomId).toBe('room_01_combat');
    expect(recoveredRun.data!.playerSnapshot.carriedGold).toBe(520);

    // 同步核验 MetaProgressionRecord 篡改拦截与备份槽自愈
    const initMeta = (await vault.loadMeta()).data;
    const legitMetaV2 = await signMetaProgression({
      ...initMeta,
      bankedIchor: 85,
      crdtRevision: 2,
    });
    await vault.saveMeta(legitMetaV2);

    const legitMetaV3 = await signMetaProgression({
      ...legitMetaV2,
      bankedIchor: 160,
      crdtRevision: 3,
    });
    await vault.saveMeta(legitMetaV3);

    // 篡改 metaSlots.primary 的 bankedIchor 为 888888
    const rawMetaPrimary = await vault.rawDb.metaSlots.get('primary');
    await vault.rawDb.metaSlots.put({
      slotKey: 'primary',
      savedAtMs: Date.now(),
      record: {
        ...rawMetaPrimary!.record,
        bankedIchor: 888_888,
      },
    });

    const recoveredMeta = await vault.loadMeta();
    expect(recoveredMeta.tamperDetected).toBe(true);
    expect(recoveredMeta.recoveredFromBackup).toBe(true);
    expect(vault.tamperInterceptCount).toBe(2);
    expect(recoveredMeta.data.bankedIchor).toBe(85);
  });

  it('preserves CRDT meta unlocks even when adopting remote snapshot during CloudSyncCoordinator conflict resolution', async () => {
    const vault = new LocalVault(`TestVault_Coord_${createSecureUuid()}`);
    vaultsToCleanup.push(vault);
    const gateway = new LoopbackCloudGateway();

    // 云端预置一份含异端武器蓝图的局外存档
    const baseMeta = (await vault.loadMeta()).data;
    await gateway.mergeMetaProgression(
      await signMetaProgression({
        ...baseMeta,
        unlockedWeapons: [...baseMeta.unlockedWeapons, 'wpn_mirror_aegis'],
        trueEndingFlags: ['flag_seal_claws'],
        crdtRevision: 2,
      })
    );

    // 本机离线解锁了新符文 rune_vitriol_tendril
    await vault.saveMeta(
      await signMetaProgression({
        ...baseMeta,
        unlockedRunes: [...baseMeta.unlockedRunes, 'rune_vitriol_tendril'],
        crdtRevision: 2,
      })
    );

    const coord = new CloudSyncCoordinator(vault, gateway);
    await coord.bootstrap();
    await coord.simulateDivergentConflict();

    expect(coord.fsm.state).toBe('CONFLICT_MODAL_OPEN');

    // 选择放弃本机局内快照、继承云端局内快照
    await coord.resolveConflict('ADOPT_REMOTE');
    expect(coord.fsm.state).toBe('SYNCED_IDLE');

    const finalMeta = (await vault.loadMeta()).data;
    expect(finalMeta.unlockedRunes).toContain('rune_vitriol_tendril');
    expect(finalMeta.unlockedWeapons).toContain('wpn_mirror_aegis');
    expect(finalMeta.trueEndingFlags).toContain('flag_seal_claws');
  });
});
