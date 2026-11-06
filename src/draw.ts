import { LANE } from "./lane";
import type { Pose } from "./sim";

const WOOD = ["#c9894b", "#d7a15f", "#c07d42", "#e0b56d"];

export function drawLane(
  canvas: HTMLCanvasElement,
  poses: readonly Pose[],
  aim: { angle: number } | null,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

  const span = (LANE.halfWidth + LANE.gutter) * 2;
  const scale = Math.min((width - 16) / span, (height - 16) / LANE.length);
  const originX = width / 2;
  const toX = (x: number) => originX + x * scale;
  const toY = (y: number) => height - 8 - LANE.ballRadius * scale - (y - LANE.startY) * scale;

  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#14202e";
  ctx.fillRect(0, 0, width, height);

  const left = toX(-(LANE.halfWidth + LANE.gutter));
  const right = toX(LANE.halfWidth + LANE.gutter);
  const top = toY(LANE.length);
  const bottom = toY(0);
  ctx.fillStyle = "#3d4c5c";
  ctx.fillRect(left, top, right - left, bottom - top);

  const laneLeft = toX(-LANE.halfWidth);
  const laneRight = toX(LANE.halfWidth);
  const plank = (laneRight - laneLeft) / WOOD.length;
  WOOD.forEach((color, index) => {
    ctx.fillStyle = color;
    ctx.fillRect(laneLeft + plank * index, top, plank + 0.5, bottom - top);
  });

  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(laneLeft, toY(LANE.startY + 46));
  ctx.lineTo(laneRight, toY(LANE.startY + 46));
  ctx.stroke();

  ctx.fillStyle = "rgba(20,32,46,0.35)";
  for (let mark = 1; mark <= 6; mark++) {
    const y = toY(LANE.startY + 70 + mark * 78);
    ctx.fillRect(toX(-8), y, 5, 14);
    ctx.fillRect(toX(3), y, 5, 14);
  }

  if (aim) {
    const reach = LANE.headY - LANE.startY;
    const endX = toX(Math.sin(aim.angle) * reach);
    const endY = toY(LANE.startY + Math.cos(aim.angle) * reach);
    ctx.strokeStyle = "rgba(255, 214, 102, 0.9)";
    ctx.setLineDash([7, 7]);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(toX(0), toY(LANE.startY));
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(255, 214, 102, 0.95)";
    ctx.beginPath();
    ctx.arc(endX, endY, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const pose of poses) {
    if (pose.kind === "pin") drawPin(ctx, toX(pose.x), toY(pose.y), LANE.pinRadius * scale);
  }
  for (const pose of poses) {
    if (pose.kind === "ball") drawBall(ctx, toX(pose.x), toY(pose.y), LANE.ballRadius * scale);
  }
}

function drawPin(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  ctx.beginPath();
  ctx.fillStyle = "#f4efe4";
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#b23b3b";
  ctx.lineWidth = Math.max(2, radius * 0.28);
  ctx.beginPath();
  ctx.arc(x, y, radius * 0.62, 0.2, Math.PI - 0.2);
  ctx.stroke();
}

function drawBall(ctx: CanvasRenderingContext2D, x: number, y: number, radius: number): void {
  const shine = ctx.createRadialGradient(x - radius * 0.3, y - radius * 0.35, radius * 0.2, x, y, radius);
  shine.addColorStop(0, "#6d7784");
  shine.addColorStop(1, "#1c2128");
  ctx.beginPath();
  ctx.fillStyle = shine;
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}
