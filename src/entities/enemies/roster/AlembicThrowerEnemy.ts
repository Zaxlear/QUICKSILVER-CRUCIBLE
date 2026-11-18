/**
 * 炼金远程骚扰与亡语毒囊怪家族（src/entities/enemies/roster/AlembicThrowerEnemy.ts）：
 * - mob_03_alembic_thrower（烧瓶投掷工）：维持 140~220px 风筝距离，<72px 后跳翻滚拉开，
 *   520ms 黄框 [!] 高抛酸火瓶（可被玩家盾反弹回炸伤怪群，落地铺设 48px 酸火区）；
 * - mob_04_acid_spitter（矾酸囊肿虫）：免疫推动，480ms 黄框 [!] 3 连散射酸弹；
 *   濒死触发 650ms 红框 [✚!] 亡语酸爆（72px 不可招架毒雾爆炸）。
 */

import { BaseEnemy } from '../BaseEnemy';
import type { EnemyStepContext } from '../EnemyTypes';
import { clampGroundX, evaluateEnemyPerception } from '../PerceptionSensor';

type ThrowerPhase = 'KITE' | 'BACKFLIP' | 'WINDUP' | 'THROW_RECOVER';

export class AlembicThrowerEnemy extends BaseEnemy {
  private phase: ThrowerPhase = 'KITE';
  private phaseMs = 0;
  private backflipCooldownMs = 0;
  private retreatDir: -1 | 1 = -1;

  protected override onStunnedReset(): void {
    this.phase = 'KITE';
    this.phaseMs = 0;
  }

  protected override resolvePoseSuffix(): string {
    if (this.phase === 'WINDUP') return 'windup_0';
    if (this.phase === 'BACKFLIP' || this.phase === 'THROW_RECOVER') return 'attack_0';
    const bit = (Math.floor(this.animClockMs / 200) & 1) as 0 | 1;
    return this.aggroed ? `move_${bit}` : `idle_${bit}`;
  }

  protected override stepBehavior(ctx: EnemyStepContext): void {
    const dtSec = ctx.dtSec * this.speedScale;
    const dtMs = ctx.dtMs * this.speedScale;
    if (this.backflipCooldownMs > 0) this.backflipCooldownMs = Math.max(0, this.backflipCooldownMs - dtMs);

    const sense = evaluateEnemyPerception(
      {
        enemyX: this.x, enemyY: this.y, eyeHeightPx: 30, facing: this.facing,
        losRadiusPx: this.spec.losRadiusPx, hearingRadiusPx: this.spec.hearingRadiusPx,
        ignoresWallLos: false, alreadyAggroed: this.aggroed,
      },
      ctx.playerX, ctx.playerY, ctx.playerStealthed, ctx.solidRects
    );
    this.aggroed = sense.detected;

    if (this.phase === 'BACKFLIP') {
      this.telegraph = 'NONE';
      this.phaseMs += dtMs;
      this.x = clampGroundX(this.x + this.retreatDir * 320 * dtSec, this.patrolMinX, this.patrolMaxX);
      if (this.phaseMs >= 200) {
        this.phase = 'WINDUP';
        this.phaseMs = 0;
        this.telegraph = 'YELLOW_PARRIABLE';
      }
      return;
    }

    if (this.phase === 'WINDUP') {
      this.facing = sense.dirToPlayer;
      this.telegraph = 'YELLOW_PARRIABLE';
      this.phaseMs += dtMs;
      if (this.phaseMs >= this.spec.primaryWindupMs) {
        this.telegraph = 'NONE';
        const flightSec = 0.62;
        const vx = Math.max(-290, Math.min(290, sense.dx / flightSec));
        const vy = (sense.dy - 0.5 * 340 * flightSec * flightSec) / flightSec;
        ctx.onSpawnProjectile(
          this.id, this.x + this.facing * 10, this.y - 24,
          vx, Math.min(-65, vy), Math.round(this.spec.primaryDamage * this.damageScale),
          340, 'ENEMY_FLASK'
        );
        this.phase = 'THROW_RECOVER';
        this.phaseMs = 880;
      }
      return;
    }

    if (this.phase === 'THROW_RECOVER') {
      this.phaseMs -= dtMs;
      if (this.phaseMs <= 0) this.phase = 'KITE';
      return;
    }

    this.telegraph = 'NONE';
    if (!sense.detected) {
      const nextX = this.x + this.facing * this.spec.patrolSpeedPxS * dtSec;
      if (nextX <= this.patrolMinX + 2) this.facing = 1;
      else if (nextX >= this.patrolMaxX - 2) this.facing = -1;
      this.x = clampGroundX(nextX, this.patrolMinX, this.patrolMaxX);
      return;
    }

    this.facing = sense.dirToPlayer;
    const absDx = Math.abs(sense.dx);
    if (absDx < 72 && this.backflipCooldownMs <= 0) {
      this.retreatDir = (-this.facing) as -1 | 1;
      this.backflipCooldownMs = 2200;
      this.phase = 'BACKFLIP';
      this.phaseMs = 0;
    } else if (absDx < 140) {
      this.x = clampGroundX(this.x - this.facing * this.spec.chaseSpeedPxS * dtSec, this.patrolMinX, this.patrolMaxX);
    } else if (absDx > 220) {
      this.x = clampGroundX(this.x + this.facing * this.spec.chaseSpeedPxS * dtSec, this.patrolMinX, this.patrolMaxX);
    } else {
      this.phase = 'WINDUP';
      this.phaseMs = 0;
      this.telegraph = 'YELLOW_PARRIABLE';
    }
  }
}

