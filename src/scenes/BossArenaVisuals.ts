/**
 * BossArenaScene 场地动态机关与史诗环境特效渲染器（src/scenes/BossArenaVisuals.ts）。
 */

import Phaser from 'phaser';
import { DepthLayer, PALETTE_VOID_HEX } from '../core/Constants';
import type { BossId } from '../data/dialogue.data';
import type { AstrolabeLaserState, GrateStateKind, QuicksilverBladeWave, SlidingFlameWave } from '../entities/enemies/bosses/BossTypes';
import type { LightingDirector } from '../render/LightingDirector';
import type { BakedStitchedWorld } from '../world/DoorSocketStitcher';
import type { IWorldDisplayRegistrar } from '../world/ParallaxComposer';

const BLEND_ADD = 1;

export class BossArenaVisuals {
  public quicksilverSeaActive = false;
  public exitGateActive = false;
  public readonly exitGateX: number;

  private readonly allSprites: Phaser.GameObjects.Sprite[] = [];
  private readonly grateSprites: Phaser.GameObjects.Sprite[] = [];
  private readonly grateXs: readonly [number, number, number, number];
  private activeGrates: readonly (0 | 1 | 2 | 3)[] = [0];
  private grateState: GrateStateKind = 'IDLE';
  private grateDmgCooldownMs = 0;

  private readonly flameWaves: SlidingFlameWave[] = [];
  private readonly flameWavePool: Phaser.GameObjects.Sprite[] = [];
  private readonly astrolabeWheel: Phaser.GameObjects.Sprite | null = null;
  private readonly laserBeam: Phaser.GameObjects.Sprite | null = null;
  private readonly prismHalo: Phaser.GameObjects.Sprite | null = null;
  private readonly blackholeSprite: Phaser.GameObjects.Sprite | null = null;
  private readonly miniSunSprite: Phaser.GameObjects.Sprite | null = null;
  private readonly matrixSprites: Phaser.GameObjects.Sprite[] = [];
  private readonly platformSprites: Phaser.GameObjects.Sprite[] = [];
  private readonly seaTileSprites: Phaser.GameObjects.Sprite[] = [];
  private readonly bladeSprites: Phaser.GameObjects.Sprite[] = [];
  private readonly safeRippleSprite: Phaser.GameObjects.Sprite | null = null;
  private readonly exitGateSprite: Phaser.GameObjects.Sprite;
  private readonly promptLabel: Phaser.GameObjects.Text;

  private platformsTargetElevated = false;
  private platformCurrentY: number;
  private animMs = 0;

