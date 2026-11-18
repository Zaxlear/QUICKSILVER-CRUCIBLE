/**
 * Phaser 场景与双轨云存档（ActiveRunSnapshot）无缝断点捕获、离线恢复与无刷新热切换桥接器
 * （src/scenes/SceneSaveBridge.ts）。
 */

import type Phaser from 'phaser';
import { TILE_SIZE_PX } from '../core/Constants';
import type { DeterministicRng } from '../core/DeterministicRng';
import { EventBus, type BossId } from '../core/EventBus';
import { ALL_MUTATION_IDS, type MutationId } from '../data/mutations.data';
import type { ActiveRunSnapshot } from '../data/storage.data';
import { ALL_STAT_COLORS, type RolledWeaponInstance } from '../data/weapons.data';
import type { PlayerEntity } from '../entities/player/PlayerEntity';
import { PlayerSkillAndMutationLoadout } from '../entities/player/PlayerSkillAndMutationLoadout';
import { CloudSync } from '../storage/CloudSyncCoordinator';
import { buildSignedActiveRunSnapshot } from '../storage/RunSnapshotBuilder';
import type { GeneratedBiomeDag } from '../world/DagBiomeGenerator';
import { computeRoomBoundsPx } from './BiomeRoomFraming';
import type { BiomeRunRig } from './BiomeRunRig';
import type { RunCarryoverSnapshot } from './BiomeUiCommandBridge';

/** 将 ActiveRunSnapshot 转换为跨场景继承的 RunCarryoverSnapshot（用于初始构造 PlayerEntity） */
export function snapshotToCarryover(
  snap: ActiveRunSnapshot,
  unlockedRunes: RunCarryoverSnapshot['unlockedRunes']
): RunCarryoverSnapshot {
  const ps = snap.playerSnapshot;
  const primaryWeapon: RolledWeaponInstance = ps.primaryWeapon
    ? {
        instanceId: ps.primaryWeapon.instanceId, weaponId: ps.primaryWeapon.weaponId,
        level: ps.primaryWeapon.level, forgeGrade: ps.primaryWeapon.forgeGrade,
        bonusStatColor: ps.primaryWeapon.bonusStatColor, affixIds: [...ps.primaryWeapon.affixIds],
      }
    : {
        instanceId: 'wpn_resume_p', weaponId: 'wpn_rust_scalpel',
        level: 'I', forgeGrade: 'BASE', bonusStatColor: null, affixIds: ['afx_dmg_on_bleed'],
      };

  const secondaryWeapon: RolledWeaponInstance = ps.secondaryWeapon
    ? {
        instanceId: ps.secondaryWeapon.instanceId, weaponId: ps.secondaryWeapon.weaponId,
        level: ps.secondaryWeapon.level, forgeGrade: ps.secondaryWeapon.forgeGrade,
        bonusStatColor: ps.secondaryWeapon.bonusStatColor, affixIds: [...ps.secondaryWeapon.affixIds],
      }
    : {
        instanceId: 'wpn_resume_s', weaponId: 'wpn_slag_buckler',
        level: 'I', forgeGrade: 'BASE', bonusStatColor: null, affixIds: ['afx_shield_parry_poison'],
      };

  const s1 = ps.skillSlotOne;
  const s2 = ps.skillSlotTwo;
  const loadout = new PlayerSkillAndMutationLoadout(
    s1 ? { instanceId: s1.instanceId, skillId: s1.skillId, level: s1.level, forgeGrade: s1.forgeGrade, affixIds: [...s1.affixIds], cooldownRemainingSec: s1.cooldownRemainingMs / 1000 } : undefined,
    s2 ? { instanceId: s2.instanceId, skillId: s2.skillId, level: s2.level, forgeGrade: s2.forgeGrade, affixIds: [...s2.affixIds], cooldownRemainingSec: s2.cooldownRemainingMs / 1000 } : undefined
  );

  for (const existing of [...loadout.activeMutationIds]) loadout.toggleMutationChoice(existing);
  for (const mid of ps.activeMutationIds) {
    if ((ALL_MUTATION_IDS as readonly string[]).includes(mid)) loadout.toggleMutationChoice(mid as MutationId);
  }

  return {
    primaryWeapon, secondaryWeapon, loadout,
    statLevels: { ...ps.stats }, hp: ps.currentHp, gold: ps.carriedGold, ichor: ps.unbankedIchor,
    flaskCharges: ps.flaskChargesLeft, maxFlaskCharges: ps.maxFlaskCharges, unlockedRunes,
  };
}

