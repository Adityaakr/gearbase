import {
  createVaraEthApi,
  type VaraEthApi,
  WsVaraEthProvider,
} from "@vara-eth/api";
import {
  createPublicClient,
  createWalletClient,
  custom,
  defineChain,
  formatEther,
  http,
  isAddress,
  parseAbi,
  parseEther,
  parseEventLogs,
  type Address,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
  type WalletClient,
} from "viem";

const HOODI_CHAIN_ID = 560_048;
const HOODI_CHAIN_ID_HEX = "0x88bb0";
const MAX_U128 = (1n << 128n) - 1n;
const STATUS_OF_QUERY_PREFIX = "0x474d0110e26dcf35c3a2f1b507000100";

function hoodiChain(rpcUrl: string) {
  return defineChain({
    id: HOODI_CHAIN_ID,
    name: "Hoodi",
    nativeCurrency: {
      decimals: 18,
      name: "Ether",
      symbol: "ETH",
    },
    rpcUrls: {
      default: { http: [rpcUrl] },
    },
    blockExplorers: {
      default: {
        name: "Hoodi Etherscan",
        url: "https://hoodi.etherscan.io",
      },
    },
  });
}

export const escrowAbi = parseAbi([
  "function VARA_ETH_PROGRAM() view returns (address)",
  "function nextLocalOrderId() view returns (uint128)",
  "function claimable(address) view returns (uint128)",
  "function orders(uint128) view returns (address buyer, address seller, uint128 amount, uint128 varaEthOrderId, bool createdOnVaraEth, bool closed, bool failed)",
  "function createOrder(address seller) payable returns (uint128 localOrderId)",
  "function release(uint128 localOrderId)",
  "function refund(uint128 localOrderId)",
  "function cancel(uint128 localOrderId)",
  "function claim()",
  "error UnauthorizedCaller()",
  "error ZeroValue()",
  "error ValueTooLarge()",
  "error InvalidSeller()",
  "error OrderDoesNotExist()",
  "error OrderIsClosed()",
  "error OrderIsNotCreatedOnVaraEth()",
  "error OnlyBuyer()",
  "error OnlySeller()",
  "error TransferFailed()",
  "error UnknownMessage(bytes32 messageId)",
  "event OrderCreateRequested(bytes32 indexed messageId, uint128 indexed localOrderId, address indexed buyer, address seller, uint128 amount)",
  "event OrderCreatedOnVaraEth(bytes32 indexed messageId, uint128 indexed localOrderId, uint128 varaEthOrderId)",
  "event OrderReleaseRequested(bytes32 indexed messageId, uint128 indexed localOrderId)",
  "event OrderReleased(bytes32 indexed messageId, uint128 indexed localOrderId, address indexed seller, uint128 amount)",
  "event OrderRefundRequested(bytes32 indexed messageId, uint128 indexed localOrderId)",
  "event OrderRefunded(bytes32 indexed messageId, uint128 indexed localOrderId, address indexed buyer, uint128 amount)",
  "event OrderCancelRequested(bytes32 indexed messageId, uint128 indexed localOrderId)",
  "event OrderCancelled(bytes32 indexed messageId, uint128 indexed localOrderId, address indexed buyer, uint128 amount)",
  "event OperationFailed(bytes32 indexed messageId, uint128 indexed localOrderId, bytes4 replyCode)",
  "event Claimed(address indexed recipient, uint128 amount)",
]);

export type AppConfig = {
  ethereumRpc?: string;
  varaEthRpc?: `ws://${string}` | `wss://${string}`;
  routerAddress?: Address;
  adapterAddress?: Address;
  missing: string[];
};

export type EscrowSession = {
  account: Address;
  adapterAddress: Address;
  varaEthApi: VaraEthApi;
  varaEthProvider: WsVaraEthProvider;
  publicClient: PublicClient;
  walletClient: WalletClient;
  chainId: number;
  walletChainId?: string;
};

export type LocalOrder = {
  id: bigint;
  buyer: Address;
  seller: Address;
  amount: bigint;
  varaEthOrderId: bigint;
  createdOnVaraEth: boolean;
  closed: boolean;
  failed: boolean;
};

export type AdapterSnapshot = {
  nextLocalOrderId: bigint;
  varaEthProgram: Address;
  claimable: bigint;
};

