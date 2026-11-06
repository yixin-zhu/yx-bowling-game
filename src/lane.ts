/** 球道尺寸。二维和将来的三维用同一套比例，单位是像素级的球道坐标。 */
export const LANE = {
  halfWidth: 108,
  gutter: 42,
  length: 900,
  pinSpacing: 32,
  pinRadius: 11,
  ballRadius: 15,
  /** 头瓶（离选手最近的那只）的纵坐标。 */
  headY: 690,
  startY: 78,
} as const;

export interface PinSpot {
  id: number;
  x: number;
  y: number;
}

/** 标准三角瓶位。1 号是头瓶，10 号在最后一排最右侧。 */
export function pinSpots(): PinSpot[] {
  const spacing = LANE.pinSpacing;
  const rows = [[1], [2, 3], [4, 5, 6], [7, 8, 9, 10]];
  const spots: PinSpot[] = [];
  rows.forEach((ids, row) => {
    ids.forEach((id, index) => {
      spots.push({
        id,
        x: (index - (ids.length - 1) / 2) * spacing,
        y: LANE.headY + row * spacing * Math.sin(Math.PI / 3),
      });
    });
  });
  return spots;
}

export const ALL_PINS = pinSpots().map((spot) => spot.id);
