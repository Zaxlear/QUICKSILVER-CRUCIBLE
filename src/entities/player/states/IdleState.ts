import { PLAYER_KINEMATICS, type PlayerStateId } from '../../../data/playerKinematics.data';
import {
  pollCombatSlotStateTransition,
  type IPlayerState,
  type PlayerContext,
} from './IPlayerState';

/**
 * 站立待机与下蹲压缩姿态状态（src/entities/player/states/IdleState.ts）。
 */
export class IdleState implements IPlayerState {
  public readonly id = 'Idle' as const;

  public enter(ctx: PlayerContext, _prevState: PlayerStateId): void {
    ctx.hooks.playAnim('hero_idle');
    this.syncCrouchCollider(ctx);
  }

  public fixedUpdate(ctx: PlayerContext, dtSec: number): PlayerStateId | null {
    if (ctx.dodgeCooldownTicks === 0 && ctx.input.consumeBuffered('dodge')) {
      return 'DodgeRoll';
    }
    const combatState = pollCombatSlotStateTransition(ctx);
    if (combatState) return combatState;
    if (ctx.input.consumeBuffered('heal_flask')) {
      const healed = ctx.stats.tryDrinkElixirFlask();
      if (healed > 0) ctx.hooks.notifyFlaskDrunk(healed);
    }
    if (ctx.input.peekBuffered('jump')) {
      if (ctx.input.isCrouchHeld && ctx.physics.isOnOneWay) {
        ctx.input.consumeBuffered('jump');
        ctx.physics.triggerOneWayDropThrough();
        ctx.pendingJumpLaunch = false;
        return 'Jump';
      }
      ctx.input.consumeBuffered('jump');
      ctx.pendingJumpLaunch = true;
      return 'Jump';
    }
    if (Math.abs(ctx.input.moveX) > 0.05) {
      return 'Run';
    }

    this.syncCrouchCollider(ctx);
    ctx.physics.applyHorizontalRun(0, dtSec, PLAYER_KINEMATICS.MAX_RUN_SPEED);
    ctx.physics.applyThreeStageGravity(dtSec);
    ctx.stepPhysics(dtSec);

    if (!ctx.physics.isGrounded) {
      ctx.pendingJumpLaunch = false;
      return 'Jump';
    }
    return null;
  }

  public exit(ctx: PlayerContext, nextState: PlayerStateId): void {
    if (ctx.isCrouching && nextState !== 'DodgeRoll' && ctx.physics.canStandUp(ctx.world)) {
      ctx.isCrouching = false;
      ctx.physics.setCompressedCollider(false);
    }
  }

  public canTransitionTo(target: PlayerStateId, ctx: PlayerContext): boolean {
    if (target === 'Hurt') return !ctx.isInvulnerable && !ctx.hasHyperArmor;
    return true;
  }

  private syncCrouchCollider(ctx: PlayerContext): void {
    if (ctx.input.isCrouchHeld && ctx.physics.isGrounded) {
      ctx.isCrouching = true;
      ctx.physics.setCompressedCollider(true);
    } else if (ctx.isCrouching && ctx.physics.canStandUp(ctx.world)) {
      ctx.isCrouching = false;
      ctx.physics.setCompressedCollider(false);
    }
  }
}
