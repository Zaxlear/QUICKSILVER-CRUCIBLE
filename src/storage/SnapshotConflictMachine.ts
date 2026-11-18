/**
 * 局内快照多端分叉检测、乐观锁版本比对与冲突解决有限状态机
 * （src/storage/SnapshotConflictMachine.ts）。
 *
 * 100% 对齐 docs/01_ARCHITECTURE_AND_SYNC.md §3.4 状态图与 push_active_run_snapshot RPC 仲裁规则。
 */

import type {
  ActiveRunSnapshot,
  SaveConflictChoice,
  SnapshotConflictState,
} from '../data/storage.data';

export interface SnapshotArbitrationResult {
  readonly nextState:
    | 'SYNCED_IDLE'
    | 'AUTO_PULL_REMOTE'
    | 'AUTO_PUSH_LOCAL'
    | 'CONFLICT_MODAL_OPEN';
  readonly reason:
    | 'BOTH_INACTIVE_OR_EMPTY'
    | 'IDENTICAL_SHA256'
    | 'REMOTE_RELAY_TO_IDLE_LOCAL'
    | 'REMOTE_FAST_FORWARD_SAME_RUN'
    | 'LOCAL_NEW_RUN_OVER_INACTIVE_REMOTE'
    | 'LOCAL_FAST_FORWARD_SAME_RUN'
    | 'REMOTE_TERMINATED_SAME_RUN'
    | 'DIVERGENT_ACTIVE_RUN_IDS'
    | 'CONCURRENT_OFFLINE_FORK_SAME_RUN';
}

export interface ConflictContextPair {
  readonly localSnapshot: ActiveRunSnapshot;
  readonly remoteSnapshot: ActiveRunSnapshot;
}

/**
 * 纯函数仲裁器：对比本机与云端局内快照，严禁静默覆盖任何一方的离线进度。
 */
export function arbitrateRunSnapshots(
  local: ActiveRunSnapshot | null,
  remote: ActiveRunSnapshot | null,
  hasLocalUnpushedChanges = false
): SnapshotArbitrationResult {
  const localActive = local !== null && local.lifecycleState === 'ACTIVE';
  const remoteActive = remote !== null && remote.lifecycleState === 'ACTIVE';

  if (!localActive && !remoteActive) {
    if (local && !remote && hasLocalUnpushedChanges) {
      return { nextState: 'AUTO_PUSH_LOCAL', reason: 'LOCAL_NEW_RUN_OVER_INACTIVE_REMOTE' };
    }
    return { nextState: 'SYNCED_IDLE', reason: 'BOTH_INACTIVE_OR_EMPTY' };
  }

  // 本机无活跃局，云端存在活跃局 -> 跨设备无缝接力拉取云端进度
  if (!localActive && remoteActive) {
    if (local && remote && local.runId === remote.runId && hasLocalUnpushedChanges) {
      // 本机刚刚将同一局结算为 VICTORY/DEAD 尚未推送，需推送终态至云端
      return { nextState: 'AUTO_PUSH_LOCAL', reason: 'LOCAL_FAST_FORWARD_SAME_RUN' };
    }
    return { nextState: 'AUTO_PULL_REMOTE', reason: 'REMOTE_RELAY_TO_IDLE_LOCAL' };
  }

  // 本机有活跃局，云端无活跃局（空或旧局已完结）
  if (localActive && !remoteActive) {
    if (remote && remote.runId === local.runId) {
      if (!hasLocalUnpushedChanges) {
        return { nextState: 'AUTO_PULL_REMOTE', reason: 'REMOTE_TERMINATED_SAME_RUN' };
      }
      return { nextState: 'CONFLICT_MODAL_OPEN', reason: 'CONCURRENT_OFFLINE_FORK_SAME_RUN' };
    }
    return { nextState: 'AUTO_PUSH_LOCAL', reason: 'LOCAL_NEW_RUN_OVER_INACTIVE_REMOTE' };
  }

  // 至此 local 与 remote 均非空且均处于 ACTIVE
  const loc = local!;
  const rem = remote!;

  if (loc.payloadSha256 === rem.payloadSha256) {
    return { nextState: 'SYNCED_IDLE', reason: 'IDENTICAL_SHA256' };
  }

  // 异 runId 同时处于 ACTIVE（两台设备离线各自开了新局） -> 强制弹出可视化冲突对比框
  if (loc.runId !== rem.runId) {
    return { nextState: 'CONFLICT_MODAL_OPEN', reason: 'DIVERGENT_ACTIVE_RUN_IDS' };
  }

  // 同 runId：检查乐观锁基线版本是否满足线性推进（Fast-Forward）
  if (loc.baseRevision === rem.revision && hasLocalUnpushedChanges) {
    return { nextState: 'AUTO_PUSH_LOCAL', reason: 'LOCAL_FAST_FORWARD_SAME_RUN' };
  }

  if (!hasLocalUnpushedChanges && rem.revision > loc.revision) {
    return { nextState: 'AUTO_PULL_REMOTE', reason: 'REMOTE_FAST_FORWARD_SAME_RUN' };
  }

  if (hasLocalUnpushedChanges && loc.revision > rem.revision && loc.baseRevision >= rem.revision) {
    return { nextState: 'AUTO_PUSH_LOCAL', reason: 'LOCAL_FAST_FORWARD_SAME_RUN' };
  }

  // 同 runId 在两台设备上基于旧基线各自向不同方向推进 -> 弹出冲突对比框
  return { nextState: 'CONFLICT_MODAL_OPEN', reason: 'CONCURRENT_OFFLINE_FORK_SAME_RUN' };
}

