import Phaser from 'phaser';
import type { ClockController } from '../core/ClockController';
import { EventBus, type ViewportSnapshotPayload } from '../core/EventBus';
import { PlayerEntity } from '../entities/player/PlayerEntity';
import { ActionMap } from '../input/ActionMap';
import { HapticsManager } from '../input/HapticsManager';
import type { CameraRig } from '../render/CameraRig';
import { GhostTrailRenderer } from '../render/GhostTrailRenderer';
import type { LightingDirector } from '../render/LightingDirector';
import type { ActiveCameraPostFXBundle } from '../render/pipelines/PipelineRegistry';
import { LocomotionVfxRenderer } from '../render/vfx/LocomotionVfxRenderer';
import type { ShowcaseShaderController } from './ShowcaseShaderController';
import type { ShowcaseStageRefs } from './ShowcaseStageBuilder';

/**
 * 矿渣试炼场主角输入、残影、运动粒子、UI 指令与训练靶交互总成（src/scenes/ProvingGroundRig.ts）。
 */
export class ProvingGroundRig {
  public readonly actionMap: ActionMap;
  public readonly haptics: HapticsManager;
  public readonly ghostTrail: GhostTrailRenderer;
  public readonly locomotionVfx: LocomotionVfxRenderer;
  public readonly player: PlayerEntity;

  private lastSlashHitStage = -1;
  private readonly unbindHandlers: Array<() => void> = [];

  public constructor(
    scene: Phaser.Scene,
    initViewport: ViewportSnapshotPayload,
    private readonly stage: ShowcaseStageRefs,
    private readonly cameraRig: CameraRig,
    private readonly lighting: LightingDirector,
    private readonly postFx: ActiveCameraPostFXBundle,
    private readonly shaderCtrl: ShowcaseShaderController,
    private readonly clock: ClockController,
    onCommandHandled: () => void
  ) {
    this.actionMap = new ActionMap(initViewport);
    this.haptics = new HapticsManager();
    this.haptics.mount();

    this.ghostTrail = new GhostTrailRenderer(scene, cameraRig);
    this.locomotionVfx = new LocomotionVfxRenderer(scene, cameraRig);

    this.player = new PlayerEntity({
      spawnX: stage.spawnPoint.x,
      spawnY: stage.spawnPoint.y,
      world: stage.collisionWorld,
      input: this.actionMap,
      hasMagneticClawsRune: true,
      hooks: {
        playAnim: (animKey) => {
          stage.heroSprite.play(animKey, true);
        },
        setSpriteFrame: (frameName) => {
          stage.heroSprite.anims.stop();
          stage.heroSprite.setFrame(frameName);
        },
        spawnGhostTrail: () => {
          const frame = stage.heroSprite.frame.name || this.player.currentFrameKey;
          this.ghostTrail.spawnGhost(
            this.player.physics.x,
            this.player.physics.y,
            frame,
            this.player.physics.facing < 0,
            1.15
          );
        },
        emitLocomotionVfx: (kind, dirX) => {
          this.locomotionVfx.emitCue(kind, this.player.physics.x, this.player.physics.y, dirX);
          if (kind === 'double_jump_ring') {
            lighting.spawnTransientFlash(
              this.player.physics.x,
              this.player.physics.y - 8,
              0x38bdf8,
              150,
              2.1,
              160
            );
          }
        },
        setShieldRefractActive: (active) => {
          shaderCtrl.setPlayerParryShield(active);
        },
        triggerHitFlash: (ms) => {
          shaderCtrl.triggerHeroHitFlash(ms);
          cameraRig.addTrauma(0.45);
        },
        notifyAttackStarted: () => {
          this.lastSlashHitStage = -1;
        },
      },
    });

    this.unbindHandlers.push(
      EventBus.on('ui:command:set_orientation_pause', ({ paused }) => {
        clock.setPaused(paused);
        onCommandHandled();
      }),
      EventBus.on('ui:command:trigger_trauma_pulse', ({ amount }) => {
        const px = this.player.physics.x;
        const py = this.player.physics.y - 18;
        cameraRig.addTrauma(amount);
        clock.triggerHitStop(50);
        this.postFx.chromaticImpact.triggerPulse(0.75, px, py, cameraRig.worldMainCam);
        lighting.spawnTransientFlash(px, py, 0xfbbf24, 220, 2.4, 140);
        onCommandHandled();
      }),
      EventBus.on('ui:command:toggle_shader', ({ shader, active }) => {
        shaderCtrl.toggleShader(shader, active);
        onCommandHandled();
      }),
      EventBus.on('ui:command:cycle_hero_anim', ({ direction, animKey }) => {
        shaderCtrl.cycleHeroAnim(direction, animKey);
        onCommandHandled();
      }),
      EventBus.on('ui:command:debug_player_hurt', ({ damage }) => {
        this.player.receiveIncomingHit(damage, 1, true);
        onCommandHandled();
      }),
      EventBus.on('ui:command:debug_player_respawn', () => {
        this.player.respawnAt(stage.spawnPoint.x, stage.spawnPoint.y);
        onCommandHandled();
      })
    );
  }

  public stepFixed(dtSec: number): void {
    this.actionMap.sampleFixedTick();
    this.player.fixedUpdate(dtSec);
    this.evaluateDummySlashContact();
    this.ghostTrail.step(dtSec);
    this.locomotionVfx.step(dtSec);
  }

  public destroy(): void {
    for (const unbind of this.unbindHandlers) unbind();
    this.unbindHandlers.length = 0;
    this.haptics.destroy();
    this.actionMap.destroy();
    this.ghostTrail.clearAll();
  }

  private evaluateDummySlashContact(): void {
    if (!this.player.ctx.isAttackHitboxActive) return;
    if (this.lastSlashHitStage === this.player.ctx.comboIndex) return;

    const hitX = this.player.physics.x + this.player.physics.facing * 26;
    const py = this.player.physics.y;
    const d1 = Math.hypot(hitX - this.stage.flashDummySprite.x, py - this.stage.flashDummySprite.y);
    const d2 = Math.hypot(
      hitX - this.stage.dissolveDummySprite.x,
      py - this.stage.dissolveDummySprite.y
    );

    if (d1 <= 36 || d2 <= 36) {
      this.lastSlashHitStage = this.player.ctx.comboIndex;
      this.shaderCtrl.pulseDummyFlash(95);
      this.clock.triggerHitStop(28);
      this.cameraRig.addTrauma(0.18);
      this.lighting.spawnTransientFlash(hitX, py - 18, 0xfbbf24, 160, 2.2, 110);
    }
  }
}
