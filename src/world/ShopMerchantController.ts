/**
 * 炼金军械商三槽位明码标价货架、防刷档快照去重与最多 3 次付费刷新控制器
 * （src/world/ShopMerchantController.ts，严格 <= 220 行）。
 */

import type Phaser from 'phaser';
import { DepthLayer, PALETTE_VOID_HEX, TILE_SIZE_PX } from '../core/Constants';
import type { DeterministicRng } from '../core/DeterministicRng';
import { EventBus } from '../core/EventBus';
import { NarrativeStore } from '../core/NarrativeSessionStore';
import { BIOME_CATALOG } from '../data/biomes.data';
import {
  computeGearShopPrice, computeTonicShopPrice, ECONOMY_CONSTANTS, SHOP_RESTOCK_COSTS,
  type ShopMerchandiseSlotView, type ShopPurchaseModalPayload, type ShopSupplyKind,
} from '../data/economy.data';
import { SKILL_CATALOG, type RolledSkillInstance, type SkillId } from '../data/skills.data';
import { DEFAULT_STARTER_SKILLS, DEFAULT_STARTER_WEAPONS } from '../data/storage.data';
import { QUALITY_TIERS, WEAPON_CATALOG, type QualityTier, type RolledWeaponInstance, type WeaponId } from '../data/weapons.data';
import { rollForgeGrade } from '../entities/player/ForgeGradeRoller';
import type { PlayerEntity } from '../entities/player/PlayerEntity';
import { projectSkillSlotView, projectWeaponSlotView } from '../entities/player/WeaponCompareProjection';
import type { GeneratedBiomeDag } from './DagBiomeGenerator';
import type { IWorldDisplayRegistrar } from './ParallaxComposer';

interface ShopSlotEntry {
  readonly slotId: string;
  readonly kind: 'WEAPON' | 'SKILL' | ShopSupplyKind;
  readonly priceGold: number;
  readonly weapon?: RolledWeaponInstance;
  readonly skill?: RolledSkillInstance;
  purchased: boolean;
  readonly displaySprite: Phaser.GameObjects.Sprite | null;
}

interface ShopStationState {
  readonly shopNodeId: string;
  readonly x: number;
  readonly y: number;
  restocksUsed: number;
  slots: ShopSlotEntry[];
  readonly rackSprite: Phaser.GameObjects.Sprite | null;
}

export class ShopMerchantController {
  private readonly shops: ShopStationState[] = [];
  private readonly purchasedIds = new Set<string>();
  private readonly promptLabel: Phaser.GameObjects.Text | null;
  private activeShopNodeId: string | null = null;
  private rejectNoticeZh: string | null = null;

  public constructor(
    private readonly scene: Phaser.Scene | null,
    private readonly registrar: IWorldDisplayRegistrar | null,
    private readonly dag: GeneratedBiomeDag,
    private readonly player: PlayerEntity,
    private readonly lootRng: DeterministicRng,
    private readonly biomeDepth: 1 | 2 | 3 | 4,
    private readonly onEquipBoughtWeapon: (wpn: RolledWeaponInstance, wx: number, wy: number) => void,
    private readonly onEquipBoughtSkill: (skl: RolledSkillInstance, wx: number, wy: number) => void,
    private readonly onSupplyConsumedFeedback: (label: string, wx: number, wy: number) => void
  ) {
    this.promptLabel = scene && registrar
      ? registrar.registerCrispOverlay(
          scene.add.text(0, 0, '', { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '10px', fontStyle: 'bold', color: '#FBBF24', stroke: PALETTE_VOID_HEX, strokeThickness: 3 })
            .setOrigin(0.5, 1.0).setDepth(DepthLayer.CRISP_TELEGRAPH + 2).setVisible(false)
        )
      : null;
    this.populateBiomeShops();
  }

  public get isModalOpen(): boolean { return this.activeShopNodeId !== null; }
  public get purchasedSlotIds(): readonly string[] { return Array.from(this.purchasedIds); }

