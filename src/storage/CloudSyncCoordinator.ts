/**
 * 跨房间检查点、移动端切后台毫秒级落盘与双轨云同步总调度器（src/storage/CloudSyncCoordinator.ts）。
 */

import { EventBus } from '../core/EventBus';
import { NarrativeStore } from '../core/NarrativeSessionStore';
import type {
  ActiveRunSnapshot, AuthPromoteMethod, CloudSyncStatusSnapshot, MetaProgressionRecord, SaveConflictChoice,
} from '../data/storage.data';
import {
  bindCloudSyncListeners, emitSaveConflictModalEvents, executeConflictResolutionStep,
  executeMetaCrdtSyncStep, executeSnapshotArbitrationStep,
} from './CloudSyncBindings';
import { LocalVault } from './LocalVault';
import {
  buildCloudSyncStatusSnapshot, buildFallbackSanctumLocalSnapshot,
  buildRunHistoryArchiveEntry, syncNarrativeIntoMetaRecord,
} from './MetaSyncHelpers';
import { buildSimulatedDivergentRemoteSnapshot } from './RunSnapshotBuilder';
import { createDefaultMetaProgression, createSecureUuid } from './SaveSchema';
import { SnapshotConflictMachine } from './SnapshotConflictMachine';
import { createCloudSaveGateway, type AuthSessionSummary, type ICloudSaveGateway } from './SupabaseClient';

export class CloudSyncCoordinator {
  public readonly vault: LocalVault;
  public readonly gateway: ICloudSaveGateway;
  public readonly fsm = new SnapshotConflictMachine();

  private meta: MetaProgressionRecord | null = null;
  private activeRun: ActiveRunSnapshot | null = null;
  private currentRunId = createSecureUuid();
  private runStartedAtMs = Date.now();
  private localRunDirty = false;
  private drawerOpen = false;
  private pwaSwReady = false;
  private isOnline =
    typeof navigator !== 'undefined'
      ? navigator.onLine !== false &&
        (typeof sessionStorage === 'undefined' || sessionStorage.getItem('qc_qa_offline_sim') !== '1')
      : true;
  private deviceId = 'dev_pending';
  private deviceLabel = 'Desktop · WebGL';
  private lastSyncedAt: string | null = null;
  private statusMessageZh = 'Local-First 防篡改金库预热中...';
  private session: AuthSessionSummary = {
    userId: 'anon_local', displayMoniker: 'Vessel-09', isPromotedAccount: false, boundEmail: null,
  };
  private liveRunCapturer: (() => Promise<ActiveRunSnapshot | null>) | null = null;
  private bootPromise: Promise<void> | null = null;

  public constructor(vault?: LocalVault, gateway?: ICloudSaveGateway) {
    this.vault = vault ?? new LocalVault();
    this.gateway = gateway ?? createCloudSaveGateway();
  }

  public get activeRunId(): string { return this.currentRunId; }
  public get currentPlaytimeMs(): number { return Math.max(0, Date.now() - this.runStartedAtMs); }
  public get currentRevision(): number { return this.activeRun?.revision ?? 1; }
  public get currentBaseRevision(): number { return this.activeRun?.baseRevision ?? 0; }
  public get deviceIdentity() { return { deviceId: this.deviceId, deviceLabel: this.deviceLabel }; }

  public setPwaSwReady(ready: boolean): void {
    this.pwaSwReady = ready;
    this.emitStatus(ready ? 'PWA Service Worker 全量离线预缓存已就绪' : undefined);
  }

  public registerLiveRunCapturer(fn: (() => Promise<ActiveRunSnapshot | null>) | null): void {
    this.liveRunCapturer = fn;
  }

  public bootstrap(win?: Window): Promise<void> {
    if (!this.bootPromise) this.bootPromise = this.runBootstrap(win);
    return this.bootPromise;
  }

  public async waitUntilBootReady(): Promise<ActiveRunSnapshot | null> {
    if (this.bootPromise) await this.bootPromise;
    return this.activeRun?.lifecycleState === 'ACTIVE' ? this.activeRun : null;
  }

  public beginNewRunSession(initialCarryPlaytimeMs = 0): string {
    this.currentRunId = createSecureUuid();
    this.runStartedAtMs = Date.now() - initialCarryPlaytimeMs;
    this.localRunDirty = true;
    void this.mutateMeta({ startedNewRun: true });
    return this.currentRunId;
  }