export type VaraEthOrderStatus = {
  status: number;
  label: string;
};

export type TxOutcome = {
  hash: Hex;
  receipt: TransactionReceipt;
  messageId?: Hex;
  localOrderId?: bigint;
};

function envValue(name: string): string | undefined {
  const value = import.meta.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function readConfig(): AppConfig {
  const ethereumRpc = envValue("VITE_ETHEREUM_RPC");
  const varaEthRpc = envValue("VITE_VARA_ETH_RPC");
  const routerAddress = envValue("VITE_ROUTER_ADDRESS");
  const adapterAddress = envValue("VITE_ESCROW_ADAPTER_ADDRESS");
  const entries: Array<[string, string | undefined]> = [
    ["VITE_ETHEREUM_RPC", ethereumRpc],
    ["VITE_VARA_ETH_RPC", varaEthRpc],
    ["VITE_ROUTER_ADDRESS", routerAddress],
    ["VITE_ESCROW_ADAPTER_ADDRESS", adapterAddress],
  ];

  return {
    ethereumRpc,
    varaEthRpc: varaEthRpc as AppConfig["varaEthRpc"],
    routerAddress: routerAddress as Address | undefined,
    adapterAddress: adapterAddress as Address | undefined,
    missing: entries.filter(([, value]) => !value).map(([name]) => name),
  };
}

export function getConfig(): Required<Omit<AppConfig, "missing">> {
  const config = readConfig();
  if (!config.ethereumRpc) throw new Error("Missing VITE_ETHEREUM_RPC");
  if (!config.varaEthRpc) throw new Error("Missing VITE_VARA_ETH_RPC");
  if (!config.routerAddress) throw new Error("Missing VITE_ROUTER_ADDRESS");
  if (!config.adapterAddress) {
    throw new Error("Missing VITE_ESCROW_ADAPTER_ADDRESS");
  }

  return {
    ethereumRpc: config.ethereumRpc,
    varaEthRpc: config.varaEthRpc,
    routerAddress: config.routerAddress,
    adapterAddress: config.adapterAddress,
  };
}

export function formatEth(value: bigint): string {
  const formatted = formatEther(value);
  const [whole, fraction = ""] = formatted.split(".");
  const trimmedFraction = fraction.slice(0, 6).replace(/0+$/, "");
  return trimmedFraction ? `${whole}.${trimmedFraction} ETH` : `${whole} ETH`;
}

export function compactAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

async function ensureHoodiWalletChain(
  wallet: NonNullable<typeof window.ethereum>,
  rpcUrl: string,
) {
  const currentChainId = await wallet
    .request({ method: "eth_chainId" })
    .catch(() => undefined);

  if (currentChainId === HOODI_CHAIN_ID_HEX) return currentChainId;

  try {
    await wallet.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: HOODI_CHAIN_ID_HEX }],
    });
  } catch (err) {
    const code = typeof err === "object" && err && "code" in err ? err.code : undefined;
    if (code !== 4902) throw err;

    await wallet.request({
      method: "wallet_addEthereumChain",
      params: [
        {
          chainId: HOODI_CHAIN_ID_HEX,
          chainName: "Hoodi",
          nativeCurrency: {
            decimals: 18,
            name: "Ether",
            symbol: "ETH",
          },
          rpcUrls: [rpcUrl],
          blockExplorerUrls: ["https://hoodi.etherscan.io"],
        },
      ],
    });
  }

  return wallet.request({ method: "eth_chainId" }).catch(() => undefined);
}

export async function connectEscrow(): Promise<EscrowSession> {
  const config = getConfig();
  const wallet = window.ethereum;
  if (!wallet) throw new Error("No EIP-1193 wallet found");

  const [account] = await wallet.request({ method: "eth_requestAccounts" }) as Address[];
  if (!account) throw new Error("Wallet did not return an account");

  const chain = hoodiChain(config.ethereumRpc);
  const walletChainId = await ensureHoodiWalletChain(wallet, config.ethereumRpc);
  const publicClient = createPublicClient({
    chain,
    transport: http(config.ethereumRpc),
  });
  const walletClient = createWalletClient({
    account,
    chain,
    transport: custom(wallet),
  });
  const varaEthProvider = new WsVaraEthProvider(config.varaEthRpc);
  await varaEthProvider.connect();
  const varaEthApi = await createVaraEthApi(
    varaEthProvider,
    publicClient,
    config.routerAddress,
  );

  const chainId = await publicClient.getChainId();

  return {
    account,
    adapterAddress: config.adapterAddress,
    varaEthApi,
    varaEthProvider,
    publicClient,
    walletClient,
    chainId,
    walletChainId: typeof walletChainId === "string" ? walletChainId : undefined,
  };
}

