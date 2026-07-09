# Hoodi Funding

Current deploy wallet for Hoodi testnet:

- address: `0xb941D815859A92B7Fd095a47012931dC8F3b5EC4`

Required assets:

- test `ETH` for L1 deployment and administration transactions
- test `wVARA` for executable balance top-ups

Known Hoodi endpoints:

- Ethereum RPC: `https://hoodi-reth-rpc.gear-tech.io`
- Vara.eth validator RPC: `wss://vara-eth-validator-1.gear-tech.io`

Known Hoodi contracts:

- Router: `0xE549b0AfEdA978271FF7E712232B9F7f39A0b060`
- wVARA: `0xE1ab85A8B4d5d5B6af0bbD0203EB322DF33d0464`

Funding state recorded during Phase 0:

- funding tx: `0x974fc4de78a3a8edcd8a2909aec417e3320e6006a1d485e6adf06224a0dbcd44`
- `1.0 ETH` confirmed received
- `wVARA` funding tx: `0x7bfc70ce8a99b69e34b49d93953eedf6dfb4c6a64b1b6bdbcec053b5fe8ee99d`
- funded `wVARA` amount: `1000000000000000` raw units
- upload tx `0x2d5380664c139e1ea96b4409192d1e335132165f4acd91af57a76e0b54b3fafb` transferred that `wVARA` to the Hoodi Router during code upload
- `0 wVARA` remains at the deployer wallet after upload
- program created: `0x08bcfbda4aa4fe9f6615194e1f179b8641319557`

Next funding needed:

- additional `wVARA` is required before executable-balance top-up can happen
- send more to the same deployer wallet address
- practical recommendation: at least `1 wVARA` to avoid another stall
