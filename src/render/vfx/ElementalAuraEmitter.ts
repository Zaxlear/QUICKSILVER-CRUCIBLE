/**
 * 6 元素附着常驻粒子（vfx_elem_aura_6）与技能场景构造物调度渲染器
 * （src/render/vfx/ElementalAuraEmitter.ts）。
 */

import Phaser from 'phaser';
import type { ActiveSkillRuntime } from '../../combat/ActiveSkillRuntime';
import type { CombatTargetView } from '../../combat/CombatTypes';
import type { StatusEffectMachine } from '../../combat/StatusEffectMachine';
import { DepthLayer } from '../../core/Constants';
import { ObjectPool, type IPoolable } from '../../core/ObjectPool';
import { VisualFxRng } from '../../core/VisualFxRng';
import type { ElementStatusKey } from '../../data/affixes.data';
import type { CameraRig } from '../CameraRig';
import type { LightingDirector } from '../LightingDirector';
import { SkillConstructRenderer } from './SkillConstructRenderer';

const AURA_STATUS_ORDER: readonly ElementStatusKey[] = [
  'ignited',
  'electrified',
  'frozen',
  'bleeding',
  'poisoned',
  'oiled',
] as const;

class PooledAuraDroplet implements IPoolable {
  public readonly sprite: Phaser.GameObjects.Sprite;
  public x = 0;
  public y = 0;
  public vx = 0;
  public vy = 0;
  public elapsedSec = 0;
  public lifetimeSec = 0.45;

  public constructor(scene: Phaser.Scene, cameraRig: CameraRig) {
    this.sprite = scene.add
      .sprite(0, 0, 'synergy_fx_atlas', 'elem_ignited_0')
      .setDepth(DepthLayer.VFX_PARTICLES + 1)
      .setVisible(false)
      .setActive(false);
    cameraRig.registerWorldLit(this.sprite);
  }

  public reset(): void {
    this.elapsedSec = 0;
    this.sprite.setVisible(false).setActive(false).setAlpha(0);
  }
}

export class ElementalAuraEmitter {
  private readonly auraPool: ObjectPool<PooledAuraDroplet>;
  private readonly constructs: SkillConstructRenderer;
  private auraSpawnAccumSec = 0;
  private animClockSec = 0;

  public constructor(scene: Phaser.Scene, cameraRig: CameraRig, lighting: LightingDirector) {
    this.auraPool = new ObjectPool(() => new PooledAuraDroplet(scene, cameraRig), 48, 144);
    this.constructs = new SkillConstructRenderer(scene, cameraRig, lighting);
  }

  public stepFixed(
    dtSec: number,
    playerX: number,
    playerY: number,
    targets: readonly CombatTargetView[],
    statusMachine: StatusEffectMachine,
    skillRuntime: ActiveSkillRuntime
  ): void {
    this.animClockSec += dtSec;
    this.auraSpawnAccumSec += dtSec;
    if (this.auraSpawnAccumSec >= 0.09) {
      this.auraSpawnAccumSec -= 0.09;
      this.spawnTargetAuraParticles(targets, statusMachine);
    }

    this.auraPool.forEachActive((p) => {
      p.elapsedSec += dtSec;
      if (p.elapsedSec >= p.lifetimeSec) {
        this.auraPool.release(p);
        return;
      }
      p.x += p.vx * dtSec;
      p.y += p.vy * dtSec;
      p.sprite.setPosition(p.x, p.y).setAlpha(1 - (p.elapsedSec / p.lifetimeSec) * 0.85);
    });

    this.constructs.stepFixed(dtSec, this.animClockSec, playerX, playerY, skillRuntime);
  }

  /** 构建目标头顶元素状态徽标字符串（渲染于无模糊 TelegraphOverlayCam） */
  public static formatStatusBadges(targetId: string, sm: StatusEffectMachine): string {
    const parts: string[] = [];
    if (sm.isVioletNapalm(targetId)) parts.push(`NPLM×${sm.getStacks(targetId, 'ignited')}`);
    else if (sm.has(targetId, 'ignited')) parts.push(`BRN×${sm.getStacks(targetId, 'ignited')}`);
    if (sm.has(targetId, 'oiled') && !sm.isVioletNapalm(targetId)) parts.push('OIL');
    if (sm.has(targetId, 'bleeding')) parts.push(`BLD×${sm.getStacks(targetId, 'bleeding')}`);
    if (sm.has(targetId, 'frozen')) parts.push('FRZ');
    if (sm.has(targetId, 'electrified')) parts.push(`SHK×${sm.getStacks(targetId, 'electrified')}`);
    if (sm.has(targetId, 'poisoned')) parts.push(`PSN×${sm.getStacks(targetId, 'poisoned')}`);
    if (sm.isRooted(targetId)) parts.push('ROOT');
    return parts.join(' ');
  }

  public destroy(): void {
    this.auraPool.releaseAll();
    this.constructs.destroy();
  }

  private spawnTargetAuraParticles(targets: readonly CombatTargetView[], sm: StatusEffectMachine): void {
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i]!;
      if (!t.isAlive) continue;
      for (let k = 0; k < AURA_STATUS_ORDER.length; k++) {
        const st = AURA_STATUS_ORDER[k]!;
        if (!sm.has(t.id, st)) continue;
        const isNapalm = st === 'ignited' && sm.isVioletNapalm(t.id);
        const frame = isNapalm ? 'elem_violet_0' : `elem_${st}_0`;
        const isAdd = st === 'ignited' || st === 'frozen' || st === 'electrified';
        const p = this.auraPool.acquire();
        p.x = t.x + VisualFxRng.signedJitter(t.width * 0.45);
        p.y = t.y - VisualFxRng.range(6, t.height - 4);
        p.vx = VisualFxRng.signedJitter(16);
        p.vy =
          st === 'ignited'
            ? -65
            : st === 'frozen' || st === 'electrified'
              ? VisualFxRng.signedJitter(24)
              : 50;
        p.elapsedSec = 0;
        p.lifetimeSec = VisualFxRng.range(0.35, 0.58);
        p.sprite
          .setTexture('synergy_fx_atlas', frame)
          .setBlendMode(isAdd ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL)
          .setPosition(p.x, p.y)
          .setScale(isNapalm ? 1.2 : 0.95)
          .setAlpha(0.95)
          .setVisible(true)
          .setActive(true);
      }
    }
  }
}
