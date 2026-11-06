import { ALL_PINS } from "./lane";

export interface Rack {
  frame: number;
  ball: number;
  standing: number[];
}

export interface FrameCell {
  marks: string[];
  total: string;
}

export interface ScoreSheet {
  frames: FrameCell[];
  total: number;
  complete: boolean;
}

export function freshRack(frame = 0): Rack {
  return { frame, ball: 0, standing: [...ALL_PINS] };
}

/** 把这一球打倒的瓶子记进计分，并决定下一球是剩瓶还是重新摆瓶。 */
export function applyKnock(rack: Rack, rolls: readonly number[], stillIds: readonly number[]): {
  rolls: number[];
  rack: Rack | null;
} {
  const still = new Set(stillIds);
  const knocked = rack.standing.filter((id) => !still.has(id)).length;
  const nextRolls = [...rolls, knocked];
  const left = rack.standing.filter((id) => still.has(id));
  const cleared = left.length === 0;

  if (rack.frame < 9) {
    if (rack.ball === 0 && !cleared) {
      return { rolls: nextRolls, rack: { frame: rack.frame, ball: 1, standing: left } };
    }
    return { rolls: nextRolls, rack: freshRack(rack.frame + 1) };
  }

  if (rack.ball >= 2) return { rolls: nextRolls, rack: null };
  if (rack.ball === 0) {
    return cleared
      ? { rolls: nextRolls, rack: { frame: 9, ball: 1, standing: [...ALL_PINS] } }
      : { rolls: nextRolls, rack: { frame: 9, ball: 1, standing: left } };
  }
  if (rack.standing.length === ALL_PINS.length || cleared) {
    return cleared
      ? { rolls: nextRolls, rack: { frame: 9, ball: 2, standing: [...ALL_PINS] } }
      : { rolls: nextRolls, rack: { frame: 9, ball: 2, standing: left } };
  }
  return { rolls: nextRolls, rack: null };
}

export function scoreSheet(rolls: readonly number[]): ScoreSheet {
  const frames: FrameCell[] = [];
  let cursor = 0;
  let running = 0;
  let blocked = false;

  for (let frame = 0; frame < 10; frame++) {
    const scored = frame === 9 ? tenth(rolls, cursor) : early(rolls, cursor);
    cursor = scored.cursor;
    let total = "";
    if (scored.points === null) blocked = true;
    else if (!blocked) {
      running += scored.points;
      total = String(running);
    }
    frames.push({ marks: scored.marks, total });
  }

  const complete = frames.every((frame) => frame.total !== "");
  return { frames, total: running, complete };
}

function early(rolls: readonly number[], index: number): { marks: string[]; points: number | null; cursor: number } {
  const first = rolls[index];
  if (first === undefined) return { marks: ["", ""], points: null, cursor: index };
  if (first === 10) {
    const bonusA = rolls[index + 1];
    const bonusB = rolls[index + 2];
    const points = bonusA === undefined || bonusB === undefined ? null : 10 + bonusA + bonusB;
    return { marks: ["", "X"], points, cursor: index + 1 };
  }
  const second = rolls[index + 1];
  if (second === undefined) return { marks: [show(first), ""], points: null, cursor: index + 1 };
  if (first + second === 10) {
    const bonus = rolls[index + 2];
    return { marks: [show(first), "/"], points: bonus === undefined ? null : 10 + bonus, cursor: index + 2 };
  }
  return { marks: [show(first), show(second)], points: first + second, cursor: index + 2 };
}

function tenth(rolls: readonly number[], index: number): { marks: string[]; points: number | null; cursor: number } {
  const first = rolls[index];
  const second = rolls[index + 1];
  const third = rolls[index + 2];
  const marks = ["", "", ""];
  if (first === undefined) return { marks, points: null, cursor: index };
  marks[0] = first === 10 ? "X" : show(first);
  if (second === undefined) return { marks, points: null, cursor: index + 1 };
  marks[1] = markSecond(first, second);
  const needsThird = first === 10 || first + second === 10;
  if (!needsThird) return { marks, points: first + second, cursor: index + 2 };
  if (third === undefined) return { marks, points: null, cursor: index + 2 };
  marks[2] = markThird(first, second, third);
  return { marks, points: first + second + third, cursor: index + 3 };
}

function markSecond(first: number, second: number): string {
  if (first === 10) return second === 10 ? "X" : show(second);
  return first + second === 10 ? "/" : show(second);
}

function markThird(first: number, second: number, third: number): string {
  if (first === 10 && second !== 10) return second + third === 10 ? "/" : show(third);
  return third === 10 ? "X" : show(third);
}

function show(pins: number): string {
  return pins === 0 ? "-" : String(pins);
}
