import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parse as parseYaml } from "yaml";
import { Gearbase, type FthRoom, type FthState } from "@gearbase/sdk";

type AgentStyle = {
  minDelayMs?: number;
  maxDelayMs?: number;
  typoRate?: number;
};

type AgentDefinition = {
  name: string;
  persona: string;
  seat: number;
  privateKey?: `0x${string}`;
  style?: AgentStyle;
};

type AgentConfigFile = {
  agents: AgentDefinition[];
};

export type AgentRunnerConfig = {
  roomId: `0x${string}`;
  configPath?: string;
  network?: "testnet" | "local" | "mainnet";
  ethereumRpc?: string;
  varaEthRpc?: `ws://${string}` | `wss://${string}`;
  routerAddress?: `0x${string}`;
};

type AgentContext = {
  agent: AgentDefinition;
  room: FthRoom;
  handledRounds: Set<number>;
};

const PROFANITY = ["fuck", "shit", "bitch", "asshole"];

function ensurePrivateKey(value?: `0x${string}`): `0x${string}` {
  if (value) {
    return value;
  }
  return `0x${randomBytes(32).toString("hex")}`;
}

function maybeTypo(text: string, typoRate: number): string {
  if (text.length < 4 || Math.random() > typoRate) {
    return text;
  }

  const index = Math.max(1, Math.min(text.length - 2, Math.floor(text.length / 2)));
  return `${text.slice(0, index)}${text[index + 1]}${text[index]}${text.slice(index + 2)}`;
}

function cleanAnswer(text: string, typoRate: number): string {
  let output = text.replace(/\s+/g, " ").trim();
  for (const word of PROFANITY) {
    output = output.replace(new RegExp(word, "gi"), "...");
  }
  output = output.replace(/\bas an ai\b/gi, "");
  output = output.replace(/\blanguage model\b/gi, "");
  output = maybeTypo(output, typoRate);
  if (output.length > 280) {
    output = output.slice(0, 280);
  }
  return output || "not sure honestly";
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function loadAgentFile(path: string): Promise<AgentDefinition[]> {
  const raw = await readFile(path, "utf8");
  const parsed = parseYaml(raw) as AgentConfigFile;
  return parsed.agents ?? [];
}

async function createCompletion(agent: AgentDefinition, state: FthState): Promise<string> {
  const baseUrl = process.env.LLM_BASE_URL;
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL;
  if (!baseUrl || !apiKey || !model) {
    throw new Error("LLM_BASE_URL, LLM_API_KEY, and LLM_MODEL are required");
  }

  const prompt = state.rounds[state.rounds.length - 1]?.prompt ?? "";
  const response = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: agent.persona },
        {
          role: "user",
          content:
            `Room prompt: ${prompt}\n` +
            "Reply like a human in one short sentence. Keep it imperfect and under 280 characters.",
        },
      ],
      temperature: 0.9,
    }),
  });

  if (!response.ok) {
    throw new Error(`LLM request failed with ${response.status}`);
  }

  const json = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  return json.choices?.[0]?.message?.content ?? "";
}

async function maybeJoinAndSeat(context: AgentContext): Promise<void> {
  try {
    await context.room.send.Join({
      name: context.agent.name,
      kind: "agent",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes("already")) {
      throw error;
    }
  }

  try {
    await context.room.send.SitDown({ seat: context.agent.seat });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.toLowerCase().includes("already") && !message.toLowerCase().includes("occupied")) {
      throw error;
    }
  }
}

async function handleState(context: AgentContext, state: FthState): Promise<void> {
  if (state.phase !== "answering") {
    return;
  }

  const currentRound = state.rounds[state.rounds.length - 1];
  if (!currentRound) {
    return;
  }
  if (context.handledRounds.has(currentRound.round)) {
    return;
  }
  if (currentRound.answers.some((answer) => answer.seat === context.agent.seat)) {
    context.handledRounds.add(currentRound.round);
    return;
  }

  context.handledRounds.add(currentRound.round);
  const minDelay = context.agent.style?.minDelayMs ?? 1_000;
  const maxDelay = context.agent.style?.maxDelayMs ?? 3_500;
  const typoRate = context.agent.style?.typoRate ?? 0.1;
  const delayMs = minDelay + Math.floor(Math.random() * Math.max(1, maxDelay - minDelay));
  await delay(delayMs);

  const raw = await createCompletion(context.agent, state);
  const answer = cleanAnswer(raw, typoRate);
  await context.room.send.SubmitAnswer({ text: answer });
}

export async function startAgentRunner(config: AgentRunnerConfig): Promise<AgentContext[]> {
  const configPath = config.configPath ?? "agents.yaml";
  const agents = await loadAgentFile(configPath);
  const contexts: AgentContext[] = [];

  for (const agent of agents) {
    const gearbase = await Gearbase.connect({
      network: config.network ?? "testnet",
      identity: "privateKey",
      privateKey: ensurePrivateKey(agent.privateKey),
      ethereumRpc: config.ethereumRpc,
      varaEthRpc: config.varaEthRpc,
      routerAddress: config.routerAddress,
      pollMs: 500,
    });
    const room = await gearbase.joinFth(config.roomId);
    const context: AgentContext = {
      agent,
      room,
      handledRounds: new Set<number>(),
    };
    await maybeJoinAndSeat(context);
    room.on("update", (state) => {
      void handleState(context, state).catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[agent:${agent.name}] ${message}`);
      });
    });
    contexts.push(context);
  }

  return contexts;
}

function parseCliArgs(argv: string[]): AgentRunnerConfig {
  const args = new Map<string, string>();
  for (let index = 2; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (key?.startsWith("--") && value) {
      args.set(key.slice(2), value);
    }
  }

  const roomId = args.get("room");
  if (!roomId) {
    throw new Error("missing --room 0x...");
  }

  return {
    roomId: roomId as `0x${string}`,
    configPath: args.get("config"),
    ethereumRpc: args.get("ethereum-rpc"),
    varaEthRpc: args.get("vara-rpc") as `ws://${string}` | `wss://${string}` | undefined,
    routerAddress: args.get("router") as `0x${string}` | undefined,
  };
}

async function main() {
  const config = parseCliArgs(process.argv);
  await startAgentRunner(config);
  await new Promise(() => undefined);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exitCode = 1;
  });
}
