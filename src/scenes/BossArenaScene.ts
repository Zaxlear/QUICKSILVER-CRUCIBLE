/**
 * 独立封闭首领决战场景（src/scenes/BossArenaScene.ts，严格 <= 250 行）：
 * 承载 Boss 1「大煅烧三号刑炉室（典狱长·萨尔弗）」与 Boss 2「衔尾蛇星界坩埚王座（帕拉塞尔苏斯）」。
 */

import Phaser from 'phaser';
import { ClockController } from '../core/ClockController';
import { DepthLayer, TILE_SIZE_PX } from '../core/Constants';
import { EventBus, type BiomeId, type BossId, type CampaignStageTarget } from '../core/EventBus';
import { NarrativeStore } from '../core/NarrativeSessionStore';
import { BIOME_CATALOG } from '../data/biomes.data';
import { BOSS_COMBAT_SPECS } from '../data/dialogue.data';
import { ActionMap } from '../input/ActionMap';
import { CameraRig } from '../render/CameraRig';
import { GhostTrailRenderer } from '../render/GhostTrailRenderer';
import { LightingDirector } from '../render/LightingDirector';
import { attachWorldCameraPostFX, type ActiveCameraPostFXBundle } from '../render/pipelines/PipelineRegistry';
import { LocomotionVfxRenderer } from '../render/vfx/LocomotionVfxRenderer';
import { buildViewportSnapshot } from '../render/ViewportScaler';
import { BiomeAtmosphereEmitter } from '../world/BiomeAtmosphereEmitter';
import { ParallaxComposer, type IWorldDisplayRegistrar } from '../world/ParallaxComposer';
import { WorldTileRenderer } from '../world/WorldTileRenderer';
import { bindBiomeUiCommands, captureRunCarryover, type RunCarryoverSnapshot } from './BiomeUiCommandBridge';
import { BossArenaRig } from './BossArenaRig';
import { RunSettlementController } from './RunSettlementController';
import {
  buildEnclosedHallDag, buildSingleHallMinimapSnapshot, publishEnclosedSceneTelemetry, SANCTUM_FLOOR_Y,
} from './SanctumStageBuilder';
import { attachSceneSaveHotReload, finalizeBossArenaRunInVault } from './SceneSaveBridge';
import { ShowcaseShaderController } from './ShowcaseShaderController';

export class BossArenaScene extends Phaser.Scene {
  private clock!: ClockController;
  private cameraRig!: CameraRig;
  private lighting!: LightingDirector;
  private postFx!: ActiveCameraPostFXBundle;
  private parallax!: ParallaxComposer;
  private atmosphere!: BiomeAtmosphereEmitter;
  private tileRenderer!: WorldTileRenderer;
  private shaderCtrl!: ShowcaseShaderController;
  private actionMap!: ActionMap;
  private ghostTrail!: GhostTrailRenderer;
  private locomotionVfx!: LocomotionVfxRenderer;
  private arenaRig!: BossArenaRig;
  private settlement!: RunSettlementController;
  private heroSprite!: Phaser.GameObjects.Sprite;
  private unbindUi!: () => void;
  private mapKeyHandler!: (ev: KeyboardEvent) => void;
  private bossId: BossId = 'boss_01_furnace_warden';
  private widthTiles = 44;
  private mapExpanded = false;
  private hudSyncMs = 0;

  public constructor() { super({ key: 'BossArenaScene' }); }

