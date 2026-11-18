import { PLAYER_KINEMATICS, type PlayerStateId } from '../../../data/playerKinematics.data';
import type { IPlayerState, PlayerContext } from './IPlayerState';

/**
 * 受击硬直、击退保护与 HitFlash 纯白闪白状态（src/entities/player/states/HurtState.ts）。
 */
export class HurtState implements IPlayerState {
  public readonly id = 'Hurt' as const;

  private stunTicks = 0;

  public enter(ctx: PlayerContext, _prevState: PlayerStateId): void {
    this.stunTicks = 0;
    ctx.isAttackHitboxActive = false;
    ctx.isParryWindowActive = false;
    ctx.mercyInvulnTicks = PLAYER_KINEMATICS.HURT_MERCY_IFRAME_TICKS;
    ctx.isInvulnerable = true;

    ctx.physics.vx = -ctx.lastAttackerDirX * PLAYER_KINEMATICS.HURT_KNOCKBACK_VX;
    ctx.physics.vy = PLAYER_KINEMATICS.HURT_KNOCKBACK_VY;
    ctx.physics.isGrounded = false;
    ctx.physics.isOnOneWay = false;

    ctx.hooks.playAnim('hero_hurt');
    ctx.hooks.triggerHitFlash(100);
  }

  public fixedUpdate(ctx: PlayerContext, dtSec: number): PlayerStateId | null {
    if (ctx.hp <= 0) {
      return 'Dead';
    }

    this.stunTicks += 1;
    ctx.physics.applyHorizontalRun(0, dtSec, PLAYER_KINEMATICS.MAX_RUN_SPEED);
    ctx.physics.applyThreeStageGravity(dtSec);
    ctx.stepPhysics(dtSec);

    if (this.stunTicks >= PLAYER_KINEMATICS.HURT_STUN_TICKS) {
      if (!ctx.physics.isGrounded) {
        ctx.pendingJumpLaunch = false;
        return 'Jump';
      }
      return Math.abs(ctx.input.moveX) > 0.05 ? 'Run' : 'Idle';
    }

    return null;
  }

  public exit(ctx: PlayerContext, _nextState: PlayerStateId): void {
    this.stunTicks = 0;
    ctx.isInvulnerable = ctx.mercyInvulnTicks > 0;
  }

  public canTransitionTo(target: PlayerStateId, _ctx: PlayerContext): boolean {
    if (target === 'Dead') return true;
    return this.stunTicks >= PLAYER_KINEMATICS.HURT_STUN_TICKS;
  }
}
