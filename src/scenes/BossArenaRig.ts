/**
 * BossArenaScene 核心战斗、12 武器/6 技能/20 词条协同与双结局分支主控总成
 * （src/scenes/BossArenaRig.ts）。
 */

import Phaser from 'phaser';
import type { CombatTargetView, VoltaicChainSegment } from '../combat/CombatTypes';
import { HitboxManager } from '../combat/HitboxManager';
import { HitStopController } from '../combat/HitStopController';
import { ProjectilePool } from '../combat/ProjectilePool';
import type { ClockController } from '../core/ClockController';
import { EventBus, type BossHudSnapshot, type BossId } from '../core/EventBus';
import { NarrativeStore } from '../core/NarrativeSessionStore';
import { WEAPON_CATALOG } from '../data/weapons.data';
import type { BaseEnemy } from '../entities/enemies/BaseEnemy';
import { FurnaceWardenBoss } from '../entities/enemies/bosses/FurnaceWardenBoss';
import { GrandAlchemistBoss } from '../entities/enemies/bosses/GrandAlchemistBoss';
import { TelegraphRenderer } from '../entities/enemies/TelegraphRenderer';
import { PlayerEntity } from '../entities/player/PlayerEntity';
import { PlayerInventory } from '../entities/player/PlayerInventory';
import type { ActionMap } from '../input/ActionMap';
import type { CameraRig } from '../render/CameraRig';
import type { GhostTrailRenderer } from '../render/GhostTrailRenderer';
import type { LightingDirector } from '../render/LightingDirector';
import type { ActiveCameraPostFXBundle } from '../render/pipelines/PipelineRegistry';
import type { LocomotionVfxRenderer } from '../render/vfx/LocomotionVfxRenderer';
import { ParticleDirector } from '../render/vfx/ParticleDirector';
import { DialogueBannerController } from '../world/DialogueBannerController';
import type { BakedStitchedWorld } from '../world/DoorSocketStitcher';
import type { IWorldDisplayRegistrar } from '../world/ParallaxComposer';
import { restorePlayerCarryover, type RunCarryoverSnapshot } from './BiomeUiCommandBridge';
import { BossArenaVisuals } from './BossArenaVisuals';
import {
  bindArenaUiCommands,
  buildArenaHookBundle,
  triggerArenaParryShockwave,
  triggerArenaPlayerWeaponStage,
} from './BossCombatHelpers';
import { applyResolvedProjectileImpacts, applyResolvedWeaponHits } from './CombatHitResolver';
import { resolvePlayerShieldAndCarapaceHooks } from './CombatModalAndRosterBridge';
import type { ShowcaseShaderController } from './ShowcaseShaderController';
import { SkillAndSynergyCoordinator } from './SkillAndSynergyCoordinator';

declare global {
  interface Window {
    __QC_BOSS_STATE__?: BossHudSnapshot & { readonly quicksilverSeaActive: boolean; readonly gratePhase?: string };
    __QC_BOSS_ARENA__?: {
      damageBoss: (amount: number) => void;
      chooseEnding: (choice: 'USURP_THRONE' | 'INJECT_ALKAHEST') => void;
    };
  }
}

export class BossArenaRig {
  public readonly player: PlayerEntity;
  public readonly boss: FurnaceWardenBoss | GrandAlchemistBoss;
  public readonly visuals: BossArenaVisuals;
  public readonly hitStop: HitStopController;
  public readonly hitboxes = new HitboxManager();
  public readonly projectiles = new ProjectilePool();
  public readonly particles: ParticleDirector;
  public readonly telegraph: TelegraphRenderer;
  public readonly synergy: SkillAndSynergyCoordinator;
  public readonly bannerCtrl = new DialogueBannerController();

  private readonly bossList: BaseEnemy[];
  private readonly targetScratch: CombatTargetView[] = [];
  private readonly chainScratch: VoltaicChainSegment[] = [];
  private readonly unbindChoice: () => void;
  private blackholePullX = 0;
  private blackholeSpeed = 0;
  private victoryCommitted = false;
  public lastHitStopMs = 0;

