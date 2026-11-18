/**
 * 第一层主力近战怪家族（src/entities/enemies/roster/SlagHuskEnemy.ts）：
 * - mob_01_slag_husk（矿渣行尸）：低速巡逻，发现玩家后 420ms 黄框 [!] 前扑镐击（36px 突进）；
 * - mob_02_frenzied_miner（狂暴煅烧矿工）：HP < 60% 或目睹同房友军死亡时冒红烟进入狂暴（195 px/s），
 *   施放 350ms 黄框 [!] 二连疯镐斩（间隔 180ms，两段皆可连续盾反）。
 */

import { BaseEnemy } from '../BaseEnemy';
import type { EnemyStepContext } from '../EnemyTypes';
import { clampGroundX, evaluateEnemyPerception } from '../PerceptionSensor';

type HuskPhase = 'PATROL' | 'WINDUP' | 'LUNGE' | 'RECOVER';

export class SlagHuskEnemy extends BaseEnemy {
  private phase: HuskPhase = 'PATROL';
  private phaseMs = 0;
  private hitDelivered = false;

  protected override onStunnedReset(): void {
    this.phase = 'PATROL';
    this.phaseMs = 0;
  }

  protected override resolvePoseSuffix(): string {
    if (this.phase === 'WINDUP') return 'windup_0';
    if (this.phase === 'LUNGE') return 'attack_0';
    const bit = (Math.floor(this.animClockMs / 210) & 1) as 0 | 1;
    return this.aggroed ? `move_${bit}` : `idle_${bit}`;
  }

  protected override stepBehavior(ctx: EnemyStepContext): void {
    const dtSec = ctx.dtSec * this.speedScale;
    const dtMs = ctx.dtMs * this.speedScale;
    const sense = evaluateEnemyPerception(
      {
        enemyX: this.x, enemyY: this.y, eyeHeightPx: 30, facing: this.facing,
        losRadiusPx: this.spec.losRadiusPx, hearingRadiusPx: this.spec.hearingRadiusPx,
        ignoresWallLos: false, alreadyAggroed: this.aggroed,
      },
      ctx.playerX, ctx.playerY, ctx.playerStealthed, ctx.solidRects
    );
    this.aggroed = sense.detected;

    if (this.phase === 'PATROL') {
      this.telegraph = 'NONE';
      if (sense.detected) {
        this.facing = sense.dirToPlayer;
        if (Math.abs(sense.dx) <= 46 && Math.abs(sense.dy) <= 44) {
          this.phase = 'WINDUP';
          this.phaseMs = 0;
          this.hitDelivered = false;
          this.telegraph = 'YELLOW_PARRIABLE';
          return;
        }
        this.x = clampGroundX(this.x + this.facing * this.spec.chaseSpeedPxS * dtSec, this.patrolMinX, this.patrolMaxX);
      } else {
        const nextX = this.x + this.facing * this.spec.patrolSpeedPxS * dtSec;
        if (nextX <= this.patrolMinX + 2) this.facing = 1;
        else if (nextX >= this.patrolMaxX - 2) this.facing = -1;
        this.x = clampGroundX(nextX, this.patrolMinX, this.patrolMaxX);
      }
      return;
    }

    if (this.phase === 'WINDUP') {
      this.telegraph = 'YELLOW_PARRIABLE';
      this.phaseMs += dtMs;
      if (this.phaseMs >= this.spec.primaryWindupMs) {
        this.phase = 'LUNGE';
        this.phaseMs = 0;
        this.telegraph = 'NONE';
      }
      return;
    }

    if (this.phase === 'LUNGE') {
      this.phaseMs += dtMs;
      const lungeSpeed = 36 / 0.095;
      this.x = clampGroundX(this.x + this.facing * lungeSpeed * dtSec, this.patrolMinX, this.patrolMaxX);
      if (!this.hitDelivered && Math.abs(ctx.playerX - this.x) <= 38 && Math.abs(ctx.playerY - this.y) <= 36) {
        this.hitDelivered = true;
        ctx.onStrikePlayer(Math.round(this.spec.primaryDamage * this.damageScale), this.facing, true, this);
      }
      if (this.phaseMs >= 95) {
        this.phase = 'RECOVER';
        this.phaseMs = 500;
      }
      return;
    }

    this.phaseMs -= dtMs;
    if (this.phaseMs <= 0) this.phase = 'PATROL';
  }
}

type MinerPhase = 'PATROL' | 'WINDUP_1' | 'SLASH_1' | 'WINDUP_2' | 'SLASH_2' | 'RECOVER';

export class FrenziedMinerEnemy extends BaseEnemy {
  public isEnraged = false;
  private phase: MinerPhase = 'PATROL';
  private phaseMs = 0;
  private hitDelivered = false;

