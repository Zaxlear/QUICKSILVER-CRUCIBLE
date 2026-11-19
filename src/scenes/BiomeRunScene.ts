/**
 * 四大生态群落通用肉鸽探索与战斗主场景（src/scenes/BiomeRunScene.ts）：
 * 动态挂载当前群落的 Light2D 环境色、5 层法线视差、47-Tile 法线瓦片、氛围粒子与 12 怪编队，支持云存档无刷新热恢复。
 */

import Phaser from 'phaser';
import { ClockController } from '../core/ClockController';
import { DepthLayer, FIXED_SIM_HZ, MAX_HARDWARE_LIGHTS, TILE_SIZE_PX } from '../core/Constants';
import { DeterministicRng } from '../core/DeterministicRng';
import {
  EventBus, type ActiveRunSnapshot, type BiomeId, type BootTelemetryPayload,
  type PlayerCombatHudSnapshot, type ShowcaseStatePayload,
} from '../core/EventBus';
import { NarrativeStore } from '../core/NarrativeSessionStore';
import { BIOME_CATALOG } from '../data/biomes.data';
import { PLAYER_KINEMATICS, type PlayerTelemetrySnapshot } from '../data/playerKinematics.data';
import type { ActionMap } from '../input/ActionMap';
import { CameraRig } from '../render/CameraRig';
import { LightingDirector } from '../render/LightingDirector';
import { attachWorldCameraPostFX, type ActiveCameraPostFXBundle } from '../render/pipelines/PipelineRegistry';
import { buildViewportSnapshot } from '../render/ViewportScaler';
import { BiomeAtmosphereEmitter } from '../world/BiomeAtmosphereEmitter';
import { generateBiomeDag, type GeneratedBiomeDag } from '../world/DagBiomeGenerator';
import { bakeStitchedWorldGeometry, type BakedStitchedWorld } from '../world/DoorSocketStitcher';
import { ParallaxComposer, type IWorldDisplayRegistrar } from '../world/ParallaxComposer';
import type { RoomChunkTemplate } from '../world/RoomChunkSchema';
import { WorldTileRenderer } from '../world/WorldTileRenderer';
import { buildBiomeDagDebugTelemetry, computeRoomBoundsPx, type BiomeDagDebugTelemetry } from './BiomeRoomFraming';
import { BiomeRunRig } from './BiomeRunRig';
import { dispatchBiomeRoute, type RunCarryoverSnapshot } from './BiomeUiCommandBridge';
import { applyResumeSnapshotToBiomeRig, attachSceneSaveHotReload, snapshotToCarryover } from './SceneSaveBridge';
import { ShowcaseShaderController } from './ShowcaseShaderController';
import type { ShowcaseStageRefs } from './ShowcaseStageBuilder';

declare global {
  interface Window {
    __QC_SHOWCASE_STATE__?: ShowcaseStatePayload;
    __QC_PLAYER_STATE__?: PlayerTelemetrySnapshot;
    __QC_COMBAT_STATE__?: PlayerCombatHudSnapshot & {
      readonly biomeId?: BiomeId; readonly lastHitStopMs: number; readonly activeProjectiles?: number;
      readonly activeHazardZones?: number; readonly aliveEnemies?: number; readonly aggroEnemies?: number;
      readonly activeSpecies?: readonly string[];
    };
    __QC_ACTION_MAP__?: ActionMap;
    __QC_BIOME_DAG__?: BiomeDagDebugTelemetry;
  }
}

export class BiomeRunScene extends Phaser.Scene {
  private clock!: ClockController;
  private rng!: DeterministicRng;
  private cameraRig!: CameraRig;
  private lighting!: LightingDirector;
  private postFx!: ActiveCameraPostFXBundle;
  private parallax!: ParallaxComposer;
  private atmosphere!: BiomeAtmosphereEmitter;
  private tileRenderer!: WorldTileRenderer;
  private shaderCtrl!: ShowcaseShaderController;
  private rig!: BiomeRunRig;
  private dag!: GeneratedBiomeDag;
  private baked!: BakedStitchedWorld;
  private heroSprite!: Phaser.GameObjects.Sprite;
  private unbindSave!: () => void;
  private telemetryTimerMs = 0;
  private lastDagDiagKey = '';

  public constructor() { super({ key: 'BiomeRunScene' }); }