  public constructor(
    scene: Phaser.Scene, registrar: IWorldDisplayRegistrar, private readonly bossId: BossId,
    private readonly baked: BakedStitchedWorld, arenaWidthPx: number, floorY: number,
    actionMap: ActionMap, private readonly heroSprite: Phaser.GameObjects.Sprite,
    ghostTrail: GhostTrailRenderer, locomotionVfx: LocomotionVfxRenderer,
    clock: ClockController, private readonly cameraRig: CameraRig,
    private readonly lighting: LightingDirector, private readonly postFx: ActiveCameraPostFXBundle,
    shaderCtrl: ShowcaseShaderController, carryover: RunCarryoverSnapshot | undefined,
    private readonly onExitGateActivated: () => void, private readonly onPlayerRespawnToSanctum: () => void
  ) {
    NarrativeStore.resetArenaEndingFlow();
    const centerX = arenaWidthPx * 0.5;
    this.visuals = new BossArenaVisuals(scene, registrar, lighting, baked, bossId, centerX, floorY, arenaWidthPx);
    this.telegraph = new TelegraphRenderer(scene, registrar);
    this.hitStop = new HitStopController(clock);
    this.particles = new ParticleDirector(scene, cameraRig, baked);

    const arenaHooks = buildArenaHookBundle({
      visuals: this.visuals, clock, cameraRig, lighting, postFx,
      getBossPos: () => ({ x: this.boss.x, y: this.boss.y }),
      onSetBlackhole: (cx, spd) => { this.blackholePullX = cx; this.blackholeSpeed = spd; },
    });

    this.boss =
      bossId === 'boss_01_furnace_warden'
        ? new FurnaceWardenBoss(scene, registrar, this.telegraph, { x: arenaWidthPx - 170, y: floorY, minX: 72, maxX: arenaWidthPx - 72, arenaCallbacks: arenaHooks })
        : new GrandAlchemistBoss(scene, registrar, this.telegraph, { x: centerX + 90, y: floorY, minX: 76, maxX: arenaWidthPx - 76, arenaCallbacks: arenaHooks });
    this.bossList = [this.boss];

    const initInv = carryover ? new PlayerInventory(carryover.primaryWeapon, carryover.secondaryWeapon, carryover.loadout) : undefined;
    this.player = new PlayerEntity({
      spawnX: 116, spawnY: floorY, world: baked, input: actionMap, inventory: initInv,
      hasMagneticClawsRune: true, hasCalcinedRamRune: NarrativeStore.unlockedRunes.includes('rune_calcined_ram'),
      hooks: {
        playAnim: (k) => heroSprite.play(k, true),
        setSpriteFrame: (f) => { heroSprite.anims.stop(); heroSprite.setFrame(f); },
        spawnGhostTrail: () => ghostTrail.spawnGhost(this.player.physics.x, this.player.physics.y, heroSprite.frame.name || 'hero_dodge_roll_2', this.player.physics.facing < 0, 1.15),
        emitLocomotionVfx: (kind, dirX) => locomotionVfx.emitCue(kind, this.player.physics.x, this.player.physics.y, dirX),
        setShieldRefractActive: (a) => shaderCtrl.setPlayerParryShield(a || this.synergy?.skillRuntime.aegisUrnSec > 0),
        triggerHitFlash: (ms) => { shaderCtrl.triggerHeroHitFlash(ms); cameraRig.addTrauma(0.38); },
        notifyWeaponStageActive: (wid, idx, slot) => triggerArenaPlayerWeaponStage({
          weaponId: wid, stageIndex: idx, slot, player: this.player, projectiles: this.projectiles,
          hitboxes: this.hitboxes, particles: this.particles, targets: this.targetScratch,
          chainScratch: this.chainScratch, resolverCtx: this.resolverCtx(),
        }),
        notifyParrySucceeded: () => triggerArenaParryShockwave(this.player, this.hitboxes, this.particles, this.hitStop, cameraRig, postFx, this.bossList),
        notifyFlaskDrunk: (amt) => defenseHooks.handleFlaskDrunk(amt),
        notifySkillActivated: (slot) => this.synergy.activateSkillSlot(slot),
        absorbIncomingWithSkillShield: (raw) => defenseHooks.absorbIncomingWithSkillShield(raw),
        tryEmergencyCarapaceSave: (b, a) => defenseHooks.tryEmergencyCarapaceSave(b, a),
      },
    });
    if (carryover) restorePlayerCarryover(this.player, carryover);

    const biomeRef = bossId === 'boss_01_furnace_warden' ? 'biome_02_vitriol_sewers' : 'biome_04_crucible_apex';
    this.synergy = new SkillAndSynergyCoordinator(scene, biomeRef, this.player, this.bossList, this.projectiles, this.particles, cameraRig, lighting, postFx, () => this.targetScratch);
    const defenseHooks = resolvePlayerShieldAndCarapaceHooks(this.player, this.bossList, this.particles, lighting, this.synergy);

    this.unbindChoice = bindArenaUiCommands({
      boss: this.boss, player: this.player,
      onCommitVictory: () => this.commitBossVictory(),
      onCheckVictory: () => this.checkBossVictory(),
      onEmitHud: () => this.emitBossHud(),
    });

    window.__QC_BOSS_ARENA__ = {
      damageBoss: (amt) => { this.boss.applyHit(amt, 2.5, 1, this.player.physics.x); this.checkBossVictory(); this.emitBossHud(); },
      chooseEnding: (c) => EventBus.emit('ui:command:resolve_ending_choice', { choice: c }),
    };
    this.emitBossHud();
  }

