/**
 * 星界熔炉之巅精锐守卫家族（src/entities/enemies/roster/MercuryStalkerEnemy.ts）：
 * - mob_11_mercury_stalker（水银拟态猎手）：平时融化为银色水银镜面（免疫一切远程投射物），
 *   接近暴起释放 ① 380ms 黄框 [!] 液态扑咬 与 ② 潜地 500ms 红框 [✚!] 水银尖刺地突；
 * - mob_12_astral_inquisitor（星界审判官）：半空悬浮操控三枚星环，交替释放
 *   ① 440ms 黄框 [!] 三连星芒飞刃（可盾反）与 ② 680ms 红框 [✚!] 重力坍缩禁锢阵（定身 1.1s）。
 */

import { BaseEnemy } from '../BaseEnemy';
import type { EnemyStepContext } from '../EnemyTypes';
import { clampGroundX, evaluateEnemyPerception } from '../PerceptionSensor';

type StalkerPhase = 'PUDDLE_LURK' | 'CHASE' | 'POUNCE_WINDUP' | 'POUNCE_BITE' | 'SPIKE_SUBMERGE' | 'SPIKE_ERUPT' | 'RECOVER';

export class MercuryStalkerEnemy extends BaseEnemy {
  private phase: StalkerPhase = 'PUDDLE_LURK';
  private phaseMs = 0;
  private useSpikeNext = false;
  private spikeTargetX = 0;
  private spikeTargetY = 0;
  private strikeHit = false;

  public override get isUntargetableByRanged(): boolean {
    return this.phase === 'PUDDLE_LURK' || this.phase === 'SPIKE_SUBMERGE';
  }

  protected override onStunnedReset(): void {
    this.phase = 'CHASE';
    this.phaseMs = 0;
  }

  protected override resolvePoseSuffix(): string {
    if (this.phase === 'PUDDLE_LURK' || this.phase === 'SPIKE_SUBMERGE') return 'puddle_0';
    if (this.phase === 'POUNCE_WINDUP') return 'windup_0';
    if (this.phase === 'POUNCE_BITE' || this.phase === 'SPIKE_ERUPT') return 'attack_0';
    const bit = (Math.floor(this.animClockMs / 135) & 1) as 0 | 1;
    return `move_${bit}`;
  }

