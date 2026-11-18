/**
 * 敌方双相机隔离预警渲染器（src/entities/enemies/TelegraphRenderer.ts）：
 * 1. 副摄像机 TelegraphOverlayCam（无色差/无震动旋转）：渲染黄色可招架 `[!]`、红色破防 `[✚!]`
 *    闪烁提示框及怪物头顶韧性/精英/护盾状态签；
 * 2. 主摄像机 WorldMainCam（Light2D + Bloom）：零 GC 池化渲染「骸骨堂司铎」指向友军的金色护盾引导光束、
 *    无敌光环、电弧织网者锁定瞄准线、水银地突尖刺与星界重力坍缩法阵。
 */

import type Phaser from 'phaser';
import { DepthLayer, PALETTE_VOID_HEX } from '../../core/Constants';
import { EventBus } from '../../core/EventBus';
import type { TelegraphKind } from '../../data/biomes.data';
import type { IWorldDisplayRegistrar } from '../../world/ParallaxComposer';

const MONO_FONT = 'ui-monospace, SFMono-Regular, Menlo, monospace';
const BLEND_MODE_ADD = 1;

export interface EnemyCrispHudHandle {
  sync(
    x: number,
    y: number,
    overheadOffsetY: number,
    telegraph: TelegraphKind,
    blinkOn: boolean,
    labelText: string,
    isShielded: boolean,
    isElite: boolean,
    visible: boolean
  ): void;
  destroy(): void;
}

export class TelegraphRenderer {
  private readonly beamPool: Phaser.GameObjects.Sprite[] = [];
  private readonly fxPool: Phaser.GameObjects.Sprite[] = [];
  private beamCursor = 0;
  private fxCursor = 0;
  private animClockMs = 0;

  public constructor(
    private readonly scene: Phaser.Scene | null,
    private readonly registrar: IWorldDisplayRegistrar | null
  ) {}

  public createEnemyHud(initX: number, initY: number): EnemyCrispHudHandle | null {
    if (!this.scene || !this.registrar) return null;
    const reg = this.registrar;

    const badge = reg.registerCrispOverlay(
      this.scene.add
        .text(initX, initY - 62, '[!]', {
          fontFamily: MONO_FONT,
          fontSize: '13px',
          fontStyle: 'bold',
          color: '#FBBF24',
          stroke: PALETTE_VOID_HEX,
          strokeThickness: 3,
        })
        .setOrigin(0.5, 0.5)
        .setDepth(DepthLayer.CRISP_TELEGRAPH + 1)
        .setVisible(false)
    );

    const status = reg.registerCrispOverlay(
      this.scene.add
        .text(initX, initY - 48, '', {
          fontFamily: MONO_FONT,
          fontSize: '9px',
          color: '#E8EFF5',
          stroke: PALETTE_VOID_HEX,
          strokeThickness: 2,
        })
        .setOrigin(0.5, 0.5)
        .setDepth(DepthLayer.CRISP_TELEGRAPH)
    );

    let prevTelegraph: TelegraphKind = 'NONE';
    return {
      sync: (x, y, offY, telegraph, blinkOn, labelText, isShielded, isElite, visible) => {
        if (!visible) {
          prevTelegraph = 'NONE';
          badge.setVisible(false);
          status.setVisible(false);
          return;
        }
        if (telegraph !== prevTelegraph && telegraph !== 'NONE') {
          EventBus.emit('audio:sfx_requested', {
            sfxId: telegraph === 'YELLOW_PARRIABLE' ? 'sfx_enemy_warn_parry' : 'sfx_enemy_warn_red',
            worldX: x,
          });
        }
        prevTelegraph = telegraph;
        status
          .setVisible(true)
          .setText(labelText)
          .setColor(isShielded ? '#FBBF24' : isElite ? '#FDBA74' : '#E8EFF5')
          .setPosition(x, y - offY + 12);

        if (telegraph === 'NONE') {
          badge.setVisible(false);
        } else {
          const isYellow = telegraph === 'YELLOW_PARRIABLE';
          badge
            .setVisible(true)
            .setText(isYellow ? '[!]' : '[✚!]')
            .setColor(isYellow ? '#FBBF24' : '#FB7185')
            .setStroke(isYellow ? PALETTE_VOID_HEX : '#240B12', 3)
            .setPosition(x, y - offY - 3)
            .setAlpha(blinkOn ? 1.0 : 0.48)
            .setScale(isYellow ? 1.0 : 1.12);
        }
      },
      destroy: () => {
        reg.unregister(badge);
        badge.destroy();
        reg.unregister(status);
        status.destroy();
      },
    };
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
      const halo = this.acquireFxSprite();
      halo
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
      this.beamPool[i]!.setVisible(false);
    }
    for (let i = this.fxCursor; i < this.fxPool.length; i++) {
      this.fxPool[i]!.setVisible(false);
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

  private acquireBeamSprite(): Phaser.GameObjects.Sprite {
    let spr = this.beamPool[this.beamCursor];
    if (!spr) {
      spr = this.registrar!.registerWorldLit(
        this.scene!.add
          .sprite(0, 0, 'enemy_fx_atlas', 'prelate_gold_beam_0')
          .setDepth(DepthLayer.VFX_PARTICLES + 1)
          .setBlendMode(BLEND_MODE_ADD)
          .setVisible(false)
      );
      this.beamPool.push(spr);
    }
    this.beamCursor += 1;
    return spr;
  }

  private acquireFxSprite(): Phaser.GameObjects.Sprite {
    let spr = this.fxPool[this.fxCursor];
    if (!spr) {
      spr = this.registrar!.registerWorldLit(
        this.scene!.add
          .sprite(0, 0, 'enemy_fx_atlas', 'prelate_ward_halo_0')
          .setDepth(DepthLayer.VFX_PARTICLES)
          .setBlendMode(BLEND_MODE_ADD)
          .setVisible(false)
      );
      this.fxPool.push(spr);
    }
    this.fxCursor += 1;
    return spr;
  }
}
