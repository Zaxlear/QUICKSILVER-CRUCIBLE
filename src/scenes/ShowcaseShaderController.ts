import Phaser from 'phaser';
import { type ShowcaseShaderId, type ShowcaseStatePayload } from '../core/EventBus';
import {
  ASH_DISSOLVE_PIPELINE_KEY,
  DATA_ASH_NOISE_SCALE,
  DATA_ASH_PROGRESS,
} from '../render/pipelines/AshDissolvePipeline';
import {
  DATA_HIT_FLASH_AMOUNT,
  DATA_HIT_FLASH_COLOR,
  HIT_FLASH_PIPELINE_KEY,
} from '../render/pipelines/HitFlashPipeline';
import { type ActiveCameraPostFXBundle } from '../render/pipelines/PipelineRegistry';
import { HERO_ANIM_SPECS, type ShowcaseStageRefs } from './ShowcaseStageBuilder';

/**
 * Milestone 2/3 舞台 5 大着色器开关、招架力场折射同步与主角受击闪白控制器。
 */
export class ShowcaseShaderController {
  private animIndex = 0;
  private hitFlashActive = false;
  private ashDissolveActive = false;
  private shieldRefractActive = false;
  private chromaticImpactActive = false;
  private vignetteBloomActive = true;

  private playerParryRefractActive = false;
  private heroFlashElapsedMs = 0;
  private heroFlashDurationMs = 0;
  private dummyFlashRemainingMs = 0;

  public constructor(
    private readonly stage: ShowcaseStageRefs,
    private readonly postFx: ActiveCameraPostFXBundle,
    private readonly worldMainCam: Phaser.Cameras.Scene2D.Camera
  ) {
    this.applyAll();
  }

  public toggleShader(shader: ShowcaseShaderId, forced?: boolean): void {
    switch (shader) {
      case 'hitFlash':
        this.hitFlashActive = forced ?? !this.hitFlashActive;
        break;
      case 'ashDissolve':
        this.ashDissolveActive = forced ?? !this.ashDissolveActive;
        break;
      case 'shieldRefract':
        this.shieldRefractActive = forced ?? !this.shieldRefractActive;
        break;
      case 'chromaticImpact':
        this.chromaticImpactActive = forced ?? !this.chromaticImpactActive;
        break;
      case 'vignetteBloom':
        this.vignetteBloomActive = forced ?? !this.vignetteBloomActive;
        break;
    }
    this.applyAll();
  }

  public setPlayerParryShield(active: boolean): void {
    this.playerParryRefractActive = active;
  }

  public triggerHeroHitFlash(durationMs = 100): void {
    this.heroFlashDurationMs = Math.max(16, durationMs);
    this.heroFlashElapsedMs = 0;
    this.stage.heroSprite.setData(DATA_HIT_FLASH_AMOUNT, 1.0);
    this.stage.heroSprite.setData(DATA_HIT_FLASH_COLOR, [1.0, 1.0, 1.0] as const);
    this.stage.heroSprite.setPipeline(HIT_FLASH_PIPELINE_KEY);
  }

  public pulseDummyFlash(durationMs = 90): void {
    this.dummyFlashRemainingMs = Math.max(this.dummyFlashRemainingMs, durationMs);
    this.applyDummyFlashState();
  }

  public step(dtSec: number): void {
    const dtMs = dtSec * 1000;
    if (this.heroFlashDurationMs > 0) {
      this.heroFlashElapsedMs += dtMs;
      if (this.heroFlashElapsedMs >= this.heroFlashDurationMs) {
        this.heroFlashDurationMs = 0;
        this.stage.heroSprite.setPipeline('Light2D');
      } else {
        // 前 60ms 锁定 1.0 纯白剪影，60~100ms 线性衰减至 0.0
        const amount =
          this.heroFlashElapsedMs <= 60
            ? 1.0
            : Math.max(0, 1.0 - (this.heroFlashElapsedMs - 60) / Math.max(1, this.heroFlashDurationMs - 60));
        this.stage.heroSprite.setData(DATA_HIT_FLASH_AMOUNT, amount);
      }
    }

    if (this.dummyFlashRemainingMs > 0) {
      this.dummyFlashRemainingMs = Math.max(0, this.dummyFlashRemainingMs - dtMs);
      this.applyDummyFlashState();
    }
  }

  public cycleHeroAnim(direction: 1 | -1 | 0, explicitKey?: string): void {
    if (explicitKey) {
      const idx = HERO_ANIM_SPECS.findIndex((s) => s.key === explicitKey);
      if (idx >= 0) this.animIndex = idx;
    } else {
      this.animIndex =
        (this.animIndex + direction + HERO_ANIM_SPECS.length) % HERO_ANIM_SPECS.length;
    }
    this.stage.heroSprite.play(HERO_ANIM_SPECS[this.animIndex]!.key);
  }

  public syncShieldCenter(worldX: number, worldY: number): void {
    const enabled = this.shieldRefractActive || this.playerParryRefractActive;
    const radius = this.playerParryRefractActive ? 56 : 82;
    this.postFx.shieldRefract.setShieldState(enabled, worldX, worldY, radius, this.worldMainCam);
  }

  public snapshot(activeLights: number, activeHeroAnim?: string): ShowcaseStatePayload {
    return {
      activeSceneKey: 'PreloadScene',
      heroAnimKey: activeHeroAnim ?? HERO_ANIM_SPECS[this.animIndex]!.key,
      activeLights,
      shaders: {
        hitFlash: this.hitFlashActive,
        ashDissolve: this.ashDissolveActive,
        shieldRefract: this.shieldRefractActive || this.playerParryRefractActive,
        chromaticImpact: this.chromaticImpactActive,
        vignetteBloom: this.vignetteBloomActive,
      },
    };
  }

  public applyAll(): void {
    this.applyDummyFlashState();

    const ashSpr = this.stage.dissolveDummySprite;
    if (this.ashDissolveActive) {
      ashSpr.setData(DATA_ASH_PROGRESS, 0.46);
      ashSpr.setData(DATA_ASH_NOISE_SCALE, [24.0, 24.0] as const);
      ashSpr.setPipeline(ASH_DISSOLVE_PIPELINE_KEY);
    } else {
      ashSpr.setPipeline('Light2D');
    }

    this.postFx.shieldRefract.setShieldState(
      this.shieldRefractActive || this.playerParryRefractActive,
      this.stage.heroSprite.x,
      this.stage.heroSprite.y - 18,
      82,
      this.worldMainCam
    );
    this.postFx.chromaticImpact.setSustainedHold(this.chromaticImpactActive, 0.88, 0.5, 0.5);
    this.postFx.vignetteBloom.setBloomEnabled(this.vignetteBloomActive);
  }

  private applyDummyFlashState(): void {
    const flashSpr = this.stage.flashDummySprite;
    if (this.hitFlashActive || this.dummyFlashRemainingMs > 0) {
      flashSpr.setData(DATA_HIT_FLASH_AMOUNT, 0.96);
      flashSpr.setData(DATA_HIT_FLASH_COLOR, [1.0, 1.0, 1.0] as const);
      flashSpr.setPipeline(HIT_FLASH_PIPELINE_KEY);
    } else {
      flashSpr.setPipeline('Light2D');
    }
  }
}
