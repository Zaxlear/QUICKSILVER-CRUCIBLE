/**
 * 展开式暗黑炼金战术星盘：四大生态群落、永恒锻炉圣所、双多阶段 Boss 决战房与真结局三封印面板
 * （src/ui/MinimapTacticalModal.tsx）。
 */

import { EventBus, type MinimapNodeSnapshot, type MinimapSnapshotPayload } from '../core/EventBus';
import { ALL_BIOME_IDS, BIOME_CATALOG } from '../data/biomes.data';
import { ALL_TRUE_ENDING_SEALS, TRUE_ENDING_SEAL_META } from '../data/dialogue.data';

const MAP_ICON_SHEET = '/assets/atlases/minimap_ui_sheet.png';

export function resolveRoleMeta(role: string): {
  readonly labelZh: string;
  readonly iconSlot: number;
  readonly borderClass: string;
} {
  switch (role) {
    case 'ENTRANCE': return { labelZh: '出生起点', iconSlot: 0, borderClass: 'border-[#38BDF8] bg-[#161824]' };
    case 'TELEPORTER_HUB': return { labelZh: '传送枢纽', iconSlot: 2, borderClass: 'border-[#38BDF8] bg-[#1E2233]' };
    case 'ELITE': return { labelZh: '精英祭坛', iconSlot: 3, borderClass: 'border-[#E11D48] bg-[#240B12]' };
    case 'SHOP': return { labelZh: '炼金军械商', iconSlot: 4, borderClass: 'border-[#FBBF24] bg-[#291A0E]' };
    case 'LORE': return { labelZh: '环境叙事房', iconSlot: 5, borderClass: 'border-[#A855F7] bg-[#1E2233]' };
    case 'CURSED_VAULT':
    case 'TREASURE': return { labelZh: '受诅咒秘库', iconSlot: 3, borderClass: 'border-[#A855F7] bg-[#240B12]' };
    case 'RUNE_SECRET': return { labelZh: '符文隐藏宝库', iconSlot: 6, borderClass: 'border-[#3CE682] bg-[#0B1F1D]' };
    case 'EXIT': return { labelZh: '水银升降梯', iconSlot: 7, borderClass: 'border-[#FBBF24] bg-[#1E2233]' };
    default: return { labelZh: '群落遭遇战区', iconSlot: 1, borderClass: 'border-[#556085] bg-[#161824]' };
  }
}

export function computeNormalizedMapBounds(minimap: MinimapSnapshotPayload) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const n of minimap.nodes) {
    minX = Math.min(minX, n.worldTileX);
    minY = Math.min(minY, n.worldTileY);
    maxX = Math.max(maxX, n.worldTileX + n.widthTiles);
    maxY = Math.max(maxY, n.worldTileY + n.heightTiles);
  }
  return {
    minX: Number.isFinite(minX) ? minX : 0,
    minY: Number.isFinite(minY) ? minY : 0,
    spanX: Math.max(1, maxX - minX),
    spanY: Math.max(1, maxY - minY),
  };
}

