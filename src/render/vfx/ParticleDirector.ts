/**
 * GPU/Sprite 战斗特效与视口裁剪总调度器（src/render/vfx/ParticleDirector.ts）：
 * 统一编排地面反弹飙血/火花池、刀光残弧、电弧折线、黄金招架十字星芒、飞行箭矢渲染与副相机伤害飘字。
 */

import Phaser from 'phaser';
import type { VoltaicChainSegment } from '../../combat/CombatTypes';
import type { ProjectilePool } from '../../combat/ProjectilePool';
import { DepthLayer } from '../../core/Constants';
import { ObjectPool, type IPoolable } from '../../core/ObjectPool';
import type { CollisionWorld } from '../../entities/player/PlayerPhysics';
import type { CameraRig } from '../CameraRig';
import { BloodSparkEmitter } from './BloodSparkEmitter';
import { CrispDamageNumberPool } from './CrispDamageNumberPool';

class PooledTransientSprite implements IPoolable {
  public readonly sprite: Phaser.GameObjects.Sprite;
  public elapsedSec = 0;
  public lifetimeSec = 0.16;
  public startScaleX = 1;
  public startScaleY = 1;

  public constructor(scene: Phaser.Scene, cameraRig: CameraRig) {
    this.sprite = scene.add
      .sprite(0, 0, 'weapons_fx_atlas', 'slash_scalpel_0')
      .setDepth(DepthLayer.VFX_PARTICLES)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setVisible(false)
      .setActive(false);
    cameraRig.registerWorldLit(this.sprite);
  }

  public reset(): void {
    this.elapsedSec = 0;
    this.sprite.setVisible(false).setActive(false).setAlpha(0).setRotation(0).setScale(1, 1);
  }
}

export class ParticleDirector {
  public readonly bloodSparks: BloodSparkEmitter;
  public readonly damageNumbers: CrispDamageNumberPool;
  private readonly fxPool: ObjectPool<PooledTransientSprite>;
  private readonly projSprites: Phaser.GameObjects.Sprite[] = [];
  private readonly rhythmCueSprite: Phaser.GameObjects.Sprite;

  public constructor(
    private readonly scene: Phaser.Scene,
    private readonly cameraRig: CameraRig,
    world: CollisionWorld
  ) {
    this.bloodSparks = new BloodSparkEmitter(scene, cameraRig, world);
    this.damageNumbers = new CrispDamageNumberPool(scene, cameraRig);
    this.fxPool = new ObjectPool<PooledTransientSprite>(
      () => new PooledTransientSprite(scene, cameraRig),
      28,
      72
    );
    this.rhythmCueSprite = cameraRig.registerWorldLit(
      scene.add
        .sprite(0, 0, 'weapons_fx_atlas', 'rhythm_spark_0')
        .setDepth(DepthLayer.VFX_PARTICLES + 2)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setVisible(false)
    );
  }

  /** 渲染近战刀光、刺剑银芒、重锤地裂波与圆盾震荡扇形波 */
  public emitWeaponSmear(
    frameKey: string,
    worldX: number,
    worldY: number,
    facing: -1 | 1,
    durationSec = 0.14,
    atlasKey: 'weapons_fx_atlas' | 'synergy_fx_atlas' | 'enemy_fx_atlas' = 'weapons_fx_atlas'
  ): void {
    const fx = this.fxPool.acquire();
    fx.elapsedSec = 0;
    fx.lifetimeSec = durationSec;
    fx.startScaleX = 1.05;
    fx.startScaleY = 1.05;
    fx.sprite
      .setTexture(atlasKey, frameKey)
      .setPosition(worldX, worldY)
      .setFlipX(facing < 0)
      .setRotation(0)
      .setScale(1.05, 1.05)
      .setAlpha(0.96)
      .setVisible(true)
      .setActive(true);
  }