  public stepFixed(dtSec: number, interactPressed: boolean): void {
    const { x: px, y: py, facing } = this.player.physics;
    if (this.blackholeSpeed > 0 && !this.player.isInvulnerable) {
      this.player.physics.x += (this.blackholePullX >= px ? 1 : -1) * this.blackholeSpeed * dtSec;
    }

    if (this.player.ctx.isAttackHitboxActive) {
      const st = this.player.inventory.getSlotDefinition(this.player.ctx.activeWeaponSlot).stages[this.player.ctx.comboIndex];
      if (st) this.hitboxes.syncPlayerSwingPosition(px + facing * st.hitboxOffsetX, py + st.hitboxOffsetY);
    } else if (this.player.state !== 'Parry') this.hitboxes.cancelPlayerSwingBox();

    this.targetScratch.length = 0;
    this.targetScratch.push(this.boss.toTargetView(this.synergy.skillRuntime.isPointInConductiveZone(this.boss.x, this.boss.y)));

    const meleeHits = this.hitboxes.stepFixed(px, this.targetScratch, (wid, sIdx) => WEAPON_CATALOG[wid].stages[sIdx % WEAPON_CATALOG[wid].stages.length]!.breach);
    if (meleeHits.length > 0) this.lastHitStopMs = Math.max(this.lastHitStopMs, applyResolvedWeaponHits(this.resolverCtx(), meleeHits));

    const pImpacts = this.projectiles.stepFixed(
      dtSec, this.baked.solidRects, this.targetScratch,
      { x: px, y: py, width: this.player.physics.colliderWidth, height: this.player.physics.colliderHeight, isParryWindowActive: this.player.ctx.isParryWindowActive, facing, equippedShieldId: this.player.inventory.getEquippedShieldId() },
      () => { this.player.receiveIncomingHit(0, -facing as -1 | 1, true); if (this.boss instanceof GrandAlchemistBoss) this.boss.shredPrismShieldFromParry(220); },
      (kind, wx, wy) => this.synergy.handleLobbedFlaskShattered(kind, wx, wy)
    );
    if (pImpacts.length > 0) applyResolvedProjectileImpacts(this.resolverCtx(), pImpacts, this.onPlayerRespawnToSanctum);

    this.telegraph.beginFrame(dtSec * 1000);
    this.boss.stepFixed({
      dtSec, dtMs: dtSec * 1000, playerX: px, playerY: py, playerFacing: facing,
      playerStealthed: false, solidRects: this.baked.solidRects, roomAllies: this.bossList,
      onStrikePlayer: (dmg, dirX, parriable, src) => {
        const res = this.player.receiveIncomingHit(dmg, dirX, parriable);
        if (res === 'parried') src.forceStun(src.onParriedByPlayer());
        else if (res === 'dead') this.onPlayerRespawnToSanctum();
      },
      onSpawnProjectile: (sid, ox, oy, vx, vy, dmg, g, kind) => this.projectiles.spawnEnemyFlaskBolt(sid, ox, oy, vx, vy, dmg, g, kind),
      onSpawnAcidOrFireHazard: (wx, wy, rad) => this.lighting.spawnTransientFlash(wx, wy, 0x3ce682, rad * 2, 2.2, 220),
      onDrawGroundEffect: (k, gx, gy) => this.telegraph.drawGroundEffect(k, gx, gy),
    }, this.projectiles.getEmbeddedArrowCount(this.boss.id));
    this.telegraph.endFrame();

    const shieldHp = this.boss instanceof GrandAlchemistBoss ? this.boss.prismShieldHp : 0;
    this.visuals.stepFixed(dtSec, px, py, this.boss.x, this.boss.y, shieldHp, (dmg, dirX) => {
      if (this.player.receiveIncomingHit(dmg, dirX, false) === 'dead') this.onPlayerRespawnToSanctum();
    });

    this.synergy.stepFixed(dtSec, this.heroSprite);
    this.particles.syncProjectileSprites(this.projectiles);
    this.particles.stepFixed(dtSec);
    this.bannerCtrl.stepFixed(dtSec * 1000, px, this.player.state === 'DodgeRoll', Math.abs(this.player.physics.vx) > 25);
    this.checkBossVictory();
    if (this.visuals.exitGateActive && interactPressed && Math.abs(px - this.visuals.exitGateX) <= 56) this.onExitGateActivated();
    this.emitBossHud();
  }

