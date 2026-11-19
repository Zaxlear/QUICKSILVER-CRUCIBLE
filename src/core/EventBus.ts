import type { ChemicalReactionId, ElementStatusKey } from '../data/affixes.data';
import type {
  AudioProgramId, AudioTelemetrySnapshot, AudioUserSettings, PauseAudioMenuPayload, SfxGroupId,
} from '../data/audio.data';
import type {
  BossHudSnapshot, BossId, CampaignStageTarget, DialogueBannerSnapshot, TrueEndingSealFlag,
} from '../data/dialogue.data';
import type {
  CollectorBlueprintModalPayload, CursedChestModalPayload, ShopPurchaseModalPayload, SkillCompareModalPayload,
} from '../data/economy.data';
import type { ForgeUpgradeId, MutationForgeModalPayload, MutationId } from '../data/mutations.data';
import type { InputDeviceKind, PlayerStateId, PlayerTelemetrySnapshot, TouchHudSnapshot } from '../data/playerKinematics.data';
import type {
  BiomeId, MinimapBridgeSnapshot, MinimapNodeSnapshot, MinimapSnapshotPayload, RuneId, WorldBannerNotice,
} from '../data/runes.data';
import type { SkillId, SkillSlotId } from '../data/skills.data';
import type {
  ActiveRunSnapshot, AuthPromoteMethod, CloudSyncStatusSnapshot, MetaProgressionRecord,
  SaveConflictChoice, SaveConflictModalPayload, SnapshotConflictState,
} from '../data/storage.data';
import type {
  Milestone5WeaponId, PlayerCombatHudSnapshot, ScrollPickModalPayload,
  StatColor, WeaponCompareModalPayload, WeaponId, WeaponSlotId,
} from '../data/weapons.data';
import type {
  BootTelemetryPayload, ShowcaseShaderId, ShowcaseStatePayload, ViewportSnapshotPayload, ViewportTierId,
} from './SystemPayloads';

export type {
  ActiveRunSnapshot, AudioProgramId, AudioTelemetrySnapshot, AudioUserSettings, AuthPromoteMethod,
  BiomeId, BootTelemetryPayload, BossHudSnapshot, BossId, CampaignStageTarget, ChemicalReactionId,
  CloudSyncStatusSnapshot, CollectorBlueprintModalPayload, CursedChestModalPayload, DialogueBannerSnapshot,
  ForgeUpgradeId, MetaProgressionRecord, Milestone5WeaponId, MinimapBridgeSnapshot, MinimapNodeSnapshot,
  MinimapSnapshotPayload, MutationForgeModalPayload, MutationId, PauseAudioMenuPayload, PlayerCombatHudSnapshot,
  RuneId, SaveConflictChoice, SaveConflictModalPayload, ScrollPickModalPayload, ShopPurchaseModalPayload,
  SfxGroupId, ShowcaseShaderId, ShowcaseStatePayload, SkillCompareModalPayload, SkillId, SkillSlotId,
  SnapshotConflictState, StatColor, TrueEndingSealFlag, ViewportSnapshotPayload, ViewportTierId,
  WeaponCompareModalPayload, WeaponId, WeaponSlotId, WorldBannerNotice,
};

export type ElementStatusId = ElementStatusKey;

export interface GameEventMap {
  'combat:attack_started': { readonly attackerId: string; readonly weaponId: string; readonly comboIndex: number };
  'combat:hit_landed': {
    readonly attackerId: string; readonly targetId: string; readonly damage: number; readonly isCrit: boolean;
    readonly worldX: number; readonly worldY: number; readonly affixIds?: readonly string[];
    readonly attackerStatScale?: number; readonly baseWeaponDamage?: number;
    readonly triggeredBreachStun?: boolean; readonly isMeleeHit?: boolean; readonly isMetallicTarget?: boolean;
  };
  'combat:crit_triggered': { readonly attackerId: string; readonly targetId: string; readonly worldX: number; readonly worldY: number };
  'combat:parry_succeeded': {
    readonly defenderId: string; readonly sourceId: string; readonly worldX: number; readonly worldY: number;
    readonly shieldAffixIds?: readonly string[];
  };
  'combat:dodge_evaded': {
    readonly entityId: string; readonly worldX: number; readonly worldY: number; readonly activeAffixIds?: readonly string[];
  };
  'combat:enemy_killed': {
    readonly enemyId: string; readonly archetypeId: string; readonly worldX: number; readonly worldY: number;
    readonly killerAffixIds?: readonly string[]; readonly killedByMelee?: boolean;
    readonly isElite?: boolean; readonly isBoss?: boolean; readonly speciesId?: string;
  };
  'combat:skill_deployed': {
    readonly skillId: SkillId; readonly worldX: number; readonly worldY: number;
    readonly affixIds: readonly string[]; readonly statScale: number;
  };
  'combat:skill_expired': {
    readonly skillId: SkillId; readonly worldX: number; readonly worldY: number;
    readonly affixIds: readonly string[]; readonly statScale: number; readonly baseDamage: number;
  };
  'combat:curse_changed': { readonly cursedKillsRemaining: number; readonly lifted: boolean };