type SpitterPhase = 'CRAWL' | 'SPIT_WINDUP' | 'COOLDOWN' | 'DEATHRATTLE_SWELL';

export class AcidSpitterEnemy extends BaseEnemy {
  private phase: SpitterPhase = 'CRAWL';
  private phaseMs = 0;
  private deathrattleTriggered = false;

  public override get isUnpushable(): boolean {
    return true;
  }

  public override get isAlive(): boolean {
    return !this.dissolving && !this.dead && (this.hp > 0 || this.phase === 'DEATHRATTLE_SWELL');
  }

  protected override interceptLethalForDeathrattle(): boolean {
    if (this.deathrattleTriggered) return false;
    this.deathrattleTriggered = true;
    this.hp = 1;
    this.stunnedMs = 0;
    this.phase = 'DEATHRATTLE_SWELL';
    this.phaseMs = 0;
    this.telegraph = 'RED_UNPARRIABLE';
    return true;
  }

  protected override onStunnedReset(): void {
    if (this.phase !== 'DEATHRATTLE_SWELL') {
      this.phase = 'CRAWL';
      this.phaseMs = 0;
    }
  }

  protected override resolvePoseSuffix(): string {
    if (this.phase === 'DEATHRATTLE_SWELL') return 'swell_0';
    if (this.phase === 'SPIT_WINDUP') return 'windup_0';
    if (this.phase === 'COOLDOWN' && this.phaseMs > 750) return 'attack_0';
    const bit = (Math.floor(this.animClockMs / 260) & 1) as 0 | 1;
    return this.aggroed ? `move_${bit}` : `idle_${bit}`;
  }

  protected override stepBehavior(ctx: EnemyStepContext): void | 'SELF_DESTRUCTED' {
    const dtSec = ctx.dtSec * this.speedScale;
    const dtMs = ctx.dtMs * this.speedScale;

    if (this.phase === 'DEATHRATTLE_SWELL') {
      this.telegraph = 'RED_UNPARRIABLE';
      this.phaseMs += ctx.dtMs;
      if (this.phaseMs >= this.spec.secondaryWindupMs) {
        this.hp = 0;
        this.telegraph = 'NONE';
        if (Math.hypot(ctx.playerX - this.x, ctx.playerY - this.y) <= 72) {
          const dirX: -1 | 1 = ctx.playerX >= this.x ? 1 : -1;
          ctx.onStrikePlayer(Math.round(this.spec.secondaryDamage * this.damageScale), dirX, false, this);
        }
        ctx.onSpawnAcidOrFireHazard(this.x, this.y, 72, true);
        return 'SELF_DESTRUCTED';
      }
      return;
    }

    const sense = evaluateEnemyPerception(
      {
        enemyX: this.x, enemyY: this.y, eyeHeightPx: 20, facing: this.facing,
        losRadiusPx: this.spec.losRadiusPx, hearingRadiusPx: this.spec.hearingRadiusPx,
        ignoresWallLos: false, alreadyAggroed: this.aggroed,
      },
      ctx.playerX, ctx.playerY, ctx.playerStealthed, ctx.solidRects
    );
    this.aggroed = sense.detected;

    if (this.phase === 'SPIT_WINDUP') {
      this.facing = sense.dirToPlayer;
      this.telegraph = 'YELLOW_PARRIABLE';
      this.phaseMs += dtMs;
      if (this.phaseMs >= this.spec.primaryWindupMs) {
        this.telegraph = 'NONE';
        const dmg = Math.round(this.spec.primaryDamage * this.damageScale);
        for (const vyOff of [-78, -24, 24]) {
          ctx.onSpawnProjectile(
            this.id, this.x + this.facing * 16, this.y - 16,
            this.facing * 235, vyOff, dmg, 120, 'ENEMY_ACID_GLOB'
          );
        }
        this.phase = 'COOLDOWN';
        this.phaseMs = 1050;
      }
      return;
    }

    if (this.phase === 'COOLDOWN') {
      this.phaseMs -= dtMs;
      if (this.phaseMs <= 0) this.phase = 'CRAWL';
      return;
    }

    this.telegraph = 'NONE';
    if (sense.detected) {
      this.facing = sense.dirToPlayer;
      if (sense.distPx <= 195) {
        this.phase = 'SPIT_WINDUP';
        this.phaseMs = 0;
        this.telegraph = 'YELLOW_PARRIABLE';
      } else {
        this.x = clampGroundX(this.x + this.facing * this.spec.chaseSpeedPxS * dtSec, this.patrolMinX, this.patrolMaxX);
      }
    } else {
      const nx = this.x + this.facing * this.spec.patrolSpeedPxS * dtSec;
      if (nx <= this.patrolMinX + 2) this.facing = 1;
      else if (nx >= this.patrolMaxX - 2) this.facing = -1;
      this.x = clampGroundX(nx, this.patrolMinX, this.patrolMaxX);
    }
  }
}
