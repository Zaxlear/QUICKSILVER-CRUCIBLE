/**
 * 浏览器生命周期（visibilitychange / pagehide / online / offline）、EventBus 同步绑定与快照仲裁执行器
 * （src/storage/CloudSyncBindings.ts）。
 *
 * 严格遵循移动端零丢档铁律：绝不依赖 iOS Safari/PWA 不触发的 beforeunload。
 */

import { EventBus } from '../core/EventBus';
import { NarrativeStore } from '../core/NarrativeSessionStore';
import type {
  ActiveRunSnapshot,
  AuthPromoteMethod,
  CloudSyncStatusSnapshot,
  MetaProgressionRecord,
  SaveConflictChoice,
} from '../data/storage.data';
import { mergeMetaProgressions } from './CrdtMetaMerger';
import type { LocalVault } from './LocalVault';
import { buildFallbackSanctumLocalSnapshot, syncNarrativeIntoMetaRecord } from './MetaSyncHelpers';
import { buildSimulatedDivergentRemoteSnapshot } from './RunSnapshotBuilder';
import type { SnapshotConflictMachine } from './SnapshotConflictMachine';
import type { AuthSessionSummary, ICloudSaveGateway } from './SupabaseClient';

export function detectInitialOnlineState(): boolean {
  return typeof navigator !== 'undefined'
    ? navigator.onLine !== false &&
        (typeof sessionStorage === 'undefined' || sessionStorage.getItem('qc_qa_offline_sim') !== '1')
    : true;
}

export async function stageSimulatedDivergentRun(
  vault: LocalVault,
  gateway: ICloudSaveGateway,
  currentSnap: ActiveRunSnapshot | null,
  deviceId: string,
  deviceLabel: string
): Promise<ActiveRunSnapshot> {
  const localSnap =
    currentSnap && currentSnap.lifecycleState === 'ACTIVE'
      ? currentSnap
      : await buildFallbackSanctumLocalSnapshot(deviceId, deviceLabel);
  const saved = await vault.saveActiveRun(localSnap, true);
  gateway.injectSimulatedRemoteSnapshot(await buildSimulatedDivergentRemoteSnapshot(saved.runSeed));
  return saved;
}

export interface CloudSyncQaApi {
  getStatus(): CloudSyncStatusSnapshot | null;
  getActiveRun(): ActiveRunSnapshot | null;
  getMeta(): MetaProgressionRecord | null;
  simulateConflict(): Promise<void>;
  forceFlush(): Promise<void>;
}

declare global {
  interface Window {
    __QC_CLOUD_SYNC__?: CloudSyncQaApi;
  }
}

export interface SyncBindingCallbacks {
  readonly onMutateMeta: (
    patch?: { readonly killArchetypeId?: string; readonly forgeSpendIchor?: number },
    debounced?: boolean
  ) => void;
  readonly onToggleDrawer: (open?: boolean) => void;
  readonly onTriggerSync: () => void;
  readonly onSimulateConflict: () => Promise<void>;
  readonly onResolveConflict: (choice: SaveConflictChoice) => void;
  readonly onAuthPromote: (method: AuthPromoteMethod, email?: string) => void;
  readonly onEmergencyFlush: () => Promise<void>;
  readonly onOnlineChanged: (online: boolean) => void;
  readonly getQaStatus: () => CloudSyncStatusSnapshot | null;
  readonly getQaActiveRun: () => ActiveRunSnapshot | null;
  readonly getQaMeta: () => MetaProgressionRecord | null;
}

export async function executeMetaCrdtSyncStep(
  vault: LocalVault,
  gateway: ICloudSaveGateway,
  meta: MetaProgressionRecord,
  deviceId: string,
  deviceLabel: string
): Promise<{ readonly session: AuthSessionSummary; readonly mergedMeta: MetaProgressionRecord }> {
  const session = await gateway.ensureAnonymousSession(deviceId, deviceLabel);
  const localFreshMeta = await syncNarrativeIntoMetaRecord(meta);
  const remoteMeta = await gateway.mergeMetaProgression(localFreshMeta);
  const mergedMeta = await vault.saveMeta(await mergeMetaProgressions(localFreshMeta, remoteMeta), true);
  NarrativeStore.hydrateFromMeta(mergedMeta);
  return { session, mergedMeta };
}

