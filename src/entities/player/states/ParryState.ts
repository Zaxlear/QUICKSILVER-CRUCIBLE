import { PLAYER_KINEMATICS, type PlayerStateId } from '../../../data/playerKinematics.data';
import {
  pollCombatSlotStateTransition,
  slotActionFor,
  type IPlayerState,
  type PlayerContext,
} from './IPlayerState';

/**
 * 举盾瞬时黄金招架判定与长按持续格挡状态（src/entities/player/states/ParryState.ts）。
 *
 * - Tick 1..2 (16.7ms)：起盾前摇；
 * - Tick 3..20 (150.0ms = 18 ticks)：黄金招架判定窗（0ms 冷却重置 + 96px 震荡暴击波 + 弹反投射物）；
 * - 若按住盾牌键超过 Tick 20，转入持续举盾格挡姿态（正面减伤 75% 且震退贴脸怪 32px）。
 */
export class ParryState implements IPlayerState {
  public readonly id = 'Parry' as const;

  private elapsedTicks = 0;

  public enter(ctx: PlayerContext, _prevState: PlayerStateId): void {
    this.elapsedTicks = 0;
    ctx.parrySucceededInCurrentState = false;
    ctx.isParryWindowActive = false;
    ctx.isHoldingShieldBlock = false;
    ctx.parryCooldownTicks = PLAYER_KINEMATICS.PARRY_WHIFF_COOLDOWN_TICKS;

    if (Math.abs(ctx.input.moveX) > 0.08) {
      ctx.physics.facing = ctx.input.moveX > 0 ? 1 : -1;
    }

    ctx.hooks.playAnim('hero_parry');
  }

  public fixedUpdate(ctx: PlayerContext, dtSec: number): PlayerStateId | null {
    this.elapsedTicks += 1;
    const shieldAction = slotActionFor(ctx.activeWeaponSlot);

    const inGoldenWindow =
      this.elapsedTicks > PLAYER_KINEMATICS.PARRY_STARTUP_TICKS &&
      this.elapsedTicks <= PLAYER_KINEMATICS.PARRY_WINDOW_END_TICK;
    const holdingPastWindow =
      this.elapsedTicks > PLAYER_KINEMATICS.PARRY_WINDOW_END_TICK &&
      !ctx.parrySucceededInCurrentState &&
      ctx.input.isHeld(shieldAction);

    ctx.isParryWindowActive = inGoldenWindow;
    ctx.isHoldingShieldBlock = holdingPastWindow;
    ctx.hooks.setShieldRefractActive(inGoldenWindow || ctx.parrySucceededInCurrentState);

    if (ctx.parrySucceededInCurrentState) {
      if (ctx.input.consumeBuffered(shieldAction)) {
        this.elapsedTicks = 1;
        ctx.parrySucceededInCurrentState = false;
        ctx.isParryWindowActive = false;
        ctx.hooks.playAnim('hero_parry', 0);
      } else if (ctx.dodgeCooldownTicks === 0 && ctx.input.consumeBuffered('dodge')) {
        return 'DodgeRoll';
      } else {
        const nextCombat = pollCombatSlotStateTransition(ctx);
        if (nextCombat) return nextCombat;
        if (ctx.physics.isGrounded && ctx.input.consumeBuffered('jump')) {
          ctx.pendingJumpLaunch = true;
          return 'Jump';
        }
      }
    }

    const moveScale = holdingPastWindow ? 0.28 : 0;
    ctx.physics.applyHorizontalRun(
      ctx.input.moveX * moveScale,
      dtSec,
      PLAYER_KINEMATICS.MAX_RUN_SPEED * 0.35
    );
    ctx.physics.applyThreeStageGravity(dtSec);
    ctx.stepPhysics(dtSec);

    if (holdingPastWindow) {
      if (ctx.dodgeCooldownTicks === 0 && ctx.input.consumeBuffered('dodge')) {
        return 'DodgeRoll';
      }
      return null;
    }

    const finishTick = ctx.parrySucceededInCurrentState ? 24 : PLAYER_KINEMATICS.PARRY_TOTAL_TICKS;
    if (this.elapsedTicks >= finishTick) {
      if (!ctx.physics.isGrounded) {
        ctx.pendingJumpLaunch = false;
        return 'Jump';
      }
      return Math.abs(ctx.input.moveX) > 0.05 ? 'Run' : 'Idle';
    }

    return null;
  }

  public exit(ctx: PlayerContext, _nextState: PlayerStateId): void {
    ctx.isParryWindowActive = false;
    ctx.isHoldingShieldBlock = false;
    ctx.hooks.setShieldRefractActive(false);
  }

  public canTransitionTo(target: PlayerStateId, ctx: PlayerContext): boolean {
    if (target === 'Dead') return true;
    if (target === 'Hurt') {
      return (
        !ctx.isInvulnerable &&
        !ctx.isParryWindowActive &&
        !ctx.isHoldingShieldBlock &&
        !ctx.hasHyperArmor
      );
    }
    if (ctx.parrySucceededInCurrentState) return true;
    if (ctx.isHoldingShieldBlock && target === 'DodgeRoll') return true;
    return this.elapsedTicks >= PLAYER_KINEMATICS.PARRY_TOTAL_TICKS;
  }
}
