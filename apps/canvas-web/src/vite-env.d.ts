/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ROOM_ID?: string;
  readonly VITE_ETHEREUM_RPC?: string;
  readonly VITE_VARA_ETH_RPC?: string;
  readonly VITE_ROUTER_ADDRESS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