  'status:applied': { readonly targetId: string; readonly status: ElementStatusId; readonly stacks: number };
  'status:stacked': { readonly targetId: string; readonly status: ElementStatusId; readonly stacks: number };
  'status:reaction_triggered': {
    readonly targetId: string; readonly reactionId: ChemicalReactionId | string;
    readonly worldX: number; readonly worldY: number; readonly burstDamage?: number;
  };
  'status:expired': { readonly targetId: string; readonly status: ElementStatusId };

  'input:device_changed': { readonly device: InputDeviceKind };
  'input:touch_hud_updated': TouchHudSnapshot;
  'player:state_changed': { readonly prev: PlayerStateId; readonly next: PlayerStateId };
  'player:telemetry_updated': PlayerTelemetrySnapshot;
  'player:combat_hud_updated': PlayerCombatHudSnapshot;
  'combat:weapon_compare_opened': WeaponCompareModalPayload | null;
  'combat:skill_compare_opened': SkillCompareModalPayload | null;
  'combat:scroll_pick_opened': ScrollPickModalPayload | null;
  'combat:mutation_forge_opened': MutationForgeModalPayload | null;
  'world:shop_modal_opened': ShopPurchaseModalPayload | null;
  'world:cursed_chest_modal_opened': CursedChestModalPayload | null;
  'narrative:collector_modal_opened': CollectorBlueprintModalPayload | null;
  'boss:hud_updated': BossHudSnapshot | null;
  'boss:phase_changed': { readonly bossId: BossId; readonly phase: 1 | 2 | 3 };
  'narrative:dialogue_updated': DialogueBannerSnapshot | null;
  'narrative:seal_collected': { readonly flagId: TrueEndingSealFlag; readonly totalSeals: number };

  'world:room_entered': { readonly biomeId: string; readonly roomId: string; readonly role: string };
  'world:checkpoint_reached': { readonly roomId: string; readonly checkpointId: string };
  'world:teleporter_activated': { readonly nodeId: string; readonly role: string };
  'world:rune_unlocked': { readonly runeId: RuneId; readonly nameZh: string };
  'world:minimap_updated': MinimapSnapshotPayload;
  'world:floor_recycle_hint': { readonly lootId: string; readonly goldValue: number } | null;
  'save:conflict_detected': { readonly localRunId: string; readonly remoteRunId: string };
  'save:sync_status_updated': CloudSyncStatusSnapshot;
  'save:conflict_modal_updated': SaveConflictModalPayload | null;
  'save:hot_reload_snapshot': { readonly snapshot: ActiveRunSnapshot };
  'audio:combat_intensity_changed': { readonly aggroCount: number; readonly targetCombatWeight: number };
  'audio:death_muffle_changed': { readonly active: boolean };
  'audio:sfx_requested': { readonly sfxId: SfxGroupId; readonly worldX?: number };
  'audio:state_updated': AudioTelemetrySnapshot;
  'ui:pause_menu_updated': PauseAudioMenuPayload;

