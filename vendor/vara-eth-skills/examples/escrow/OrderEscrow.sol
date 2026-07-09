// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

interface IOrderEscrow {
    event Cancelled(uint128);

    event Created(uint128, uint8[32], uint8[32], uint128);

    event Refunded(uint128);

    event Released(uint128);

    function create(bool _callReply) external returns (bytes32 messageId);

    function ordersAmountOf(bool _callReply, uint128 orderId) external returns (bytes32 messageId);

    function ordersBuyerOf(bool _callReply, uint128 orderId) external returns (bytes32 messageId);

    function ordersCancelOrder(bool _callReply, uint128 orderId) external returns (bytes32 messageId);

    function ordersCreateOrder(bool _callReply, address buyer, address seller, uint128 amount) external returns (bytes32 messageId);

    function ordersRefundOrder(bool _callReply, uint128 orderId) external returns (bytes32 messageId);

    function ordersReleaseOrder(bool _callReply, uint128 orderId) external returns (bytes32 messageId);

    function ordersSellerOf(bool _callReply, uint128 orderId) external returns (bytes32 messageId);

    function ordersStatusOf(bool _callReply, uint128 orderId) external returns (bytes32 messageId);
}

contract OrderEscrowAbi is IOrderEscrow {
    function create(bool _callReply) external returns (bytes32 messageId) {}

    function ordersAmountOf(bool _callReply, uint128 orderId) external returns (bytes32 messageId) {}

    function ordersBuyerOf(bool _callReply, uint128 orderId) external returns (bytes32 messageId) {}

    function ordersCancelOrder(bool _callReply, uint128 orderId) external returns (bytes32 messageId) {}

    function ordersCreateOrder(bool _callReply, address buyer, address seller, uint128 amount) external returns (bytes32 messageId) {}

    function ordersRefundOrder(bool _callReply, uint128 orderId) external returns (bytes32 messageId) {}

    function ordersReleaseOrder(bool _callReply, uint128 orderId) external returns (bytes32 messageId) {}

    function ordersSellerOf(bool _callReply, uint128 orderId) external returns (bytes32 messageId) {}

    function ordersStatusOf(bool _callReply, uint128 orderId) external returns (bytes32 messageId) {}
}

interface IOrderEscrowCallbacks {
    function replyOn_create(bytes32 messageId) external;

    function replyOn_ordersAmountOf(bytes32 messageId, uint128 reply) external;

    function replyOn_ordersBuyerOf(bytes32 messageId, address reply) external;

    function replyOn_ordersCancelOrder(bytes32 messageId) external;

    function replyOn_ordersCreateOrder(bytes32 messageId, uint128 reply) external;

    function replyOn_ordersRefundOrder(bytes32 messageId) external;

    function replyOn_ordersReleaseOrder(bytes32 messageId) external;

    function replyOn_ordersSellerOf(bytes32 messageId, address reply) external;

    function replyOn_ordersStatusOf(bytes32 messageId, uint32 reply) external;

    function onErrorReply(bytes32 messageId, bytes calldata payload, bytes4 replyCode) external payable;
}

contract OrderEscrowCaller is IOrderEscrowCallbacks {
    IOrderEscrow public immutable VARA_ETH_PROGRAM;

    error UnauthorizedCaller();

    constructor(IOrderEscrow _varaEthProgram) {
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

    function replyOn_ordersAmountOf(bytes32 messageId, uint128 reply) external onlyVaraEthProgram {
        // TODO: implement this
    }

    function replyOn_ordersBuyerOf(bytes32 messageId, address reply) external onlyVaraEthProgram {
        // TODO: implement this
    }

    function replyOn_ordersCancelOrder(bytes32 messageId) external onlyVaraEthProgram {
        // TODO: implement this
    }

    function replyOn_ordersCreateOrder(bytes32 messageId, uint128 reply) external onlyVaraEthProgram {
        // TODO: implement this
    }

    function replyOn_ordersRefundOrder(bytes32 messageId) external onlyVaraEthProgram {
        // TODO: implement this
    }

    function replyOn_ordersReleaseOrder(bytes32 messageId) external onlyVaraEthProgram {
        // TODO: implement this
    }

    function replyOn_ordersSellerOf(bytes32 messageId, address reply) external onlyVaraEthProgram {
        // TODO: implement this
    }

    function replyOn_ordersStatusOf(bytes32 messageId, uint32 reply) external onlyVaraEthProgram {
        // TODO: implement this
    }

    function onErrorReply(bytes32 messageId, bytes calldata payload, bytes4 replyCode) external payable onlyVaraEthProgram {
        // TODO: implement this
    }
}
