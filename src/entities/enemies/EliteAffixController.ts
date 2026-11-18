/**
 * 精英怪动态升阶与 4 大精英词缀控制器（src/entities/enemies/EliteAffixController.ts）：
 * 1. elite_rotating_laser：96px 缓慢旋转炼金火线；
 * 2. elite_twin_clone：入战召唤 45% 血量半透明水银分身协同夹击；
 * 3. elite_voltaic_cage：玩家两侧 160px 竖起限制逃跑的高压感电柱；
 * 4. elite_thorns_shell：背部紫晶模型渲染（配合 BaseEnemy 背刺 20% 反伤结算）；
 * 以及仇恨态每隔 7.0s 的跨平台追击瞬移。
 */

import type Phaser from 'phaser';
import type { SolidWallRect } from '../../combat/CombatTypes';
import { DepthLayer } from '../../core/Constants';
import { ELITE_SCALING } from '../../data/biomes.data';
import type { IWorldDisplayRegistrar } from '../../world/ParallaxComposer';
import type { BaseEnemy } from './BaseEnemy';
import { solveBehindPlayerTeleport } from './PerceptionSensor';

const BLEND_NORMAL = 0;
const BLEND_ADD = 1;

interface EliteRuntimeSlot {
  pursuitTimerMs: number;
  laserAngleRad: number;
  laserPlayerHitCdMs: number;
  cageCenterX: number;
  cageFloorY: number;
  cageLocked: boolean;
  cagePlayerHitCdMs: number;
  twinCloneSpawned: boolean;
}

export class EliteAffixController {
  private readonly states = new Map<string, EliteRuntimeSlot>();
  private readonly fxPool: Phaser.GameObjects.Sprite[] = [];
  private fxCursor = 0;
  private animMs = 0;

  public constructor(
    private readonly scene: Phaser.Scene | null,
    private readonly registrar: IWorldDisplayRegistrar | null
  ) {}

