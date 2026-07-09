import { TypeRegistry } from "@polkadot/types";
import {
  WsVaraEthProvider,
  createVaraEthApi,
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

type RoomEventHandlers = {
  update: (state: CanvasState, events: CanvasRoomEvent[]) => void;
  join: (participant: ParticipantProfile) => void;
  leave: (participant: ParticipantProfile) => void;
  error: (error: Error) => void;
};

type ListenerMap = {
  [K in keyof RoomEventHandlers]: Set<RoomEventHandlers[K]>;
};

type IdentitySession = {
  address: Address;
  api: VaraEthApi;
  provider: WsVaraEthProvider;
  publicClient: PublicClient;
  walletClient: WalletClient;
  identity: GearbaseIdentity;
};

type ConnectedProgram = Awaited<ReturnType<typeof loadRoomProgram>>;

const HOODI_DEFAULTS = {
  ethereumRpc: "https://hoodi-reth-rpc.gear-tech.io",
  varaEthRpc: "wss://vara-eth-validator-1.gear-tech.io",
  routerAddress: "0xE549b0AfEdA978271FF7E712232B9F7f39A0b060" as Address,
} as const;

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

function normalizeParticipantKind(value: number): ParticipantKind {
  switch (value) {
    case 1:
      return "human";
    case 2:
      return "agent";
    default:
      return "unknown";
  }
}

function participantKindCode(kind: ParticipantKind | undefined): number {
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

function resolveNetworkConfig(options: GearbaseConnectOptions) {
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
    identity,
  };
}

function decodeCanvasConfigBlob(configBlob: Uint8Array): CanvasConfig {
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

function encodeCanvasConfigBlob(config: CanvasConfig): Uint8Array {
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

function decodeCanvasSnapshot(snapshot: Uint8Array): CanvasState {
  const registry = new TypeRegistry();
  const decoded = registry
    .createType("((u16,u16,u16,u16), Vec<u8>)", asHex(snapshot))
    .toJSON() as [[number, number, number, number], number[]];

  return {
    config: {
      width: Number(decoded[0][0]),
      height: Number(decoded[0][1]),
      paletteSize: Number(decoded[0][2]),
      cooldownSecs: Number(decoded[0][3]),
    },
    pixels: Uint8Array.from(decoded[1].map((value) => Number(value))),
  };
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

function applyCanvasEvent(state: CanvasState, event: CanvasRoomEvent): CanvasState {
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

function extractReplyPayload(result: unknown): Hex | undefined {
  if (!result || typeof result !== "object") {
    return undefined;
  }

  const payload =
    "payload" in result && typeof result.payload === "string"
      ? result.payload
      : "reply" in result &&
          result.reply &&
          typeof result.reply === "object" &&
          "payload" in result.reply &&
          typeof result.reply.payload === "string"
        ? result.reply.payload
        : undefined;

  return payload as Hex | undefined;
}

export class CanvasRoom {
  readonly programId: Address;
  readonly send: CanvasRoomSendApi;
  readonly query: CanvasRoomQueryApi;

  state: CanvasState;
  seq: number;
  participants: ParticipantProfile[];
  info: RoomInfo;

  private readonly api: VaraEthApi;
  private readonly address: Address;
  private readonly verify: boolean;
  private readonly pollMs: number;
  private readonly program: ConnectedProgram;
  private readonly listeners: ListenerMap;
  private pollTimer: ReturnType<typeof setTimeout> | undefined;
  private disposed = false;

  constructor(args: {
    api: VaraEthApi;
    address: Address;
    verify: boolean;
    pollMs: number;
    programId: Address;
    program: ConnectedProgram;
    state: CanvasState;
    seq: number;
    participants: ParticipantProfile[];
    info: RoomInfo;
  }) {
    this.api = args.api;
    this.address = args.address;
    this.verify = args.verify;
    this.pollMs = args.pollMs;
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
    this.emit("update", this.state, events);
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
    const promise = (await tx.sendAndWaitForPromise()) as {
      validateSignature: () => Promise<void>;
      code?: { isError?: boolean; reason?: string };
      payload?: Hex;
      reply?: { payload?: Hex };
    };
    const shouldVerify = options?.verify ?? this.verify;
    if (shouldVerify) {
      await promise.validateSignature();
    }
    if (promise.code?.isError) {
      throw new Error(`Injected transaction failed with ${promise.code.reason ?? "unknown"}`);
    }

    const replyPayload = extractReplyPayload(promise);
    return replyPayload ? fn.decodeResult(replyPayload) : undefined;
  }
}

export class Gearbase {
  readonly address: Address;

  private readonly session: IdentitySession;
  private readonly pollMs: number;
  private readonly verify: boolean;

  private constructor(session: IdentitySession, options: GearbaseConnectOptions) {
    this.session = session;
    this.address = session.address;
    this.pollMs = options.pollMs ?? 400;
    this.verify = options.verify ?? false;
  }

  static async connect(options: GearbaseConnectOptions): Promise<Gearbase> {
    const session = await connectIdentity(options);
    return new Gearbase(session, options);
  }

  async join(programId: Address): Promise<CanvasRoom> {
    const bootstrapProgram = await loadRoomProgram("canvas", programId);
    const bootstrapRoom = new CanvasRoom({
      api: this.session.api,
      address: this.address,
      verify: this.verify,
      pollMs: this.pollMs,
      programId,
      program: bootstrapProgram,
      state: {
        config: {
          width: 0,
          height: 0,
          paletteSize: 0,
          cooldownSecs: 0,
        },
        pixels: new Uint8Array(),
      },
      seq: 0,
      participants: [],
      info: {
        template: "canvas",
        version: 0,
        owner: "0x0000000000000000000000000000000000000000000000000000000000000000",
        createdAt: 0,
        configBlob: new Uint8Array(),
      },
    });

    const info = await bootstrapRoom.query.Info();
    const template = info.template;
    if (!isSupportedRoomTemplate(template)) {
      bootstrapRoom.dispose();
      throw new Error(`Unsupported Gearbase room template: ${template}`);
    }

    const program = await loadRoomProgramByTemplateName(template, programId);
    const state = await bootstrapRoom.query.Snapshot();
    const seq = await bootstrapRoom.query.Seq();
    const participants = await bootstrapRoom.query.Participants();
    const room = new CanvasRoom({
      api: this.session.api,
      address: this.address,
      verify: this.verify,
      pollMs: this.pollMs,
      programId,
      program,
      state,
      seq,
      participants,
      info,
    });

    room.start();
    bootstrapRoom.dispose();
    return room;
  }

  async disconnect(): Promise<void> {
    await this.session.provider.disconnect();
  }
}

export type {
  Address,
  SupportedRoomTemplate,
};
