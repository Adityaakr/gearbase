/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ETHEREUM_RPC?: string;
  readonly VITE_VARA_ETH_RPC?: string;
  readonly VITE_ROUTER_ADDRESS?: string;
  readonly VITE_ESCROW_ADAPTER_ADDRESS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

interface Window {
  ethereum?: import("viem").EIP1193Provider;
}
