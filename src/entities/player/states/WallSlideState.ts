import { EventBus } from '../../../core/EventBus';
import { PLAYER_KINEMATICS, type PlayerStateId } from '../../../data/playerKinematics.data';
import type { IPlayerState, PlayerContext } from './IPlayerState';

/**
 * 磁铁攀爪贴墙匀速滑落与蹬墙反跳状态（src/entities/player/states/WallSlideState.ts）。
 * 限制下滑极速 <= 92 px/s，蹬墙反跳赋予 (±250, -355) 并锁定同侧回贴 12 ticks (100ms)。
 */
export class WallSlideState implements IPlayerState {
  public readonly id = 'WallSlide' as const;

  private wallSide: -1 | 1 = 1;
  private detachGraceTicks = 0;
  private slideTicks = 0;

  public enter(ctx: PlayerContext, _prevState: PlayerStateId): void {
    this.wallSide =
      ctx.physics.touchingWallSide !== 0 ? ctx.physics.touchingWallSide : ctx.physics.facing;
    this.detachGraceTicks = PLAYER_KINEMATICS.WALL_DETACH_GRACE_TICKS;
    this.slideTicks = 0;

    // hero_wall_slide 序列帧爪臂伸向右侧墙面，因此贴右墙时 facing=1，贴左墙时 facing=-1 翻转对齐
    ctx.physics.facing = this.wallSide;
    ctx.physics.airJumpsRemaining = ctx.physics.maxAirJumps;
    if (ctx.physics.vy > PLAYER_KINEMATICS.WALL_SLIDE_MAX_VY) {
      ctx.physics.vy = PLAYER_KINEMATICS.WALL_SLIDE_MAX_VY;
    }

    ctx.hooks.playAnim('hero_wall_slide');
    ctx.hooks.emitLocomotionVfx('wall_claw_spark', this.wallSide);
    EventBus.emit('audio:sfx_requested', { sfxId: 'sfx_step_metal', worldX: ctx.physics.x });
  }

  public fixedUpdate(ctx: PlayerContext, dtSec: number): PlayerStateId | null {
    if (ctx.input.consumeBuffered('jump')) {
      const awayDir: -1 | 1 = this.wallSide === 1 ? -1 : 1;
      ctx.physics.vx = awayDir * PLAYER_KINEMATICS.WALL_JUMP_VX;
      ctx.physics.vy = PLAYER_KINEMATICS.WALL_JUMP_VY;
      ctx.physics.facing = awayDir;
      ctx.physics.lockSameWallReattach(this.wallSide);
      ctx.pendingJumpLaunch = false;
      ctx.hooks.emitLocomotionVfx('sprint_dust', awayDir);
      EventBus.emit('audio:sfx_requested', { sfxId: 'sfx_jump_launch', worldX: ctx.physics.x });
      return 'Jump';
    }

    if (ctx.dodgeCooldownTicks === 0 && ctx.input.consumeBuffered('dodge')) {
      ctx.physics.facing = this.wallSide === 1 ? -1 : 1;
      ctx.physics.lockSameWallReattach(this.wallSide);
      return 'DodgeRoll';
    }

    const pushingToward =
      Math.abs(ctx.input.moveX) > 0.1 && Math.sign(ctx.input.moveX) === this.wallSide;
    const pullingAway =
      Math.abs(ctx.input.moveX) > 0.25 && Math.sign(ctx.input.moveX) === -this.wallSide;

    if (pushingToward) {
      this.detachGraceTicks = PLAYER_KINEMATICS.WALL_DETACH_GRACE_TICKS;
    } else if (pullingAway) {
      this.detachGraceTicks -= 2;
    } else {
      this.detachGraceTicks -= 1;
    }

    if (this.detachGraceTicks <= 0) {
      ctx.pendingJumpLaunch = false;
      return 'Jump';
    }

    this.slideTicks += 1;
    ctx.physics.vx = this.wallSide * 12;
    ctx.physics.applyThreeStageGravity(dtSec, PLAYER_KINEMATICS.WALL_SLIDE_MAX_VY);
    if (ctx.physics.vy > PLAYER_KINEMATICS.WALL_SLIDE_MAX_VY) {
      ctx.physics.vy = PLAYER_KINEMATICS.WALL_SLIDE_MAX_VY;
    }
    ctx.stepPhysics(dtSec);

    if (this.slideTicks % 8 === 0) {
      ctx.hooks.emitLocomotionVfx('wall_claw_spark', this.wallSide);
    }

    if (ctx.physics.isGrounded) {
      return 'Idle';
    }
    if (ctx.physics.touchingWallSide !== this.wallSide) {
      ctx.pendingJumpLaunch = false;
      return 'Jump';
    }

    return null;
  }

  public exit(_ctx: PlayerContext, _nextState: PlayerStateId): void {
    this.slideTicks = 0;
  }

  public canTransitionTo(target: PlayerStateId, ctx: PlayerContext): boolean {
    if (target === 'Hurt') return !ctx.isInvulnerable && !ctx.hasHyperArmor;
    return true;
  }
}
