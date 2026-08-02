import { describe, expect, it } from "vitest";

import {
  isBlockedByObstacle,
  isClimbableStep,
  isWalkableStepDown,
} from "./stepRules";

// The grey-box staircase brackets this deliberately: risers of 0.3, 0.5, and
// 0.6 must climb, and 0.7 must not.
const MAX_STEP_HEIGHT = 0.65;
const DROP_TOLERANCE = 0.1;
const MAX_STEP_DOWN = 0.65;
const BLOCKED_RATIO = 0.95;

describe("isBlockedByObstacle", () => {
  it("reports an unobstructed move as unblocked", () => {
    expect(isBlockedByObstacle(1, 1, BLOCKED_RATIO)).toBe(false);
  });

  it("tolerates a slide that barely shortens the move", () => {
    expect(isBlockedByObstacle(1, 0.97, BLOCKED_RATIO)).toBe(false);
  });

  it("reports a substantially shortened move as blocked", () => {
    expect(isBlockedByObstacle(1, 0.4, BLOCKED_RATIO)).toBe(true);
  });

  it("treats a fully stopped move as blocked", () => {
    expect(isBlockedByObstacle(1, 0, BLOCKED_RATIO)).toBe(true);
  });

  it("reports no obstruction when the character was not moving", () => {
    expect(isBlockedByObstacle(0, 0, BLOCKED_RATIO)).toBe(false);
  });
});

describe("isClimbableStep", () => {
  it("rejects a step onto nothing", () => {
    expect(isClimbableStep(null, 0, MAX_STEP_HEIGHT, DROP_TOLERANCE)).toBe(false);
  });

  it("climbs a rise below the ceiling", () => {
    expect(isClimbableStep(0.6, 0, MAX_STEP_HEIGHT, DROP_TOLERANCE)).toBe(true);
  });

  it("climbs a rise exactly at the ceiling", () => {
    expect(isClimbableStep(0.65, 0, MAX_STEP_HEIGHT, DROP_TOLERANCE)).toBe(true);
  });

  it("refuses a rise above the ceiling", () => {
    // 0.7 is the grey-box staircase's deliberately unclimbable riser.
    expect(isClimbableStep(0.7, 0, MAX_STEP_HEIGHT, DROP_TOLERANCE)).toBe(false);
  });

  it("accepts level ground", () => {
    expect(isClimbableStep(0, 0, MAX_STEP_HEIGHT, DROP_TOLERANCE)).toBe(true);
  });

  it("tolerates a surface fractionally below the starting height", () => {
    expect(isClimbableStep(-0.05, 0, MAX_STEP_HEIGHT, DROP_TOLERANCE)).toBe(true);
  });

  it("refuses to snap the character down a drop", () => {
    // Without this the step-up test would happily pull the character off a
    // ledge it was standing beside.
    expect(isClimbableStep(-3, 0, MAX_STEP_HEIGHT, DROP_TOLERANCE)).toBe(false);
  });

  it("measures the rise from the given base rather than from zero", () => {
    expect(isClimbableStep(10.6, 10, MAX_STEP_HEIGHT, DROP_TOLERANCE)).toBe(true);
    expect(isClimbableStep(10.7, 10, MAX_STEP_HEIGHT, DROP_TOLERANCE)).toBe(false);
  });
});

describe("isWalkableStepDown", () => {
  it("rejects a step down onto nothing", () => {
    expect(isWalkableStepDown(1, null, MAX_STEP_DOWN)).toBe(false);
  });

  it("follows a drop within reach", () => {
    expect(isWalkableStepDown(1, 0.5, MAX_STEP_DOWN)).toBe(true);
  });

  it("follows a drop exactly at the limit", () => {
    expect(isWalkableStepDown(1, 0.35, MAX_STEP_DOWN)).toBe(true);
  });

  it("falls rather than following a drop beyond the limit", () => {
    expect(isWalkableStepDown(1, 0.1, MAX_STEP_DOWN)).toBe(false);
  });

  it("does not step down onto a surface at the current height", () => {
    expect(isWalkableStepDown(1, 1, MAX_STEP_DOWN)).toBe(false);
  });

  it("does not step down onto a surface above the character", () => {
    expect(isWalkableStepDown(1, 1.5, MAX_STEP_DOWN)).toBe(false);
  });
});
