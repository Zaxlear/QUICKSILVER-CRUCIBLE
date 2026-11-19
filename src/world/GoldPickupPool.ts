/**
 * 怪物击杀金币抛物线迸射、瓦片弹性衰减（e = 0.42）与 96px 自动磁吸拾取对象池
 * （src/world/GoldPickupPool.ts）。
 *
 * 严格遵循零 GC 热路径铁律：预分配 ObjectPool<PooledGoldCoin>(64)，挂载 Light2D 法线光照（<= 190 行）。
 */

import type Phaser from 'phaser';
import type { SolidWallRect } from '../combat/CombatTypes';
import { DepthLayer } from '../core/Constants';
import { EventBus } from '../core/EventBus';
import { ObjectPool, type IPoolable } from '../core/ObjectPool';
import { VisualFxRng } from '../core/VisualFxRng';
import { ECONOMY_CONSTANTS } from '../data/economy.data';
import type { IWorldDisplayRegistrar } from './ParallaxComposer';

export interface OneWayPlatformRect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
}

export class PooledGoldCoin implements IPoolable {
  public active = false;
  public amount = 1;
  public isNugget = false;
  public x = 0;
  public y = 0;
  public vx = 0;
  public vy = 0;
  public grounded = false;
  public ageSec = 0;
  public sprite: Phaser.GameObjects.Sprite | null = null;

  public reset(): void {
    this.active = false;
    this.amount = 0;
    this.isNugget = false;
    this.vx = 0;
    this.vy = 0;
    this.grounded = false;
    this.ageSec = 0;
    if (this.sprite) this.sprite.setVisible(false);
  }
}

export class GoldPickupPool {
  private readonly pool: ObjectPool<PooledGoldCoin>;

  public constructor(
    private readonly scene: Phaser.Scene | null,
    private readonly registrar: IWorldDisplayRegistrar | null,
    initialCapacity = 64
  ) {
    this.pool = new ObjectPool<PooledGoldCoin>(() => {
      const item = new PooledGoldCoin();
      if (this.scene && this.registrar) {
        item.sprite = this.registrar.registerWorldLit(
          this.scene.add
            .sprite(-999, -999, 'world_props_atlas', 'gold_mercury_coin_0')
            .setOrigin(0.5, 1.0)
            .setDepth(DepthLayer.LOOT)
            .setPipeline('Light2D')
            .setVisible(false)
        );
      }
      return item;
    }, initialCapacity);
  }

  public get activeCount(): number {
    return this.pool.activeCount;
  }

  /** 按预先由 GOLD_AND_BLUEPRINT 确定性子流算好的面额分片迸射物理金块 */
  public spawnBurst(
    chunks: readonly number[],
    isNugget: boolean,
    originX: number,
    originY: number
  ): void {
    for (let i = 0; i < chunks.length; i++) {
      const val = chunks[i] ?? 0;
      if (val <= 0) continue;
      const coin = this.pool.acquire();
      coin.active = true;
      coin.amount = val;
      coin.isNugget = isNugget;
      coin.x = originX + VisualFxRng.range(-6, 6);
      coin.y = originY - 10;
      const spread = chunks.length > 1 ? (i / Math.max(1, chunks.length - 1) - 0.5) * 150 : 0;
      coin.vx = spread + VisualFxRng.range(-42, 42);
      coin.vy = VisualFxRng.range(-235, -145);
      coin.grounded = false;
      coin.ageSec = VisualFxRng.range(0, 0.25);
      if (coin.sprite) {
        coin.sprite
          .setFrame(isNugget ? 'gold_amalgam_nugget_0' : 'gold_mercury_coin_0')
          .setPosition(coin.x, coin.y)
          .setVisible(true);
      }
    }
    this.registrar?.spawnLightFlash(originX, originY - 12, 0xfbbf24, isNugget ? 155 : 105, 1.9, 150);
  }

  public stepFixed(
    dtSec: number,
    playerX: number,
    playerY: number,
    solidRects: readonly SolidWallRect[],
    oneWayPlatforms: readonly OneWayPlatformRect[],
    onCollected: (amount: number, worldX: number, worldY: number) => void
  ): void {
    const coreY = playerY - 18;
    this.pool.forEachActive((coin) => {
      coin.ageSec += dtSec;
      const dx = playerX - coin.x;
      const dy = coreY - coin.y;
      const dist = Math.hypot(dx, dy);

      if (dist <= ECONOMY_CONSTANTS.GOLD_COLLECT_RADIUS_PX && coin.ageSec >= 0.08) {
        const amt = coin.amount;
        const cx = coin.x;
        const cy = coin.y;
        this.pool.release(coin);
        EventBus.emit('audio:sfx_requested', { sfxId: 'sfx_ichor_pickup', worldX: cx });
        onCollected(amt, cx, cy);
        return;
      }

      if (dist <= ECONOMY_CONSTANTS.GOLD_MAGNET_RADIUS_PX && coin.ageSec >= 0.12 && dist > 1e-3) {
        const pullSpeed = 390 + (1 - dist / ECONOMY_CONSTANTS.GOLD_MAGNET_RADIUS_PX) * 180;
        coin.vx = (dx / dist) * pullSpeed;
        coin.vy = (dy / dist) * pullSpeed;
        coin.x += coin.vx * dtSec;
        coin.y += coin.vy * dtSec;
        coin.grounded = false;
      } else if (!coin.grounded) {
        const prevY = coin.y;
        coin.vy = Math.min(520, coin.vy + ECONOMY_CONSTANTS.GOLD_GRAVITY_PX_S2 * dtSec);
        coin.x += coin.vx * dtSec;
        const nextY = prevY + coin.vy * dtSec;
        const floorY = coin.vy >= 0 ? this.findSupportingFloorY(coin.x, prevY, nextY, solidRects, oneWayPlatforms) : null;
        if (floorY !== null) {
          coin.y = floorY;
          if (Math.abs(coin.vy) > 48) {
            coin.vy = -coin.vy * ECONOMY_CONSTANTS.GOLD_BOUNCE_RESTITUTION;
            coin.vx *= ECONOMY_CONSTANTS.GOLD_GROUND_FRICTION;
          } else {
            coin.vy = 0;
            coin.vx = 0;
            coin.grounded = true;
          }
        } else {
          coin.y = nextY;
        }
      }

      if (coin.sprite) {
        const frame = coin.isNugget
          ? `gold_amalgam_nugget_${Math.floor(coin.ageSec * 6) & 1}`
          : `gold_mercury_coin_${Math.floor(coin.ageSec * 10) % 3}`;
        coin.sprite.setFrame(frame).setPosition(coin.x, coin.y);
      }
    });
  }

  public destroy(): void {
    this.pool.releaseAll();
  }

  private findSupportingFloorY(
    x: number,
    prevY: number,
    nextY: number,
    solidRects: readonly SolidWallRect[],
    oneWayPlatforms: readonly OneWayPlatformRect[]
  ): number | null {
    let bestY = Infinity;
    for (let i = 0; i < solidRects.length; i++) {
      const r = solidRects[i]!;
      if (x >= r.x && x <= r.x + r.w && prevY <= r.y + 4 && nextY >= r.y && r.y < bestY) bestY = r.y;
    }
    for (let i = 0; i < oneWayPlatforms.length; i++) {
      const p = oneWayPlatforms[i]!;
      if (x >= p.x && x <= p.x + p.w && prevY <= p.y + 4 && nextY >= p.y && p.y < bestY) bestY = p.y;
    }
    return Number.isFinite(bestY) ? bestY : null;
  }
}
