import { createVaraEthApi, getMirrorClient, WsVaraEthProvider } from "@vara-eth/api";
import { walletClientToSigner } from "@vara-eth/api/signer";
import { createPublicClient, createWalletClient, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";

type Hex = `0x${string}`;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`missing ${name}`);
  }
  return value;
}

async function main() {
  const privateKey = requireEnv("PRIVATE_KEY") as Hex;
  const routerAddress = requireEnv("ROUTER") as Hex;
  const codeId = requireEnv("CODE_ID") as Hex;
  const abiInterfaceAddress = requireEnv("ABI_INTERFACE_ADDRESS") as Hex;
  const ethRpc = process.env.ETH_RPC ?? "https://hoodi-reth-rpc.gear-tech.io";
  const varaEthWs = process.env.VARA_ETH_RPC ?? "wss://vara-eth-validator-1.gear-tech.io";

  const account = privateKeyToAccount(privateKey);
  const publicClient = createPublicClient({ transport: http(ethRpc) });
  const walletClient = createWalletClient({ account, transport: http(ethRpc) });
  const signer = walletClientToSigner(walletClient);
  const initializer = (process.env.INITIALIZER as Hex | undefined) ?? await signer.getAddress();
  const salt = (process.env.SALT as Hex | undefined) ?? "0x0000000000000000000000000000000000000000000000000000000000000000";

  const api = await createVaraEthApi(
    new WsVaraEthProvider(varaEthWs),
    publicClient,
    routerAddress,
    signer,
  );

  console.log("creating program with ABI interface");
  console.log("code id:", codeId);
  console.log("abi interface:", abiInterfaceAddress);
  console.log("initializer:", initializer);
  console.log("salt:", salt);

  const tx = await api.eth.router.createProgramWithAbiInterface(
    codeId,
    abiInterfaceAddress,
    initializer,
    salt,
  );

  const receipt = await tx.sendAndWaitForReceipt();
  const programId = await tx.getProgramId();

  console.log("create-with-abi tx:", receipt.transactionHash);
  console.log("program id:", programId);

  const mirror = getMirrorClient({
    address: programId,
    publicClient,
    signer,
  });

  console.log("mirror initializer:", await mirror.initializer());

  await api.provider.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