  public restorePurchasedSlotIds(ids: readonly string[]): void {
    for (const id of ids) {
      this.purchasedIds.add(id);
      for (const sh of this.shops) {
        const s = sh.slots.find((it) => it.slotId === id);
        if (s) { s.purchased = true; s.displaySprite?.setVisible(false); }
      }
    }
  }

  public openShopModal(shopNodeId?: string): void {
    const target = shopNodeId ? this.shops.find((s) => s.shopNodeId === shopNodeId) : this.shops[0];
    if (!target) return;
    this.activeShopNodeId = target.shopNodeId;
    this.rejectNoticeZh = null;
    this.publishModal();
  }

  public closeShopModal(): void {
    if (!this.activeShopNodeId) return;
    this.activeShopNodeId = null;
    this.rejectNoticeZh = null;
    EventBus.emit('world:shop_modal_opened', null);
  }

  public purchaseSlot(slotId: string): boolean {
    const shop = this.shops.find((s) => s.slots.some((sl) => sl.slotId === slotId));
    const slot = shop?.slots.find((sl) => sl.slotId === slotId);
    if (!shop || !slot || slot.purchased) return false;
    if (this.player.stats.gold < slot.priceGold) {
      this.rejectNoticeZh = `[金币不足：需 ${slot.priceGold}G]`;
      this.publishModal();
      return false;
    }
    this.player.stats.gold -= slot.priceGold;
    slot.purchased = true;
    this.purchasedIds.add(slot.slotId);
    slot.displaySprite?.setVisible(false);
    this.rejectNoticeZh = null;
    EventBus.emit('audio:sfx_requested', { sfxId: 'sfx_ichor_pickup', worldX: shop.x });

    if (slot.kind === 'WEAPON' && slot.weapon) { this.closeShopModal(); this.onEquipBoughtWeapon(slot.weapon, shop.x - 18, shop.y); return true; }
    if (slot.kind === 'SKILL' && slot.skill) { this.closeShopModal(); this.onEquipBoughtSkill(slot.skill, shop.x + 18, shop.y); return true; }
    if (slot.kind === 'TONIC_FLASK') {
      if (this.player.stats.flaskCharges < this.player.stats.maxFlaskCharges) {
        this.player.stats.flaskCharges += 1;
        this.onSupplyConsumedFeedback('✦灵液药瓶 +1 充能!', shop.x, shop.y - 36);
      } else this.onSupplyConsumedFeedback(`✦过量蒸馏 +${this.player.stats.healDirect(this.player.stats.maxHp * 0.6)} HP`, shop.x, shop.y - 36);
    } else {
      this.onSupplyConsumedFeedback(`✦钙化髓膏 +${this.player.stats.healDirect(this.player.stats.maxHp * ECONOMY_CONSTANTS.SHOP_MARROW_HEAL_RATIO)} HP`, shop.x, shop.y - 36);
    }
    this.publishModal();
    return true;
  }

  public restockShop(shopNodeId: string): boolean {
    const shop = this.shops.find((s) => s.shopNodeId === shopNodeId);
    if (!shop || (NarrativeStore.forgeTiers.shop_restock_lvl ?? 0) <= 0 || shop.restocksUsed >= ECONOMY_CONSTANTS.SHOP_MAX_RESTOCKS) return false;
    const cost = SHOP_RESTOCK_COSTS[shop.restocksUsed] ?? 420;
    if (this.player.stats.gold < cost) { this.rejectNoticeZh = `[金币不足：需 ${cost}G]`; this.publishModal(); return false; }
    this.player.stats.gold -= cost;
    shop.restocksUsed += 1;
    this.clearShopDisplaySprites(shop);
    shop.slots = this.rollThreeSlotsForShop(shop.shopNodeId, shop.x, shop.y, shop.restocksUsed);
    this.rejectNoticeZh = null;
    this.publishModal();
    return true;
  }

