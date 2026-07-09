export type GearbaseNetwork = "testnet" | "mainnet" | "local";

export type GearbaseIdentity = "burner" | "wallet" | "privateKey";

export type GearbaseConnectOptions = {
  network: GearbaseNetwork;
  identity?: GearbaseIdentity;
};

export class Gearbase {
  static async connect(_options: GearbaseConnectOptions): Promise<Gearbase> {
    throw new Error("Gearbase.connect is not implemented yet");
  }
}
