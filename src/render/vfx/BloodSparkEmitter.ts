/**
 * 带房间地面瓦片真实碰撞反弹与渐隐血迹的水银飙血 / 黄铜火花发射器
 * （src/render/vfx/BloodSparkEmitter.ts）。
 */

import Phaser from 'phaser';
import { DepthLayer } from '../../core/Constants';
import { ObjectPool, type IPoolable } from '../../core/ObjectPool';
import { VisualFxRng } from '../../core/VisualFxRng';
import type { CollisionWorld } from '../../entities/player/PlayerPhysics';
import type { CameraRig } from '../CameraRig';

interface FloorSurfaceSpan {
  readonly x0: number;
  readonly x1: number;
  readonly y: number;
}

const FLOOR_COLUMN_PX = 128;

class PooledImpactParticle implements IPoolable {
  public readonly sprite: Phaser.GameObjects.Sprite;
  public kind: 'blood' | 'spark' = 'blood';
  public x = 0;
  public y = 0;
  public vx = 0;
  public vy = 0;
  public gravityY = 680;
  public bounce = 0.35;
  public bounceCount = 0;
  public elapsedSec = 0;
  public lifetimeSec = 0.6;

  public constructor(scene: Phaser.Scene, cameraRig: CameraRig) {
    this.sprite = scene.add
      .sprite(0, 0, 'weapons_fx_atlas', 'blood_drop_0')
      .setDepth(DepthLayer.VFX_PARTICLES)
      .setVisible(false)
      .setActive(false);
    cameraRig.registerWorldLit(this.sprite);
  }

  public reset(): void {
    this.bounceCount = 0;
    this.elapsedSec = 0;
    this.sprite.setVisible(false).setActive(false).setAlpha(0).setRotation(0);
  }
}

class PooledFloorStain implements IPoolable {
  public readonly sprite: Phaser.GameObjects.Sprite;
  public elapsedSec = 0;
  public lifetimeSec = 1.5;

  public constructor(scene: Phaser.Scene, cameraRig: CameraRig) {
    this.sprite = scene.add
      .sprite(0, 0, 'weapons_fx_atlas', 'blood_splat_0')
      .setDepth(DepthLayer.TILE_MAIN + 1)
      .setPipeline('Light2D')
      .setVisible(false)
      .setActive(false);
    cameraRig.registerWorldLit(this.sprite);
  }

  public reset(): void {
    this.elapsedSec = 0;
    this.sprite.setVisible(false).setActive(false).setAlpha(0);
  }
}

export class BloodSparkEmitter {
  private readonly particlePool: ObjectPool<PooledImpactParticle>;
  private readonly stainPool: ObjectPool<PooledFloorStain>;
  private readonly floorColumns = new Map<number, FloorSurfaceSpan[]>();

  public constructor(scene: Phaser.Scene, cameraRig: CameraRig, world: CollisionWorld) {
    this.particlePool = new ObjectPool(() => new PooledImpactParticle(scene, cameraRig), 96, 256);
    this.stainPool = new ObjectPool(() => new PooledFloorStain(scene, cameraRig), 32, 64);
    this.indexFloorSurfaces(world);
  }

  public get activeParticleCount(): number {
    return this.particlePool.activeCount;
  }

  /** 触发血肉畸变怪受击水银飙血（支持暴击 28 颗大爆发） */
  public emitMercuryBlood(worldX: number, worldY: number, slashDirX: -1 | 1, isCrit: boolean): void {
    const count = isCrit ? 28 : VisualFxRng.intRange(10, 18);
    const baseAngle = slashDirX >= 0 ? -0.32 : Math.PI + 0.32;

    for (let i = 0; i < count; i++) {
      const p = this.particlePool.acquire();
      const spread = (VisualFxRng.signedJitter(35) * Math.PI) / 180;
      const speed = VisualFxRng.range(110, 290);
      const ang = baseAngle + spread;
      p.kind = 'blood';
      p.x = worldX + VisualFxRng.signedJitter(4);
      p.y = worldY + VisualFxRng.signedJitter(5);
      p.vx = Math.cos(ang) * speed;
      p.vy = Math.sin(ang) * speed - VisualFxRng.range(25, 85);
      p.gravityY = 680;
      p.bounce = 0.35;
      p.bounceCount = 0;
      p.elapsedSec = 0;
      p.lifetimeSec = VisualFxRng.range(0.45, 0.8);
      p.sprite
        .setPipeline('Light2D')
        .setBlendMode(Phaser.BlendModes.NORMAL)
        .setTexture('weapons_fx_atlas', `blood_drop_${i & 1}`)
        .setPosition(p.x, p.y)
        .setScale(isCrit ? VisualFxRng.range(0.95, 1.3) : VisualFxRng.range(0.8, 1.1))
        .setAlpha(0.96)
        .setVisible(true)
        .setActive(true);
    }
  }

