/**
 * 挂载于无后处理副相机 TelegraphOverlayCam 的零 GC 高锐度伤害与战斗飘字池
 * （src/render/vfx/CrispDamageNumberPool.ts）。
 *
 * 100% 免疫 WorldMainCam 的色差撕裂（ChromaticImpact）与创伤震动重影。
 */

import Phaser from 'phaser';
import { DepthLayer, PALETTE_VOID_HEX } from '../../core/Constants';
import { ObjectPool, type IPoolable } from '../../core/ObjectPool';
import { VisualFxRng } from '../../core/VisualFxRng';
import type { CameraRig } from '../CameraRig';

export type CrispPopupStyle = 'NORMAL' | 'CRIT' | 'PARRY' | 'BLOCKED' | 'RALLY_HEAL' | 'REACTION';

class PooledDamagePopup implements IPoolable {
  public readonly text: Phaser.GameObjects.Text;
  public x = 0;
  public y = 0;
  public vx = 0;
  public vy = 0;
  public elapsedSec = 0;
  public lifetimeSec = 0.62;
  public peakScale = 1.0;

  public constructor(scene: Phaser.Scene, cameraRig: CameraRig) {
    this.text = scene.add
      .text(0, 0, '', {
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#F8FAFC',
        stroke: PALETTE_VOID_HEX,
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0.5)
      .setDepth(DepthLayer.CRISP_DAMAGE_NUMBER)
      .setVisible(false)
      .setActive(false);
    cameraRig.registerCrispOverlay(this.text);
  }

  public reset(): void {
    this.elapsedSec = 0;
    this.text.setVisible(false).setActive(false).setAlpha(0).setScale(1);
  }
}

export class CrispDamageNumberPool {
  private readonly pool: ObjectPool<PooledDamagePopup>;

  public constructor(scene: Phaser.Scene, cameraRig: CameraRig) {
    this.pool = new ObjectPool<PooledDamagePopup>(
      () => new PooledDamagePopup(scene, cameraRig),
      24,
      64
    );
  }

  public get activeCount(): number {
    return this.pool.activeCount;
  }

  public spawnDamageNumber(worldX: number, worldY: number, amount: number, isCrit: boolean): void {
    this.spawnLabel(
      worldX + VisualFxRng.signedJitter(7),
      worldY - 6,
      isCrit ? `✦${amount}!` : `${amount}`,
      isCrit ? 'CRIT' : 'NORMAL'
    );
  }

  public spawnLabel(worldX: number, worldY: number, content: string, style: CrispPopupStyle): void {
    const p = this.pool.acquire();
    p.x = worldX;
    p.y = worldY;
    p.vx = VisualFxRng.signedJitter(18);
    p.vy = style === 'CRIT' || style === 'PARRY' ? -82 : -56;
    p.elapsedSec = 0;
    p.lifetimeSec = style === 'CRIT' || style === 'PARRY' ? 0.75 : 0.58;
    p.peakScale = style === 'CRIT' ? 1.32 : style === 'PARRY' ? 1.25 : 1.0;

    let color = '#F8FAFC';
    let fontSize = '11px';
    if (style === 'CRIT') {
      color = '#FBBF24';
      fontSize = '14px';
    } else if (style === 'PARRY') {
      color = '#38BDF8';
      fontSize = '13px';
    } else if (style === 'BLOCKED') {
      color = '#9AA5B8';
      fontSize = '10px';
    } else if (style === 'RALLY_HEAL') {
      color = '#3CE682';
      fontSize = '11px';
    } else if (style === 'REACTION') {
      color = '#A855F7';
      fontSize = '13px';
    }

    p.text
      .setText(content)
      .setColor(color)
      .setFontSize(fontSize)
      .setPosition(p.x, p.y)
      .setScale(p.peakScale)
      .setAlpha(1)
      .setVisible(true)
      .setActive(true);
  }

  public stepFixed(dtSec: number): void {
    this.pool.forEachActive((p) => {
      p.elapsedSec += dtSec;
      if (p.elapsedSec >= p.lifetimeSec) {
        this.pool.release(p);
        return;
      }
      const t = p.elapsedSec / p.lifetimeSec;
      p.vy += 125 * dtSec;
      p.x += p.vx * dtSec;
      p.y += p.vy * dtSec;

      const scale = t < 0.22 ? p.peakScale - (p.peakScale - 1.0) * (t / 0.22) : 1.0;
      const alpha = t > 0.65 ? Math.max(0, 1 - (t - 0.65) / 0.35) : 1.0;
      p.text.setPosition(p.x, p.y).setScale(scale).setAlpha(alpha);
    });
  }

  public destroy(): void {
    this.pool.releaseAll();
  }
}
