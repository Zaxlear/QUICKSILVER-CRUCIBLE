/**
 * 地面炼金紫火池（挂载动态紫色 Light2D 点光源照亮法线砖墙）、发条捕兽夹与
 * 黄铜特斯拉哨塔蓝色高压电弧绊线渲染器（src/render/vfx/SkillConstructRenderer.ts）。
 */

import Phaser from 'phaser';
import type { ActiveSkillRuntime } from '../../combat/ActiveSkillRuntime';
import { DepthLayer } from '../../core/Constants';
import type { CameraRig } from '../CameraRig';
import type { LightingDirector } from '../LightingDirector';

export class SkillConstructRenderer {
  private readonly zoneSprites: Phaser.GameObjects.Sprite[] = [];
  private readonly trapSprites: Phaser.GameObjects.Sprite[] = [];
  private readonly tetherSprites: Phaser.GameObjects.Sprite[] = [];
  private readonly turretSprite: Phaser.GameObjects.Sprite;
  private readonly aegisDomeSprite: Phaser.GameObjects.Sprite;
  private lightPulseAccumSec = 0;

  public constructor(
    private readonly scene: Phaser.Scene,
    private readonly cameraRig: CameraRig,
    private readonly lighting: LightingDirector
  ) {
    this.turretSprite = cameraRig.registerWorldLit(
      scene.add
        .sprite(0, 0, 'synergy_fx_atlas', 'tesla_turret_idle_0')
        .setOrigin(0.5, 0.92)
        .setDepth(DepthLayer.PLAYER - 1)
        .setPipeline('Light2D')
        .setVisible(false)
    );
    this.aegisDomeSprite = cameraRig.registerWorldLit(
      scene.add
        .sprite(0, 0, 'synergy_fx_atlas', 'aegis_urn_dome_0')
        .setDepth(DepthLayer.VFX_PARTICLES + 2)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setVisible(false)
    );
  }

  public stepFixed(
    dtSec: number,
    animClockSec: number,
    playerX: number,
    playerY: number,
    rt: ActiveSkillRuntime
  ): void {
    const parity = (Math.floor(animClockSec * 9) & 1) as 0 | 1;
    this.syncGroundZonesAndDynamicLights(dtSec, rt, parity);
    this.syncTrapsTurretAndTether(playerX, playerY - 18, animClockSec, rt, parity);

    if (rt.aegisUrnSec > 0 && rt.aegisShieldHp > 0) {
      this.aegisDomeSprite
        .setPosition(playerX, playerY - 18)
        .setRotation(animClockSec * 1.4)
        .setAlpha(0.75 + 0.15 * Math.sin(animClockSec * 10))
        .setVisible(true);
    } else {
      this.aegisDomeSprite.setVisible(false);
    }
  }

  public destroy(): void {
    for (const arr of [this.zoneSprites, this.trapSprites, this.tetherSprites]) {
      for (const s of arr) {
        this.cameraRig.unregister(s);
        s.destroy();
      }
      arr.length = 0;
    }
    for (const s of [this.turretSprite, this.aegisDomeSprite]) {
      this.cameraRig.unregister(s);
      s.destroy();
    }
  }