  public adoptLoadedRunTiming(snap: ActiveRunSnapshot): void {
    this.currentRunId = snap.runId;
    this.runStartedAtMs = Date.now() - snap.playtimeMs;
  }

  public async saveCheckpointSnapshot(snapshot: ActiveRunSnapshot): Promise<void> {
    this.activeRun = await this.vault.saveActiveRun(snapshot);
    this.localRunDirty = true;
    this.emitStatus(`已落盘房间检查点 ${snapshot.currentRoomId} (SHA-256)`);
    if (this.isOnline) void this.syncWithCloud();
  }

  public async finalizeRunOutcome(outcome: 'VICTORY' | 'DEAD' | 'ABANDONED', finalSnap: ActiveRunSnapshot, killedById: string | null = null): Promise<void> {
    const closed: ActiveRunSnapshot = { ...finalSnap, lifecycleState: outcome };
    this.activeRun = await this.vault.saveActiveRun(closed);
    this.localRunDirty = true;
    const entry = buildRunHistoryArchiveEntry(closed, outcome, killedById);
    await this.vault.appendRunHistory(entry);
    await this.mutateMeta({ bankedIchorDelta: outcome === 'VICTORY' ? closed.playerSnapshot.unbankedIchor : 0, clearedRun: outcome === 'VICTORY' });
    if (this.isOnline) { await this.gateway.archiveRunHistory(entry); await this.syncWithCloud(); }
  }

  public async syncWithCloud(): Promise<void> {
    if (!this.meta) this.meta = await createDefaultMetaProgression();
    if (!this.isOnline) {
      this.fsm.notifyNetworkOffline();
      this.emitStatus('当前处于离线模式，Dexie 本地防篡改保护生效中');
      return;
    }
    try {
      this.fsm.notifyNetworkOnline();
      const metaOut = await executeMetaCrdtSyncStep(this.vault, this.gateway, this.meta, this.deviceId, this.deviceLabel);
      this.session = metaOut.session;
      this.meta = metaOut.mergedMeta;

      this.fsm.advanceMetaSyncToArbitration();
      if (this.liveRunCapturer && this.localRunDirty) {
        const live = await this.liveRunCapturer();
        if (live) this.activeRun = await this.vault.saveActiveRun(live);
      }

      const arb = await executeSnapshotArbitrationStep({
        fsm: this.fsm, vault: this.vault, gateway: this.gateway,
        localRun: this.activeRun, localDirty: this.localRunDirty,
        hasLiveSceneCapturer: Boolean(this.liveRunCapturer),
        onOpenConflict: (loc, rem) => {
          emitSaveConflictModalEvents(loc, rem);
          this.emitStatus('检测到双端离线分叉！请在对比卡片中选择要接力的进度');
        },
      });
      this.activeRun = arb.nextActiveRun;
      if (this.activeRun?.lifecycleState === 'ACTIVE') this.adoptLoadedRunTiming(this.activeRun);
      if (arb.clearedDirty) this.localRunDirty = false;
      if (arb.syncedMessageZh) { this.lastSyncedAt = new Date().toISOString(); this.emitStatus(arb.syncedMessageZh); }
      if (arb.hotReloadSnapshot) EventBus.emit('save:hot_reload_snapshot', { snapshot: arb.hotReloadSnapshot });
    } catch (err) {
      this.fsm.notifyNetworkOffline();
      this.emitStatus(`云端暂不可达（已降级本地金库）：${err instanceof Error ? err.message : 'offline'}`);
    }
  }

  public async simulateDivergentConflict(): Promise<void> {
    let localSnap = this.liveRunCapturer ? await this.liveRunCapturer() : this.activeRun;
    if (!localSnap || localSnap.lifecycleState !== 'ACTIVE') {
      localSnap = await buildFallbackSanctumLocalSnapshot(this.deviceId, this.deviceLabel);
    }
    this.activeRun = await this.vault.saveActiveRun(localSnap);
    this.localRunDirty = true;
    this.gateway.injectSimulatedRemoteSnapshot(await buildSimulatedDivergentRemoteSnapshot(localSnap.runSeed));
    this.drawerOpen = false;
    await this.syncWithCloud();
  }

