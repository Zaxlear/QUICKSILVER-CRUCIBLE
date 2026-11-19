/**
 * 双轨存档 TypeScript 接口导出、跨引擎递归规范化 JSON 与 WebCrypto SHA-256 防篡改签名校验器
 * （src/storage/SaveSchema.ts）。
 *
 * 100% 对齐 docs/01_ARCHITECTURE_AND_SYNC.md §3.2。
 */

import {
  DEFAULT_FORGE_TIER_PROGRESS,
  DEFAULT_STARTER_MUTATIONS,
  DEFAULT_STARTER_SKILLS,
  DEFAULT_STARTER_WEAPONS,
  INTEGRITY_DOMAIN_SALT,
  type ActiveRunSnapshot,
  type BiomeId,
  type CloudSyncStatusSnapshot,
  type DroppedFloorLootEntry,
  type ForgeGrade,
  type ForgeTierProgressMap,
  type LoadoutVisualSummary,
  type MetaProgressionRecord,
  type PlayerRunStateSnapshot,
  type QualityTier,
  type RunHistoryLogEntry,
  type RunLifecycleState,
  type SaveConflictChoice,
  type SaveConflictModalPayload,
  type SerializedSkillInstance,
  type SerializedWeaponInstance,
  type SkillId,
  type SnapshotConflictState,
  type StatColor,
  type SyncConnectionMode,
  type WeaponId,
  type WorldDeltaSnapshot,
} from '../data/storage.data';

export type {
  ActiveRunSnapshot,
  BiomeId,
  CloudSyncStatusSnapshot,
  DroppedFloorLootEntry,
  ForgeGrade,
  ForgeTierProgressMap,
  LoadoutVisualSummary,
  MetaProgressionRecord,
  PlayerRunStateSnapshot,
  QualityTier,
  RunHistoryLogEntry,
  RunLifecycleState,
  SaveConflictChoice,
  SaveConflictModalPayload,
  SerializedSkillInstance,
  SerializedWeaponInstance,
  SkillId,
  SnapshotConflictState,
  StatColor,
  SyncConnectionMode,
  WeaponId,
  WorldDeltaSnapshot,
};

const EXCLUDED_CANONICAL_KEYS = new Set<string>([
  'payloadSha256',
  'revision',
  'baseRevision',
  'crdtRevision',
]);

/**
 * 递归键排序规范化序列化：
 * 确保跨浏览器 V8 (Chromium) 与 JavaScriptCore (iOS Safari/PWA) 属性枚举顺序 100% 比特级一致。
 */
export function canonicalizeJson(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalizeJson).join(',')}]`;
  }
  const record = value as Record<string, unknown>;
  const sortedKeys = Object.keys(record)
    .filter((k) => !EXCLUDED_CANONICAL_KEYS.has(k) && record[k] !== undefined)
    .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const pairs = sortedKeys.map((k) => `${JSON.stringify(k)}:${canonicalizeJson(record[k])}`);
  return `{${pairs.join(',')}}`;
}

/** 计算存档载荷的加盐 SHA-256 十六进制签名（64 位小写 HEX） */
export async function computeSaveSha256(payload: unknown): Promise<string> {
  const canonical = `${INTEGRITY_DOMAIN_SALT}:${canonicalizeJson(payload)}`;
  const bytes = new TextEncoder().encode(canonical);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** 校验存档对象的 payloadSha256 签名完整性，拦截任何直接篡改 IndexedDB 字段的行为 */
export async function verifySaveSha256(
  payload: { readonly payloadSha256: string } | null | undefined
): Promise<boolean> {
  if (!payload || typeof payload.payloadSha256 !== 'string') return false;
  if (!/^[0-9a-f]{64}$/.test(payload.payloadSha256)) return false;
  const expected = await computeSaveSha256(payload);
  return expected === payload.payloadSha256;
}

export type UnsignedMetaProgression = Omit<MetaProgressionRecord, 'payloadSha256'>;
export type UnsignedActiveRunSnapshot = Omit<ActiveRunSnapshot, 'payloadSha256'>;

export async function signMetaProgression(
  draft: UnsignedMetaProgression
): Promise<MetaProgressionRecord> {
  const payloadSha256 = await computeSaveSha256(draft);
  return { ...draft, payloadSha256 };
}

export async function signActiveRunSnapshot(
  draft: UnsignedActiveRunSnapshot
): Promise<ActiveRunSnapshot> {
  const payloadSha256 = await computeSaveSha256(draft);
  return { ...draft, payloadSha256 };
}

export function createDefaultUnsignedMetaProgression(): UnsignedMetaProgression {
  return {
    schemaVersion: 1,
    unlockedRunes: [],
    unlockedWeapons: [...DEFAULT_STARTER_WEAPONS],
    unlockedSkills: [...DEFAULT_STARTER_SKILLS],
    unlockedMutations: [...DEFAULT_STARTER_MUTATIONS],
    discoveredLoreIds: [],
    seenNpcDialogueIds: [],
    trueEndingFlags: [],
    blueprintIchorMap: {},
    forgeTierProgress: { ...DEFAULT_FORGE_TIER_PROGRESS },
    bestiaryKillCounts: {},
    bankedIchor: 0,
    maxCrucibleHeat: 0,
    totalRunsStarted: 0,
    totalRunsCleared: 0,
    crdtRevision: 1,
  };
}

export async function createDefaultMetaProgression(): Promise<MetaProgressionRecord> {
  return signMetaProgression(createDefaultUnsignedMetaProgression());
}

/** 使用 Web Crypto CSPRNG 生成符合 RFC 4122 的 UUID v4（严禁调用 Math.random） */
export function createSecureUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
