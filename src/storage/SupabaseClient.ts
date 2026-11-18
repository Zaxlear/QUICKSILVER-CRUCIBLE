/**
 * Supabase 单例鉴权、匿名转正（updateUser / linkIdentity）与 PostgreSQL RPC 客户端封装
 * （src/storage/SupabaseClient.ts）。
 */

import { createClient, type SupabaseClient as SdkClient } from '@supabase/supabase-js';
import type {
  ActiveRunSnapshot,
  AuthPromoteMethod,
  ForgeTierProgressMap,
  MetaProgressionRecord,
  RunHistoryLogEntry,
  SyncConnectionMode,
} from '../data/storage.data';
import { LoopbackCloudGateway, mapSnakeRowToSnapshot, type SnakeRunRow } from './LoopbackCloudGateway';
import { signMetaProgression } from './SaveSchema';

export { LoopbackCloudGateway };

export type PushSnapshotRpcOutcome =
  | { readonly status: 'COMMITTED' | 'NO_OP'; readonly snapshot: ActiveRunSnapshot }
  | { readonly status: 'CONFLICT'; readonly remoteSnapshot: ActiveRunSnapshot };

export interface AuthSessionSummary {
  readonly userId: string;
  readonly displayMoniker: string;
  readonly isPromotedAccount: boolean;
  readonly boundEmail: string | null;
}

export interface ICloudSaveGateway {
  readonly mode: SyncConnectionMode;
  ensureAnonymousSession(deviceId: string, deviceLabel: string): Promise<AuthSessionSummary>;
  promoteAccount(
    method: AuthPromoteMethod,
    email?: string
  ): Promise<{ readonly ok: boolean; readonly session: AuthSessionSummary; readonly messageZh: string }>;
  mergeMetaProgression(local: MetaProgressionRecord): Promise<MetaProgressionRecord>;
  fetchActiveRunSnapshot(): Promise<ActiveRunSnapshot | null>;
  pushActiveRunSnapshot(local: ActiveRunSnapshot, forceOverwrite?: boolean): Promise<PushSnapshotRpcOutcome>;
  archiveRunHistory(entry: RunHistoryLogEntry): Promise<void>;
  injectSimulatedRemoteSnapshot(remote: ActiveRunSnapshot): void;
}

export class SupabaseCloudGateway implements ICloudSaveGateway {
  public readonly mode: SyncConnectionMode = 'SUPABASE_CLOUD';
  private readonly sdk: SdkClient;
  private injectedOverride: ActiveRunSnapshot | null = null;

  public constructor(url: string, anonKey: string) {
    this.sdk = createClient(url, anonKey, {
      auth: { persistSession: true, autoRefreshToken: true },
    });
  }

  public async ensureAnonymousSession(deviceId: string, deviceLabel: string): Promise<AuthSessionSummary> {
    const { data: cur } = await this.sdk.auth.getSession();
    let user = cur.session?.user ?? null;
    if (!user) {
      const { data, error } = await this.sdk.auth.signInAnonymously();
      if (error || !data.user) throw new Error(error?.message ?? 'Supabase anonymous sign-in failed');
      user = data.user;
    }
    await this.sdk.from('player_profiles').upsert({
      user_id: user.id,
      last_device_id: deviceId,
      last_device_label: deviceLabel,
    });
    return {
      userId: user.id,
      displayMoniker: 'Vessel-09',
      isPromotedAccount: !Boolean(user.is_anonymous),
      boundEmail: user.email ?? null,
    };
  }

  public async promoteAccount(method: AuthPromoteMethod, email?: string) {
    if (method === 'magic_link') {
      const clean = (email ?? '').trim();
      if (!clean.includes('@')) throw new Error('请输入有效炼金契约邮箱地址');
      const { data, error } = await this.sdk.auth.updateUser({ email: clean });
      if (error) throw new Error(error.message);
      return {
        ok: true,
        session: { userId: data.user.id, displayMoniker: 'Vessel-09', isPromotedAccount: true, boundEmail: clean },
        messageZh: `已向 ${clean} 发送 Magic Link 转正信标（原 UID 存档零丢失继承）`,
      };
    }
    const { error } = await this.sdk.auth.linkIdentity({ provider: method });
    if (error) throw new Error(error.message);
    const { data } = await this.sdk.auth.getUser();
    return {
      ok: true,
      session: { userId: data.user?.id ?? 'unknown', displayMoniker: 'Vessel-09', isPromotedAccount: true, boundEmail: data.user?.email ?? null },
      messageZh: `已发起 ${method.toUpperCase()} 身份绑定（存档原位保留）`,
    };
  }

