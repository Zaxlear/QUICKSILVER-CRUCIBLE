/**
 * 拾取地面/货架武器时的新旧装备词条与 DPS 双栏对比弹窗（src/ui/WeaponCompareModal.tsx）。
 */

import { useEffect } from 'preact/hooks';
import { EventBus } from '../core/EventBus';
import {
  STAT_COLOR_META,
  type WeaponCompareModalPayload,
  type WeaponCompareSlotView,
} from '../data/weapons.data';
import { WeaponPixelIcon } from './HudBar';

export interface WeaponCompareModalProps {
  readonly payload: WeaponCompareModalPayload | null;
}

function DeltaBadge({ pct }: { readonly pct: number }) {
  if (pct === 0) return <span class="text-[10px] font-bold text-[#9AA5B8]">±0% DPS</span>;
  const up = pct > 0;
  return (
    <span class={`px-1.5 py-0.5 text-[10px] font-bold border ${up ? 'bg-[#0B1F1D] border-[#3CE682] text-[#3CE682]' : 'bg-[#240B12] border-[#E11D48] text-[#FB7185]'}`}>
      {up ? `▲ +${pct}% DPS` : `▼ ${pct}% DPS`}
    </span>
  );
}

function CurrentEquippedCard({
  label,
  slotView,
  deltaPct,
  onReplace,
  testId,
}: {
  readonly label: string;
  readonly slotView: WeaponCompareSlotView;
  readonly deltaPct: number;
  readonly onReplace: () => void;
  readonly testId: string;
}) {
  return (
    <div class="bg-[#161824] border border-[#414A6B] p-2.5 flex flex-col justify-between gap-2">
      <div class="flex items-start justify-between gap-2">
        <div class="flex items-center gap-2">
          <WeaponPixelIcon iconSlot={slotView.iconSlot} scale={1} />
          <div>
            <div class="text-[9px] text-[#9AA5B8] uppercase tracking-wider">{label}</div>
            <div class="text-xs font-bold text-[#F8FAFC]">
              {slotView.nameZh}{' '}
              <span class="text-[#FBBF24]">{slotView.qualityBadge}</span>
            </div>
            <div class="text-[10px] text-[#B8C4D4]">
              当前 {slotView.scaledDps} DPS · 暴击 {slotView.critDps}
            </div>
          </div>
        </div>
        <DeltaBadge pct={deltaPct} />
      </div>

      <div class="text-[10px] text-[#9AA5B8] space-y-0.5">
        {slotView.affixes.map((afx) => (
          <div key={afx.id} class="truncate">
            • {afx.labelZh}
          </div>
        ))}
      </div>

      <button
        type="button"
        data-ui-interactive="true"
        data-testid={testId}
        onClick={onReplace}
        class="cursor-pointer w-full py-1.5 px-2 bg-[#291A0E] hover:bg-[#3D2817] border border-[#FBBF24] text-[11px] font-bold text-[#FBBF24] tracking-wide"
      >
        [{label} ← 装备此武器]
      </button>
    </div>
  );
}