const VARA_ETH_STATUS_LABELS: Record<number, string> = {
  1: "Created",
  2: "Released",
  3: "Refunded",
  4: "Cancelled",
};

function u128ToLittleEndianHex(value: bigint): string {
  if (value < 0n || value > MAX_U128) {
    throw new Error("Vara.eth order id must fit into u128");
  }

  let remaining = value;
  let hex = "";
  for (let index = 0; index < 16; index += 1) {
    hex += Number(remaining & 0xffn).toString(16).padStart(2, "0");
    remaining >>= 8n;
  }

  return hex;
}

function encodeStatusOfPayload(varaEthOrderId: bigint): Hex {
  return `${STATUS_OF_QUERY_PREFIX}${u128ToLittleEndianHex(varaEthOrderId)}` as Hex;
}

function decodeStatusOfReply(payload: Hex): number {
  const body = payload.slice(2);
  if (body.length < 8) {
    throw new Error("Vara.eth StatusOf reply is too short");
  }

  const valueHex = body.slice(-8);
  const bytes = valueHex.match(/../g);
  if (!bytes) {
    throw new Error("Vara.eth StatusOf reply is malformed");
  }

  return Number(BigInt(`0x${bytes.reverse().join("")}`));
}

export async function readVaraEthOrderStatus(
  session: EscrowSession,
  programId: Address,
  varaEthOrderId: bigint,
): Promise<VaraEthOrderStatus | null> {
  if (varaEthOrderId === 0n) return null;

  const payload = encodeStatusOfPayload(varaEthOrderId);
  const reply = await session.varaEthApi.call.program.calculateReplyForHandle(
    session.account,
    programId,
    payload,
    0n,
  );
  if (reply.code.isError) {
    throw new Error(`Vara.eth StatusOf failed with ${reply.code.reason}`);
  }
  const status = decodeStatusOfReply(reply.payload);

  return {
    status,
    label: VARA_ETH_STATUS_LABELS[status] ?? `Unknown (${status})`,
  };
}

export async function readAdapterSnapshot(
  session: EscrowSession,
): Promise<AdapterSnapshot> {
  const [nextLocalOrderId, varaEthProgram, claimable] = await Promise.all([
    session.publicClient.readContract({
      address: session.adapterAddress,
      abi: escrowAbi,
      functionName: "nextLocalOrderId",
    }),
    session.publicClient.readContract({
      address: session.adapterAddress,
      abi: escrowAbi,
      functionName: "VARA_ETH_PROGRAM",
    }),
    session.publicClient.readContract({
      address: session.adapterAddress,
      abi: escrowAbi,
      functionName: "claimable",
      args: [session.account],
    }),
  ]);

  return {
    nextLocalOrderId,
    varaEthProgram,
    claimable,
  };
}

export async function readOrder(
  session: EscrowSession,
  localOrderId: bigint,
): Promise<LocalOrder> {
  const order = await session.publicClient.readContract({
    address: session.adapterAddress,
    abi: escrowAbi,
    functionName: "orders",
    args: [localOrderId],
  });

  return {
    id: localOrderId,
    buyer: order[0],
    seller: order[1],
    amount: order[2],
    varaEthOrderId: order[3],
    createdOnVaraEth: order[4],
    closed: order[5],
    failed: order[6],
  };
}

export async function readOrders(
  session: EscrowSession,
  nextLocalOrderId: bigint,
): Promise<LocalOrder[]> {
  const orderCount = nextLocalOrderId > 0n ? nextLocalOrderId - 1n : 0n;
  if (orderCount === 0n) return [];
  if (orderCount > 100n) {
    throw new Error("Order list is too large for this example frontend");
  }

  return Promise.all(
    Array.from({ length: Number(orderCount) }, (_, index) =>
      readOrder(session, BigInt(index + 1)),
    ),
  );
}