  public constructor(
    scene: Phaser.Scene,
    private readonly registrar: IWorldDisplayRegistrar,
    private readonly lighting: LightingDirector,
    private readonly baked: BakedStitchedWorld,
    private readonly bossId: BossId,
    private readonly centerX: number,
    private readonly floorY: number,
    arenaWidthPx: number
  ) {
    const mk = (x: number, y: number, atlas: string, frame: string, depth: number, add = false): Phaser.GameObjects.Sprite => {
      const s = registrar.registerWorldLit(scene.add.sprite(x, y, atlas, frame).setDepth(depth));
      if (add) s.setBlendMode(BLEND_ADD); else s.setPipeline('Light2D');
      this.allSprites.push(s);
      return s;
    };

    this.grateXs = [centerX - 196, centerX - 68, centerX + 68, centerX + 196];
    this.platformCurrentY = floorY - 52;
    this.exitGateX = arenaWidthPx - 96;

    if (bossId === 'boss_01_furnace_warden') {
      for (const gx of this.grateXs) {
        this.grateSprites.push(mk(gx, floorY, 'boss_fx_atlas', 'furnace_grate_idle', DepthLayer.TRAPS).setOrigin(0.5, 1.0));
      }
    } else {
      this.astrolabeWheel = mk(centerX, floorY - 192, 'boss_fx_atlas', 'ouroboros_astrolabe_ring', DepthLayer.PROPS_BACK).setScale(2.0).setAlpha(0.92);
      registrar.registerAmbientLight({ id: 'astro_main', x: centerX, y: floorY - 192, preset: 'TORCH_AMBER', radiusPx: 260, flickerAmplitude: 0.06 });
      this.laserBeam = mk(centerX, floorY - 192, 'boss_fx_atlas', 'astrolabe_aim_line', DepthLayer.PROJECTILES + 2, true).setOrigin(0.0, 0.5).setVisible(false);
      this.prismHalo = mk(centerX, floorY - 48, 'boss_fx_atlas', 'prism_shield_halo_0', DepthLayer.VFX_PARTICLES, true).setVisible(false);
      this.blackholeSprite = mk(centerX, floorY - 46, 'boss_fx_atlas', 'blackhole_core_0', DepthLayer.TRAPS, true).setVisible(false);
      this.miniSunSprite = mk(centerX, floorY - 120, 'boss_fx_atlas', 'calcination_mini_sun_0', DepthLayer.VFX_PARTICLES + 1, true).setVisible(false);

      for (const px of [centerX - 188, centerX + 188]) {
        this.platformSprites.push(mk(px, this.platformCurrentY, 'boss_fx_atlas', 'porcelain_float_platform', DepthLayer.TILE_MAIN).setOrigin(0.5, 0.0));
        baked.oneWayPlatforms.push({ x: px - 46, y: this.platformCurrentY, w: 92 });
      }
      for (const mx of [centerX - 160, centerX - 80, centerX, centerX + 80, centerX + 160]) {
        this.matrixSprites.push(mk(mx, floorY, 'boss_fx_atlas', 'matrix_floor_rune_0', DepthLayer.TRAPS, true).setOrigin(0.5, 1.0).setVisible(false));
      }
      for (let sx = 48; sx < arenaWidthPx - 32; sx += 64) {
        this.seaTileSprites.push(mk(sx, floorY + 2, 'boss_fx_atlas', 'quicksilver_sea_tile_0', DepthLayer.TILE_MAIN + 2).setOrigin(0.0, 1.0).setVisible(false));
      }
      for (let bi = 0; bi < 8; bi++) {
        this.bladeSprites.push(mk(120 + bi * 84, floorY, 'boss_fx_atlas', 'quicksilver_blade_forest_0', DepthLayer.TRAPS + 2).setOrigin(0.5, 1.0).setVisible(false));
      }
      this.safeRippleSprite = mk(centerX, floorY, 'boss_fx_atlas', 'quicksilver_ripple_safe', DepthLayer.TRAPS + 3, true).setOrigin(0.5, 1.0).setVisible(false);
    }

    for (let i = 0; i < 6; i++) {
      this.flameWavePool.push(mk(-999, floorY, 'boss_fx_atlas', 'sulfur_fire_wave_0', DepthLayer.PROJECTILES, true).setOrigin(0.5, 1.0).setVisible(false));
    }

    const isSulfur = bossId === 'boss_01_furnace_warden';
    this.exitGateSprite = mk(this.exitGateX, floorY, isSulfur ? 'world_props_atlas' : 'sanctum_hub_atlas', isSulfur ? 'exit_mercury_lift' : 'throne_portal_gate', DepthLayer.LOOT)
      .setOrigin(0.5, 1.0).setVisible(false);
    this.promptLabel = registrar.registerCrispOverlay(
      scene.add.text(this.exitGateX, floorY - 76, '', { fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', fontSize: '10px', color: '#38BDF8', stroke: PALETTE_VOID_HEX, strokeThickness: 3 })
        .setOrigin(0.5, 1.0).setDepth(DepthLayer.CRISP_TELEGRAPH + 1).setVisible(false)
    );
  }

  public syncGrates(activePair: readonly (0 | 1 | 2 | 3)[], state: GrateStateKind): void { this.activeGrates = activePair; this.grateState = state; }
  public spawnSulfurFlameWave(originX: number, dirX: -1 | 1): void { this.flameWaves.push({ x: originX + dirX * 28, y: this.floorY, vx: dirX * 210, remainingMs: 1450 }); }
  public setPlatformsElevated(elevated: boolean): void { this.platformsTargetElevated = elevated; }
  public setBlackholeVisible(v: boolean): void { this.blackholeSprite?.setVisible(v); }

  public syncAstrolabeLaser(laser: AstrolabeLaserState): void {
    if (!this.laserBeam) return;
    if (!laser.active) { this.laserBeam.setVisible(false); return; }
    const bit = (Math.floor(this.animMs / 65) & 1) as 0 | 1;
    this.laserBeam.setVisible(true).setTexture('boss_fx_atlas', laser.isHotBeam ? `astrolabe_laser_beam_${bit}` : 'astrolabe_aim_line')
      .setPosition(laser.originX, laser.originY).setRotation(laser.angleRad).setScale(9.2, laser.isHotBeam ? 1.35 : 0.9);
    if (laser.isHotBeam && (Math.floor(this.animMs / 110) & 1) === 0) {
      this.lighting.spawnTransientFlash(laser.originX + Math.cos(laser.angleRad) * 230, Math.min(this.floorY - 8, laser.originY + Math.sin(laser.angleRad) * 230), 0xff5e2b, 180, 2.2, 110);
    }
  }

  public syncMatrixFloor(state: 'OFF' | 'WARN' | 'BURN'): void {
    for (const ms of this.matrixSprites) {
      ms.setVisible(state !== 'OFF');
      if (state !== 'OFF') ms.setFrame(state === 'WARN' ? 'matrix_floor_rune_0' : 'matrix_floor_erupt_0');
    }
  }

  public activateQuicksilverSea(): void {
    this.quicksilverSeaActive = true;
    for (const st of this.seaTileSprites) st.setVisible(true);
    this.lighting.spawnTransientFlash(this.centerX, this.floorY - 24, 0x38bdf8, 320, 3.0, 420);
  }

  public syncQuicksilverBlades(wave: QuicksilverBladeWave | null): void {
    if (!wave) {
      for (const bs of this.bladeSprites) bs.setVisible(false);
      this.safeRippleSprite?.setVisible(false);
      return;
    }
    this.safeRippleSprite?.setPosition(wave.safeGapCenterX, this.floorY).setVisible(true);
    for (const bs of this.bladeSprites) bs.setVisible(Math.abs(bs.x - wave.safeGapCenterX) > wave.safeGapHalfWidthPx + 18);
  }

  public syncCalcinationSun(active: boolean, x: number, y: number, ratio: number): void {
    this.miniSunSprite?.setVisible(active);
    if (active) this.miniSunSprite?.setPosition(x, y).setScale(0.55 + ratio * 0.95).setRotation(this.animMs * 0.003);
  }

  public revealExitGate(labelZh: string): void {
    this.exitGateActive = true;
    this.exitGateSprite.setVisible(true);
    this.promptLabel.setText(labelZh);
    this.lighting.spawnTransientFlash(this.exitGateX, this.floorY - 36, 0x38bdf8, 250, 2.7, 360);
  }

  public stepFixed(dtSec: number, px: number, py: number, bx: number, by: number, shieldHp: number, onHit: (dmg: number, dirX: -1 | 1) => void): void {
    const dtMs = dtSec * 1000;
    this.animMs += dtMs;
    if (this.grateDmgCooldownMs > 0) this.grateDmgCooldownMs -= dtMs;
    const bit = (Math.floor(this.animMs / 95) & 1) as 0 | 1;

    if (this.bossId === 'boss_01_furnace_warden') {
      for (let i = 0; i < 4; i++) {
        const st = this.activeGrates.includes(i as 0 | 1 | 2 | 3) ? this.grateState : 'IDLE';
        this.grateSprites[i]!.setFrame(st === 'IDLE' ? 'furnace_grate_idle' : st === 'WARN' ? 'furnace_grate_warn' : `furnace_grate_erupt_${bit}`);
        if (st === 'ERUPT' && this.grateDmgCooldownMs <= 0 && Math.abs(px - this.grateXs[i]!) <= 28 && py >= this.floorY - 96) {
          this.grateDmgCooldownMs = 450;
          this.lighting.spawnTransientFlash(this.grateXs[i]!, this.floorY - 36, 0xff5e2b, 175, 2.2, 120);
          onHit(28, px >= this.grateXs[i]! ? 1 : -1);
        }
      }
    } else {
      this.astrolabeWheel?.setRotation(this.animMs * (this.quicksilverSeaActive ? 0.0014 : 0.00045));
      this.prismHalo?.setVisible(shieldHp > 0).setPosition(bx, by - 28).setRotation(-this.animMs * 0.002);
      if (this.blackholeSprite?.visible) this.blackholeSprite.setRotation(this.animMs * 0.005);
      this.platformCurrentY += ((this.platformsTargetElevated ? this.floorY - 114 : this.floorY - 52) - this.platformCurrentY) * Math.min(1, dtSec * 6.5);
      for (let p = 0; p < this.platformSprites.length; p++) {
        this.platformSprites[p]!.setY(this.platformCurrentY);
        const ow = this.baked.oneWayPlatforms[p];
        if (ow) (ow as { y: number }).y = Math.round(this.platformCurrentY);
      }
      if (this.quicksilverSeaActive) {
        const seaBit = (Math.floor(this.animMs / 220) & 1) as 0 | 1;
        for (const st of this.seaTileSprites) st.setFrame(`quicksilver_sea_tile_${seaBit}`);
      }
    }

    for (let i = this.flameWaves.length - 1; i >= 0; i--) {
      const fw = this.flameWaves[i]!;
      fw.x += fw.vx * dtSec; fw.remainingMs -= dtMs;
      if (Math.abs(px - fw.x) <= 20 && py >= this.floorY - 22 && this.grateDmgCooldownMs <= 0) {
        this.grateDmgCooldownMs = 400; onHit(24, fw.vx >= 0 ? 1 : -1);
      }
      if (fw.remainingMs <= 0) this.flameWaves.splice(i, 1);
    }
    for (let k = 0; k < this.flameWavePool.length; k++) {
      const fw = this.flameWaves[k];
      this.flameWavePool[k]!.setVisible(Boolean(fw));
      if (fw) this.flameWavePool[k]!.setPosition(fw.x, fw.y).setFlipX(fw.vx < 0);
    }
    this.promptLabel.setVisible(this.exitGateActive && Math.abs(px - this.exitGateX) <= 56);
  }

  public destroy(): void {
    for (const s of this.allSprites) { this.registrar.unregister(s); s.destroy(); }
    this.registrar.unregister(this.promptLabel); this.promptLabel.destroy();
  }
}
