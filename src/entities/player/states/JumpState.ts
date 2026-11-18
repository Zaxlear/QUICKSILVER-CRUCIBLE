import { EventBus } from '../../../core/EventBus';
import { PLAYER_KINEMATICS, type PlayerStateId } from '../../../data/playerKinematics.data';
import { probeGroundSupport } from '../SweptCollisionSolver';
import {
  pollCombatSlotStateTransition,
  type IPlayerState,
  type PlayerContext,
} from './IPlayerState';

/**
 * 一段起跳、土狼时间补跳、可变跳高截断（松键 vy *= 0.45）、藤梯攀升与煅烧震地下砸状态。
 */
export class JumpState implements IPlayerState {
  public readonly id = 'Jump' as const;

  private launchedByJump = false;
  private hasCutJump = false;
  private airTicks = 0;
  private isSlamDiving = false;
  private slamHoverTicksLeft = 0;

  public enter(ctx: PlayerContext, prevState: PlayerStateId): void {
    this.airTicks = 0;
    this.hasCutJump = false;
    this.isSlamDiving = false;
    this.slamHoverTicksLeft = 0;

    if (ctx.pendingSlamDive) {
      ctx.pendingSlamDive = false;
      this.startSlamDive(ctx);
      return;
    }

    if (ctx.pendingJumpLaunch) {
      this.launchedByJump = true;
      ctx.pendingJumpLaunch = false;
      this.executeGroundJumpImpulse(ctx);
    } else {
      this.launchedByJump = prevState === 'WallSlide' && ctx.physics.vy < -200;
    }
    this.syncAirFrame(ctx);
  }

