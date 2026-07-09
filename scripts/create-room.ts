/**
 * Create a room on Vara.eth from an already-validated code id.
 *
 * This is the step after `deploy:rooms`. `Gearbase.create()` does three things
 * under the hood: it calls the Router to create a Mirror program, tops up that
 * program's executable balance with wVARA (via a permit signature), and sends
 * the constructor message. Without the top-up the program exists but no message
 * ever executes.
 *
 * Read-only preview by default. Pass `--broadcast` to actually create.
 *
 * Usage:
 *   pnpm run create:room -- --template poll
 *   pnpm run create:room -- --template poll --broadcast
 */

import { existsSync, readFileSync } from "node:fs";

const WVARA_ONE = 10n ** 12n;

/** The playbook's reference executable-balance top-up is 1 wVARA. */
const DEFAULT_SPONSOR = WVARA_ONE;

type Template = "canvas" | "poll" | "fth";

function loadEnv(path: string): Record<string, string> {
  if (!existsSync(path)) throw new Error(`env file not found: ${path}`);
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

function arg(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

/** Config for each template. Kept small and obvious; this is a bring-up script. */
const CONFIGS = {
  poll: {
    question: "Does gearbase execute on Vara.eth?",
    options: ["Yes", "Not yet"],
  },
  canvas: { width: 32, height: 32, paletteSize: 16, cooldownSecs: 0 },
  fth: { revealTallyLive: true, revealTimeoutSecs: 300, roundCount: 3, answerMaxBytes: 280 },
} as const;

async function main(): Promise<void> {
  const broadcast = process.argv.includes("--broadcast");
  const template = (arg("template") ?? "poll") as Template;
  const envPath = arg("env", ".env.hoodi.local") as string;

  const env = loadEnv(envPath);
  const codeId = env[`VITE_${template.toUpperCase()}_CODE_ID`];
  const privateKey = env.DEPLOYER_PRIVATE_KEY;

  if (!codeId) throw new Error(`no VITE_${template.toUpperCase()}_CODE_ID in ${envPath}. Upload it first.`);
  if (!privateKey) throw new Error(`no DEPLOYER_PRIVATE_KEY in ${envPath}`);

  const sponsor = BigInt(arg("sponsor", String(DEFAULT_SPONSOR)) as string);

  console.log(`template: ${template}`);
  console.log(`code id:  ${codeId}`);
  console.log(`sponsor:  ${Number(sponsor) / 1e12} wVARA (executable balance top-up)`);
  console.log(`config:   ${JSON.stringify(CONFIGS[template])}`);

  if (!broadcast) {
    console.log("\nDRY RUN. Re-run with --broadcast to create the room.");
    return;
  }

  const { Gearbase } = await import("@gearbase/sdk");

  console.log("\nconnecting...");
  const gearbase = await Gearbase.connect({
    network: "testnet",
    identity: "privateKey",
    privateKey: privateKey as `0x${string}`,
  });

  console.log("creating program, topping up executable balance, sending constructor...");
  const room = await gearbase.create(template as "poll", CONFIGS.poll, {
    codeId: codeId as `0x${string}`,
    sponsorWVara: sponsor,
  });

  const fuel = await room.fuel();
  console.log(`\nroom created: ${room.programId}`);
  console.log(`  owner:    ${room.info.owner}`);
  console.log(`  seq:      ${room.seq}`);
  console.log(`  question: ${room.state.config.question}`);
  console.log(`  options:  ${room.state.config.options.join(", ")}`);
  console.log(`  tally:    ${room.state.tally.join(", ")}`);
  console.log(`  fuel:     ${Number(fuel) / 1e12} wVARA`);
  console.log(`\nAdd to your env:\nVITE_POLL_ROOM_ID=${room.programId}`);

  await gearbase.disconnect();
}

main().catch((error: unknown) => {
  console.error(`\ncreate failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
