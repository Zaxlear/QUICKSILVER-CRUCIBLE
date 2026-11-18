import Phaser from 'phaser';
import { DepthLayer } from '../../core/Constants';
import { ObjectPool, type IPoolable } from '../../core/ObjectPool';
import { VisualFxRng } from '../../core/VisualFxRng';
import type { LocomotionVfxKind } from '../../entities/player/states/IPlayerState';
import type { CameraRig } from '../CameraRig';

class PooledVfxParticle implements IPoolable {
  public readonly sprite: Phaser.GameObjects.Sprite;
  public x = 0;
  public y = 0;
  public vx = 0;
  public vy = 0;
  public gravityY = 0;
  public startScale = 1;
  public endScale = 0.25;
  public startAlpha = 1;
  public elapsedSec = 0;
  public lifetimeSec = 0.28;
  public framePrefix = 'dust_puff_';
  public frameCount = 4;

  public constructor(scene: Phaser.Scene, cameraRig: CameraRig) {
    this.sprite = scene.add
      .sprite(0, 0, 'locomotion_fx_atlas', 'dust_puff_0')
      .setDepth(DepthLayer.VFX_PARTICLES)
      .setVisible(false)
      .setActive(false);
    cameraRig.registerWorldLit(this.sprite);
  }

  public reset(): void {
    this.elapsedSec = 0;
    this.sprite.setVisible(false).setActive(false).setAlpha(0);
  }
}

/**
 * 零 GC 角色运动反馈像素粒子池（src/render/vfx/LocomotionVfxRenderer.ts）。
 * 100% 使用 asset-factory 产出的 locomotion_fx_atlas 法线像素序列帧与 VisualFxRng 非存档流。
 */
export class LocomotionVfxRenderer {
  private readonly pool: ObjectPool<PooledVfxParticle>;

  public constructor(scene: Phaser.Scene, cameraRig: CameraRig) {
    this.pool = new ObjectPool<PooledVfxParticle>(
      () => new PooledVfxParticle(scene, cameraRig),
      48,
      128
    );
  }

  public get activeParticleCount(): number {
    return this.pool.activeCount;
  }

  public emitCue(kind: LocomotionVfxKind, worldX: number, worldY: number, dirX: -1 | 1): void {
    if (kind === 'double_jump_ring') {
      this.emitDoubleJumpRing(worldX, worldY - 4);
      return;
    }
    if (kind === 'wall_claw_spark') {
      this.emitWallClawSparks(worldX + dirX * 7, worldY - 22, dirX);
      return;
    }
    if (kind === 'slam_shockwave') {
      this.emitDustBurst(worldX, worldY - 2, -1, 6);
      this.emitDustBurst(worldX, worldY - 2, 1, 6);
      this.emitWallClawSparks(worldX, worldY - 6, -1);
      this.emitWallClawSparks(worldX, worldY - 6, 1);
      return;
    }
    if (kind === 'land_dust') {
      this.emitDustBurst(worldX, worldY - 2, -1, 3);
      this.emitDustBurst(worldX, worldY - 2, 1, 3);
      return;
    }
    const count = kind === 'turn_brake_dust' ? 5 : 3;
    const kickDir: -1 | 1 = kind === 'turn_brake_dust' ? dirX : dirX === 1 ? -1 : 1;
    this.emitDustBurst(worldX - dirX * 4, worldY - 2, kickDir, count);
  }

  public step(dtSec: number): void {
    this.pool.forEachActive((p) => {
      p.elapsedSec += dtSec;
      if (p.elapsedSec >= p.lifetimeSec) {
        this.pool.release(p);
        return;
      }
      const t = p.elapsedSec / p.lifetimeSec;
      p.vy += p.gravityY * dtSec;
      p.x += p.vx * dtSec;
      p.y += p.vy * dtSec;

      const fIdx = Math.min(p.frameCount - 1, Math.floor(t * p.frameCount));
      const scale = p.startScale + (p.endScale - p.startScale) * t;
      p.sprite
        .setTexture('locomotion_fx_atlas', `${p.framePrefix}${fIdx}`)
        .setPosition(p.x, p.y)
        .setScale(scale)
        .setAlpha(p.startAlpha * (1 - t * 0.85));
    });
  }

  private emitDustBurst(x: number, y: number, sprayDir: -1 | 1, count: number): void {
    for (let i = 0; i < count; i++) {
      const p = this.pool.acquire();
      p.x = x + VisualFxRng.signedJitter(4);
      p.y = y + VisualFxRng.range(-3, 1);
      p.vx = sprayDir * VisualFxRng.range(40, 88);
      p.vy = VisualFxRng.range(-26, -6);
      p.gravityY = -25;
      p.startScale = VisualFxRng.range(0.9, 1.25);
      p.endScale = 0.25;
      p.startAlpha = 0.92;
      p.elapsedSec = 0;
      p.lifetimeSec = 0.28;
      p.framePrefix = 'dust_puff_';
      p.frameCount = 4;
      p.sprite
        .setPipeline('Light2D')
        .setBlendMode(Phaser.BlendModes.NORMAL)
        .setTexture('locomotion_fx_atlas', 'dust_puff_0')
        .setPosition(p.x, p.y)
        .setVisible(true)
        .setActive(true);
    }
  }

  private emitDoubleJumpRing(x: number, y: number): void {
    // docs/04 第 2.3 节 vfx_double_jump_ring：横向扁环爆开 16 颗水银气旋颗粒，ADD 混合，220ms
    for (let i = 0; i < 16; i++) {
      const p = this.pool.acquire();
      const angle = (i / 16) * Math.PI * 2;
      const hSpeed = VisualFxRng.range(90, 150);
      p.x = x + Math.cos(angle) * 6;
      p.y = y + Math.sin(angle) * 2;
      p.vx = Math.cos(angle) * hSpeed;
      p.vy = 25 + Math.sin(angle) * 14;
      p.gravityY = -40;
      p.startScale = VisualFxRng.range(0.75, 1.05);
      p.endScale = 0.35;
      p.startAlpha = 0.95;
      p.elapsedSec = 0;
      p.lifetimeSec = 0.22;
      p.framePrefix = 'mercury_vapor_';
      p.frameCount = 3;
      p.sprite.resetPipeline();
      p.sprite
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTexture('locomotion_fx_atlas', 'mercury_vapor_0')
        .setPosition(p.x, p.y)
        .setVisible(true)
        .setActive(true);
    }
  }

  private emitWallClawSparks(x: number, y: number, wallSide: -1 | 1): void {
    const awayDir = -wallSide;
    for (let i = 0; i < 4; i++) {
      const p = this.pool.acquire();
      p.x = x;
      p.y = y + VisualFxRng.signedJitter(3);
      p.vx = awayDir * VisualFxRng.range(38, 95);
      p.vy = VisualFxRng.range(-85, -20);
      p.gravityY = 480;
      p.startScale = 1.0;
      p.endScale = 0.3;
      p.startAlpha = 1.0;
      p.elapsedSec = 0;
      p.lifetimeSec = 0.24;
      p.framePrefix = 'claw_spark_';
      p.frameCount = 2;
      p.sprite.resetPipeline();
      p.sprite
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTexture('locomotion_fx_atlas', 'claw_spark_0')
        .setPosition(p.x, p.y)
        .setVisible(true)
        .setActive(true);
    }
  }
}
