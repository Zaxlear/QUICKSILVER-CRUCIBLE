/**
 * 出生基地「永恒锻炉圣所（Athanor Sanctum）」主场景（src/scenes/SanctumHubScene.ts）：
 * 承载开场三段序章唤醒、12 支武器图鉴悬吊玻璃瓶、科尔维斯 & 伊索尔德动态折叠对话、大熔炉淬火与出发管口。
 */

import Phaser from 'phaser';
import { ClockController } from '../core/ClockController';
import { DepthLayer } from '../core/Constants';
import { DeterministicRng } from '../core/DeterministicRng';
import { EventBus, type BiomeId, type CampaignStageTarget } from '../core/EventBus';
import { NarrativeStore } from '../core/NarrativeSessionStore';
import { BIOME_CATALOG } from '../data/biomes.data';
import { PLAYER_KINEMATICS } from '../data/playerKinematics.data';
import { PlayerEntity } from '../entities/player/PlayerEntity';
import { PlayerInventory } from '../entities/player/PlayerInventory';
import { ActionMap } from '../input/ActionMap';
import { CameraRig } from '../render/CameraRig';
import { GhostTrailRenderer } from '../render/GhostTrailRenderer';
import { LightingDirector } from '../render/LightingDirector';
import { attachWorldCameraPostFX, type ActiveCameraPostFXBundle } from '../render/pipelines/PipelineRegistry';
import { LocomotionVfxRenderer } from '../render/vfx/LocomotionVfxRenderer';
import { ParticleDirector } from '../render/vfx/ParticleDirector';
import { buildViewportSnapshot } from '../render/ViewportScaler';
import { CloudSync } from '../storage/CloudSyncCoordinator';
import { BiomeAtmosphereEmitter } from '../world/BiomeAtmosphereEmitter';
import { CombatLootSpawner } from '../world/CombatLootSpawner';
import { DialogueBannerController } from '../world/DialogueBannerController';
import { ParallaxComposer, type IWorldDisplayRegistrar } from '../world/ParallaxComposer';
import { WorldTileRenderer } from '../world/WorldTileRenderer';
import { bindBiomeUiCommands, captureRunCarryover, restorePlayerCarryover, type RunCarryoverSnapshot } from './BiomeUiCommandBridge';
import { CombatModalController } from './CombatModalAndRosterBridge';
import {
  buildEnclosedHallDag, buildSanctumPropsAndNpcs, buildSingleHallMinimapSnapshot,
  publishEnclosedSceneTelemetry, SANCTUM_FLOOR_Y, stepSanctumInteractionTick, type SanctumStageObjects,
} from './SanctumStageBuilder';
import { attachSceneSaveHotReload } from './SceneSaveBridge';
import { ShowcaseShaderController } from './ShowcaseShaderController';

const WIDTH_TILES = 46;

export class SanctumHubScene extends Phaser.Scene {
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
  private particles!: ParticleDirector;
  private lootStub!: CombatLootSpawner;
  private modals!: CombatModalController;
  private player!: PlayerEntity;
  private heroSprite!: Phaser.GameObjects.Sprite;
  private sanctumProps!: SanctumStageObjects;
  private bannerCtrl!: DialogueBannerController;
  private unbindUi!: () => void;
  private mapKeyHandler!: (ev: KeyboardEvent) => void;
  private mapExpanded = false;
  private activePrompt: string | null = null;
  private animMs = 0;
  private hudSyncMs = 0;

  public constructor() { super({ key: 'SanctumHubScene' }); }

