/**
 * 发条浮空电弧与伪装自爆机械怪家族（src/entities/enemies/roster/VoltaicWeaverEnemy.ts）：
 * - mob_07_voltaic_weaver（电弧织网者）：无视地形浮空游弋于玩家斜上方 90px，与友军建立导电连线；
 *   620ms 红框 [✚!] 聚能锁定瞄准线后发射高压射线（需翻滚脱离瞄准线）；
 * - mob_08_clockwork_tick（发条自爆蛛）：静止伪装铜球，惊醒后 240 px/s 极速飞扑，
 *   48px 内定格闪烁 450ms 红框 [✚!] 过载自爆（可在引爆前斩杀或翻滚穿走）。
 */

import { BaseEnemy } from '../BaseEnemy';
import type { EnemyStepContext } from '../EnemyTypes';
import { clampGroundX, evaluateEnemyPerception } from '../PerceptionSensor';

type WeaverPhase = 'HOVER' | 'AIM_CHARGE' | 'DISCHARGE' | 'COOLDOWN';

export class VoltaicWeaverEnemy extends BaseEnemy {
  private phase: WeaverPhase = 'HOVER';
  private phaseMs = 0;
  private lockX = 0;
  private lockY = 0;

  protected override onStunnedReset(): void {
    this.phase = 'HOVER';
    this.phaseMs = 0;
  }

  protected override resolvePoseSuffix(): string {
    if (this.phase === 'AIM_CHARGE') return 'windup_0';
    if (this.phase === 'DISCHARGE') return 'attack_0';
    const bit = (Math.floor(this.animClockMs / 160) & 1) as 0 | 1;
    return this.aggroed ? `move_${bit}` : `idle_${bit}`;
  }

  protected override stepBehavior(ctx: EnemyStepContext): void {
    const dtSec = ctx.dtSec * this.speedScale;
    const dtMs = ctx.dtMs * this.speedScale;
    const sense = evaluateEnemyPerception(
      {
        enemyX: this.x, enemyY: this.y, eyeHeightPx: 18, facing: this.facing,
        losRadiusPx: this.spec.losRadiusPx, hearingRadiusPx: this.spec.hearingRadiusPx,
        ignoresWallLos: true, alreadyAggroed: this.aggroed,
      },
      ctx.playerX, ctx.playerY, ctx.playerStealthed, ctx.solidRects
    );
    this.aggroed = sense.detected;

    // 优先与同房最近友军建立导电视觉连线
    for (let i = 0; i < ctx.roomAllies.length; i++) {
      const ally = ctx.roomAllies[i]!;
      if (ally.id !== this.id && ally.isAlive && Math.hypot(ally.x - this.x, ally.y - this.y) <= 210) {
        ctx.onDrawBeam?.('WEAVER_RAY', this.x, this.y - 20, ally.x, ally.y - 22, false);
        break;
      }
    }

    if (this.phase === 'AIM_CHARGE') {
      this.telegraph = 'RED_UNPARRIABLE';
      ctx.onDrawBeam?.('WEAVER_RAY', this.x, this.y - 20, this.lockX, this.lockY, false);
      this.phaseMs += dtMs;
      if (this.phaseMs >= this.spec.primaryWindupMs) {
        this.telegraph = 'NONE';
        ctx.onDrawBeam?.('WEAVER_RAY', this.x, this.y - 20, this.lockX, this.lockY, true);
        if (Math.hypot(ctx.playerX - this.lockX, ctx.playerY - 16 - this.lockY) <= 28) {
          const dirX: -1 | 1 = ctx.playerX >= this.x ? 1 : -1;
          ctx.onStrikePlayer(Math.round(this.spec.primaryDamage * this.damageScale), dirX, false, this);
        }
        this.phase = 'DISCHARGE';
        this.phaseMs = 150;
      }
      return;
    }

    if (this.phase === 'DISCHARGE') {
      ctx.onDrawBeam?.('WEAVER_RAY', this.x, this.y - 20, this.lockX, this.lockY, true);
      if ((this.phaseMs -= dtMs) <= 0) {
        this.phase = 'COOLDOWN';
        this.phaseMs = 1150;
      }
      return;
    }

    if (this.phase === 'COOLDOWN') {
      this.telegraph = 'NONE';
      if ((this.phaseMs -= dtMs) <= 0) this.phase = 'HOVER';
      return;
    }

    this.telegraph = 'NONE';
    if (!sense.detected) {
      this.y = this.spawnY - 48 + Math.sin(this.animClockMs * 0.003) * 8;
      return;
    }

    this.facing = sense.dirToPlayer;
    const goalX = ctx.playerX - this.facing * 84;
    const goalY = ctx.playerY - 90;
    const vx = Math.max(-this.spec.chaseSpeedPxS, Math.min(this.spec.chaseSpeedPxS, (goalX - this.x) * 2.6));
    const vy = Math.max(-this.spec.chaseSpeedPxS, Math.min(this.spec.chaseSpeedPxS, (goalY - this.y) * 2.6));
    this.x += vx * dtSec;
    this.y += vy * dtSec;

    if (sense.distPx <= 245) {
      this.lockX = ctx.playerX;
      this.lockY = ctx.playerY - 16;
      this.phase = 'AIM_CHARGE';
      this.phaseMs = 0;
      this.telegraph = 'RED_UNPARRIABLE';
    }
  }
}

