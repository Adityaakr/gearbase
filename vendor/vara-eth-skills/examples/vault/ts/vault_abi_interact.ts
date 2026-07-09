import { readFile } from "node:fs/promises";
import { createVaraEthApi, WsVaraEthProvider } from "@vara-eth/api";
import { walletClientToSigner } from "@vara-eth/api/signer";
import { SailsProgram } from "sails-js";
import { SailsIdlParser } from "sails-js/parser";
import { createPublicClient, createWalletClient, http, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";

type Hex = `0x${string}`;

const vaultAbi = parseAbi([
  "function create(bool _callReply) external returns (bytes32 messageId)",
  "function vaultDeposit(bool _callReply) external payable returns (bytes32 messageId)",
  "function vaultWithdraw(bool _callReply, uint128 amount) external returns (bytes32 messageId)",
  "function adminPause(bool _callReply) external returns (bytes32 messageId)",
  "function adminUnpause(bool _callReply) external returns (bytes32 messageId)",
]);

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`missing ${name}`);
  }
  return value;
}

function ethAddressToActorId(address: Hex): Hex {
  return `0x000000000000000000000000${address.slice(2).toLowerCase()}` as Hex;
}

async function main() {
  const privateKey = requireEnv("PRIVATE_KEY") as Hex;
  const routerAddress = requireEnv("ROUTER") as Hex;
  const programId = requireEnv("PROGRAM_ID") as Hex;
  const ethRpc = process.env.ETH_RPC ?? "https://hoodi-reth-rpc.gear-tech.io";
  const varaEthWs = process.env.VARA_ETH_RPC ?? "wss://vara-eth-validator-1.gear-tech.io";
  const depositValue = process.env.DEPOSIT_WEI ? BigInt(process.env.DEPOSIT_WEI) : 1_000_000_000_000_000n;

  const account = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({ transport: http(ethRpc) });
  const walletClient = createWalletClient({ account, transport: http(ethRpc) });
  const signer = walletClientToSigner(walletClient);
  const source = await signer.getAddress();

  if (process.env.RUN_INIT === "1") {
    const initHash = await walletClient.writeContract({
      address: programId,
      abi: vaultAbi,
      functionName: "create",
      args: [false],
      chain: null,
    });
    console.log("ABI create tx:", initHash);
    await publicClient.waitForTransactionReceipt({ hash: initHash });
  }

  const depositHash = await walletClient.writeContract({
    address: programId,
    abi: vaultAbi,
    functionName: "vaultDeposit",
    args: [false],
    value: depositValue,
    chain: null,
  });
  console.log("ABI deposit tx:", depositHash);
  await publicClient.waitForTransactionReceipt({ hash: depositHash });

  const api = await createVaraEthApi(
    new WsVaraEthProvider(varaEthWs),
    publicClient,
    routerAddress,
    signer,
  );

  const parser = new SailsIdlParser();
  await parser.init();
  const idl = await readFile(new URL("../target/vault-app.idl", import.meta.url), "utf8");
  const doc = parser.parse(idl);
  const program = new SailsProgram(doc);
  program.setProgramId(programId);

  const totalBalancePayload = program.services.Vault.queries.TotalBalance.encodePayload();
  const totalBalanceReply = await api.call.program.calculateReplyForHandle(source, programId, totalBalancePayload);
  const totalBalance = program.services.Vault.queries.TotalBalance.decodeResult(totalBalanceReply.payload);
  console.log("total balance:", totalBalance);

  const balanceOfPayload = program.services.Vault.queries.BalanceOf.encodePayload(ethAddressToActorId(source as Hex));
  const balanceOfReply = await api.call.program.calculateReplyForHandle(source, programId, balanceOfPayload);
  const balanceOf = program.services.Vault.queries.BalanceOf.decodeResult(balanceOfReply.payload);
  console.log("balance of sender:", balanceOf);

  await api.provider.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