  public create(data?: { readonly bossId?: BossId; readonly carryover?: RunCarryoverSnapshot }): void {
    this.bossId = data?.bossId ?? 'boss_01_furnace_warden';
    const isSulfur = this.bossId === 'boss_01_furnace_warden';
    const biomeKey = isSulfur ? 'biome_01_slag_retort' : 'biome_04_crucible_apex';
    const bSpec = BIOME_CATALOG[biomeKey];
    this.widthTiles = isSulfur ? BOSS_COMBAT_SPECS.SULFUR.arenaWidthTiles : BOSS_COMBAT_SPECS.PARACELSUS.arenaWidthTiles;

    this.clock = new ClockController();
    this.cameraRig = new CameraRig(this);
    this.cameraRig.worldMainCam.setBackgroundColor(bSpec.backdropHex);
    this.postFx = attachWorldCameraPostFX(this.cameraRig.worldMainCam);
    this.lighting = new LightingDirector(this, bSpec.ambientNum);

    const registrar: IWorldDisplayRegistrar = {
      registerWorldLit: (obj) => this.cameraRig.registerWorldLit(obj),
      registerCrispOverlay: (obj) => this.cameraRig.registerCrispOverlay(obj),
      unregister: (obj) => this.cameraRig.unregister(obj),
      registerAmbientLight: (cfg) => { this.lighting.registerAmbientAnchor(cfg); },
      spawnLightFlash: (x, y, col, rad, peak, dur) => { this.lighting.spawnTransientFlash(x, y, col, rad, peak, dur); },
    };

    const steamJumpPads = isSulfur
      ? [{ tileX: 6, tileY: 20, widthTiles: 7 }, { tileX: this.widthTiles - 13, tileY: 20, widthTiles: 7 }]
      : [];
    const { dag, baked } = buildEnclosedHallDag(biomeKey, `arena_${this.bossId}`, this.widthTiles, 30, steamJumpPads);

    this.parallax = new ParallaxComposer(this, registrar, bSpec.parallaxPrefix, bSpec.parallaxScrollFactors);
    this.atmosphere = new BiomeAtmosphereEmitter(this, registrar, bSpec.atmosphere);
    this.tileRenderer = new WorldTileRenderer(this, registrar, dag, baked, bSpec.tilesetKey);

    this.heroSprite = registrar.registerWorldLit(
      this.add.sprite(116, SANCTUM_FLOOR_Y, 'hero_atlas', 'hero_idle_0').setOrigin(0.5, 1.0).setScale(1.15).setDepth(DepthLayer.PLAYER).setPipeline('Light2D')
    );
    const dummy = registrar.registerWorldLit(this.add.sprite(-999, 0, 'hero_atlas', 'hero_parry_1').setVisible(false));
    this.shaderCtrl = new ShowcaseShaderController(
      { parallaxLayers: [], heroSprite: this.heroSprite, flashDummySprite: dummy, dissolveDummySprite: dummy, collisionWorld: baked, cameraBounds: baked.worldBoundsPx, spawnPoint: { x: 116, y: SANCTUM_FLOOR_Y } },
      this.postFx, this.cameraRig.worldMainCam
    );

    const initVp = window.__QC_GAME_APP__?.currentViewport ?? buildViewportSnapshot(window.innerWidth || 640, window.innerHeight || 360, window.devicePixelRatio || 1);
    this.actionMap = new ActionMap(initVp);
    this.ghostTrail = new GhostTrailRenderer(this, this.cameraRig);
    this.locomotionVfx = new LocomotionVfxRenderer(this, this.cameraRig);

    this.arenaRig = new BossArenaRig(
      this, registrar, this.bossId, baked, this.widthTiles * TILE_SIZE_PX, SANCTUM_FLOOR_Y,
      this.actionMap, this.heroSprite, this.ghostTrail, this.locomotionVfx, this.clock,
      this.cameraRig, this.lighting, this.postFx, this.shaderCtrl, data?.carryover,
      () => this.handleVictoryDeparture(),
      () => this.settlement.triggerPermadeath(this.bossId)
    );
    const settleBiome = isSulfur ? 'biome_02_vitriol_sewers' : 'biome_04_crucible_apex';
    this.settlement = new RunSettlementController(
      this, this.clock, this.arenaRig.player, settleBiome, 0x51c0ffee, () => `arena_${this.bossId}`
    );

    this.cameraRig.setWorldBounds(baked.worldBoundsPx);
    this.cameraRig.setFocus(260, SANCTUM_FLOOR_Y - 36);

    this.mapKeyHandler = (ev: KeyboardEvent): void => {
      if (ev.repeat || (ev.code !== 'KeyM' && ev.code !== 'Tab')) return;
      if (ev.code === 'Tab') ev.preventDefault();
      this.mapExpanded = !this.mapExpanded;
      this.emitMinimap();
    };
    window.addEventListener('keydown', this.mapKeyHandler);

    const unbindSave = attachSceneSaveHotReload(this);
    const unbindCmd = bindBiomeUiCommands({
      clock: this.clock, player: this.arenaRig.player, cameraRig: this.cameraRig, lighting: this.lighting,
      postFx: this.postFx, shaderCtrl: this.shaderCtrl,
      getSafeCheckpoint: () => ({ x: 116, y: SANCTUM_FLOOR_Y }),
      onEmitMinimap: () => this.emitMinimap(),
      onSetMinimapExpanded: (exp) => { this.mapExpanded = exp !== undefined ? exp : !this.mapExpanded; },
      onStateChanged: () => this.syncTelemetry(),
      onRequestTransition: (bid, seed) => this.jumpToBiome(bid ?? 'biome_03_clockwork_ossuary', seed ?? 0x51c0ffee),
      onWarpStage: (target) => this.warpStage(target),
      onSealToggled: () => { this.arenaRig.emitBossHud(); this.emitMinimap(); },
    });
    this.unbindUi = () => { unbindCmd(); unbindSave(); };

    window.__QC_ACTION_MAP__ = this.actionMap;
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.emitMinimap();
    this.syncTelemetry();
  }

