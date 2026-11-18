/**
 * Milestone 7 关卡战斗总编排器（src/scenes/BiomeCombatSession.ts）：
 * 衔接 EnemyDirector（12 种普通怪 + 4 精英词缀）、12 把武器、6 主动技能、6 元素反应、20 词条引擎与 12 变异。
 */

import Phaser from 'phaser';
import type { CombatTargetView, VoltaicChainSegment } from '../combat/CombatTypes';
import { HitboxManager } from '../combat/HitboxManager';
import { HitStopController } from '../combat/HitStopController';
import { ProjectilePool } from '../combat/ProjectilePool';
import type { ClockController } from '../core/ClockController';
import type { DeterministicRng } from '../core/DeterministicRng';
import { EventBus } from '../core/EventBus';
import { RNG_CHANNEL_HASH, type TrapKind } from '../data/runes.data';
import type { SkillSlotId } from '../data/skills.data';
import {
  COMBAT_CONSTANTS,
  WEAPON_CATALOG,
  type PlayerCombatHudSnapshot,
  type WeaponId,
  type WeaponSlotId,
} from '../data/weapons.data';
import type { BaseEnemy } from '../entities/enemies/BaseEnemy';
import { EnemyDirector } from '../entities/enemies/EnemyDirector';
import type { PlayerEntity } from '../entities/player/PlayerEntity';
import type { CameraRig } from '../render/CameraRig';
import type { LightingDirector } from '../render/LightingDirector';
import type { ActiveCameraPostFXBundle } from '../render/pipelines/PipelineRegistry';
import { ParticleDirector } from '../render/vfx/ParticleDirector';
import { CombatLootSpawner } from '../world/CombatLootSpawner';
import type { GeneratedBiomeDag } from '../world/DagBiomeGenerator';
import type { BakedStitchedWorld } from '../world/DoorSocketStitcher';
import type { IWorldDisplayRegistrar } from '../world/ParallaxComposer';
import { applyResolvedProjectileImpacts, applyResolvedWeaponHits } from './CombatHitResolver';
import {
  buildPlayerCombatHudSnapshot,
  CombatModalController,
  resolvePlayerShieldAndCarapaceHooks,
  stepEnemyDirectorRoster,
} from './CombatModalAndRosterBridge';
import { SkillAndSynergyCoordinator } from './SkillAndSynergyCoordinator';

export class BiomeCombatSession {
  public readonly hitStop: HitStopController;
  public readonly hitboxes: HitboxManager;
  public readonly projectiles: ProjectilePool;
  public readonly particles: ParticleDirector;
  public readonly loot: CombatLootSpawner;
  public readonly director: EnemyDirector;
  public readonly synergy: SkillAndSynergyCoordinator;
  public readonly modals: CombatModalController;
  public readonly defenseHooks: ReturnType<typeof resolvePlayerShieldAndCarapaceHooks>;

  private readonly dag: GeneratedBiomeDag;
  private readonly targetViewsScratch: CombatTargetView[] = [];
  private readonly chainSegScratch: VoltaicChainSegment[] = [];
  private lastRecordedHitStopMs = 0;
  private shieldRefractPulseSec = 0;

  public constructor(
    scene: Phaser.Scene,
    registrar: IWorldDisplayRegistrar,
    dag: GeneratedBiomeDag,
    private readonly baked: BakedStitchedWorld,
    rootRng: DeterministicRng,
    private readonly player: PlayerEntity,
    private readonly clock: ClockController,
    private readonly cameraRig: CameraRig,
    private readonly lighting: LightingDirector,
    private readonly postFx: ActiveCameraPostFXBundle,
    private readonly heroSprite: Phaser.GameObjects.Sprite,
    private readonly onRespawnPlayer: () => void
  ) {
    this.dag = dag;
    const lootRng = rootRng.fork(RNG_CHANNEL_HASH.LOOT_AND_AFFIX);
    this.hitStop = new HitStopController(clock);
    this.hitboxes = new HitboxManager();
    this.projectiles = new ProjectilePool();
    this.particles = new ParticleDirector(scene, cameraRig, baked);
    this.loot = new CombatLootSpawner(scene, registrar, dag, player.inventory, lootRng);
    this.director = new EnemyDirector(scene, registrar, dag, rootRng);
    this.synergy = new SkillAndSynergyCoordinator(
      scene, dag.biomeId, player, this.director.enemies, this.projectiles, this.particles,
      cameraRig, lighting, postFx, () => this.targetViewsScratch,
      (victim) => this.director.notifyEnemyKilled(victim)
    );
    this.defenseHooks = resolvePlayerShieldAndCarapaceHooks(
      player, this.director.enemies, this.particles, lighting, this.synergy
    );
    this.modals = new CombatModalController(player, this.loot, lootRng, clock, cameraRig, () => {
      this.emitHudSnapshot();
    });
    this.refreshTargetViews();
    this.emitHudSnapshot();
  }

