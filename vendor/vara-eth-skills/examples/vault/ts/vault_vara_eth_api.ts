import { readFile } from "node:fs/promises";
import { WsVaraEthProvider, createVaraEthApi, getMirrorClient } from "@vara-eth/api";
import { walletClientToSigner } from "@vara-eth/api/signer";
import { SailsProgram } from "sails-js";
import { SailsIdlParser } from "sails-js/parser";
import { createPublicClient, createWalletClient, http, toHex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

type Hex = `0x${string}`;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`missing ${name}`);
  }
  return value;
}

function asHex(payload: string | Uint8Array): Hex {
  return (typeof payload === "string" ? payload : toHex(payload)) as Hex;
}

function describeReplyCode(replyCode: string): string {
  const knownCodes: Record<string, string> = {
    "0x00000000": "success, auto reply",
    "0x00010000": "success, manual reply",
  };
  const normalized = replyCode.toLowerCase();
  return `${replyCode} (${knownCodes[normalized] ?? "unknown reply code"})`;
}

async function main() {
  const privateKey = requireEnv("PRIVATE_KEY") as Hex;
  const routerAddress = requireEnv("ROUTER") as Hex;
  const programId = requireEnv("PROGRAM_ID") as Hex;
  const ethRpc = process.env.ETH_RPC ?? "https://hoodi-reth-rpc.gear-tech.io";
  const varaEthWs = process.env.VARA_ETH_RPC ?? "wss://vara-eth-validator-1.gear-tech.io";
  const depositValue = process.env.DEPOSIT_WEI ? BigInt(process.env.DEPOSIT_WEI) : 1_000_000_000_000_000n;

  const account = privateKeyToAccount(privateKey);

  const publicClient = createPublicClient({
    transport: http(ethRpc),
  });

  const walletClient = createWalletClient({
    account,
    transport: http(ethRpc),
  });

  const signer = walletClientToSigner(walletClient);

  console.log("connecting Vara.eth API:", varaEthWs);
  const api = await createVaraEthApi(
    new WsVaraEthProvider(varaEthWs),
    publicClient,
    routerAddress,
    signer,
  );

  console.log("Vara.eth API connected");

  const mirror = getMirrorClient({
    address: programId,
    publicClient,
    signer,
  });

  console.log("parsing IDL");
  const parser = new SailsIdlParser();
  await parser.init();
  const idl = await readFile(new URL("../target/vault-app.idl", import.meta.url), "utf8");
  const doc = parser.parse(idl);
  const program = new SailsProgram(doc);
  program.setProgramId(programId);

  const initializer = await signer.getAddress();
  console.log("sender:", initializer);

  // First message initializes the program. Run this only once per deployed mirror.
  if (process.env.RUN_INIT === "1") {
    const createCtor = program.ctors?.Create;
    if (!createCtor) throw new Error("Create constructor is missing in IDL");
    const initPayload = asHex(createCtor.encodePayload());
    const initTx = await mirror.sendMessage(initPayload, 0n);
    await initTx.send();
    const { waitForReply } = await initTx.setupReplyListener();
    const initReply = await waitForReply();
    console.log("init reply:", describeReplyCode(initReply.replyCode));
  }

  console.log("sending deposit:", depositValue.toString());
  const depositPayload = asHex(program.services.Vault.functions.Deposit.encodePayload());
  const depositTx = await mirror.sendMessage(depositPayload, depositValue);
  await depositTx.send();
  const { waitForReply: waitForDepositReply } = await depositTx.setupReplyListener();
  const depositReply = await waitForDepositReply();
  const newBalance = program.services.Vault.functions.Deposit.decodeResult(depositReply.payload);

  console.log("deposit reply:", describeReplyCode(depositReply.replyCode));
  console.log("new deposited balance:", newBalance);

  console.log("querying total balance");
  const totalBalancePayload = asHex(program.services.Vault.queries.TotalBalance.encodePayload());
  const totalBalanceReply = await api.call.program.calculateReplyForHandle(
    initializer,
    programId,
    totalBalancePayload,
  );
  const totalBalance = program.services.Vault.queries.TotalBalance.decodeResult(totalBalanceReply.payload);

  console.log("total balance:", totalBalance);

  console.log("querying pause state");
  const isPausedPayload = asHex(program.services.Admin.queries.IsPaused.encodePayload());
  const isPausedReply = await api.call.program.calculateReplyForHandle(
    initializer,
    programId,
    isPausedPayload,
  );
  const isPaused = program.services.Admin.queries.IsPaused.decodeResult(isPausedReply.payload);

  console.log("is paused:", isPaused);

  await api.provider.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