  private syncGroundZonesAndDynamicLights(dtSec: number, rt: ActiveSkillRuntime, parity: 0 | 1): void {
    this.lightPulseAccumSec += dtSec;
    const emitLightNow = this.lightPulseAccumSec >= 0.11;
    if (emitLightNow) this.lightPulseAccumSec = 0;

    let sprIdx = 0;
    rt.hazardZones.forEachActive((z) => {
      const count = Math.max(1, Math.round((z.radiusPx * 2) / 52));
      const frame =
        z.kind === 'TOXIC_MIST_CLOUD'
          ? `pool_toxic_cloud_${parity}`
          : z.kind === 'VITRIOL_ACID_FIRE_POOL'
            ? `pool_vitriol_fire_${parity}`
            : `pool_violet_napalm_${parity}`;
      const isAdd = z.kind !== 'TOXIC_MIST_CLOUD';

      for (let c = 0; c < count; c++) {
        const offset = count === 1 ? 0 : -z.radiusPx * 0.68 + (c / (count - 1)) * (z.radiusPx * 1.36);
        const spr = this.ensureSprite(this.zoneSprites, sprIdx++, DepthLayer.TRAPS + 1);
        spr
          .setTexture('synergy_fx_atlas', frame)
          .setBlendMode(isAdd ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL)
          .setPosition(z.x + offset, z.y - 10)
          .setScale(z.kind === 'VIOLET_NAPALM_POOL' ? 1.18 : 1.0)
          .setAlpha(Math.min(1, z.remainingSec * 1.4))
          .setVisible(true);
      }
      if (emitLightNow) {
        const col =
          z.kind === 'TOXIC_MIST_CLOUD' ? 0x3ce682 : z.kind === 'VITRIOL_ACID_FIRE_POOL' ? 0xff5e2b : 0xa855f7;
        this.lighting.spawnTransientFlash(z.x, z.y - 22, col, z.radiusPx + 95, 2.6, 150);
      }
    });
    for (let k = sprIdx; k < this.zoneSprites.length; k++) this.zoneSprites[k]!.setVisible(false);
  }

  private syncTrapsTurretAndTether(
    px: number,
    py: number,
    animClockSec: number,
    rt: ActiveSkillRuntime,
    parity: 0 | 1
  ): void {
    let tIdx = 0;
    rt.sawTraps.forEachActive((tr) => {
      const spr = this.ensureSprite(this.trapSprites, tIdx++, DepthLayer.TRAPS + 2, true);
      spr
        .setTexture('synergy_fx_atlas', tr.snappedTargetId ? 'saw_trap_snapped_0' : 'saw_trap_armed_0')
        .setPosition(tr.x, tr.y - 6)
        .setVisible(true);
    });
    for (let k = tIdx; k < this.trapSprites.length; k++) this.trapSprites[k]!.setVisible(false);

    if (!rt.turret.active) {
      this.turretSprite.setVisible(false);
      for (const s of this.tetherSprites) s.setVisible(false);
      return;
    }

    this.turretSprite.setFrame(`tesla_turret_idle_${parity}`).setPosition(rt.turret.x, rt.turret.y).setVisible(true);
    if (!rt.turret.tetherLinkedToPlayer) {
      for (const s of this.tetherSprites) s.setVisible(false);
      return;
    }

    const tx = rt.turret.x;
    const ty = rt.turret.y - 30;
    const dx = px - tx;
    const dy = py - ty;
    const dist = Math.max(16, Math.hypot(dx, dy));
    const segCount = Math.max(1, Math.ceil(dist / 48));
    const angle = Math.atan2(dy, dx);

    for (let i = 0; i < segCount; i++) {
      const u = (i + 0.5) / segCount;
      const seg = this.ensureSprite(this.tetherSprites, i, DepthLayer.VFX_PARTICLES + 3);
      seg
        .setTexture('synergy_fx_atlas', `tesla_tether_beam_${(i + parity) & 1}`)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setPosition(tx + dx * u, ty + dy * u)
        .setRotation(angle)
        .setScale(dist / (segCount * 50), 1.15)
        .setAlpha(0.96)
        .setVisible(true);
    }
    for (let k = segCount; k < this.tetherSprites.length; k++) this.tetherSprites[k]!.setVisible(false);
    if (Math.floor(animClockSec * 60) % 6 === 0) {
      this.lighting.spawnTransientFlash((tx + px) * 0.5, (ty + py) * 0.5, 0x38bdf8, 165, 2.2, 110);
    }
  }

  private ensureSprite(
    list: Phaser.GameObjects.Sprite[],
    idx: number,
    depth: number,
    useLight2D = false
  ): Phaser.GameObjects.Sprite {
    let spr = list[idx];
    if (!spr) {
      spr = this.scene.add.sprite(0, 0, 'synergy_fx_atlas', 'pool_violet_napalm_0').setDepth(depth);
      if (useLight2D) spr.setPipeline('Light2D');
      this.cameraRig.registerWorldLit(spr);
      list.push(spr);
    }
    return spr;
  }
}
