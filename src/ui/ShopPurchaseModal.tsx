/**
 * 炼金军械商三槽位明码标价购买、词条预览与货架付费刷新独立 Preact 弹窗
 * （src/ui/ShopPurchaseModal.tsx，严格 <= 195 行）。
 */

import { useEffect } from 'preact/hooks';
import { EventBus } from '../core/EventBus';
import type { ShopMerchandiseSlotView, ShopPurchaseModalPayload } from '../data/economy.data';
import { STAT_COLOR_META } from '../data/weapons.data';
import { WeaponPixelIcon } from './LoadoutSlotCards';

export interface ShopPurchaseModalProps {
  readonly payload: ShopPurchaseModalPayload | null;
}

function ShopSlotCard({ slot, playerGold }: { readonly slot: ShopMerchandiseSlotView; readonly playerGold: number }) {
  const canAfford = playerGold >= slot.priceGold;
  const wv = slot.weaponView;
  const sv = slot.skillView;
  const title = wv?.nameZh ?? sv?.nameZh ?? slot.supplyTitleZh ?? '炼金物资';
  const badge = wv?.qualityBadge ?? sv?.qualityBadge ?? '补给';
  const colors = wv?.colors ?? sv?.colors ?? [];
  const iconSlot = wv?.iconSlot ?? sv?.iconSlot ?? (slot.kind === 'TONIC_FLASK' ? 16 : 31);

  return (
    <div
      data-testid={`shop-slot-${slot.kind.toLowerCase()}`}
      class={`bg-[#161824] border p-3 flex flex-col justify-between gap-2.5 ${slot.purchased ? 'border-[#272C42] opacity-55' : 'border-[#C28B42]'}`}
    >
      <div class="flex flex-col gap-1.5">
        <div class="flex items-center justify-between gap-1">
          <span class="text-[9px] tracking-wider uppercase text-[#E0AE53] font-bold">{slot.categoryLabelZh}</span>
          <span class="px-1.5 py-0.5 bg-[#291A0E] border border-[#FBBF24] text-[10px] font-bold text-[#FBBF24]">{slot.priceGold}G</span>
        </div>

        <div class="flex items-center gap-2">
          <div class="p-1 bg-[#0B0C10] border border-[#593A1E] shrink-0">
            <WeaponPixelIcon iconSlot={iconSlot} scale={1} />
          </div>
          <div class="min-w-0">
            <div class="text-xs font-bold text-[#F8FAFC] truncate">
              {title} <span class="text-[#38BDF8]">{badge}</span>
            </div>
            {colors.length > 0 && (
              <div class="flex items-center gap-1 mt-0.5">
                {colors.map((c) => (
                  <span key={c} class="px-1 text-[8px] font-bold border bg-[#0B0C10]" style={{ borderColor: STAT_COLOR_META[c].accentHex, color: STAT_COLOR_META[c].accentHex }}>
                    {STAT_COLOR_META[c].shortZh}系
                  </span>
                ))}
              </div>
            )}
          </div>
        </div>

        {wv && (
          <div class="text-[10px] text-[#D4DEE8] space-y-0.5 border-t border-[#272C42] pt-1.5">
            <div>面板 <b class="text-[#F8FAFC]">{wv.scaledDps} DPS</b> · 暴击 <b class="text-[#FBBF24]">{wv.critDps}</b></div>
            <div class="text-[9px] text-[#9AA5B8] line-clamp-2">{wv.critSummaryZh}</div>
            {wv.affixes.slice(0, 3).map((a) => <div key={a.id} class="text-[9px] text-[#38BDF8] truncate">• {a.labelZh}</div>)}
          </div>
        )}

        {sv && (
          <div class="text-[10px] text-[#D4DEE8] space-y-0.5 border-t border-[#272C42] pt-1.5">
            <div class="flex items-center justify-between">
              <span>伤害 <b class="text-[#F8FAFC]">{sv.scaledDamage}</b> · CD <b class="text-[#38BDF8]">{sv.baseCooldownSec}s</b></span>
              {sv.hasWeaponChemicalSynergy && <span class="px-1 bg-[#291A0E] border border-[#FBBF24] text-[#FBBF24] text-[8px] font-bold">★化学联动</span>}
            </div>
            <div class="text-[9px] text-[#9AA5B8] line-clamp-2">{sv.mechanicSummaryZh}</div>
            {sv.affixes.slice(0, 2).map((a) => <div key={a.id} class="text-[9px] text-[#3CE682] truncate">• {a.labelZh}</div>)}
          </div>
        )}

        {slot.supplyDescZh && <div class="text-[10px] text-[#B8C4D4] leading-snug border-t border-[#272C42] pt-1.5">{slot.supplyDescZh}</div>}
      </div>

      <button
        type="button"
        data-ui-interactive="true"
        data-testid={`btn-buy-${slot.slotId}`}
        disabled={slot.purchased}
        onClick={() => EventBus.emit('ui:command:shop_purchase_slot', { slotId: slot.slotId })}
        class={`cursor-pointer disabled:opacity-45 w-full py-1.5 px-2 border text-[10px] font-bold tracking-wide ${
          slot.purchased
            ? 'bg-[#0B0C10] border-[#323954] text-[#7C8599]'
            : canAfford
              ? 'bg-[#0B1F1D] hover:bg-[#12332F] border-[#3CE682] text-[#3CE682]'
              : 'bg-[#240B12] hover:bg-[#3B121E] border-[#E11D48] text-[#FB7185]'
        }`}
      >
        {slot.purchased ? '已售罄 SOLD' : canAfford ? `[购买 -${slot.priceGold}G]` : `[金币不足：需 ${slot.priceGold}G]`}
      </button>
    </div>
  );
}

