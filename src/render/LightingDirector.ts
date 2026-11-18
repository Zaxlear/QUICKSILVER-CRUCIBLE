import Phaser from 'phaser';
import {
  HERO_MERCURY_LIGHT_INTENSITY,
  HERO_MERCURY_LIGHT_RADIUS_PX,
  MAX_AMBIENT_ANCHOR_LIGHTS,
  MAX_HARDWARE_LIGHTS,
  MAX_TRANSIENT_COMBAT_LIGHTS,
  MERCURY_CORE_LIGHT_NUM,
} from '../core/Constants';
import { LIGHT_ANCHOR_COLOR_PRESETS, type LightPresetId } from '../data/palette.data';
import { deriveDeterministicPhase, evaluateTorchFlicker } from './LightMath';

export { deriveDeterministicPhase, evaluateTorchFlicker } from './LightMath';

export interface AmbientLightAnchor {
  readonly id: string;
  x: number;
  y: number;
  readonly preset: LightPresetId;
  readonly radiusPx: number;
  readonly flickerAmplitude: number;
  readonly baseIntensity?: number;
  readonly phaseRad: number;
}

interface TransientLightSlot {
  readonly light: Phaser.GameObjects.Light;
  active: boolean;
  elapsedSec: number;
  durationSec: number;
  peakIntensity: number;
  baseRadiusPx: number;
}

/**
 * Phaser Light2D 24 点光源动态硬件预算调度器（热路径零 GC 分配）：
 * - 1 盏常驻高优槽：主角胸腔「贤者水银核」贴身点光源
 * - 9 盏瞬态战斗槽：挥刀火花、盾反闪光、飞行投射物对象池复用
 * - 14 盏环境摇曳槽：按距摄像机中心欧氏距离每帧裁剪排序激活
 */
export class LightingDirector {
  public readonly heroCoreLight: Phaser.GameObjects.Light;

  public setAmbientColor(colorNum: number): void {
    this.scene.lights.setAmbientColor(colorNum);
  }

  private readonly scene: Phaser.Scene;
  private readonly transientPool: readonly TransientLightSlot[];
  private readonly ambientHardwareLights: readonly Phaser.GameObjects.Light[];
  private readonly anchors: AmbientLightAnchor[] = [];
  private readonly sortIndices: number[] = [];
  private readonly sqDistances: number[] = [];

  private simTimeSec = 0;
  private heroX = 0;
  private heroY = 0;
  private activeCount = 1;

  public constructor(scene: Phaser.Scene, ambientColorNum: number) {
    this.scene = scene;
    this.scene.lights.enable().setAmbientColor(ambientColorNum);

    this.heroCoreLight = this.scene.lights.addLight(
      0,
      0,
      HERO_MERCURY_LIGHT_RADIUS_PX,
      MERCURY_CORE_LIGHT_NUM,
      HERO_MERCURY_LIGHT_INTENSITY
    );

    const transients: TransientLightSlot[] = [];
    for (let i = 0; i < MAX_TRANSIENT_COMBAT_LIGHTS; i++) {
      const light = this.scene.lights.addLight(0, 0, 1, 0xffffff, 0);
      light.setVisible(false);
      transients.push({
        light,
        active: false,
        elapsedSec: 0,
        durationSec: 0.1,
        peakIntensity: 0,
        baseRadiusPx: 64,
      });
    }
    this.transientPool = transients;

    const ambients: Phaser.GameObjects.Light[] = [];
    for (let i = 0; i < MAX_AMBIENT_ANCHOR_LIGHTS; i++) {
      const light = this.scene.lights.addLight(0, 0, 1, 0xff8a3d, 0);
      light.setVisible(false);
      ambients.push(light);
    }
    this.ambientHardwareLights = ambients;

    if (this.scene.lights.lights.length > MAX_HARDWARE_LIGHTS) {
      throw new Error(`Hardware light budget exceeded: ${this.scene.lights.lights.length}`);
    }
  }

  public get activeHardwareLightCount(): number {
    return this.activeCount;
  }

  public setHeroCorePosition(worldX: number, worldY: number): void {
    this.heroX = worldX;
    this.heroY = worldY;
    this.heroCoreLight.setPosition(worldX, worldY);
  }

  public registerAmbientAnchor(
    anchor: Omit<AmbientLightAnchor, 'phaseRad'> & { phaseRad?: number }
  ): AmbientLightAnchor {
    const fullAnchor: AmbientLightAnchor = {
      ...anchor,
      phaseRad: anchor.phaseRad ?? deriveDeterministicPhase(anchor.x, anchor.y, this.anchors.length),
    };
    this.anchors.push(fullAnchor);
    this.sortIndices.push(this.anchors.length - 1);
    this.sqDistances.push(0);
    return fullAnchor;
  }

