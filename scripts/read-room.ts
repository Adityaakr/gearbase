/**
 * Read a live room's state from Vara.eth through the normal SDK query path.
 *
 * This is a pure read: `calculateReplyForHandle` dry-runs the query against the
 * program's current state and never sends a transaction. It is the same path the
 * web apps use, so a green run here means the apps can see the room too.
 *
 * Usage:
 *   pnpm run read:room -- --room 0x... --template poll
 */

import { existsSync, readFileSync } from "node:fs";

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

function arg(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? fallback : process.argv[index + 1];
}

async function main(): Promise<void> {
  const env = loadEnv(arg("env", ".env.hoodi.local") as string);
  const roomId = arg("room", env.VITE_POLL_ROOM_ID);
  if (!roomId) throw new Error("pass --room 0x... or set VITE_POLL_ROOM_ID");

  const { Gearbase } = await import("@gearbase/sdk");

  const gearbase = await Gearbase.connect({
    network: "testnet",
    identity: "burner",
  });

  const room = await gearbase.joinPoll(roomId as `0x${string}`);

  console.log(`room ${room.programId}`);
  console.log(`  owner:    ${room.info.owner}`);
  console.log(`  template: ${room.info.template}`);
  console.log(`  seq:      ${room.seq}`);
  console.log(`  question: ${room.state.config.question}`);
  console.log(`  options:  ${room.state.config.options.join(" | ")}`);
  console.log(`  tally:    ${room.state.tally.join(" | ")}`);
  console.log(`  members:  ${room.participants.length}`);

  // fuel() reads mirror state over the WS and can stall; it is a nicety here.
  const fuel = await Promise.race([
    room.fuel(),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 20_000)),
  ]);
  console.log(`  fuel:     ${fuel === null ? "(timed out)" : `${Number(fuel) / 1e12} wVARA`}`);

  room.dispose();

  // The WS provider keeps the event loop alive, and disconnect() can stall on a
  // half-open socket. This is a one-shot read, so bound it and leave.
  await Promise.race([
    gearbase.disconnect(),
    new Promise((resolve) => setTimeout(resolve, 5_000)),
  ]);
  process.exit(0);
}

main().catch((error: unknown) => {
  console.error(`read failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