/** 从 BiomeRunRig 实时提取完整的确定性世界与角色状态并生成 SHA-256 签名快照 */
export async function captureLiveBiomeRunSnapshot(
  dag: GeneratedBiomeDag,
  rng: DeterministicRng,
  rig: BiomeRunRig
): Promise<ActiveRunSnapshot> {
  const { player, teleporters, combat } = rig;
  const rngSnap = rng.serialize();
  const { deviceId, deviceLabel } = CloudSync.deviceIdentity;
  const consumedScrolls = combat.loot.scrollDrops.filter((s) => s.consumed).map((s) => s.id);

  const clearedRoomIds: string[] = [];
  for (const node of dag.nodes) {
    const b = computeRoomBoundsPx(node);
    const hasAlive = combat.agents.some(
      (e) => e.isAlive && e.x >= b.minX && e.x <= b.maxX && e.y >= b.minY && e.y <= b.maxY
    );
    if (!hasAlive && node.chunk.enemySpawns.length > 0) clearedRoomIds.push(node.nodeId);
  }

  return buildSignedActiveRunSnapshot({
    runId: CloudSync.activeRunId, lifecycleState: 'ACTIVE', deviceId, deviceLabel,
    runSeed: dag.seed, rngInternalState: rngSnap.internalState, rngStepCount: rngSnap.stepCount,
    biomeId: dag.biomeId, currentRoomId: teleporters.activeRoomId,
    spawnCheckpointId: `stele_${teleporters.activeRoomId}`, playtimeMs: CloudSync.currentPlaytimeMs,
    currentHp: player.stats.hp, maxHp: player.stats.maxHp, rallyOrangeHp: player.stats.rallyOrangeHp,
    flaskChargesLeft: player.stats.flaskCharges, maxFlaskCharges: player.stats.maxFlaskCharges,
    carriedGold: player.stats.gold, unbankedIchor: player.stats.ichor,
    stats: ALL_STAT_COLORS.reduce(
      (acc, c) => ({ ...acc, [c]: player.stats.snapshotLevels[c] }),
      { rubedo: 1, citrinitas: 1, albedo: 1 }
    ),
    primaryWeapon: player.inventory.primaryWeapon, secondaryWeapon: player.inventory.secondaryWeapon,
    skillSlotOne: player.inventory.loadout.skillOne, skillSlotTwo: player.inventory.loadout.skillTwo,
    activeMutationIds: player.inventory.loadout.activeMutationIds, killStreakCount: 0,
    worldDelta: {
      clearedRoomIds, openedChestIds: consumedScrolls,
      activatedTeleporterIds: teleporters.activatedSteleIds, purchasedShopSlotIds: [], droppedFloorLoot: [],
    },
    revision: CloudSync.currentRevision, baseRevision: CloudSync.currentBaseRevision,
  });
}

/** 将快照中的房间位置、石碑激活态、已拾取卷轴与已清怪房间精准还原至 BiomeRunRig */
export function applyResumeSnapshotToBiomeRig(
  dag: GeneratedBiomeDag,
  rig: BiomeRunRig,
  snap: ActiveRunSnapshot,
  cameraSetBoundsAndFocus: (node: GeneratedBiomeDag['nodes'][number], x: number, y: number) => void
): void {
  rig.player.stats.rallyOrangeHp = snap.playerSnapshot.rallyOrangeHp;
  for (const scrollId of snap.worldDelta.openedChestIds) rig.combat.loot.consumeScrollDrop(scrollId);

  const clearedSet = new Set(snap.worldDelta.clearedRoomIds);
  if (clearedSet.size > 0) {
    for (const node of dag.nodes) {
      if (!clearedSet.has(node.nodeId)) continue;
      const b = computeRoomBoundsPx(node);
      for (const enemy of rig.combat.agents) {
        if (enemy.isAlive && enemy.x >= b.minX && enemy.x <= b.maxX && enemy.y >= b.minY && enemy.y <= b.maxY) {
          enemy.isShieldedByPrelate = false;
          enemy.applyHit(999999, 99, 1);
          rig.combat.director.notifyEnemyKilled(enemy);
        }
      }
    }
  }

  for (const steleNodeId of snap.worldDelta.activatedTeleporterIds) {
    const n = dag.nodes.find((item) => item.nodeId === steleNodeId);
    if (n && n.chunk.teleporterTilePos) {
      const wx = (n.worldTileX + n.chunk.teleporterTilePos.tileX) * TILE_SIZE_PX + 8;
      const wy = (n.worldTileY + n.chunk.teleporterTilePos.tileY + 1) * TILE_SIZE_PX;
      rig.teleporters.stepFixed(0.008, wx, wy, () => {});
    }
  }

  const targetNode = dag.nodes.find((n) => n.nodeId === snap.currentRoomId) ?? dag.nodes[0]!;
  const spawnTileX = targetNode.chunk.teleporterTilePos?.tileX ?? 12;
  const spawnTileY = targetNode.chunk.teleporterTilePos ? targetNode.chunk.teleporterTilePos.tileY + 1 : 26;
  const destX = (targetNode.worldTileX + spawnTileX) * TILE_SIZE_PX;
  const destY = (targetNode.worldTileY + spawnTileY) * TILE_SIZE_PX;

  rig.teleporters.markRoomEntered(targetNode);
  const p = rig.player.physics;
  p.x = destX; p.y = destY; p.prevX = destX; p.prevY = destY; p.vx = 0; p.vy = 0;
  cameraSetBoundsAndFocus(targetNode, destX, destY);
  rig.combat.emitHudSnapshot();
  rig.emitMinimap();
}