  /** 触发机械怪/护盾受击或盾反成功的黄铜高弹跳火花 */
  public emitBrassSparks(worldX: number, worldY: number, normalDirX: -1 | 1, countOverride?: number): void {
    const count = countOverride ?? VisualFxRng.intRange(14, 26);
    const baseAngle = normalDirX >= 0 ? -0.38 : Math.PI + 0.38;

    for (let i = 0; i < count; i++) {
      const p = this.particlePool.acquire();
      const spread = (VisualFxRng.signedJitter(45) * Math.PI) / 180;
      const speed = VisualFxRng.range(160, 380);
      const ang = baseAngle + spread;
      p.kind = 'spark';
      p.x = worldX + VisualFxRng.signedJitter(3);
      p.y = worldY + VisualFxRng.signedJitter(4);
      p.vx = Math.cos(ang) * speed;
      p.vy = Math.sin(ang) * speed - VisualFxRng.range(20, 70);
      p.gravityY = 520;
      p.bounce = 0.58;
      p.bounceCount = 0;
      p.elapsedSec = 0;
      p.lifetimeSec = VisualFxRng.range(0.26, 0.52);
      p.sprite.resetPipeline();
      p.sprite
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTexture('weapons_fx_atlas', `brass_spark_${i & 1}`)
        .setPosition(p.x, p.y)
        .setRotation(Math.atan2(p.vy, p.vx))
        .setScale(VisualFxRng.range(0.9, 1.35), 1.0)
        .setAlpha(1.0)
        .setVisible(true)
        .setActive(true);
    }
  }

  public stepFixed(
    dtSec: number,
    viewMinX: number,
    viewMaxX: number,
    viewMinY = -Infinity,
    viewMaxY = Infinity
  ): void {
    this.particlePool.forEachActive((p) => {
      p.elapsedSec += dtSec;
      if (p.elapsedSec >= p.lifetimeSec) {
        this.particlePool.release(p);
        return;
      }

      const prevY = p.y;
      p.vy += p.gravityY * dtSec;
      p.x += p.vx * dtSec;
      p.y += p.vy * dtSec;

      if (p.vy > 0) {
        const floorY = this.probeFloorCrossing(p.x, prevY, p.y);
        if (floorY !== null) {
          p.y = floorY - 1;
          p.bounceCount += 1;
          if (p.kind === 'blood' && p.bounceCount >= 2) {
            this.spawnFloorBloodStain(p.x, floorY - 1);
            this.particlePool.release(p);
            return;
          }
          p.vy = -Math.abs(p.vy) * p.bounce;
          p.vx *= p.kind === 'spark' ? 0.78 : 0.62;
        }
      }

      const t = p.elapsedSec / p.lifetimeSec;
      const inView =
        p.x >= viewMinX - 32 && p.x <= viewMaxX + 32 && p.y >= viewMinY - 32 && p.y <= viewMaxY + 32;
      if (p.sprite.visible !== inView) p.sprite.setVisible(inView);
      if (inView) {
        p.sprite.setPosition(p.x, p.y).setAlpha(1 - t * 0.78);
        if (p.kind === 'spark') p.sprite.setRotation(Math.atan2(p.vy, p.vx));
      }
    });

    this.stainPool.forEachActive((st) => {
      st.elapsedSec += dtSec;
      if (st.elapsedSec >= st.lifetimeSec) {
        this.stainPool.release(st);
        return;
      }
      st.sprite.setAlpha(0.9 * (1 - st.elapsedSec / st.lifetimeSec));
    });
  }

  public destroy(): void {
    this.particlePool.releaseAll();
    this.stainPool.releaseAll();
  }

  private spawnFloorBloodStain(x: number, y: number): void {
    const st = this.stainPool.acquire();
    st.elapsedSec = 0;
    st.lifetimeSec = 1.5;
    st.sprite
      .setTexture('weapons_fx_atlas', `blood_splat_${VisualFxRng.intRange(0, 1)}`)
      .setPosition(x, y)
      .setAlpha(0.9)
      .setVisible(true)
      .setActive(true);
  }

  private addFloorSpan(x0: number, x1: number, y: number): void {
    const span: FloorSurfaceSpan = { x0, x1, y };
    for (let c = Math.floor(x0 / FLOOR_COLUMN_PX); c <= Math.floor(x1 / FLOOR_COLUMN_PX); c++) {
      const col = this.floorColumns.get(c);
      if (col) col.push(span);
      else this.floorColumns.set(c, [span]);
    }
  }

  private indexFloorSurfaces(world: CollisionWorld): void {
    for (const r of world.solidRects) this.addFloorSpan(r.x, r.x + r.w, r.y);
    for (const p of world.oneWayPlatforms) this.addFloorSpan(p.x, p.x + p.w, p.y);
  }

  private probeFloorCrossing(x: number, prevY: number, nextY: number): number | null {
    const bucket = this.floorColumns.get(Math.floor(x / FLOOR_COLUMN_PX));
    if (!bucket) return null;
    for (let i = 0; i < bucket.length; i++) {
      const f = bucket[i]!;
      if (x >= f.x0 && x <= f.x1 && prevY <= f.y + 2 && nextY >= f.y) return f.y;
    }
    return null;
  }
}