  public async resolveConflict(choice: SaveConflictChoice): Promise<void> {
    const out = await executeConflictResolutionStep({
      choice, fsm: this.fsm, vault: this.vault, gateway: this.gateway,
      hasLiveSceneCapturer: Boolean(this.liveRunCapturer),
    });
    this.activeRun = out.committedSnapshot;
    this.adoptLoadedRunTiming(this.activeRun);
    this.localRunDirty = false;
    this.lastSyncedAt = new Date().toISOString();
    this.emitStatus(out.statusMessageZh);
    if (out.shouldHotReload) EventBus.emit('save:hot_reload_snapshot', { snapshot: this.activeRun });
  }

  private async runBootstrap(win?: Window): Promise<void> {
    const id = await this.vault.getOrCreateDeviceIdentity();
    this.deviceId = id.deviceId;
    this.deviceLabel = id.deviceLabel;
    const metaLoad = await this.vault.loadMeta();
    this.meta = metaLoad.data;
    NarrativeStore.hydrateFromMeta(this.meta);
    const runLoad = await this.vault.loadActiveRun();
    this.activeRun = runLoad.data;
    if (this.activeRun?.lifecycleState === 'ACTIVE') this.adoptLoadedRunTiming(this.activeRun);

    this.fsm.finishBootLocalRead(this.isOnline);
    bindCloudSyncListeners(win, {
      onMutateMeta: (p) => { void this.mutateMeta(p); },
      onToggleDrawer: (o) => { this.drawerOpen = o !== undefined ? o : !this.drawerOpen; this.emitStatus(); },
      onTriggerSync: () => { void this.syncWithCloud(); },
      onSimulateConflict: () => this.simulateDivergentConflict(),
      onResolveConflict: (c) => { void this.resolveConflict(c); },
      onAuthPromote: (m, e) => { void this.handlePromote(m, e); },
      onEmergencyFlush: async () => {
        if (this.liveRunCapturer) {
          const snap = await this.liveRunCapturer();
          if (snap) this.vault.stageForImmediateFlush(this.meta, snap);
        }
        await this.vault.flushImmediate();
      },
      onOnlineChanged: (on) => {
        this.isOnline = on;
        if (on) void this.syncWithCloud();
        else { this.fsm.notifyNetworkOffline(); this.emitStatus('网络已断开 · 离线金库接管'); }
      },
      getQaStatus: () => (this.meta ? this.composeStatus() : null),
      getQaActiveRun: () => this.activeRun,
      getQaMeta: () => this.meta,
    });
    this.emitStatus(metaLoad.tamperDetected || runLoad.tamperDetected ? '拦截篡改并自动回退备份槽' : 'Dexie SHA-256 防篡改金库已唤醒');
    if (this.isOnline) await this.syncWithCloud();
  }

  private async handlePromote(method: AuthPromoteMethod, email?: string): Promise<void> {
    try {
      const res = await this.gateway.promoteAccount(method, email);
      this.session = res.session;
      this.emitStatus(res.messageZh);
    } catch (err) { this.emitStatus(err instanceof Error ? err.message : '账号绑定请求失败'); }
  }

  private async mutateMeta(patch?: Parameters<typeof syncNarrativeIntoMetaRecord>[1]): Promise<void> {
    if (!this.meta) return;
    this.meta = await this.vault.saveMeta(await syncNarrativeIntoMetaRecord(this.meta, patch));
    this.emitStatus();
  }

  private composeStatus(): CloudSyncStatusSnapshot {
    return buildCloudSyncStatusSnapshot({
      drawerOpen: this.drawerOpen, gatewayMode: this.gateway.mode, isOnline: this.isOnline,
      pwaSwReady: this.pwaSwReady, fsmState: this.fsm.state, session: this.session,
      deviceId: this.deviceId, deviceLabel: this.deviceLabel, lastSyncedAt: this.lastSyncedAt,
      statusMessageZh: this.statusMessageZh, tamperInterceptCount: this.vault.tamperInterceptCount,
      meta: this.meta!, activeRun: this.activeRun,
    });
  }

  private emitStatus(nextMessage?: string): void {
    if (nextMessage) this.statusMessageZh = nextMessage;
    if (!this.meta) return;
    EventBus.emit('save:sync_status_updated', this.composeStatus());
  }
}

export const CloudSync = new CloudSyncCoordinator();
