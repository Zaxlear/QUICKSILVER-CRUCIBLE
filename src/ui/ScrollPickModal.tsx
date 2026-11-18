/**
 * 三选一炼金卷轴（赤化 / 黄化 / 白化）属性指数成长选择弹窗
 * （src/ui/ScrollPickModal.tsx）。
 */

import { useEffect } from 'preact/hooks';
import { EventBus } from '../core/EventBus';
import {
  STAT_COLOR_META,
  type ScrollPickModalPayload,
  type StatColor,
} from '../data/weapons.data';
import { WeaponPixelIcon } from './HudBar';

export interface ScrollPickModalProps {
  readonly payload: ScrollPickModalPayload | null;
}

export function ScrollPickModal({ payload }: ScrollPickModalProps) {
  useEffect(() => {
    if (!payload?.open) return;
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.code === 'Digit1') {
        ev.preventDefault();
        EventBus.emit('ui:command:pick_scroll_color', { color: 'rubedo' });
      } else if (ev.code === 'Digit2') {
        ev.preventDefault();
        EventBus.emit('ui:command:pick_scroll_color', { color: 'citrinitas' });
      } else if (ev.code === 'Digit3') {
        ev.preventDefault();
        EventBus.emit('ui:command:pick_scroll_color', { color: 'albedo' });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [payload]);

  if (!payload?.open) return null;

  const pick = (color: StatColor): void => {
    EventBus.emit('ui:command:pick_scroll_color', { color });
  };

  return (
    <div
      data-testid="scroll-pick-modal"
      role="dialog"
      aria-modal="true"
      class="pointer-events-auto fixed inset-0 z-40 bg-[#0B0C10]/88 flex items-center justify-center p-3"
    >
      <div class="max-w-2xl w-full max-h-[92vh] overflow-y-auto bg-[#11131C] border-2 border-[#FBBF24] p-4 shadow-2xl text-[#E8EFF5] flex flex-col gap-3">
        <div class="text-center border-b border-[#323954] pb-2">
          <div class="text-[10px] tracking-[0.2em] text-[#FBBF24] uppercase">
            PRIMA MATERIA TRANSMUTATION · 原初质三系嬗变卷轴
          </div>
          <h2 class="text-base font-bold text-[#F8FAFC] mt-0.5">
            选择一项炼金属性注入水银核（伤害 +15% 指数叠乘）
          </h2>
          <div class="text-[11px] text-[#9AA5B8]">
            当前生命上限：{payload.currentHp} / {payload.currentMaxHp} HP
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {payload.options.map((opt, idx) => {
            const meta = STAT_COLOR_META[opt.color];
            return (
              <button
                key={opt.color}
                type="button"
                data-ui-interactive="true"
                data-testid={`btn-pick-scroll-${opt.color}`}
                onClick={() => pick(opt.color)}
                class="cursor-pointer bg-[#161824] hover:bg-[#1E2233] border-2 p-3 text-left flex flex-col justify-between gap-2 transition-colors"
                style={{ borderColor: meta.accentHex }}
              >
                <div>
                  <div class="flex items-center justify-between mb-2">
                    <WeaponPixelIcon iconSlot={meta.scrollIconSlot} scale={1} />
                    <span
                      class="px-1.5 py-0.5 text-[10px] font-bold bg-[#0B0C10] border"
                      style={{ borderColor: meta.accentHex, color: meta.accentHex }}
                    >
                      [{idx + 1}] Lv.{opt.currentLevel} → Lv.{opt.nextLevel}
                    </span>
                  </div>
                  <div class="text-xs font-bold mb-1" style={{ color: meta.accentHex }}>
                    {meta.titleZh}
                  </div>
                  <p class="text-[10px] text-[#B8C4D4] leading-relaxed">{meta.descZh}</p>
                </div>

                <div class="bg-[#0B0C10] border border-[#272C42] p-2 space-y-1 text-[10px]">
                  <div class="flex items-center justify-between">
                    <span class="text-[#9AA5B8]">该系伤害倍率</span>
                    <span class="font-bold text-[#FBBF24]">
                      {Math.round(opt.nextDmgMult * 100)}% (+15%)
                    </span>
                  </div>
                  <div class="flex items-center justify-between">
                    <span class="text-[#9AA5B8]">最大生命增幅</span>
                    <span class="font-bold text-[#3CE682]">
                      +{opt.hpGainFlat} HP (+{opt.hpGainPct}%)
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