  protected override stepBehavior(ctx: EnemyStepContext): void {
    const dtSec = ctx.dtSec * this.speedScale;
    const dtMs = ctx.dtMs * this.speedScale;
    const sense = evaluateEnemyPerception(
      {
        enemyX: this.x, enemyY: this.y, eyeHeightPx: 18, facing: this.facing,
        losRadiusPx: this.spec.losRadiusPx, hearingRadiusPx: this.spec.hearingRadiusPx,
        ignoresWallLos: false, alreadyAggroed: this.aggroed,
      },
      ctx.playerX, ctx.playerY, ctx.playerStealthed, ctx.solidRects
    );

    if (this.phase === 'PUDDLE_LURK') {
      this.telegraph = 'NONE';
      if ((sense.detected && sense.distPx <= 165) || this.hp < this.maxHp) {
        this.aggroed = true;
        this.facing = sense.dirToPlayer;
        this.useSpikeNext = true;
        this.phase = 'POUNCE_WINDUP';
        this.phaseMs = 0;
        this.telegraph = 'YELLOW_PARRIABLE';
      }
      return;
    }

    this.aggroed = sense.detected;

    if (this.phase === 'POUNCE_WINDUP') {
      this.telegraph = 'YELLOW_PARRIABLE';
      if ((this.phaseMs += dtMs) >= this.spec.primaryWindupMs) {
        this.telegraph = 'NONE';
        this.phase = 'POUNCE_BITE';
        this.phaseMs = 0;
        this.strikeHit = false;
      }
      return;
    }

    if (this.phase === 'POUNCE_BITE') {
      this.phaseMs += dtMs;
      this.x = clampGroundX(this.x + this.facing * 310 * dtSec, this.patrolMinX, this.patrolMaxX);
      if (!this.strikeHit && Math.abs(ctx.playerX - this.x) <= 42 && Math.abs(ctx.playerY - this.y) <= 36) {
        this.strikeHit = true;
        ctx.onStrikePlayer(Math.round(this.spec.primaryDamage * this.damageScale), this.facing, true, this);
      }
      if (this.phaseMs >= 160) {
        this.phase = 'RECOVER';
        this.phaseMs = 520;
      }
      return;
    }

    if (this.phase === 'SPIKE_SUBMERGE') {
      this.telegraph = 'RED_UNPARRIABLE';
      ctx.onDrawGroundEffect?.('SPIKE_WARN', this.spikeTargetX, this.spikeTargetY);
      if ((this.phaseMs += dtMs) >= this.spec.secondaryWindupMs) {
        this.telegraph = 'NONE';
        this.x = clampGroundX(this.spikeTargetX, this.patrolMinX, this.patrolMaxX);
        this.phase = 'SPIKE_ERUPT';
        this.phaseMs = 0;
        this.strikeHit = false;
        ctx.onDrawGroundEffect?.('SPIKE_ERUPT', this.spikeTargetX, this.spikeTargetY);
      }
      return;
    }

    if (this.phase === 'SPIKE_ERUPT') {
      this.phaseMs += dtMs;
      ctx.onDrawGroundEffect?.('SPIKE_ERUPT', this.spikeTargetX, this.spikeTargetY);
      if (!this.strikeHit && Math.abs(ctx.playerX - this.spikeTargetX) <= 28 && Math.abs(ctx.playerY - this.spikeTargetY) <= 42) {
        this.strikeHit = true;
        ctx.onStrikePlayer(Math.round(this.spec.secondaryDamage * this.damageScale), this.facing, false, this);
      }
      if (this.phaseMs >= 180) {
        this.phase = 'RECOVER';
        this.phaseMs = 560;
      }
      return;
    }

    if (this.phase === 'RECOVER') {
      if ((this.phaseMs -= dtMs) <= 0) this.phase = sense.detected ? 'CHASE' : 'PUDDLE_LURK';
      return;
    }

    this.telegraph = 'NONE';
    if (!sense.detected) {
      this.phase = 'PUDDLE_LURK';
      return;
    }

    this.facing = sense.dirToPlayer;
    if (this.useSpikeNext && sense.distPx <= 220) {
      this.useSpikeNext = false;
      this.spikeTargetX = ctx.playerX;
      this.spikeTargetY = ctx.playerY;
      this.phase = 'SPIKE_SUBMERGE';
      this.phaseMs = 0;
      this.telegraph = 'RED_UNPARRIABLE';
    } else if (Math.abs(sense.dx) <= 78 && Math.abs(sense.dy) <= 42) {
      this.useSpikeNext = true;
      this.phase = 'POUNCE_WINDUP';
      this.phaseMs = 0;
      this.telegraph = 'YELLOW_PARRIABLE';
    } else {
      this.x = clampGroundX(this.x + this.facing * this.spec.chaseSpeedPxS * dtSec, this.patrolMinX, this.patrolMaxX);
    }
  }
}

type InquisitorPhase = 'FLOAT' | 'BLADES_WINDUP' | 'SIGIL_WINDUP' | 'COOLDOWN';

export class AstralInquisitorEnemy extends BaseEnemy {
  private phase: InquisitorPhase = 'FLOAT';
  private phaseMs = 0;
  private castSigilNext = false;
  private sigilX = 0;
  private sigilY = 0;

  protected override onStunnedReset(): void {
    this.phase = 'FLOAT';
    this.phaseMs = 0;
  }

  protected override resolvePoseSuffix(): string {
    if (this.phase === 'BLADES_WINDUP' || this.phase === 'SIGIL_WINDUP') return 'windup_0';
    if (this.phase === 'COOLDOWN' && this.phaseMs > 620) return 'attack_0';
    const bit = (Math.floor(this.animClockMs / 190) & 1) as 0 | 1;
    return this.aggroed ? `move_${bit}` : `idle_${bit}`;
  }

