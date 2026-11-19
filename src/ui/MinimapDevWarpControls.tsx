/**
 * 战术星盘开发者调试跃迁子面板（src/ui/MinimapDevWarpControls.tsx）：
 * 仅在开发环境显式激活（`?dev=1` / `?qa=1` 或 `F9`）时挂载，正式游玩与生产构建下彻底隐藏。
 */

import { EventBus, type MinimapSnapshotPayload } from '../core/EventBus';
import { ALL_BIOME_IDS, BIOME_CATALOG } from '../data/biomes.data';

const DEV_STAGE_WARPS = [
  {
    id: 'sanctum',
    testId: 'btn-warp-sanctum',
    title: '[DEV] 0. 永恒锻炉圣所',
    sub: '科尔维斯 & 伊索尔德',
    cls: 'bg-[#161824] hover:bg-[#1E2233] border-[#3CE682] text-[#3CE682]',
  },
  {
    id: 'boss_01_furnace_warden',
    testId: 'btn-warp-boss-1',
    title: '[DEV] BOSS I · 萨尔弗',
    sub: '大煅烧三号刑炉室',
    cls: 'bg-[#240B12] hover:bg-[#3B121E] border-[#FF5E2B] text-[#FBBF24]',
  },
  {
    id: 'boss_02_grand_alchemist',
    testId: 'btn-warp-boss-2',
    title: '[DEV] BOSS II · 帕拉塞尔苏斯',
    sub: '星界王座 (P1/P2/P3)',
    cls: 'bg-[#1E2233] hover:bg-[#272C42] border-[#38BDF8] text-[#38BDF8]',
  },
] as const;

export function MinimapDevWarpControls({ minimap }: { readonly minimap: MinimapSnapshotPayload }) {
  return (
    <>
      <div class="grid grid-cols-3 gap-1.5 mb-2">
        {DEV_STAGE_WARPS.map((w) => (
          <button
            key={w.id}
            type="button"
            data-ui-interactive="true"
            data-testid={w.testId}
            onClick={() => EventBus.emit('ui:command:warp_campaign_stage', { target: w.id })}
            class={`cursor-pointer px-2 py-1 border text-left ${w.cls}`}
          >
            <div class="text-[10px] font-bold">{w.title}</div>
            <div class="text-[8px] opacity-80">{w.sub}</div>
          </button>
        ))}
      </div>

      <div class="grid grid-cols-4 gap-1.5 mb-2">
        {ALL_BIOME_IDS.map((bid) => {
          const spec = BIOME_CATALOG[bid];
          const isActiveBiome =
            bid === minimap.biomeId &&
            !minimap.currentRoomId.startsWith('sanctum') &&
            !minimap.currentRoomId.startsWith('arena_');
          return (
            <button
              key={bid}
              type="button"
              data-ui-interactive="true"
              data-testid={`btn-switch-biome-${bid}`}
              onClick={() => EventBus.emit('ui:command:switch_biome', { biomeId: bid })}
              class={`cursor-pointer px-2 py-1 border text-left transition-colors ${
                isActiveBiome
                  ? 'bg-[#291A0E] border-[#FBBF24] text-[#FBBF24]'
                  : 'bg-[#161824] hover:bg-[#1E2233] border-[#323954] text-[#B8C4D4]'
              }`}
            >
              <div class="text-[10px] font-bold">
                {spec.romanTier}. {spec.nameZh}
              </div>
              <div class="text-[8px] opacity-80 truncate">{spec.nameEn}</div>
            </button>
          );
        })}
      </div>
    </>
  );
}
