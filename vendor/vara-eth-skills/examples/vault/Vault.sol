// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.28;

interface IVault {
    event Deposited(uint8[32], uint128, uint128);

    event Withdrawn(uint8[32], uint128, uint128);

    event Paused(uint8[32]);

    event Unpaused(uint8[32]);

    function create(bool _callReply) external returns (bytes32 messageId);

    function vaultBalanceOf(bool _callReply, address account) external returns (bytes32 messageId);

    function vaultDeposit(bool _callReply) external payable returns (bytes32 messageId);

    function vaultTotalBalance(bool _callReply) external returns (bytes32 messageId);

    function vaultWithdraw(bool _callReply, uint128 amount) external returns (bytes32 messageId);

    function adminIsPaused(bool _callReply) external returns (bytes32 messageId);

    function adminOwner(bool _callReply) external returns (bytes32 messageId);

    function adminPause(bool _callReply) external returns (bytes32 messageId);

    function adminUnpause(bool _callReply) external returns (bytes32 messageId);
}

contract VaultAbi is IVault {
    function create(bool _callReply) external returns (bytes32 messageId) {}

    function vaultBalanceOf(bool _callReply, address account) external returns (bytes32 messageId) {}

    function vaultDeposit(bool _callReply) external payable returns (bytes32 messageId) {}

    function vaultTotalBalance(bool _callReply) external returns (bytes32 messageId) {}

    function vaultWithdraw(bool _callReply, uint128 amount) external returns (bytes32 messageId) {}

    function adminIsPaused(bool _callReply) external returns (bytes32 messageId) {}

    function adminOwner(bool _callReply) external returns (bytes32 messageId) {}

    function adminPause(bool _callReply) external returns (bytes32 messageId) {}

    function adminUnpause(bool _callReply) external returns (bytes32 messageId) {}
}

interface IVaultCallbacks {
    function replyOn_create(bytes32 messageId) external;

    function replyOn_vaultBalanceOf(bytes32 messageId, uint128 reply) external;

    function replyOn_vaultDeposit(bytes32 messageId, uint128 reply) external;

    function replyOn_vaultTotalBalance(bytes32 messageId, uint128 reply) external;

    function replyOn_vaultWithdraw(bytes32 messageId) external payable;

    function replyOn_adminIsPaused(bytes32 messageId, bool reply) external;

    function replyOn_adminOwner(bytes32 messageId, address reply) external;

    function replyOn_adminPause(bytes32 messageId) external;

    function replyOn_adminUnpause(bytes32 messageId) external;

    function onErrorReply(bytes32 messageId, bytes calldata payload, bytes4 replyCode) external payable;
}

contract VaultCaller is IVaultCallbacks {
    IVault public immutable VARA_ETH_PROGRAM;

    error UnauthorizedCaller();

    constructor(IVault _varaEthProgram) {
        VARA_ETH_PROGRAM = _varaEthProgram;
    }

    modifier onlyVaraEthProgram() {
        _onlyVaraEthProgram();
        _;
    }

    function _onlyVaraEthProgram() internal view {
        if (msg.sender != address(VARA_ETH_PROGRAM)) {
            revert UnauthorizedCaller();
        }
    }

    function replyOn_create(bytes32 messageId) external onlyVaraEthProgram {
        // TODO: implement this
    }

    function replyOn_vaultBalanceOf(bytes32 messageId, uint128 reply) external onlyVaraEthProgram {
        // TODO: implement this
    }

    function replyOn_vaultDeposit(bytes32 messageId, uint128 reply) external onlyVaraEthProgram {
        // TODO: implement this
    }

    function replyOn_vaultTotalBalance(bytes32 messageId, uint128 reply) external onlyVaraEthProgram {
        // TODO: implement this
    }

    function replyOn_vaultWithdraw(bytes32 messageId) external payable onlyVaraEthProgram {
        // TODO: implement this
    }

    function replyOn_adminIsPaused(bytes32 messageId, bool reply) external onlyVaraEthProgram {
        // TODO: implement this
    }

    function replyOn_adminOwner(bytes32 messageId, address reply) external onlyVaraEthProgram {
        // TODO: implement this
    }

    function replyOn_adminPause(bytes32 messageId) external onlyVaraEthProgram {
        // TODO: implement this
    }

    function replyOn_adminUnpause(bytes32 messageId) external onlyVaraEthProgram {
        // TODO: implement this
    }

    function onErrorReply(bytes32 messageId, bytes calldata payload, bytes4 replyCode) external payable onlyVaraEthProgram {
        // TODO: implement this
    }
}