  public fixedUpdate(ctx: PlayerContext, dtSec: number): PlayerStateId | null {
    if (this.isSlamDiving) {
      return this.stepSlamDive(ctx, dtSec);
    }

    if (ctx.dodgeCooldownTicks === 0 && ctx.input.consumeBuffered('dodge')) return 'DodgeRoll';
    const combatState = pollCombatSlotStateTransition(ctx);
    if (combatState) return combatState;

    // 已催生矾蚀藤梯区域内按上或跳可持续攀升
    if (ctx.inClimbableVineZone && (ctx.input.moveY < -0.25 || ctx.input.isHeld('jump'))) {
      ctx.physics.vy = PLAYER_KINEMATICS.VINE_CLIMB_VY;
      ctx.physics.airJumpsRemaining = ctx.physics.maxAirJumps;
      this.launchedByJump = false;
    } else if (ctx.input.peekBuffered('jump')) {
      if (!this.launchedByJump && ctx.physics.coyoteTicks > 0) {
        ctx.input.consumeBuffered('jump');
        this.launchedByJump = true;
        this.hasCutJump = false;
        this.executeGroundJumpImpulse(ctx);
      } else if (ctx.input.isCrouchHeld) {
        // 滞空按下 + 跳：发动煅烧震地下砸（10 ticks 悬停蓄力 -> +680 px/s 俯冲）
        ctx.input.consumeBuffered('jump');
        this.startSlamDive(ctx);
        return this.stepSlamDive(ctx, dtSec);
      } else if (ctx.physics.airJumpsRemaining > 0) {
        ctx.input.consumeBuffered('jump');
        return 'DoubleJump';
      }
    }

    if (
      this.launchedByJump &&
      !this.hasCutJump &&
      ctx.physics.vy < -PLAYER_KINEMATICS.APEX_VY_THRESHOLD &&
      !ctx.input.isHeld('jump')
    ) {
      ctx.physics.vy *= PLAYER_KINEMATICS.JUMP_CUT_MULTIPLIER;
      this.hasCutJump = true;
    }

    this.airTicks += 1;
    ctx.physics.applyHorizontalRun(ctx.input.moveX, dtSec, PLAYER_KINEMATICS.MAX_RUN_SPEED);
    if (!ctx.inClimbableVineZone || (ctx.input.moveY >= -0.25 && !ctx.input.isHeld('jump'))) {
      ctx.physics.applyThreeStageGravity(dtSec);
    }
    ctx.stepPhysics(dtSec);
    this.syncAirFrame(ctx);

    if (ctx.physics.isGrounded) {
      ctx.hooks.emitLocomotionVfx('land_dust', ctx.physics.facing);
      if (ctx.input.peekBuffered('jump')) {
        if (ctx.input.isCrouchHeld && ctx.physics.isOnOneWay) {
          ctx.input.consumeBuffered('jump');
          ctx.physics.triggerOneWayDropThrough();
          this.launchedByJump = false;
          return null;
        }
        ctx.input.consumeBuffered('jump');
        this.launchedByJump = true;
        this.hasCutJump = false;
        this.executeGroundJumpImpulse(ctx);
        return null;
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
    return null;
  }

  public exit(_ctx: PlayerContext, _nextState: PlayerStateId): void {
    this.airTicks = 0;
    this.isSlamDiving = false;
    this.slamHoverTicksLeft = 0;
  }

  public canTransitionTo(target: PlayerStateId, ctx: PlayerContext): boolean {
    if (target === 'Hurt') return !ctx.isInvulnerable && !ctx.hasHyperArmor;
    return true;
  }

  private startSlamDive(ctx: PlayerContext): void {
    this.isSlamDiving = true;
    this.slamHoverTicksLeft = PLAYER_KINEMATICS.SLAM_HOVER_TICKS;
    ctx.physics.vx = 0;
    ctx.physics.vy = 0;
    ctx.physics.oneWayIgnoreTicks = 24;
    ctx.hooks.setSpriteFrame('hero_atk_slash_9');
  }

  private stepSlamDive(ctx: PlayerContext, dtSec: number): PlayerStateId | null {
    if (this.slamHoverTicksLeft > 0) {
      this.slamHoverTicksLeft -= 1;
      ctx.physics.vx = 0;
      ctx.physics.vy = 0;
      ctx.stepPhysics(dtSec);
      return null;
    }

    ctx.physics.vx = 0;
    ctx.physics.vy = PLAYER_KINEMATICS.SLAM_DIVE_VY;
    if ((this.airTicks & 3) === 0) ctx.hooks.spawnGhostTrail();
    this.airTicks += 1;
    ctx.stepPhysics(dtSec);

    if (ctx.physics.isGrounded) {
      ctx.hooks.emitLocomotionVfx('slam_shockwave', ctx.physics.facing);
      ctx.hooks.notifySlamLanded(ctx.physics.x, ctx.physics.y, ctx.hasCalcinedRamRune);
      // 若脚下裂纹矿渣地板被震碎移除，继续顺势向下贯通坠落
      if (probeGroundSupport(ctx.physics, ctx.world, 1.5) === 'none') {
        ctx.physics.isGrounded = false;
        ctx.physics.vy = PLAYER_KINEMATICS.SLAM_DIVE_VY * 0.65;
        return null;
      }
      this.isSlamDiving = false;
      return Math.abs(ctx.input.moveX) > 0.05 ? 'Run' : 'Idle';
    }
    return null;
  }

  private executeGroundJumpImpulse(ctx: PlayerContext): void {
    ctx.physics.vy = PLAYER_KINEMATICS.JUMP_INITIAL_VY;
    ctx.physics.isGrounded = false;
    ctx.physics.isOnOneWay = false;
    ctx.physics.coyoteTicks = 0;
    ctx.hooks.emitLocomotionVfx('sprint_dust', ctx.physics.facing);
    EventBus.emit('audio:sfx_requested', { sfxId: 'sfx_jump_launch', worldX: ctx.physics.x });
  }

  private syncAirFrame(ctx: PlayerContext): void {
    const subIdx = (this.airTicks >> 3) & 1;
    ctx.hooks.setSpriteFrame(ctx.physics.vy < 0 ? `hero_jump_fall_${subIdx}` : `hero_jump_fall_${2 + subIdx}`);
  }
}