export async function executeSnapshotArbitrationStep(params: {
  readonly fsm: SnapshotConflictMachine;
  readonly vault: LocalVault;
  readonly gateway: ICloudSaveGateway;
  readonly localRun: ActiveRunSnapshot | null;
  readonly localDirty: boolean;
  readonly hasLiveSceneCapturer: boolean;
  readonly onOpenConflict: (local: ActiveRunSnapshot, remote: ActiveRunSnapshot) => void;
}): Promise<{
  readonly nextActiveRun: ActiveRunSnapshot | null;
  readonly clearedDirty: boolean;
  readonly syncedMessageZh: string | null;
  readonly hotReloadSnapshot: ActiveRunSnapshot | null;
}> {
  const { fsm, vault, gateway, localRun, localDirty, hasLiveSceneCapturer, onOpenConflict } = params;
  const remoteRun = await gateway.fetchActiveRunSnapshot();
  const decision = fsm.evaluateSnapshots(localRun, remoteRun, localDirty);

  if (decision.nextState === 'AUTO_PULL_REMOTE' && remoteRun) {
    const changedRun = localRun?.runId !== remoteRun.runId;
    const saved = await vault.saveActiveRun(remoteRun);
    fsm.markTransferCompleted();
    return {
      nextActiveRun: saved, clearedDirty: true,
      syncedMessageZh: `已无缝接力拉取云端快照 (${remoteRun.deviceLabel})`,
      hotReloadSnapshot: changedRun && hasLiveSceneCapturer ? saved : null,
    };
  }

  if (decision.nextState === 'AUTO_PUSH_LOCAL' && localRun) {
    const res = await gateway.pushActiveRunSnapshot(localRun, false);
    if (res.status === 'CONFLICT') {
      fsm.evaluateSnapshots(localRun, res.remoteSnapshot, true);
      onOpenConflict(localRun, res.remoteSnapshot);
      return { nextActiveRun: localRun, clearedDirty: false, syncedMessageZh: null, hotReloadSnapshot: null };
    }
    const saved = await vault.saveActiveRun(res.snapshot);
    fsm.markTransferCompleted();
    return {
      nextActiveRun: saved, clearedDirty: true,
      syncedMessageZh: `双轨云同步完成 · REV #${res.snapshot.revision}`, hotReloadSnapshot: null,
    };
  }

  if (decision.nextState === 'CONFLICT_MODAL_OPEN' && localRun && remoteRun) {
    onOpenConflict(localRun, remoteRun);
    return { nextActiveRun: localRun, clearedDirty: false, syncedMessageZh: null, hotReloadSnapshot: null };
  }

  return {
    nextActiveRun: localRun, clearedDirty: false,
    syncedMessageZh: 'CRDT 局外并集与局内快照均已同步最新', hotReloadSnapshot: null,
  };
}

export function emitSaveConflictModalEvents(local: ActiveRunSnapshot, remote: ActiveRunSnapshot): void {
  EventBus.emit('save:conflict_detected', { localRunId: local.runId, remoteRunId: remote.runId });
  EventBus.emit('save:conflict_modal_updated', {
    open: true,
    localSnapshot: local,
    remoteSnapshot: remote,
    detectedAt: new Date().toISOString(),
  });
}

