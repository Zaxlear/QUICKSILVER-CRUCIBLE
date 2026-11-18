import { EventBus } from '../../../core/EventBus';
import { PLAYER_KINEMATICS, type PlayerStateId } from '../../../data/playerKinematics.data';
import {
  pollCombatSlotStateTransition,
  type IPlayerState,
  type PlayerContext,
} from './IPlayerState';

/**
 * 地面高速疾跑与急停转向尘雾状态（src/entities/player/states/RunState.ts）。
 */
export class RunState implements IPlayerState {
  public readonly id = 'Run' as const;

  private runTicks = 0;
  private turnBrakeDustCd = 0;

  public enter(ctx: PlayerContext, _prevState: PlayerStateId): void {
    this.runTicks = 0;
    this.turnBrakeDustCd = 0;
    ctx.hooks.playAnim('hero_run');
    const initDir: -1 | 1 =
      Math.abs(ctx.input.moveX) > 0.05 ? (ctx.input.moveX > 0 ? 1 : -1) : ctx.physics.facing;
    ctx.physics.facing = initDir;
    ctx.hooks.emitLocomotionVfx('sprint_dust', initDir);
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

    this.runTicks += 1;
    if (this.turnBrakeDustCd > 0) this.turnBrakeDustCd -= 1;

    const turnSnapped = ctx.physics.applyHorizontalRun(
      ctx.input.moveX,
      dtSec,
      PLAYER_KINEMATICS.MAX_RUN_SPEED * ctx.moveSpeedMultiplier
    );
    if (turnSnapped && this.turnBrakeDustCd === 0) {
      ctx.hooks.emitLocomotionVfx('turn_brake_dust', ctx.physics.facing);
      this.turnBrakeDustCd = 14;
    } else if (this.runTicks === 3) {
      ctx.hooks.emitLocomotionVfx('sprint_dust', ctx.physics.facing);
    }
    if (this.runTicks === 2 || (this.runTicks > 2 && (this.runTicks - 2) % 21 === 0)) {
      EventBus.emit('audio:sfx_requested', {
        sfxId: ctx.physics.isOnOneWay ? 'sfx_step_metal' : 'sfx_step_stone',
        worldX: ctx.physics.x,
      });
    }

    ctx.physics.applyThreeStageGravity(dtSec);
    ctx.stepPhysics(dtSec);

    if (!ctx.physics.isGrounded) {
      ctx.pendingJumpLaunch = false;
      return 'Jump';
    }
    if (Math.abs(ctx.input.moveX) <= 0.05 && Math.abs(ctx.physics.vx) < 4) {
      ctx.physics.vx = 0;
      return 'Idle';
    }
    return null;
  }

  public exit(_ctx: PlayerContext, _nextState: PlayerStateId): void {
    this.runTicks = 0;
  }

  public canTransitionTo(target: PlayerStateId, ctx: PlayerContext): boolean {
    if (target === 'Hurt') return !ctx.isInvulnerable && !ctx.hasHyperArmor;
    return true;
  }
}
