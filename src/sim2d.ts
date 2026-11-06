import Matter from "matter-js";
import { LANE, pinSpots, type PinSpot } from "./lane";
import type { LaneSim, Pose, Shot } from "./sim";

const PIN = 0x0002;
const BALL = 0x0004;
const WALL = 0x0008;
const GUTTER = 0x0010;

/** 物理步长。Matter 的速度是「每步位移」，出手时要按这个步长换算。 */
const TICK_MS = 8;
/** 超过这个撞击速度，球会把瓶子拨开后直穿，不再把瓶子带进袋。单位是每步位移。 */
const PLOW_SPEED = 5.6;

export interface Sim2DOptions {
  /** 默认用 Math.random。测试可以传入固定种子。 */
  random?: () => number;
  /** 为 false 时瓶位、瓶重和出手都不再晃动，方便对照物理。 */
  variance?: boolean;
}

export class Sim2D implements LaneSim {
  private readonly engine = Matter.Engine.create({ gravity: { x: 0, y: 0 }, enableSleeping: false });
  private readonly spots = new Map<number, PinSpot>(pinSpots().map((spot) => [spot.id, spot]));
  private readonly random: () => number;
  private readonly variance: boolean;
  private pins = new Map<number, Matter.Body>();
  private ball: Matter.Body | null = null;
  private elapsed = 0;
  private quiet = 0;
  private inGutter = false;
  private thrown = false;

  constructor(options: Sim2DOptions = {}) {
    this.random = options.random ?? Math.random;
    this.variance = options.variance !== false;
    this.engine.positionIterations = 10;
    this.engine.velocityIterations = 8;
    Matter.Events.on(this.engine, "collisionStart", (event) => this.softenHardHits(event));
    this.reset([]);
  }

  reset(standingPinIds: readonly number[]): void {
    Matter.World.clear(this.engine.world, false);
    this.pins.clear();
    this.ball = null;
    this.elapsed = 0;
    this.quiet = 0;
    this.inGutter = false;
    this.thrown = false;
    this.addBounds();
    for (const id of standingPinIds) {
      const spot = this.spots.get(id);
      if (!spot) continue;
      const pin = Matter.Bodies.circle(spot.x + this.jitter(1.6), spot.y + this.jitter(1.6), LANE.pinRadius, {
        density: 0.0032 * (this.variance ? 0.88 + this.random() * 0.24 : 1),
        restitution: 0.35,
        friction: 0.03,
        frictionAir: 0.022,
        collisionFilter: { category: PIN, mask: PIN | BALL | WALL },
        label: `pin-${id}`,
      });
      this.pins.set(id, pin);
    }
    Matter.World.add(this.engine.world, [...this.pins.values()]);
  }

  throw(shot: Shot): void {
    if (this.ball) Matter.World.remove(this.engine.world, this.ball);
    let power = clamp01(shot.power);
    let angle = shot.angle;
    if (this.variance) {
      angle += gaussian(this.random) * 0.007;
      power = clamp01(power + gaussian(this.random) * 0.02);
    }
    const speed = 500 + power * 1220 + Math.max(0, power - 0.58) ** 2 * 7800;
    angle = Math.max(-0.4, Math.min(0.4, angle));
    const step = speed * (TICK_MS / 1000);
    const ball = Matter.Bodies.circle(0, LANE.startY, LANE.ballRadius, {
      density: 0.016,
      restitution: 0.22,
      friction: 0.02,
      frictionAir: 0.0085,
      collisionFilter: { category: BALL, mask: PIN | WALL | GUTTER },
      label: "ball",
    });
    Matter.Body.setVelocity(ball, { x: Math.sin(angle) * step, y: Math.cos(angle) * step });
    this.ball = ball;
    this.thrown = true;
    this.inGutter = false;
    this.elapsed = 0;
    this.quiet = 0;
    Matter.World.add(this.engine.world, ball);
  }

  step(ms: number): void {
    let left = ms;
    while (left > 0) {
      const dt = Math.min(TICK_MS, left);
      Matter.Engine.update(this.engine, dt);
      this.releaseFallen();
      this.watchBall();
      left -= dt;
    }
    this.elapsed += ms;
    if (this.pinsCalm() && this.ballDone()) this.quiet += 1;
    else this.quiet = 0;
  }

  settled(): boolean {
    return this.thrown && (this.quiet >= 18 || this.elapsed > 8000);
  }

  poses(): Pose[] {
    const poses: Pose[] = [];
    if (this.ball) {
      poses.push({
        id: 0,
        kind: "ball",
        x: this.ball.position.x,
        y: this.ball.position.y,
        z: 0,
        angle: this.ball.angle,
      });
    }
    for (const [id, pin] of this.pins) {
      poses.push({ id, kind: "pin", x: pin.position.x, y: pin.position.y, z: 0, angle: pin.angle });
    }
    return poses;
  }