  public stepFixed(px: number, py: number, interactJustPressed: boolean, onOpenRequested: () => void): void {
    const near = this.shops.find((s) => Math.hypot(px - s.x, py - s.y) <= 44) ?? null;
    if (!near) { if (this.promptLabel?.visible) this.promptLabel.setVisible(false); return; }
    const leftCount = near.slots.filter((s) => !s.purchased).length;
    this.promptLabel?.setText(`[E/ACT] 炼金军械商（在售 ${leftCount}/3）`).setPosition(near.x, near.y - 48).setVisible(true);
    if (interactJustPressed) { this.openShopModal(near.shopNodeId); onOpenRequested(); }
  }

  public buildModalPayload(shopNodeId?: string): ShopPurchaseModalPayload | null {
    const shop = shopNodeId ? this.shops.find((s) => s.shopNodeId === shopNodeId) : this.shops[0];
    if (!shop) return null;
    const stats = this.player.stats.snapshotLevels;
    const wpnAffixes = [...this.player.inventory.primaryWeapon.affixIds, ...this.player.inventory.secondaryWeapon.affixIds];
    const sklTags = this.player.inventory.loadout.collectSkillProvidedTags();
    const restockUnlocked = (NarrativeStore.forgeTiers.shop_restock_lvl ?? 0) > 0;
    const slots: ShopMerchandiseSlotView[] = shop.slots.map((sl) => ({
      slotId: sl.slotId, categoryLabelZh: sl.kind === 'WEAPON' ? '主战兵器' : sl.kind === 'SKILL' ? '炼金技能' : '炼金补给',
      kind: sl.kind, priceGold: sl.priceGold, purchased: sl.purchased,
      weaponView: sl.weapon ? projectWeaponSlotView(sl.weapon, stats, wpnAffixes, sklTags) : undefined,
      skillView: sl.skill ? projectSkillSlotView(sl.skill, stats, wpnAffixes) : undefined,
      supplyTitleZh: sl.kind === 'TONIC_FLASK' ? '高纯度灵液烧瓶' : sl.kind === 'MARROW_SALVE' ? '钙化髓膏' : undefined,
      supplyDescZh: sl.kind === 'TONIC_FLASK' ? '立即恢复 1 口药瓶充能（满充能回 60% MaxHP）。' : sl.kind === 'MARROW_SALVE' ? '立即修补白瓷裂痕，当场恢复 55% MaxHP。' : undefined,
      supplyFrame: sl.kind === 'TONIC_FLASK' ? 'shop_tonic_flask' : sl.kind === 'MARROW_SALVE' ? 'shop_marrow_salve' : undefined,
    }));
    return {
      open: true, shopNodeId: shop.shopNodeId, biomeNameZh: BIOME_CATALOG[this.dag.biomeId].nameZh,
      playerGold: this.player.stats.gold, slots, restockUnlocked, restocksUsed: shop.restocksUsed,
      nextRestockCostGold: restockUnlocked && shop.restocksUsed < 3 ? SHOP_RESTOCK_COSTS[shop.restocksUsed]! : null,
      rejectNoticeZh: this.rejectNoticeZh,
    };
  }

  public destroy(): void {
    for (const sh of this.shops) { this.clearShopDisplaySprites(sh); if (sh.rackSprite && this.registrar) { this.registrar.unregister(sh.rackSprite); sh.rackSprite.destroy(); } }
    if (this.promptLabel && this.registrar) { this.registrar.unregister(this.promptLabel); this.promptLabel.destroy(); }
    this.shops.length = 0;
  }

  private publishModal(): void { if (this.activeShopNodeId) EventBus.emit('world:shop_modal_opened', this.buildModalPayload(this.activeShopNodeId)); }

