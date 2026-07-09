import { describe, it, expect } from "vitest";

import {
  applyCanvasEvent,
  normalizeParticipantKind,
  participantKindCode,
  decodeFthPhase,
  type CanvasState,
  type ParticipantKind,
} from "../src/index";

function blankCanvas(width: number, height: number): CanvasState {
  return {
    config: { width, height, paletteSize: 16, cooldownSecs: 0 },
    pixels: new Uint8Array(Math.ceil((width * height) / 2)),
  };
}

describe("applyCanvasEvent 4-bit pixel packing", () => {
  it("writes the low nibble for an even index", () => {
    const state = blankCanvas(2, 2);
    const next = applyCanvasEvent(state, {
      type: "PixelPlaced",
      x: 0,
      y: 0,
      color: 5,
      who: "0x0000000000000000000000000000000000000000",
    });
    // index 0 -> byte 0, low nibble
    expect(next.pixels[0]).toBe(0x05);
  });

  it("writes the high nibble for an odd index without clobbering the low nibble", () => {
    let state = blankCanvas(2, 2);
    // (0,0) index 0 -> low nibble = 5
    state = applyCanvasEvent(state, {
      type: "PixelPlaced",
      x: 0,
      y: 0,
      color: 5,
      who: "0x0000000000000000000000000000000000000000",
    });
    // (1,0) index 1 -> high nibble = 0xA
    state = applyCanvasEvent(state, {
      type: "PixelPlaced",
      x: 1,
      y: 0,
      color: 0xa,
      who: "0x0000000000000000000000000000000000000000",
    });
    expect(state.pixels[0]).toBe(0xa5);
  });

  it("does not mutate the input state (immutability)", () => {
    const state = blankCanvas(2, 2);
    const original = Uint8Array.from(state.pixels);
    const next = applyCanvasEvent(state, {
      type: "PixelPlaced",
      x: 1,
      y: 1,
      color: 0xf,
      who: "0x0000000000000000000000000000000000000000",
    });
    expect(next).not.toBe(state);
    expect(Array.from(state.pixels)).toEqual(Array.from(original));
  });

  it("returns the same state reference for non-pixel events", () => {
    const state = blankCanvas(2, 2);
    const next = applyCanvasEvent(state, { type: "Closed" });
    expect(next).toBe(state);
  });
});

describe("participant kind encoding", () => {
  it("maps codes to kinds", () => {
    expect(normalizeParticipantKind(0)).toBe("unknown");
    expect(normalizeParticipantKind(1)).toBe("human");
    expect(normalizeParticipantKind(2)).toBe("agent");
    expect(normalizeParticipantKind(99)).toBe("unknown");
  });

  it("maps kinds back to codes", () => {
    expect(participantKindCode("human")).toBe(1);
    expect(participantKindCode("agent")).toBe(2);
    expect(participantKindCode("unknown")).toBe(0);
    expect(participantKindCode(undefined)).toBe(0);
  });

  it("round-trips through code -> kind -> code for known kinds", () => {
    for (const kind of ["human", "agent", "unknown"] as ParticipantKind[]) {
      expect(normalizeParticipantKind(participantKindCode(kind))).toBe(kind);
    }
  });
});

describe("decodeFthPhase", () => {
  it("maps phase codes", () => {
    expect(decodeFthPhase(0)).toBe("lobby");
    expect(decodeFthPhase(1)).toBe("answering");
    expect(decodeFthPhase(2)).toBe("voting");
    expect(decodeFthPhase(3)).toBe("ended");
    expect(decodeFthPhase(4)).toBe("aborted");
  });

  it("falls back to lobby for unknown codes", () => {
    expect(decodeFthPhase(42)).toBe("lobby");
  });
});