  /** 渲染星盘电弧法杖的多段链式高压折线闪电 */
  public emitVoltaicChainBolts(segments: readonly VoltaicChainSegment[]): void {
    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i]!;
      const dx = seg.x1 - seg.x0;
      const dy = seg.y1 - seg.y0;
      const len = Math.max(12, Math.hypot(dx, dy));
      const fx = this.fxPool.acquire();
      fx.elapsedSec = 0;
      fx.lifetimeSec = 0.16;
      fx.startScaleX = len / 44;
      fx.startScaleY = seg.bounceIndex >= 1 ? 1.25 : 1.0;
      fx.sprite
        .setTexture('weapons_fx_atlas', `arc_chain_bolt_${i & 1}`)
        .setPosition((seg.x0 + seg.x1) * 0.5, (seg.y0 + seg.y1) * 0.5)
        .setFlipX(false)
        .setRotation(Math.atan2(dy, dx))
        .setScale(fx.startScaleX, fx.startScaleY)
        .setAlpha(1.0)
        .setVisible(true)
        .setActive(true);
    }
  }

  /** 触发黄金招架成功的十字星芒与 360° 金属火花喷发（docs/04 §2.3 vfx_parry_sunburst） */
  public emitParrySunburst(worldX: number, worldY: number, facing: -1 | 1): void {
    const fx = this.fxPool.acquire();
    fx.elapsedSec = 0;
    fx.lifetimeSec = 0.28;
    fx.startScaleX = 1.35;
    fx.startScaleY = 1.35;
    fx.sprite
      .setTexture('weapons_fx_atlas', 'parry_sunburst_0')
      .setPosition(worldX + facing * 12, worldY)
      .setFlipX(false)
      .setScale(1.35, 1.35)
      .setAlpha(1.0)
      .setVisible(true)
      .setActive(true);
    this.bloodSparks.emitBrassSparks(worldX + facing * 12, worldY, facing, 26);
  }

  public syncPlayerWeaponCues(
    heroX: number,
    heroY: number,
    facing: -1 | 1,
    cleaverRhythmOpen: boolean,
    rapierCritReady: boolean,
    tickParity: 0 | 1
  ): void {
    if (cleaverRhythmOpen || rapierCritReady) {
      this.rhythmCueSprite
        .setTexture(
          'weapons_fx_atlas',
          cleaverRhythmOpen ? `rhythm_spark_${tickParity}` : 'parry_sunburst_0'
        )
        .setPosition(heroX + facing * (cleaverRhythmOpen ? -6 : 14), heroY - (cleaverRhythmOpen ? 26 : 16))
        .setScale(cleaverRhythmOpen ? 1.0 : 0.45)
        .setAlpha(0.95)
        .setVisible(true);
    } else {
      this.rhythmCueSprite.setVisible(false);
    }
  }

  public syncProjectileSprites(projectilePool: ProjectilePool): void {
    let idx = 0;
    projectilePool.forEachActive((p) => {
      let spr = this.projSprites[idx];
      if (!spr) {
        spr = this.cameraRig.registerWorldLit(
          this.scene.add
            .sprite(0, 0, 'weapons_fx_atlas', 'proj_mercury_arrow')
            .setDepth(DepthLayer.PROJECTILES)
            .setPipeline('Light2D')
        );
        this.projSprites.push(spr);
      }
      spr
        .setTexture(p.atlasKey, p.frameKey)
        .setBlendMode(p.kind === 'PRISM_BEAM' ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL)
        .setPosition(p.x, p.y)
        .setRotation(Math.atan2(p.vy, p.vx))
        .setFlipX(false)
        .setVisible(true);
      idx += 1;
    });
    for (let k = idx; k < this.projSprites.length; k++) {
      this.projSprites[k]!.setVisible(false);
    }
  }

  public stepFixed(dtSec: number): void {
    const cam = this.cameraRig.worldMainCam;
    this.bloodSparks.stepFixed(dtSec, cam.scrollX, cam.scrollX + cam.width);
    this.damageNumbers.stepFixed(dtSec);

    this.fxPool.forEachActive((fx) => {
      fx.elapsedSec += dtSec;
      if (fx.elapsedSec >= fx.lifetimeSec) {
        this.fxPool.release(fx);
        return;
      }
      const t = fx.elapsedSec / fx.lifetimeSec;
      fx.sprite
        .setScale(fx.startScaleX * (1 + t * 0.18), fx.startScaleY * (1 - t * 0.25))
        .setAlpha(1 - t * 0.85);
    });
  }

  public destroy(): void {
    this.bloodSparks.destroy();
    this.damageNumbers.destroy();
    this.fxPool.releaseAll();
    for (const s of this.projSprites) {
      this.cameraRig.unregister(s);
      s.destroy();
    }
    this.projSprites.length = 0;
    this.cameraRig.unregister(this.rhythmCueSprite);
    this.rhythmCueSprite.destroy();
  }
}
