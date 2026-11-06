import "./style.css";
import { drawLane } from "./draw";
import { ALL_PINS, LANE } from "./lane";
import { applyKnock, freshRack, scoreSheet, type Rack } from "./scoring";
import { Sim2D } from "./sim2d";

type Phase = "aim" | "power" | "roll" | "over";

const AIM_SWEEP = (12 * Math.PI) / 180;

const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("找不到页面容器");

app.innerHTML = `
  <header>
    <h1>保龄球高手</h1>
    <p class="lede">瞄准线会左右扫过，按下锁定方向，再等力度条走进中间的色带出球。太轻到不了瓶，太重会直穿过去。空格或点击球道都可以。</p>
  </header>
  <div id="sheet"></div>
  <p id="status" aria-live="polite"></p>
  <p id="readout" class="sr-only"></p>
  <canvas id="lane" aria-hidden="true"></canvas>
  <div class="controls">
    <div id="meter" class="meter wait">
      <span>力度</span>
      <div class="track" aria-hidden="true">
        <div class="sweet"></div>
        <div id="needle" class="needle"></div>
      </div>
    </div>
    <div class="buttons">
      <button id="throw" type="button">锁定方向</button>
      <button id="again" class="ghost" type="button">再来一局</button>
    </div>
  </div>
`;

const sheet = mustQuery<HTMLDivElement>("#sheet");
const status = mustQuery<HTMLParagraphElement>("#status");
const readout = mustQuery<HTMLParagraphElement>("#readout");
const canvas = mustQuery<HTMLCanvasElement>("#lane");
const meter = mustQuery<HTMLDivElement>("#meter");
const needle = mustQuery<HTMLDivElement>("#needle");
const throwButton = mustQuery<HTMLButtonElement>("#throw");
const againButton = mustQuery<HTMLButtonElement>("#again");

const sim = new Sim2D();
let rack: Rack | null = freshRack();
let rolls: number[] = [];
let phase: Phase = "aim";
let note = "";
let last = performance.now();
let aimClock = 0;
let aimPeriod = 1500;
let aimOffset = 0;
let powerClock = 0;
let powerPeriod = 1000;
let powerOffset = 0;
let lockedAngle = 0;
let lockedPower: number | null = null;

sim.reset(ALL_PINS);
beginAim();
renderSheet();
renderStatus();

throwButton.addEventListener("click", commit);
againButton.addEventListener("click", restart);
canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  commit();
});
window.addEventListener("keydown", (event) => {
  if (event.code !== "Space" || event.repeat) return;
  if (event.target instanceof HTMLElement && event.target.closest("button")) return;
  event.preventDefault();
  commit();
});
window.addEventListener("resize", paint);

function commit(): void {
  if (phase === "aim") {
    lockedAngle = liveAngle();
    phase = "power";
    powerClock = 0;
    powerPeriod = 820 + Math.random() * 360;
    powerOffset = Math.random();
    renderStatus();
    return;
  }
  if (phase !== "power" || !rack) return;
  phase = "roll";
  note = "";
  lockedPower = livePower();
  sim.throw({ angle: lockedAngle, power: lockedPower });
  renderStatus();
}

function restart(): void {
  rolls = [];
  rack = freshRack();
  note = "";
  lockedPower = null;
  sim.reset(ALL_PINS);
  beginAim();
  renderSheet();
  renderStatus();
  paint();
}

function beginAim(): void {
  phase = "aim";
  aimClock = 0;
  aimPeriod = 1300 + Math.random() * 620;
  aimOffset = Math.random();
}

function frameLoop(now: number): void {
  const dt = Math.min(32, now - last);
  last = now;
  if (phase === "aim") aimClock += dt;
  if (phase === "power") powerClock += dt;
  if (phase === "roll") {
    sim.step(dt);
    if (sim.settled()) finishRoll();
  }
  updateMeter();
  paint();
  requestAnimationFrame(frameLoop);
}
requestAnimationFrame(frameLoop);

