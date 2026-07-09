/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ETHEREUM_RPC?: string;
  readonly VITE_VARA_ETH_RPC?: string;
  readonly VITE_ROUTER_ADDRESS?: string;
  readonly VITE_CANVAS_ROOM_ID?: string;
  readonly VITE_POLL_ROOM_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