export function WeaponCompareModal({ payload }: WeaponCompareModalProps) {
  useEffect(() => {
    if (!payload?.open) return;
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.code === 'Digit1' || ev.code === 'KeyJ') {
        ev.preventDefault();
        EventBus.emit('ui:command:resolve_weapon_compare', { action: 'equip_primary' });
      } else if (ev.code === 'Digit2' || ev.code === 'KeyK') {
        ev.preventDefault();
        EventBus.emit('ui:command:resolve_weapon_compare', { action: 'equip_secondary' });
      } else if (ev.code === 'Escape') {
        ev.preventDefault();
        EventBus.emit('ui:command:resolve_weapon_compare', { action: 'cancel' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [payload]);

  if (!payload?.open) return null;
  const { candidate, currentPrimary, currentSecondary } = payload;

  return (
    <div
      data-testid="weapon-compare-modal"
      role="dialog"
      aria-modal="true"
      class="pointer-events-auto fixed inset-0 z-40 bg-[#0B0C10]/85 flex items-center justify-center p-3"
    >
      <div class="max-w-2xl w-full max-h-[92vh] overflow-y-auto bg-[#11131C] border-2 border-[#C28B42] p-3.5 shadow-2xl text-[#E8EFF5] flex flex-col gap-3">
        <div class="flex items-center justify-between border-b border-[#323954] pb-2">
          <div>
            <span class="text-[10px] tracking-[0.18em] text-[#E0AE53] uppercase">
              ALCHEMICAL ARMORY · 炼金军械词条对比
            </span>
            <h2 class="text-sm font-bold text-[#F8FAFC]">选择替换槽位以拾取新武器</h2>
          </div>
          <div class="flex items-center gap-2">
            {(payload.recycleGoldValue ?? 0) > 0 && (
              <button
                type="button"
                data-ui-interactive="true"
                data-testid="btn-recycle-weapon-modal"
                onClick={() => EventBus.emit('ui:command:recycle_floor_loot', { lootId: payload.floorLootId })}
                class="cursor-pointer px-2.5 py-1 bg-[#291A0E] hover:bg-[#3D2817] border border-[#FBBF24] text-[10px] font-bold text-[#FBBF24]"
              >
                [♻ 回收 +{payload.recycleGoldValue}G]
              </button>
            )}
            <button
              type="button"
              data-ui-interactive="true"
              data-testid="btn-cancel-compare"
              onClick={() => EventBus.emit('ui:command:resolve_weapon_compare', { action: 'cancel' })}
              class="cursor-pointer px-2.5 py-1 bg-[#240B12] hover:bg-[#3B121E] border border-[#E11D48] text-[10px] font-bold text-[#FB7185]"
            >
              [留在地上 ESC]
            </button>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* 左侧：待拾取新武器详情卡 */}
          <div class="md:col-span-6 bg-[#161824] border-2 border-[#38BDF8] p-3 flex flex-col justify-between gap-2">
            <div>
              <div class="flex items-center gap-2.5 mb-2">
                <div class="p-1 bg-[#0B0C10] border border-[#38BDF8]">
                  <WeaponPixelIcon iconSlot={candidate.iconSlot} scale={1.5} />
                </div>
                <div>
                  <div class="flex items-center gap-1.5 flex-wrap">
                    <span class="text-sm font-bold text-[#F8FAFC]">{candidate.nameZh}</span>
                    <span class="px-1.5 py-0.2 bg-[#1E2233] border border-[#FBBF24] text-[10px] font-bold text-[#FBBF24]">
                      {candidate.qualityBadge}
                    </span>
                  </div>
                  <div class="flex items-center gap-1 mt-1">
                    {candidate.colors.map((col) => (
                      <span
                        key={col}
                        class="px-1.5 text-[9px] font-bold border bg-[#0B0C10]"
                        style={{
                          borderColor: STAT_COLOR_META[col].accentHex,
                          color: STAT_COLOR_META[col].accentHex,
                        }}
                      >
                        {STAT_COLOR_META[col].nameZh}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <div class="grid grid-cols-3 gap-1.5 bg-[#0B0C10] border border-[#272C42] p-2 text-center mb-2">
                <div>
                  <div class="text-[9px] text-[#9AA5B8]">面板 DPS</div>
                  <div class="text-xs font-bold text-[#F8FAFC]">{candidate.scaledDps}</div>
                </div>
                <div>
                  <div class="text-[9px] text-[#9AA5B8]">暴击 DPS</div>
                  <div class="text-xs font-bold text-[#FBBF24]">{candidate.critDps}</div>
                </div>
                <div>
                  <div class="text-[9px] text-[#9AA5B8]">破盾韧性</div>
                  <div class="text-xs font-bold text-[#38BDF8]">{candidate.avgBreach}</div>
                </div>
              </div>

              <div class="text-[10px] text-[#FBBF24] leading-snug mb-1.5">
                ✦ {candidate.critSummaryZh}
              </div>
              <div class="text-[10px] text-[#B8C4D4] leading-snug mb-2">
                {candidate.mechanicSummaryZh}
              </div>

              <div class="border-t border-[#272C42] pt-1.5 space-y-1">
                {candidate.affixes.map((afx) => (
                  <div
                    key={afx.id}
                    class={`text-[10px] flex items-center justify-between gap-1 ${
                      afx.rarity === 'LEGENDARY'
                        ? 'text-[#FBBF24] font-bold'
                        : afx.rarity === 'RARE'
                          ? 'text-[#38BDF8]'
                          : 'text-[#E8EFF5]'
                    }`}
                  >
                    <span>• {afx.labelZh}</span>
                    {afx.hasSynergyWithOtherSlot && (
                      <span class="px-1 bg-[#0B1F1D] border border-[#3CE682] text-[#3CE682] text-[8px] shrink-0">
                        联动 ↑
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div class="text-[10px] italic text-[#9AA5B8] border-t border-[#272C42] pt-1.5">
              {candidate.flavorInscriptionZh}
            </div>
          </div>

          {/* 右侧：当前主副手槽位对比与一键替换 */}
          <div class="md:col-span-6 flex flex-col gap-2.5 justify-between">
            <CurrentEquippedCard label="主手槽位 [J / 1]" slotView={currentPrimary} deltaPct={payload.dpsDeltaVsPrimaryPct} testId="btn-equip-primary" onReplace={() => EventBus.emit('ui:command:resolve_weapon_compare', { action: 'equip_primary' })} />
            <CurrentEquippedCard label="副手槽位 [K / 2]" slotView={currentSecondary} deltaPct={payload.dpsDeltaVsSecondaryPct} testId="btn-equip-secondary" onReplace={() => EventBus.emit('ui:command:resolve_weapon_compare', { action: 'equip_secondary' })} />
          </div>
        </div>
      </div>
    </div>
  );
}
