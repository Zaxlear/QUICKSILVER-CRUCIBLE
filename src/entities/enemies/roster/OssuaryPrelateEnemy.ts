/**
 * 发条圣堂护盾祝祷与暗影瞬步刺杀家族（src/entities/enemies/roster/OssuaryPrelateEnemy.ts）：
 * - mob_09_ossuary_prelate（骸骨堂司铎）：后排常驻吟唱，为同房最多 3 名友军套水银无敌护盾并拉出清晰金色引导线
 *   （必须优先突进斩杀或击晕司铎方可破盾）；
 * - mob_10_pendulum_assassin（钟摆影刺客）：300px 穿墙感知，化黑烟瞬移至玩家背后 28px 发动
 *   360ms 黄框 [!] 瞬步十字背斩二连。
 */

import { BaseEnemy } from '../BaseEnemy';
import type { EnemyStepContext } from '../EnemyTypes';
import {
  clampGroundX,
  evaluateEnemyPerception,
  solveBehindPlayerTeleport,
} from '../PerceptionSensor';

type PrelatePhase = 'CHANT_WARD' | 'SELF_DEFENSE_WINDUP' | 'RECOVER';

export class OssuaryPrelateEnemy extends BaseEnemy {
  private phase: PrelatePhase = 'CHANT_WARD';
  private phaseMs = 0;
  private activeWardCount = 0;

  public get shieldedAllyCount(): number {
    return this.activeWardCount;
  }

  protected override onStunnedReset(): void {
    this.phase = 'CHANT_WARD';
    this.phaseMs = 0;
    this.activeWardCount = 0;
  }

  protected override resolvePoseSuffix(): string {
    if (this.phase === 'SELF_DEFENSE_WINDUP') return 'windup_0';
    if (this.activeWardCount > 0) return 'chant_0';
    const bit = (Math.floor(this.animClockMs / 230) & 1) as 0 | 1;
    return this.aggroed ? `move_${bit}` : `idle_${bit}`;
  }

  protected override stepBehavior(ctx: EnemyStepContext): void {
    const dtSec = ctx.dtSec * this.speedScale;
    const dtMs = ctx.dtMs * this.speedScale;
    const sense = evaluateEnemyPerception(
      {
        enemyX: this.x, enemyY: this.y, eyeHeightPx: 42, facing: this.facing,
        losRadiusPx: this.spec.losRadiusPx, hearingRadiusPx: this.spec.hearingRadiusPx,
        ignoresWallLos: true, alreadyAggroed: this.aggroed,
      },
      ctx.playerX, ctx.playerY, ctx.playerStealthed, ctx.solidRects
    );
    this.aggroed = sense.detected;
    if (sense.detected) this.facing = sense.dirToPlayer;

    // 为同房间最多 3 名非司铎存活友军施加水银无敌护盾并拉出金色引导光束
    this.activeWardCount = 0;
    for (let i = 0; i < ctx.roomAllies.length && this.activeWardCount < 3; i++) {
      const ally = ctx.roomAllies[i]!;
      if (
        ally.id !== this.id &&
        ally.isAlive &&
        ally.speciesId !== 'mob_09_ossuary_prelate' &&
        ally.roomId === this.roomId
      ) {
        ally.isShieldedByPrelate = true;
        this.activeWardCount += 1;
        ctx.onDrawBeam?.(
          'PRELATE_TETHER',
          this.x + this.facing * 10,
          this.y - 46,
          ally.x,
          ally.y - ally.spec.colliderHeightPx * 0.55,
          true
        );
      }
    }

    if (this.phase === 'SELF_DEFENSE_WINDUP') {
      this.telegraph = 'YELLOW_PARRIABLE';
      if ((this.phaseMs += dtMs) >= this.spec.primaryWindupMs) {
        this.telegraph = 'NONE';
        if (Math.hypot(ctx.playerX - this.x, ctx.playerY - this.y) <= 72) {
          ctx.onStrikePlayer(Math.round(this.spec.primaryDamage * this.damageScale), this.facing, true, this);
        }
        this.phase = 'RECOVER';
        this.phaseMs = 800;
      }
      return;
    }

    if (this.phase === 'RECOVER') {
      this.telegraph = 'NONE';
      if ((this.phaseMs -= dtMs) <= 0) this.phase = 'CHANT_WARD';
      return;
    }

    this.telegraph = 'NONE';
    if (!sense.detected) return;

    // 绝不主动贴脸：玩家靠近 <135px 时持续向后拉扯躲在重甲怪身后
    if (Math.abs(sense.dx) < 135) {
      this.x = clampGroundX(this.x - this.facing * this.spec.chaseSpeedPxS * dtSec, this.patrolMinX, this.patrolMaxX);
      if (this.activeWardCount === 0 && Math.abs(sense.dx) <= 58 && Math.abs(sense.dy) <= 44) {
        this.phase = 'SELF_DEFENSE_WINDUP';
        this.phaseMs = 0;
        this.telegraph = 'YELLOW_PARRIABLE';
      }
    }
  }
}

