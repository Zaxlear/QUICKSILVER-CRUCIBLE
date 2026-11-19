/**
 * 受诅咒秘匣开启警示确认框（src/ui/CursedChestModal.tsx）。
 * 100% 对齐 docs/06_BETA_1_0_2_DEVELOPMENT_PLAN.md §3.3。
 */

import { useEffect } from 'preact/hooks';
import { EventBus } from '../core/EventBus';
import type { CursedChestModalPayload } from '../data/economy.data';

export interface CursedChestModalProps {
  readonly payload: CursedChestModalPayload | null;
}

export function CursedChestModal({ payload }: CursedChestModalProps) {
  useEffect(() => {
    if (!payload?.open) return;
    const onKey = (ev: KeyboardEvent): void => {
      if (ev.code === 'Escape') {
        ev.preventDefault();
        EventBus.emit('ui:command:resolve_cursed_chest', { accept: false });
      } else if (ev.code === 'Enter') {
        ev.preventDefault();
        EventBus.emit('ui:command:resolve_cursed_chest', { accept: true });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [payload]);

  if (!payload?.open) return null;

  return (
    <div
      data-testid="cursed-chest-modal"
      role="dialog"
      aria-modal="true"
      class="pointer-events-auto fixed inset-0 z-40 bg-[#0B0C10]/90 flex items-center justify-center p-4"
    >
      <div class="max-w-md w-full bg-[#11131C] border-2 border-[#A855F7] p-4 shadow-[0_0_28px_rgba(168,85,247,0.45)] text-[#E8EFF5] flex flex-col gap-3">
        <div class="text-[10px] tracking-[0.2em] text-[#A855F7] uppercase font-bold">
          CURSED RELIQUARY VAULT · 受诅咒秘库契约
        </div>
        <h2 class="text-sm font-bold text-[#F8FAFC]">【开启受诅咒秘匣】</h2>

        <div class="bg-[#161824] border border-[#6D28D9] p-3 text-xs leading-relaxed space-y-2">
          <div class="text-[#FBBF24] font-bold">
            获得：无色传奇武器 ×1 + 炼金三系卷轴 ×1 + {payload.bonusGold}G
          </div>
          <div class="text-[#FB7185] font-bold">
            代价：承受【{payload.killRequirement} 杀血咒】——解除前遭受任何伤害立即粉身碎骨（无视护盾与应急凝壳）！
          </div>
        </div>

        <div class="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            data-ui-interactive="true"
            data-testid="btn-decline-curse"
            onClick={() => EventBus.emit('ui:command:resolve_cursed_chest', { accept: false })}
            class="cursor-pointer px-3 py-1.5 bg-[#161824] hover:bg-[#1E2233] border border-[#414A6B] text-[10px] font-bold text-[#B8C4D4]"
          >
            [谨慎退开 ESC]
          </button>
          <button
            type="button"
            data-ui-interactive="true"
            data-testid="btn-accept-curse"
            onClick={() => EventBus.emit('ui:command:resolve_cursed_chest', { accept: true })}
            class="cursor-pointer px-3 py-1.5 bg-[#3B0764] hover:bg-[#6D28D9] border border-[#A855F7] text-[10px] font-bold text-[#F8FAFC]"
          >
            [☠ 缔结血咒并开启 ENTER]
          </button>
        </div>
      </div>
    </div>
  );
}
