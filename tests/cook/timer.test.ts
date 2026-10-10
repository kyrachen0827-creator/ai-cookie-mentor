import { describe, expect, it } from "vitest";
import { formatClock, remainingSeconds, timerEndsAt } from "@/lib/cook/timer";

describe("step timer", () => {
  it("ends the given number of minutes after it starts", () => {
    expect(timerEndsAt(3, 1_000)).toBe(1_000 + 3 * 60_000);
  });

  it("handles fractional minutes from the recipe", () => {
    expect(timerEndsAt(1.5, 0)).toBe(90_000);
  });

  it("counts down from the end time, so a throttled background tab does not drift", () => {
    const endsAt = timerEndsAt(2, 0);
    expect(remainingSeconds(endsAt, 0)).toBe(120);
    expect(remainingSeconds(endsAt, 59_001)).toBe(61);
    expect(remainingSeconds(endsAt, 119_999)).toBe(1);
  });

  it("never goes below zero once time is up", () => {
    expect(remainingSeconds(60_000, 60_000)).toBe(0);
    expect(remainingSeconds(60_000, 600_000)).toBe(0);
  });

  it.each([
    [0, "0:00"],
    [5, "0:05"],
    [65, "1:05"],
    [600, "10:00"],
    [3725, "62:05"],
  ])("formats %i seconds as %s", (seconds, text) => {
    expect(formatClock(seconds)).toBe(text);
  });
});