/** 为任意激活场景绑定云存档热重载监听与自动检查点保存 */
export function attachSceneSaveHotReload(
  scene: Phaser.Scene,
  autoCheckpointHooks?: { readonly dag: GeneratedBiomeDag; readonly rng: DeterministicRng; readonly rig: BiomeRunRig }
): () => void {
  const unbinds: Array<() => void> = [
    EventBus.on('save:hot_reload_snapshot', ({ snapshot }) => {
      scene.scene.start('BiomeRunScene', { resumeSnapshot: snapshot });
    }),
  ];

  if (autoCheckpointHooks) {
    const { dag, rng, rig } = autoCheckpointHooks;
    const capturer = () => captureLiveBiomeRunSnapshot(dag, rng, rig);
    CloudSync.registerLiveRunCapturer(capturer);
    const saveNow = (): void => { void capturer().then((snap) => CloudSync.saveCheckpointSnapshot(snap)); };
    unbinds.push(
      EventBus.on('world:room_entered', saveNow),
      EventBus.on('world:checkpoint_reached', saveNow),
      EventBus.on('world:teleporter_activated', saveNow),
      () => CloudSync.registerLiveRunCapturer(null)
    );
    saveNow();
  }

  return () => { for (const off of unbinds) off(); };
}

/** 首领决战结算（击败最终 Boss 或阵亡）时归档战绩并结算灵液回流至圣所永久金库 */
export function finalizeBossArenaRunInVault(
  player: PlayerEntity,
  bossId: BossId,
  outcome: 'VICTORY' | 'DEAD'
): void {
  const { deviceId, deviceLabel } = CloudSync.deviceIdentity;
  const biomeId = bossId === 'boss_01_furnace_warden' ? 'biome_02_vitriol_sewers' : 'biome_04_crucible_apex';
  void buildSignedActiveRunSnapshot({
    runId: CloudSync.activeRunId, lifecycleState: outcome, deviceId, deviceLabel,
    runSeed: 0x51c0ffee, rngInternalState: 0x51c0ffee, rngStepCount: 0,
    biomeId, currentRoomId: `arena_${bossId}`, spawnCheckpointId: `arena_${bossId}`,
    playtimeMs: CloudSync.currentPlaytimeMs,
    currentHp: player.stats.hp, maxHp: player.stats.maxHp, rallyOrangeHp: 0,
    flaskChargesLeft: player.stats.flaskCharges, maxFlaskCharges: player.stats.maxFlaskCharges,
    carriedGold: player.stats.gold, unbankedIchor: player.stats.ichor,
    stats: player.stats.snapshotLevels,
    primaryWeapon: player.inventory.primaryWeapon, secondaryWeapon: player.inventory.secondaryWeapon,
    skillSlotOne: player.inventory.loadout.skillOne, skillSlotTwo: player.inventory.loadout.skillTwo,
    activeMutationIds: player.inventory.loadout.activeMutationIds, killStreakCount: 0,
    worldDelta: { clearedRoomIds: [], openedChestIds: [], activatedTeleporterIds: [], purchasedShopSlotIds: [], droppedFloorLoot: [] },
    revision: CloudSync.currentRevision, baseRevision: CloudSync.currentBaseRevision,
  }).then((snap) => CloudSync.finalizeRunOutcome(outcome, snap, outcome === 'DEAD' ? bossId : null));
}
