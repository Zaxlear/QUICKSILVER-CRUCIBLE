/**
 * 敌方双相机隔离预警渲染器（src/entities/enemies/TelegraphRenderer.ts）：
 * 1. 副摄像机 TelegraphOverlayCam：委托 EnemyCrispHud 脏守卫驱动黄色 `[!]`、红色 `[✚!]` 与怪物头顶签；
 * 2. 主摄像机 WorldMainCam（Light2D + Bloom）：零 GC 预热池渲染司铎光束、无敌光环、织网者瞄准线与地面尖刺。
 */

import type Phaser from 'phaser';
import { DepthLayer } from '../../core/Constants';
import type { IWorldDisplayRegistrar } from '../../world/ParallaxComposer';
import { createEnemyCrispHud, type EnemyCrispHudHandle } from './EnemyCrispHud';

export type { EnemyCrispHudHandle };

const BLEND_MODE_ADD = 1;

export class TelegraphRenderer {
  private readonly beamPool: Phaser.GameObjects.Sprite[] = [];
  private readonly fxPool: Phaser.GameObjects.Sprite[] = [];
  private beamCursor = 0;
  private fxCursor = 0;
  private animClockMs = 0;

  public constructor(
    private readonly scene: Phaser.Scene | null,
    private readonly registrar: IWorldDisplayRegistrar | null
  ) {
    if (this.scene && this.registrar) {
      for (let i = 0; i < 4; i++) this.preallocateBeam();
      for (let i = 0; i < 6; i++) this.preallocateFx();
    }
  }

  public createEnemyHud(initX: number, initY: number): EnemyCrispHudHandle | null {
    if (!this.scene || !this.registrar) return null;
    return createEnemyCrispHud(this.scene, this.registrar, initX, initY);
  }

  public beginFrame(dtMs: number): void {
    this.animClockMs += dtMs;
    this.beamCursor = 0;
    this.fxCursor = 0;
  }

  public drawBeam(
    kind: 'PRELATE_TETHER' | 'WEAVER_RAY',
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    hot: boolean
  ): void {
    if (!this.scene || !this.registrar) return;
    const bit = (Math.floor(this.animClockMs / 90) & 1) as 0 | 1;
    const dx = x1 - x0;
    const dy = y1 - y0;
    const len = Math.max(8, Math.hypot(dx, dy));
    const spr = this.acquireBeamSprite();

    const frame = kind === 'PRELATE_TETHER' ? `prelate_gold_beam_${bit}` : `weaver_aim_ray_${bit}`;
    spr
      .setTexture('enemy_fx_atlas', frame)
      .setPosition((x0 + x1) * 0.5, (y0 + y1) * 0.5)
      .setRotation(Math.atan2(dy, dx))
      .setScale(len / 48, kind === 'PRELATE_TETHER' ? 1.15 : hot ? 1.85 : 0.85)
      .setAlpha(kind === 'PRELATE_TETHER' ? 0.92 : hot ? 1.0 : 0.55)
      .setVisible(true);

    if (kind === 'PRELATE_TETHER') {
      this.acquireFxSprite()
        .setTexture('enemy_fx_atlas', `prelate_ward_halo_${bit}`)
        .setPosition(x1, y1 + 4)
        .setRotation(0)
        .setScale(1.0, 1.0)
        .setAlpha(0.88)
        .setVisible(true);
    }
  }

  public drawGroundEffect(
    kind: 'SPIKE_WARN' | 'SPIKE_ERUPT' | 'GRAVITY_SIGIL' | 'EXECUTOR_WAVE',
    x: number,
    y: number
  ): void {
    if (!this.scene || !this.registrar) return;
    const bit = (Math.floor(this.animClockMs / 85) & 1) as 0 | 1;
    const spr = this.acquireFxSprite();

    if (kind === 'SPIKE_WARN' || kind === 'SPIKE_ERUPT') {
      spr
        .setTexture('enemy_fx_atlas', kind === 'SPIKE_WARN' ? 'mercury_ground_spike_0' : 'mercury_ground_spike_1')
        .setPosition(x, y - 18)
        .setScale(1.05, 1.05)
        .setAlpha(0.95);
    } else if (kind === 'GRAVITY_SIGIL') {
      spr
        .setTexture('enemy_fx_atlas', `gravity_sigil_ring_${bit}`)
        .setPosition(x, y - 6)
        .setScale(1.15, 1.05)
        .setAlpha(0.92);
    } else {
      spr
        .setTexture('enemy_fx_atlas', 'executor_ground_wave_0')
        .setPosition(x, y - 12)
        .setScale(1.15, 1.0)
        .setAlpha(0.95);
    }
    spr.setRotation(0).setVisible(true);
  }

  public endFrame(): void {
    for (let i = this.beamCursor; i < this.beamPool.length; i++) {
      if (this.beamPool[i]!.visible) this.beamPool[i]!.setVisible(false);
    }
    for (let i = this.fxCursor; i < this.fxPool.length; i++) {
      if (this.fxPool[i]!.visible) this.fxPool[i]!.setVisible(false);
    }
  }

  public destroy(): void {
    if (this.registrar) {
      for (const s of [...this.beamPool, ...this.fxPool]) {
        this.registrar.unregister(s);
        s.destroy();
      }
    }
    this.beamPool.length = 0;
    this.fxPool.length = 0;
  }

  private preallocateBeam(): Phaser.GameObjects.Sprite {
    const spr = this.registrar!.registerWorldLit(
      this.scene!.add
        .sprite(0, 0, 'enemy_fx_atlas', 'prelate_gold_beam_0')
        .setDepth(DepthLayer.VFX_PARTICLES + 1)
        .setBlendMode(BLEND_MODE_ADD)
        .setVisible(false)
    );
    this.beamPool.push(spr);
    return spr;
  }

  private preallocateFx(): Phaser.GameObjects.Sprite {
    const spr = this.registrar!.registerWorldLit(
      this.scene!.add
        .sprite(0, 0, 'enemy_fx_atlas', 'prelate_ward_halo_0')
        .setDepth(DepthLayer.VFX_PARTICLES)
        .setBlendMode(BLEND_MODE_ADD)
        .setVisible(false)
    );
    this.fxPool.push(spr);
    return spr;
  }

  private acquireBeamSprite(): Phaser.GameObjects.Sprite {
    return this.beamPool[this.beamCursor++] ?? this.preallocateBeam();
  }

  private acquireFxSprite(): Phaser.GameObjects.Sprite {
    return this.fxPool[this.fxCursor++] ?? this.preallocateFx();
  }
}