  public stepFixed(
    dtSec: number,
    dtMs: number,
    enemies: readonly BaseEnemy[],
    playerX: number,
    playerY: number,
    playerFacing: -1 | 1,
    solidRects: readonly SolidWallRect[],
    onAuraHitPlayer: (damage: number, dirX: -1 | 1, source: BaseEnemy) => void,
    onSpawnTwinClone: (hostElite: BaseEnemy) => void
  ): void {
    this.animMs += dtMs;
    this.fxCursor = 0;
    const bit = (Math.floor(this.animMs / 100) & 1) as 0 | 1;

    for (let i = 0; i < enemies.length; i++) {
      const en = enemies[i]!;
      if (!en.isElite || en.isClone || !en.isAlive) continue;

      let st = this.states.get(en.id);
      if (!st) {
        st = {
          pursuitTimerMs: 0,
          laserAngleRad: 0,
          laserPlayerHitCdMs: 0,
          cageCenterX: en.x,
          cageFloorY: en.y,
          cageLocked: false,
          cagePlayerHitCdMs: 0,
          twinCloneSpawned: false,
        };
        this.states.set(en.id, st);
      }

      this.drawSprite(`elite_underfoot_sigil_${bit}`, en.x, en.y - 4, 0, 1.15, 1.0, false);

      if (en.eliteAffixes.includes('elite_thorns_shell')) {
        const backX = en.x - en.facing * 12;
        const backY = en.y - en.spec.colliderHeightPx * 0.58;
        this.drawSprite('elite_thorns_crest', backX, backY, 0, 1.0, 1.0, en.facing < 0, false);
      }

      if (!en.aggroed || en.isStunned) continue;

      // 1. 双生分身：首次入战生成 45% HP 半透明水银镜像
      if (en.eliteAffixes.includes('elite_twin_clone') && !st.twinCloneSpawned) {
        st.twinCloneSpawned = true;
        onSpawnTwinClone(en);
      }

      // 2. 每隔 7.0s 跨平台追击瞬移
      if (Math.abs(playerY - en.y) >= 56 || Math.abs(playerX - en.x) >= 240) {
        st.pursuitTimerMs += dtMs;
        if (st.pursuitTimerMs >= ELITE_SCALING.PURSUIT_TELEPORT_CD_MS) {
          st.pursuitTimerMs = 0;
          const dest = solveBehindPlayerTeleport(playerX, playerY, playerFacing, 42, solidRects);
          en.x = dest.x;
          en.y = dest.y;
          en.patrolMinX = Math.min(en.patrolMinX, dest.x - 112);
          en.patrolMaxX = Math.max(en.patrolMaxX, dest.x + 112);
        }
      } else {
        st.pursuitTimerMs = Math.max(0, st.pursuitTimerMs - dtMs * 0.5);
      }

      // 3. 旋转炼金火线（96px）
      if (en.eliteAffixes.includes('elite_rotating_laser')) {
        st.laserAngleRad = (st.laserAngleRad + ELITE_SCALING.ROTATING_LASER_RAD_PER_SEC * dtSec) % (Math.PI * 2);
        if (st.laserPlayerHitCdMs > 0) st.laserPlayerHitCdMs = Math.max(0, st.laserPlayerHitCdMs - dtMs);

        const ox = en.x;
        const oy = en.y - en.spec.colliderHeightPx * 0.5;
        const tipX = ox + Math.cos(st.laserAngleRad) * ELITE_SCALING.ROTATING_LASER_RADIUS_PX;
        const tipY = oy + Math.sin(st.laserAngleRad) * ELITE_SCALING.ROTATING_LASER_RADIUS_PX;
        this.drawSprite(`elite_fire_beam_${bit}`, (ox + tipX) * 0.5, (oy + tipY) * 0.5, st.laserAngleRad, 1.0, 1.15);

        if (st.laserPlayerHitCdMs <= 0 && distPointToSegment(playerX, playerY - 15, ox, oy, tipX, tipY) <= 14) {
          st.laserPlayerHitCdMs = 550;
          onAuraHitPlayer(Math.round(18 * en.damageScale), playerX >= ox ? 1 : -1, en);
        }
      }

      // 4. 电弧牢笼（玩家两侧 ±160px 感电边界柱）
      if (en.eliteAffixes.includes('elite_voltaic_cage')) {
        if (!st.cageLocked) {
          st.cageLocked = true;
          st.cageCenterX = playerX;
          st.cageFloorY = playerY;
        }
        if (st.cagePlayerHitCdMs > 0) st.cagePlayerHitCdMs = Math.max(0, st.cagePlayerHitCdMs - dtMs);
        const leftX = st.cageCenterX - ELITE_SCALING.VOLTAIC_CAGE_HALF_SPAN_PX;
        const rightX = st.cageCenterX + ELITE_SCALING.VOLTAIC_CAGE_HALF_SPAN_PX;
        this.drawSprite(`elite_cage_pillar_${bit}`, leftX, st.cageFloorY - 30, 0, 1.0, 1.0);
        this.drawSprite(`elite_cage_pillar_${bit}`, rightX, st.cageFloorY - 30, 0, 1.0, 1.0);

        if (st.cagePlayerHitCdMs <= 0 && Math.abs(playerY - st.cageFloorY) <= 56) {
          if (Math.abs(playerX - leftX) <= 13) {
            st.cagePlayerHitCdMs = 600;
            onAuraHitPlayer(Math.round(16 * en.damageScale), 1, en);
          } else if (Math.abs(playerX - rightX) <= 13) {
            st.cagePlayerHitCdMs = 600;
            onAuraHitPlayer(Math.round(16 * en.damageScale), -1, en);
          }
        }
      }
    }

    for (let k = this.fxCursor; k < this.fxPool.length; k++) {
      this.fxPool[k]!.setVisible(false);
    }
  }

  public destroy(): void {
    if (this.registrar) {
      for (const s of this.fxPool) {
        this.registrar.unregister(s);
        s.destroy();
      }
    }
    this.fxPool.length = 0;
    this.states.clear();
  }

  private drawSprite(frame: string, x: number, y: number, rot: number, sx: number, sy: number, flipX = false, additive = true): void {
    if (!this.scene || !this.registrar) return;
    let spr = this.fxPool[this.fxCursor];
    if (!spr) {
      spr = this.registrar.registerWorldLit(
        this.scene.add.sprite(0, 0, 'enemy_fx_atlas', frame).setDepth(DepthLayer.VFX_PARTICLES)
      );
      this.fxPool.push(spr);
    }
    this.fxCursor += 1;
    spr
      .setTexture('enemy_fx_atlas', frame)
      .setBlendMode(additive ? BLEND_ADD : BLEND_NORMAL)
      .setPosition(x, y)
      .setRotation(rot)
      .setScale(sx, sy)
      .setFlipX(flipX)
      .setVisible(true);
  }
}

function distPointToSegment(px: number, py: number, x0: number, y0: number, x1: number, y1: number): number {
  const vx = x1 - x0;
  const vy = y1 - y0;
  const lenSq = vx * vx + vy * vy;
  if (lenSq <= 1e-4) return Math.hypot(px - x0, py - y0);
  const t = Math.max(0, Math.min(1, ((px - x0) * vx + (py - y0) * vy) / lenSq));
  return Math.hypot(px - (x0 + t * vx), py - (y0 + t * vy));
}
