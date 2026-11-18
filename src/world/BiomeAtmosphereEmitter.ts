/**
 * 四大生态群落专属环境氛围粒子池渲染器（src/world/BiomeAtmosphereEmitter.ts）：
 * - 矿渣蒸馏厂：上浮橘红炉渣余烬 + 煤灰
 * - 矾酸暗渠：自顶坠落荧光绿酸雨丝 + 漂浮毒孢子
 * - 发条骸骨堂：圣堂金箔香灰 + 静电火花
 * - 星界熔炉之巅：逆重力向上升腾的液态水银珠 + 赤金星尘
 *
 * 严格使用 VisualFxRng（零消耗存档 DeterministicRng）与定长预分配池（热路径零 GC）。
 */

import Phaser from 'phaser';
import { DepthLayer, LOGICAL_MAX_HEIGHT, LOGICAL_MAX_WIDTH } from '../core/Constants';
import { VisualFxStream } from '../core/VisualFxRng';
import type { BiomeAtmosphereProfileId } from '../data/biomes.data';
import type { IWorldDisplayRegistrar } from './ParallaxComposer';

interface AtmoSlot {
  readonly sprite: Phaser.GameObjects.Sprite;
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  lifeSec: number;
  maxLifeSec: number;
}

const POOL_CAPACITY = 36;

export class BiomeAtmosphereEmitter {
  private readonly slots: readonly AtmoSlot[];
  private readonly fxRng = new VisualFxStream(0x77a1c0de);
  private spawnAccumSec = 0;

  public constructor(
    scene: Phaser.Scene,
    private readonly registrar: IWorldDisplayRegistrar,
    private readonly profile: BiomeAtmosphereProfileId
  ) {
    const arr: AtmoSlot[] = [];
    for (let i = 0; i < POOL_CAPACITY; i++) {
      const sprite = registrar.registerWorldLit(
        scene.add
          .sprite(0, 0, 'enemy_fx_atlas', 'atmo_ember_0')
          .setDepth(DepthLayer.VFX_PARTICLES - 4)
          .setVisible(false)
      );
      arr.push({
        sprite,
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        lifeSec: 0,
        maxLifeSec: 1.5,
      });
    }
    this.slots = arr;
  }

  public stepFixed(dtSec: number, camLeft: number, camTop: number, camWidth: number, camHeight: number): void {
    const w = Math.max(320, camWidth || LOGICAL_MAX_WIDTH);
    const h = Math.max(240, camHeight || LOGICAL_MAX_HEIGHT);
    const rate = this.profile === 'VITRIOL_ACID_RAIN' ? 22 : 16;
    this.spawnAccumSec += dtSec * rate;

    while (this.spawnAccumSec >= 1.0) {
      this.spawnAccumSec -= 1.0;
      this.spawnOne(camLeft, camTop, w, h);
    }

    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i]!;
      if (!s.active) continue;
      s.lifeSec += dtSec;
      if (s.lifeSec >= s.maxLifeSec) {
        s.active = false;
        s.sprite.setVisible(false);
        continue;
      }
      s.x += s.vx * dtSec;
      s.y += s.vy * dtSec;
      const ratio = s.lifeSec / s.maxLifeSec;
      const fade = ratio < 0.2 ? ratio * 5 : 1 - (ratio - 0.2) / 0.8;
      s.sprite.setPosition(s.x, s.y).setAlpha(Math.max(0.08, fade * 0.85));
    }
  }

  public destroy(): void {
    for (const s of this.slots) {
      this.registrar.unregister(s.sprite);
      s.sprite.destroy();
    }
  }

  private spawnOne(camLeft: number, camTop: number, w: number, h: number): void {
    const slot = this.slots.find((s) => !s.active);
    if (!slot) return;

    slot.active = true;
    slot.lifeSec = 0;
    const rx = camLeft + this.fxRng.nextFloat() * w;
    const alt = this.fxRng.nextFloat() < 0.35;

    if (this.profile === 'SLAG_EMBERS') {
      slot.x = rx;
      slot.y = camTop + h - 8 - this.fxRng.nextFloat() * 48;
      slot.vx = this.fxRng.range(-18, 22);
      slot.vy = this.fxRng.range(-56, -28);
      slot.maxLifeSec = this.fxRng.range(1.4, 2.4);
      slot.sprite
        .setTexture('enemy_fx_atlas', 'atmo_ember_0')
        .setBlendMode(alt ? Phaser.BlendModes.NORMAL : Phaser.BlendModes.ADD)
        .setScale(alt ? 0.75 : 1.0);
    } else if (this.profile === 'VITRIOL_ACID_RAIN') {
      slot.x = rx;
      slot.y = alt ? camTop + h - this.fxRng.nextFloat() * 90 : camTop + 8;
      slot.vx = alt ? this.fxRng.range(-12, 12) : -14;
      slot.vy = alt ? this.fxRng.range(-26, -12) : this.fxRng.range(210, 290);
      slot.maxLifeSec = alt ? 1.9 : 1.15;
      slot.sprite
        .setTexture('enemy_fx_atlas', alt ? 'atmo_acid_spore_0' : 'atmo_acid_rain_0')
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(1.0);
    } else if (this.profile === 'OSSUARY_GOLD_SPARKS') {
      slot.x = rx;
      slot.y = camTop + this.fxRng.nextFloat() * h;
      slot.vx = this.fxRng.range(-24, 24);
      slot.vy = alt ? this.fxRng.range(-40, 40) : this.fxRng.range(14, 34);
      slot.maxLifeSec = alt ? 0.55 : 2.1;
      slot.sprite
        .setTexture('enemy_fx_atlas', alt ? 'proj_acid_glob' : 'atmo_gold_ash_0')
        .setTint(alt ? 0x38bdf8 : 0xffffff)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(alt ? 0.55 : 0.9);
    } else {
      slot.x = rx;
      slot.y = camTop + h - 6 - this.fxRng.nextFloat() * 64;
      slot.vx = this.fxRng.range(-10, 10);
      slot.vy = this.fxRng.range(-74, -36);
      slot.maxLifeSec = this.fxRng.range(1.6, 2.6);
      slot.sprite
        .setTexture('enemy_fx_atlas', alt ? 'atmo_ember_0' : 'atmo_mercury_bead_0')
        .clearTint()
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale(1.0);
    }
    if (this.profile !== 'OSSUARY_GOLD_SPARKS') slot.sprite.clearTint();
    slot.sprite.setPosition(slot.x, slot.y).setVisible(true);
  }
}
