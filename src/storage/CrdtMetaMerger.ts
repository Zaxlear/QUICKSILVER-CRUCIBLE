/**
 * 局外永久成长客户端幂等集合并集（CvRDT Join-Semilattice Set-Union + Per-Key Max）合并引擎
 * （src/storage/CrdtMetaMerger.ts）。
 *
 * 严格满足：
 * 1. 交换律（Commutativity）：merge(A, B) === merge(B, A)
 * 2. 结合律（Associativity）：merge(merge(A, B), C) === merge(A, merge(B, C))
 * 3. 幂等律（Idempotence）  ：merge(A, A) === A
 * 100% 对齐 supabase/migrations/0001_initial_cloud_save.sql 中的 merge_meta_progression RPC 语义。
 */

import {
  DEFAULT_STARTER_MUTATIONS,
  DEFAULT_STARTER_SKILLS,
  DEFAULT_STARTER_WEAPONS,
  type ForgeTierProgressMap,
  type MetaProgressionRecord,
} from '../data/storage.data';
import { signMetaProgression, type UnsignedMetaProgression } from './SaveSchema';

/** 字符串数组幂等去重并按 ASCII 字典序稳定升序排列（零系统 Locale 依赖） */
export function setUnionSorted(...arrays: readonly (readonly string[] | undefined)[]): readonly string[] {
  const unique = new Set<string>();
  for (const arr of arrays) {
    if (!arr) continue;
    for (const raw of arr) {
      if (typeof raw === 'string' && raw.length > 0) {
        unique.add(raw);
      }
    }
  }
  return Array.from(unique).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

/** 单调非负数值字典逐键取 GREATEST(a[k], b[k])，键集合做并集并稳定排序 */
export function maxNumericMapMerge(
  a: Readonly<Record<string, number>> | undefined,
  b: Readonly<Record<string, number>> | undefined
): Readonly<Record<string, number>> {
  const keys = new Set<string>();
  if (a) for (const k of Object.keys(a)) keys.add(k);
  if (b) for (const k of Object.keys(b)) keys.add(k);

  const sortedKeys = Array.from(keys).sort((x, y) => (x < y ? -1 : x > y ? 1 : 0));
  const merged: Record<string, number> = {};
  for (const k of sortedKeys) {
    const va = Number(a?.[k] ?? 0);
    const vb = Number(b?.[k] ?? 0);
    const safeA = Number.isFinite(va) ? va : 0;
    const safeB = Number.isFinite(vb) ? vb : 0;
    merged[k] = Math.max(0, safeA, safeB);
  }
  return merged;
}

/** 合并大熔炉与灵液瓶等阶进度（每项单调不减，可选扩展字段按需保留确保幂等 SHA-256） */
export function mergeForgeTierProgress(
  a: ForgeTierProgressMap,
  b: ForgeTierProgressMap
): ForgeTierProgressMap {
  const merged: Record<string, number> = {
    plus_tier_ichor: Math.max(0, Math.floor(a.plus_tier_ichor), Math.floor(b.plus_tier_ichor)),
    s_tier_ichor: Math.max(0, Math.floor(a.s_tier_ichor), Math.floor(b.s_tier_ichor)),
    flask_charges: Math.max(1, Math.floor(a.flask_charges), Math.floor(b.flask_charges)),
    gold_reserve_lvl: Math.max(0, Math.floor(a.gold_reserve_lvl), Math.floor(b.gold_reserve_lvl)),
  };
  const optKeys = ['pp_tier_ichor', 'recycle_lvl', 'starter_tubes_lvl', 'shop_restock_lvl'] as const;
  for (const key of optKeys) {
    if (a[key] !== undefined || b[key] !== undefined) {
      merged[key] = Math.max(0, Math.floor(a[key] ?? 0), Math.floor(b[key] ?? 0));
    }
  }
  return merged as unknown as ForgeTierProgressMap;
}

function clampCrucibleHeat(a: number, b: number): 0 | 1 | 2 | 3 | 4 | 5 {
  return Math.min(5, Math.max(0, Math.floor(a), Math.floor(b))) as 0 | 1 | 2 | 3 | 4 | 5;
}

/**
 * 纯同步 CRDT 半格并集计算（不含异步 WebCrypto 哈希），便于高频组合或同步断言。
 */
export function mergeMetaProgressionsUnsigned(
  local: MetaProgressionRecord | UnsignedMetaProgression,
  remote: MetaProgressionRecord | UnsignedMetaProgression
): UnsignedMetaProgression {
  return {
    schemaVersion: 1,
    unlockedRunes: setUnionSorted(local.unlockedRunes, remote.unlockedRunes),
    unlockedWeapons: setUnionSorted(
      DEFAULT_STARTER_WEAPONS,
      local.unlockedWeapons,
      remote.unlockedWeapons
    ),
    unlockedSkills: setUnionSorted(
      DEFAULT_STARTER_SKILLS,
      local.unlockedSkills,
      remote.unlockedSkills
    ),
    unlockedMutations: setUnionSorted(
      DEFAULT_STARTER_MUTATIONS,
      local.unlockedMutations,
      remote.unlockedMutations
    ),
    discoveredLoreIds: setUnionSorted(local.discoveredLoreIds, remote.discoveredLoreIds),
    seenNpcDialogueIds: setUnionSorted(local.seenNpcDialogueIds, remote.seenNpcDialogueIds),
    trueEndingFlags: setUnionSorted(local.trueEndingFlags, remote.trueEndingFlags),
    blueprintIchorMap: maxNumericMapMerge(local.blueprintIchorMap, remote.blueprintIchorMap),
    forgeTierProgress: mergeForgeTierProgress(local.forgeTierProgress, remote.forgeTierProgress),
    bestiaryKillCounts: maxNumericMapMerge(local.bestiaryKillCounts, remote.bestiaryKillCounts),
    bankedIchor: Math.max(0, Math.floor(local.bankedIchor), Math.floor(remote.bankedIchor)),
    maxCrucibleHeat: clampCrucibleHeat(local.maxCrucibleHeat, remote.maxCrucibleHeat),
    totalRunsStarted: Math.max(
      0,
      Math.floor(local.totalRunsStarted),
      Math.floor(remote.totalRunsStarted)
    ),
    totalRunsCleared: Math.max(
      0,
      Math.floor(local.totalRunsCleared),
      Math.floor(remote.totalRunsCleared)
    ),
    crdtRevision: Math.max(1, Math.floor(local.crdtRevision), Math.floor(remote.crdtRevision)),
  };
}

/**
 * 合并双端局外永久成长并生成规范化 SHA-256 签名。
 * 无论多端离线多久，绝不覆盖或丢失任一端已解锁内容。
 */
export async function mergeMetaProgressions(
  local: MetaProgressionRecord,
  remote: MetaProgressionRecord
): Promise<MetaProgressionRecord> {
  const mergedDraft = mergeMetaProgressionsUnsigned(local, remote);
  return signMetaProgression(mergedDraft);
}

/** 对单端记录执行规范化归一化并递增一次本地提交版本 */
export async function bumpLocalMetaRevision(
  current: MetaProgressionRecord,
  patch: Partial<UnsignedMetaProgression>
): Promise<MetaProgressionRecord> {
  const nextDraft: UnsignedMetaProgression = {
    ...mergeMetaProgressionsUnsigned(current, {
      ...current,
      ...patch,
      forgeTierProgress: patch.forgeTierProgress
        ? mergeForgeTierProgress(current.forgeTierProgress, patch.forgeTierProgress)
        : current.forgeTierProgress,
      blueprintIchorMap: patch.blueprintIchorMap
        ? maxNumericMapMerge(current.blueprintIchorMap, patch.blueprintIchorMap)
        : current.blueprintIchorMap,
      bestiaryKillCounts: patch.bestiaryKillCounts
        ? maxNumericMapMerge(current.bestiaryKillCounts, patch.bestiaryKillCounts)
        : current.bestiaryKillCounts,
    }),
    // 若主动消费了入库灵液（如圣所铁匠铺投入），允许显式设定消费后的最新 bankedIchor
    bankedIchor:
      patch.bankedIchor !== undefined
        ? Math.max(0, Math.floor(patch.bankedIchor))
        : current.bankedIchor,
    crdtRevision: current.crdtRevision + 1,
  };
  return signMetaProgression(nextDraft);
}