  public emitBossHud(): void {
    const gratePhase = this.boss instanceof FurnaceWardenBoss ? this.boss.gratePhase : undefined;
    const snap: BossHudSnapshot = { ...this.boss.buildBossHudSnapshot(), quicksilverSeaActive: this.visuals.quicksilverSeaActive, gratePhase };
    window.__QC_BOSS_STATE__ = { ...snap, quicksilverSeaActive: this.visuals.quicksilverSeaActive, gratePhase };
    EventBus.emit('boss:hud_updated', this.victoryCommitted && snap.endingState === 'NONE' ? null : snap);
  }

  public destroy(): void {
    this.unbindChoice();
    EventBus.emit('boss:hud_updated', null);
    this.bannerCtrl.destroy(); this.synergy.destroy(); this.boss.destroy();
    this.visuals.destroy(); this.telegraph.destroy(); this.particles.destroy();
    this.hitboxes.releaseAll(); this.projectiles.releaseAll();
  }

  private checkBossVictory(): void {
    if (this.victoryCommitted || this.boss.isAlive) return;
    if (this.boss instanceof GrandAlchemistBoss && this.boss.endingState === 'AWAITING_ALKAHEST_CHOICE') return;
    this.commitBossVictory();
  }

  private commitBossVictory(): void {
    if (this.victoryCommitted) return;
    this.victoryCommitted = true;
    NarrativeStore.recordBossDefeated(this.bossId);
    this.player.stats.ichor += this.bossId === 'boss_01_furnace_warden' ? 85 : 180;
    if (this.bossId === 'boss_01_furnace_warden') {
      EventBus.emit('world:rune_unlocked', { runeId: 'rune_calcined_ram', nameZh: '煅烧震地符文' });
      this.particles.damageNumbers.spawnLabel(this.boss.x, this.boss.y - 54, '✦获得【煅烧震地符文】!', 'PARRY');
      this.visuals.revealExitGate('[E/ACT] 晋升 III. 发条骸骨堂');
    } else {
      const isTrue = this.boss instanceof GrandAlchemistBoss && this.boss.endingState === 'END_TRUE_RETURN_PAIN';
      this.bannerCtrl.showEndingEpilogue(isTrue, this.player.physics.x);
      this.visuals.revealExitGate('[E/ACT] 水银回流 -> 永恒锻炉圣所');
    }
  }

  private resolverCtx() {
    return {
      biomeId: (this.bossId === 'boss_01_furnace_warden' ? 'biome_02_vitriol_sewers' : 'biome_04_crucible_apex') as 'biome_02_vitriol_sewers' | 'biome_04_crucible_apex',
      player: this.player, agents: this.bossList, projectilePool: this.projectiles, hitStop: this.hitStop,
      particles: this.particles, cameraRig: this.cameraRig, lighting: this.lighting, postFx: this.postFx,
      synergy: this.synergy, getTargets: () => this.targetScratch,
      isPlayerInConductiveHazard: () => this.synergy.skillRuntime.isPointInConductiveZone(this.player.physics.x, this.player.physics.y),
      onEnemySlain: () => this.checkBossVictory(),
      onPlayerKilled: this.onPlayerRespawnToSanctum,
    };
  }
}
