import { TypeRegistry } from "@polkadot/types";
import {
  WsVaraEthProvider,
  createVaraEthApi,
  getMirrorClient,
  type VaraEthApi,
} from "@vara-eth/api";
import { walletClientToSigner } from "@vara-eth/api/signer";
import {
  isSupportedRoomTemplate,
  loadRoomProgram,
  loadRoomProgramByTemplateName,
  type SupportedRoomTemplate,
} from "@gearbase/clients";
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  toHex,
  type Address,
  type EIP1193Provider,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

export type GearbaseNetwork = "testnet" | "mainnet" | "local";
export type GearbaseIdentity = "burner" | "wallet" | "privateKey";
export type ParticipantKind = "unknown" | "human" | "agent";

export type GearbaseConnectOptions = {
  network: GearbaseNetwork;
  identity?: GearbaseIdentity;
  ethereumRpc?: string;
  varaEthRpc?: `ws://${string}` | `wss://${string}`;
  routerAddress?: Address;
  privateKey?: Hex;
  burnerStorageKey?: string;
  pollMs?: number;
  verify?: boolean;
  lowFuelThreshold?: bigint;
  templateCodeIds?: Partial<Record<SupportedRoomTemplate, Hex>>;
};

export type CreateRoomOptions = {
  codeId?: Hex;
  sponsorWVara?: bigint;
  salt?: Hex;
  overrideInitializer?: Address;
};

export type RoomInfo = {
  template: string;
  version: number;
  owner: Address;
  createdAt: number;
  configBlob: Uint8Array;
};

export type ParticipantProfile = {
  address: Address;
  name?: string;
  kind: ParticipantKind;
  joinedAt: number;
};

export type CanvasConfig = {
  width: number;
  height: number;
  paletteSize: number;
  cooldownSecs: number;
};

export type CanvasState = {
  config: CanvasConfig;
  pixels: Uint8Array;
};

export type CanvasRegionArgs = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type CanvasPixelArgs = {
  x: number;
  y: number;
  color: number;
};

export type PollConfig = {
  question: string;
  options: string[];
  endsAt?: number;
};

export type PollVote = {
  address: Address;
  option: number;
};

export type PollState = {
  config: PollConfig;
  votes: PollVote[];
  tally: number[];
};

export type PollVoteArgs = {
  option: number;
};

export type FthPhase = "lobby" | "answering" | "voting" | "ended" | "aborted";

export type FthConfig = {
  revealTallyLive: boolean;
  revealTimeoutSecs: number;
  roundCount: number;
  answerMaxBytes: number;
};

export type FthSeat = {
  seat: number;
  address: Address;
  name?: string;
  kind?: ParticipantKind;
};

export type FthRoundAnswer = {
  seat: number;
  text: string;
};

export type FthRound = {
  round: number;
  prompt: string;
  answers: FthRoundAnswer[];
};

export type FthVote = {
  address: Address;
  seat: number;
};

export type FthState = {
  config: FthConfig;
  commitHash?: Uint8Array;
  phase: FthPhase;
  roundsStarted: number;
  revealedHumanSeat?: number;
  votingStartedAt?: number;
  seats: FthSeat[];
  rounds: FthRound[];
  votes: FthVote[];
  tally: number[];
};

export type FthSitDownArgs = {
  seat: number;
};

export type FthHostCommitArgs = {
  hash: Uint8Array;
};

export type FthStartRoundArgs = {
  prompt: string;
};

export type FthSubmitAnswerArgs = {
  text: string;
};

export type FthCastVoteArgs = {
  seat: number;
};

export type FthRevealArgs = {
  seat: number;
  salt: Uint8Array;
};

export type SendOptions = {
  verify?: boolean;
};

export type SinceResult = {
  seq: number;
  events: Array<{ seq: number; raw: Uint8Array }>;
  truncated: boolean;
};

export type CanvasRoomEvent =
  | { type: "Joined"; who: Address }
  | { type: "Left"; who: Address }
  | { type: "Updated"; seq: number }
  | { type: "Closed" }
  | { type: "Configured"; seq: number }
  | { type: "PixelPlaced"; x: number; y: number; color: number; who: Address };

export type CanvasRoomQueryApi = {
  Info(): Promise<RoomInfo>;
  Seq(): Promise<number>;
  Since(fromSeq: number): Promise<SinceResult>;
  Snapshot(): Promise<CanvasState>;
  Participants(): Promise<ParticipantProfile[]>;
  Region(args: CanvasRegionArgs): Promise<Uint8Array>;
};

export type CanvasRoomSendApi = {
  Join(args?: { name?: string; kind?: ParticipantKind }, options?: SendOptions): Promise<unknown>;
  Leave(options?: SendOptions): Promise<unknown>;
  Configure(config: CanvasConfig, options?: SendOptions): Promise<unknown>;
  CloseRoom(options?: SendOptions): Promise<unknown>;
  PlacePixel(args: CanvasPixelArgs, options?: SendOptions): Promise<unknown>;
};

export type PollRoomEvent =
  | { type: "Joined"; who: Address }
  | { type: "Left"; who: Address }
  | { type: "Updated"; seq: number }
  | { type: "Closed" }
  | { type: "Configured"; seq: number }
  | { type: "Voted"; who: Address; option: number };

export type PollRoomQueryApi = {
  Info(): Promise<RoomInfo>;
  Seq(): Promise<number>;
  Since(fromSeq: number): Promise<SinceResult>;
  Snapshot(): Promise<Uint8Array>;
  Participants(): Promise<ParticipantProfile[]>;
  Tally(): Promise<number[]>;
  Poll(): Promise<PollState>;
};

export type PollRoomSendApi = {
  Join(args?: { name?: string; kind?: ParticipantKind }, options?: SendOptions): Promise<unknown>;
  Leave(options?: SendOptions): Promise<unknown>;
  Configure(config: PollConfig, options?: SendOptions): Promise<unknown>;
  CloseRoom(options?: SendOptions): Promise<unknown>;
  Vote(args: PollVoteArgs, options?: SendOptions): Promise<unknown>;
};

export type FthRoomEvent =
  | { type: "Joined"; who: Address }
  | { type: "Left"; who: Address }
  | { type: "Updated"; seq: number }
  | { type: "Closed" }
  | { type: "Configured"; seq: number }
  | { type: "SatDown"; who: Address; seat: number }
  | { type: "HostCommitted" }
  | { type: "RoundStarted"; round: number; prompt: string }
  | { type: "AnswerSubmitted"; round: number; seat: number; who: Address; text: string }
  | { type: "VotingOpened" }
  | { type: "VoteCast"; who: Address; seat: number }
  | { type: "Revealed"; seat: number }
  | { type: "RevealAborted" };

export type FthRoomQueryApi = {
  Info(): Promise<RoomInfo>;
  Seq(): Promise<number>;
  Since(fromSeq: number): Promise<SinceResult>;
  Snapshot(): Promise<Uint8Array>;
  Participants(): Promise<ParticipantProfile[]>;
  Game(): Promise<FthState>;
};

export type FthRoomSendApi = {
  Join(args?: { name?: string; kind?: ParticipantKind }, options?: SendOptions): Promise<unknown>;
  Leave(options?: SendOptions): Promise<unknown>;
  Configure(config: FthConfig, options?: SendOptions): Promise<unknown>;
  CloseRoom(options?: SendOptions): Promise<unknown>;
  SitDown(args: FthSitDownArgs, options?: SendOptions): Promise<unknown>;
  HostCommit(args: FthHostCommitArgs, options?: SendOptions): Promise<unknown>;
  StartRound(args: FthStartRoundArgs, options?: SendOptions): Promise<unknown>;
  SubmitAnswer(args: FthSubmitAnswerArgs, options?: SendOptions): Promise<unknown>;
  OpenVoting(options?: SendOptions): Promise<unknown>;
  CastVote(args: FthCastVoteArgs, options?: SendOptions): Promise<unknown>;
  Reveal(args: FthRevealArgs, options?: SendOptions): Promise<unknown>;
  AbortReveal(options?: SendOptions): Promise<unknown>;
};

type RoomEventHandlers = {
  update: (state: CanvasState, events: CanvasRoomEvent[]) => void;
  join: (participant: ParticipantProfile) => void;
  leave: (participant: ParticipantProfile) => void;
  lowFuel: (balance: bigint) => void;
  error: (error: Error) => void;
};

type PollRoomEventHandlers = {
  update: (state: PollState, events: PollRoomEvent[]) => void;
  join: (participant: ParticipantProfile) => void;
  leave: (participant: ParticipantProfile) => void;
  lowFuel: (balance: bigint) => void;
  error: (error: Error) => void;
};

type FthRoomEventHandlers = {
  update: (state: FthState, events: FthRoomEvent[]) => void;
  join: (participant: ParticipantProfile) => void;
  leave: (participant: ParticipantProfile) => void;
  lowFuel: (balance: bigint) => void;
  error: (error: Error) => void;
};

type ListenerMap = {
  [K in keyof RoomEventHandlers]: Set<RoomEventHandlers[K]>;
};

