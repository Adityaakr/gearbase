# Digit Recognition Injected Frontend

Frontend-only example for a deployed Vara.eth digit-recognition program.

It demonstrates:

- drawing a 28x28 grayscale digit input in the browser
- encoding the `DigitRecognition.Predict(Vec<u16>)` Sails payload
- sending the write as an injected Vara.eth transaction with `api.createInjectedTransaction(...)`
- reading `DigitRecognition.Result` through Vara.eth `program_calculateReplyForHandle`

The browser wallet is used to sign the injected transaction. The frontend does not submit the prediction as an Ethereum ABI write.

## Setup

```bash
cp .env.example .env
npm install
npm run dev
```

Required values:

- `VITE_ETHEREUM_RPC`: Ethereum RPC endpoint used for reference block and Router validator reads.
- `VITE_VARA_ETH_RPC`: Vara.eth WebSocket RPC endpoint. This is used for both injected transaction submission/promise waiting and Vara.eth state reads. In a non-browser script this may be named `VARA_ETH_RPC`, but Vite browser env variables need the `VITE_` prefix.
- `VITE_ROUTER_ADDRESS`: Router contract address for the target network.
- `VITE_PROGRAM_ID`: deployed and initialized digit-recognition program id.

The target program must already have executable balance and model weights. Deploy, top-up, init, and weight-loading belong in a separate operational script.

## Flow

1. Connect an EIP-1193 browser wallet.
2. Draw a digit.
3. Submit the drawing.
4. The app sends an injected transaction directly to Vara.eth.
5. The app reads the result from Vara.eth state and displays probabilities.

## Checks

```bash
npm run check
npm run build
```

Live prediction requires funded network access, a connected wallet, and valid deployed addresses.
