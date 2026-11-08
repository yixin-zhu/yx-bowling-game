/**
 * 一次出手。angle 为 0 时正对球瓶，正值偏向右侧。
 * power 取 0 到 1，中间一段才进袋：太小球到不了瓶，太大球会直穿瓶堆。
 * spin 留给以后的球道变化，二维球道暂不使用。
 */
export interface Shot {
  angle: number;
  power: number;
  spin?: number;
}

export interface Pose {
  id: number;
  kind: "ball" | "pin";
  x: number;
  y: number;
  /** 预留给三维。二维实现里始终是 0。 */
  z: number;
  /** 倒下的瓶子：被撞开的方向，球道坐标里 0 朝右。球和还站着的瓶子是 0。 */
  angle: number;
  /** 瓶子已经离开瓶位，计分算倒。画面上画成躺着。 */
  down?: boolean;
  /** 倒下的瓶子原来的瓶位，用来标出空出来的位置。 */
  homeX?: number;
  homeY?: number;
}

/**
 * 球道模拟。二维用 Matter.js，以后的三维实现同一套方法即可，
 * 计分和回合不会跟着改。
 */
export interface LaneSim {
  reset(standingPinIds: readonly number[]): void;
  throw(shot: Shot): void;
  step(ms: number): void;
  settled(): boolean;
  poses(): Pose[];
  standingPinIds(): number[];
  guttered(): boolean;
}
