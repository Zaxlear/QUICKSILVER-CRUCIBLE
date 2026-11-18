/**
 * 核心肉鸽探索与战斗跑图主控总成（src/scenes/BiomeRunRig.ts）：
 * 编排主角实体、12 武器战斗会话、12 怪 + 4 精英 AI 编队、环境叙事剧情房（LoreRoomSpawner）与跨群落/Boss 路由。
 */

import Phaser from 'phaser';
import type { ClockController } from '../core/ClockController';
import { TILE_SIZE_PX } from '../core/Constants';
import type { DeterministicRng } from '../core/DeterministicRng';
import { EventBus, type BiomeId, type CampaignStageTarget, type ViewportSnapshotPayload } from '../core/EventBus';
import { BIOME_DAG_CONFIGS } from '../data/runes.data';
import { PlayerEntity } from '../entities/player/PlayerEntity';
import { PlayerInventory } from '../entities/player/PlayerInventory';
import { ActionMap } from '../input/ActionMap';
import { HapticsManager } from '../input/HapticsManager';
import type { CameraRig } from '../render/CameraRig';
import { GhostTrailRenderer } from '../render/GhostTrailRenderer';
import type { LightingDirector } from '../render/LightingDirector';
import type { ActiveCameraPostFXBundle } from '../render/pipelines/PipelineRegistry';
import { LocomotionVfxRenderer } from '../render/vfx/LocomotionVfxRenderer';
import type { GeneratedBiomeDag } from '../world/DagBiomeGenerator';
import type { BakedStitchedWorld } from '../world/DoorSocketStitcher';
import { LoreRoomSpawner } from '../world/LoreRoomSpawner';
import type { IWorldDisplayRegistrar } from '../world/ParallaxComposer';
import { RuneInteractionController } from '../world/RuneInteractionController';
import { TeleporterNetwork } from '../world/TeleporterNetwork';
import { TrapController } from '../world/TrapController';
import type { WorldTileRenderer } from '../world/WorldTileRenderer';
import { BiomeCombatSession } from './BiomeCombatSession';
import { computeRoomBoundsPx, stepRoomAndCorridorFraming, stepTeleporterWarpFraming } from './BiomeRoomFraming';
import {
  bindBiomeUiCommands,
  buildPlayerNpcGuardContext,
  captureRunCarryover,
  restorePlayerCarryover,
  type RunCarryoverSnapshot,
} from './BiomeUiCommandBridge';
import type { ShowcaseShaderController } from './ShowcaseShaderController';

export class BiomeRunRig {
  public readonly actionMap: ActionMap;
  public readonly haptics: HapticsManager;
  public readonly ghostTrail: GhostTrailRenderer;
  public readonly locomotionVfx: LocomotionVfxRenderer;
  public readonly player: PlayerEntity;
  public readonly combat: BiomeCombatSession;
  public readonly traps: TrapController;
  public readonly runes: RuneInteractionController;
  public readonly loreRooms: LoreRoomSpawner;
  public readonly teleporters: TeleporterNetwork;

  private safeCheckpoint: { x: number; y: number };
  private readonly crossedBridges = new Set<string>();
  private lastPrompt: string | null = null;
  private readonly unbindUi: () => void;
  private readonly mapKeyHandler: (ev: KeyboardEvent) => void;

