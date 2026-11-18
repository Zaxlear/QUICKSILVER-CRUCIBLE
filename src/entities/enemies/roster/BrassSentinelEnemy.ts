/**
 * 重甲壁垒与霸体链锤处刑家族（src/entities/enemies/roster/BrassSentinelEnemy.ts）：
 * - mob_05_brass_sentinel（黄铜持盾卫兵）：常驻正面 180° 塔盾免疫轻近战与非穿透箭矢，
 *   750ms 迟缓转身露背窗口，550ms 黄框 [!] 蒸汽推进盾冲 128px（被盾反直接眩晕 2,500ms）；
 * - mob_06_flail_executor（链锤处刑官）：出招自带中度霸体，交替释放 500ms 黄框 [!] 横扫链锤（104px）
 *   与 750ms 红框 [✚!] 裂地重砸（延伸 120px 地面震波，需跳跃躲避）。
 */

import { BaseEnemy } from '../BaseEnemy';
import type { EnemyStepContext } from '../EnemyTypes';
import { clampGroundX, evaluateEnemyPerception } from '../PerceptionSensor';

type SentinelPhase = 'MARCH' | 'WINDUP' | 'CHARGE' | 'RECOVER';

export class BrassSentinelEnemy extends BaseEnemy {
  private phase: SentinelPhase = 'MARCH';
  private phaseMs = 0;
  private turnDelayMs = 0;
  private bashHit = false;

  public override get hasFrontShield(): boolean {
    return this.isAlive && !this.isStunned;
  }

  protected override onStunnedReset(): void {
    this.phase = 'MARCH';
    this.phaseMs = 0;
    this.turnDelayMs = 0;
  }

  protected override resolvePoseSuffix(): string {
    if (this.phase === 'WINDUP') return 'windup_0';
    if (this.phase === 'CHARGE') return 'attack_0';
    const bit = (Math.floor(this.animClockMs / 250) & 1) as 0 | 1;
    return this.aggroed ? `move_${bit}` : `idle_${bit}`;
  }

  protected override stepBehavior(ctx: EnemyStepContext): void {
    const dtSec = ctx.dtSec * this.speedScale;
    const dtMs = ctx.dtMs * this.speedScale;
    const sense = evaluateEnemyPerception(
      {
        enemyX: this.x, enemyY: this.y, eyeHeightPx: 40, facing: this.facing,
        losRadiusPx: this.spec.losRadiusPx, hearingRadiusPx: this.spec.hearingRadiusPx,
        ignoresWallLos: false, alreadyAggroed: this.aggroed,
      },
      ctx.playerX, ctx.playerY, ctx.playerStealthed, ctx.solidRects
    );
    this.aggroed = sense.detected;

    if (this.phase === 'MARCH') {
      this.telegraph = 'NONE';
      if (!sense.detected) {
        const nx = this.x + this.facing * this.spec.patrolSpeedPxS * dtSec;
        if (nx <= this.patrolMinX + 2) this.facing = 1;
        else if (nx >= this.patrolMaxX - 2) this.facing = -1;
        this.x = clampGroundX(nx, this.patrolMinX, this.patrolMaxX);
        return;
      }

      if (sense.dirToPlayer !== this.facing) {
        this.turnDelayMs += dtMs;
        if (this.turnDelayMs >= 750) {
          this.facing = sense.dirToPlayer;
          this.turnDelayMs = 0;
        }
        return;
      }
      this.turnDelayMs = 0;

      if (Math.abs(sense.dx) <= 96 && Math.abs(sense.dy) <= 46) {
        this.phase = 'WINDUP';
        this.phaseMs = 0;
        this.bashHit = false;
        this.telegraph = 'YELLOW_PARRIABLE';
      } else {
        this.x = clampGroundX(this.x + this.facing * this.spec.chaseSpeedPxS * dtSec, this.patrolMinX, this.patrolMaxX);
      }
      return;
    }

    if (this.phase === 'WINDUP') {
      this.telegraph = 'YELLOW_PARRIABLE';
      this.phaseMs += dtMs;
      if (this.phaseMs >= this.spec.primaryWindupMs) {
        this.phase = 'CHARGE';
        this.phaseMs = 0;
        this.telegraph = 'NONE';
      }
      return;
    }

    if (this.phase === 'CHARGE') {
      this.phaseMs += dtMs;
      const speed = 128 / 0.32; // 400 px/s -> 128px over 320ms
      this.x = clampGroundX(this.x + this.facing * speed * dtSec, this.patrolMinX, this.patrolMaxX);
      if (!this.bashHit && Math.abs(ctx.playerX - this.x) <= 44 && Math.abs(ctx.playerY - this.y) <= 42) {
        this.bashHit = true;
        ctx.onStrikePlayer(Math.round(this.spec.primaryDamage * this.damageScale), this.facing, true, this);
      }
      if (this.phaseMs >= 320) {
        this.phase = 'RECOVER';
        this.phaseMs = 720;
      }
      return;
    }

    this.phaseMs -= dtMs;
    if (this.phaseMs <= 0) this.phase = 'MARCH';
  }
}

