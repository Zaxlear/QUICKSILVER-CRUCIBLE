/**
 * 强类型 EventBus 声学事件路由器（src/audio/AudioEventRouter.ts）：
 * 单一职责负责将场景切换、群落小地图、Boss 转阶段、玩家濒死血量与战斗/元素反应事件映射至音频引擎。
 */

import type { AudioProgramId, AudioUserSettings, SfxGroupId } from '../data/audio.data';
import { AUDIO_CONSTANTS, DEFAULT_AUDIO_SETTINGS } from '../data/audio.data';
import type { TypedEventBus } from '../core/EventBus';
import type { AdaptiveStemMixer } from './AdaptiveStemMixer';
import type { WebAudioFilterRack } from './WebAudioFilterRack';

export function loadPersistedAudioSettings(): AudioUserSettings {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return { ...DEFAULT_AUDIO_SETTINGS };
    const raw = window.localStorage.getItem(AUDIO_CONSTANTS.STORAGE_KEY);
    if (!raw) return { ...DEFAULT_AUDIO_SETTINGS };
    const p = JSON.parse(raw) as Partial<AudioUserSettings>;
    return {
      masterVolume: typeof p.masterVolume === 'number' ? Math.max(0, Math.min(1, p.masterVolume)) : DEFAULT_AUDIO_SETTINGS.masterVolume,
      bgmVolume: typeof p.bgmVolume === 'number' ? Math.max(0, Math.min(1, p.bgmVolume)) : DEFAULT_AUDIO_SETTINGS.bgmVolume,
      sfxVolume: typeof p.sfxVolume === 'number' ? Math.max(0, Math.min(1, p.sfxVolume)) : DEFAULT_AUDIO_SETTINGS.sfxVolume,
      muted: Boolean(p.muted),
    };
  } catch {
    return { ...DEFAULT_AUDIO_SETTINGS };
  }
}

export function savePersistedAudioSettings(settings: AudioUserSettings): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem(AUDIO_CONSTANTS.STORAGE_KEY, JSON.stringify(settings));
    }
  } catch {
    // Safari 无痕或非浏览器环境安全忽略
  }
}

export interface AudioEventRouteHooks {
  readonly bus: TypedEventBus;
  readonly stemMixer: AdaptiveStemMixer;
  readonly filterRack: WebAudioFilterRack;
  getEffectiveBgmGain(): number;
  triggerSfx(sfxId: SfxGroupId, worldX?: number): void;
  setActiveSceneKey(sceneKey: string): void;
  setListenerX(x: number): void;
  setPortraitLocked(locked: boolean): void;
  setSubModalOpen(slotBit: 0 | 1 | 2 | 3, open: boolean): void;
  setPauseMenuOpen(open: boolean): void;
  togglePauseMenu(explicitOpen?: boolean): void;
}

export function bindAudioEventRoutes(hooks: AudioEventRouteHooks): Array<() => void> {
  const { bus, stemMixer, filterRack } = hooks;
  let lastSceneKey = '';

  return [
    bus.on('system:showcase_state_changed', ({ activeSceneKey }) => {
      const sceneChanged = activeSceneKey !== lastSceneKey;
      lastSceneKey = activeSceneKey;
      hooks.setActiveSceneKey(activeSceneKey);
      if (sceneChanged) {
        hooks.setPauseMenuOpen(false);
        if (activeSceneKey === 'SanctumHubScene') {
          stemMixer.setProgram('sanctum', 1, hooks.getEffectiveBgmGain());
        }
      }
    }),
    bus.on('world:minimap_updated', (m) => {
      hooks.setSubModalOpen(3, m.expanded);
      if (m.currentRoomId.startsWith('sanctum_')) {
        stemMixer.setProgram('sanctum', 1, hooks.getEffectiveBgmGain());
      } else if (!m.currentRoomId.startsWith('arena_')) {
        stemMixer.setProgram(m.biomeId as AudioProgramId, 1, hooks.getEffectiveBgmGain());
      }
    }),
    bus.on('boss:hud_updated', (b) => {
      if (!b) return;
      stemMixer.setProgram(b.bossId, b.phase, hooks.getEffectiveBgmGain());
      stemMixer.setBossPhase(b.phase);
    }),
    bus.on('boss:phase_changed', ({ bossId, phase }) => {
      stemMixer.setProgram(bossId, phase, hooks.getEffectiveBgmGain());
      stemMixer.setBossPhase(phase);
    }),
    bus.on('audio:combat_intensity_changed', ({ aggroCount }) => {
      stemMixer.setAggroCount(aggroCount);
    }),
    bus.on('player:telemetry_updated', (t) => {
      hooks.setListenerX(t.x);
    }),
    bus.on('player:combat_hud_updated', ({ hp, maxHp }) => {
      const lowHp = hp > 0 && hp < maxHp * AUDIO_CONSTANTS.LOW_HP_RATIO_THRESHOLD;
      filterRack.setMuffleState({ lowHp });
      stemMixer.setLowHpPulse(lowHp);
    }),
    bus.on('system:orientation_lock_changed', ({ isPortraitLocked }) => {
      hooks.setPortraitLocked(isPortraitLocked);
    }),
    bus.on('combat:weapon_compare_opened', (p) => hooks.setSubModalOpen(0, Boolean(p?.open))),
    bus.on('combat:scroll_pick_opened', (p) => hooks.setSubModalOpen(1, Boolean(p?.open))),
    bus.on('combat:mutation_forge_opened', (p) => hooks.setSubModalOpen(2, Boolean(p?.open))),
    bus.on('audio:sfx_requested', ({ sfxId, worldX }) => hooks.triggerSfx(sfxId, worldX)),
    bus.on('combat:hit_landed', (ev) => {
      hooks.triggerSfx(ev.isMetallicTarget ? 'sfx_hit_clockwork' : 'sfx_hit_flesh', ev.worldX);
      if (ev.triggeredBreachStun) hooks.triggerSfx('sfx_breach_stun', ev.worldX);
    }),
    bus.on('combat:crit_triggered', (ev) => hooks.triggerSfx('sfx_crit_impact', ev.worldX)),
    bus.on('combat:parry_succeeded', (ev) => hooks.triggerSfx('sfx_parry_clang', ev.worldX)),
    bus.on('combat:enemy_killed', (ev) => {
      hooks.triggerSfx('sfx_enemy_dissolve', ev.worldX);
      hooks.triggerSfx('sfx_ichor_pickup', ev.worldX);
    }),
    bus.on('status:applied', ({ status }) => {
      if (status === 'frozen') hooks.triggerSfx('sfx_status_freeze');
      else if (status === 'electrified') hooks.triggerSfx('sfx_voltaic_zap');
    }),
    bus.on('status:reaction_triggered', ({ reactionId, worldX }) => {
      if (reactionId === 'HEMORRHAGE_BURST') hooks.triggerSfx('sfx_hemorrhage_pop', worldX);
      else if (reactionId === 'BRITTLE_SHATTER') hooks.triggerSfx('sfx_status_freeze', worldX);
      else if (reactionId === 'ELECTROLYTIC_SURGE') hooks.triggerSfx('sfx_voltaic_zap', worldX);
    }),
    bus.on('world:rune_unlocked', () => hooks.triggerSfx('sfx_scroll_upgrade')),
    bus.on('ui:command:pick_scroll_color', () => hooks.triggerSfx('sfx_scroll_upgrade')),
    bus.on('ui:command:toggle_pause_menu', ({ open }) => hooks.togglePauseMenu(open)),
  ];
}