  public create(data?: { readonly carryover?: RunCarryoverSnapshot; readonly skipPrologue?: boolean }): void {
    EventBus.emit('boss:hud_updated', null);
    const bSpec = BIOME_CATALOG.biome_01_slag_retort;
    this.clock = new ClockController();
    this.cameraRig = new CameraRig(this);
    this.cameraRig.worldMainCam.setBackgroundColor(bSpec.backdropHex);
    this.postFx = attachWorldCameraPostFX(this.cameraRig.worldMainCam);
    this.lighting = new LightingDirector(this, 0x2e3144);

    const registrar: IWorldDisplayRegistrar = {
      registerWorldLit: (obj) => this.cameraRig.registerWorldLit(obj),
      registerCrispOverlay: (obj) => this.cameraRig.registerCrispOverlay(obj),
      unregister: (obj) => this.cameraRig.unregister(obj),
      registerAmbientLight: (cfg) => { this.lighting.registerAmbientAnchor(cfg); },
      spawnLightFlash: (x, y, col, rad, peak, dur) => { this.lighting.spawnTransientFlash(x, y, col, rad, peak, dur); },
    };

    const { dag, baked } = buildEnclosedHallDag('biome_01_slag_retort', 'sanctum_athanor_01', WIDTH_TILES, 30, [
      { tileX: 8, tileY: 20, widthTiles: 10 }, { tileX: 28, tileY: 20, widthTiles: 10 },
    ]);
    this.parallax = new ParallaxComposer(this, registrar, bSpec.parallaxPrefix, bSpec.parallaxScrollFactors);
    this.atmosphere = new BiomeAtmosphereEmitter(this, registrar, 'SLAG_EMBERS');
    this.tileRenderer = new WorldTileRenderer(this, registrar, dag, baked, bSpec.tilesetKey);
    this.sanctumProps = buildSanctumPropsAndNpcs(this, registrar, SANCTUM_FLOOR_Y);
    this.bannerCtrl = new DialogueBannerController();

    const spawnX = 256;
    this.heroSprite = registrar.registerWorldLit(
      this.add.sprite(spawnX, SANCTUM_FLOOR_Y, 'hero_atlas', 'hero_idle_0').setOrigin(0.5, 1.0).setScale(1.15).setDepth(DepthLayer.PLAYER).setPipeline('Light2D')
    );
    const dummy = registrar.registerWorldLit(this.add.sprite(-999, 0, 'hero_atlas', 'hero_parry_1').setVisible(false));
    this.shaderCtrl = new ShowcaseShaderController(
      { parallaxLayers: [], heroSprite: this.heroSprite, flashDummySprite: dummy, dissolveDummySprite: dummy, collisionWorld: baked, cameraBounds: baked.worldBoundsPx, spawnPoint: { x: spawnX, y: SANCTUM_FLOOR_Y } },
      this.postFx, this.cameraRig.worldMainCam
    );

    const initVp = window.__QC_GAME_APP__?.currentViewport ?? buildViewportSnapshot(window.innerWidth || 640, window.innerHeight || 360, window.devicePixelRatio || 1);
    this.actionMap = new ActionMap(initVp);
    this.ghostTrail = new GhostTrailRenderer(this, this.cameraRig);
    this.locomotionVfx = new LocomotionVfxRenderer(this, this.cameraRig);
    this.particles = new ParticleDirector(this, this.cameraRig, baked);

    const initInv = data?.carryover ? new PlayerInventory(data.carryover.primaryWeapon, data.carryover.secondaryWeapon, data.carryover.loadout) : undefined;
    this.player = new PlayerEntity({
      spawnX, spawnY: SANCTUM_FLOOR_Y, world: baked, input: this.actionMap, inventory: initInv,
      hasMagneticClawsRune: true, hasCalcinedRamRune: true,
      hooks: {
        playAnim: (k) => this.heroSprite.play(k, true),
        setSpriteFrame: (f) => { this.heroSprite.anims.stop(); this.heroSprite.setFrame(f); },
        spawnGhostTrail: () => this.ghostTrail.spawnGhost(this.player.physics.x, this.player.physics.y, this.heroSprite.frame.name || 'hero_dodge_roll_2', this.player.physics.facing < 0, 1.15),
        emitLocomotionVfx: (kind, dirX) => this.locomotionVfx.emitCue(kind, this.player.physics.x, this.player.physics.y, dirX),
        setShieldRefractActive: (a) => this.shaderCtrl.setPlayerParryShield(a),
        triggerHitFlash: (ms) => this.shaderCtrl.triggerHeroHitFlash(ms),
      },
    });
    if (data?.carryover) restorePlayerCarryover(this.player, data.carryover);
    this.player.stats.resetFullHealth();

    const rng = new DeterministicRng(0x51c0ffee);
    this.lootStub = new CombatLootSpawner(this, registrar, dag, this.player.inventory, rng);
    this.modals = new CombatModalController(this.player, this.lootStub, rng, this.clock, this.cameraRig, () => this.syncTelemetry());
    this.cameraRig.setWorldBounds(baked.worldBoundsPx);
    this.cameraRig.setFocus(spawnX, SANCTUM_FLOOR_Y - 26);

    if (!NarrativeStore.prologueCompleted && !data?.skipPrologue) {
      NarrativeStore.prologueCompleted = true;
      this.bannerCtrl.startPrologueSequence(spawnX);
    }

    this.mapKeyHandler = (ev: KeyboardEvent): void => {
      if (ev.repeat) return;
      if (ev.code === 'KeyV') { this.modals.setMutationForgeOpen(!this.modals.isModalOpen); return; }
      if (ev.code === 'KeyM' || ev.code === 'Tab') {
        if (ev.code === 'Tab') ev.preventDefault();
        this.mapExpanded = !this.mapExpanded;
        this.emitMinimap();
      }
    };
    window.addEventListener('keydown', this.mapKeyHandler);

    const unbindSave = attachSceneSaveHotReload(this);
    const unbindCmd = bindBiomeUiCommands({
      clock: this.clock, player: this.player, cameraRig: this.cameraRig, lighting: this.lighting,
      postFx: this.postFx, shaderCtrl: this.shaderCtrl,
      getSafeCheckpoint: () => ({ x: spawnX, y: SANCTUM_FLOOR_Y }),
      onEmitMinimap: () => this.emitMinimap(),
      onSetMinimapExpanded: (exp) => { this.mapExpanded = exp !== undefined ? exp : !this.mapExpanded; },
      onStateChanged: () => this.syncTelemetry(),
      onRequestTransition: (bid, seed) => this.departToBiome(bid ?? 'biome_01_slag_retort', seed ?? 0x51c0ffee),
      onWarpStage: (target) => this.warpStage(target),
      onSealToggled: () => this.emitMinimap(),
    });
    this.unbindUi = () => { unbindCmd(); unbindSave(); };

    window.__QC_ACTION_MAP__ = this.actionMap;
    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanup, this);
    this.emitMinimap();
    this.syncTelemetry();
  }

  public override update(_time: number, deltaMs: number): void {
    this.clock.tick(
      deltaMs,
      (dtSec) => {
        const dtMs = dtSec * 1000;
        this.animMs += dtMs;
        this.actionMap.sampleFixedTick();
        const interact = !this.modals.isModalOpen && this.actionMap.wasJustPressed('interact');
        this.player.fixedUpdate(dtSec);
        stepSanctumInteractionTick({
          dtMs, animMs: this.animMs, interactPressed: interact, player: this.player,
          props: this.sanctumProps, bannerCtrl: this.bannerCtrl, particles: this.particles,
          lighting: this.lighting, prevPrompt: this.activePrompt,
          onPromptChanged: (nx) => { this.activePrompt = nx; this.emitMinimap(); },
          onDepart: () => this.departToBiome('biome_01_slag_retort', 0x51c0ffee),
        });

        this.cameraRig.setFocus(this.player.physics.x, this.player.physics.y - 26);
        this.cameraRig.setLookahead(this.player.physics.facing * PLAYER_KINEMATICS.CAMERA_LOOKAHEAD_X_PX, -6);
        this.cameraRig.stepSimulation(dtSec);
        this.shaderCtrl.step(dtSec);
        this.postFx.shieldRefract.stepTime(dtSec);
        this.postFx.chromaticImpact.stepDecay(dtSec);
        this.ghostTrail.step(dtSec);
        this.locomotionVfx.step(dtSec);
        this.particles.stepFixed(dtSec);
      },
      (alpha) => {
        const interp = this.player.computeInterpolatedTransform(alpha);
        this.heroSprite.setPosition(interp.x, interp.y).setFlipX(this.player.physics.facing < 0);
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

  private departToBiome(biomeId: BiomeId, seed: number): void {
    this.mapExpanded = false;
    CloudSync.beginNewRunSession();
    this.scene.start('BiomeRunScene', { biomeId, seed, carryover: captureRunCarryover(this.player, NarrativeStore.unlockedRunes) });
  }

  private warpStage(target: CampaignStageTarget): void {
    this.mapExpanded = false;
    if (target !== 'sanctum') this.scene.start('BossArenaScene', { bossId: target, carryover: captureRunCarryover(this.player, NarrativeStore.unlockedRunes) });
  }

  private emitMinimap(): void {
    EventBus.emit('world:minimap_updated', buildSingleHallMinimapSnapshot('biome_01_slag_retort', '永恒锻炉圣所 · Athanor Sanctum', 'sanctum_athanor_01', WIDTH_TILES, this.mapExpanded, this.activePrompt));
  }

  private syncTelemetry(): void {
    publishEnclosedSceneTelemetry({
      sceneKey: 'SanctumHubScene', game: this.game, clock: this.clock, cameraRig: this.cameraRig,
      lighting: this.lighting, shaderCtrl: this.shaderCtrl, heroSprite: this.heroSprite, player: this.player,
    });
  }

  private handleResize(gs: Phaser.Structs.Size): void { this.cameraRig.resize(gs.width, gs.height); this.parallax.resize(gs.width, gs.height); }
  private cleanup(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleResize, this);
    window.removeEventListener('keydown', this.mapKeyHandler);
    this.unbindUi(); this.modals.destroy(); this.lootStub.destroy(); this.bannerCtrl.destroy();
    this.sanctumProps.destroy(); this.particles.destroy(); this.atmosphere.destroy();
    this.tileRenderer.destroy(); this.parallax.destroy(); this.actionMap.destroy(); this.ghostTrail.clearAll();
  }
}