  public get agents(): readonly BaseEnemy[] { return this.director.enemies; }
  public get targetViews(): readonly CombatTargetView[] { return this.targetViewsScratch; }
  public get lastHitStopMs(): number { return this.lastRecordedHitStopMs; }
  public get isShieldRefractSustained(): boolean {
    return this.shieldRefractPulseSec > 0 || this.synergy.skillRuntime.aegisUrnSec > 0;
  }

  public applyTrapDamageToEnemy(enemyId: string, kind: TrapKind, flatDamage: number, wx: number, wy: number): void {
    this.synergy.applyAuxiliaryDamageToTarget(enemyId, flatDamage, true, wx, wy);
    if (kind === 'FLAME_NOZZLE') this.synergy.statusMachine.apply(enemyId, 'ignited', 3, 1.0, { worldX: wx, worldY: wy });
    if (kind === 'ACID_GEYSER') this.synergy.statusMachine.apply(enemyId, 'poisoned', 2, 1.0, { worldX: wx, worldY: wy });
    if (kind === 'VOLTAIC_ARC_GATE') this.synergy.statusMachine.apply(enemyId, 'electrified', 2, 1.0, { worldX: wx, worldY: wy });
  }

  public handlePlayerWeaponStageActive(weaponId: WeaponId, stageIndex: number, slot: WeaponSlotId): void {
    const def = WEAPON_CATALOG[weaponId];
    const stage = def.stages[stageIndex % def.stages.length]!;
    const { x: px, y: py, facing } = this.player.physics;
    const pierces = this.player.inventory.getSlotWeapon(slot).affixIds.includes('afx_pierce_first');

    if (def.category === 'RANGED_BOW') {
      this.projectiles.spawnPlayerMercuryArrow(px + facing * 14, py - 17, facing, pierces);
      this.lighting.spawnTransientFlash(px + facing * 16, py - 17, 0x38bdf8, 125, 1.8, 80);
      return;
    }
    if (def.category === 'RANGED_CROSSBOW') {
      this.projectiles.spawnPlayerRepeaterBolt(px + facing * 16, py - 17, facing, (stageIndex - 1) * 14, pierces);
      this.lighting.spawnTransientFlash(px + facing * 18, py - 17, 0xfbbf24, 120, 1.7, 70);
      return;
    }
    if (def.category === 'THROWN_FLASK') {
      this.projectiles.spawnPlayerLobbedFlask('VITRIOL_FLASK', px + facing * 12, py - 20, facing);
      return;
    }
    if (def.category === 'MAGIC_STAFF') {
      this.refreshTargetViews();
      const hits = this.hitboxes.resolveVoltaicArcPulse(px + facing * 10, py - 18, facing, this.targetViewsScratch, this.chainSegScratch);
      this.particles.emitVoltaicChainBolts(this.chainSegScratch);
      this.lighting.spawnTransientFlash(px + facing * 24, py - 18, 0x38bdf8, 185, 2.3, 120);
      const stopMs = applyResolvedWeaponHits(this.resolverCtx(), hits);
      if (stopMs > 0) this.lastRecordedHitStopMs = stopMs;
      return;
    }

    const cx = px + facing * stage.hitboxOffsetX;
    const cy = py + stage.hitboxOffsetY;
    this.hitboxes.beginPlayerSwingBox(weaponId, stageIndex, cx, cy, stage.hitboxWidthPx, stage.hitboxHeightPx, stage.activeTicks);
    this.particles.emitWeaponSmear(stage.smearFrame, cx, cy, facing, def.category === 'MELEE_HEAVY' ? 0.22 : 0.14, stage.smearAtlas ?? 'weapons_fx_atlas');
  }

  public handlePlayerParrySucceeded(): void {
    const { x: px, y: py, facing } = this.player.physics;
    const shieldId = this.player.inventory.getEquippedShieldId() === 'wpn_mirror_aegis' ? 'wpn_mirror_aegis' : 'wpn_slag_buckler';
    this.shieldRefractPulseSec = shieldId === 'wpn_mirror_aegis' ? 0.45 : 0.22;
    this.hitboxes.spawnBucklerParryShockwave(px, py, facing, shieldId);
    this.particles.emitParrySunburst(px, py - 18, facing);
    this.particles.emitWeaponSmear('buckler_shockwave_0', px + facing * 34, py - 18, facing, 0.2);
    const cue = this.hitStop.registerImpact('PARRY', true, true, null, 0);
    this.lastRecordedHitStopMs = cue.hitStopMs;
    this.cameraRig.addTrauma(cue.traumaDelta);
    this.postFx.chromaticImpact.triggerPulse(cue.chromaticIntensity, px, py - 18, this.cameraRig.worldMainCam);
    this.lighting.spawnTransientFlash(px + facing * 14, py - 18, shieldId === 'wpn_mirror_aegis' ? 0x38bdf8 : 0xfbbf24, 240, 2.7, 190);
  }

  public handleSkillActivated(slot: SkillSlotId): void {
    this.synergy.activateSkillSlot(slot);
  }

