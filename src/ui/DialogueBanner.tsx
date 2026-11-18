/**
 * 底部不遮挡视野的暗黑炼金 NPC 台词卷轴与自动平滑折叠伴随轻字幕组件
 * （src/ui/DialogueBanner.tsx）。
 *
 * 严格遵循 docs/03 §1.4.2 与零占位符铁律：
 * - FULL 态：展示 npc_portraits_sheet.png 48 色像素立绘、说话人头衔与完整台词，绝不锁死玩家行动；
 * - COMPACT_SUBTITLE 态：当玩家半途翻滚或走离说话人时，自动平滑收拢为底部一行轻字幕。
 */

import { EventBus, type DialogueBannerSnapshot } from '../core/EventBus';

const PORTRAIT_SHEET = '/assets/atlases/npc_portraits_sheet.png';

export interface DialogueBannerProps {
  readonly payload: DialogueBannerSnapshot | null;
  readonly compactMobileMode?: boolean;
}

export function DialogueBanner({ payload, compactMobileMode = false }: DialogueBannerProps) {
  if (!payload) return null;

  if (payload.mode === 'COMPACT_SUBTITLE') {
    return (
      <div
        data-testid="dialogue-banner-compact"
        class={`pointer-events-none fixed left-1/2 -translate-x-1/2 ${
          compactMobileMode ? 'bottom-14 max-w-sm' : 'bottom-20 max-w-xl'
        } w-[88%] z-30 bg-[#0B0C10]/88 border px-3 py-1 shadow-lg flex items-center gap-2 transition-all duration-300`}
        style={{ borderColor: payload.accentHex }}
      >
        <span
          class="w-4 h-4 pixel-crisp shrink-0 inline-block"
          style={{
            backgroundImage: `url('${PORTRAIT_SHEET}')`,
            backgroundSize: '96px 16px',
            backgroundPosition: `-${payload.portraitSlot * 16}px 0px`,
          }}
        />
        <span class="text-[10px] font-bold shrink-0" style={{ color: payload.accentHex }}>
          {payload.speakerNameZh}：
        </span>
        <span class="text-[10px] text-[#E8EFF5] truncate">{payload.bodyZh}</span>
      </div>
    );
  }

  return (
    <div
      data-testid="dialogue-banner-full"
      class={`pointer-events-auto fixed left-1/2 -translate-x-1/2 ${
        compactMobileMode ? 'bottom-16 max-w-md' : 'bottom-24 max-w-2xl'
      } w-[90%] z-35 bg-[#11131C]/95 border-2 p-3 shadow-2xl transition-all duration-300`}
      style={{ borderColor: payload.accentHex }}
    >
      <div class="flex items-start gap-3">
        <div
          class="w-12 h-12 pixel-crisp shrink-0 border border-[#323954] bg-[#0B0C10]"
          style={{
            backgroundImage: `url('${PORTRAIT_SHEET}')`,
            backgroundSize: '288px 48px',
            backgroundPosition: `-${payload.portraitSlot * 48}px 0px`,
          }}
        />
        <div class="flex-1 min-w-0">
          <div class="flex flex-wrap items-center justify-between gap-1.5 mb-1">
            <div>
              <span class="text-xs font-bold mr-2" style={{ color: payload.accentHex }}>
                {payload.speakerNameZh}
              </span>
              <span class="text-[9px] text-[#9AA5B8]">{payload.speakerTitleZh}</span>
            </div>
            <div class="flex items-center gap-1.5">
              {payload.badgeChipZh && (
                <span
                  data-testid="dialogue-reward-chip"
                  class="px-1.5 py-0.5 bg-[#161824] border border-[#FBBF24] text-[9px] font-bold text-[#FBBF24]"
                >
                  {payload.badgeChipZh}
                </span>
              )}
              {payload.canAdvance && (
                <button
                  type="button"
                  data-ui-interactive="true"
                  data-testid="btn-dialogue-next"
                  onClick={() => EventBus.emit('ui:command:advance_or_dismiss_dialogue', { action: 'next' })}
                  class="cursor-pointer px-2 py-0.5 bg-[#1E2233] hover:bg-[#272C42] border border-[#556085] text-[9px] text-[#D4DEE8]"
                >
                  [继续 / 收起]
                </button>
              )}
            </div>
          </div>

          <p class="text-[11px] text-[#E8EFF5] leading-relaxed">{payload.bodyZh}</p>
          <div class="text-[9px] text-[#7C8599] mt-1">
            {payload.sourceKind === 'LORE'
              ? '提示：按任意移动或翻滚键可立即零阻断收起卷轴继续跑图'
              : '提示：角色行动未锁定，直接翻滚或走开将自动收起为底部伴随轻字幕'}
          </div>
        </div>
      </div>
    </div>
  );
}
