/**
 * Read-only smoke checks against a live Vara.eth network.
 *
 * Everything here is an `eth_call` or a balance read, so it costs nothing and
 * sends no transactions. It answers the question the unit tests cannot: is the
 * chain we are pointed at actually the chain we think it is, and are the
 * programs we depend on really there.
 *
 * Exits non-zero when a check fails, so it is safe to wire into CI.
 *
 * Usage:
 *   pnpm smoke                    # uses .env.hoodi.local, falls back to Hoodi defaults
 *   pnpm smoke --env .env.other
 */

import { existsSync, readFileSync } from "node:fs";

const HOODI_DEFAULTS = {
  ethRpc: "https://hoodi-reth-rpc.gear-tech.io",
  router: "0xE549b0AfEdA978271FF7E712232B9F7f39A0b060",
  wvara: "0xE1ab85A8B4d5d5B6af0bbD0203EB322DF33d0464",
  chainId: 560048,
};

/** wVARA carries 12 decimals on Hoodi. A change here silently breaks every amount. */
const EXPECTED_WVARA_DECIMALS = 12;

const CODE_STATE_SELECTOR = "0xc13911e8";
const CODE_STATE_VALIDATED = 2;

interface Check {
  name: string;
  ok: boolean;
}

const checks: Check[] = [];

function record(name: string, ok: boolean, detail: string): void {
  checks.push({ name, ok });
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}: ${detail}`);
}

function loadEnv(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const env: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return env;
}

async function rpc(url: string, method: string, params: unknown[]): Promise<string> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  });
  const body = (await response.json()) as { result?: string; error?: { message: string } };
  if (body.error) throw new Error(body.error.message);
  if (body.result === undefined) throw new Error("no result");
  return body.result;
}

const call = (url: string, to: string, data: string): Promise<string> =>
  rpc(url, "eth_call", [{ to, data }, "latest"]);

function finish(): void {
  const failed = checks.filter((check) => !check.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  if (failed.length > 0) {
    console.error(`failing: ${failed.map((check) => check.name).join(", ")}`);
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  const envIndex = process.argv.indexOf("--env");
  const envPath = envIndex === -1 ? ".env.hoodi.local" : process.argv[envIndex + 1];
  const env = loadEnv(envPath);

  const ethRpc = env.HOODI_ETH_RPC_URL ?? HOODI_DEFAULTS.ethRpc;
  const router = env.ROUTER_ADDRESS ?? HOODI_DEFAULTS.router;
  const wvara = env.WVARA_TOKEN_ADDRESS ?? HOODI_DEFAULTS.wvara;

  console.log(`smoke: ${ethRpc}\n`);

  try {
    const chainId = Number(BigInt(await rpc(ethRpc, "eth_chainId", [])));
    record("chain id", chainId === HOODI_DEFAULTS.chainId, `${chainId}`);
  } catch (error) {
    record("chain id", false, `unreachable: ${(error as Error).message}`);
    // Nothing downstream can pass if the RPC is dead.
    finish();
    return;
  }

  try {
    const code = await rpc(ethRpc, "eth_getCode", [router, "latest"]);
    record("router deployed", code !== "0x", `${code.length / 2 - 1} bytes at ${router}`);
  } catch (error) {
    record("router deployed", false, (error as Error).message);
  }

  try {
    const decimals = Number(BigInt(await call(ethRpc, wvara, "0x313ce567")));
    const ok = decimals === EXPECTED_WVARA_DECIMALS;
    record("wVARA decimals", ok, ok ? `${decimals}` : `${decimals} (expected ${EXPECTED_WVARA_DECIMALS}, amounts would be wrong)`);
  } catch (error) {
    record("wVARA decimals", false, (error as Error).message);
  }

  // The router must agree that this is its token, otherwise we are reading
  // balances off a token the protocol does not use.
  try {
    const raw = await call(ethRpc, router, "0x88f50cf0");
    const linked = `0x${raw.slice(-40)}`;
    record("router.wrappedVara matches", linked.toLowerCase() === wvara.toLowerCase(), linked);
  } catch (error) {
    record("router.wrappedVara matches", false, (error as Error).message);
  }

  const deployer = env.DEPLOYER_ADDRESS;
  if (deployer) {
    try {
      const eth = BigInt(await rpc(ethRpc, "eth_getBalance", [deployer, "latest"]));
      record("deployer has gas", eth > 0n, `${Number(eth) / 1e18} ETH`);
    } catch (error) {
      record("deployer has gas", false, (error as Error).message);
    }

    try {
      const data = `0x70a08231${deployer.slice(2).toLowerCase().padStart(64, "0")}`;
      const balance = BigInt(await call(ethRpc, wvara, data));
      // Not a failure: rooms can be joined without wVARA, only created with it.
      record("deployer wVARA (informational)", true, `${Number(balance) / 1e12} wVARA`);
    } catch (error) {
      record("deployer wVARA (informational)", false, (error as Error).message);
    }
  }

  // If code ids are configured, prove they are actually validated on chain.
  for (const room of ["CANVAS", "POLL", "FTH"] as const) {
    const codeId = env[`VITE_${room}_CODE_ID`];
    if (!codeId) continue;
    try {
      const data = `${CODE_STATE_SELECTOR}${codeId.slice(2).padStart(64, "0")}`;
      const state = Number(BigInt(await call(ethRpc, router, data)));
      const ok = state === CODE_STATE_VALIDATED;
      record(`${room.toLowerCase()} code validated`, ok, ok ? `codeState=${state}` : `codeState=${state} (2 = Validated)`);
    } catch (error) {
      record(`${room.toLowerCase()} code validated`, false, (error as Error).message);
    }
  }

  finish();
}

main().catch((error: unknown) => {
  console.error(`smoke failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
