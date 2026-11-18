import { PLAYER_KINEMATICS, type PlayerStateId } from '../../../data/playerKinematics.data';
import {
  pollCombatSlotStateTransition,
  type IPlayerState,
  type PlayerContext,
} from './IPlayerState';

/**
 * 二段炼金气浪喷射跳跃状态（src/entities/player/states/DoubleJumpState.ts）。
 * 瞬时重置 vy = -336 px/s，允许 100% 空中水平反向变向，并在脚底爆发水银气浪环。
 */
export class DoubleJumpState implements IPlayerState {
  public readonly id = 'DoubleJump' as const;

  private elapsedTicks = 0;

  public enter(ctx: PlayerContext, _prevState: PlayerStateId): void {
    this.elapsedTicks = 0;
    ctx.physics.airJumpsRemaining = Math.max(0, ctx.physics.airJumpsRemaining - 1);
    ctx.physics.vy = PLAYER_KINEMATICS.DOUBLE_JUMP_VY;
    ctx.physics.isGrounded = false;
    ctx.physics.isOnOneWay = false;
    ctx.physics.coyoteTicks = 0;

    if (Math.abs(ctx.input.moveX) > 0.08) {
      ctx.physics.vx = ctx.input.moveX * PLAYER_KINEMATICS.MAX_RUN_SPEED;
      ctx.physics.facing = ctx.input.moveX > 0 ? 1 : -1;
    }

    ctx.hooks.playAnim('hero_djump');
    ctx.hooks.emitLocomotionVfx('double_jump_ring', ctx.physics.facing);
  }

  public fixedUpdate(ctx: PlayerContext, dtSec: number): PlayerStateId | null {
    if (ctx.dodgeCooldownTicks === 0 && ctx.input.consumeBuffered('dodge')) {
      return 'DodgeRoll';
    }
    const combatState = pollCombatSlotStateTransition(ctx);
    if (combatState) return combatState;
    if (ctx.input.isCrouchHeld && ctx.input.consumeBuffered('jump')) {
      ctx.pendingSlamDive = true;
      return 'Jump';
    }

    this.elapsedTicks += 1;
    ctx.physics.applyHorizontalRun(ctx.input.moveX, dtSec, PLAYER_KINEMATICS.MAX_RUN_SPEED);
    ctx.physics.applyThreeStageGravity(dtSec);
    ctx.stepPhysics(dtSec);

    if (ctx.physics.isGrounded) {
      ctx.hooks.emitLocomotionVfx('land_dust', ctx.physics.facing);
      if (ctx.input.consumeBuffered('jump')) {
        ctx.pendingJumpLaunch = true;
        return 'Jump';
      }
      return Math.abs(ctx.input.moveX) > 0.05 ? 'Run' : 'Idle';
    }

    if (
      ctx.hasMagneticClawsRune &&
      ctx.physics.vy >= 0 &&
      ctx.physics.touchingWallSide !== 0 &&
      Math.sign(ctx.input.moveX) === ctx.physics.touchingWallSide
    ) {
      return 'WallSlide';
    }

    if (this.elapsedTicks >= 28 && ctx.physics.vy > PLAYER_KINEMATICS.APEX_VY_THRESHOLD) {
      ctx.pendingJumpLaunch = false;
      return 'Jump';
    }

    return null;
  }

  public exit(_ctx: PlayerContext, _nextState: PlayerStateId): void {
    this.elapsedTicks = 0;
  }

  public canTransitionTo(target: PlayerStateId, ctx: PlayerContext): boolean {
    if (target === 'Hurt') return !ctx.isInvulnerable && !ctx.hasHyperArmor;
    return true;
  }
}
