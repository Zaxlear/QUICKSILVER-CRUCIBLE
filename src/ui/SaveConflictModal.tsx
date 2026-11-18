/**
 * 双端离线分叉可视化存档对比选择框（src/ui/SaveConflictModal.tsx）。
 *
 * 100% 挂载于 #ui-root DOM 层，零着色器污染、零内联几何 SVG 占位符：
 * - 左右并排展示【本机存档卡片】与【云端存档卡片】；
 * - 完整呈现设备名、相对保存时间、游玩时长、群落像素横幅、血量/三系卷轴徽标与双武器双技能像素图标；
 * - 点击任一卡片立即通过 EventBus 触发 0 刷新毫秒级局内进度热切换。
 */

import { EventBus } from '../core/EventBus';
import { SKILL_CATALOG, type SkillId } from '../data/skills.data';
import {
  BIOME_BANNER_Meta,
  type ActiveRunSnapshot,
  type SaveConflictChoice,
  type SaveConflictModalPayload,
} from '../data/storage.data';
import { WEAPON_CATALOG, type WeaponId } from '../data/weapons.data';
import { WeaponPixelIcon } from './LoadoutSlotCards';

export interface SaveConflictModalProps {
  readonly payload: SaveConflictModalPayload | null;
}

function formatDurationClock(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const hrs = Math.floor(totalSec / 3600);
  const mins = Math.floor((totalSec % 3600) / 60);
  const secs = totalSec % 60;
  const pad = (n: number): string => String(n).padStart(2, '0');
  return hrs > 0 ? `${pad(hrs)}:${pad(mins)}:${pad(secs)}` : `${pad(mins)}:${pad(secs)}`;
}

function formatRelativeSaveTime(iso: string): string {
  const parsed = Date.parse(iso);
  if (!Number.isFinite(parsed)) return '刚刚';
  const diffSec = Math.max(0, Math.floor((Date.now() - parsed) / 1000));
  if (diffSec < 45) return '刚刚';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} 分钟前`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} 小时前`;
  return `${Math.floor(diffSec / 86400)} 天前`;
}

function LoadoutIconPill({
  iconSlot,
  nameZh,
  tag,
}: {
  readonly iconSlot: number;
  readonly nameZh: string;
  readonly tag: string;
}) {
  return (
    <div class="flex items-center gap-1 bg-[#0B0C10] border border-[#323954] px-1.5 py-0.5 min-w-0">
      <WeaponPixelIcon iconSlot={iconSlot} scale={0.75} />
      <div class="flex flex-col leading-none min-w-0">
        <span class="text-[7px] text-[#9AA5B8] uppercase">{tag}</span>
        <span class="text-[9px] font-bold text-[#F8FAFC] truncate">{nameZh}</span>
      </div>
    </div>
  );
}