export function ShopPurchaseModal({ payload }: ShopPurchaseModalProps) {
  useEffect(() => {
    if (!payload?.open) return;
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.code === 'Escape') { ev.preventDefault(); EventBus.emit('ui:command:close_shop_modal', {}); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [payload]);

  if (!payload?.open) return null;

  return (
    <div data-testid="shop-purchase-modal" role="dialog" aria-modal="true" class="pointer-events-auto fixed inset-0 z-40 bg-[#0B0C10]/88 flex items-center justify-center p-3">
      <div class="max-w-3xl w-full max-h-[92vh] overflow-y-auto bg-[#11131C] border-2 border-[#C28B42] p-3.5 shadow-2xl text-[#E8EFF5] flex flex-col gap-3">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-[#323954] pb-2">
          <div>
            <div class="text-[10px] tracking-[0.18em] text-[#E0AE53] uppercase font-bold">
              CARAVAN ARMORY · 炼金军械商 · {payload.biomeNameZh}分舵
            </div>
            <h2 class="text-sm font-bold text-[#F8FAFC]">
              当前持有秘银金币：<span class="text-[#FBBF24]">{payload.playerGold}G</span>
            </h2>
          </div>

          <div class="flex items-center gap-2">
            {payload.restockUnlocked && payload.nextRestockCostGold !== null && (
              <button
                type="button"
                data-ui-interactive="true"
                data-testid="btn-shop-restock"
                onClick={() => EventBus.emit('ui:command:shop_restock', { shopNodeId: payload.shopNodeId })}
                class="cursor-pointer px-2.5 py-1 bg-[#291A0E] hover:bg-[#3D2817] border border-[#FBBF24] text-[10px] font-bold text-[#FBBF24]"
              >
                [刷新货架 -{payload.nextRestockCostGold}G ({3 - payload.restocksUsed}/3)]
              </button>
            )}
            <button
              type="button"
              data-ui-interactive="true"
              data-testid="btn-close-shop"
              onClick={() => EventBus.emit('ui:command:close_shop_modal', {})}
              class="cursor-pointer px-2.5 py-1 bg-[#240B12] hover:bg-[#3B121E] border border-[#E11D48] text-[10px] font-bold text-[#FB7185]"
            >
              [离开商店 ESC]
            </button>
          </div>
        </div>

        {payload.rejectNoticeZh && (
          <div data-testid="shop-reject-banner" class="px-3 py-1.5 bg-[#3B121E] border border-[#E11D48] text-xs font-bold text-[#FB7185]">
            ⚠ 交易拒绝：{payload.rejectNoticeZh}
          </div>
        )}

        <div class="grid grid-cols-1 md:grid-cols-3 gap-2.5">
          {payload.slots.map((slot) => <ShopSlotCard key={slot.slotId} slot={slot} playerGold={payload.playerGold} />)}
        </div>
      </div>
    </div>
  );
}
