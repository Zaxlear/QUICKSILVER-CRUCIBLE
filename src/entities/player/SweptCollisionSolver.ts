import { PLAYER_KINEMATICS } from '../../data/playerKinematics.data';

export interface SolidRectPx {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export interface OneWayPlatformPx {
  readonly x: number;
  readonly y: number;
  readonly w: number;
}

export interface ClimbableWallPx {
  readonly x: number;
  readonly topY: number;
  readonly bottomY: number;
  /** 墙体法线朝向：1 代表左墙面朝右，-1 代表右墙面朝左 */
  readonly normalX: -1 | 1;
}

export interface CollisionWorld {
  readonly solidRects: readonly SolidRectPx[];
  readonly oneWayPlatforms: readonly OneWayPlatformPx[];
  readonly climbableWalls: readonly ClimbableWallPx[];
}

export interface SweptBodyMutable {
  x: number;
  y: number;
  vx: number;
  vy: number;
  colliderWidth: number;
  colliderHeight: number;
  oneWayIgnoreTicks: number;
}

/**
 * 轴分离扫掠子步进碰撞求解器（单步 > 6px 自动细分防高速穿墙）。
 */
export function canStandingBodyFit(
  body: Pick<SweptBodyMutable, 'x' | 'y' | 'colliderWidth'>,
  world: CollisionWorld
): boolean {
  const halfW = body.colliderWidth * 0.5;
  const top = body.y - PLAYER_KINEMATICS.STANDING_HEIGHT_PX;
  for (let i = 0; i < world.solidRects.length; i++) {
    const r = world.solidRects[i]!;
    if (body.x + halfW > r.x && body.x - halfW < r.x + r.w && body.y > r.y && top < r.y + r.h) {
      return false;
    }
  }
  return true;
}

export function probeGroundSupport(
  body: SweptBodyMutable,
  world: CollisionWorld,
  epsPx: number
): 'none' | 'solid' | 'oneway' {
  const halfW = body.colliderWidth * 0.5;
  const probeY = body.y + epsPx;
  for (let i = 0; i < world.solidRects.length; i++) {
    const r = world.solidRects[i]!;
    if (body.x + halfW > r.x + 0.2 && body.x - halfW < r.x + r.w - 0.2) {
      if (body.y <= r.y + 0.5 && probeY >= r.y) return 'solid';
    }
  }
  if (body.oneWayIgnoreTicks === 0) {
    for (let i = 0; i < world.oneWayPlatforms.length; i++) {
      const p = world.oneWayPlatforms[i]!;
      if (body.x + halfW > p.x + 0.5 && body.x - halfW < p.x + p.w - 0.5) {
        if (body.y <= p.y + 0.5 && probeY >= p.y) return 'oneway';
      }
    }
  }
  return 'none';
}

export function solveHorizontalSubstep(
  body: SweptBodyMutable,
  world: CollisionWorld,
  dx: number,
  clampLedge: boolean
): void {
  if (dx === 0) return;
  const prevX = body.x;
  body.x += dx;
  const halfW = body.colliderWidth * 0.5;
  const top = body.y - body.colliderHeight;

  for (let i = 0; i < world.solidRects.length; i++) {
    const r = world.solidRects[i]!;
    if (body.y <= r.y + 0.01 || top >= r.y + r.h - 0.01) continue;
    if (body.x + halfW > r.x && body.x - halfW < r.x + r.w) {
      body.x = dx > 0 ? r.x - halfW : r.x + r.w + halfW;
      body.vx = 0;
    }
  }

  if (clampLedge && probeGroundSupport(body, world, 1.5) === 'none') {
    body.x = prevX;
    body.vx = 0;
  }
}

export function solveVerticalSubstep(
  body: SweptBodyMutable,
  world: CollisionWorld,
  dy: number
): 'none' | 'solid' | 'oneway' {
  const prevBottom = body.y;
  body.y += dy;
  const halfW = body.colliderWidth * 0.5;
  const top = body.y - body.colliderHeight;
  let support: 'none' | 'solid' | 'oneway' = 'none';

  for (let i = 0; i < world.solidRects.length; i++) {
    const r = world.solidRects[i]!;
    if (body.x + halfW <= r.x + 0.01 || body.x - halfW >= r.x + r.w - 0.01) continue;
    if (body.y > r.y && top < r.y + r.h) {
      if (dy >= 0) {
        body.y = r.y;
        body.vy = 0;
        support = 'solid';
      } else {
        body.y = r.y + r.h + body.colliderHeight;
        body.vy = 0;
      }
    }
  }

  if (dy >= 0 && body.oneWayIgnoreTicks === 0 && support === 'none') {
    for (let i = 0; i < world.oneWayPlatforms.length; i++) {
      const p = world.oneWayPlatforms[i]!;
      if (body.x + halfW <= p.x + 0.5 || body.x - halfW >= p.x + p.w - 0.5) continue;
      if (prevBottom <= p.y + 1.0 && body.y >= p.y) {
        body.y = p.y;
        body.vy = 0;
        support = 'oneway';
        break;
      }
    }
  }
  return support;
}

export function detectTouchingClimbWall(
  body: Pick<SweptBodyMutable, 'x' | 'y' | 'colliderWidth' | 'colliderHeight'>,
  world: CollisionWorld,
  isGrounded: boolean,
  wallJumpLockTicks: number,
  lockedWallSide: -1 | 0 | 1
): -1 | 0 | 1 {
  if (isGrounded) return 0;
  const halfW = body.colliderWidth * 0.5;
  const bodyTop = body.y - body.colliderHeight + 4;
  const bodyBot = body.y - 4;

  for (let i = 0; i < world.climbableWalls.length; i++) {
    const w = world.climbableWalls[i]!;
    if (bodyBot <= w.topY || bodyTop >= w.bottomY) continue;
    const side: -1 | 1 = w.normalX === -1 ? 1 : -1;
    if (wallJumpLockTicks > 0 && lockedWallSide === side) continue;
    const edgeX = side === 1 ? body.x + halfW : body.x - halfW;
    if (Math.abs(edgeX - w.x) <= 1.5) return side;
  }
  return 0;
}