function ConflictSnapshotCard({
  side,
  snapshot,
  choice,
}: {
  readonly side: 'LOCAL' | 'REMOTE';
  readonly snapshot: ActiveRunSnapshot;
  readonly choice: SaveConflictChoice;
}) {
  const isLocal = side === 'LOCAL';
  const banner = BIOME_BANNER_Meta[snapshot.biomeId];
  const sum = snapshot.loadoutSummary;
  const hpPct = Math.min(100, Math.max(0, (sum.currentHp / Math.max(1, sum.maxHp)) * 100));

  const primDef = sum.primaryWeaponId ? WEAPON_CATALOG[sum.primaryWeaponId as WeaponId] : null;
  const secDef = sum.secondaryWeaponId ? WEAPON_CATALOG[sum.secondaryWeaponId as WeaponId] : null;
  const s1Def = sum.skillOneId ? SKILL_CATALOG[sum.skillOneId as SkillId] : null;
  const s2Def = sum.skillTwoId ? SKILL_CATALOG[sum.skillTwoId as SkillId] : null;

  return (
    <button
      type="button"
      data-ui-interactive="true"
      data-testid={isLocal ? 'card-conflict-keep-local' : 'card-conflict-adopt-remote'}
      onClick={() => EventBus.emit('ui:command:resolve_save_conflict', { choice })}
      class={`cursor-pointer text-left bg-[#161824] hover:bg-[#1E2233] border-2 p-2 sm:p-3 flex flex-col gap-1.5 transition-colors shadow-xl ${
        isLocal
          ? 'border-[#38BDF8] hover:border-[#F8FAFC]'
          : 'border-[#FBBF24] hover:border-[#F8FAFC]'
      }`}
    >
      <div class="flex items-center justify-between gap-1">
        <span
          class={`px-1.5 py-0.5 text-[8px] font-bold tracking-wider uppercase border ${
            isLocal
              ? 'bg-[#0B1F1D] border-[#38BDF8] text-[#38BDF8]'
              : 'bg-[#291A0E] border-[#FBBF24] text-[#FBBF24]'
          }`}
        >
          {isLocal ? '本机活跃存档 · LOCAL' : '云端异端存档 · CLOUD'}
        </span>
        <span class="text-[9px] text-[#B8C4D4] font-mono">
          {formatRelativeSaveTime(snapshot.clientSavedAt)} · REV #{snapshot.revision}
        </span>
      </div>

      <div class="text-[11px] sm:text-xs font-bold text-[#F8FAFC] truncate">
        {snapshot.deviceLabel}
      </div>

      {/* 所在生态群落高清像素缩略横幅与游玩时长 */}
      <div
        class="relative h-12 sm:h-16 w-full border border-[#414A6B] overflow-hidden pixel-crisp bg-cover bg-center flex flex-col justify-end p-1.5"
        style={{ backgroundImage: `url('${banner.bannerUrl}')` }}
      >
        <div class="absolute inset-0 bg-[#0B0C10]/58" />
        <div class="relative z-10 flex items-end justify-between gap-1">
          <div>
            <div class="text-[10px] sm:text-xs font-bold text-[#F8FAFC]" style={{ color: banner.accentHex }}>
              {banner.titleZh}
            </div>
            <div class="text-[8px] text-[#D4DEE8] font-mono">
              房间锚点: {snapshot.currentRoomId}
            </div>
          </div>
          <span class="px-1.5 py-0.5 bg-[#0B0C10]/90 border border-[#556085] text-[9px] font-mono font-bold text-[#F8FAFC]">
            ⏱ {formatDurationClock(snapshot.playtimeMs)}
          </span>
        </div>
      </div>

      {/* 血量条与赤/黄/白三系卷轴计数 */}
      <div class="flex flex-col gap-1 bg-[#11131C] border border-[#272C42] p-1.5">
        <div class="flex items-center justify-between gap-1 text-[9px]">
          <span class="font-bold text-[#F8FAFC]">
            HP {sum.currentHp}/{sum.maxHp}
          </span>
          <div class="flex items-center gap-1">
            <span class="px-1 bg-[#240B12] border border-[#E11D48] text-[#FB7185] font-bold">
              赤 {sum.statCounts.rubedo}
            </span>
            <span class="px-1 bg-[#291A0E] border border-[#FBBF24] text-[#FBBF24] font-bold">
              黄 {sum.statCounts.citrinitas}
            </span>
            <span class="px-1 bg-[#0B1F1D] border border-[#3CE682] text-[#3CE682] font-bold">
              白 {sum.statCounts.albedo}
            </span>
          </div>
        </div>
        <div class="relative h-2 bg-[#0B0C10] border border-[#593A1E] overflow-hidden">
          <div class="h-full bg-[#E11D48]" style={{ width: `${hpPct.toFixed(1)}%` }} />
        </div>
      </div>

      {/* 双主手武器 + 双主动技能像素图标矩阵 */}
      <div class="grid grid-cols-2 gap-1">
        {primDef && <LoadoutIconPill iconSlot={primDef.iconSlot} nameZh={primDef.nameZh} tag="主手武器" />}
        {secDef && <LoadoutIconPill iconSlot={secDef.iconSlot} nameZh={secDef.nameZh} tag="副手/盾" />}
        {s1Def && <LoadoutIconPill iconSlot={s1Def.iconSlot} nameZh={s1Def.nameZh} tag="炼金技 I" />}
        {s2Def && <LoadoutIconPill iconSlot={s2Def.iconSlot} nameZh={s2Def.nameZh} tag="炼金技 II" />}
      </div>

      <div
        class={`mt-auto py-1 px-2 text-center text-[10px] font-bold tracking-wider border ${
          isLocal
            ? 'bg-[#1E2233] border-[#38BDF8] text-[#38BDF8]'
            : 'bg-[#3D2817] border-[#FBBF24] text-[#FBBF24]'
        }`}
      >
        {isLocal ? '[选择保留本机进度 · 覆写云端]' : '[选择继承云端进度 · 立即热切房间]'}
      </div>
    </button>
  );
}

export function SaveConflictModal({ payload }: SaveConflictModalProps) {
  if (!payload || !payload.open) return null;

  return (
    <div
      data-testid="save-conflict-modal"
      role="dialog"
      aria-modal="true"
      class="pointer-events-auto fixed inset-0 z-50 bg-[#0B0C10]/90 flex items-center justify-center p-2 sm:p-4"
    >
      <div class="w-full max-w-3xl max-h-[94vh] overflow-y-auto bg-[#11131C] border-2 border-[#C28B42] p-2.5 sm:p-4 shadow-2xl flex flex-col gap-2">
        <div class="flex items-center justify-between gap-2 border-b border-[#3D2817] pb-1.5">
          <div class="flex items-center gap-2">
            <img
              src="/assets/atlases/boot_crucible_seal.png"
              alt="Conflict Astrolabe"
              class="w-6 h-6 pixel-crisp border border-[#7A5128] bg-[#161824] p-0.5"
            />
            <div>
              <div class="text-[8px] sm:text-[9px] tracking-[0.18em] text-[#E0AE53] uppercase">
                BIFURCATED TIMELINE DETECTED · OPTIMISTIC LOCK ARBITRATION
              </div>
              <h2 class="text-xs sm:text-sm font-bold text-[#F8FAFC]">
                检测到跨设备局内快照分叉 — 请选择接力时间线
              </h2>
            </div>
          </div>
          <span class="px-2 py-0.5 bg-[#0B1F1D] border border-[#3CE682] text-[#3CE682] text-[8px] sm:text-[9px] font-bold shrink-0">
            ✦ 局外解锁已 CRDT 零丢失合并
          </span>
        </div>

        <p class="text-[9px] sm:text-[10px] text-[#B8C4D4] leading-snug">
          您在离线期间已解锁的所有永久符文、武器蓝图、真名封印与铁匠铺灵液均已通过幂等并集合入账号。点击下方任一卡片即可无刷新热切换当前局内房间：
        </p>

        <div class="grid grid-cols-2 gap-2 sm:gap-3">
          <ConflictSnapshotCard
            side="LOCAL"
            snapshot={payload.localSnapshot}
            choice="KEEP_LOCAL"
          />
          <ConflictSnapshotCard
            side="REMOTE"
            snapshot={payload.remoteSnapshot}
            choice="ADOPT_REMOTE"
          />
        </div>
      </div>
    </div>
  );
}