function finishRoll(): void {
  if (!rack) return;
  const before = rack.standing.length;
  const still = sim.standingPinIds();
  const knocked = before - still.filter((id) => rack?.standing.includes(id)).length;
  const gutter = sim.guttered() && knocked === 0;
  const next = applyKnock(rack, rolls, still);
  rolls = next.rolls;
  rack = next.rack;
  if (!rack) phase = "over";
  else {
    sim.reset(rack.standing);
    beginAim();
  }
  note = call(knocked, before, gutter);
  renderSheet();
  renderStatus();
}

function call(knocked: number, before: number, gutter: boolean): string {
  if (gutter) return "洗沟";
  if (knocked === before && before === 10) return "全中";
  if (knocked === before && before > 0) return "补中";
  if (knocked === 0) return "一个没倒";
  return `打倒 ${knocked} 个`;
}

function renderSheet(): void {
  const scored = scoreSheet(rolls);
  sheet.innerHTML = scored.frames
    .map((frame, index) => {
      const boxes = frame.marks.map((mark) => `<span>${mark}</span>`).join("");
      return `<div class="frame${index === 9 ? " tenth" : ""}"><b>${index + 1}</b><div class="marks">${boxes}</div><div class="running">${frame.total}</div></div>`;
    })
    .join("");
}

function renderStatus(): void {
  const scored = scoreSheet(rolls);
  if (phase === "over" || !rack) {
    status.textContent = `一局结束，总分 ${scored.total}`;
  } else {
    const ball = rack.ball + 1;
    const extra = note ? ` · ${note}` : "";
    const hint = phase === "aim" ? " · 锁定方向" : phase === "power" ? " · 等力度走进中间" : "";
    status.textContent = `第 ${rack.frame + 1} 格 · 第 ${ball} 球 · 还剩 ${rack.standing.length} 瓶${extra}${hint}`;
  }
  syncControls();
}

function syncControls(): void {
  const ready = phase === "aim" || phase === "power";
  throwButton.disabled = !ready;
  throwButton.textContent = phase === "power" ? "出球" : phase === "roll" ? "球还在滚" : "锁定方向";
  meter.classList.toggle("wait", lockedPower === null && phase !== "power");
}

function updateMeter(): void {
  const power = phase === "power" ? livePower() : (lockedPower ?? 0);
  needle.style.left = `${power * 100}%`;
  if (phase === "aim") {
    const angle = liveAngle();
    readout.textContent = Math.abs(angle) < 0.03 ? "方向接近正中" : angle < 0 ? "方向偏左" : "方向偏右";
  } else {
    readout.textContent = powerWord(power);
  }
}

function powerWord(power: number): string {
  if (power > 0.4 && power < 0.6) return "力度合适";
  return power <= 0.4 ? "力度偏轻" : "力度偏重";
}

function paint(): void {
  const liningUp = phase === "aim" || phase === "power";
  const poses = sim.poses();
  if (liningUp) poses.push({ id: 0, kind: "ball", x: 0, y: LANE.startY, z: 0, angle: 0 });
  const angle = phase === "power" ? lockedAngle : liveAngle();
  drawLane(canvas, poses, liningUp ? { angle } : null);
}

function liveAngle(): number {
  return swing(aimClock / aimPeriod + aimOffset) * AIM_SWEEP;
}

function livePower(): number {
  const t = wrap(powerClock / powerPeriod + powerOffset);
  return t < 0.5 ? t * 2 : 2 - t * 2;
}

function swing(turns: number): number {
  const t = wrap(turns);
  return t < 0.5 ? t * 4 - 1 : 3 - t * 4;
}

function wrap(turns: number): number {
  return ((turns % 1) + 1) % 1;
}

function mustQuery<T extends Element>(selector: string): T {
  const node = app!.querySelector<T>(selector);
  if (!node) throw new Error(`找不到 ${selector}`);
  return node;
}
