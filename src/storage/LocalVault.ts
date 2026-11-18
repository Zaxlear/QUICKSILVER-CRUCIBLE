/**
 * Dexie.js (IndexedDB) 本地毫秒级原子事务金库与 SHA-256 主备双槽防篡改自愈引擎
 * （src/storage/LocalVault.ts）。
 */

import Dexie, { type Table } from 'dexie';
import type {
  ActiveRunSnapshot,
  MetaProgressionRecord,
  RunHistoryLogEntry,
} from '../data/storage.data';
import {
  createDefaultMetaProgression,
  createSecureUuid,
  signActiveRunSnapshot,
  signMetaProgression,
  verifySaveSha256,
} from './SaveSchema';

export type VaultSlotKey = 'primary' | 'backup';

export interface MetaSlotRow {
  readonly slotKey: VaultSlotKey;
  readonly record: MetaProgressionRecord;
  readonly savedAtMs: number;
}

export interface RunSlotRow {
  readonly slotKey: VaultSlotKey;
  readonly snapshot: ActiveRunSnapshot;
  readonly updatedAtMs: number;
}

export interface DeviceIdentityRow {
  readonly key: 'identity';
  readonly deviceId: string;
  readonly deviceLabel: string;
}

export interface RunHistoryRow extends RunHistoryLogEntry {
  readonly id?: number;
}

export interface VaultLoadResult<T> {
  readonly data: T;
  readonly tamperDetected: boolean;
  readonly recoveredFromBackup: boolean;
}

export class CrucibleDexieDatabase extends Dexie {
  public metaSlots!: Table<MetaSlotRow, VaultSlotKey>;
  public runSlots!: Table<RunSlotRow, VaultSlotKey>;
  public deviceProfile!: Table<DeviceIdentityRow, 'identity'>;
  public runHistory!: Table<RunHistoryRow, number>;

  public constructor(dbName = 'QuicksilverCrucibleVault') {
    super(dbName);
    this.version(1).stores({
      metaSlots: 'slotKey',
      runSlots: 'slotKey',
      deviceProfile: 'key',
      runHistory: '++id, runId, finishedAt',
    });
  }
}

