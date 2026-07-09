import { describe, it, expect } from "vitest";

import {
  HOODI_DEFAULTS,
  resolveNetworkConfig,
  assertSuccessReplyCode,
  SUCCESS_REPLY_CODES,
} from "../src/index";

describe("resolveNetworkConfig", () => {
  it("returns Hoodi defaults for testnet when nothing is overridden", () => {
    const config = resolveNetworkConfig({ network: "testnet" });
    expect(config).toEqual({
      ethereumRpc: HOODI_DEFAULTS.ethereumRpc,
      varaEthRpc: HOODI_DEFAULTS.varaEthRpc,
      routerAddress: HOODI_DEFAULTS.routerAddress,
    });
  });

  it("lets testnet callers override individual endpoints", () => {
    const config = resolveNetworkConfig({
      network: "testnet",
      ethereumRpc: "https://custom.example",
      routerAddress: "0x0000000000000000000000000000000000000001",
    });
    expect(config.ethereumRpc).toBe("https://custom.example");
    // Un-overridden values still fall back to the Hoodi defaults.
    expect(config.varaEthRpc).toBe(HOODI_DEFAULTS.varaEthRpc);
    expect(config.routerAddress).toBe("0x0000000000000000000000000000000000000001");
  });

  it("throws for mainnet when rpc/router are omitted", () => {
    expect(() => resolveNetworkConfig({ network: "mainnet" })).toThrow(
      /requires explicit ethereumRpc, varaEthRpc, and routerAddress/,
    );
  });

  it("throws for local when rpc/router are omitted", () => {
    expect(() => resolveNetworkConfig({ network: "local" })).toThrow(
      /Network local requires explicit/,
    );
  });

  it("throws for mainnet when only some fields are supplied", () => {
    expect(() =>
      resolveNetworkConfig({
        network: "mainnet",
        ethereumRpc: "https://rpc.example",
        varaEthRpc: "wss://vara.example",
        // routerAddress missing
      }),
    ).toThrow(/requires explicit/);
  });

  it("accepts mainnet/local when all endpoints are provided", () => {
    const config = resolveNetworkConfig({
      network: "mainnet",
      ethereumRpc: "https://rpc.example",
      varaEthRpc: "wss://vara.example",
      routerAddress: "0x00000000000000000000000000000000000000ab",
    });
    expect(config).toEqual({
      ethereumRpc: "https://rpc.example",
      varaEthRpc: "wss://vara.example",
      routerAddress: "0x00000000000000000000000000000000000000ab",
    });
  });
});

describe("assertSuccessReplyCode / SUCCESS_REPLY_CODES", () => {
  it("recognizes the two documented success codes", () => {
    expect(SUCCESS_REPLY_CODES.has("0x00000000")).toBe(true);
    expect(SUCCESS_REPLY_CODES.has("0x00010000")).toBe(true);
  });

  it("does not throw for success reply codes", () => {
    expect(() => assertSuccessReplyCode("0x00000000", "op")).not.toThrow();
    expect(() => assertSuccessReplyCode("0x00010000", "op")).not.toThrow();
  });

  it("is case-insensitive on the hex payload", () => {
    expect(() => assertSuccessReplyCode("0x00010000".toUpperCase(), "op")).not.toThrow();
  });

  it("throws with context for any non-success reply code", () => {
    expect(() => assertSuccessReplyCode("0x00020000", "PlacePixel")).toThrow(
      /PlacePixel failed with reply code 0x00020000/,
    );
  });
});