type ExecutorPhase = 'STALK' | 'SWEEP_WINDUP' | 'SWEEP_STRIKE' | 'SLAM_WINDUP' | 'SLAM_WAVE' | 'RECOVER';

export class FlailExecutorEnemy extends BaseEnemy {
  private phase: ExecutorPhase = 'STALK';
  private phaseMs = 0;
  private useSlamNext = false;
  private strikeHit = false;

  protected override get poiseArmorFloor(): number {
    return this.phase === 'STALK' || this.phase === 'RECOVER' ? 0 : 1.05;
  }

  protected override onStunnedReset(): void {
    this.phase = 'STALK';
    this.phaseMs = 0;
  }

  protected override resolvePoseSuffix(): string {
    if (this.phase === 'SWEEP_WINDUP' || this.phase === 'SLAM_WINDUP') return 'windup_0';
    if (this.phase === 'SWEEP_STRIKE' || this.phase === 'SLAM_WAVE') return 'attack_0';
    const bit = (Math.floor(this.animClockMs / 240) & 1) as 0 | 1;
    return this.aggroed ? `move_${bit}` : `idle_${bit}`;
  }

  protected override stepBehavior(ctx: EnemyStepContext): void {
    const dtSec = ctx.dtSec * this.speedScale;
    const dtMs = ctx.dtMs * this.speedScale;
    const sense = evaluateEnemyPerception(
      {
        enemyX: this.x, enemyY: this.y, eyeHeightPx: 48, facing: this.facing,
        losRadiusPx: this.spec.losRadiusPx, hearingRadiusPx: this.spec.hearingRadiusPx,
        ignoresWallLos: false, alreadyAggroed: this.aggroed,
      },
      ctx.playerX, ctx.playerY, ctx.playerStealthed, ctx.solidRects
    );
    this.aggroed = sense.detected;

    if (this.phase === 'STALK') {
      this.telegraph = 'NONE';
      if (!sense.detected) {
        const nx = this.x + this.facing * this.spec.patrolSpeedPxS * dtSec;
        if (nx <= this.patrolMinX + 2) this.facing = 1;
        else if (nx >= this.patrolMaxX - 2) this.facing = -1;
        this.x = clampGroundX(nx, this.patrolMinX, this.patrolMaxX);
        return;
      }
      this.facing = sense.dirToPlayer;
      if (Math.abs(sense.dx) <= 108 && Math.abs(sense.dy) <= 52) {
        this.strikeHit = false;
        this.phaseMs = 0;
        if (this.useSlamNext) {
          this.phase = 'SLAM_WINDUP';
          this.telegraph = 'RED_UNPARRIABLE';
        } else {
          this.phase = 'SWEEP_WINDUP';
          this.telegraph = 'YELLOW_PARRIABLE';
        }
        this.useSlamNext = !this.useSlamNext;
      } else {
        this.x = clampGroundX(this.x + this.facing * this.spec.chaseSpeedPxS * dtSec, this.patrolMinX, this.patrolMaxX);
      }
      return;
    }

    if (this.phase === 'SWEEP_WINDUP') {
      this.telegraph = 'YELLOW_PARRIABLE';
      if ((this.phaseMs += dtMs) >= this.spec.primaryWindupMs) {
        this.phase = 'SWEEP_STRIKE';
        this.phaseMs = 0;
        this.telegraph = 'NONE';
      }
      return;
    }

    if (this.phase === 'SWEEP_STRIKE') {
      this.phaseMs += dtMs;
      const relX = (ctx.playerX - this.x) * this.facing;
      if (!this.strikeHit && relX >= -12 && relX <= 104 && Math.abs(ctx.playerY - this.y) <= 44) {
        this.strikeHit = true;
        ctx.onStrikePlayer(Math.round(this.spec.primaryDamage * this.damageScale), this.facing, true, this);
      }
      if (this.phaseMs >= 110) {
        this.phase = 'RECOVER';
        this.phaseMs = 680;
      }
      return;
    }

    if (this.phase === 'SLAM_WINDUP') {
      this.telegraph = 'RED_UNPARRIABLE';
      if ((this.phaseMs += dtMs) >= this.spec.secondaryWindupMs) {
        this.phase = 'SLAM_WAVE';
        this.phaseMs = 0;
        this.telegraph = 'NONE';
      }
      return;
    }

    if (this.phase === 'SLAM_WAVE') {
      this.phaseMs += dtMs;
      const waveX = this.x + this.facing * Math.min(120, (this.phaseMs / 240) * 120);
      ctx.onDrawGroundEffect?.('EXECUTOR_WAVE', waveX, this.y);
      const relX = (ctx.playerX - this.x) * this.facing;
      // 震地波高度仅 26px，起跳滞空即可无伤规避！
      if (!this.strikeHit && relX >= 0 && relX <= 120 && Math.abs(ctx.playerY - this.y) <= 26) {
        this.strikeHit = true;
        ctx.onStrikePlayer(Math.round(this.spec.secondaryDamage * this.damageScale), this.facing, false, this);
      }
      if (this.phaseMs >= 240) {
        this.phase = 'RECOVER';
        this.phaseMs = 820;
      }
      return;
    }

    this.phaseMs -= dtMs;
    if (this.phaseMs <= 0) this.phase = 'STALK';
  }
}
