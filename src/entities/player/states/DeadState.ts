import { PLAYER_KINEMATICS, type PlayerStateId } from '../../../data/playerKinematics.data';
import type { IPlayerState, PlayerContext } from './IPlayerState';

/**
 * 白瓷躯壳碎裂崩解与水银核回收终态（src/entities/player/states/DeadState.ts）。
 * 处于 Cancel Hierarchy 绝对最高级（DeadState > 一切状态），仅可通过显式重生重置退出。
 */
export class DeadState implements IPlayerState {
  public readonly id = 'Dead' as const;

  private collapseTicks = 0;

  public enter(ctx: PlayerContext, _prevState: PlayerStateId): void {
    this.collapseTicks = 0;
    ctx.isAttackHitboxActive = false;
    ctx.isParryWindowActive = false;
    ctx.isInvulnerable = true;
    ctx.ignoreEnemyCollision = true;
    ctx.physics.vx = 0;

    if (ctx.physics.canStandUp(ctx.world)) {
      ctx.physics.setCompressedCollider(false);
    }

    // 非循环逐帧播放 hero_collapse_0..7
    ctx.hooks.setSpriteFrame('hero_collapse_0');
  }

  public fixedUpdate(ctx: PlayerContext, dtSec: number): PlayerStateId | null {
    this.collapseTicks += 1;
    ctx.physics.vx = 0;
    ctx.physics.applyThreeStageGravity(dtSec, PLAYER_KINEMATICS.MAX_FALL_VY);
    ctx.stepPhysics(dtSec);

    // 10 fps = 每 12 个 120Hz tick 推进一帧，定格在第 7 帧水银渗地态
    const frameIdx = Math.min(7, Math.floor(this.collapseTicks / 12));
    ctx.hooks.setSpriteFrame(`hero_collapse_${frameIdx}`);

    return null;
  }

  public exit(_ctx: PlayerContext, _nextState: PlayerStateId): void {
    this.collapseTicks = 0;
  }

  public canTransitionTo(_target: PlayerStateId, _ctx: PlayerContext): boolean {
    return false;
  }
}
