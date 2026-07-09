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
  if (!value) throw new Error(`missing ${name}`);
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
  const withdrawAmount = process.env.WITHDRAW_AMOUNT ? BigInt(process.env.WITHDRAW_AMOUNT) : 100_000_000_000_000n;

  const account = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({ transport: http(ethRpc) });
  const walletClient = createWalletClient({ account, transport: http(ethRpc) });
  const signer = walletClientToSigner(walletClient);

  const api = await createVaraEthApi(
    new WsVaraEthProvider(varaEthWs),
    publicClient,
    routerAddress,
    signer,
  );

  const mirror = getMirrorClient({
    address: programId,
    publicClient,
    signer,
  });

  const parser = new SailsIdlParser();
  await parser.init();
  const idl = await readFile(new URL("../target/vault-app.idl", import.meta.url), "utf8");
  const doc = parser.parse(idl);
  const program = new SailsProgram(doc);
  program.setProgramId(programId);

  const adminAddress = await signer.getAddress();

  const isPausedPayload = asHex(program.services.Admin.queries.IsPaused.encodePayload());
  const beforeReply = await api.call.program.calculateReplyForHandle(adminAddress, programId, isPausedPayload);
  const pausedBefore = program.services.Admin.queries.IsPaused.decodeResult(beforeReply.payload);
  console.log("paused before:", pausedBefore);

  const pausePayload = asHex(program.services.Admin.functions.Pause.encodePayload());
  const pauseTx = await mirror.sendMessage(pausePayload, 0n);
  await pauseTx.send();
  const { waitForReply: waitForPauseReply } = await pauseTx.setupReplyListener();
  const pauseReply = await waitForPauseReply();
  console.log("pause reply:", describeReplyCode(pauseReply.replyCode));

  const afterPauseReply = await api.call.program.calculateReplyForHandle(adminAddress, programId, isPausedPayload);
  const pausedAfterPause = program.services.Admin.queries.IsPaused.decodeResult(afterPauseReply.payload);
  console.log("paused after pause:", pausedAfterPause);

  const unpausePayload = asHex(program.services.Admin.functions.Unpause.encodePayload());
  const unpauseTx = await mirror.sendMessage(unpausePayload, 0n);
  await unpauseTx.send();
  const { waitForReply: waitForUnpauseReply } = await unpauseTx.setupReplyListener();
  const unpauseReply = await waitForUnpauseReply();
  console.log("unpause reply:", describeReplyCode(unpauseReply.replyCode));

  const afterUnpauseReply = await api.call.program.calculateReplyForHandle(adminAddress, programId, isPausedPayload);
  const pausedAfterUnpause = program.services.Admin.queries.IsPaused.decodeResult(afterUnpauseReply.payload);
  console.log("paused after unpause:", pausedAfterUnpause);

  const withdrawPayload = asHex(program.services.Vault.functions.Withdraw.encodePayload(withdrawAmount));
  const withdrawTx = await mirror.sendMessage(withdrawPayload, 0n);
  await withdrawTx.send();
  const { waitForReply: waitForWithdrawReply } = await withdrawTx.setupReplyListener();
  const withdrawReply = await waitForWithdrawReply();
  console.log("withdraw reply:", describeReplyCode(withdrawReply.replyCode));
  console.log("withdraw returned value:", withdrawReply.value.toString());

  const balanceOfPayload = asHex(program.services.Vault.queries.BalanceOf.encodePayload(adminAddress));
  const balanceReply = await api.call.program.calculateReplyForHandle(adminAddress, programId, balanceOfPayload);
  const remainingBalance = program.services.Vault.queries.BalanceOf.decodeResult(balanceReply.payload);
  console.log("remaining deposited balance:", remainingBalance);

  await api.provider.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
