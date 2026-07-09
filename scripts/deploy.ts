/**
 * Upload gearbase room programs to Vara.eth and wait for code validation.
 *
 * Deploy is a two-part story. This script owns part one: turning a built
 * `.opt.wasm` into a validated `code_id`. Part two, creating a room from that
 * code id, already lives in the SDK (`Gearbase.create`), which also handles the
 * executable-balance top-up and the constructor message. So the output here is
 * the `VITE_*_CODE_ID` values the apps consume.
 *
 * Two constraints drive the shape of this script, both verified against Hoodi:
 *
 *   1. `ethexe tx upload --watch` cannot work here. Watching subscribes to
 *      Router events, Hoodi's Ethereum RPC is HTTP-only, and its `wss://`
 *      endpoint answers 403. We therefore upload without `--watch` and poll
 *      `Router.codeState(bytes32)` until it reports Validated(2).
 *   2. `create` before validation is a documented failure mode, so the poll is
 *      a hard gate, not a courtesy.
 *
 * Defaults to a dry run. Pass `--broadcast` to actually send transactions.
 *
 * Usage:
 *   pnpm deploy                          # dry run, all rooms
 *   pnpm deploy --broadcast              # upload all rooms for real
 *   pnpm deploy --only fth --broadcast   # one room
 */

import { execFile } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const ROOMS = ["canvas", "poll", "fth"] as const;
type Room = (typeof ROOMS)[number];

/** `Router.codeState(bytes32) -> uint8`. 2 means Validated. */
const CODE_STATE_SELECTOR = "0xc13911e8";
const CODE_STATE_VALIDATED = 2;

/** wVARA carries 12 decimals on Hoodi, confirmed via `decimals()`. */
const WVARA_DECIMALS = 12n;
const WVARA_ONE = 10n ** WVARA_DECIMALS;

const VALIDATION_POLL_MS = 5_000;
const VALIDATION_TIMEOUT_MS = 10 * 60_000;

interface Config {
  ethRpc: string;
  router: string;
  wvara: string;
  deployer: string;
  privateKey: string;
  ethexe: string;
}

interface Cli {
  broadcast: boolean;
  rooms: Room[];
  envPath: string;
  verbose: boolean;
}

function parseCli(argv: string[]): Cli {
  const cli: Cli = {
    broadcast: argv.includes("--broadcast"),
    rooms: [...ROOMS],
    envPath: ".env.hoodi.local",
    verbose: argv.includes("--verbose"),
  };

  const onlyIndex = argv.indexOf("--only");
  if (onlyIndex !== -1) {
    const room = argv[onlyIndex + 1];
    if (!ROOMS.includes(room as Room)) {
      throw new Error(`--only expects one of ${ROOMS.join(", ")}, got: ${room ?? "(nothing)"}`);
    }
    cli.rooms = [room as Room];
  }

  const envIndex = argv.indexOf("--env");
  if (envIndex !== -1) {
    const path = argv[envIndex + 1];
    if (!path) throw new Error("--env expects a file path");
    cli.envPath = path;
  }

  return cli;
}

function loadConfig(envPath: string): Config {
  if (!existsSync(envPath)) {
    throw new Error(`env file not found: ${envPath}. Copy .env.example and fill it in.`);
  }

  const env: Record<string, string> = {};
  for (const line of readFileSync(envPath, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    env[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }

  const require_ = (key: string): string => {
    const value = env[key] ?? process.env[key];
    if (!value) throw new Error(`missing ${key} in ${envPath} (or environment)`);
    return value;
  };

  const ethexe = process.env.ETHEXE ?? env.ETHEXE ?? "";
  if (!ethexe) {
    throw new Error(
      "set ETHEXE to the ethexe binary path. Download it from https://get.gear.rs/#vara-eth",
    );
  }
  if (!existsSync(ethexe)) {
    throw new Error(`ETHEXE points at a missing file: ${ethexe}`);
  }

  return {
    ethRpc: require_("HOODI_ETH_RPC_URL"),
    router: require_("ROUTER_ADDRESS"),
    wvara: require_("WVARA_TOKEN_ADDRESS"),
    deployer: require_("DEPLOYER_ADDRESS"),
    privateKey: require_("DEPLOYER_PRIVATE_KEY"),
    ethexe,
  };
}

async function ethCall(rpc: string, to: string, data: string): Promise<string> {
  const response = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params: [{ to, data }, "latest"],
    }),
  });
  const body = (await response.json()) as { result?: string; error?: { message: string } };
  if (body.error) throw new Error(`eth_call failed: ${body.error.message}`);
  if (!body.result) throw new Error("eth_call returned no result");
  return body.result;
}