  standingPinIds(): number[] {
    const limit = LANE.pinRadius * 1.35;
    const standing: number[] = [];
    for (const [id, pin] of this.pins) {
      const spot = this.spots.get(id);
      if (!spot) continue;
      const dx = pin.position.x - spot.x;
      const dy = pin.position.y - spot.y;
      if (Math.hypot(dx, dy) <= limit) standing.push(id);
    }
    return standing.sort((a, b) => a - b);
  }

  guttered(): boolean {
    return this.inGutter;
  }

  /** 太重的球几乎不拐，只把碰到的瓶子轻轻拨开，边瓶常常留着。 */
  private softenHardHits(event: Matter.IEventCollision<Matter.Engine>): void {
    const ball = this.ball;
    if (!ball || ball.speed < PLOW_SPEED) return;
    const kick = 0.85;
    for (const pair of event.pairs) {
      const pin = pair.bodyA === ball ? pair.bodyB : pair.bodyB === ball ? pair.bodyA : null;
      if (!pin?.label.startsWith("pin")) continue;
      if (((pin.collisionFilter.mask ?? 0) & BALL) === 0) continue;
      const nx = pin.position.x - ball.position.x;
      const ny = pin.position.y - ball.position.y;
      const mag = Math.hypot(nx, ny) || 1;
      Matter.Body.setVelocity(pin, { x: (nx / mag) * kick, y: (ny / mag) * kick });
      Matter.Body.setPosition(pin, { x: pin.position.x + (nx / mag) * 1.5, y: pin.position.y + (ny / mag) * 1.5 });
      pin.collisionFilter.mask = PIN | WALL;
      pair.isActive = false;
    }
  }

  /** 瓶子离开瓶位后不再挡住球，俯视图里相当于已经倒下。瓶子之间仍会互相撞开。 */
  private releaseFallen(): void {
    for (const [id, pin] of this.pins) {
      if (((pin.collisionFilter.mask ?? 0) & BALL) === 0) continue;
      const spot = this.spots.get(id);
      if (!spot) continue;
      const moved = Math.hypot(pin.position.x - spot.x, pin.position.y - spot.y);
      if (moved > LANE.pinRadius * 1.15 || pin.speed > 3.2) pin.collisionFilter.mask = PIN | WALL;
    }
  }

  private pinsCalm(): boolean {
    for (const pin of this.pins.values()) {
      if (pin.speed > 0.4) return false;
    }
    return true;
  }

  private ballDone(): boolean {
    if (!this.ball) return true;
    if (this.ball.position.y > LANE.length - 24) return true;
    return this.ball.speed < 0.35;
  }

  private watchBall(): void {
    const ball = this.ball;
    if (!ball) return;
    const { x, y } = ball.position;
    if (!this.inGutter && Math.abs(x) > LANE.halfWidth && y < LANE.headY + LANE.pinRadius) {
      this.inGutter = true;
      ball.collisionFilter.mask = WALL;
    }
    if (y > LANE.length - 36 || Math.abs(x) > LANE.halfWidth + LANE.gutter + 30) {
      Matter.World.remove(this.engine.world, ball);
      this.ball = null;
    }
  }

  private jitter(radius: number): number {
    if (!this.variance) return 0;
    return (this.random() - 0.5) * radius * 2;
  }

  private addBounds(): void {
    const outer = LANE.halfWidth + LANE.gutter;
    const thick = 24;
    const walls = [
      Matter.Bodies.rectangle(-outer - thick / 2, LANE.length / 2, thick, LANE.length + 80, staticWall()),
      Matter.Bodies.rectangle(outer + thick / 2, LANE.length / 2, thick, LANE.length + 80, staticWall()),
      Matter.Bodies.rectangle(0, LANE.length + thick / 2, outer * 2 + thick * 2, thick, staticWall()),
      Matter.Bodies.rectangle(-LANE.halfWidth - LANE.gutter / 2, LANE.length / 2, LANE.gutter, LANE.length, {
        isStatic: true,
        isSensor: true,
        collisionFilter: { category: GUTTER, mask: BALL },
        label: "gutter",
      }),
      Matter.Bodies.rectangle(LANE.halfWidth + LANE.gutter / 2, LANE.length / 2, LANE.gutter, LANE.length, {
        isStatic: true,
        isSensor: true,
        collisionFilter: { category: GUTTER, mask: BALL },
        label: "gutter",
      }),
    ];
    Matter.World.add(this.engine.world, walls);
  }
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function gaussian(random: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = random();
  while (v === 0) v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(Math.PI * 2 * v);
}

function staticWall(): Matter.IChamferableBodyDefinition {
  return {
    isStatic: true,
    restitution: 0.2,
    collisionFilter: { category: WALL, mask: BALL | PIN },
  };
}