export function detectDefaultDeviceLabel(): string {
  if (typeof navigator === 'undefined') return 'Node Test Harness';
  const ua = navigator.userAgent || '';
  const standalone =
    (typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(display-mode: standalone)').matches) ||
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  const suffix = standalone ? 'PWA' : 'WebGL';
  if (/iPhone/i.test(ua)) return `iPhone Pro · ${suffix}`;
  if (/iPad/i.test(ua)) return `iPad Pro · ${suffix}`;
  if (/Android/i.test(ua)) return `Android Handheld · ${suffix}`;
  if (/Mac/i.test(ua)) return `macOS Desktop · ${suffix}`;
  if (/Win/i.test(ua)) return `Windows Desktop · ${suffix}`;
  return `Linux Desktop · ${suffix}`;
}

export class LocalVault {
  public readonly rawDb: CrucibleDexieDatabase;
  private tamperInterceptions = 0;
  private stagedMeta: MetaProgressionRecord | null = null;
  private stagedRun: ActiveRunSnapshot | null = null;

  public constructor(dbName = 'QuicksilverCrucibleVault') {
    this.rawDb = new CrucibleDexieDatabase(dbName);
  }

  public get tamperInterceptCount(): number { return this.tamperInterceptions; }

  public async getOrCreateDeviceIdentity(
    overrideLabel?: string
  ): Promise<{ readonly deviceId: string; readonly deviceLabel: string }> {
    const existing = await this.rawDb.deviceProfile.get('identity');
    if (existing && existing.deviceId.length > 0) {
      return { deviceId: existing.deviceId, deviceLabel: existing.deviceLabel };
    }
    const created: DeviceIdentityRow = {
      key: 'identity',
      deviceId: `dev_${createSecureUuid().slice(0, 12)}`,
      deviceLabel: overrideLabel ?? detectDefaultDeviceLabel(),
    };
    await this.rawDb.deviceProfile.put(created);
    return { deviceId: created.deviceId, deviceLabel: created.deviceLabel };
  }

  public async saveMeta(record: MetaProgressionRecord): Promise<MetaProgressionRecord> {
    const signed = (await verifySaveSha256(record)) ? record : await signMetaProgression(record);
    const curPrimary = await this.rawDb.metaSlots.get('primary');
    const curPrimaryValid = curPrimary ? await verifySaveSha256(curPrimary.record) : false;
    const now = Date.now();

    await this.rawDb.transaction('rw', this.rawDb.metaSlots, async () => {
      if (curPrimary && curPrimaryValid) {
        await this.rawDb.metaSlots.put({ slotKey: 'backup', record: curPrimary.record, savedAtMs: curPrimary.savedAtMs });
      } else if (!curPrimary) {
        await this.rawDb.metaSlots.put({ slotKey: 'backup', record: signed, savedAtMs: now });
      }
      await this.rawDb.metaSlots.put({ slotKey: 'primary', record: signed, savedAtMs: now });
    });
    this.stagedMeta = null;
    return signed;
  }

  public async loadMeta(): Promise<VaultLoadResult<MetaProgressionRecord>> {
    const primary = await this.rawDb.metaSlots.get('primary');
    if (!primary) {
      const fresh = await createDefaultMetaProgression();
      const now = Date.now();
      await this.rawDb.metaSlots.bulkPut([
        { slotKey: 'primary', record: fresh, savedAtMs: now },
        { slotKey: 'backup', record: fresh, savedAtMs: now },
      ]);
      return { data: fresh, tamperDetected: false, recoveredFromBackup: false };
    }
    if (await verifySaveSha256(primary.record)) {
      return { data: primary.record, tamperDetected: false, recoveredFromBackup: false };
    }

    this.tamperInterceptions += 1;
    const backup = await this.rawDb.metaSlots.get('backup');
    if (backup && (await verifySaveSha256(backup.record))) {
      await this.rawDb.metaSlots.put({ slotKey: 'primary', record: backup.record, savedAtMs: Date.now() });
      return { data: backup.record, tamperDetected: true, recoveredFromBackup: true };
    }

    const fallback = await createDefaultMetaProgression();
    const now = Date.now();
    await this.rawDb.metaSlots.bulkPut([
      { slotKey: 'primary', record: fallback, savedAtMs: now },
      { slotKey: 'backup', record: fallback, savedAtMs: now },
    ]);
    return { data: fallback, tamperDetected: true, recoveredFromBackup: false };
  }

  public async saveActiveRun(snapshot: ActiveRunSnapshot): Promise<ActiveRunSnapshot> {
    const signed = (await verifySaveSha256(snapshot)) ? snapshot : await signActiveRunSnapshot(snapshot);
    const curPrimary = await this.rawDb.runSlots.get('primary');
    const curPrimaryValid = curPrimary ? await verifySaveSha256(curPrimary.snapshot) : false;
    const now = Date.now();

    await this.rawDb.transaction('rw', this.rawDb.runSlots, async () => {
      if (curPrimary && curPrimaryValid) {
        await this.rawDb.runSlots.put({ slotKey: 'backup', snapshot: curPrimary.snapshot, updatedAtMs: curPrimary.updatedAtMs });
      } else if (!curPrimary) {
        await this.rawDb.runSlots.put({ slotKey: 'backup', snapshot: signed, updatedAtMs: now });
      }
      await this.rawDb.runSlots.put({ slotKey: 'primary', snapshot: signed, updatedAtMs: now });
    });
    this.stagedRun = null;
    return signed;
  }

  public async loadActiveRun(): Promise<VaultLoadResult<ActiveRunSnapshot | null>> {
    const primary = await this.rawDb.runSlots.get('primary');
    if (!primary) return { data: null, tamperDetected: false, recoveredFromBackup: false };
    if (await verifySaveSha256(primary.snapshot)) {
      return { data: primary.snapshot, tamperDetected: false, recoveredFromBackup: false };
    }

    this.tamperInterceptions += 1;
    const backup = await this.rawDb.runSlots.get('backup');
    if (backup && (await verifySaveSha256(backup.snapshot)) && backup.snapshot.payloadSha256 !== primary.snapshot.payloadSha256) {
      await this.rawDb.runSlots.put({ slotKey: 'primary', snapshot: backup.snapshot, updatedAtMs: Date.now() });
      return { data: backup.snapshot, tamperDetected: true, recoveredFromBackup: true };
    }
    if (backup && (await verifySaveSha256(backup.snapshot))) {
      await this.rawDb.runSlots.put({ slotKey: 'primary', snapshot: backup.snapshot, updatedAtMs: Date.now() });
      return { data: backup.snapshot, tamperDetected: true, recoveredFromBackup: true };
    }

    await this.rawDb.runSlots.clear();
    return { data: null, tamperDetected: true, recoveredFromBackup: false };
  }

  public async appendRunHistory(entry: RunHistoryLogEntry): Promise<void> {
    await this.rawDb.runHistory.put({ ...entry });
  }

  public stageForImmediateFlush(meta: MetaProgressionRecord | null, run: ActiveRunSnapshot | null): void {
    if (meta) this.stagedMeta = meta;
    if (run) this.stagedRun = run;
  }

  public async flushImmediate(): Promise<void> {
    const pendingMeta = this.stagedMeta;
    const pendingRun = this.stagedRun;
    this.stagedMeta = null;
    this.stagedRun = null;
    if (pendingMeta) await this.saveMeta(pendingMeta);
    if (pendingRun) await this.saveActiveRun(pendingRun);
  }

  public async closeAndDelete(): Promise<void> {
    this.rawDb.close();
    await Dexie.delete(this.rawDb.name);
  }
}