  public clearAmbientAnchors(): void {
    this.anchors.length = 0;
    this.sortIndices.length = 0;
    this.sqDistances.length = 0;
    for (let i = 0; i < this.ambientHardwareLights.length; i++) {
      this.ambientHardwareLights[i]!.setVisible(false).setIntensity(0);
    }
  }

  public spawnTransientFlash(
    worldX: number,
    worldY: number,
    colorNum: number,
    radiusPx: number,
    peakIntensity: number,
    durationMs: number
  ): void {
    let chosen = this.transientPool[0]!;
    let minRemain = Infinity;
    for (let i = 0; i < this.transientPool.length; i++) {
      const slot = this.transientPool[i]!;
      if (!slot.active) {
        chosen = slot;
        break;
      }
      const remain = slot.durationSec - slot.elapsedSec;
      if (remain < minRemain) {
        minRemain = remain;
        chosen = slot;
      }
    }

    chosen.active = true;
    chosen.elapsedSec = 0;
    chosen.durationSec = Math.max(0.016, durationMs / 1000);
    chosen.peakIntensity = peakIntensity;
    chosen.baseRadiusPx = radiusPx;
    chosen.light
      .setPosition(worldX, worldY)
      .setColor(colorNum)
      .setRadius(radiusPx)
      .setIntensity(peakIntensity)
      .setVisible(true);
  }

  public step(dtSec: number, camCenterX: number, camCenterY: number): void {
    this.simTimeSec += dtSec;
    let litCount = 1;

    const pulse = HERO_MERCURY_LIGHT_INTENSITY + 0.16 * Math.sin(this.simTimeSec * 3.4);
    this.heroCoreLight.setPosition(this.heroX, this.heroY).setIntensity(pulse);

    for (let i = 0; i < this.transientPool.length; i++) {
      const slot = this.transientPool[i]!;
      if (!slot.active) continue;
      slot.elapsedSec += dtSec;
      if (slot.elapsedSec >= slot.durationSec) {
        slot.active = false;
        slot.light.setVisible(false).setIntensity(0);
      } else {
        const progress = slot.elapsedSec / slot.durationSec;
        slot.light.setIntensity(slot.peakIntensity * (1.0 - progress) * (1.0 - progress));
        litCount++;
      }
    }

    const totalAnchors = this.anchors.length;
    for (let i = 0; i < totalAnchors; i++) {
      const a = this.anchors[i]!;
      const dx = a.x - camCenterX;
      const dy = a.y - camCenterY;
      this.sqDistances[i] = dx * dx + dy * dy;
      this.sortIndices[i] = i;
    }

    for (let i = 1; i < totalAnchors; i++) {
      const keyIdx = this.sortIndices[i]!;
      const keyDist = this.sqDistances[keyIdx]!;
      let j = i - 1;
      while (j >= 0 && this.sqDistances[this.sortIndices[j]!]! > keyDist) {
        this.sortIndices[j + 1] = this.sortIndices[j]!;
        j--;
      }
      this.sortIndices[j + 1] = keyIdx;
    }

    const halfViewDiag =
      Math.hypot(this.scene.scale.width || 640, this.scene.scale.height || 360) * 0.5 + 48;
    const activeAnchors = Math.min(totalAnchors, MAX_AMBIENT_ANCHOR_LIGHTS);
    for (let slotIdx = 0; slotIdx < MAX_AMBIENT_ANCHOR_LIGHTS; slotIdx++) {
      const hwLight = this.ambientHardwareLights[slotIdx]!;
      if (slotIdx < activeAnchors) {
        const sortedIdx = this.sortIndices[slotIdx]!;
        const anchor = this.anchors[sortedIdx]!;
        const maxReach = halfViewDiag + anchor.radiusPx;
        if (this.sqDistances[sortedIdx]! <= maxReach * maxReach) {
          const presetCfg = LIGHT_ANCHOR_COLOR_PRESETS[anchor.preset];
          const baseI = anchor.baseIntensity ?? presetCfg.baseIntensity;
          const flickered = evaluateTorchFlicker(
            baseI,
            anchor.radiusPx,
            anchor.flickerAmplitude,
            this.simTimeSec,
            anchor.phaseRad
          );
          hwLight
            .setPosition(anchor.x, anchor.y)
            .setColor(presetCfg.colorNum)
            .setRadius(flickered.radiusPx)
            .setIntensity(flickered.intensity)
            .setVisible(true);
          litCount++;
          continue;
        }
      }
      if (hwLight.visible) hwLight.setVisible(false).setIntensity(0);
    }

    this.activeCount = litCount;
  }
}