function firstEventArg(
  receipt: TransactionReceipt,
  eventName:
    | "OrderCreateRequested"
    | "OrderReleaseRequested"
    | "OrderRefundRequested"
    | "OrderCancelRequested",
): { messageId?: Hex; localOrderId?: bigint } {
  const logs = parseEventLogs({
    abi: escrowAbi,
    eventName,
    logs: receipt.logs,
  });

  const args = logs[0]?.args;
  if (!args) return {};

  return {
    messageId: args.messageId as Hex | undefined,
    localOrderId: args.localOrderId as bigint | undefined,
  };
}

async function sendAdapterWrite(
  session: EscrowSession,
  request: unknown,
): Promise<TransactionReceipt & { hash: Hex }> {
  const hash = await session.walletClient.writeContract(
    request as Parameters<typeof session.walletClient.writeContract>[0],
  );
  const receipt = await session.publicClient.waitForTransactionReceipt({ hash });
  return Object.assign(receipt, { hash });
}

export async function createOrder(
  session: EscrowSession,
  seller: string,
  amountEth: string,
): Promise<TxOutcome> {
  const normalizedSeller = seller.trim();
  if (!isAddress(normalizedSeller)) {
    throw new Error("Seller must be a valid Ethereum address");
  }
  if (normalizedSeller.toLowerCase() === session.account.toLowerCase()) {
    throw new Error("Seller must be different from the connected buyer account");
  }

  const value = parseEther(amountEth);
  if (value === 0n) {
    throw new Error("Order amount must be greater than zero");
  }

  const { request } = await session.publicClient.simulateContract({
    account: session.account,
    address: session.adapterAddress,
    abi: escrowAbi,
    functionName: "createOrder",
    args: [normalizedSeller],
    value,
  });
  const receipt = await sendAdapterWrite(session, request);
  const event = firstEventArg(receipt, "OrderCreateRequested");

  return {
    hash: receipt.hash,
    receipt,
    messageId: event.messageId,
    localOrderId: event.localOrderId,
  };
}

export async function releaseOrder(
  session: EscrowSession,
  localOrderId: bigint,
): Promise<TxOutcome> {
  const { request } = await session.publicClient.simulateContract({
    account: session.account,
    address: session.adapterAddress,
    abi: escrowAbi,
    functionName: "release",
    args: [localOrderId],
  });
  const receipt = await sendAdapterWrite(session, request);
  const event = firstEventArg(receipt, "OrderReleaseRequested");

  return {
    hash: receipt.hash,
    receipt,
    messageId: event.messageId,
    localOrderId: event.localOrderId,
  };
}

export async function refundOrder(
  session: EscrowSession,
  localOrderId: bigint,
): Promise<TxOutcome> {
  const { request } = await session.publicClient.simulateContract({
    account: session.account,
    address: session.adapterAddress,
    abi: escrowAbi,
    functionName: "refund",
    args: [localOrderId],
  });
  const receipt = await sendAdapterWrite(session, request);
  const event = firstEventArg(receipt, "OrderRefundRequested");

  return {
    hash: receipt.hash,
    receipt,
    messageId: event.messageId,
    localOrderId: event.localOrderId,
  };
}

export async function cancelOrder(
  session: EscrowSession,
  localOrderId: bigint,
): Promise<TxOutcome> {
  const { request } = await session.publicClient.simulateContract({
    account: session.account,
    address: session.adapterAddress,
    abi: escrowAbi,
    functionName: "cancel",
    args: [localOrderId],
  });
  const receipt = await sendAdapterWrite(session, request);
  const event = firstEventArg(receipt, "OrderCancelRequested");

  return {
    hash: receipt.hash,
    receipt,
    messageId: event.messageId,
    localOrderId: event.localOrderId,
  };
}

export async function claim(session: EscrowSession): Promise<TxOutcome> {
  const { request } = await session.publicClient.simulateContract({
    account: session.account,
    address: session.adapterAddress,
    abi: escrowAbi,
    functionName: "claim",
  });
  const receipt = await sendAdapterWrite(session, request);

  return {
    hash: receipt.hash,
    receipt,
  };
}