export class SnapshotConflictMachine {
  private currentState: SnapshotConflictState = 'BOOT_LOCAL_READ';
  private conflictPair: ConflictContextPair | null = null;
  private readonly transitionLog: SnapshotConflictState[] = ['BOOT_LOCAL_READ'];

  public get state(): SnapshotConflictState {
    return this.currentState;
  }

  public get activeConflict(): ConflictContextPair | null {
    return this.conflictPair;
  }

  public get history(): readonly SnapshotConflictState[] {
    return this.transitionLog;
  }

  public finishBootLocalRead(canSyncOnline: boolean): SnapshotConflictState {
    return this.transitionTo(canSyncOnline ? 'META_CRDT_SYNC' : 'OFFLINE_PLAYING');
  }

  public notifyNetworkOnline(): SnapshotConflictState {
    if (this.currentState === 'OFFLINE_PLAYING' || this.currentState === 'SYNCED_IDLE') {
      return this.transitionTo('META_CRDT_SYNC');
    }
    return this.currentState;
  }

  public notifyNetworkOffline(): SnapshotConflictState {
    this.conflictPair = null;
    return this.transitionTo('OFFLINE_PLAYING');
  }

  public advanceMetaSyncToArbitration(): SnapshotConflictState {
    return this.transitionTo('SNAPSHOT_ARBITRATION');
  }

  public evaluateSnapshots(
    local: ActiveRunSnapshot | null,
    remote: ActiveRunSnapshot | null,
    hasLocalUnpushedChanges: boolean
  ): SnapshotArbitrationResult {
    if (this.currentState !== 'SNAPSHOT_ARBITRATION') {
      this.transitionTo('SNAPSHOT_ARBITRATION');
    }
    const decision = arbitrateRunSnapshots(local, remote, hasLocalUnpushedChanges);
    if (decision.nextState === 'CONFLICT_MODAL_OPEN' && local && remote) {
      this.conflictPair = { localSnapshot: local, remoteSnapshot: remote };
    } else {
      this.conflictPair = null;
    }
    this.transitionTo(decision.nextState);
    return decision;
  }

  public resolveUserConflictChoice(choice: SaveConflictChoice): {
    readonly actionState: 'FORCE_PUSH_LOCAL' | 'ADOPT_REMOTE_SNAPSHOT';
    readonly chosenSnapshot: ActiveRunSnapshot;
    readonly discardedSnapshot: ActiveRunSnapshot;
  } {
    if (this.currentState !== 'CONFLICT_MODAL_OPEN' || !this.conflictPair) {
      throw new Error(`Cannot resolve save conflict while in state ${this.currentState}`);
    }
    const { localSnapshot, remoteSnapshot } = this.conflictPair;
    this.conflictPair = null;

    if (choice === 'KEEP_LOCAL') {
      this.transitionTo('FORCE_PUSH_LOCAL');
      return {
        actionState: 'FORCE_PUSH_LOCAL',
        chosenSnapshot: localSnapshot,
        discardedSnapshot: remoteSnapshot,
      };
    }

    this.transitionTo('ADOPT_REMOTE_SNAPSHOT');
    return {
      actionState: 'ADOPT_REMOTE_SNAPSHOT',
      chosenSnapshot: remoteSnapshot,
      discardedSnapshot: localSnapshot,
    };
  }

  public markTransferCompleted(): SnapshotConflictState {
    this.conflictPair = null;
    return this.transitionTo('SYNCED_IDLE');
  }

  private transitionTo(next: SnapshotConflictState): SnapshotConflictState {
    this.currentState = next;
    this.transitionLog.push(next);
    if (this.transitionLog.length > 64) {
      this.transitionLog.shift();
    }
    return next;
  }
}