  public create(data?: {
    readonly seed?: number;
    readonly biomeId?: BiomeId;
    readonly carryover?: RunCarryoverSnapshot;
    readonly resumeSnapshot?: ActiveRunSnapshot;
  }): void {
    const resume = data?.resumeSnapshot;
    const seed = (resume?.runSeed ?? data?.seed ?? 0x51c0ffee) >>> 0;
    const biomeId: BiomeId = resume?.biomeId ?? data?.biomeId ?? 'biome_01_slag_retort';
    const carryover = resume ? snapshotToCarryover(resume, NarrativeStore.unlockedRunes) : data?.carryover;
    const biomeSpec = BIOME_CATALOG[biomeId];

    this.clock = new ClockController();
    const topoRng = new DeterministicRng(seed);
    this.rng = resume
      ? DeterministicRng.fromSnapshot({ seed, internalState: resume.rngInternalState, stepCount: resume.rngStepCount })
      : topoRng;

    this.cameraRig = new CameraRig(this);
    this.cameraRig.worldMainCam.setBackgroundColor(biomeSpec.backdropHex);
    this.postFx = attachWorldCameraPostFX(this.cameraRig.worldMainCam);
    this.lighting = new LightingDirector(this, biomeSpec.ambientNum);

    const registrar: IWorldDisplayRegistrar = {
      registerWorldLit: (obj) => this.cameraRig.registerWorldLit(obj),
      registerCrispOverlay: (obj) => this.cameraRig.registerCrispOverlay(obj),
      unregister: (obj) => this.cameraRig.unregister(obj),
      registerAmbientLight: (cfg) => { this.lighting.registerAmbientAnchor(cfg); },
      spawnLightFlash: (x, y, col, rad, peak, dur) => { this.lighting.spawnTransientFlash(x, y, col, rad, peak, dur); },
    };

    const chunks = (this.registry.get('all_biome_chunks') as readonly RoomChunkTemplate[]) ?? [];
    this.dag = generateBiomeDag(topoRng, biomeId, chunks);
    this.baked = bakeStitchedWorldGeometry(this.dag.nodes, this.dag.bridges);

    this.parallax = new ParallaxComposer(this, registrar, biomeSpec.parallaxPrefix, biomeSpec.parallaxScrollFactors);
    this.atmosphere = new BiomeAtmosphereEmitter(this, registrar, biomeSpec.atmosphere);
    this.tileRenderer = new WorldTileRenderer(this, registrar, this.dag, this.baked, biomeSpec.tilesetKey);

    const startNode = this.dag.nodes[0]!;
    const startFloorY = (startNode.worldTileY + 26) * TILE_SIZE_PX;
    const startX = (startNode.worldTileX + 12) * TILE_SIZE_PX;

    this.heroSprite = registrar.registerWorldLit(
      this.add.sprite(startX, startFloorY, 'hero_atlas', 'hero_idle_0').setOrigin(0.5, 1.0).setScale(1.15).setDepth(DepthLayer.PLAYER).setPipeline('Light2D')
    );
    const flashDummy = registrar.registerWorldLit(
      this.add.sprite(startX - 999, startFloorY, 'hero_atlas', 'hero_parry_1').setOrigin(0.5, 1.0).setVisible(false).setDepth(DepthLayer.ENEMIES).setPipeline('Light2D')
    );
    const dissolveDummy = registrar.registerWorldLit(
      this.add.sprite(startX - 999, startFloorY, 'hero_atlas', 'hero_hurt_0').setOrigin(0.5, 1.0).setVisible(false).setDepth(DepthLayer.ENEMIES).setPipeline('Light2D')
    );

    const stageShim: ShowcaseStageRefs = {
      parallaxLayers: [], heroSprite: this.heroSprite, flashDummySprite: flashDummy, dissolveDummySprite: dissolveDummy,
      collisionWorld: this.baked, cameraBounds: this.baked.worldBoundsPx, spawnPoint: { x: startX, y: startFloorY },
    };
    this.shaderCtrl = new ShowcaseShaderController(stageShim, this.postFx, this.cameraRig.worldMainCam);

    const initVp = window.__QC_GAME_APP__?.currentViewport ?? buildViewportSnapshot(window.innerWidth || 640, window.innerHeight || 360, window.devicePixelRatio || 1);

    EventBus.emit('boss:hud_updated', null);
    this.rig = new BiomeRunRig(
      this, initVp, registrar, this.dag, this.baked, this.rng, this.tileRenderer,
      { heroSprite: this.heroSprite, flashDummySprite: flashDummy, dissolveDummySprite: dissolveDummy },
      this.cameraRig, this.lighting, this.postFx, this.shaderCtrl, this.clock, carryover,
      (destId, nextSeed, carry) => dispatchBiomeRoute(this, destId, nextSeed, carry),
      () => this.publishTelemetry()
    );
    if (resume) {
      applyResumeSnapshotToBiomeRig(this.dag, this.rig, resume, (node, x, y) => {
        this.cameraRig.setWorldBounds(computeRoomBoundsPx(node));
        this.cameraRig.setFocus(x, y - 26);
      });
    }
    this.unbindSave = attachSceneSaveHotReload(this, { dag: this.dag, rng: this.rng, rig: this.rig });
    window.__QC_ACTION_MAP__ = this.rig.actionMap;

    this.scale.on(Phaser.Scale.Events.RESIZE, this.handleScaleResize, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.cleanupScene, this);
    this.publishTelemetry();
  }