async function ethBalance(rpc: string, address: string): Promise<bigint> {
  const response = await fetch(rpc, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBalance", params: [address, "latest"] }),
  });
  const body = (await response.json()) as { result: string };
  return BigInt(body.result);
}

async function wvaraBalance(config: Config, address: string): Promise<bigint> {
  const data = `0x70a08231${address.slice(2).toLowerCase().padStart(64, "0")}`;
  return BigInt(await ethCall(config.ethRpc, config.wvara, data));
}

async function codeState(config: Config, codeId: string): Promise<number> {
  const data = `${CODE_STATE_SELECTOR}${codeId.slice(2).padStart(64, "0")}`;
  return Number(BigInt(await ethCall(config.ethRpc, config.router, data)));
}

function formatWvara(raw: bigint): string {
  const whole = raw / WVARA_ONE;
  const frac = (raw % WVARA_ONE).toString().padStart(Number(WVARA_DECIMALS), "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac} wVARA` : `${whole} wVARA`;
}

function wasmPath(room: Room): string {
  return `target/wasm32-gear/release/room_${room}.opt.wasm`;
}

async function runEthexe(config: Config, args: string[], verbose: boolean): Promise<string> {
  const { stdout, stderr } = await execFileAsync(config.ethexe, args, {
    maxBuffer: 32 * 1024 * 1024,
  });
  if (verbose && stderr.trim()) console.error(stderr.trim());
  return stdout;
}

/**
 * `ethexe` prints a JSON object whose exact shape we do not pin here, so accept
 * any 32-byte hex that appears under a code-id-ish key, and fall back to the
 * first 32-byte hex in the raw output. Guessing a schema would be worse than
 * scanning for the one value we can validate on chain immediately after.
 */
function extractCodeId(stdout: string): string {
  const direct = stdout.match(/"code_?[iI]d"\s*:\s*"(0x[0-9a-fA-F]{64})"/);
  if (direct) return direct[1];

  const any = stdout.match(/0x[0-9a-fA-F]{64}/);
  if (any) return any[0];

  throw new Error(`could not find a code_id in ethexe output:\n${stdout}`);
}

async function importKey(config: Config, verbose: boolean): Promise<void> {
  try {
    await runEthexe(config, ["key", "keyring", "import", "--private-key", config.privateKey, "--name", "gearbase-deployer"], verbose);
    console.log("  imported deployer key into the ethexe keyring");
  } catch (error) {
    // Re-importing an existing key is fine; anything else is not.
    const message = error instanceof Error ? error.message : String(error);
    if (/exist/i.test(message)) {
      console.log("  deployer key already present in the ethexe keyring");
      return;
    }
    throw new Error(`failed to import deployer key: ${message.replace(config.privateKey, "<redacted>")}`);
  }
}

async function waitForValidation(config: Config, codeId: string): Promise<void> {
  const deadline = Date.now() + VALIDATION_TIMEOUT_MS;
  process.stdout.write("  waiting for code validation");

  while (Date.now() < deadline) {
    const state = await codeState(config, codeId);
    if (state === CODE_STATE_VALIDATED) {
      process.stdout.write(" validated\n");
      return;
    }
    process.stdout.write(".");
    await new Promise((resolve) => setTimeout(resolve, VALIDATION_POLL_MS));
  }

  process.stdout.write("\n");
  throw new Error(
    `code ${codeId} was not validated within ${VALIDATION_TIMEOUT_MS / 60_000} minutes. ` +
      `Check Router.codeState(${codeId}) manually before calling create.`,
  );
}

async function preflight(config: Config, cli: Cli): Promise<void> {
  console.log("preflight");

  for (const room of cli.rooms) {
    const path = wasmPath(room);
    if (!existsSync(path)) {
      throw new Error(`missing artifact ${path}. Run: cargo build --release`);
    }
    console.log(`  artifact ok: ${path}`);
  }

  const chainId = await (async () => {
    const response = await fetch(config.ethRpc, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
    });
    const body = (await response.json()) as { result: string };
    return Number(BigInt(body.result));
  })();
  console.log(`  chain id: ${chainId}`);

  const decimals = Number(BigInt(await ethCall(config.ethRpc, config.wvara, "0x313ce567")));
  if (BigInt(decimals) !== WVARA_DECIMALS) {
    throw new Error(
      `wVARA reports ${decimals} decimals but this script assumes ${WVARA_DECIMALS}. ` +
        `Amounts would be wrong by 10^${Math.abs(decimals - Number(WVARA_DECIMALS))}. Refusing to continue.`,
    );
  }
  console.log(`  wVARA decimals: ${decimals}`);

  const eth = await ethBalance(config.ethRpc, config.deployer);
  const wvara = await wvaraBalance(config, config.deployer);
  console.log(`  deployer ${config.deployer}`);
  console.log(`    ETH:   ${Number(eth) / 1e18}`);
  console.log(`    wVARA: ${formatWvara(wvara)}`);

  if (eth === 0n) throw new Error("deployer has no ETH for gas");

  if (wvara === 0n) {
    console.log("");
    console.log("  NOTE: deployer holds 0 wVARA.");
    console.log("  Upload may still succeed, but creating a room needs an executable-balance");
    console.log("  top-up, which spends wVARA. wVARA cannot be minted or wrapped from ETH:");
    console.log("  it must be sent to you. Ask the Gear team.");
  }
}

