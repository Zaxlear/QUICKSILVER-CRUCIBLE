/**
 * 圣所收藏官·科尔维斯秘银蓝图归档与灵液灌注解锁面板
 * （src/ui/CollectorBlueprintModal.tsx，严格 <= 220 行）。
 */

import { useEffect } from 'preact/hooks';
import { EventBus } from '../core/EventBus';
import type { CollectorBlueprintModalPayload } from '../data/economy.data';
import { WeaponPixelIcon } from './LoadoutSlotCards';

export interface CollectorBlueprintModalProps {
  readonly payload: CollectorBlueprintModalPayload | null;
}

export function CollectorBlueprintModal({ payload }: CollectorBlueprintModalProps) {
  useEffect(() => {
    if (!payload?.open) return;
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.code === 'Escape') {
        ev.preventDefault();
        EventBus.emit('ui:command:close_collector_modal', {});
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [payload]);

  if (!payload?.open) return null;

  const sorted = [...payload.entries].sort((a, b) => {
    const rank = (s: typeof a.status): number =>
      s === 'REGISTERED' ? 0 : s === 'UNLOCKED' ? 1 : 2;
    return rank(a.status) - rank(b.status);
  });

  return (
    <div
      data-testid="collector-blueprint-modal"
      role="dialog"
      aria-modal="true"
      class="pointer-events-auto fixed inset-0 z-40 bg-[#0B0C10]/88 flex items-center justify-center p-3"
    >
      <div class="max-w-4xl w-full max-h-[92vh] overflow-y-auto bg-[#11131C] border-2 border-[#38BDF8] p-3.5 shadow-2xl text-[#E8EFF5] flex flex-col gap-3">
        <div class="flex flex-wrap items-center justify-between gap-2 border-b border-[#323954] pb-2">
          <div>
            <div class="text-[10px] tracking-[0.18em] text-[#38BDF8] uppercase font-bold">
              COLLECTOR CORVUS ARCHIVE · 收藏官·科尔维斯秘银蓝图圣柜
            </div>
            <h2 class="text-sm font-bold text-[#F8FAFC]">
              可用灵液结晶：<span class="text-[#38BDF8]">✦ {payload.availableIchor}</span>
              {payload.newlyRegisteredCount > 0 && (
                <span class="ml-2 px-1.5 py-0.5 bg-[#0B1F1D] border border-[#3CE682] text-[10px] text-[#3CE682]">
                  ✦ 本次归档 +{payload.newlyRegisteredCount} 份新图纸！
                </span>
              )}
            </h2>
          </div>

          <button
            type="button"
            data-ui-interactive="true"
            data-testid="btn-close-collector"
            onClick={() => EventBus.emit('ui:command:close_collector_modal', {})}
            class="cursor-pointer px-2.5 py-1 bg-[#240B12] hover:bg-[#3B121E] border border-[#E11D48] text-[10px] font-bold text-[#FB7185]"
          >
            [返回圣所 ESC]
          </button>
        </div>

        <div class="text-[10px] text-[#9AA5B8]">
          提示：在四大群落斩杀对应怪物获取秘银蓝图并存活带回圣所或关底熔炉，灌满灵液瞬间将点亮圣所顶部悬吊瓶并当场免费爆出新装备试用！
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-2">
          {sorted.map(({ spec, status, investedIchor }) => {
            const pct = Math.min(100, Math.round((investedIchor / spec.ichorCost) * 100));
            const remaining = Math.max(0, spec.ichorCost - investedIchor);
            const catLabel =
              spec.category === 'WEAPON' ? '武器' : spec.category === 'SKILL' ? '技能' : '变异';

            return (
              <div
                key={spec.blueprintId}
                data-testid={`blueprint-card-${spec.blueprintId}`}
                class={`p-2.5 border flex flex-col justify-between gap-1.5 ${
                  status === 'REGISTERED'
                    ? 'bg-[#161824] border-[#38BDF8]'
                    : status === 'UNLOCKED'
                      ? 'bg-[#0B1F1D]/55 border-[#3CE682]'
                      : 'bg-[#0B0C10]/80 border-[#272C42] opacity-70'
                }`}
              >
                <div class="flex items-start justify-between gap-2">
                  <div class="flex items-center gap-2">
                    <div class="p-1 bg-[#0B0C10] border border-[#323954]">
                      <WeaponPixelIcon iconSlot={spec.iconSlot} scale={1} />
                    </div>
                    <div>
                      <div class="text-xs font-bold text-[#F8FAFC] flex items-center gap-1.5">
                        <span>{status === 'UNDISCOVERED' ? `？？？ (${spec.nameZh})` : spec.nameZh}</span>
                        <span class="px-1 bg-[#1E2233] border border-[#414A6B] text-[8px] text-[#B8C4D4]">
                          {catLabel}
                        </span>
                      </div>
                      <div class="text-[9px] text-[#E0AE53]">产出源：{spec.sourceNameZh}</div>
                    </div>
                  </div>

                  <span class="text-[10px] font-bold text-[#38BDF8]">
                    ✦ {investedIchor} / {spec.ichorCost}
                  </span>
                </div>

                <div class="text-[10px] text-[#B8C4D4] leading-snug">{spec.summaryZh}</div>

                <div class="h-1.5 bg-[#0B0C10] border border-[#272C42] overflow-hidden">
                  <div
                    class={status === 'UNLOCKED' ? 'h-full bg-[#3CE682]' : 'h-full bg-[#38BDF8]'}
                    style={{ width: `${pct}%` }}
                  />
                </div>

                <div class="flex items-center justify-end pt-0.5">
                  {status === 'UNLOCKED' ? (
                    <span class="text-[9px] font-bold text-[#3CE682]">✓ 已点亮圣所悬吊瓶</span>
                  ) : status === 'REGISTERED' ? (
                    <button
                      type="button"
                      data-ui-interactive="true"
                      data-testid={`btn-unlock-bp-${spec.blueprintId}`}
                      disabled={payload.availableIchor <= 0}
                      onClick={() =>
                        EventBus.emit('ui:command:invest_blueprint_ichor', {
                          blueprintId: spec.blueprintId,
                        })
                      }
                      class="cursor-pointer disabled:opacity-40 px-2.5 py-0.5 bg-[#0B1F1D] hover:bg-[#12332F] border border-[#3CE682] text-[9px] font-bold text-[#3CE682]"
                    >
                      [灌注灵液 ✦{Math.min(payload.availableIchor || remaining, remaining)} 解锁并试用]
                    </button>
                  ) : (
                    <span class="text-[9px] text-[#7C8599]">尚未拾获并护送该图纸</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
