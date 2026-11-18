import { EventBus } from '../../../core/EventBus';
import {
  PLAYER_STATE_PRIORITY,
  type PlayerStateId,
} from '../../../data/playerKinematics.data';
import type { IPlayerState, PlayerContext } from './IPlayerState';

const HISTORY_RING_CAPACITY = 16;

/**
 * 节点化角色有限状态机仲裁器（src/entities/player/states/PlayerStateMachine.ts）。
 *
 * - 管理全部 10 个独立 IPlayerState 实例与定长零分配状态历史环；
 * - 严格执行 Cancel Hierarchy 优先级守卫：
 *   Dead > Hurt > Parry / DodgeRoll > AttackCombo > WallSlide > DoubleJump > Jump > Run > Idle；
 * - 若状态在未执行物理积分前请求切入新动作（如 Idle -> DodgeRoll 或 DodgeRoll Tick 34 -> Jump），
 *   同 tick 立即执行目标状态的第 1 逻辑帧，确保帧时间轴零延迟对齐。
 */
export class PlayerStateMachine {
  private readonly states = new Map<PlayerStateId, IPlayerState>();
  private readonly historyRing: PlayerStateId[] = new Array<PlayerStateId>(HISTORY_RING_CAPACITY).fill('Idle');
  private historyWriteCursor = 0;

  private current: IPlayerState;
  private previousId: PlayerStateId = 'Idle';

  public constructor(registeredStates: readonly IPlayerState[], initialId: PlayerStateId = 'Idle') {
    for (let i = 0; i < registeredStates.length; i++) {
      const st = registeredStates[i]!;
      this.states.set(st.id, st);
    }
    const init = this.states.get(initialId);
    if (!init) {
      throw new Error(`Missing initial player state: ${initialId}`);
    }
    this.current = init;
  }

  public get currentStateId(): PlayerStateId {
    return this.current.id;
  }

  public get previousStateId(): PlayerStateId {
    return this.previousId;
  }

  public initialize(ctx: PlayerContext): void {
    this.current.enter(ctx, this.previousId);
  }

  /**
   * 外部事件中断请求（如受击 Hurt 或致命伤害 Dead），遵守状态转换合法性守卫。
   */
  public requestInterrupt(targetId: PlayerStateId, ctx: PlayerContext): boolean {
    if (targetId === this.current.id && targetId !== 'Hurt') {
      return false;
    }
    if (targetId !== 'Dead' && !this.current.canTransitionTo(targetId, ctx)) {
      return false;
    }
    if (
      targetId !== 'Dead' &&
      PLAYER_STATE_PRIORITY[targetId] < PLAYER_STATE_PRIORITY[this.current.id]
    ) {
      return false;
    }
    this.performTransition(targetId, ctx);
    return true;
  }

  public forceResetToIdle(ctx: PlayerContext): void {
    const prev = this.current.id;
    if (prev !== 'Idle') {
      this.current.exit(ctx, 'Idle');
    }
    const idle = this.states.get('Idle')!;
    this.previousId = prev;
    this.current = idle;
    this.pushHistory('Idle');
    this.current.enter(ctx, prev);
  }

  public step(ctx: PlayerContext, dtSec: number): void {
    ctx.physicsSteppedThisTick = false;

    // 最多允许 2 次同 tick 零延迟链式跃迁（仅当尚未执行物理步进时继续推进目标状态首帧）
    for (let hop = 0; hop < 3; hop++) {
      const nextId = this.current.fixedUpdate(ctx, dtSec);
      if (!nextId || nextId === this.current.id) {
        break;
      }
      if (!this.current.canTransitionTo(nextId, ctx)) {
        break;
      }

      const steppedBeforeTransition = ctx.physicsSteppedThisTick;
      this.performTransition(nextId, ctx);

      if (steppedBeforeTransition) {
        break;
      }
    }
  }

  public getRecentHistory(outBuffer: PlayerStateId[]): number {
    const count = Math.min(outBuffer.length, HISTORY_RING_CAPACITY);
    for (let i = 0; i < count; i++) {
      const idx = (this.historyWriteCursor - 1 - i + HISTORY_RING_CAPACITY * 2) % HISTORY_RING_CAPACITY;
      outBuffer[i] = this.historyRing[idx]!;
    }
    return count;
  }

  private performTransition(targetId: PlayerStateId, ctx: PlayerContext): void {
    const nextState = this.states.get(targetId);
    if (!nextState) {
      throw new Error(`Unregistered target PlayerStateId: ${targetId}`);
    }
    const prevId = this.current.id;
    this.current.exit(ctx, targetId);
    this.previousId = prevId;
    this.current = nextState;
    this.pushHistory(targetId);
    this.current.enter(ctx, prevId);
    EventBus.emit('player:state_changed', { prev: prevId, next: targetId });
  }

  private pushHistory(id: PlayerStateId): void {
    this.historyRing[this.historyWriteCursor] = id;
    this.historyWriteCursor = (this.historyWriteCursor + 1) % HISTORY_RING_CAPACITY;
  }
}