  private populateBiomeShops(): void {
    for (const node of this.dag.nodes) {
      if (node.chunk.role !== 'SHOP') continue;
      const ped = node.chunk.rewardPedestalTilePos ?? { tileX: 20, tileY: 25 };
      const sx = (node.worldTileX + ped.tileX) * TILE_SIZE_PX + 8;
      const sy = (node.worldTileY + ped.tileY + 1) * TILE_SIZE_PX;
      const rackSprite = this.scene && this.registrar ? this.registrar.registerWorldLit(this.scene.add.sprite(sx, sy, 'world_props_atlas', 'shop_armory_rack').setOrigin(0.5, 1.0).setDepth(DepthLayer.PROPS_BACK + 1).setPipeline('Light2D')) : null;
      this.registrar?.registerAmbientLight({ id: `shop_amber_${node.nodeId}`, x: sx, y: sy - 28, preset: 'TORCH_AMBER', radiusPx: 185, flickerAmplitude: 0.08 });
      this.shops.push({ shopNodeId: node.nodeId, x: sx, y: sy, restocksUsed: 0, rackSprite, slots: this.rollThreeSlotsForShop(node.nodeId, sx, sy, 0) });
    }
  }

  private rollThreeSlotsForShop(nodeId: string, sx: number, sy: number, batchIdx: number): ShopSlotEntry[] {
    const level: QualityTier = QUALITY_TIERS[Math.min(5, this.biomeDepth)] ?? 'II';
    const wpnPool = NarrativeStore.unlockedWeapons.length > 0 ? NarrativeStore.unlockedWeapons : (DEFAULT_STARTER_WEAPONS as readonly WeaponId[]);
    const sklPool = NarrativeStore.unlockedSkills.length > 0 ? NarrativeStore.unlockedSkills : (DEFAULT_STARTER_SKILLS as readonly SkillId[]);
    const wGrade = rollForgeGrade(this.lootRng, NarrativeStore.forgeTiers, this.biomeDepth, NarrativeStore.maxCrucibleHeat);
    const sGrade = rollForgeGrade(this.lootRng, NarrativeStore.forgeTiers, this.biomeDepth, NarrativeStore.maxCrucibleHeat);
    const weapon = this.player.inventory.rollWeaponInstance(this.lootRng, this.lootRng.pick(wpnPool), level, wGrade);
    const skill = this.player.inventory.loadout.rollSkillInstance(this.lootRng, this.lootRng.pick(sklPool), level, sGrade);
    const supplyKind: ShopSupplyKind = this.lootRng.nextBool(0.5) ? 'TONIC_FLASK' : 'MARROW_SALVE';
    const mk = (ox: number, atlas: string, frame: string): Phaser.GameObjects.Sprite | null =>
      this.scene && this.registrar ? this.registrar.registerWorldLit(this.scene.add.sprite(sx + ox, sy - 28, atlas, frame).setDepth(DepthLayer.LOOT).setPipeline('Light2D')) : null;
    const wDef = WEAPON_CATALOG[weapon.weaponId];
    return [
      { slotId: `${nodeId}_r${batchIdx}_A`, kind: 'WEAPON', priceGold: computeGearShopPrice('WEAPON', level, wGrade), weapon, purchased: false, displaySprite: mk(-16, wDef.worldAtlas, wDef.worldFrame) },
      { slotId: `${nodeId}_r${batchIdx}_B`, kind: 'SKILL', priceGold: computeGearShopPrice('SKILL', level, sGrade), skill, purchased: false, displaySprite: mk(0, 'synergy_fx_atlas', SKILL_CATALOG[skill.skillId].worldFrame) },
      { slotId: `${nodeId}_r${batchIdx}_C`, kind: supplyKind, priceGold: computeTonicShopPrice(this.biomeDepth), purchased: false, displaySprite: mk(16, 'world_props_atlas', supplyKind === 'TONIC_FLASK' ? 'shop_tonic_flask' : 'shop_marrow_salve') },
    ];
  }

  private clearShopDisplaySprites(shop: ShopStationState): void {
    for (const sl of shop.slots) if (sl.displaySprite && this.registrar) { this.registrar.unregister(sl.displaySprite); sl.displaySprite.destroy(); }
  }
}
