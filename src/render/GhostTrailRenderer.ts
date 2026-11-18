import Phaser from 'phaser';
import { DepthLayer } from '../core/Constants';
import { ObjectPool, type IPoolable } from '../core/ObjectPool';
import type { CameraRig } from './CameraRig';

const GHOST_INITIAL_ALPHA = 0.65;
const GHOST_LIFETIME_SEC = 0.18; // 180ms 线性渐隐归零
const GHOST_CYAN_TINT = 0x38bdf8;

class PooledGhostImage implements IPoolable {
  public readonly image: Phaser.GameObjects.Image;
  public active = false;
  public elapsedSec = 0;

  public constructor(scene: Phaser.Scene, cameraRig: CameraRig) {
    this.image = scene.add
      .image(0, 0, 'hero_atlas', 'hero_dodge_roll_1')
      .setOrigin(0.5, 1.0)
      .setDepth(DepthLayer.PLAYER_GHOST)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setTintFill(GHOST_CYAN_TINT)
      .setVisible(false)
      .setActive(false);
    cameraRig.registerWorldLit(this.image);
  }

  public activate(
    x: number,
    y: number,
    frameKey: string,
    flipX: boolean,
    scale: number
  ): void {
    this.active = true;
    this.elapsedSec = 0;
    this.image
      .setTexture('hero_atlas', frameKey)
      .setPosition(x, y)
      .setFlipX(flipX)
      .setScale(scale)
      .setTintFill(GHOST_CYAN_TINT)
      .setAlpha(GHOST_INITIAL_ALPHA)
      .setVisible(true)
      .setActive(true);
  }

  public reset(): void {
    this.active = false;
    this.elapsedSec = 0;
    this.image.setVisible(false).setActive(false).setAlpha(0);
  }
}

/**
 * 翻滚与突进动作零 GC 青蓝水银残影池（src/render/GhostTrailRenderer.ts）。
 * 严格遵循 docs/04 第 2.2.6 节：预分配容量 24，0x38BDF8 纯色填充 + ADD 加法混合，180ms 衰减归池。
 */
export class GhostTrailRenderer {
  private readonly pool: ObjectPool<PooledGhostImage>;

  public constructor(scene: Phaser.Scene, cameraRig: CameraRig) {
    this.pool = new ObjectPool<PooledGhostImage>(
      () => new PooledGhostImage(scene, cameraRig),
      24,
      48
    );
  }

  public get activeGhostCount(): number {
    return this.pool.activeCount;
  }

  public spawnGhost(
    x: number,
    y: number,
    frameKey: string,
    flipX: boolean,
    scale = 1.0
  ): void {
    const slot = this.pool.acquire();
    slot.activate(x, y, frameKey, flipX, scale);
  }

  public step(dtSec: number): void {
    this.pool.forEachActive((slot) => {
      slot.elapsedSec += dtSec;
      if (slot.elapsedSec >= GHOST_LIFETIME_SEC) {
        this.pool.release(slot);
      } else {
        const ratio = 1 - slot.elapsedSec / GHOST_LIFETIME_SEC;
        slot.image.setAlpha(GHOST_INITIAL_ALPHA * ratio);
      }
    });
  }

  public clearAll(): void {
    this.pool.releaseAll();
  }
}