export async function executeConflictResolutionStep(params: {
  readonly choice: SaveConflictChoice;
  readonly fsm: SnapshotConflictMachine;
  readonly vault: LocalVault;
  readonly gateway: ICloudSaveGateway;
  readonly hasLiveSceneCapturer: boolean;
}): Promise<{
  readonly committedSnapshot: ActiveRunSnapshot;
  readonly statusMessageZh: string;
  readonly shouldHotReload: boolean;
}> {
  const { choice, fsm, vault, gateway, hasLiveSceneCapturer } = params;
  const resolved = fsm.resolveUserConflictChoice(choice);
  EventBus.emit('save:conflict_modal_updated', null);

  if (resolved.actionState === 'FORCE_PUSH_LOCAL') {
    const res = await gateway.pushActiveRunSnapshot(resolved.chosenSnapshot, true);
    const saved = await vault.saveActiveRun(res.status === 'CONFLICT' ? resolved.chosenSnapshot : res.snapshot);
    fsm.markTransferCompleted();
    return {
      committedSnapshot: saved,
      statusMessageZh: `已保留本机进度并覆写云端 · REV #${saved.revision}`,
      shouldHotReload: !hasLiveSceneCapturer,
    };
  }

  const saved = await vault.saveActiveRun(resolved.chosenSnapshot);
  fsm.markTransferCompleted();
  return {
    committedSnapshot: saved,
    statusMessageZh: `已继承云端进度 (${saved.deviceLabel}) 并热切房间`,
    shouldHotReload: true,
  };
}

export function bindCloudSyncListeners(win: Window | undefined, cb: SyncBindingCallbacks): () => void {
  const unbinds: Array<() => void> = [
    EventBus.on('combat:enemy_killed', ({ archetypeId }) => cb.onMutateMeta({ killArchetypeId: archetypeId }, true)),
    EventBus.on('world:rune_unlocked', () => cb.onMutateMeta()),
    EventBus.on('narrative:seal_collected', () => cb.onMutateMeta()),
    EventBus.on('ui:command:invest_forge_ichor', ({ amount }) => cb.onMutateMeta({ forgeSpendIchor: amount ?? 25 })),
    EventBus.on('ui:command:invest_blueprint_ichor', () => cb.onMutateMeta()),
    EventBus.on('ui:command:toggle_auth_drawer', ({ open }) => cb.onToggleDrawer(open)),
    EventBus.on('ui:command:toggle_offline_mode', ({ offline }) => {
      const nextOffline = offline !== undefined ? offline : cb.getQaStatus()?.isNetworkOnline !== false;
      try {
        if (typeof sessionStorage !== 'undefined') {
          if (nextOffline) sessionStorage.setItem('qc_qa_offline_sim', '1');
          else sessionStorage.removeItem('qc_qa_offline_sim');
        }
      } catch { /* ignore storage quota */ }
      cb.onOnlineChanged(!nextOffline);
    }),
    EventBus.on('ui:command:trigger_cloud_sync', () => cb.onTriggerSync()),
    EventBus.on('ui:command:simulate_save_conflict', () => { void cb.onSimulateConflict(); }),
    EventBus.on('ui:command:resolve_save_conflict', ({ choice }) => cb.onResolveConflict(choice)),
    EventBus.on('ui:command:auth_promote', ({ method, email }) => cb.onAuthPromote(method, email)),
  ];

  if (!win) return () => { for (const off of unbinds) off(); };

  const onVisChange = (): void => {
    if (document.visibilityState === 'hidden') void cb.onEmergencyFlush();
    else cb.onTriggerSync();
  };
  const onPageHide = (): void => { void cb.onEmergencyFlush(); };
  const onOnline = (): void => cb.onOnlineChanged(true);
  const onOffline = (): void => cb.onOnlineChanged(false);

  document.addEventListener('visibilitychange', onVisChange);
  win.addEventListener('pagehide', onPageHide);
  win.addEventListener('online', onOnline);
  win.addEventListener('offline', onOffline);

  win.__QC_CLOUD_SYNC__ = {
    getStatus: cb.getQaStatus, getActiveRun: cb.getQaActiveRun, getMeta: cb.getQaMeta,
    simulateConflict: cb.onSimulateConflict, forceFlush: cb.onEmergencyFlush,
  };

  return () => {
    document.removeEventListener('visibilitychange', onVisChange);
    win.removeEventListener('pagehide', onPageHide);
    win.removeEventListener('online', onOnline);
    win.removeEventListener('offline', onOffline);
    for (const off of unbinds) off();
  };
}
