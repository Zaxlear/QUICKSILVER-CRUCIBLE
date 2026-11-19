/**
 * 群落与 Boss 战永久死亡结算控制器（src/scenes/RunSettlementController.ts）：
 *
 * 100% 对齐 docs/06_BETA_1_0_2_DEVELOPMENT_PLAN.md §2.1（严格 <= 170 行）：
 * 1. 角色 HP <= 0 进入 DeadState，播放 900ms 慢动作（timeScale = 0.35）白瓷碎裂演出并拉低低通滤波；
 * 2. 写入 lifecycleState: 'DEAD' 签名快照与 RunHistoryLogEntry，清空未存灵液与未归档携带蓝图；
 * 3. 按秘银金库等级截断保留金币，切换至 SanctumHubScene（严禁携带旧局 RunCarryoverSnapshot）。
 */

import type Phaser from 'phaser';
import type { ClockController } from '../core/ClockController';
import { EventBus, type BiomeId } from '../core/EventBus';
import { NarrativeStore } from '../core/NarrativeSessionStore';
import { ALL_STAT_COLORS } from '../data/weapons.data';
import type { PlayerEntity } from '../entities/player/PlayerEntity';
import { CloudSync } from '../storage/CloudSyncCoordinator';
import { buildSignedActiveRunSnapshot } from '../storage/RunSnapshotBuilder';

export interface DeathSettlementResult {
  readonly inheritedGold: number;
  readonly nextRunSeed: number;
  readonly killedById: string;
}

/** 执行永久死亡存档归档、清理未登记蓝图并计算下一局金库继承金币（支持无头单测直接调用） */
export async function settlePlayerDeathAndReturnSanctum(params: {
  readonly scene?: Phaser.Scene | null;
  readonly player: PlayerEntity;
  readonly biomeId: BiomeId;
  readonly roomId: string;
  readonly runSeed: number;
  readonly killedById: string;
}): Promise<DeathSettlementResult> {
  const { scene, player, biomeId, roomId, runSeed, killedById } = params;
  NarrativeStore.recordPlayerDeath();
  NarrativeStore.clearCarriedBlueprintsOnDeath();

  const inheritedGold = NarrativeStore.computeDeathInheritedGold(player.stats.gold);
  const nextRunSeed = ((runSeed + 0x9e3779b9 + NarrativeStore.deathCount * 0x85ebca6b) >>> 0) || 0x51c0ffee;
  const { deviceId, deviceLabel } = CloudSync.deviceIdentity;

  const deadSnap = await buildSignedActiveRunSnapshot({
    runId: CloudSync.activeRunId,
    lifecycleState: 'DEAD',
    deviceId,
    deviceLabel,
    runSeed,
    rngInternalState: runSeed >>> 0,
    rngStepCount: 0,
    biomeId,
    currentRoomId: roomId,
    spawnCheckpointId: `dead_${roomId}`,
    playtimeMs: CloudSync.currentPlaytimeMs,
    currentHp: 0,
    maxHp: player.stats.maxHp,
    rallyOrangeHp: 0,
    flaskChargesLeft: player.stats.flaskCharges,
    maxFlaskCharges: player.stats.maxFlaskCharges,
    carriedGold: player.stats.gold,
    unbankedIchor: player.stats.ichor,
    stats: ALL_STAT_COLORS.reduce(
      (acc, c) => ({ ...acc, [c]: player.stats.snapshotLevels[c] }),
      { rubedo: 1, citrinitas: 1, albedo: 1 }
    ),
    primaryWeapon: player.inventory.primaryWeapon,
    secondaryWeapon: player.inventory.secondaryWeapon,
    skillSlotOne: player.inventory.loadout.skillOne,
    skillSlotTwo: player.inventory.loadout.skillTwo,
    activeMutationIds: player.inventory.loadout.activeMutationIds,
    killStreakCount: 0,
    cursedKillsRemaining: 0,
    carriedBlueprints: [],
    worldDelta: {
      clearedRoomIds: [],
      openedChestIds: [],
      activatedTeleporterIds: [],
      purchasedShopSlotIds: [],
      droppedFloorLoot: [],
    },
    revision: CloudSync.currentRevision + 1,
    baseRevision: CloudSync.currentBaseRevision,
  });

  await CloudSync.finalizeRunOutcome('DEAD', deadSnap, killedById);

  if (scene) {
    EventBus.emit('audio:death_muffle_changed', { active: false });
    scene.scene.start('SanctumHubScene', {
      inheritedGold,
      freshRunSeed: nextRunSeed,
      skipPrologue: true,
    });
  }

  return { inheritedGold, nextRunSeed, killedById };
}

export class RunSettlementController {
  private dying = false;
  private elapsedRealMs = 0;
  private killedById = 'unknown_hazard';
  private settled = false;

  public constructor(
    private readonly scene: Phaser.Scene,
    private readonly clock: ClockController,
    private readonly player: PlayerEntity,
    private readonly biomeId: BiomeId,
    private readonly runSeed: number,
    private readonly getCurrentRoomId: () => string
  ) {}

  public get isDying(): boolean {
    return this.dying;
  }

  /** 启动 900ms 慢动作白瓷躯壳崩解演出（幂等防重入） */
  public triggerPermadeath(killedBySourceId?: string): void {
    if (this.dying) return;
    this.dying = true;
    this.elapsedRealMs = 0;
    this.killedById = this.player.lastKilledByReason ?? killedBySourceId ?? 'biome_enemy';
    this.clock.setTimeScale(0.35);
    EventBus.emit('audio:death_muffle_changed', { active: true });
    EventBus.emit('audio:sfx_requested', { sfxId: 'sfx_enemy_dissolve', worldX: this.player.physics.x });
  }

  public stepRealDelta(rawDeltaMs: number): void {
    if (!this.dying || this.settled) return;
    this.elapsedRealMs += Math.min(100, Math.max(0, rawDeltaMs));
    if (this.elapsedRealMs >= 900) {
      this.settled = true;
      this.clock.setTimeScale(1.0);
      void settlePlayerDeathAndReturnSanctum({
        scene: this.scene,
        player: this.player,
        biomeId: this.biomeId,
        roomId: this.getCurrentRoomId(),
        runSeed: this.runSeed,
        killedById: this.killedById,
      });
    }
  }
}