  public override onAllyKilledInRoom(): void {
    if (this.isAlive) {
      this.isEnraged = true;
      this.aggroed = true;
    }
  }

  protected override onStunnedReset(): void {
    this.phase = 'PATROL';
    this.phaseMs = 0;
  }

  protected override resolvePoseSuffix(): string {
    if (this.phase === 'WINDUP_1' || this.phase === 'WINDUP_2') return 'windup_0';
    if (this.phase === 'SLASH_1' || this.phase === 'SLASH_2') return 'attack_0';
    const rate = this.isEnraged ? 110 : 190;
    const bit = (Math.floor(this.animClockMs / rate) & 1) as 0 | 1;
    return this.aggroed ? `move_${bit}` : `idle_${bit}`;
  }

  protected override stepBehavior(ctx: EnemyStepContext): void {
    if (!this.isEnraged && this.hp < this.maxHp * 0.6) {
      this.isEnraged = true;
    }
    const dtSec = ctx.dtSec * this.speedScale;
    const dtMs = ctx.dtMs * this.speedScale;
    const sense = evaluateEnemyPerception(
      {
        enemyX: this.x, enemyY: this.y, eyeHeightPx: 32, facing: this.facing,
        losRadiusPx: this.spec.losRadiusPx, hearingRadiusPx: this.spec.hearingRadiusPx,
        ignoresWallLos: false, alreadyAggroed: this.aggroed,
      },
      ctx.playerX, ctx.playerY, ctx.playerStealthed, ctx.solidRects
    );
    this.aggroed = sense.detected;

    const minBound = this.isEnraged ? this.patrolMinX - 40 : this.patrolMinX;
    const maxBound = this.isEnraged ? this.patrolMaxX + 40 : this.patrolMaxX;

    if (this.phase === 'PATROL') {
      this.telegraph = 'NONE';
      if (sense.detected) {
        this.facing = sense.dirToPlayer;
        if (Math.abs(sense.dx) <= 52 && Math.abs(sense.dy) <= 44) {
          this.phase = 'WINDUP_1';
          this.phaseMs = 0;
          this.hitDelivered = false;
          this.telegraph = 'YELLOW_PARRIABLE';
          return;
        }
        const chaseV = this.isEnraged ? 195 : this.spec.chaseSpeedPxS;
        this.x = clampGroundX(this.x + this.facing * chaseV * dtSec, minBound, maxBound);
      } else {
        const nextX = this.x + this.facing * this.spec.patrolSpeedPxS * dtSec;
        if (nextX <= this.patrolMinX + 2) this.facing = 1;
        else if (nextX >= this.patrolMaxX - 2) this.facing = -1;
        this.x = clampGroundX(nextX, this.patrolMinX, this.patrolMaxX);
      }
      return;
    }

    if (this.phase === 'WINDUP_1' || this.phase === 'WINDUP_2') {
      this.telegraph = 'YELLOW_PARRIABLE';
      this.phaseMs += dtMs;
      const limit = this.phase === 'WINDUP_1' ? this.spec.primaryWindupMs : this.spec.secondaryWindupMs;
      if (this.phaseMs >= limit) {
        this.facing = sense.dirToPlayer;
        this.phase = this.phase === 'WINDUP_1' ? 'SLASH_1' : 'SLASH_2';
        this.phaseMs = 0;
        this.hitDelivered = false;
        this.telegraph = 'NONE';
      }
      return;
    }

    if (this.phase === 'SLASH_1' || this.phase === 'SLASH_2') {
      this.phaseMs += dtMs;
      this.x = clampGroundX(this.x + this.facing * 260 * dtSec, minBound, maxBound);
      if (!this.hitDelivered && Math.abs(ctx.playerX - this.x) <= 42 && Math.abs(ctx.playerY - this.y) <= 38) {
        this.hitDelivered = true;
        const baseDmg = this.phase === 'SLASH_1' ? this.spec.primaryDamage : this.spec.secondaryDamage;
        ctx.onStrikePlayer(Math.round(baseDmg * this.damageScale), this.facing, true, this);
      }
      if (this.phaseMs >= 90) {
        if (this.phase === 'SLASH_1') {
          this.phase = 'WINDUP_2';
          this.phaseMs = 0;
          this.telegraph = 'YELLOW_PARRIABLE';
        } else {
          this.phase = 'RECOVER';
          this.phaseMs = this.isEnraged ? 380 : 540;
        }
      }
      return;
    }

    this.phaseMs -= dtMs;
    if (this.phaseMs <= 0) this.phase = 'PATROL';
  }
}
