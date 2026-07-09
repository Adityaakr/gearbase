/// <reference types="vite/client" />

interface EthereumProvider {
  request<T = unknown>(args: { method: string; params?: unknown[] }): Promise<T>;
}

interface Window {
  ethereum?: EthereumProvider;
}
