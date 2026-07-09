import { describe, it, expect } from "vitest";

import {
  decodeCanvasConfigBlob,
  encodeCanvasConfigBlob,
  decodeCanvasSnapshot,
  decodePollConfigBlob,
  encodePollConfigBlob,
  decodeFthConfigBlob,
  encodeFthConfigBlob,
  type CanvasConfig,
  type PollConfig,
  type FthConfig,
} from "../src/index";

describe("canvas config SCALE codec", () => {
  it("round-trips a canvas config through encode/decode", () => {
    const config: CanvasConfig = {
      width: 64,
      height: 48,
      paletteSize: 16,
      cooldownSecs: 5,
    };
    const decoded = decodeCanvasConfigBlob(encodeCanvasConfigBlob(config));
    expect(decoded).toEqual(config);
  });

  it("encodes four u16 fields as 8 little-endian bytes", () => {
    const encoded = encodeCanvasConfigBlob({
      width: 1,
      height: 258, // 0x0102 -> bytes [0x02, 0x01]
      paletteSize: 16,
      cooldownSecs: 0,
    });
    expect(encoded.length).toBe(8);
    // width = 1 -> 0x01 0x00 (little-endian u16)
    expect(Array.from(encoded.slice(0, 2))).toEqual([1, 0]);
    // height = 258 -> 0x02 0x01
    expect(Array.from(encoded.slice(2, 4))).toEqual([2, 1]);
  });

  // Regression: `Vec<u8>` survives `.toJSON()` as a hex string, so decoding the
  // pixel blob by indexing it as an array used to throw on every real snapshot.
  it("decodes a snapshot blob into config and packed pixels", () => {
    const config: CanvasConfig = { width: 2, height: 2, paletteSize: 16, cooldownSecs: 0 };
    const configBytes = encodeCanvasConfigBlob(config);
    // Vec<u8> = compact-length prefix (4 items -> 0x10) then the bytes.
    const pixelBytes = Uint8Array.from([0x10, 0xa5, 0x00, 0x0f, 0x33]);
    const snapshot = Uint8Array.from([...configBytes, ...pixelBytes]);

    const decoded = decodeCanvasSnapshot(snapshot);

    expect(decoded.config).toEqual(config);
    expect(decoded.pixels).toBeInstanceOf(Uint8Array);
    expect(Array.from(decoded.pixels)).toEqual([0xa5, 0x00, 0x0f, 0x33]);
  });
});

describe("poll config SCALE codec", () => {
  it("round-trips a poll config with an endsAt deadline", () => {
    const config: PollConfig = {
      question: "Best chain?",
      options: ["Vara", "Other"],
      endsAt: 1_700_000_000,
    };
    const decoded = decodePollConfigBlob(encodePollConfigBlob(config));
    expect(decoded).toEqual(config);
  });

  it("round-trips a poll config without a deadline (Option::None)", () => {
    const config: PollConfig = {
      question: "Open ended?",
      options: ["Yes", "No", "Maybe"],
    };
    const decoded = decodePollConfigBlob(encodePollConfigBlob(config));
    expect(decoded.question).toBe(config.question);
    expect(decoded.options).toEqual(config.options);
    expect(decoded.endsAt).toBeUndefined();
  });
});

describe("fth config SCALE codec", () => {
  it("round-trips an fth config", () => {
    const config: FthConfig = {
      revealTallyLive: true,
      revealTimeoutSecs: 120,
      roundCount: 3,
      answerMaxBytes: 280,
    };
    const decoded = decodeFthConfigBlob(encodeFthConfigBlob(config));
    expect(decoded).toEqual(config);
  });

  it("preserves a false boolean flag through the round-trip", () => {
    const config: FthConfig = {
      revealTallyLive: false,
      revealTimeoutSecs: 0,
      roundCount: 1,
      answerMaxBytes: 64,
    };
    const decoded = decodeFthConfigBlob(encodeFthConfigBlob(config));
    expect(decoded.revealTallyLive).toBe(false);
  });
});
