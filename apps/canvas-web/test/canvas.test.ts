import { describe, it, expect, afterEach } from "vitest";

import {
  PALETTE,
  compactAddress,
  getPackedPixel,
  fitCamera,
  readRoomIdFromHash,
} from "../src/lib/canvas";
import type { CanvasState } from "@gearbase/sdk";

describe("getPackedPixel", () => {
  // byte 0xA5: low nibble = 5 (index 0), high nibble = 0xA (index 1)
  const pixels = Uint8Array.from([0xa5, 0x0f]);

  it("reads the low nibble at an even index", () => {
    expect(getPackedPixel(pixels, 2, 0, 0)).toBe(0x5);
  });

  it("reads the high nibble at an odd index", () => {
    expect(getPackedPixel(pixels, 2, 1, 0)).toBe(0xa);
  });

  it("uses width to compute the row offset", () => {
    // index = y*width + x = 1*2 + 0 = 2 -> byte 1, low nibble = 0xF
    expect(getPackedPixel(pixels, 2, 0, 1)).toBe(0xf);
    // index 3 -> byte 1, high nibble = 0x0
    expect(getPackedPixel(pixels, 2, 1, 1)).toBe(0x0);
  });

  it("returns 0 for out-of-range bytes", () => {
    expect(getPackedPixel(pixels, 2, 5, 5)).toBe(0);
  });
});

describe("PALETTE", () => {
  it("has 16 entries, all 6-digit hex colors", () => {
    expect(PALETTE).toHaveLength(16);
    for (const color of PALETTE) {
      expect(color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});

describe("compactAddress", () => {
  it("keeps the 0x-prefix head and 4-char tail", () => {
    expect(compactAddress("0x1234567890abcdef")).toBe("0x1234...cdef");
  });
});

describe("fitCamera", () => {
  it("centers the canvas and floors the integer zoom", () => {
    const state: CanvasState = {
      config: { width: 10, height: 10, paletteSize: 16, cooldownSecs: 0 },
      pixels: new Uint8Array(50),
    };
    // (500-32)/10 = 46.8 -> floor 46 for both axes
    const camera = fitCamera(state, { width: 500, height: 500 });
    expect(camera.zoom).toBe(46);
    // centered: (500 - 10*46)/2 = 20
    expect(camera.offsetX).toBe(20);
    expect(camera.offsetY).toBe(20);
  });

  it("clamps zoom to a minimum of 2", () => {
    const state: CanvasState = {
      config: { width: 1000, height: 1000, paletteSize: 16, cooldownSecs: 0 },
      pixels: new Uint8Array(500_000),
    };
    const camera = fitCamera(state, { width: 100, height: 100 });
    expect(camera.zoom).toBe(2);
  });

  it("picks the limiting (smaller) dimension for zoom", () => {
    const state: CanvasState = {
      config: { width: 10, height: 100, paletteSize: 16, cooldownSecs: 0 },
      pixels: new Uint8Array(500),
    };
    // width axis: (500-32)/10 = 46.8; height axis: (500-32)/100 = 4.68 -> min -> floor 4
    const camera = fitCamera(state, { width: 500, height: 500 });
    expect(camera.zoom).toBe(4);
  });
});

describe("readRoomIdFromHash", () => {
  const originalWindow = (globalThis as { window?: unknown }).window;

  afterEach(() => {
    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
  });

  function setHash(hash: string): void {
    (globalThis as { window?: unknown }).window = { location: { hash } };
  }

  it("parses a room id from a #/ hash route", () => {
    setHash("#/room-abc");
    expect(readRoomIdFromHash("fallback")).toBe("room-abc");
  });

  it("falls back to the default when the hash is empty", () => {
    setHash("");
    expect(readRoomIdFromHash("fallback")).toBe("fallback");
  });

  it("falls back to the default for a non-#/ hash", () => {
    setHash("#other");
    expect(readRoomIdFromHash("fallback")).toBe("fallback");
  });
});