  public stepFixed(dtSec: number, interactPressed: boolean, activeRoomId?: string): void {
    const { x: px, y: py, facing } = this.player.physics;
    if (this.shieldRefractPulseSec > 0) this.shieldRefractPulseSec = Math.max(0, this.shieldRefractPulseSec - dtSec);

    if (this.player.ctx.isAttackHitboxActive) {
      const def = this.player.inventory.getSlotDefinition(this.player.ctx.activeWeaponSlot);
      const st = def.stages[this.player.ctx.comboIndex % def.stages.length]!;
      this.hitboxes.syncPlayerSwingPosition(px + facing * st.hitboxOffsetX, py + st.hitboxOffsetY);
    } else if (this.player.state !== 'Parry') {
      this.hitboxes.cancelPlayerSwingBox();
    }

    this.refreshTargetViews();
    const meleeHits = this.hitboxes.stepFixed(px, this.targetViewsScratch, (wid, sIdx) => WEAPON_CATALOG[wid].stages[sIdx % WEAPON_CATALOG[wid].stages.length]!.breach);
    if (meleeHits.length > 0) {
      const stopMs = applyResolvedWeaponHits(this.resolverCtx(), meleeHits);
      if (stopMs > 0) this.lastRecordedHitStopMs = stopMs;
    }

    const projImpacts = this.projectiles.stepFixed(
      dtSec, this.baked.solidRects, this.targetViewsScratch,
      { x: px, y: py, width: this.player.physics.colliderWidth, height: this.player.physics.colliderHeight, isParryWindowActive: this.player.ctx.isParryWindowActive, facing, equippedShieldId: this.player.inventory.getEquippedShieldId() },
      (_wx, _wy, sourceEnemyId) => {
        this.player.receiveIncomingHit(0, -facing as -1 | 1, true);
        this.director.enemies.find((a) => a.id === sourceEnemyId)?.forceStun(COMBAT_CONSTANTS.ENEMY_BREACH_STUN_MS);
      },
      (kind, wx, wy) => this.synergy.handleLobbedFlaskShattered(kind, wx, wy)
    );
    if (projImpacts.length > 0) applyResolvedProjectileImpacts(this.resolverCtx(), projImpacts, this.onRespawnPlayer);

    stepEnemyDirectorRoster(dtSec, this.director, this.baked.solidRects, this.player, this.projectiles, this.particles, this.lighting, this.synergy, this.onRespawnPlayer, this.cameraRig, activeRoomId);
    this.synergy.stepFixed(dtSec, this.heroSprite);
    this.loot.stepFixed(dtSec, px, py, interactPressed && !this.modals.isModalOpen, (drop) => this.modals.openWeaponCompare(drop), (scr) => this.modals.openScrollPick(scr.id), () => this.modals.setMutationForgeOpen(true));
    this.particles.syncProjectileSprites(this.projectiles);
    this.particles.syncPlayerWeaponCues(px, py, facing, this.player.stats.isCleaverRhythmWindowOpen, this.player.stats.rapierCritWindowMs > 0, (this.clock.totalFixedTicks >> 2) & 1 ? 1 : 0);
    this.particles.stepFixed(dtSec);
  }

  public sampleRenderJitter(rawDeltaMs: number): number {
    const j = this.hitStop.sampleRenderJitter(rawDeltaMs);
    if (j.targetId) {
      const ag = this.director.enemies.find((a) => a.id === j.targetId);
      if (ag && ag.isAlive && ag.sprite) ag.sprite.setX(ag.x + j.targetOffsetX);
    }
    return j.attackerOffsetX;
  }

  public emitHudSnapshot(): PlayerCombatHudSnapshot {
    const snap = buildPlayerCombatHudSnapshot(this.player, this.synergy);
    EventBus.emit('player:combat_hud_updated', snap);
    return snap;
  }

  public destroy(): void {
    this.modals.destroy();
    this.synergy.destroy();
    this.director.destroy();
    this.loot.destroy();
    this.particles.destroy();
    this.hitboxes.releaseAll();
    this.projectiles.releaseAll();
  }

  private resolverCtx() {
    return {
      biomeId: this.dag.biomeId, player: this.player, agents: this.director.enemies,
      projectilePool: this.projectiles, hitStop: this.hitStop, particles: this.particles,
      cameraRig: this.cameraRig, lighting: this.lighting, postFx: this.postFx, synergy: this.synergy,
      getTargets: () => this.targetViewsScratch,
      isPlayerInConductiveHazard: () => this.synergy.skillRuntime.isPointInConductiveZone(this.player.physics.x, this.player.physics.y),
      onEnemySlain: (v: BaseEnemy) => this.director.notifyEnemyKilled(v),
      onPlayerKilled: this.onRespawnPlayer,
    };
  }

  private refreshTargetViews(): void {
    this.targetViewsScratch.length = 0;
    const list = this.director.enemies;
    for (let i = 0; i < list.length; i++) {
      const ag = list[i]!;
      this.targetViewsScratch.push(ag.toTargetView(this.synergy.skillRuntime.isPointInConductiveZone(ag.x, ag.y)));
    }
  }
}
