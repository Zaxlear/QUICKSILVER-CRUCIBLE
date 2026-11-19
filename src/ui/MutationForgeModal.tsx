/**
 * 关卡休整区「12 变异构筑与永恒锻炉灵液灌注」独立 Preact 弹窗
 * （src/ui/MutationForgeModal.tsx）。
 *
 * 严格遵循单向依赖铁律：零 Phaser 实例引用，纯订阅 EventBus 快照并派发 ui:command:*。
 */

import { useEffect } from 'preact/hooks';
import { EventBus } from '../core/EventBus';
import {
  ALL_MUTATION_IDS,
  ETERNAL_FORGE_UPGRADES,
  formatMutationLiveEffectZh,
  MAX_EQUIPPED_MUTATIONS,
  MUTATION_CATALOG,
  type MutationForgeModalPayload,
  type MutationId,
} from '../data/mutations.data';
import { STAT_COLOR_META } from '../data/weapons.data';
import { WeaponPixelIcon } from './LoadoutSlotCards';

export interface MutationForgeModalProps {
  readonly payload: MutationForgeModalPayload | null;
}

export function MutationForgeModal({ payload }: MutationForgeModalProps) {
  useEffect(() => {
    if (!payload?.open) return;
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.code === 'Escape') {
        ev.preventDefault();
        EventBus.emit('ui:command:toggle_mutation_forge', { open: false });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [payload]);

  if (!payload?.open) return null;
  const equippedSet = new Set<MutationId>(payload.equippedMutationIds);
  const slotsFull = equippedSet.size >= MAX_EQUIPPED_MUTATIONS;

  return (
    <div
      data-testid="mutation-forge-modal"
      role="dialog"
      aria-modal="true"
      class="pointer-events-auto fixed inset-0 z-40 bg-[#0B0C10]/88 flex items-center justify-center p-3"
    >
      <div class="max-w-4xl w-full max-h-[92vh] overflow-y-auto bg-[#11131C] border-2 border-[#A855F7] p-3.5 shadow-2xl text-[#E8EFF5] flex flex-col gap-3">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-[#323954] pb-2">
          <div>
            <div class="text-[10px] tracking-[0.18em] text-[#A855F7] uppercase font-bold">
              ATHANOR MUTATION & ETERNAL FORGE · 炼金变异与永恒大熔炉
            </div>
            <h2 class="text-sm font-bold text-[#F8FAFC]">
              已激活变异槽：{equippedSet.size} / {MAX_EQUIPPED_MUTATIONS} · 携带灵液：
              <span class="text-[#38BDF8]"> ✦{payload.carriedIchor}</span> · 金币：
              <span class="text-[#FBBF24]"> {payload.gold}G</span>
            </h2>
          </div>

          <div class="flex items-center gap-2">
            <button
              type="button"
              data-ui-interactive="true"
              data-testid="btn-open-collector-from-forge"
              onClick={() => {
                EventBus.emit('ui:command:toggle_mutation_forge', { open: false });
                EventBus.emit('ui:command:open_collector_modal', {});
              }}
              class="cursor-pointer px-2.5 py-1 bg-[#0B1F1D] hover:bg-[#12332F] border border-[#38BDF8] text-[10px] font-bold text-[#38BDF8]"
            >
              [📜 秘银蓝图圣柜]
            </button>
            <button
              type="button"
              data-ui-interactive="true"
              data-testid="btn-respec-mutations"
              disabled={equippedSet.size === 0 || payload.gold < payload.respecCostGold}
              onClick={() => EventBus.emit('ui:command:respec_mutations', {})}
              class="cursor-pointer disabled:opacity-45 px-2.5 py-1 bg-[#291A0E] hover:bg-[#3D2817] border border-[#FBBF24] text-[10px] font-bold text-[#FBBF24]"
            >
              [洗点重铸 -{payload.respecCostGold}G]
            </button>
            <button
              type="button"
              data-ui-interactive="true"
              data-testid="btn-close-mutation-forge"
              onClick={() => EventBus.emit('ui:command:toggle_mutation_forge', { open: false })}
              class="cursor-pointer px-2.5 py-1 bg-[#240B12] hover:bg-[#3B121E] border border-[#E11D48] text-[10px] font-bold text-[#FB7185]"
            >
              [返回战斗 ESC]
            </button>
          </div>
        </div>

        {/* 上半区：全部 12 种局内变异三系矩阵 */}
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {ALL_MUTATION_IDS.map((mid) => {
            const spec = MUTATION_CATALOG[mid];
            const isSelected = equippedSet.has(mid);
            const colMeta = STAT_COLOR_META[spec.faction];
            const liveDesc = formatMutationLiveEffectZh(mid, payload.stats);

            return (
              <button
                key={mid}
                type="button"
                data-ui-interactive="true"
                data-testid={`mutation-card-${mid}`}
                disabled={!isSelected && slotsFull}
                onClick={() => EventBus.emit('ui:command:toggle_mutation_choice', { mutationId: mid })}
                class={`text-left cursor-pointer disabled:opacity-45 p-2 border transition-colors flex flex-col justify-between gap-1.5 ${
                  isSelected
                    ? 'bg-[#1E2233] border-2 border-[#FBBF24]'
                    : 'bg-[#161824] hover:bg-[#1E2233] border-[#323954]'
                }`}
              >
                <div class="flex items-start justify-between gap-2">
                  <div class="flex items-center gap-2">
                    <WeaponPixelIcon iconSlot={spec.iconSlot} scale={1} />
                    <div>
                      <div class="text-xs font-bold text-[#F8FAFC] flex items-center gap-1">
                        <span>{spec.nameZh}</span>
                        {isSelected && (
                          <span class="px-1 bg-[#3D2817] border border-[#FBBF24] text-[8px] text-[#FBBF24]">
                            已装备
                          </span>
                        )}
                      </div>
                      <div class="text-[9px] font-semibold" style={{ color: colMeta.accentHex }}>
                        {colMeta.shortZh}系 · {spec.roleTagZh}
                      </div>
                    </div>
                  </div>
                </div>
                <div class="text-[10px] text-[#B8C4D4] leading-snug">{liveDesc}</div>
              </button>
            );
          })}
        </div>

        {/* 下半区：永恒锻炉灵液结晶（Ichor）品质池永久升级 */}
        <div class="border-t border-[#323954] pt-2.5">
          <div class="text-[10px] font-bold tracking-wider text-[#E0AE53] uppercase mb-1.5">
            LEGENDARY FORGE ICHOR INFUSION · 永恒大熔炉灵液灌注（跨局 CRDT 永久保存）
          </div>
          <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
            {ETERNAL_FORGE_UPGRADES.map((upg) => {
              const cur = payload.forgeProgress[upg.id] ?? 0;
              const pct = Math.min(100, Math.round((cur / upg.maxIchor) * 100));
              const maxed = cur >= upg.maxIchor;
              return (
                <div key={upg.id} class="bg-[#161824] border border-[#414A6B] p-2 flex flex-col gap-1">
                  <div class="flex items-center justify-between gap-2">
                    <span class="text-[11px] font-bold text-[#F8FAFC]">{upg.nameZh}</span>
                    <span class="text-[10px] font-bold text-[#38BDF8]">
                      ✦ {cur} / {upg.maxIchor} ({pct}%)
                    </span>
                  </div>
                  <div class="h-2 bg-[#0B0C10] border border-[#323954] overflow-hidden">
                    <div class="h-full bg-[#38BDF8]" style={{ width: `${pct}%` }} />
                  </div>
                  <div class="flex items-center justify-between gap-2 mt-0.5">
                    <span class="text-[9px] text-[#9AA5B8] truncate">{upg.descZh}</span>
                    <button
                      type="button"
                      data-ui-interactive="true"
                      data-testid={`btn-invest-${upg.id}`}
                      disabled={maxed || payload.carriedIchor <= 0}
                      onClick={() => EventBus.emit('ui:command:invest_forge_ichor', { upgradeId: upg.id })}
                      class="cursor-pointer disabled:opacity-40 shrink-0 px-2 py-0.5 bg-[#0B1F1D] hover:bg-[#12332F] border border-[#3CE682] text-[9px] font-bold text-[#3CE682]"
                    >
                      {maxed ? '已满阶' : `[注入 ✦${Math.min(payload.carriedIchor || upg.stepIchor, upg.stepIchor)}]`}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