  protected override stepBehavior(ctx: EnemyStepContext): void {
    const dtSec = ctx.dtSec * this.speedScale;
    const dtMs = ctx.dtMs * this.speedScale;
    this.y = this.spawnY - 12 + Math.sin(this.animClockMs * 0.0035) * 6;

    const sense = evaluateEnemyPerception(
      { enemyX: this.x, enemyY: this.y, eyeHeightPx: 48, facing: this.facing, losRadiusPx: this.spec.losRadiusPx, hearingRadiusPx: this.spec.hearingRadiusPx, ignoresWallLos: true, alreadyAggroed: this.aggroed },
      ctx.playerX, ctx.playerY, ctx.playerStealthed, ctx.solidRects
    );
    this.aggroed = sense.detected;

    if (this.phase === 'BLADES_WINDUP') {
      this.facing = sense.dirToPlayer;
      this.telegraph = 'YELLOW_PARRIABLE';
      if ((this.phaseMs += dtMs) >= this.spec.primaryWindupMs) {
        this.telegraph = 'NONE';
        const baseRad = Math.atan2(ctx.playerY - 18 - (this.y - 34), ctx.playerX - this.x);
        const dmg = Math.round(this.spec.primaryDamage * this.damageScale);
        for (const degOff of [-10, 0, 10]) {
          const ang = baseRad + (degOff * Math.PI) / 180;
          ctx.onSpawnProjectile(this.id, this.x + this.facing * 12, this.y - 34, Math.cos(ang) * 410, Math.sin(ang) * 410, dmg, 0, 'ENEMY_ASTRAL_BLADE');
        }
        this.phase = 'COOLDOWN';
        this.phaseMs = 920;
      }
      return;
    }

    if (this.phase === 'SIGIL_WINDUP') {
      this.telegraph = 'RED_UNPARRIABLE';
      ctx.onDrawGroundEffect?.('GRAVITY_SIGIL', this.sigilX, this.sigilY);
      if ((this.phaseMs += dtMs) >= this.spec.secondaryWindupMs) {
        this.telegraph = 'NONE';
        if (Math.hypot(ctx.playerX - this.sigilX, ctx.playerY - this.sigilY) <= 52) {
          const dirX: -1 | 1 = ctx.playerX >= this.sigilX ? 1 : -1;
          ctx.onStrikePlayer(Math.round(this.spec.secondaryDamage * this.damageScale), dirX, false, this, 1.1);
        }
        this.phase = 'COOLDOWN';
        this.phaseMs = 980;
      }
      return;
    }

    if (this.phase === 'COOLDOWN') {
      if ((this.phaseMs -= dtMs) <= 0) this.phase = 'FLOAT';
      return;
    }

    this.telegraph = 'NONE';
    if (!sense.detected) return;
    this.facing = sense.dirToPlayer;

    if (Math.abs(sense.dx) < 120) {
      this.x = clampGroundX(this.x - this.facing * this.spec.chaseSpeedPxS * dtSec, this.patrolMinX, this.patrolMaxX);
    } else if (Math.abs(sense.dx) > 235) {
      this.x = clampGroundX(this.x + this.facing * this.spec.chaseSpeedPxS * dtSec, this.patrolMinX, this.patrolMaxX);
    }

    if (this.castSigilNext) {
      this.castSigilNext = false;
      this.sigilX = ctx.playerX;
      this.sigilY = ctx.playerY;
      this.phase = 'SIGIL_WINDUP';
      this.phaseMs = 0;
      this.telegraph = 'RED_UNPARRIABLE';
    } else {
      this.castSigilNext = true;
      this.phase = 'BLADES_WINDUP';
      this.phaseMs = 0;
      this.telegraph = 'YELLOW_PARRIABLE';
    }
  }
}