type PollListenerMap = {
  [K in keyof PollRoomEventHandlers]: Set<PollRoomEventHandlers[K]>;
};

type FthListenerMap = {
  [K in keyof FthRoomEventHandlers]: Set<FthRoomEventHandlers[K]>;
};

type IdentitySession = {
  address: Address;
  api: VaraEthApi;
  provider: WsVaraEthProvider;
  publicClient: PublicClient;
  walletClient: WalletClient;
  signer: ReturnType<typeof walletClientToSigner>;
  identity: GearbaseIdentity;
};

type ConnectedProgram = Awaited<ReturnType<typeof loadRoomProgram>>;

export const HOODI_DEFAULTS = {
  ethereumRpc: "https://hoodi-reth-rpc.gear-tech.io",
  varaEthRpc: "wss://vara-eth-validator-1.gear-tech.io",
  routerAddress: "0xE549b0AfEdA978271FF7E712232B9F7f39A0b060" as Address,
} as const;

export const SUCCESS_REPLY_CODES = new Set(["0x00000000", "0x00010000"]);

function registryWithCanvasTypes(): TypeRegistry {
  const registry = new TypeRegistry();
  registry.register(
    {
      CanvasRoomEvent: {
        _enum: {
          Joined: "[u8;32]",
          Left: "[u8;32]",
          Updated: "u64",
          Closed: "Null",
          Configured: "u64",
          PixelPlaced: {
            x: "u16",
            y: "u16",
            color: "u16",
            who: "[u8;32]",
          },
        },
      },
    } as any,
  );
  return registry;
}

function asHex(payload: string | Uint8Array): Hex {
  return (typeof payload === "string" ? payload : toHex(payload)) as Hex;
}