async function uploadRoom(config: Config, room: Room, cli: Cli): Promise<string | undefined> {
  console.log(`\n${room}`);
  const path = wasmPath(room);

  if (!cli.broadcast) {
    console.log(`  DRY RUN: would upload ${path}`);
    console.log(`  DRY RUN: would poll Router.codeState until Validated(2)`);
    return undefined;
  }

  // Snapshot wVARA across the upload. A previous upload swept the deployer's
  // entire balance to the Router, and nothing in the docs explains why, so
  // measure it rather than assume.
  const before = await wvaraBalance(config, config.deployer);

  const stdout = await runEthexe(
    config,
    [
      "tx",
      "--ethereum-rpc", config.ethRpc,
      "--ethereum-router", config.router,
      "--sender", config.deployer,
      "upload", path,
      "--json",
    ],
    cli.verbose,
  );
  if (cli.verbose) console.log(stdout);

  const codeId = extractCodeId(stdout);
  console.log(`  code id: ${codeId}`);

  const after = await wvaraBalance(config, config.deployer);
  const spent = before - after;
  console.log(`  wVARA before: ${formatWvara(before)}`);
  console.log(`  wVARA after:  ${formatWvara(after)}`);
  console.log(`  upload cost:  ${formatWvara(spent > 0n ? spent : 0n)}`);

  await waitForValidation(config, codeId);
  return codeId;
}

async function main(): Promise<void> {
  const cli = parseCli(process.argv.slice(2));
  const config = loadConfig(cli.envPath);

  console.log(cli.broadcast ? "MODE: broadcast (transactions will be sent)\n" : "MODE: dry run (no transactions)\n");

  await preflight(config, cli);

  if (cli.broadcast) await importKey(config, cli.verbose);

  const codeIds = new Map<Room, string>();
  for (const room of cli.rooms) {
    const codeId = await uploadRoom(config, room, cli);
    if (codeId) codeIds.set(room, codeId);
  }

  if (!cli.broadcast) {
    console.log("\nDry run complete. Re-run with --broadcast to upload.");
    return;
  }

  console.log("\nValidated code ids. Add these to your app env:\n");
  for (const [room, codeId] of codeIds) {
    console.log(`VITE_${room.toUpperCase()}_CODE_ID=${codeId}`);
  }
  console.log("\nRooms are created from these code ids at runtime via Gearbase.create(),");
  console.log("which performs the executable-balance top-up and the constructor message.");
}

main().catch((error: unknown) => {
  console.error(`\ndeploy failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