export function MinimapTacticalModal({ minimap }: { readonly minimap: MinimapSnapshotPayload }) {
  if (!minimap.expanded) return null;

  const bounds = computeNormalizedMapBounds(minimap);
  const activeSteles: readonly MinimapNodeSnapshot[] = minimap.nodes.filter((n) => n.teleporterActive);
  const sealsSet = new Set(minimap.collectedSeals ?? []);
  const heat = minimap.crucibleHeat ?? 0;

  return (
    <div
      data-testid="minimap-expanded-modal"
      class="pointer-events-auto fixed inset-0 z-40 bg-[#0B0C10]/88 flex items-center justify-center p-3"
    >
      <div class="max-w-2xl w-full max-h-[94vh] overflow-y-auto bg-[#11131C] border-2 border-[#C28B42] shadow-2xl p-3 text-[#E8EFF5]">
        <div class="flex items-center justify-between border-b border-[#323954] pb-2 mb-2">
          <div>
            <div class="text-xs font-bold tracking-wider text-[#FBBF24]">
              {minimap.biomeNameZh} · 衔尾蛇尖塔战术星盘
            </div>
            <div class="text-[10px] text-[#9AA5B8]">
              RUN SEED #{minimap.runSeed.toString(16).toUpperCase()} · 热阶 HEAT {heat}
            </div>
          </div>
          <div class="flex items-center gap-1.5">
            <button
              type="button"
              data-ui-interactive="true"
              data-testid="btn-regenerate-biome"
              onClick={() => EventBus.emit('ui:command:regenerate_biome', {})}
              class="cursor-pointer bg-[#1E2233] hover:bg-[#272C42] border border-[#556085] px-2 py-1 text-[10px] text-[#D4DEE8]"
            >
              [NEW SEED ↻]
            </button>
            <button
              type="button"
              data-ui-interactive="true"
              data-testid="btn-close-minimap"
              onClick={() => EventBus.emit('ui:command:toggle_minimap', { expanded: false })}
              class="cursor-pointer bg-[#240B12] hover:bg-[#3B121E] border border-[#CF3650] px-2.5 py-1 text-[10px] text-[#FB7185]"
            >
              [CLOSE ✕]
            </button>
          </div>
        </div>

        {/* 圣所基地与双多阶段 Boss 决战房直达跃迁栏 */}
        <div class="grid grid-cols-3 gap-1.5 mb-2">
          <button
            type="button"
            data-ui-interactive="true"
            data-testid="btn-warp-sanctum"
            onClick={() => EventBus.emit('ui:command:warp_campaign_stage', { target: 'sanctum' })}
            class="cursor-pointer px-2 py-1 bg-[#161824] hover:bg-[#1E2233] border border-[#3CE682] text-left text-[#3CE682]"
          >
            <div class="text-[10px] font-bold">0. 永恒锻炉圣所</div>
            <div class="text-[8px] opacity-80">科尔维斯 & 伊索尔德</div>
          </button>
          <button
            type="button"
            data-ui-interactive="true"
            data-testid="btn-warp-boss-1"
            onClick={() => EventBus.emit('ui:command:warp_campaign_stage', { target: 'boss_01_furnace_warden' })}
            class="cursor-pointer px-2 py-1 bg-[#240B12] hover:bg-[#3B121E] border border-[#FF5E2B] text-left text-[#FBBF24]"
          >
            <div class="text-[10px] font-bold">BOSS I · 典狱长萨尔弗</div>
            <div class="text-[8px] opacity-80">大煅烧三号刑炉室</div>
          </button>
          <button
            type="button"
            data-ui-interactive="true"
            data-testid="btn-warp-boss-2"
            onClick={() => EventBus.emit('ui:command:warp_campaign_stage', { target: 'boss_02_grand_alchemist' })}
            class="cursor-pointer px-2 py-1 bg-[#1E2233] hover:bg-[#272C42] border border-[#38BDF8] text-left text-[#38BDF8]"
          >
            <div class="text-[10px] font-bold">BOSS II · 帕拉塞尔苏斯</div>
            <div class="text-[8px] opacity-80">星界王座 (P1/P2/真结局P3)</div>
          </button>
        </div>

        {/* 四大生态群落星盘切换栏 */}
        <div class="grid grid-cols-4 gap-1.5 mb-2">
          {ALL_BIOME_IDS.map((bid) => {
            const spec = BIOME_CATALOG[bid];
            const isActiveBiome = bid === minimap.biomeId && !minimap.currentRoomId.startsWith('sanctum') && !minimap.currentRoomId.startsWith('arena_');
            return (
              <button
                key={bid}
                type="button"
                data-ui-interactive="true"
                data-testid={`btn-switch-biome-${bid}`}
                onClick={() => EventBus.emit('ui:command:switch_biome', { biomeId: bid })}
                class={`cursor-pointer px-2 py-1 border text-left transition-colors ${
                  isActiveBiome ? 'bg-[#291A0E] border-[#FBBF24] text-[#FBBF24]' : 'bg-[#161824] hover:bg-[#1E2233] border-[#323954] text-[#B8C4D4]'
                }`}
              >
                <div class="text-[10px] font-bold">{spec.romanTier}. {spec.nameZh}</div>
                <div class="text-[8px] opacity-80 truncate">{spec.nameEn}</div>
              </button>
            );
          })}
        </div>

        {/* 原初质三枚真名封印状态栏（集齐三枚解锁帕拉塞尔苏斯隐藏 P3 真结局） */}
        <div class="flex flex-wrap items-center justify-between gap-1.5 bg-[#0B0C10] border border-[#272C42] px-2 py-1 mb-2">
          <span class="text-[9px] text-[#9AA5B8]">真结局原初质真名封印 ({sealsSet.size}/3)：</span>
          <div class="flex flex-wrap gap-1">
            {ALL_TRUE_ENDING_SEALS.map((flag) => {
              const meta = TRUE_ENDING_SEAL_META[flag];
              const lit = sealsSet.has(flag);
              return (
                <button
                  key={flag}
                  type="button"
                  data-ui-interactive="true"
                  data-testid={`btn-seal-${flag}`}
                  onClick={() => EventBus.emit('ui:command:warp_campaign_stage', { toggleSeal: flag })}
                  class={`cursor-pointer px-1.5 py-0.5 border text-[9px] font-bold ${
                    lit ? 'bg-[#1E2233] text-[#F8FAFC]' : 'bg-[#0B0C10] border-[#323954] text-[#556085]'
                  }`}
                  style={lit ? { borderColor: meta.accentHex, color: meta.accentHex } : undefined}
                >
                  {lit ? '✦ ' : '○ '}{meta.shortZh}
                </button>
              );
            })}
          </div>
        </div>

        {/* 2D 全景 DAG 拓扑星盘画布 */}
        <div class="relative w-full h-32 bg-[#0B0C10] border border-[#323954] mb-2 overflow-hidden">
          {minimap.bridges.map((br) => (
            <div
              key={br.bridgeId}
              class={`absolute ${br.requiredRune ? 'bg-[#3CE682]/65' : 'bg-[#7A5128]/75'}`}
              style={{
                left: `${((br.worldTileX - bounds.minX) / bounds.spanX) * 88 + 6}%`,
                top: `${((br.worldTileY - bounds.minY) / bounds.spanY) * 80 + 10}%`,
                width: `${Math.max(1.2, (br.widthTiles / bounds.spanX) * 88)}%`,
                height: `${Math.max(2.2, (br.heightTiles / bounds.spanY) * 80)}%`,
              }}
            />
          ))}
          {minimap.nodes.map((node) => {
            const meta = resolveRoleMeta(node.role);
            const isCurr = node.nodeId === minimap.currentRoomId;
            const canWarp = node.teleporterActive && !isCurr;
            return (
              <button
                key={node.nodeId}
                type="button"
                data-ui-interactive="true"
                data-testid={`minimap-node-${node.nodeId}`}
                disabled={!canWarp}
                onClick={() => canWarp && EventBus.emit('ui:command:teleport_to_node', { nodeId: node.nodeId })}
                class={`absolute border flex items-center justify-center ${meta.borderClass} ${
                  isCurr ? 'ring-2 ring-[#F8FAFC] z-20' : canWarp ? 'cursor-pointer ring-1 ring-[#38BDF8] z-10' : 'opacity-80'
                }`}
                style={{
                  left: `${((node.worldTileX - bounds.minX) / bounds.spanX) * 88 + 6}%`,
                  top: `${((node.worldTileY - bounds.minY) / bounds.spanY) * 80 + 10}%`,
                  width: `${Math.max(5.5, (node.widthTiles / bounds.spanX) * 88)}%`,
                  height: `${Math.max(12, (node.heightTiles / bounds.spanY) * 80)}%`,
                }}
              >
                <div
                  class="w-4 h-4 pixel-crisp shrink-0"
                  style={{ backgroundImage: `url('${MAP_ICON_SHEET}')`, backgroundSize: '192px 16px', backgroundPosition: `-${meta.iconSlot * 16}px 0px` }}
                />
              </button>
            );
          })}
        </div>

        <div class="flex flex-wrap gap-1.5">
          {activeSteles.map((st) => {
            const meta = resolveRoleMeta(st.role);
            const isHere = st.nodeId === minimap.currentRoomId;
            return (
              <button
                key={st.nodeId}
                type="button"
                data-ui-interactive="true"
                data-testid={`btn-warp-${st.nodeId}`}
                disabled={isHere}
                onClick={() => EventBus.emit('ui:command:teleport_to_node', { nodeId: st.nodeId })}
                class={`px-2 py-0.5 border text-[9px] ${
                  isHere ? 'bg-[#1E2233] border-[#F8FAFC] text-[#F8FAFC]' : 'cursor-pointer bg-[#161824] border-[#38BDF8] text-[#38BDF8]'
                }`}
              >
                {meta.labelZh} {isHere ? '[当前]' : '[✦ 秒传]'}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