  public override update(_time: number, deltaMs: number): void {
    const player = this.arenaRig.player;
    this.settlement.stepRealDelta(deltaMs);
    this.clock.tick(
      deltaMs,
      (dtSec) => {
        this.actionMap.sampleFixedTick();
        const interact = !this.settlement.isDying && this.actionMap.wasJustPressed('interact');
        player.fixedUpdate(dtSec);
        if (!this.settlement.isDying) this.arenaRig.stepFixed(dtSec, interact);
        if (player.stats.hp <= 0 && !this.settlement.isDying) this.settlement.triggerPermadeath(this.bossId);

        const midX = player.physics.x * 0.65 + this.arenaRig.boss.x * 0.35;
        this.cameraRig.setFocus(midX, player.physics.y - 34);
        this.cameraRig.stepSimulation(dtSec);
        this.shaderCtrl.step(dtSec);
        this.postFx.shieldRefract.stepTime(dtSec);
        this.postFx.chromaticImpact.stepDecay(dtSec);
        this.ghostTrail.step(dtSec);
        this.locomotionVfx.step(dtSec);
      },
      (alpha) => {
        const interp = player.computeInterpolatedTransform(alpha);
        this.heroSprite.setPosition(interp.x, interp.y).setFlipX(player.physics.facing < 0);
        this.shaderCtrl.syncShieldCenter(interp.x, interp.y - 18);
        const cam = this.cameraRig.worldMainCam;
        const renderDtSec = this.clock.isPaused ? 0 : Math.min(Math.max(deltaMs / 1000, 0), 0.05);
        if (renderDtSec > 0) {
          this.atmosphere.stepFixed(renderDtSec, cam.scrollX, cam.scrollY, cam.width, cam.height);
          this.lighting.setHeroCorePosition(interp.x, interp.y - 18);
          this.lighting.step(renderDtSec, interp.x, interp.y - 24);
        }
        this.parallax.syncWithCamera(cam.scrollX, cam.scrollY);
        this.tileRenderer.cullToViewport(cam.scrollX, cam.scrollY, cam.scrollX + cam.width, cam.scrollY + cam.height);
      }
    );
    if ((this.hudSyncMs += deltaMs) >= 90) { this.hudSyncMs = 0; this.syncTelemetry(); }
  }

  private handleVictoryDeparture(): void {
    NarrativeStore.archiveCarriedBlueprints();
    const carry = captureRunCarryover(this.arenaRig.player, NarrativeStore.unlockedRunes);
    if (this.bossId === 'boss_01_furnace_warden') {
      this.scene.start('BiomeRunScene', { biomeId: 'biome_03_clockwork_ossuary', seed: 0x51c0ffee, carryover: carry });
    } else {
      finalizeBossArenaRunInVault(this.arenaRig.player, this.bossId, 'VICTORY');
      this.scene.start('SanctumHubScene', { carryover: carry, skipPrologue: true });
    }
  }

  private jumpToBiome(biomeId: BiomeId, seed: number): void {
    this.mapExpanded = false;
    this.scene.start('BiomeRunScene', { biomeId, seed, carryover: captureRunCarryover(this.arenaRig.player, NarrativeStore.unlockedRunes) });
  }

  private warpStage(target: CampaignStageTarget): void {
    this.mapExpanded = false;
    const carry = captureRunCarryover(this.arenaRig.player, NarrativeStore.unlockedRunes);
    if (target === 'sanctum') {
      if (this.bossId === 'boss_02_grand_alchemist' && !this.arenaRig.boss.isAlive) {
        finalizeBossArenaRunInVault(this.arenaRig.player, this.bossId, 'VICTORY');
      }
      this.scene.start('SanctumHubScene', { carryover: carry, skipPrologue: true });
    } else {
      this.scene.restart({ bossId: target, carryover: carry });
    }
  }

  private emitMinimap(): void {
    const isSulfur = this.bossId === 'boss_01_furnace_warden';
    EventBus.emit('world:minimap_updated', buildSingleHallMinimapSnapshot(
      isSulfur ? 'biome_01_slag_retort' : 'biome_04_crucible_apex',
      isSulfur ? BOSS_COMBAT_SPECS.SULFUR.arenaTitleZh : BOSS_COMBAT_SPECS.PARACELSUS.arenaTitleZh,
      `arena_${this.bossId}`, this.widthTiles, this.mapExpanded, null
    ));
  }

  private syncTelemetry(): void {
    publishEnclosedSceneTelemetry({
      sceneKey: 'BossArenaScene', game: this.game, clock: this.clock, cameraRig: this.cameraRig,
      lighting: this.lighting, shaderCtrl: this.shaderCtrl, heroSprite: this.heroSprite,
      player: this.arenaRig.player, synergy: this.arenaRig.synergy, lastHitStopMs: this.arenaRig.lastHitStopMs,
    });
  }

  private handleResize(gs: Phaser.Structs.Size): void { this.cameraRig.resize(gs.width, gs.height); this.parallax.resize(gs.width, gs.height); }
  private cleanup(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    window.removeEventListener('keydown', this.mapKeyHandler);
    this.unbindUi(); this.arenaRig.destroy(); this.atmosphere.destroy();
    this.tileRenderer.destroy(); this.parallax.destroy(); this.actionMap.destroy(); this.ghostTrail.clearAll();
  }
}