type TickPhase = 'CAMOUFLAGE' | 'SCUTTLE' | 'OVERLOAD_WINDUP';

export class ClockworkTickEnemy extends BaseEnemy {
  private phase: TickPhase = 'CAMOUFLAGE';
  private phaseMs = 0;

  protected override onStunnedReset(): void {
    this.phase = 'SCUTTLE';
    this.phaseMs = 0;
  }

  protected override resolvePoseSuffix(): string {
    if (this.phase === 'CAMOUFLAGE') return 'ball_0';
    if (this.phase === 'OVERLOAD_WINDUP') {
      return (Math.floor(this.animClockMs / 65) & 1) === 0 ? 'windup_0' : 'attack_0';
    }
    const bit = (Math.floor(this.animClockMs / 100) & 1) as 0 | 1;
    return `move_${bit}`;
  }

  protected override stepBehavior(ctx: EnemyStepContext): void | 'SELF_DESTRUCTED' {
    const dtSec = ctx.dtSec * this.speedScale;
    const dtMs = ctx.dtMs * this.speedScale;

    if (this.phase === 'OVERLOAD_WINDUP') {
      this.telegraph = 'RED_UNPARRIABLE';
      this.phaseMs += dtMs;
      if (this.phaseMs >= this.spec.primaryWindupMs) {
        this.hp = 0;
        this.telegraph = 'NONE';
        if (Math.hypot(ctx.playerX - this.x, ctx.playerY - this.y) <= 68) {
          const dirX: -1 | 1 = ctx.playerX >= this.x ? 1 : -1;
          ctx.onStrikePlayer(Math.round(this.spec.primaryDamage * this.damageScale), dirX, false, this);
        }
        return 'SELF_DESTRUCTED';
      }
      return;
    }

    const sense = evaluateEnemyPerception(
      {
        enemyX: this.x, enemyY: this.y, eyeHeightPx: 14, facing: this.facing,
        losRadiusPx: this.spec.losRadiusPx, hearingRadiusPx: this.spec.hearingRadiusPx,
        ignoresWallLos: false, alreadyAggroed: this.aggroed,
      },
      ctx.playerX, ctx.playerY, ctx.playerStealthed, ctx.solidRects
    );

    if (this.phase === 'CAMOUFLAGE') {
      this.telegraph = 'NONE';
      if (sense.detected) {
        this.aggroed = true;
        this.phase = 'SCUTTLE';
      }
      return;
    }

    this.aggroed = sense.detected;
    if (!sense.detected) {
      this.phase = 'CAMOUFLAGE';
      return;
    }

    this.facing = sense.dirToPlayer;
    this.x = clampGroundX(
      this.x + this.facing * this.spec.chaseSpeedPxS * dtSec,
      this.patrolMinX - 48,
      this.patrolMaxX + 48
    );

    if (Math.abs(sense.dx) <= 48 && Math.abs(sense.dy) <= 42) {
      this.phase = 'OVERLOAD_WINDUP';
      this.phaseMs = 0;
      this.telegraph = 'RED_UNPARRIABLE';
    }
  }
}
