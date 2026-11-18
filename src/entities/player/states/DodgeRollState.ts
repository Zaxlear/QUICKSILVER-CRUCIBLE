import { EventBus } from '../../../core/EventBus';
import { PLAYER_KINEMATICS, type PlayerStateId } from '../../../data/playerKinematics.data';
import {
  pollCombatSlotStateTransition,
  type IPlayerState,
  type PlayerContext,
} from './IPlayerState';

/**
 * 地面/空中战术翻滚状态（src/entities/player/states/DodgeRollState.ts）。
 *
 * 严格遵循 docs/02 精确时间轴（总长 350.0ms = 42 ticks @ 120Hz，CD = 54 ticks）：
 * - Tick 1..32：完全无敌帧（isInvulnerable === true）+ 穿怪零卡位；
 * - Tick 33：无敌帧结束，处于不可取消收招帧；
 * - Tick 34..42：开放跳跃/攻击/盾反提前取消窗口；
 * - 余弦衰减速度曲线对称采样，确保无阻挡平地 42 ticks 总位移精确等于 96.0 px。
 */
export class DodgeRollState implements IPlayerState {
  public readonly id = 'DodgeRoll' as const;

  private elapsedTicks = 0;
  private rollDir: -1 | 1 = 1;

  public enter(ctx: PlayerContext, _prevState: PlayerStateId): void {
    this.elapsedTicks = 0;
    this.rollDir =
      Math.abs(ctx.input.moveX) > 0.08 ? (ctx.input.moveX > 0 ? 1 : -1) : ctx.physics.facing;

    ctx.physics.facing = this.rollDir;
    ctx.physics.setCompressedCollider(true);
    ctx.isInvulnerable = true;
    ctx.ignoreEnemyCollision = true;
    ctx.dodgeCooldownTicks = PLAYER_KINEMATICS.DODGE_COOLDOWN_TICKS;
    ctx.stats.armRapierCritWindow();

    if (!ctx.physics.isGrounded && ctx.physics.vy > 0) {
      ctx.physics.vy *= 0.35;
    }

    ctx.hooks.playAnim('hero_dodge_roll');
    ctx.hooks.emitLocomotionVfx('dodge_dust', this.rollDir);
  }

  public fixedUpdate(ctx: PlayerContext, dtSec: number): PlayerStateId | null {
    this.elapsedTicks += 1;

    const inIFrames = this.elapsedTicks <= PLAYER_KINEMATICS.DODGE_IFRAME_END_TICK;
    ctx.isInvulnerable = inIFrames || ctx.mercyInvulnTicks > 0;
    ctx.ignoreEnemyCollision = inIFrames;

    // Tick 34 起开放提前取消（需头顶净空允许站立恢复 30px 碰撞盒）
    const canCancelNow =
      this.elapsedTicks >= PLAYER_KINEMATICS.DODGE_CANCEL_START_TICK &&
      ctx.physics.canStandUp(ctx.world);

    if (canCancelNow) {
      if (ctx.input.peekBuffered('jump')) {
        if (ctx.physics.isGrounded || ctx.physics.coyoteTicks > 0) {
          ctx.input.consumeBuffered('jump');
          ctx.pendingJumpLaunch = true;
          return 'Jump';
        }
        if (ctx.physics.airJumpsRemaining > 0) {
          ctx.input.consumeBuffered('jump');
          return 'DoubleJump';
        }
      }
      const combatState = pollCombatSlotStateTransition(ctx);
      if (combatState) return combatState;
    }

    const k = Math.min(this.elapsedTicks - 1, PLAYER_KINEMATICS.DODGE_TOTAL_TICKS - 1);
    const theta = (Math.PI * (k + 0.5)) / PLAYER_KINEMATICS.DODGE_TOTAL_TICKS;
    const meanV = PLAYER_KINEMATICS.DODGE_MEAN_SPEED;
    const ampV = PLAYER_KINEMATICS.DODGE_INITIAL_SPEED - meanV;
    ctx.physics.vx = this.rollDir * (meanV + ampV * Math.cos(theta));

    if (!ctx.physics.isGrounded) {
      ctx.physics.applyThreeStageGravity(dtSec);
    }
    ctx.stepPhysics(dtSec);

    if (
      this.elapsedTicks <= 37 &&
      this.elapsedTicks % PLAYER_KINEMATICS.DODGE_GHOST_INTERVAL_TICKS === 1
    ) {
      ctx.hooks.spawnGhostTrail();
    }
    if (this.elapsedTicks === 10 || this.elapsedTicks === 22) {
      const affixes = ctx.inventory.collectAllEquippedAffixIds();
      if (affixes.includes('afx_shock_on_dodge') || affixes.includes('afx_oil_fire_trail')) {
        EventBus.emit('combat:dodge_evaded', {
          entityId: 'player_vessel_09',
          worldX: ctx.physics.x,
          worldY: ctx.physics.y,
          activeAffixIds: affixes,
        });
      }
    }

    if (this.elapsedTicks >= PLAYER_KINEMATICS.DODGE_TOTAL_TICKS) {
      if (!ctx.physics.canStandUp(ctx.world)) {
        // 处于矮隧道内：维持低姿态滑出直至头顶净空恢复
        ctx.physics.vx = this.rollDir * 140;
        return null;
      }
      if (!ctx.physics.isGrounded) {
        ctx.pendingJumpLaunch = false;
        return 'Jump';
      }
      return Math.abs(ctx.input.moveX) > 0.05 ? 'Run' : 'Idle';
    }

    return null;
  }

  public exit(ctx: PlayerContext, nextState: PlayerStateId): void {
    ctx.isInvulnerable = ctx.mercyInvulnTicks > 0;
    ctx.ignoreEnemyCollision = false;
    if (nextState !== 'DodgeRoll' && ctx.physics.canStandUp(ctx.world)) {
      ctx.physics.setCompressedCollider(false);
    }
  }

  public canTransitionTo(target: PlayerStateId, ctx: PlayerContext): boolean {
    if (target === 'Dead') return true;
    if (target === 'Hurt') return !ctx.isInvulnerable && !ctx.hasHyperArmor;
    if (this.elapsedTicks < PLAYER_KINEMATICS.DODGE_CANCEL_START_TICK) {
      return false;
    }
    return ctx.physics.canStandUp(ctx.world);
  }
}
