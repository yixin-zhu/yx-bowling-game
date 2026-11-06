import { describe, expect, it } from "vitest";
import { ALL_PINS } from "./lane";
import { applyKnock, freshRack, scoreSheet } from "./scoring";

const all = () => [...ALL_PINS];
const none: number[] = [];

describe("标准保龄球计分", () => {
  it("十二个全中是 300 分", () => {
    const sheet = scoreSheet(Array(12).fill(10));
    expect(sheet.complete).toBe(true);
    expect(sheet.total).toBe(300);
    expect(sheet.frames[0]).toEqual({ marks: ["", "X"], total: "30" });
    expect(sheet.frames[9]?.marks).toEqual(["X", "X", "X"]);
  });

  it("每格 9 瓶加洗沟是 90 分", () => {
    const rolls = Array.from({ length: 10 }, () => [9, 0]).flat();
    const sheet = scoreSheet(rolls);
    expect(sheet.total).toBe(90);
    expect(sheet.complete).toBe(true);
    expect(sheet.frames[0]?.marks).toEqual(["9", "-"]);
  });

  it("每格补中且补中后都是 5 瓶，一共 150 分", () => {
    const sheet = scoreSheet(Array(21).fill(5));
    expect(sheet.total).toBe(150);
    expect(sheet.frames[0]?.marks).toEqual(["5", "/"]);
    expect(sheet.frames[9]?.marks).toEqual(["5", "/", "5"]);
  });

  it("全中后面的 3 和 4 会回算到前一格", () => {
    const sheet = scoreSheet([10, 3, 4, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(sheet.frames[0]).toEqual({ marks: ["", "X"], total: "17" });
    expect(sheet.frames[1]).toEqual({ marks: ["3", "4"], total: "24" });
  });

  it("还没打完的全中先不写分", () => {
    const sheet = scoreSheet([10]);
    expect(sheet.complete).toBe(false);
    expect(sheet.frames[0]).toEqual({ marks: ["", "X"], total: "" });
    expect(sheet.total).toBe(0);
  });

  it("第十格全中后重新摆瓶，没补中就结束", () => {
    let rack = freshRack(9);
    let rolls: number[] = [];
    ({ rack, rolls } = must(applyKnock(mustRack(rack), rolls, none)));
    expect(rack?.standing).toEqual(all());
    ({ rack, rolls } = must(applyKnock(mustRack(rack), rolls, [1, 2, 3])));
    expect(rack?.ball).toBe(2);
    expect(rack?.standing).toEqual([1, 2, 3]);
    const done = applyKnock(mustRack(rack), rolls, [1]);
    expect(done.rack).toBeNull();
    expect(done.rolls).toEqual([10, 7, 2]);
  });

  it("前面都是洗沟时，第十格全中加 7 和 2 记 19 分", () => {
    const rolls = [...Array(18).fill(0), 10, 7, 2];
    expect(scoreSheet(rolls).frames[9]).toEqual({ marks: ["X", "7", "2"], total: "19" });
    expect(scoreSheet(rolls).total).toBe(19);
  });

  it("普通格打倒 7 瓶后，下一球只留剩下的瓶子", () => {
    const next = applyKnock(freshRack(0), [], [4, 5, 6]);
    expect(next.rolls).toEqual([7]);
    expect(next.rack).toEqual({ frame: 0, ball: 1, standing: [4, 5, 6] });
  });
});

function must<T>(value: { rack: T | null; rolls: number[] }): { rack: T; rolls: number[] } {
  if (value.rack === null) throw new Error("这一球不该结束");
  return { rack: value.rack, rolls: value.rolls };
}

function mustRack<T>(rack: T | null): T {
  if (rack === null) throw new Error("没有下一球");
  return rack;
}
