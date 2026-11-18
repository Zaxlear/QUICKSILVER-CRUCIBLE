/**
 * 5 层景深视差卷轴与动态光照合成器（src/world/ParallaxComposer.ts）。
 *
 * 严格遵循单向依赖铁律：通过轻量 IWorldDisplayRegistrar 接口注册渲染对象，
 * 零反向依赖 src/render、src/scenes 或 src/ui。
 */

import Phaser from 'phaser';
import { DepthLayer, LOGICAL_MAX_HEIGHT, LOGICAL_MAX_WIDTH } from '../core/Constants';
import { BIOME_01_SLAG_LIGHTING, type LightPresetId } from '../data/palette.data';

export interface IWorldDisplayRegistrar {
  registerWorldLit<T extends Phaser.GameObjects.GameObject>(obj: T): T;
  registerCrispOverlay<T extends Phaser.GameObjects.GameObject>(obj: T): T;
  unregister(obj: Phaser.GameObjects.GameObject): void;
  registerAmbientLight(cfg: {
    readonly id: string;
    readonly x: number;
    readonly y: number;
    readonly preset: LightPresetId;
    readonly radiusPx: number;
    readonly flickerAmplitude: number;
    readonly baseIntensity?: number;
  }): void;
  spawnLightFlash(
    worldX: number,
    worldY: number,
    colorNum: number,
    radiusPx: number,
    peakIntensity: number,
    durationMs: number
  ): void;
}

const PARALLAX_DEPTHS = [
  DepthLayer.PARALLAX_FAR,
  DepthLayer.PARALLAX_MID_FAR,
  DepthLayer.PARALLAX_MID,
  DepthLayer.PARALLAX_NEAR,
  DepthLayer.PARALLAX_FOREGROUND,
] as const;

export class ParallaxComposer {
  private readonly layers: Phaser.GameObjects.TileSprite[] = [];
  private readonly scrollFactors: readonly number[];
  private readonly registrar: IWorldDisplayRegistrar;

  public constructor(
    scene: Phaser.Scene,
    registrar: IWorldDisplayRegistrar,
    texturePrefix = 'biome01_parallax_L',
    scrollFactors: readonly number[] = BIOME_01_SLAG_LIGHTING.parallaxScrollFactors
  ) {
    this.registrar = registrar;
    this.scrollFactors = scrollFactors;

    for (let i = 0; i < 5; i++) {
      const layer = scene.add
        .tileSprite(0, 0, LOGICAL_MAX_WIDTH, LOGICAL_MAX_HEIGHT, `${texturePrefix}${i}`)
        .setScrollFactor(0)
        .setOrigin(0, 0)
        .setDepth(PARALLAX_DEPTHS[i]!);

      // 中景与近景视差层绑定法线贴图与 Light2D，实时接收房间火把与战斗闪光受光
      if (i === 2 || i === 3) {
        layer.setPipeline('Light2D');
      }
      if (i === 4) {
        layer.setAlpha(0.86);
      }

      registrar.registerWorldLit(layer);
      this.layers.push(layer);
    }
  }

  public syncWithCamera(camScrollX: number, camScrollY: number): void {
    for (let i = 0; i < this.layers.length; i++) {
      const factor = this.scrollFactors[i] ?? 0.2;
      const layer = this.layers[i]!;
      layer.tilePositionX = camScrollX * factor;
      layer.tilePositionY = camScrollY * factor * 0.16;
    }
  }

  public resize(logicalWidth: number, logicalHeight: number): void {
    const w = Math.max(logicalWidth, LOGICAL_MAX_WIDTH);
    const h = Math.max(logicalHeight, LOGICAL_MAX_HEIGHT);
    for (const layer of this.layers) {
      layer.setSize(w, h);
    }
  }

  public destroy(): void {
    for (const layer of this.layers) {
      this.registrar.unregister(layer);
      layer.destroy();
    }
    this.layers.length = 0;
  }
}