  public async mergeMetaProgression(local: MetaProgressionRecord): Promise<MetaProgressionRecord> {
    const { data, error } = await this.sdk.rpc('merge_meta_progression', {
      p_schema_version: 1,
      p_unlocked_runes: local.unlockedRunes,
      p_unlocked_weapons: local.unlockedWeapons,
      p_unlocked_skills: local.unlockedSkills,
      p_unlocked_mutations: local.unlockedMutations,
      p_discovered_lore_ids: local.discoveredLoreIds,
      p_seen_npc_dialogue_ids: local.seenNpcDialogueIds,
      p_true_ending_flags: local.trueEndingFlags,
      p_blueprint_ichor_map: local.blueprintIchorMap,
      p_forge_tier_progress: local.forgeTierProgress,
      p_bestiary_kill_counts: local.bestiaryKillCounts,
      p_banked_ichor: local.bankedIchor,
      p_max_crucible_heat: local.maxCrucibleHeat,
      p_total_runs_started: local.totalRunsStarted,
      p_total_runs_cleared: local.totalRunsCleared,
      p_payload_sha256: local.payloadSha256,
    });
    if (error || !data) throw new Error(error?.message ?? 'RPC merge_meta_progression failed');
    const row = data as Record<string, unknown>;
    return signMetaProgression({
      schemaVersion: 1,
      unlockedRunes: (row.unlocked_runes as string[]) ?? [],
      unlockedWeapons: (row.unlocked_weapons as string[]) ?? [],
      unlockedSkills: (row.unlocked_skills as string[]) ?? [],
      unlockedMutations: (row.unlocked_mutations as string[]) ?? [],
      discoveredLoreIds: (row.discovered_lore_ids as string[]) ?? [],
      seenNpcDialogueIds: (row.seen_npc_dialogue_ids as string[]) ?? [],
      trueEndingFlags: (row.true_ending_flags as string[]) ?? [],
      blueprintIchorMap: (row.blueprint_ichor_map as Record<string, number>) ?? {},
      forgeTierProgress: row.forge_tier_progress as ForgeTierProgressMap,
      bestiaryKillCounts: (row.bestiary_kill_counts as Record<string, number>) ?? {},
      bankedIchor: Number(row.banked_ichor ?? 0),
      maxCrucibleHeat: Number(row.max_crucible_heat ?? 0) as 0 | 1 | 2 | 3 | 4 | 5,
      totalRunsStarted: Number(row.total_runs_started ?? 0),
      totalRunsCleared: Number(row.total_runs_cleared ?? 0),
      crdtRevision: Number(row.crdt_revision ?? 1),
    });
  }

  public async fetchActiveRunSnapshot(): Promise<ActiveRunSnapshot | null> {
    if (this.injectedOverride) return this.injectedOverride;
    const { data, error } = await this.sdk.from('active_run_snapshots').select('*').maybeSingle();
    if (error || !data) return null;
    return mapSnakeRowToSnapshot(data as SnakeRunRow);
  }

  public async pushActiveRunSnapshot(local: ActiveRunSnapshot, forceOverwrite = false): Promise<PushSnapshotRpcOutcome> {
    if (this.injectedOverride && !forceOverwrite) return { status: 'CONFLICT', remoteSnapshot: this.injectedOverride };
    this.injectedOverride = null;
    const { data, error } = await this.sdk.rpc('push_active_run_snapshot', {
      p_run_id: local.runId, p_schema_version: 1, p_lifecycle_state: local.lifecycleState,
      p_device_id: local.deviceId, p_device_label: local.deviceLabel, p_run_seed: local.runSeed,
      p_rng_internal_state: local.rngInternalState, p_rng_step_count: local.rngStepCount,
      p_biome_id: local.biomeId, p_biome_depth: local.biomeDepth, p_current_room_id: local.currentRoomId,
      p_spawn_checkpoint_id: local.spawnCheckpointId, p_playtime_ms: local.playtimeMs,
      p_player_snapshot: local.playerSnapshot, p_loadout_summary: local.loadoutSummary,
      p_world_delta: local.worldDelta, p_base_revision: local.baseRevision,
      p_payload_sha256: local.payloadSha256, p_client_saved_at: local.clientSavedAt, p_force_overwrite: forceOverwrite,
    });
    if (error || !data) throw new Error(error?.message ?? 'RPC push_active_run_snapshot failed');
    const res = data as { status: 'COMMITTED' | 'NO_OP' | 'CONFLICT'; snapshot?: SnakeRunRow; remote_snapshot?: SnakeRunRow };
    if (res.status === 'CONFLICT' && res.remote_snapshot) return { status: 'CONFLICT', remoteSnapshot: mapSnakeRowToSnapshot(res.remote_snapshot) };
    return { status: res.status === 'NO_OP' ? 'NO_OP' : 'COMMITTED', snapshot: mapSnakeRowToSnapshot(res.snapshot!) };
  }

  public async archiveRunHistory(entry: RunHistoryLogEntry): Promise<void> {
    const { data: u } = await this.sdk.auth.getUser();
    if (!u.user) return;
    await this.sdk.from('run_history_logs').upsert({
      user_id: u.user.id, run_id: entry.runId, outcome: entry.outcome, run_seed: entry.runSeed,
      reached_biome: entry.reachedBiome, killed_by_id: entry.killedById,
      playtime_ms: entry.playtimeMs, final_loadout: entry.finalLoadout, finished_at: entry.finishedAt,
    });
  }

  public injectSimulatedRemoteSnapshot(remote: ActiveRunSnapshot): void { this.injectedOverride = remote; }
}

export function createCloudSaveGateway(): ICloudSaveGateway {
  const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
  const url = env.VITE_SUPABASE_URL?.trim();
  const key = env.VITE_SUPABASE_ANON_KEY?.trim();
  if (url && key) return new SupabaseCloudGateway(url, key);
  return new LoopbackCloudGateway();
}