function bytesFromUnknown(value: unknown): Uint8Array {
  if (value instanceof Uint8Array) {
    return value;
  }
  if (Array.isArray(value)) {
    return Uint8Array.from(value.map((item) => Number(item)));
  }
  if (typeof value === "string" && value.startsWith("0x")) {
    const normalized = value.slice(2);
    const bytes = new Uint8Array(normalized.length / 2);
    for (let i = 0; i < bytes.length; i += 1) {
      bytes[i] = Number.parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
  }
  return new Uint8Array();
}

function normalizeAddress(value: unknown): Address {
  if (typeof value === "string") {
    return value as Address;
  }
  return toHex(bytesFromUnknown(value), { size: 32 }) as Address;
}

export function normalizeParticipantKind(value: number): ParticipantKind {
  switch (value) {
    case 1:
      return "human";
    case 2:
      return "agent";
    default:
      return "unknown";
  }
}

export function participantKindCode(kind: ParticipantKind | undefined): number {
  switch (kind) {
    case "human":
      return 1;
    case "agent":
      return 2;
    default:
      return 0;
  }
}

function normalizeError(error: unknown): Error {
  if (error instanceof Error) {
    return error;
  }

  return new Error(typeof error === "string" ? error : "Unknown Gearbase error");
}

function browserWallet(): EIP1193Provider {
  const wallet = (globalThis.window as (Window & { ethereum?: EIP1193Provider }) | undefined)
    ?.ethereum;
  if (!wallet) {
    throw new Error("No EIP-1193 wallet found in this browser");
  }
  return wallet;
}

export function resolveNetworkConfig(options: GearbaseConnectOptions) {
  if (options.network === "testnet") {
    return {
      ethereumRpc: options.ethereumRpc ?? HOODI_DEFAULTS.ethereumRpc,
      varaEthRpc: options.varaEthRpc ?? HOODI_DEFAULTS.varaEthRpc,
      routerAddress: options.routerAddress ?? HOODI_DEFAULTS.routerAddress,
    };
  }

  if (!options.ethereumRpc || !options.varaEthRpc || !options.routerAddress) {
    throw new Error(
      `Network ${options.network} requires explicit ethereumRpc, varaEthRpc, and routerAddress`,
    );
  }

  return {
    ethereumRpc: options.ethereumRpc,
    varaEthRpc: options.varaEthRpc,
    routerAddress: options.routerAddress,
  };
}

function burnerStorageKey(network: GearbaseNetwork, override?: string): string {
  return override ?? `gearbase:burner:${network}`;
}

function loadBurnerPrivateKey(storageKey: string): Hex {
  const localStorage = globalThis.localStorage;
  if (!localStorage) {
    return generatePrivateKey();
  }

  const existing = localStorage.getItem(storageKey);
  if (existing) {
    return existing as Hex;
  }

  const created = generatePrivateKey();
  localStorage.setItem(storageKey, created);
  return created;
}

async function connectIdentity(
  options: GearbaseConnectOptions,
): Promise<IdentitySession> {
  const identity = options.identity ?? "burner";
  const network = resolveNetworkConfig(options);

  if (identity === "wallet") {
    const wallet = browserWallet();
    const [address] = (await wallet.request({
      method: "eth_requestAccounts",
    })) as Address[];
    if (!address) {
      throw new Error("Wallet did not return an account");
    }

    const publicClient = createPublicClient({
      transport: http(network.ethereumRpc),
    });
    const walletClient = createWalletClient({
      account: address,
      transport: custom(wallet),
    });
    const signer = walletClientToSigner(walletClient);
    const provider = new WsVaraEthProvider(network.varaEthRpc);
    await provider.connect();
    const api = await createVaraEthApi(
      provider,
      publicClient,
      network.routerAddress,
      signer,
    );

    return {
      address,
      api,
      provider,
      publicClient,
      walletClient,
      signer,
      identity,
    };
  }

  const privateKey =
    identity === "privateKey"
        ? options.privateKey
        : loadBurnerPrivateKey(
          burnerStorageKey(options.network, options.burnerStorageKey),
        );

  if (!privateKey) {
    throw new Error("privateKey identity requires options.privateKey");
  }

  const account = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({
    transport: http(network.ethereumRpc),
  });
  const walletClient = createWalletClient({
    account,
    transport: http(network.ethereumRpc),
  });
  const signer = walletClientToSigner(walletClient);
  const provider = new WsVaraEthProvider(network.varaEthRpc);
  await provider.connect();
  const api = await createVaraEthApi(
    provider,
    publicClient,
    network.routerAddress,
    signer,
  );

  return {
    address: account.address,
    api,
    provider,
    publicClient,
    walletClient,
    signer,
    identity,
  };
}

function assertWritableIdentity(identity: GearbaseIdentity, operation: string): void {
  if (identity === "burner") {
    throw new Error(`${operation} requires a wallet or privateKey identity`);
  }
}

export function assertSuccessReplyCode(replyCode: string, context: string): void {
  const normalized = replyCode.toLowerCase();
  if (!SUCCESS_REPLY_CODES.has(normalized)) {
    throw new Error(`${context} failed with reply code ${replyCode}`);
  }
}

async function readProgramExecutableBalance(
  api: VaraEthApi,
  publicClient: PublicClient,
  signer: ReturnType<typeof walletClientToSigner>,
  programId: Address,
): Promise<bigint> {
  const mirror = getMirrorClient({
    address: programId,
    publicClient,
    signer,
  });
  const stateHash = await mirror.stateHash();
  const state = await api.query.program.readState(stateHash);
  return state.executableBalance;
}

async function sponsorProgram(
  api: VaraEthApi,
  publicClient: PublicClient,
  signer: ReturnType<typeof walletClientToSigner>,
  identity: GearbaseIdentity,
  programId: Address,
  amount: bigint,
): Promise<void> {
  assertWritableIdentity(identity, "sponsor()");
  const mirror = getMirrorClient({
    address: programId,
    publicClient,
    signer,
  });
  const approveTx = await api.eth.wvara.approve(programId, amount);
  await approveTx.sendAndWaitForReceipt();
  const topUpTx = await mirror.executableBalanceTopUp(amount);
  await topUpTx.sendAndWaitForReceipt();
}

export function decodeCanvasConfigBlob(configBlob: Uint8Array): CanvasConfig {
  const registry = new TypeRegistry();
  const decoded = registry
    .createType("(u16,u16,u16,u16)", asHex(configBlob))
    .toJSON() as [number, number, number, number];

  return {
    width: Number(decoded[0]),
    height: Number(decoded[1]),
    paletteSize: Number(decoded[2]),
    cooldownSecs: Number(decoded[3]),
  };
}

export function encodeCanvasConfigBlob(config: CanvasConfig): Uint8Array {
  const registry = new TypeRegistry();
  const encoded = registry
    .createType("(u16,u16,u16,u16)", [
      config.width,
      config.height,
      config.paletteSize,
      config.cooldownSecs,
    ])
    .toU8a();

  return Uint8Array.from(encoded);
}

export function decodeCanvasSnapshot(snapshot: Uint8Array): CanvasState {
  const registry = new TypeRegistry();
  // `Vec<u8>` survives `.toJSON()` as a hex string, not an array, so route the
  // pixel blob through `bytesFromUnknown` rather than indexing it directly.
  const decoded = registry
    .createType("((u16,u16,u16,u16), Vec<u8>)", asHex(snapshot))
    .toJSON() as [[number, number, number, number], unknown];

  return {
    config: {
      width: Number(decoded[0][0]),
      height: Number(decoded[0][1]),
      paletteSize: Number(decoded[0][2]),
      cooldownSecs: Number(decoded[0][3]),
    },
    pixels: bytesFromUnknown(decoded[1]),
  };
}

export function decodePollConfigBlob(configBlob: Uint8Array): PollConfig {
  const registry = new TypeRegistry();
  const decoded = registry
    .createType("(String,Vec<String>,Option<u64>)", asHex(configBlob))
    .toJSON() as [string, string[], number | null];

  return {
    question: decoded[0],
    options: decoded[1],
    endsAt: decoded[2] === null ? undefined : Number(decoded[2]),
  };
}

export function encodePollConfigBlob(config: PollConfig): Uint8Array {
  const registry = new TypeRegistry();
  const encoded = registry
    .createType("(String,Vec<String>,Option<u64>)", [
      config.question,
      config.options,
      config.endsAt ?? null,
    ])
    .toU8a();

  return Uint8Array.from(encoded);
}

export function decodeFthConfigBlob(configBlob: Uint8Array): FthConfig {
  const registry = new TypeRegistry();
  const decoded = registry
    .createType("(bool,u64,u16,u16)", asHex(configBlob))
    .toJSON() as [boolean, number, number, number];

  return {
    revealTallyLive: Boolean(decoded[0]),
    revealTimeoutSecs: Number(decoded[1]),
    roundCount: Number(decoded[2]),
    answerMaxBytes: Number(decoded[3]),
  };
}

export function encodeFthConfigBlob(config: FthConfig): Uint8Array {
  const registry = new TypeRegistry();
  const encoded = registry
    .createType("(bool,u64,u16,u16)", [
      config.revealTallyLive,
      config.revealTimeoutSecs,
      config.roundCount,
      config.answerMaxBytes,
    ])
    .toU8a();

  return Uint8Array.from(encoded);
}

function decodeCanvasEvent(raw: Uint8Array): CanvasRoomEvent {
  const decoded = registryWithCanvasTypes()
    .createType("CanvasRoomEvent", asHex(raw))
    .toJSON() as Record<string, unknown>;
  const [eventType, payload] = Object.entries(decoded)[0] ?? [];

  switch (eventType) {
    case "Joined":
      return { type: "Joined", who: normalizeAddress(payload) };
    case "Left":
      return { type: "Left", who: normalizeAddress(payload) };
    case "Updated":
      return { type: "Updated", seq: Number(payload) };
    case "Configured":
      return { type: "Configured", seq: Number(payload) };
    case "Closed":
      return { type: "Closed" };
    case "PixelPlaced": {
      const item = payload as Record<string, unknown>;
      return {
        type: "PixelPlaced",
        x: Number(item.x),
        y: Number(item.y),
        color: Number(item.color),
        who: normalizeAddress(item.who),
      };
    }
    default:
      throw new Error(`Unsupported canvas event payload: ${String(eventType)}`);
  }
}

function registryWithPollTypes(): TypeRegistry {
  const registry = new TypeRegistry();
  registry.register(
    {
      PollRoomEvent: {
        _enum: {
          Joined: "[u8;32]",
          Left: "[u8;32]",
          Updated: "u64",
          Closed: "Null",
          Configured: "u64",
          Voted: {
            who: "[u8;32]",
            option: "u16",
          },
        },
      },
    } as any,
  );
  return registry;
}

function decodePollEvent(raw: Uint8Array): PollRoomEvent {
  const decoded = registryWithPollTypes()
    .createType("PollRoomEvent", asHex(raw))
    .toJSON() as Record<string, unknown>;
  const [eventType, payload] = Object.entries(decoded)[0] ?? [];

  switch (eventType) {
    case "Joined":
      return { type: "Joined", who: normalizeAddress(payload) };
    case "Left":
      return { type: "Left", who: normalizeAddress(payload) };
    case "Updated":
      return { type: "Updated", seq: Number(payload) };
    case "Configured":
      return { type: "Configured", seq: Number(payload) };
    case "Closed":
      return { type: "Closed" };
    case "Voted": {
      const item = payload as Record<string, unknown>;
      return {
        type: "Voted",
        who: normalizeAddress(item.who),
        option: Number(item.option),
      };
    }
    default:
      throw new Error(`Unsupported poll event payload: ${String(eventType)}`);
  }
}

function registryWithFthTypes(): TypeRegistry {
  const registry = new TypeRegistry();
  registry.register(
    {
      FthRoomEvent: {
        _enum: {
          Joined: "[u8;32]",
          Left: "[u8;32]",
          Updated: "u64",
          Closed: "Null",
          Configured: "u64",
          SatDown: {
            who: "[u8;32]",
            seat: "u16",
          },
          HostCommitted: "Null",
          RoundStarted: {
            round: "u16",
            prompt: "String",
          },
          AnswerSubmitted: {
            round: "u16",
            seat: "u16",
            who: "[u8;32]",
            text: "String",
          },
          VotingOpened: "Null",
          VoteCast: {
            who: "[u8;32]",
            seat: "u16",
          },
          Revealed: {
            seat: "u16",
          },
          RevealAborted: "Null",
        },
      },
    } as any,
  );
  return registry;
}

function decodeFthEvent(raw: Uint8Array): FthRoomEvent {
  const decoded = registryWithFthTypes()
    .createType("FthRoomEvent", asHex(raw))
    .toJSON() as Record<string, unknown>;
  const [eventType, payload] = Object.entries(decoded)[0] ?? [];

  switch (eventType) {
    case "Joined":
      return { type: "Joined", who: normalizeAddress(payload) };
    case "Left":
      return { type: "Left", who: normalizeAddress(payload) };
    case "Updated":
      return { type: "Updated", seq: Number(payload) };
    case "Configured":
      return { type: "Configured", seq: Number(payload) };
    case "Closed":
      return { type: "Closed" };
    case "SatDown": {
      const item = payload as Record<string, unknown>;
      return {
        type: "SatDown",
        who: normalizeAddress(item.who),
        seat: Number(item.seat),
      };
    }
    case "HostCommitted":
      return { type: "HostCommitted" };
    case "RoundStarted": {
      const item = payload as Record<string, unknown>;
      return {
        type: "RoundStarted",
        round: Number(item.round),
        prompt: String(item.prompt),
      };
    }
    case "AnswerSubmitted": {
      const item = payload as Record<string, unknown>;
      return {
        type: "AnswerSubmitted",
        round: Number(item.round),
        seat: Number(item.seat),
        who: normalizeAddress(item.who),
        text: String(item.text),
      };
    }
    case "VotingOpened":
      return { type: "VotingOpened" };
    case "VoteCast": {
      const item = payload as Record<string, unknown>;
      return {
        type: "VoteCast",
        who: normalizeAddress(item.who),
        seat: Number(item.seat),
      };
    }
    case "Revealed": {
      const item = payload as Record<string, unknown>;
      return {
        type: "Revealed",
        seat: Number(item.seat),
      };
    }
    case "RevealAborted":
      return { type: "RevealAborted" };
    default:
      throw new Error(`Unsupported fth event payload: ${String(eventType)}`);
  }
}

export function decodeFthPhase(code: number): FthPhase {
  switch (code) {
    case 1:
      return "answering";
    case 2:
      return "voting";
    case 3:
      return "ended";
    case 4:
      return "aborted";
    default:
      return "lobby";
  }
}

function decodeFthState(
  raw: [
    [boolean, number, number, number, boolean, unknown, number, number, boolean, number, boolean, number],
    [
      Array<[number, unknown]>,
      Array<[number, string]>,
      Array<[number, number, string]>,
      Array<[unknown, number]>,
      number[],
    ],
  ],
  participants: ParticipantProfile[] = [],
): FthState {
  const meta = raw[0];
  const data = raw[1];
  const participantMap = new Map(participants.map((participant) => [participant.address, participant]));
  const prompts = new Map<number, FthRound>();

  for (const [round, prompt] of data[1]) {
    prompts.set(Number(round), {
      round: Number(round) + 1,
      prompt,
      answers: [],
    });
  }

  for (const [round, seat, text] of data[2]) {
    const bucket = prompts.get(Number(round)) ?? {
      round: Number(round) + 1,
      prompt: "",
      answers: [],
    };
    bucket.answers.push({
      seat: Number(seat),
      text,
    });
    prompts.set(Number(round), bucket);
  }

  const seats = data[0].map(([seat, address]) => {
    const normalized = normalizeAddress(address);
    const participant = participantMap.get(normalized);
    return {
      seat: Number(seat),
      address: normalized,
      name: participant?.name,
      kind: participant?.kind,
    };
  });

  return {
    config: {
      revealTallyLive: Boolean(meta[0]),
      revealTimeoutSecs: Number(meta[1]),
      roundCount: Number(meta[2]),
      answerMaxBytes: Number(meta[3]),
    },
    commitHash: meta[4] ? bytesFromUnknown(meta[5]) : undefined,
    phase: decodeFthPhase(Number(meta[6])),
    roundsStarted: Number(meta[7]),
    revealedHumanSeat: meta[8] ? Number(meta[9]) : undefined,
    votingStartedAt: meta[10] ? Number(meta[11]) : undefined,
    seats,
    rounds: Array.from(prompts.values()).sort((left, right) => left.round - right.round),
    votes: data[3].map(([address, seat]) => ({
      address: normalizeAddress(address),
      seat: Number(seat),
    })),
    tally: data[4].map((value) => Number(value)),
  };
}

export function applyCanvasEvent(state: CanvasState, event: CanvasRoomEvent): CanvasState {
  if (event.type !== "PixelPlaced") {
    return state;
  }

  const width = state.config.width;
  const index = event.y * width + event.x;
  const byteIndex = Math.floor(index / 2);
  const highNibble = index % 2 === 1;
  const pixels = Uint8Array.from(state.pixels);
  const current = pixels[byteIndex] ?? 0;

  pixels[byteIndex] = highNibble
    ? ((current & 0x0f) | (event.color << 4)) & 0xff
    : ((current & 0xf0) | event.color) & 0xff;

  return {
    ...state,
    pixels,
  };
}

async function runRoomQuery(
  api: VaraEthApi,
  address: Address,
  programId: Address,
  program: ConnectedProgram,
  name: string,
  args: unknown[] = [],
): Promise<unknown> {
  const roomService = (program.services as Record<string, any>).Room;
  const query = roomService.queries[name];
  const payload = asHex(query.encodePayload(...args));
  const reply = await api.call.program.calculateReplyForHandle(
    address,
    programId,
    payload,
    0n,
  );

  // An error reply carries a UTF-8 message, not SCALE. Decoding it anyway yields
  // an inscrutable codec error, so surface the node's actual complaint instead.
  // The commonest cause is routing a query through the wrong room template: the
  // service selector is baked into the payload prefix, and a mismatched program
  // answers "failed to find matching interface".
  const replyCode = replyCodeToHex(reply.code);
  if (replyCode && !SUCCESS_REPLY_CODES.has(replyCode)) {
    throw new Error(`${name}() failed with reply code ${replyCode}: ${asUtf8(reply.payload)}`);
  }

  return query.decodeResult(reply.payload);
}

/** `calculateReplyForHandle` returns a `ReplyCode` object, not a hex string. */
function replyCodeToHex(code: unknown): string | undefined {
  const bytes =
    code instanceof Uint8Array
      ? code
      : code && typeof code === "object" && "_bytes" in code
        ? ((code as { _bytes: unknown })._bytes as Uint8Array)
        : undefined;
  if (!(bytes instanceof Uint8Array)) {
    return undefined;
  }
  return toHex(bytes).toLowerCase();
}

/**
 * Pull the reply out of an injected-transaction receipt and insist it succeeded.
 *
 * `sendAndWaitForPromise()` resolves to an `InjectedTxReceipt` whose reply lives
 * behind the `promise` getter, or (legacy shape) to the reply itself. Neither
 * exposes `code.isError`, so the obvious-looking `receipt.code?.isError` check is
 * always undefined and every on-chain rejection reads as success. Programs use
 * `#[export(unwrap_result)]`, which panics on `Err`, so a rejected command comes
 * back as an error reply code with the state rolled back.
 */
function assertInjectedSuccess(receipt: unknown, context: string): Hex | undefined {
  if (!receipt || typeof receipt !== "object") {
    throw new Error(`${context}: node returned no receipt`);
  }

  const candidate = receipt as {
    error?: string | null;
    promise?: { payload?: Hex; code?: unknown };
    payload?: Hex;
    code?: unknown;
  };

  // A purged transaction never executed. Reading `promise` would throw.
  if (typeof candidate.error === "string" && candidate.error.length > 0) {
    throw new Error(`${context} was dropped before execution: ${candidate.error}`);
  }

  const reply = candidate.promise ?? candidate;
  const replyCode = replyCodeToHex(reply.code);

  if (replyCode && !SUCCESS_REPLY_CODES.has(replyCode)) {
    const detail = typeof reply.payload === "string" ? asUtf8(reply.payload) : "";
    throw new Error(
      `${context} was rejected on chain with reply code ${replyCode}` +
        (detail ? `: ${detail}` : ""),
    );
  }

  return typeof reply.payload === "string" ? reply.payload : undefined;
}

/**
 * Render a reply payload for a human. Node errors arrive as UTF-8 text, while a
 * program's own error reply is SCALE, so only decode as text when it mostly is.
 */
function asUtf8(payload: string): string {
  try {
    const bytes = bytesFromUnknown(payload);
    if (bytes.length === 0) {
      return "";
    }
    const printable = bytes.filter((byte) => byte >= 0x20 && byte <= 0x7e).length;
    if (printable / bytes.length < 0.8) {
      return `payload ${payload.slice(0, 34)}...`;
    }
    return new TextDecoder().decode(bytes).trim();
  } catch {
    return payload.slice(0, 34);
  }
}

function decodeRoomInfo(raw: [string, number, unknown, number, unknown]): RoomInfo {
  return {
    template: raw[0],
    version: Number(raw[1]),
    owner: normalizeAddress(raw[2]),
    createdAt: Number(raw[3]),
    configBlob: bytesFromUnknown(raw[4]),
  };
}

function decodeParticipants(raw: Array<[unknown, string, number, number]>): ParticipantProfile[] {
  return raw.map(([address, name, kind, joinedAt]) => ({
    address: normalizeAddress(address),
    name: name || undefined,
    kind: normalizeParticipantKind(Number(kind)),
    joinedAt: Number(joinedAt),
  }));
}

function encodeCreatePayload(
  template: SupportedRoomTemplate,
  program: ConnectedProgram,
  config: CanvasConfig | PollConfig | FthConfig,
): Hex {
  const createCtor = (program.ctors as Record<string, any> | undefined)?.Create;
  if (!createCtor) {
    throw new Error(`Create constructor is missing for ${template}`);
  }

  switch (template) {
    case "canvas": {
      const canvas = config as CanvasConfig;
      return asHex(
        createCtor.encodePayload(
          canvas.width,
          canvas.height,
          canvas.paletteSize,
          canvas.cooldownSecs,
        ),
      );
    }
    case "poll": {
      const poll = config as PollConfig;
      return asHex(
        createCtor.encodePayload(
          poll.question,
          poll.options,
          poll.endsAt !== undefined,
          poll.endsAt ?? 0,
        ),
      );
    }
    case "fth": {
      const fth = config as FthConfig;
      return asHex(
        createCtor.encodePayload(
          fth.revealTallyLive,
          fth.revealTimeoutSecs,
          fth.roundCount,
          fth.answerMaxBytes,
        ),
      );
    }
    default:
      throw new Error(`Unsupported Gearbase room template: ${template}`);
  }
}

const ROOM_TEMPLATES: SupportedRoomTemplate[] = ["canvas", "poll", "fth"];

/**
 * Find which template a program speaks by asking each in turn. Only the matching
 * client produces a route the program will answer.
 */
async function detectRoomProgram(
  api: VaraEthApi,
  address: Address,
  programId: Address,
): Promise<ConnectedProgram> {
  const failures: string[] = [];

  for (const template of ROOM_TEMPLATES) {
    const candidate = await loadRoomProgram(template, programId);
    try {
      await runRoomQuery(api, address, programId, candidate, "Info");
      return candidate;
    } catch (error) {
      failures.push(`${template}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw new Error(
    `Program ${programId} did not answer Info() as any known room template.\n${failures.join("\n")}`,
  );
}

/**
 * Read the room surface every template shares.
 *
 * The method names are identical across templates, but sails bakes the service
 * selector into the payload prefix, so a query encoded with the canvas client is
 * rejected by a poll program. Callers that already know the template must pass
 * it. `open()` does not, so it probes each template until one answers.
 */
async function bootstrapBaseRoomState(
  api: VaraEthApi,
  address: Address,
  programId: Address,
  template?: SupportedRoomTemplate,
): Promise<{
  info: RoomInfo;
  seq: number;
  participants: ParticipantProfile[];
}> {
  const program = template
    ? await loadRoomProgram(template, programId)
    : await detectRoomProgram(api, address, programId);

  const [infoRaw, seqRaw, participantsRaw] = await Promise.all([
    runRoomQuery(api, address, programId, program, "Info"),
    runRoomQuery(api, address, programId, program, "Seq"),
    runRoomQuery(api, address, programId, program, "Participants"),
  ]);

  return {
    info: decodeRoomInfo(infoRaw as [string, number, unknown, number, unknown]),
    seq: Number(seqRaw),
    participants: decodeParticipants(
      participantsRaw as Array<[unknown, string, number, number]>,
    ),
  };
}

export class CanvasRoom {
  readonly template = "canvas" as const;
  readonly programId: Address;
  readonly send: CanvasRoomSendApi;
  readonly query: CanvasRoomQueryApi;

  state: CanvasState;
  seq: number;
  participants: ParticipantProfile[];
  info: RoomInfo;

  private readonly api: VaraEthApi;
  private readonly address: Address;
  private readonly publicClient: PublicClient;
  private readonly signer: ReturnType<typeof walletClientToSigner>;
  private readonly identity: GearbaseIdentity;
  private readonly verify: boolean;
  private readonly pollMs: number;
  private readonly lowFuelThreshold?: bigint;
  private readonly program: ConnectedProgram;
  private readonly listeners: ListenerMap;
  private pollTimer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;
  private lowFuelActive = false;

  constructor(args: {
    api: VaraEthApi;
    address: Address;
    publicClient: PublicClient;
    signer: ReturnType<typeof walletClientToSigner>;
    identity: GearbaseIdentity;
    verify: boolean;
    pollMs: number;
    lowFuelThreshold?: bigint;
    programId: Address;
    program: ConnectedProgram;
    state: CanvasState;
    seq: number;
    participants: ParticipantProfile[];
    info: RoomInfo;
  }) {
    this.api = args.api;
    this.address = args.address;
    this.publicClient = args.publicClient;
    this.signer = args.signer;
    this.identity = args.identity;
    this.verify = args.verify;
    this.pollMs = args.pollMs;
    this.lowFuelThreshold = args.lowFuelThreshold;
    this.programId = args.programId;
    this.program = args.program;
    this.state = args.state;
    this.seq = args.seq;
    this.participants = args.participants;
    this.info = args.info;
    this.listeners = {
      update: new Set(),
      join: new Set(),
      leave: new Set(),
      lowFuel: new Set(),
      error: new Set(),
    };

    this.query = {
      Info: () => this.readInfo(),
      Seq: () => this.readSeq(),
      Since: (fromSeq) => this.readSince(fromSeq),
      Snapshot: () => this.readSnapshot(),
      Participants: () => this.readParticipants(),
      Region: ({ x, y, w, h }) => this.readRegion(x, y, w, h),
    };

    this.send = {
      Join: (args, options) =>
        this.invokeFunction("Join", [args?.name ?? "", participantKindCode(args?.kind)], options),
      Leave: (options) => this.invokeFunction("Leave", [], options),
      Configure: (config, options) =>
        this.invokeFunction("Configure", [Array.from(encodeCanvasConfigBlob(config))], options),
      CloseRoom: (options) => this.invokeFunction("CloseRoom", [], options),
      PlacePixel: ({ x, y, color }, options) =>
        this.invokeFunction("PlacePixel", [x, y, color], options),
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.handleVisibilityChange);
    }
  }

  on<K extends keyof RoomEventHandlers>(event: K, listener: RoomEventHandlers[K]): () => void {
    this.listeners[event].add(listener);
    return () => {
      this.listeners[event].delete(listener);
    };
  }

  start(): void {
    this.schedulePoll(0);
  }

  async leave(): Promise<unknown> {
    return this.send.Leave();
  }

  async close(): Promise<unknown> {
    return this.send.CloseRoom();
  }

  async fuel(): Promise<bigint> {
    return readProgramExecutableBalance(
      this.api,
      this.publicClient,
      this.signer,
      this.programId,
    );
  }

  async sponsor(amountWVara: bigint): Promise<void> {
    await sponsorProgram(
      this.api,
      this.publicClient,
      this.signer,
      this.identity,
      this.programId,
      amountWVara,
    );
    await this.refreshLowFuelStatus();
  }

  dispose(): void {
    this.disposed = true;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = undefined;
    }
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    }
  }

  private readonly handleVisibilityChange = () => {
    if (this.disposed) {
      return;
    }
    if (typeof document !== "undefined" && !document.hidden && !this.pollTimer) {
      this.schedulePoll(0);
    }
  };

  private schedulePoll(delayMs?: number): void {
    if (this.disposed) {
      return;
    }
    if (typeof document !== "undefined" && document.hidden) {
      return;
    }

    const baseDelay = delayMs ?? this.pollMs;
    const jitter = Math.floor(Math.random() * Math.min(75, Math.max(1, this.pollMs / 4)));
    this.pollTimer = setTimeout(() => {
      void this.pollOnce();
    }, baseDelay + jitter);
  }

  private emit<K extends keyof RoomEventHandlers>(
    event: K,
    ...args: Parameters<RoomEventHandlers[K]>
  ): void {
    for (const listener of this.listeners[event]) {
      (listener as (...items: Parameters<RoomEventHandlers[K]>) => void)(...args);
    }
  }

  private async pollOnce(): Promise<void> {
    this.pollTimer = undefined;
    if (this.disposed) {
      return;
    }

    try {
      const nextSeq = await this.readSeq();
      if (nextSeq > this.seq) {
        const since = await this.readSince(this.seq);
        if (since.truncated) {
          await this.refreshFullState([]);
        } else {
          const events = since.events.map((event) => decodeCanvasEvent(event.raw));
          let nextState = this.state;
          for (const event of events) {
            nextState = applyCanvasEvent(nextState, event);
          }

          const participantsChanged = events.some(
            (event) => event.type === "Joined" || event.type === "Left",
          );
          this.state = nextState;
          this.seq = since.seq;
          if (participantsChanged) {
            const previousByAddress = new Map(
              this.participants.map((participant) => [participant.address, participant]),
            );
            const nextParticipants = await this.readParticipants();
            this.participants = nextParticipants;
            for (const participant of nextParticipants) {
              if (!previousByAddress.has(participant.address)) {
                this.emit("join", participant);
              }
            }
            for (const participant of previousByAddress.values()) {
              if (!nextParticipants.find((item) => item.address === participant.address)) {
                this.emit("leave", participant);
              }
            }
          }
          if (events.some((event) => event.type === "Configured")) {
            this.info = await this.readInfo();
          }
          this.emit("update", this.state, events);
        }
      }
    } catch (error) {
      this.emit("error", normalizeError(error));
    } finally {
      this.schedulePoll();
    }
  }

  private async refreshFullState(events: CanvasRoomEvent[]): Promise<void> {
    const [state, participants, seq, info] = await Promise.all([
      this.readSnapshot(),
      this.readParticipants(),
      this.readSeq(),
      this.readInfo(),
    ]);

    this.state = state;
    this.participants = participants;
    this.seq = seq;
    this.info = info;
    await this.refreshLowFuelStatus();
    this.emit("update", this.state, events);
  }

  private async refreshLowFuelStatus(): Promise<void> {
    if (this.lowFuelThreshold === undefined) {
      return;
    }

    const balance = await this.fuel();
    const isLow = balance <= this.lowFuelThreshold;
    if (isLow && !this.lowFuelActive) {
      this.lowFuelActive = true;
      this.emit("lowFuel", balance);
      return;
    }

    if (!isLow) {
      this.lowFuelActive = false;
    }
  }

  private async readInfo(): Promise<RoomInfo> {
    const raw = (await this.runQuery("Info")) as [string, number, unknown, number, unknown];
    return {
      template: raw[0],
      version: Number(raw[1]),
      owner: normalizeAddress(raw[2]),
      createdAt: Number(raw[3]),
      configBlob: bytesFromUnknown(raw[4]),
    };
  }

  private async readSeq(): Promise<number> {
    return Number(await this.runQuery("Seq"));
  }

  private async readSince(fromSeq: number): Promise<SinceResult> {
    const raw = (await this.runQuery("Since", [fromSeq])) as [
      number,
      Array<[number, unknown]>,
      boolean,
    ];

    return {
      seq: Number(raw[0]),
      events: raw[1].map(([seq, payload]) => ({
        seq: Number(seq),
        raw: bytesFromUnknown(payload),
      })),
      truncated: Boolean(raw[2]),
    };
  }

  private async readSnapshot(): Promise<CanvasState> {
    const raw = (await this.runQuery("Snapshot")) as unknown;
    return decodeCanvasSnapshot(bytesFromUnknown(raw));
  }

  private async readParticipants(): Promise<ParticipantProfile[]> {
    const raw = (await this.runQuery("Participants")) as Array<[unknown, string, number, number]>;
    return raw.map(([address, name, kind, joinedAt]) => ({
      address: normalizeAddress(address),
      name: name || undefined,
      kind: normalizeParticipantKind(Number(kind)),
      joinedAt: Number(joinedAt),
    }));
  }

  private async readRegion(x: number, y: number, w: number, h: number): Promise<Uint8Array> {
    const raw = (await this.runQuery("Region", [x, y, w, h])) as unknown;
    return bytesFromUnknown(raw);
  }

  private async runQuery(name: string, args: unknown[] = []): Promise<unknown> {
    const roomService = (this.program.services as Record<string, any>).Room;
    const query = roomService.queries[name];
    const payload = asHex(query.encodePayload(...args));
    const reply = await this.api.call.program.calculateReplyForHandle(
      this.address,
      this.programId,
      payload,
      0n,
    );

    return query.decodeResult(reply.payload);
  }

  private async invokeFunction(
    name: string,
    args: unknown[],
    options?: SendOptions,
  ): Promise<unknown> {
    const roomService = (this.program.services as Record<string, any>).Room;
    const fn = roomService.functions[name];
    const payload = asHex(fn.encodePayload(...args));
    const tx = await this.api.createInjectedTransaction({
      destination: this.programId,
      payload,
      value: 0n,
    });
    const receipt = (await tx.sendAndWaitForPromise()) as {
      validateSignature: () => Promise<void>;
    };
    const shouldVerify = options?.verify ?? this.verify;
    if (shouldVerify) {
      await receipt.validateSignature();
    }

    const replyPayload = assertInjectedSuccess(receipt, `${name}()`);
    return replyPayload ? fn.decodeResult(replyPayload) : undefined;
  }
}

export class PollRoom {
  readonly template = "poll" as const;
  readonly programId: Address;
  readonly send: PollRoomSendApi;
  readonly query: PollRoomQueryApi;

  state: PollState;
  seq: number;
  participants: ParticipantProfile[];
  info: RoomInfo;

  private readonly api: VaraEthApi;
  private readonly address: Address;
  private readonly publicClient: PublicClient;
  private readonly signer: ReturnType<typeof walletClientToSigner>;
  private readonly identity: GearbaseIdentity;
  private readonly verify: boolean;
  private readonly pollMs: number;
  private readonly lowFuelThreshold?: bigint;
  private readonly program: ConnectedProgram;
  private readonly listeners: PollListenerMap;
  private pollTimer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;
  private lowFuelActive = false;

  constructor(args: {
    api: VaraEthApi;
    address: Address;
    publicClient: PublicClient;
    signer: ReturnType<typeof walletClientToSigner>;
    identity: GearbaseIdentity;
    verify: boolean;
    pollMs: number;
    lowFuelThreshold?: bigint;
    programId: Address;
    program: ConnectedProgram;
    state: PollState;
    seq: number;
    participants: ParticipantProfile[];
    info: RoomInfo;
  }) {
    this.api = args.api;
    this.address = args.address;
    this.publicClient = args.publicClient;
    this.signer = args.signer;
    this.identity = args.identity;
    this.verify = args.verify;
    this.pollMs = args.pollMs;
    this.lowFuelThreshold = args.lowFuelThreshold;
    this.programId = args.programId;
    this.program = args.program;
    this.state = args.state;
    this.seq = args.seq;
    this.participants = args.participants;
    this.info = args.info;
    this.listeners = {
      update: new Set(),
      join: new Set(),
      leave: new Set(),
      lowFuel: new Set(),
      error: new Set(),
    };

    this.query = {
      Info: () => this.readInfo(),
      Seq: () => this.readSeq(),
      Since: (fromSeq) => this.readSince(fromSeq),
      Snapshot: () => this.readSnapshot(),
      Participants: () => this.readParticipants(),
      Tally: () => this.readTally(),
      Poll: () => this.readPollState(),
    };

    this.send = {
      Join: (args, options) =>
        this.invokeFunction("Join", [args?.name ?? "", participantKindCode(args?.kind)], options),
      Leave: (options) => this.invokeFunction("Leave", [], options),
      Configure: (config, options) =>
        this.invokeFunction("Configure", [Array.from(encodePollConfigBlob(config))], options),
      CloseRoom: (options) => this.invokeFunction("CloseRoom", [], options),
      Vote: ({ option }, options) => this.invokeFunction("Vote", [option], options),
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.handleVisibilityChange);
    }
  }

  on<K extends keyof PollRoomEventHandlers>(
    event: K,
    listener: PollRoomEventHandlers[K],
  ): () => void {
    this.listeners[event].add(listener);
    return () => {
      this.listeners[event].delete(listener);
    };
  }

  start(): void {
    this.schedulePoll(0);
  }

  async leave(): Promise<unknown> {
    return this.send.Leave();
  }

  async close(): Promise<unknown> {
    return this.send.CloseRoom();
  }

  async fuel(): Promise<bigint> {
    return readProgramExecutableBalance(
      this.api,
      this.publicClient,
      this.signer,
      this.programId,
    );
  }

  async sponsor(amountWVara: bigint): Promise<void> {
    await sponsorProgram(
      this.api,
      this.publicClient,
      this.signer,
      this.identity,
      this.programId,
      amountWVara,
    );
    await this.refreshLowFuelStatus();
  }

  dispose(): void {
    this.disposed = true;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = undefined;
    }
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    }
  }

  private readonly handleVisibilityChange = () => {
    if (this.disposed) {
      return;
    }
    if (typeof document !== "undefined" && !document.hidden && !this.pollTimer) {
      this.schedulePoll(0);
    }
  };

  private schedulePoll(delayMs?: number): void {
    if (this.disposed) {
      return;
    }
    if (typeof document !== "undefined" && document.hidden) {
      return;
    }

    const baseDelay = delayMs ?? this.pollMs;
    const jitter = Math.floor(Math.random() * Math.min(75, Math.max(1, this.pollMs / 4)));
    this.pollTimer = setTimeout(() => {
      void this.pollOnce();
    }, baseDelay + jitter);
  }

  private emit<K extends keyof PollRoomEventHandlers>(
    event: K,
    ...args: Parameters<PollRoomEventHandlers[K]>
  ): void {
    for (const listener of this.listeners[event]) {
      (listener as (...items: Parameters<PollRoomEventHandlers[K]>) => void)(...args);
    }
  }

  private async pollOnce(): Promise<void> {
    this.pollTimer = undefined;
    if (this.disposed) {
      return;
    }

    try {
      const nextSeq = await this.readSeq();
      if (nextSeq > this.seq) {
        const since = await this.readSince(this.seq);
        const events = since.events.map((event) => decodePollEvent(event.raw));
        await this.refreshFullState(events);
      }
    } catch (error) {
      this.emit("error", normalizeError(error));
    } finally {
      this.schedulePoll();
    }
  }

  private async refreshFullState(events: PollRoomEvent[]): Promise<void> {
    const previousByAddress = new Map(
      this.participants.map((participant) => [participant.address, participant]),
    );
    const [state, participants, seq, info] = await Promise.all([
      this.readPollState(),
      this.readParticipants(),
      this.readSeq(),
      this.readInfo(),
    ]);

    this.state = state;
    this.participants = participants;
    this.seq = seq;
    this.info = info;
    await this.refreshLowFuelStatus();

    for (const participant of participants) {
      if (!previousByAddress.has(participant.address)) {
        this.emit("join", participant);
      }
    }
    for (const participant of previousByAddress.values()) {
      if (!participants.find((item) => item.address === participant.address)) {
        this.emit("leave", participant);
      }
    }

    this.emit("update", this.state, events);
  }

  private async refreshLowFuelStatus(): Promise<void> {
    if (this.lowFuelThreshold === undefined) {
      return;
    }

    const balance = await this.fuel();
    const isLow = balance <= this.lowFuelThreshold;
    if (isLow && !this.lowFuelActive) {
      this.lowFuelActive = true;
      this.emit("lowFuel", balance);
      return;
    }

    if (!isLow) {
      this.lowFuelActive = false;
    }
  }

  private async readInfo(): Promise<RoomInfo> {
    const raw = (await this.runQuery("Info")) as [string, number, unknown, number, unknown];
    return decodeRoomInfo(raw);
  }

  private async readSeq(): Promise<number> {
    return Number(await this.runQuery("Seq"));
  }

  private async readSince(fromSeq: number): Promise<SinceResult> {
    const raw = (await this.runQuery("Since", [fromSeq])) as [
      number,
      Array<[number, unknown]>,
      boolean,
    ];

    return {
      seq: Number(raw[0]),
      events: raw[1].map(([seq, payload]) => ({
        seq: Number(seq),
        raw: bytesFromUnknown(payload),
      })),
      truncated: Boolean(raw[2]),
    };
  }

  private async readSnapshot(): Promise<Uint8Array> {
    const raw = (await this.runQuery("Snapshot")) as unknown;
    return bytesFromUnknown(raw);
  }

  private async readParticipants(): Promise<ParticipantProfile[]> {
    const raw = (await this.runQuery("Participants")) as Array<[unknown, string, number, number]>;
    return decodeParticipants(raw);
  }

  private async readTally(): Promise<number[]> {
    const raw = (await this.runQuery("Tally")) as number[];
    return raw.map((value) => Number(value));
  }

  private async readPollState(): Promise<PollState> {
    const raw = (await this.runQuery("Poll")) as [
      string,
      string[],
      boolean,
      number,
      Array<[unknown, number]>,
      number[],
    ];

    return {
      config: {
        question: raw[0],
        options: raw[1],
        endsAt: raw[2] ? Number(raw[3]) : undefined,
      },
      votes: raw[4].map(([address, option]) => ({
        address: normalizeAddress(address),
        option: Number(option),
      })),
      tally: raw[5].map((value) => Number(value)),
    };
  }

  private async runQuery(name: string, args: unknown[] = []): Promise<unknown> {
    return runRoomQuery(this.api, this.address, this.programId, this.program, name, args);
  }

  private async invokeFunction(
    name: string,
    args: unknown[],
    options?: SendOptions,
  ): Promise<unknown> {
    const roomService = (this.program.services as Record<string, any>).Room;
    const fn = roomService.functions[name];
    const payload = asHex(fn.encodePayload(...args));
    const tx = await this.api.createInjectedTransaction({
      destination: this.programId,
      payload,
      value: 0n,
    });
    const receipt = (await tx.sendAndWaitForPromise()) as {
      validateSignature: () => Promise<void>;
    };
    const shouldVerify = options?.verify ?? this.verify;
    if (shouldVerify) {
      await receipt.validateSignature();
    }

    const replyPayload = assertInjectedSuccess(receipt, `${name}()`);
    return replyPayload ? fn.decodeResult(replyPayload) : undefined;
  }
}

export class FthRoom {
  readonly template = "fth" as const;
  readonly programId: Address;
  readonly send: FthRoomSendApi;
  readonly query: FthRoomQueryApi;

  state: FthState;
  seq: number;
  participants: ParticipantProfile[];
  info: RoomInfo;

  private readonly api: VaraEthApi;
  private readonly address: Address;
  private readonly publicClient: PublicClient;
  private readonly signer: ReturnType<typeof walletClientToSigner>;
  private readonly identity: GearbaseIdentity;
  private readonly verify: boolean;
  private readonly pollMs: number;
  private readonly lowFuelThreshold?: bigint;
  private readonly program: ConnectedProgram;
  private readonly listeners: FthListenerMap;
  private pollTimer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;
  private lowFuelActive = false;

  constructor(args: {
    api: VaraEthApi;
    address: Address;
    publicClient: PublicClient;
    signer: ReturnType<typeof walletClientToSigner>;
    identity: GearbaseIdentity;
    verify: boolean;
    pollMs: number;
    lowFuelThreshold?: bigint;
    programId: Address;
    program: ConnectedProgram;
    state: FthState;
    seq: number;
    participants: ParticipantProfile[];
    info: RoomInfo;
  }) {
    this.api = args.api;
    this.address = args.address;
    this.publicClient = args.publicClient;
    this.signer = args.signer;
    this.identity = args.identity;
    this.verify = args.verify;
    this.pollMs = args.pollMs;
    this.lowFuelThreshold = args.lowFuelThreshold;
    this.programId = args.programId;
    this.program = args.program;
    this.state = args.state;
    this.seq = args.seq;
    this.participants = args.participants;
    this.info = args.info;
    this.listeners = {
      update: new Set(),
      join: new Set(),
      leave: new Set(),
      lowFuel: new Set(),
      error: new Set(),
    };

    this.query = {
      Info: () => this.readInfo(),
      Seq: () => this.readSeq(),
      Since: (fromSeq) => this.readSince(fromSeq),
      Snapshot: () => this.readSnapshot(),
      Participants: () => this.readParticipants(),
      Game: () => this.readGameState(),
    };

    this.send = {
      Join: (args, options) =>
        this.invokeFunction("Join", [args?.name ?? "", participantKindCode(args?.kind)], options),
      Leave: (options) => this.invokeFunction("Leave", [], options),
      Configure: (config, options) =>
        this.invokeFunction("Configure", [Array.from(encodeFthConfigBlob(config))], options),
      CloseRoom: (options) => this.invokeFunction("CloseRoom", [], options),
      SitDown: ({ seat }, options) => this.invokeFunction("SitDown", [seat], options),
      HostCommit: ({ hash }, options) =>
        this.invokeFunction("HostCommit", [Array.from(hash)], options),
      StartRound: ({ prompt }, options) => this.invokeFunction("StartRound", [prompt], options),
      SubmitAnswer: ({ text }, options) => this.invokeFunction("SubmitAnswer", [text], options),
      OpenVoting: (options) => this.invokeFunction("OpenVoting", [], options),
      CastVote: ({ seat }, options) => this.invokeFunction("CastVote", [seat], options),
      Reveal: ({ seat, salt }, options) =>
        this.invokeFunction("Reveal", [seat, Array.from(salt)], options),
      AbortReveal: (options) => this.invokeFunction("AbortReveal", [], options),
    };

    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", this.handleVisibilityChange);
    }
  }

  on<K extends keyof FthRoomEventHandlers>(
    event: K,
    listener: FthRoomEventHandlers[K],
  ): () => void {
    this.listeners[event].add(listener);
    return () => {
      this.listeners[event].delete(listener);
    };
  }

  start(): void {
    this.schedulePoll(0);
  }

  async leave(): Promise<unknown> {
    return this.send.Leave();
  }

  async close(): Promise<unknown> {
    return this.send.CloseRoom();
  }

  async fuel(): Promise<bigint> {
    return readProgramExecutableBalance(
      this.api,
      this.publicClient,
      this.signer,
      this.programId,
    );
  }

  async sponsor(amountWVara: bigint): Promise<void> {
    await sponsorProgram(
      this.api,
      this.publicClient,
      this.signer,
      this.identity,
      this.programId,
      amountWVara,
    );
    await this.refreshLowFuelStatus();
  }

  dispose(): void {
    this.disposed = true;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = undefined;
    }
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", this.handleVisibilityChange);
    }
  }

  private readonly handleVisibilityChange = () => {
    if (this.disposed) {
      return;
    }
    if (typeof document !== "undefined" && !document.hidden && !this.pollTimer) {
      this.schedulePoll(0);
    }
  };

  private schedulePoll(delayMs?: number): void {
    if (this.disposed) {
      return;
    }
    if (typeof document !== "undefined" && document.hidden) {
      return;
    }

    const baseDelay = delayMs ?? this.pollMs;
    const jitter = Math.floor(Math.random() * Math.min(75, Math.max(1, this.pollMs / 4)));
    this.pollTimer = setTimeout(() => {
      void this.pollOnce();
    }, baseDelay + jitter);
  }

  private emit<K extends keyof FthRoomEventHandlers>(
    event: K,
    ...args: Parameters<FthRoomEventHandlers[K]>
  ): void {
    for (const listener of this.listeners[event]) {
      (listener as (...items: Parameters<FthRoomEventHandlers[K]>) => void)(...args);
    }
  }

  private async pollOnce(): Promise<void> {
    this.pollTimer = undefined;
    if (this.disposed) {
      return;
    }

    try {
      const nextSeq = await this.readSeq();
      if (nextSeq > this.seq) {
        const since = await this.readSince(this.seq);
        const events = since.events.map((event) => decodeFthEvent(event.raw));
        await this.refreshFullState(events);
      }
    } catch (error) {
      this.emit("error", normalizeError(error));
    } finally {
      this.schedulePoll();
    }
  }

  private async refreshFullState(events: FthRoomEvent[]): Promise<void> {
    const previousByAddress = new Map(
      this.participants.map((participant) => [participant.address, participant]),
    );
    const [participants, seq, info, rawState] = await Promise.all([
      this.readParticipants(),
      this.readSeq(),
      this.readInfo(),
      this.runQuery("Game"),
    ]);

    this.state = decodeFthState(
      rawState as [
        [boolean, number, number, number, boolean, unknown, number, number, boolean, number, boolean, number],
        [Array<[number, unknown]>, Array<[number, string]>, Array<[number, number, string]>, Array<[unknown, number]>, number[]],
      ],
      participants,
    );
    this.participants = participants;
    this.seq = seq;
    this.info = info;
    await this.refreshLowFuelStatus();

    for (const participant of participants) {
      if (!previousByAddress.has(participant.address)) {
        this.emit("join", participant);
      }
    }
    for (const participant of previousByAddress.values()) {
      if (!participants.find((item) => item.address === participant.address)) {
        this.emit("leave", participant);
      }
    }

    this.emit("update", this.state, events);
  }

  private async refreshLowFuelStatus(): Promise<void> {
    if (this.lowFuelThreshold === undefined) {
      return;
    }

    const balance = await this.fuel();
    const isLow = balance <= this.lowFuelThreshold;
    if (isLow && !this.lowFuelActive) {
      this.lowFuelActive = true;
      this.emit("lowFuel", balance);
      return;
    }

    if (!isLow) {
      this.lowFuelActive = false;
    }
  }

  private async readInfo(): Promise<RoomInfo> {
    const raw = (await this.runQuery("Info")) as [string, number, unknown, number, unknown];
    return decodeRoomInfo(raw);
  }

  private async readSeq(): Promise<number> {
    return Number(await this.runQuery("Seq"));
  }

  private async readSince(fromSeq: number): Promise<SinceResult> {
    const raw = (await this.runQuery("Since", [fromSeq])) as [
      number,
      Array<[number, unknown]>,
      boolean,
    ];

    return {
      seq: Number(raw[0]),
      events: raw[1].map(([seq, payload]) => ({
        seq: Number(seq),
        raw: bytesFromUnknown(payload),
      })),
      truncated: Boolean(raw[2]),
    };
  }

  private async readSnapshot(): Promise<Uint8Array> {
    const raw = (await this.runQuery("Snapshot")) as unknown;
    return bytesFromUnknown(raw);
  }

  private async readParticipants(): Promise<ParticipantProfile[]> {
    const raw = (await this.runQuery("Participants")) as Array<[unknown, string, number, number]>;
    return decodeParticipants(raw);
  }

  private async readGameState(): Promise<FthState> {
    const participants = await this.readParticipants();
    const raw = (await this.runQuery("Game")) as [
      [boolean, number, number, number, boolean, unknown, number, number, boolean, number, boolean, number],
      [Array<[number, unknown]>, Array<[number, string]>, Array<[number, number, string]>, Array<[unknown, number]>, number[]],
    ];
    return decodeFthState(raw, participants);
  }

  private async runQuery(name: string, args: unknown[] = []): Promise<unknown> {
    return runRoomQuery(this.api, this.address, this.programId, this.program, name, args);
  }

  private async invokeFunction(
    name: string,
    args: unknown[],
    options?: SendOptions,
  ): Promise<unknown> {
    const roomService = (this.program.services as Record<string, any>).Room;
    const fn = roomService.functions[name];
    const payload = asHex(fn.encodePayload(...args));
    const tx = await this.api.createInjectedTransaction({
      destination: this.programId,
      payload,
      value: 0n,
    });
    const receipt = (await tx.sendAndWaitForPromise()) as {
      validateSignature: () => Promise<void>;
    };
    const shouldVerify = options?.verify ?? this.verify;
    if (shouldVerify) {
      await receipt.validateSignature();
    }

    const replyPayload = assertInjectedSuccess(receipt, `${name}()`);
    return replyPayload ? fn.decodeResult(replyPayload) : undefined;
  }
}

export class Gearbase {
  readonly address: Address;

  private readonly session: IdentitySession;
  private readonly pollMs: number;
  private readonly verify: boolean;
  private readonly lowFuelThreshold?: bigint;
  private readonly templateCodeIds: Partial<Record<SupportedRoomTemplate, Hex>>;

  private constructor(session: IdentitySession, options: GearbaseConnectOptions) {
    this.session = session;
    this.address = session.address;
    this.pollMs = options.pollMs ?? 400;
    this.verify = options.verify ?? false;
    this.lowFuelThreshold = options.lowFuelThreshold;
    this.templateCodeIds = options.templateCodeIds ?? {};
  }

  static async connect(options: GearbaseConnectOptions): Promise<Gearbase> {
    const session = await connectIdentity(options);
    return new Gearbase(session, options);
  }

  async join(programId: Address): Promise<CanvasRoom | PollRoom | FthRoom> {
    return this.open(programId);
  }

  async create(
    template: "canvas",
    config: CanvasConfig,
    options?: CreateRoomOptions,
  ): Promise<CanvasRoom>;
  async create(
    template: "poll",
    config: PollConfig,
    options?: CreateRoomOptions,
  ): Promise<PollRoom>;
  async create(
    template: "fth",
    config: FthConfig,
    options?: CreateRoomOptions,
  ): Promise<FthRoom>;
  async create(
    template: SupportedRoomTemplate,
    config: CanvasConfig | PollConfig | FthConfig,
    options: CreateRoomOptions = {},
  ): Promise<CanvasRoom | PollRoom | FthRoom> {
    assertWritableIdentity(this.session.identity, "create()");
    const codeId = options.codeId ?? this.templateCodeIds[template];
    if (!codeId) {
      throw new Error(`No codeId configured for template ${template}`);
    }

    const program = await loadRoomProgramByTemplateName(template);
    const createPayload = encodeCreatePayload(template, program, config);
    const builder = this.session.api.eth.router.createProgramBuilder(codeId);

    if (options.salt) {
      builder.withSalt(options.salt);
    }
    if (options.overrideInitializer) {
      builder.withOverrideInitializer(options.overrideInitializer);
    }
    if (options.sponsorWVara && options.sponsorWVara > 0n) {
      const deadline = BigInt(Date.now() + 5 * 60_000);
      const { signature } = await this.session.api.eth.wvara.prepareAndSignPermitData(
        this.session.api.eth.router.address,
        options.sponsorWVara,
        deadline,
      );
      builder.withExecutableBalance(options.sponsorWVara, deadline, signature);
    }

    const createTx = builder.build();
    await createTx.sendAndWaitForReceipt();
    const programId = (await createTx.getProgramId()) as Address;
    const mirror = getMirrorClient({
      address: programId,
      publicClient: this.session.publicClient,
      signer: this.session.signer,
    });
    const initTx = await mirror.sendMessage(createPayload, 0n);
    await initTx.send();
    const { waitForReply } = await initTx.setupReplyListener();
    const initReply = await waitForReply();
    assertSuccessReplyCode(initReply.replyCode, `initialize ${template} room`);

    return this.open(programId);
  }

  async joinCanvas(programId: Address): Promise<CanvasRoom> {
    const { info, seq, participants } = await bootstrapBaseRoomState(
      this.session.api,
      this.address,
      programId,
      "canvas",
    );
    if (info.template !== "canvas") {
      throw new Error(`Expected canvas room, received ${info.template}`);
    }

    const program = await loadRoomProgramByTemplateName("canvas", programId);
    const snapshot = await runRoomQuery(
      this.session.api,
      this.address,
      programId,
      program,
      "Snapshot",
    );
    const room = new CanvasRoom({
      api: this.session.api,
      address: this.address,
      publicClient: this.session.publicClient,
      signer: this.session.signer,
      identity: this.session.identity,
      verify: this.verify,
      pollMs: this.pollMs,
      lowFuelThreshold: this.lowFuelThreshold,
      programId,
      program,
      state: decodeCanvasSnapshot(bytesFromUnknown(snapshot)),
      seq,
      participants,
      info,
    });

    room.start();
    return room;
  }

  async joinPoll(programId: Address): Promise<PollRoom> {
    const { info, seq, participants } = await bootstrapBaseRoomState(
      this.session.api,
      this.address,
      programId,
      "poll",
    );
    if (info.template !== "poll") {
      throw new Error(`Expected poll room, received ${info.template}`);
    }

    const program = await loadRoomProgramByTemplateName("poll", programId);
    const pollState = (await runRoomQuery(
      this.session.api,
      this.address,
      programId,
      program,
      "Poll",
    )) as [string, string[], boolean, number, Array<[unknown, number]>, number[]];

    const room = new PollRoom({
      api: this.session.api,
      address: this.address,
      publicClient: this.session.publicClient,
      signer: this.session.signer,
      identity: this.session.identity,
      verify: this.verify,
      pollMs: this.pollMs,
      lowFuelThreshold: this.lowFuelThreshold,
      programId,
      program,
      state: {
        config: {
          question: pollState[0],
          options: pollState[1],
          endsAt: pollState[2] ? Number(pollState[3]) : undefined,
        },
        votes: pollState[4].map(([address, option]) => ({
          address: normalizeAddress(address),
          option: Number(option),
        })),
        tally: pollState[5].map((value) => Number(value)),
      },
      seq,
      participants,
      info,
    });

    room.start();
    return room;
  }

  async joinFth(programId: Address): Promise<FthRoom> {
    const { info, seq, participants } = await bootstrapBaseRoomState(
      this.session.api,
      this.address,
      programId,
      "fth",
    );
    if (info.template !== "fth") {
      throw new Error(`Expected fth room, received ${info.template}`);
    }

    const program = await loadRoomProgramByTemplateName("fth", programId);
    const gameState = (await runRoomQuery(
      this.session.api,
      this.address,
      programId,
      program,
      "Game",
    )) as [
      [boolean, number, number, number, boolean, unknown, number, number, boolean, number, boolean, number],
      [Array<[number, unknown]>, Array<[number, string]>, Array<[number, number, string]>, Array<[unknown, number]>, number[]],
    ];

    const room = new FthRoom({
      api: this.session.api,
      address: this.address,
      publicClient: this.session.publicClient,
      signer: this.session.signer,
      identity: this.session.identity,
      verify: this.verify,
      pollMs: this.pollMs,
      lowFuelThreshold: this.lowFuelThreshold,
      programId,
      program,
      state: decodeFthState(gameState, participants),
      seq,
      participants,
      info,
    });

    room.start();
    return room;
  }

  async open(programId: Address): Promise<CanvasRoom | PollRoom | FthRoom> {
    const { info } = await bootstrapBaseRoomState(this.session.api, this.address, programId);
    if (!isSupportedRoomTemplate(info.template)) {
      throw new Error(`Unsupported Gearbase room template: ${info.template}`);
    }

    switch (info.template) {
      case "canvas":
        return this.joinCanvas(programId);
      case "poll":
        return this.joinPoll(programId);
      case "fth":
        return this.joinFth(programId);
      default:
        throw new Error(`Unsupported Gearbase room template: ${info.template}`);
    }
  }

  async disconnect(): Promise<void> {
    await this.session.provider.disconnect();
  }
}

export type {
  Address,
  SupportedRoomTemplate,
};
