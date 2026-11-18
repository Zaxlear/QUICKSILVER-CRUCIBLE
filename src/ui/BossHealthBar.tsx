/**
 * 多阶段 Boss 分割大血条、P1 棱镜护盾槽、出招提示与终局【万能溶剂 Alkahest】抉择弹窗
 * （src/ui/BossHealthBar.tsx）。
 *
 * 严格遵循 UI 隔离铁律：零 Phaser 实例引用，100% 免疫 WebGL 全屏震动与色差撕裂污染。
 */

import { EventBus, type BossHudSnapshot } from '../core/EventBus';
import { ALL_TRUE_ENDING_SEALS, TRUE_ENDING_SEAL_META } from '../data/dialogue.data';

export interface BossHealthBarProps {
  readonly payload: BossHudSnapshot | null;
  readonly compactMobileMode?: boolean;
}

export function BossHealthBar({ payload, compactMobileMode = false }: BossHealthBarProps) {
  if (!payload) return null;

  const hpPct = Math.max(0, Math.min(100, (payload.hp / Math.max(1, payload.maxHp)) * 100));
  const shieldPct =
    payload.maxPrismShieldHp > 0
      ? Math.max(0, Math.min(100, (payload.prismShieldHp / payload.maxPrismShieldHp) * 100))
      : 0;
  const isPhase3 = payload.phase === 3;
  const barGradient = isPhase3
    ? 'bg-gradient-to-r from-[#38BDF8] via-[#E8EFF5] to-[#FB7185]'
    : payload.phase === 2
      ? 'bg-gradient-to-r from-[#A62B44] via-[#FF5E2B] to-[#FBBF24]'
      : 'bg-gradient-to-r from-[#7D2438] via-[#E11D48] to-[#FB7185]';

  return (
    <>
      <div
        data-testid="boss-health-bar"
        data-phase={String(payload.phase)}
        data-transitioning={String(payload.isTransitioning)}
        data-grate-phase={payload.gratePhase ?? 'NONE'}
        data-quicksilver-sea={String(Boolean(payload.quicksilverSeaActive))}
        class={`pointer-events-none fixed z-30 ${
          compactMobileMode
            ? 'bottom-2 left-[44%] -translate-x-1/2 w-[352px] max-w-[42vw] px-2.5 py-1'
            : 'top-3.5 left-1/2 -translate-x-1/2 w-[48%] max-w-xl px-3 py-1.5'
        } bg-[#0B0C10]/92 border-2 ${
          isPhase3 ? 'border-[#38BDF8]' : 'border-[#C28B42]'
        } shadow-2xl`}
      >
        <div class="flex items-center justify-between gap-2 mb-1">
          <div class="truncate">
            {!compactMobileMode && (
              <span class="text-[9px] tracking-[0.18em] text-[#E0AE53] uppercase mr-2">
                {payload.nameEn}
              </span>
            )}
            <span class={`${compactMobileMode ? 'text-[10px]' : 'text-xs'} font-bold text-[#F8FAFC]`}>
              {payload.nameZh}
            </span>
          </div>
          <div class="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              data-ui-interactive="true"
              data-testid="btn-qa-boss-smite"
              disabled={payload.isTransitioning}
              onClick={() => EventBus.emit('ui:command:debug_boss_smite', {})}
              class={`pointer-events-auto cursor-pointer px-1.5 py-0.2 text-[8px] font-bold border ${
                payload.isTransitioning
                  ? 'bg-[#161824] border-[#414A6B] text-[#7C8599] opacity-70 cursor-not-allowed'
                  : 'bg-[#1E2233] hover:bg-[#2B314A] border-[#FBBF24] text-[#FBBF24]'
              }`}
            >
              {payload.isTransitioning ? '转阶段中' : 'QA削血'}
            </button>
            <span
              class={`px-1.5 py-0.2 text-[9px] font-bold border ${
                isPhase3
                  ? 'bg-[#161824] border-[#38BDF8] text-[#38BDF8]'
                  : payload.phase === 2
                    ? 'bg-[#291A0E] border-[#FF5E2B] text-[#FBBF24]'
                    : 'bg-[#240B12] border-[#E11D48] text-[#FB7185]'
              }`}
            >
              PHASE {payload.phase === 3 ? 'III · ALKAHEST' : payload.phase === 2 ? 'II' : 'I'}
            </span>
            <span class="text-[10px] font-mono text-[#D4DEE8]">
              {payload.hp} / {payload.maxHp}
            </span>
          </div>
        </div>

        {/* P1 帕拉塞尔苏斯 600 HP 棱镜护盾独立槽 */}
        {payload.prismShieldHp > 0 && (
          <div class="w-full h-1.5 bg-[#161824] border border-[#323954] mb-1 overflow-hidden">
            <div
              data-testid="boss-prism-shield-fill"
              class="h-full bg-[#38BDF8] transition-all duration-100"
              style={{ width: `${shieldPct}%` }}
            />
          </div>
        )}

        {/* 主血条与阶段分割刻度线 */}
        <div class="relative w-full h-3 bg-[#161824] border border-[#414A6B] overflow-hidden">
          <div
            data-testid="boss-hp-fill"
            class={`h-full transition-all duration-75 ${barGradient}`}
            style={{ width: `${hpPct}%` }}
          />
          {payload.phaseNotchRatio !== null && (
            <div
              title="转阶段狂暴阈值"
              class="absolute top-0 bottom-0 w-0.5 bg-[#F8FAFC] shadow"
              style={{ left: `${payload.phaseNotchRatio * 100}%` }}
            />
          )}
        </div>

        <div class="flex items-center justify-between text-[9px] text-[#9AA5B8] mt-1">
          <span class="text-[#FBBF24] truncate">✦ {payload.activeMoveLabelZh}</span>
          <span>
            {payload.statusBadge ? `[${payload.statusBadge}] · ` : ''}
            {payload.arenaTitleZh}
          </span>
        </div>
      </div>

      {/* 帕拉塞尔苏斯 P2 击败瞬间：集齐三封印触发【吞噬王座 vs 注入万能溶剂】终极抉择 */}
      {payload.endingState === 'AWAITING_ALKAHEST_CHOICE' && (
        <div
          data-testid="alkahest-choice-modal"
          role="dialog"
          aria-modal="true"
          class="pointer-events-auto fixed inset-0 z-50 bg-[#0B0C10]/88 flex items-center justify-center p-4"
        >
          <div class="max-w-lg w-full bg-[#11131C] border-2 border-[#38BDF8] p-4 shadow-2xl text-[#E8EFF5]">
            <div class="text-[10px] tracking-[0.22em] text-[#38BDF8] uppercase mb-1">
              PRIMA MATERIA CONVERGENCE · 原初质终局抉择
            </div>
            <h2 class="text-base font-bold text-[#F8FAFC] mb-2">
              衔尾蛇发条神躯已崩裂，三枚真名封印正在水银核内剧烈共鸣
            </h2>
            <div class="flex flex-wrap gap-1.5 mb-3">
              {ALL_TRUE_ENDING_SEALS.map((flag) => (
                <span
                  key={flag}
                  class="px-2 py-0.5 bg-[#161824] border text-[9px] font-bold"
                  style={{
                    borderColor: TRUE_ENDING_SEAL_META[flag].accentHex,
                    color: TRUE_ENDING_SEAL_META[flag].accentHex,
                  }}
                >
                  ✦ {TRUE_ENDING_SEAL_META[flag].shortZh}
                </span>
              ))}
            </div>
            <p class="text-xs text-[#B8C4D4] leading-relaxed mb-4">
              你可以像历代篡位者一样吞噬王座算力，化为新一代冰冷神明；或将科尔维斯托付的禁忌【万能溶剂（Alkahest）】注入裂隙，唤醒帕拉塞尔苏斯被剥离的人类真身，决一死战。
            </p>
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                data-ui-interactive="true"
                data-testid="btn-choice-usurp"
                onClick={() => EventBus.emit('ui:command:resolve_ending_choice', { choice: 'USURP_THRONE' })}
                class="cursor-pointer py-2 px-3 bg-[#240B12] hover:bg-[#3B121E] border border-[#E11D48] text-xs font-bold text-[#FB7185]"
              >
                [吞噬王座 · 篡位钙化]
              </button>
              <button
                type="button"
                data-ui-interactive="true"
                data-testid="btn-choice-alkahest"
                onClick={() => EventBus.emit('ui:command:resolve_ending_choice', { choice: 'INJECT_ALKAHEST' })}
                class="cursor-pointer py-2 px-3 bg-[#161824] hover:bg-[#1E2233] border-2 border-[#38BDF8] text-xs font-bold text-[#38BDF8]"
              >
                [★ 注入万能溶剂 Alkahest]
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