  'system:boot_ready': BootTelemetryPayload;
  'system:viewport_changed': ViewportSnapshotPayload;
  'system:orientation_lock_changed': { readonly isPortraitLocked: boolean };
  'system:telemetry_updated': BootTelemetryPayload;
  'system:showcase_state_changed': ShowcaseStatePayload;
  'ui:command:set_orientation_pause': { readonly paused: boolean };
  'ui:command:trigger_trauma_pulse': { readonly amount: number };
  'ui:command:toggle_shader': { readonly shader: ShowcaseShaderId; readonly active?: boolean };
  'ui:command:cycle_hero_anim': { readonly direction: 1 | -1 | 0; readonly animKey?: string };
  'ui:command:debug_player_hurt': { readonly damage: number };
  'ui:command:debug_player_respawn': Record<string, never>;
  'ui:command:teleport_to_node': { readonly nodeId: string };
  'ui:command:toggle_minimap': { readonly expanded?: boolean };
  'ui:command:toggle_rune': { readonly runeId: RuneId };
  'ui:command:regenerate_biome': { readonly seed?: number };
  'ui:command:switch_biome': { readonly biomeId: BiomeId; readonly seed?: number };
  'ui:command:warp_campaign_stage': { readonly target?: CampaignStageTarget; readonly toggleSeal?: TrueEndingSealFlag };
  'ui:command:advance_or_dismiss_dialogue': { readonly action: 'next' | 'compact' | 'dismiss' };
  'ui:command:resolve_ending_choice': { readonly choice: 'USURP_THRONE' | 'INJECT_ALKAHEST' };
  'ui:command:debug_boss_smite': { readonly ratio?: number };
  'ui:command:resolve_weapon_compare': { readonly action: 'equip_primary' | 'equip_secondary' | 'cancel' };
  'ui:command:resolve_skill_compare': { readonly action: 'equip_skill_1' | 'equip_skill_2' | 'cancel' };
  'ui:command:recycle_floor_loot': { readonly lootId?: string };
  'ui:command:pick_scroll_color': { readonly color: StatColor };
  'ui:command:equip_weapon_direct': { readonly slot: WeaponSlotId; readonly weaponId: WeaponId };
  'ui:command:equip_skill_direct': { readonly slot: SkillSlotId; readonly skillId: SkillId };
  'ui:command:toggle_mutation_forge': { readonly open?: boolean };
  'ui:command:toggle_mutation_choice': { readonly mutationId: MutationId };
  'ui:command:respec_mutations': Record<string, never>;
  'ui:command:invest_forge_ichor': { readonly upgradeId: ForgeUpgradeId; readonly amount?: number };
  'ui:command:shop_purchase_slot': { readonly slotId: string };
  'ui:command:shop_restock': { readonly shopNodeId: string };
  'ui:command:close_shop_modal': Record<string, never>;
  'ui:command:invest_blueprint_ichor': { readonly blueprintId: string; readonly amount?: number };
  'ui:command:open_collector_modal': Record<string, never>;
  'ui:command:close_collector_modal': Record<string, never>;
  'ui:command:resolve_cursed_chest': { readonly accept: boolean };
  'ui:command:toggle_pause_menu': { readonly open?: boolean };
  'ui:command:update_audio_settings': Partial<AudioUserSettings>;
  'ui:command:toggle_auth_drawer': { readonly open?: boolean };
  'ui:command:toggle_offline_mode': { readonly offline?: boolean };
  'ui:command:trigger_cloud_sync': Record<string, never>;
  'ui:command:simulate_save_conflict': Record<string, never>;
  'ui:command:resolve_save_conflict': { readonly choice: SaveConflictChoice };
  'ui:command:auth_promote': { readonly method: AuthPromoteMethod; readonly email?: string };
}

export type GameEventKey = keyof GameEventMap;
export type GameEventHandler<K extends GameEventKey> = (payload: GameEventMap[K]) => void;

export class TypedEventBus {
  private readonly listeners = new Map<GameEventKey, Set<(payload: never) => void>>();

  public on<K extends GameEventKey>(event: K, handler: GameEventHandler<K>): () => void {
    let bucket = this.listeners.get(event);
    if (!bucket) {
      bucket = new Set();
      this.listeners.set(event, bucket);
    }
    const typedHandler = handler as unknown as (payload: never) => void;
    bucket.add(typedHandler);
    return () => { this.off(event, handler); };
  }

  public once<K extends GameEventKey>(event: K, handler: GameEventHandler<K>): () => void {
    const off = this.on(event, (payload) => { off(); handler(payload); });
    return off;
  }

  public off<K extends GameEventKey>(event: K, handler: GameEventHandler<K>): void {
    const bucket = this.listeners.get(event);
    if (!bucket) return;
    bucket.delete(handler as unknown as (payload: never) => void);
    if (bucket.size === 0) this.listeners.delete(event);
  }

  public emit<K extends GameEventKey>(event: K, payload: GameEventMap[K]): void {
    const bucket = this.listeners.get(event);
    if (!bucket || bucket.size === 0) return;
    for (const fn of bucket) (fn as unknown as GameEventHandler<K>)(payload);
  }

  public clearAll(): void { this.listeners.clear(); }
}

export const EventBus = new TypedEventBus();