type AssassinPhase = 'PROWL' | 'SMOKE_VANISH' | 'AMBUSH_WINDUP' | 'CROSS_SLASH_1' | 'CROSS_SLASH_2' | 'COOLDOWN';

export class PendulumAssassinEnemy extends BaseEnemy {
  private phase: AssassinPhase = 'PROWL';
  private phaseMs = 0;
  private teleportCdMs = 0;
  private slashHit = false;

  protected override onStunnedReset(): void {
    this.phase = 'PROWL';
    this.phaseMs = 0;
  }

  protected override resolvePoseSuffix(): string {
    if (this.phase === 'SMOKE_VANISH') return 'smoke_0';
    if (this.phase === 'AMBUSH_WINDUP') return 'windup_0';
    if (this.phase === 'CROSS_SLASH_1' || this.phase === 'CROSS_SLASH_2') return 'attack_0';
    const bit = (Math.floor(this.animClockMs / 150) & 1) as 0 | 1;
    return this.aggroed ? `move_${bit}` : `idle_${bit}`;
  }

  protected override stepBehavior(ctx: EnemyStepContext): void {
    const dtSec = ctx.dtSec * this.speedScale;
    const dtMs = ctx.dtMs * this.speedScale;
    if (this.teleportCdMs > 0) this.teleportCdMs = Math.max(0, this.teleportCdMs - dtMs);

    const sense = evaluateEnemyPerception(
      {
        enemyX: this.x, enemyY: this.y, eyeHeightPx: 32, facing: this.facing,
        losRadiusPx: this.spec.losRadiusPx, hearingRadiusPx: this.spec.hearingRadiusPx,
        ignoresWallLos: true, alreadyAggroed: this.aggroed,
      },
      ctx.playerX, ctx.playerY, ctx.playerStealthed, ctx.solidRects
    );
    this.aggroed = sense.detected;

    if (this.phase === 'SMOKE_VANISH') {
      this.telegraph = 'NONE';
      if ((this.phaseMs += dtMs) >= 130) {
        const dest = solveBehindPlayerTeleport(ctx.playerX, ctx.playerY, ctx.playerFacing, 28, ctx.solidRects);
        this.x = dest.x;
        this.y = dest.y;
        this.patrolMinX = Math.min(this.patrolMinX, dest.x - 96);
        this.patrolMaxX = Math.max(this.patrolMaxX, dest.x + 96);
        this.facing = ctx.playerX >= this.x ? 1 : -1;
        this.phase = 'AMBUSH_WINDUP';
        this.phaseMs = 0;
        this.telegraph = 'YELLOW_PARRIABLE';
      }
      return;
    }

    if (this.phase === 'AMBUSH_WINDUP') {
      this.telegraph = 'YELLOW_PARRIABLE';
      if ((this.phaseMs += dtMs) >= this.spec.primaryWindupMs) {
        this.telegraph = 'NONE';
        this.phase = 'CROSS_SLASH_1';
        this.phaseMs = 0;
        this.slashHit = false;
      }
      return;
    }

    if (this.phase === 'CROSS_SLASH_1' || this.phase === 'CROSS_SLASH_2') {
      this.phaseMs += dtMs;
      this.x = clampGroundX(this.x + this.facing * 180 * dtSec, this.patrolMinX, this.patrolMaxX);
      if (!this.slashHit && Math.abs(ctx.playerX - this.x) <= 42 && Math.abs(ctx.playerY - this.y) <= 38) {
        this.slashHit = true;
        const dmg = this.phase === 'CROSS_SLASH_1' ? this.spec.primaryDamage : this.spec.secondaryDamage;
        ctx.onStrikePlayer(Math.round(dmg * this.damageScale), this.facing, true, this);
      }
      if (this.phaseMs >= 85) {
        if (this.phase === 'CROSS_SLASH_1') {
          this.phase = 'CROSS_SLASH_2';
          this.phaseMs = 0;
          this.slashHit = false;
        } else {
          this.phase = 'COOLDOWN';
          this.phaseMs = 650;
        }
      }
      return;
    }

    if (this.phase === 'COOLDOWN') {
      if ((this.phaseMs -= dtMs) <= 0) this.phase = 'PROWL';
      return;
    }

    this.telegraph = 'NONE';
    if (!sense.detected) {
      this.stepGroundMove(ctx, this.facing * this.spec.patrolSpeedPxS, dtSec, true);
      return;
    }

    if (this.teleportCdMs <= 0) {
      this.teleportCdMs = 3100;
      this.phase = 'SMOKE_VANISH';
      this.phaseMs = 0;
    } else {
      this.facing = sense.dirToPlayer;
      if (Math.abs(sense.dx) <= 40 && Math.abs(sense.dy) <= 38) {
        this.phase = 'AMBUSH_WINDUP';
        this.phaseMs = 0;
        this.telegraph = 'YELLOW_PARRIABLE';
      } else {
        this.stepGroundMove(ctx, this.facing * this.spec.chaseSpeedPxS, dtSec, false);
      }
    }
  }
}