  public constructor(
    scene: Phaser.Scene, initVp: ViewportSnapshotPayload, registrar: IWorldDisplayRegistrar,
    private readonly dag: GeneratedBiomeDag, baked: BakedStitchedWorld, rootRng: DeterministicRng,
    tileRenderer: WorldTileRenderer,
    private readonly targets: { readonly heroSprite: Phaser.GameObjects.Sprite; readonly flashDummySprite: Phaser.GameObjects.Sprite; readonly dissolveDummySprite: Phaser.GameObjects.Sprite },
    private readonly cameraRig: CameraRig, lighting: LightingDirector, private readonly postFx: ActiveCameraPostFXBundle,
    private readonly shaderCtrl: ShowcaseShaderController, clock: ClockController, carryover: RunCarryoverSnapshot | undefined,
    onRouteNext: (destinationId: string, nextSeed: number, carry: RunCarryoverSnapshot) => void, onStateChanged: () => void
  ) {
    this.actionMap = new ActionMap(initVp);
    this.haptics = new HapticsManager();
    this.haptics.mount();
    this.ghostTrail = new GhostTrailRenderer(scene, cameraRig);
    this.locomotionVfx = new LocomotionVfxRenderer(scene, cameraRig);

    const startNode = dag.nodes[0]!;
    const spawnX = (startNode.worldTileX + 12) * TILE_SIZE_PX;
    const spawnY = (startNode.worldTileY + 26) * TILE_SIZE_PX;
    this.safeCheckpoint = { x: spawnX, y: spawnY };

    const routeTo = (dest: string, explicitSeed?: number): void => {
      const nextSeed = explicitSeed ?? ((dag.seed + 0x9e3779b9) >>> 0);
      onRouteNext(dest, nextSeed, captureRunCarryover(this.player, this.runes.unlockedRunes));
    };

    this.traps = new TrapController(scene, registrar, dag.nodes);
    this.teleporters = new TeleporterNetwork(scene, registrar, dag);
    this.loreRooms = new LoreRoomSpawner(scene, registrar, dag, rootRng);
    this.runes = new RuneInteractionController(
      scene, registrar, dag, baked,
      (fid) => {
        if (!tileRenderer.shatterBreakableFloor(fid)) return false;
        cameraRig.addTrauma(0.42);
        postFx.chromaticImpact.triggerPulse(0.55, this.player.physics.x, this.player.physics.y, cameraRig.worldMainCam);
        return true;
      },
      (notice) => { this.teleporters.showBanner(notice); this.emitMinimap(); },
      () => routeTo(BIOME_DAG_CONFIGS[dag.biomeId].nextDestinationId),
      carryover?.unlockedRunes
    );

    const initInv = carryover ? new PlayerInventory(carryover.primaryWeapon, carryover.secondaryWeapon, carryover.loadout) : undefined;
    this.player = new PlayerEntity({
      spawnX, spawnY, world: baked, input: this.actionMap, inventory: initInv,
      hasMagneticClawsRune: this.runes.hasRune('rune_magnetic_claws'),
      hasCalcinedRamRune: this.runes.hasRune('rune_calcined_ram'),
      hooks: {
        playAnim: (k) => targets.heroSprite.play(k, true),
        setSpriteFrame: (f) => { targets.heroSprite.anims.stop(); targets.heroSprite.setFrame(f); },
        spawnGhostTrail: () => {
          const f = targets.heroSprite.frame.name || this.player.currentFrameKey;
          this.ghostTrail.spawnGhost(this.player.physics.x, this.player.physics.y, f, this.player.physics.facing < 0, 1.15);
        },
        emitLocomotionVfx: (kind, dirX) => {
          this.locomotionVfx.emitCue(kind, this.player.physics.x, this.player.physics.y, dirX);
          if (kind === 'double_jump_ring' || kind === 'slam_shockwave') {
            lighting.spawnTransientFlash(this.player.physics.x, this.player.physics.y - 8, kind === 'slam_shockwave' ? 0xff5e2b : 0x38bdf8, 155, 2.2, 180);
          }
        },
        setShieldRefractActive: (a) => shaderCtrl.setPlayerParryShield(a || Boolean(this.combat?.isShieldRefractSustained)),
        triggerHitFlash: (ms) => { shaderCtrl.triggerHeroHitFlash(ms); cameraRig.addTrauma(0.38); },
        notifyWeaponStageActive: (wid, idx, slot) => this.combat.handlePlayerWeaponStageActive(wid, idx, slot),
        notifyParrySucceeded: () => this.combat.handlePlayerParrySucceeded(),
        notifyFlaskDrunk: (amt) => this.combat.defenseHooks.handleFlaskDrunk(amt),
        notifySkillActivated: (slot) => this.combat.handleSkillActivated(slot),
        absorbIncomingWithSkillShield: (raw) => this.combat.defenseHooks.absorbIncomingWithSkillShield(raw),
        tryEmergencyCarapaceSave: (before, after) => this.combat.defenseHooks.tryEmergencyCarapaceSave(before, after),
        notifySlamLanded: (wx, wy) => { cameraRig.addTrauma(0.28); this.runes.handleSlamImpact(wx, wy); },
      },
    });
    if (carryover) restorePlayerCarryover(this.player, carryover);

    this.combat = new BiomeCombatSession(
      scene, registrar, dag, baked, rootRng, this.player, clock, cameraRig, lighting, postFx,
      targets.heroSprite, () => this.player.respawnAt(this.safeCheckpoint.x, this.safeCheckpoint.y)
    );

    cameraRig.setWorldBounds(computeRoomBoundsPx(startNode));
    cameraRig.setFocus(spawnX, spawnY - 26);

    this.mapKeyHandler = (ev: KeyboardEvent): void => {
      if (ev.repeat) return;
      if (ev.code === 'KeyV') { this.combat.modals.setMutationForgeOpen(!this.combat.modals.isModalOpen); return; }
      if (ev.code !== 'KeyM' && ev.code !== 'Tab') return;
      if (ev.code === 'Tab') ev.preventDefault();
      this.teleporters.setMinimapExpanded();
      this.emitMinimap();
    };
    window.addEventListener('keydown', this.mapKeyHandler);

    this.unbindUi = bindBiomeUiCommands({
      clock, player: this.player, cameraRig, lighting, postFx, shaderCtrl,
      runes: this.runes, teleporters: this.teleporters,
      getSafeCheckpoint: () => this.safeCheckpoint,
      onEmitMinimap: () => this.emitMinimap(),
      onStateChanged,
      onRequestTransition: (targetBiome?: BiomeId, nextSeed?: number) => routeTo(targetBiome ?? dag.biomeId, nextSeed),
      onWarpStage: (target: CampaignStageTarget) => routeTo(target),
      onSealToggled: () => this.emitMinimap(),
    });
    this.emitMinimap();
  }

