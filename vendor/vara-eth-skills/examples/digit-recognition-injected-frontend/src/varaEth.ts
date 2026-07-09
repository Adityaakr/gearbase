import { TypeRegistry } from "@polkadot/types";
import {
  createVaraEthApi,
  type VaraEthApi,
  WsVaraEthProvider,
} from "@vara-eth/api";
import { walletClientToSigner } from "@vara-eth/api/signer";
import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  type Address,
  type Hex,
} from "viem";

export type VaraEthSession = {
  address: Address;
  api: VaraEthApi;
  provider: WsVaraEthProvider;
};

export type DigitPrediction = {
  digit: number;
  raw: number;
  probability: number;
};

export type InjectedPredictionResult = {
  messageId: Hex;
  txHash: Hex;
  replyCode: string;
};

export type AppConfig = {
  ethereumRpc?: string;
  varaEthRpc?: `ws://${string}` | `wss://${string}`;
  routerAddress?: Address;
  programId?: Address;
  missing: string[];
};

const SERVICE = "DigitRecognition";
const METHOD_PREDICT = "Predict";
const QUERY_RESULT = "Result";
const WEIGHT_SCALE = 6;

function envValue(name: string): string | undefined {
  const value = import.meta.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function requireConfigValue(name: string): string {
  const value = envValue(name);
  if (!value) throw new Error(`Missing ${name}`);
  return value;
}

export function readConfig(): AppConfig {
  const ethereumRpc = envValue("VITE_ETHEREUM_RPC");
  const varaEthRpc = envValue("VITE_VARA_ETH_RPC");
  const routerAddress = envValue("VITE_ROUTER_ADDRESS");
  const programId = envValue("VITE_PROGRAM_ID");
  const entries: Array<[string, string | undefined]> = [
    ["VITE_ETHEREUM_RPC", ethereumRpc],
    ["VITE_VARA_ETH_RPC", varaEthRpc],
    ["VITE_ROUTER_ADDRESS", routerAddress],
    ["VITE_PROGRAM_ID", programId],
  ];
  const missing = entries
    .filter(([, value]) => !value)
    .map(([name]) => name);

  return {
    ethereumRpc,
    varaEthRpc: varaEthRpc as AppConfig["varaEthRpc"],
    routerAddress: routerAddress as Address | undefined,
    programId: programId as Address | undefined,
    missing,
  };
}

export function getConfig(): Required<Omit<AppConfig, "missing">> {
  return {
    ethereumRpc: requireConfigValue("VITE_ETHEREUM_RPC"),
    varaEthRpc: requireConfigValue("VITE_VARA_ETH_RPC") as
      | `ws://${string}`
      | `wss://${string}`,
    routerAddress: requireConfigValue("VITE_ROUTER_ADDRESS") as Address,
    programId: requireConfigValue("VITE_PROGRAM_ID") as Address,
  };
}

function registry() {
  return new TypeRegistry();
}

export function encodePredictPayload(pixels: number[]): Hex {
  if (pixels.length !== 784) {
    throw new Error(`Expected 784 pixels, received ${pixels.length}`);
  }

  for (const [index, pixel] of pixels.entries()) {
    if (!Number.isInteger(pixel) || pixel < 0 || pixel > 255) {
      throw new Error(`Bad pixel ${index}: ${pixel}`);
    }
  }

  return registry()
    .createType("(String, String, Vec<u16>)", [
      SERVICE,
      METHOD_PREDICT,
      pixels,
    ])
    .toHex() as Hex;
}

export function encodeResultQueryPayload(): Hex {
  return registry()
    .createType("(String, String)", [SERVICE, QUERY_RESULT])
    .toHex() as Hex;
}

export function decodeResultPayload(payload: Hex): number[] {
  const decoded = registry()
    .createType("(String, String, Vec<i32>)", payload)
    .toJSON() as [string, string, number[]];

  return decoded[2].map(Number);
}

export async function connectVaraEth(): Promise<VaraEthSession> {
  const config = getConfig();
  const injectedWallet = window.ethereum;
  if (!injectedWallet) {
    throw new Error("No EIP-1193 wallet found in this browser");
  }

  const [address] = await injectedWallet.request<Address[]>({
    method: "eth_requestAccounts",
  });
  if (!address) throw new Error("Wallet did not return an account");

  const publicClient = createPublicClient({
    transport: http(config.ethereumRpc),
  });
  const walletClient = createWalletClient({
    account: address,
    transport: custom(injectedWallet),
  });

  const provider = new WsVaraEthProvider(config.varaEthRpc);
  await provider.connect();
  const signer = walletClientToSigner(walletClient);
  const api = await createVaraEthApi(
    provider,
    publicClient,
    config.routerAddress,
    signer,
  );

  return {
    address,
    api,
    provider,
  };
}

export async function sendInjectedPrediction(
  session: VaraEthSession,
  pixels: number[],
): Promise<InjectedPredictionResult> {
  const payload = encodePredictPayload(pixels);
  const tx = await session.api.createInjectedTransaction({
    destination: getConfig().programId,
    payload,
    value: 0n,
  });

  const messageId = tx.messageId as Hex;
  const promise = await tx.sendAndWaitForPromise();
  await promise.validateSignature();

  if (promise.code.isError) {
    throw new Error(`Injected transaction failed with ${promise.code.reason}`);
  }

  return {
    messageId,
    txHash: promise.txHash as Hex,
    replyCode: promise.code.reason,
  };
}

export async function readDigitResult(
  session: VaraEthSession,
): Promise<DigitPrediction[]> {
  const reply = await session.api.call.program.calculateReplyForHandle(
    session.address,
    getConfig().programId,
    encodeResultQueryPayload(),
    0n,
  );
  const raw = decodeResultPayload(reply.payload as Hex);
  const denominator = 10 ** WEIGHT_SCALE;

  return raw.map((value, digit) => ({
    digit,
    raw: value,
    probability: value / denominator,
  }));
}

export function bestDigit(predictions: DigitPrediction[]): DigitPrediction | null {
  if (predictions.length === 0) return null;
  return predictions.reduce((best, item) =>
    item.probability > best.probability ? item : best,
  );
}