  public override update(_time: number, deltaMs: number): void {
    const player = this.rig.player;
    this.rig.settlement.stepRealDelta(deltaMs);
    this.clock.tick(
      deltaMs,
      (dtSec) => {
        this.rig.stepFixed(dtSec);
        this.shaderCtrl.step(dtSec);
        if (!this.rig.teleporters.isWarping) {
          this.cameraRig.setFocus(player.physics.x, player.physics.y - 26);
          this.cameraRig.setLookahead(player.physics.facing * PLAYER_KINEMATICS.CAMERA_LOOKAHEAD_X_PX, -6);
        }
        this.cameraRig.stepSimulation(dtSec);
        this.postFx.shieldRefract.stepTime(dtSec);
        this.postFx.chromaticImpact.stepDecay(dtSec);
      },
      (alpha) => {
        const interp = player.computeInterpolatedTransform(alpha);
        const atkJitterX = this.rig.combat.sampleRenderJitter(deltaMs);
        this.heroSprite.setPosition(interp.x + atkJitterX, interp.y).setFlipX(player.physics.facing < 0);
        this.shaderCtrl.syncShieldCenter(interp.x, interp.y - 18);
        const cam = this.cameraRig.worldMainCam;
        const renderDtSec = this.clock.isPaused ? 0 : Math.min(Math.max(deltaMs / 1000, 0), 0.05);
        if (renderDtSec > 0) {
          this.atmosphere.stepFixed(renderDtSec, cam.scrollX, cam.scrollY, cam.width, cam.height);
          const lx = this.rig.teleporters.isWarping ? cam.midPoint.x : interp.x;
          const ly = this.rig.teleporters.isWarping ? cam.midPoint.y : interp.y - 18;
          this.lighting.setHeroCorePosition(lx, ly);
          this.lighting.step(renderDtSec, lx, ly - 8);
        }
        this.parallax.syncWithCamera(cam.scrollX, cam.scrollY);
        this.tileRenderer.cullToViewport(cam.scrollX, cam.scrollY, cam.scrollX + cam.width, cam.scrollY + cam.height);
      }
    );
    if ((this.telemetryTimerMs += deltaMs) >= 120) { this.telemetryTimerMs = 0; this.publishTelemetry(); }
  }

  private publishTelemetry(): void {
    const telemetry: BootTelemetryPayload = {
      rendererType: this.game.renderer.type, isWebGL: this.game.renderer.type === Phaser.WEBGL, framebufferLit: true,
      maxLights: MAX_HARDWARE_LIGHTS, activeLights: this.lighting.activeHardwareLightCount, fixedSimHz: FIXED_SIM_HZ,
      totalFixedTicks: this.clock.totalFixedTicks, isPaused: this.clock.isPaused,
      trauma: Number(this.cameraRig.currentTrauma.toFixed(3)), rngSeed: this.dag.seed,
    };
    window.__QC_BOOT_STATE__ = telemetry;
    EventBus.emit('system:telemetry_updated', telemetry);

    const playerSnap = this.rig.player.snapshotTelemetry();
    window.__QC_PLAYER_STATE__ = playerSnap;
    EventBus.emit('player:telemetry_updated', playerSnap);

    const combatSnap = this.rig.combat.emitHudSnapshot();
    const aliveList = this.rig.combat.agents.filter((e) => e.isAlive);
    window.__QC_COMBAT_STATE__ = {
      ...combatSnap, biomeId: this.dag.biomeId, lastHitStopMs: this.rig.combat.lastHitStopMs,
      activeProjectiles: this.rig.combat.projectiles.activeCount,
      activeHazardZones: this.rig.combat.synergy.skillRuntime.hazardZones.activeCount,
      aliveEnemies: aliveList.length, aggroEnemies: this.rig.combat.director.aggroCount,
      activeSpecies: Array.from(new Set(aliveList.map((e) => e.speciesId))),
    };

    const activeAnim = this.heroSprite.anims.currentAnim?.key ?? `hero_${this.rig.player.state.toLowerCase()}`;
    const showcase = { ...this.shaderCtrl.snapshot(this.lighting.activeHardwareLightCount, activeAnim), activeSceneKey: 'BiomeRunScene' };
    window.__QC_SHOWCASE_STATE__ = showcase;
    EventBus.emit('system:showcase_state_changed', showcase);
    const diagKey = `${this.rig.teleporters.activeRoomId}:${this.rig.teleporters.activatedSteleIds.length}:${this.rig.runes.unlockedRunes.length}`;
    if (diagKey !== this.lastDagDiagKey) {
      this.lastDagDiagKey = diagKey;
      window.__QC_BIOME_DAG__ = buildBiomeDagDebugTelemetry(
        this.dag, this.rig.teleporters.activeRoomId, this.rig.teleporters.activatedSteleIds, this.rig.runes.unlockedRunes
      );
    }
  }

  private handleScaleResize(gameSize: Phaser.Structs.Size): void {
    this.cameraRig.resize(gameSize.width, gameSize.height);
    this.parallax.resize(gameSize.width, gameSize.height);
  }

  private cleanupScene(): void {
    this.scale.off(Phaser.Scale.Events.RESIZE, this.handleScaleResize, this);
    this.unbindSave();
    this.rig.destroy();
    this.atmosphere.destroy();
    this.tileRenderer.destroy();
    this.parallax.destroy();
  }
}
