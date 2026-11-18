/**
 * 零配置离线优先回环云网关与 PostgreSQL snake_case 行映射器
 * （src/storage/LoopbackCloudGateway.ts）。
 *
 * 100% 镜像 supabase/migrations/0001_initial_cloud_save.sql 的 CRDT 并集与乐观锁推送语义。
 */

import type {
  ActiveRunSnapshot,
  AuthPromoteMethod,
  BiomeId,
  LoadoutVisualSummary,
  MetaProgressionRecord,
  PlayerRunStateSnapshot,
  RunHistoryLogEntry,
  RunLifecycleState,
  SyncConnectionMode,
  WorldDeltaSnapshot,
} from '../data/storage.data';
import { mergeMetaProgressionsUnsigned } from './CrdtMetaMerger';
import { createSecureUuid, signActiveRunSnapshot, signMetaProgression } from './SaveSchema';
import type { AuthSessionSummary, ICloudSaveGateway, PushSnapshotRpcOutcome } from './SupabaseClient';

export interface SnakeRunRow {
  readonly run_id: string;
  readonly lifecycle_state: RunLifecycleState;
  readonly device_id: string;
  readonly device_label: string;
  readonly run_seed: number;
  readonly rng_internal_state: number;
  readonly rng_step_count: number;
  readonly biome_id: BiomeId;
  readonly biome_depth: 1 | 2 | 3 | 4;
  readonly current_room_id: string;
  readonly spawn_checkpoint_id: string;
  readonly playtime_ms: number;
  readonly player_snapshot: PlayerRunStateSnapshot;
  readonly loadout_summary: LoadoutVisualSummary;
  readonly world_delta: WorldDeltaSnapshot;
  readonly revision: number;
  readonly payload_sha256: string;
  readonly client_saved_at: string;
}

export function mapSnakeRowToSnapshot(row: SnakeRunRow): ActiveRunSnapshot {
  return {
    runId: row.run_id,
    schemaVersion: 1,
    lifecycleState: row.lifecycle_state,
    deviceId: row.device_id,
    deviceLabel: row.device_label,
    runSeed: Number(row.run_seed) >>> 0,
    rngInternalState: Number(row.rng_internal_state) >>> 0,
    rngStepCount: Number(row.rng_step_count),
    biomeId: row.biome_id,
    biomeDepth: row.biome_depth,
    currentRoomId: row.current_room_id,
    spawnCheckpointId: row.spawn_checkpoint_id,
    playtimeMs: Number(row.playtime_ms),
    playerSnapshot: row.player_snapshot,
    loadoutSummary: row.loadout_summary,
    worldDelta: row.world_delta,
    revision: Number(row.revision),
    baseRevision: Number(row.revision),
    clientSavedAt: row.client_saved_at,
    payloadSha256: row.payload_sha256,
  };
}

export class LoopbackCloudGateway implements ICloudSaveGateway {
  public readonly mode: SyncConnectionMode = 'LOCAL_LOOPBACK';
  private session: AuthSessionSummary = {
    userId: `anon_${createSecureUuid().slice(0, 8)}`,
    displayMoniker: 'Vessel-09',
    isPromotedAccount: false,
    boundEmail: null,
  };
  private cloudMeta: MetaProgressionRecord | null = null;
  private cloudRun: ActiveRunSnapshot | null = null;

  public async ensureAnonymousSession(): Promise<AuthSessionSummary> {
    return this.session;
  }

  public async promoteAccount(method: AuthPromoteMethod, email?: string) {
    const clean = (email ?? '').trim();
    if (method === 'magic_link' && !clean.includes('@')) {
      throw new Error('请输入有效炼金契约邮箱地址');
    }
    const bound = method === 'magic_link' ? clean : `${method}@oauth.athanor.io`;
    this.session = { ...this.session, isPromotedAccount: true, boundEmail: bound };
    return {
      ok: true,
      session: this.session,
      messageZh: `匿名账号 ${this.session.userId} 已无损转正绑定至 ${bound}（UID 不变，零丢档）`,
    };
  }

  public async mergeMetaProgression(local: MetaProgressionRecord): Promise<MetaProgressionRecord> {
    if (!this.cloudMeta) {
      this.cloudMeta = local;
      return local;
    }
    const merged = mergeMetaProgressionsUnsigned(this.cloudMeta, local);
    this.cloudMeta = await signMetaProgression({
      ...merged,
      crdtRevision: merged.crdtRevision + 1,
    });
    return this.cloudMeta;
  }

  public async fetchActiveRunSnapshot(): Promise<ActiveRunSnapshot | null> {
    return this.cloudRun;
  }

  public async pushActiveRunSnapshot(
    local: ActiveRunSnapshot,
    forceOverwrite = false
  ): Promise<PushSnapshotRpcOutcome> {
    const existing = this.cloudRun;
    if (
      !existing ||
      forceOverwrite ||
      (existing.lifecycleState !== 'ACTIVE' && existing.runId !== local.runId)
    ) {
      const nextRev = (existing?.revision ?? 0) + 1;
      const saved = await signActiveRunSnapshot({
        ...local,
        revision: nextRev,
        baseRevision: nextRev,
      });
      this.cloudRun = saved;
      return { status: 'COMMITTED', snapshot: saved };
    }
    if (existing.payloadSha256 === local.payloadSha256) {
      return { status: 'NO_OP', snapshot: existing };
    }
    if (existing.runId === local.runId && existing.revision === local.baseRevision) {
      const nextRev = existing.revision + 1;
      const saved = await signActiveRunSnapshot({
        ...local,
        revision: nextRev,
        baseRevision: nextRev,
      });
      this.cloudRun = saved;
      return { status: 'COMMITTED', snapshot: saved };
    }
    return { status: 'CONFLICT', remoteSnapshot: existing };
  }

  public async archiveRunHistory(_entry: RunHistoryLogEntry): Promise<void> {
    /* 本地已持久化至 Dexie runHistory */
  }

  public injectSimulatedRemoteSnapshot(remote: ActiveRunSnapshot): void {
    this.cloudRun = remote;
  }
}