  public stepFixed(dtSec: number): void {
    this.actionMap.sampleFixedTick();
    this.player.ctx.hasMagneticClawsRune = this.runes.hasRune('rune_magnetic_claws');
    this.player.ctx.hasCalcinedRamRune = this.runes.hasRune('rune_calcined_ram');
    this.player.ctx.inClimbableVineZone = this.runes.isInsideVineZone(this.player.physics.x, this.player.physics.y);

    const locked = this.teleporters.isWarping || this.runes.isInConduitTransit;
    const interactPressed = !locked && this.actionMap.wasJustPressed('interact');
    if (!locked) this.player.fixedUpdate(dtSec);
    this.combat.stepFixed(dtSec, interactPressed, this.teleporters.activeRoomId);

    const { x: px, y: py, colliderWidth: cw, colliderHeight: ch, vx } = this.player.physics;
    this.loreRooms.stepFixed({
      dtSec, playerX: px, playerY: py, interactJustPressed: interactPressed && !this.combat.modals.isModalOpen,
      isRollingOrMoving: this.player.state === 'DodgeRoll' || Math.abs(vx) > 25,
      isRolling: this.player.state === 'DodgeRoll',
      unlockedRunes: this.runes.unlockedRunes,
      guardCtx: buildPlayerNpcGuardContext(this.player, this.dag.biomeId, this.runes.unlockedRunes),
      onGrantIchor: (amt, wx, wy) => {
        this.player.stats.ichor += amt;
        this.combat.particles.damageNumbers.spawnLabel(wx, wy, `+${amt} 灵液`, 'PARRY');
        EventBus.emit('audio:sfx_requested', { sfxId: 'sfx_ichor_pickup', worldX: wx });
      },
    });
    this.player.stats.safeLoreFreezeActive = this.loreRooms.isInSafeLoreRoom;
    this.combat.synergy.mutations.safeLoreFreezeActive = this.loreRooms.isInSafeLoreRoom;

    this.traps.stepFixed(
      dtSec, { x: px, y: py, w: cw, h: ch, isInvulnerable: this.player.isInvulnerable },
      (kind, ratio, dirX) => {
        if (locked) return;
        const res = this.player.receiveIncomingHit(Math.max(12, Math.round(this.player.stats.maxHp * ratio)), dirX, false);
        if (res === 'dead') this.player.respawnAt(this.safeCheckpoint.x, this.safeCheckpoint.y);
        else if (kind === 'SPIKE_BED' && res === 'hurt') this.snapPlayerTo(this.safeCheckpoint.x, this.safeCheckpoint.y);
      },
      this.combat.targetViews,
      (eid, kind, flatDmg, wx, wy) => this.combat.applyTrapDamageToEnemy(eid, kind, flatDmg, wx, wy),
      () => {
        if (!locked) {
          this.combat.particles.damageNumbers.spawnLabel(px, py - 34, 'PSN -5', 'REACTION');
          if (this.player.receiveIncomingHit(5, 1, false) === 'dead') this.player.respawnAt(this.safeCheckpoint.x, this.safeCheckpoint.y);
        }
      }
    );

    this.runes.stepFixed(
      dtSec, px, py, interactPressed && !this.combat.modals.isModalOpen,
      (nx, ny) => this.snapPlayerTo(nx, ny),
      () => this.ghostTrail.spawnGhost(this.player.physics.x, this.player.physics.y, 'hero_dodge_roll_2', this.player.physics.facing < 0, 1.15)
    );

    const teleDirty = stepTeleporterWarpFraming(
      dtSec, px, py, this.dag, this.teleporters, this.targets.heroSprite,
      this.shaderCtrl, this.cameraRig, this.postFx,
      (nx, ny) => this.snapPlayerTo(nx, ny),
      (sx, sy) => { this.safeCheckpoint = { x: sx, y: sy }; }
    );
    const roomDirty = !this.teleporters.isWarping && stepRoomAndCorridorFraming(px, py, this.dag, this.cameraRig, this.teleporters, this.crossedBridges, (sx, sy) => {
      this.safeCheckpoint = { x: sx, y: sy };
    });
    const promptNow = this.runes.currentPrompt;
    if (teleDirty || roomDirty || promptNow !== this.lastPrompt) { this.lastPrompt = promptNow; this.emitMinimap(); }
    if (!this.teleporters.isWarping && this.player.state !== 'Parry') this.shaderCtrl.setPlayerParryShield(this.combat.isShieldRefractSustained);
    this.ghostTrail.step(dtSec);
    this.locomotionVfx.step(dtSec);
  }

  public emitMinimap(): void {
    EventBus.emit('world:minimap_updated', this.teleporters.buildMinimapSnapshot(this.runes.unlockedRunes, this.runes.currentPrompt));
  }

  public destroy(): void {
    window.removeEventListener('keydown', this.mapKeyHandler);
    this.unbindUi(); this.loreRooms.destroy(); this.combat.destroy();
    this.traps.destroy(); this.runes.destroy(); this.teleporters.destroy();
    this.haptics.destroy(); this.actionMap.destroy(); this.ghostTrail.clearAll();
  }

  private snapPlayerTo(nx: number, ny: number): void {
    const p = this.player.physics;
    p.x = nx; p.y = ny; p.prevX = nx; p.prevY = ny; p.vx = 0; p.vy = 0;
  }
}
