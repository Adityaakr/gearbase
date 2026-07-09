// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IOrderEscrowApp {
    function ordersCreateOrder(
        bool callReply,
        address buyer,
        address seller,
        uint128 amount
    ) external returns (bytes32 messageId);

    function ordersReleaseOrder(bool callReply, uint128 orderId) external returns (bytes32 messageId);

    function ordersRefundOrder(bool callReply, uint128 orderId) external returns (bytes32 messageId);

    function ordersCancelOrder(bool callReply, uint128 orderId) external returns (bytes32 messageId);
}

interface IOrderEscrowAppCallbacks {
    function replyOn_ordersCreateOrder(bytes32 messageId, uint128 orderId) external;

    function replyOn_ordersReleaseOrder(bytes32 messageId) external;

    function replyOn_ordersRefundOrder(bytes32 messageId) external;

    function replyOn_ordersCancelOrder(bytes32 messageId) external;

    function onErrorReply(bytes32 messageId, bytes calldata payload, bytes4 replyCode) external payable;
}

contract OrderEscrowAdapter is IOrderEscrowAppCallbacks {
    enum OperationKind {
        None,
        Create,
        Release,
        Refund,
        Cancel
    }

    struct PendingOperation {
        OperationKind kind;
        uint128 localOrderId;
    }

    struct LocalOrder {
        address buyer;
        address seller;
        uint128 amount;
        uint128 varaEthOrderId;
        bool createdOnVaraEth;
        bool closed;
        bool failed;
    }

    IOrderEscrowApp public immutable VARA_ETH_PROGRAM;
    bytes4 private constant UNIT_RELEASE_CALLBACK_SELECTOR = bytes4(keccak256("replyOn_ordersReleaseOrder(bytes32,())"));
    bytes4 private constant UNIT_REFUND_CALLBACK_SELECTOR = bytes4(keccak256("replyOn_ordersRefundOrder(bytes32,())"));
    bytes4 private constant UNIT_CANCEL_CALLBACK_SELECTOR = bytes4(keccak256("replyOn_ordersCancelOrder(bytes32,())"));

    uint128 public nextLocalOrderId = 1;

    mapping(uint128 => LocalOrder) public orders;
    mapping(bytes32 => PendingOperation) public pendingOperations;
    mapping(uint128 => bool) public pendingOrderAction;
    mapping(address => uint128) public claimable;

    error UnauthorizedCaller();
    error ZeroValue();
    error ValueTooLarge();
    error InvalidSeller();
    error OrderDoesNotExist();
    error OrderIsClosed();
    error OrderIsNotCreatedOnVaraEth();
    error OrderHasPendingOperation();
    error OnlyBuyer();
    error OnlySeller();
    error TransferFailed();
    error UnsupportedCallback(bytes4 selector);
    error UnknownMessage(bytes32 messageId);

    event OrderCreateRequested(bytes32 indexed messageId, uint128 indexed localOrderId, address indexed buyer, address seller, uint128 amount);
    event OrderCreatedOnVaraEth(bytes32 indexed messageId, uint128 indexed localOrderId, uint128 varaEthOrderId);
    event OrderReleaseRequested(bytes32 indexed messageId, uint128 indexed localOrderId);
    event OrderReleased(bytes32 indexed messageId, uint128 indexed localOrderId, address indexed seller, uint128 amount);
    event OrderRefundRequested(bytes32 indexed messageId, uint128 indexed localOrderId);
    event OrderRefunded(bytes32 indexed messageId, uint128 indexed localOrderId, address indexed buyer, uint128 amount);
    event OrderCancelRequested(bytes32 indexed messageId, uint128 indexed localOrderId);
    event OrderCancelled(bytes32 indexed messageId, uint128 indexed localOrderId, address indexed buyer, uint128 amount);
    event OperationFailed(bytes32 indexed messageId, uint128 indexed localOrderId, bytes4 replyCode);
    event Claimed(address indexed recipient, uint128 amount);

    constructor(IOrderEscrowApp varaEthProgram) {
        VARA_ETH_PROGRAM = varaEthProgram;
    }

    modifier onlyVaraEthProgram() {
        if (msg.sender != address(VARA_ETH_PROGRAM)) {
            revert UnauthorizedCaller();
        }
        _;
    }

    function createOrder(address seller) external payable returns (uint128 localOrderId) {
        if (msg.value == 0) {
            revert ZeroValue();
        }

        if (msg.value > type(uint128).max) {
            revert ValueTooLarge();
        }

        if (seller == address(0) || seller == msg.sender) {
            revert InvalidSeller();
        }

        localOrderId = nextLocalOrderId++;
        uint128 amount = uint128(msg.value);

        orders[localOrderId] = LocalOrder({
            buyer: msg.sender,
            seller: seller,
            amount: amount,
            varaEthOrderId: 0,
            createdOnVaraEth: false,
            closed: false,
            failed: false
        });

        bytes32 messageId = VARA_ETH_PROGRAM.ordersCreateOrder(true, msg.sender, seller, amount);
        pendingOperations[messageId] = PendingOperation(OperationKind.Create, localOrderId);

        emit OrderCreateRequested(messageId, localOrderId, msg.sender, seller, amount);
    }

    function release(uint128 localOrderId) external {
        LocalOrder storage order = _openOrder(localOrderId);

        if (msg.sender != order.buyer) {
            revert OnlyBuyer();
        }

        if (!order.createdOnVaraEth) {
            revert OrderIsNotCreatedOnVaraEth();
        }

        bytes32 messageId = VARA_ETH_PROGRAM.ordersReleaseOrder(true, order.varaEthOrderId);
        pendingOrderAction[localOrderId] = true;
        pendingOperations[messageId] = PendingOperation(OperationKind.Release, localOrderId);

        emit OrderReleaseRequested(messageId, localOrderId);
    }

    function refund(uint128 localOrderId) external {
        LocalOrder storage order = _openOrder(localOrderId);

        if (msg.sender != order.seller) {
            revert OnlySeller();
        }

        if (!order.createdOnVaraEth) {
            revert OrderIsNotCreatedOnVaraEth();
        }

        bytes32 messageId = VARA_ETH_PROGRAM.ordersRefundOrder(true, order.varaEthOrderId);
        pendingOrderAction[localOrderId] = true;
        pendingOperations[messageId] = PendingOperation(OperationKind.Refund, localOrderId);

        emit OrderRefundRequested(messageId, localOrderId);
    }

    function cancel(uint128 localOrderId) external {
        LocalOrder storage order = _openOrder(localOrderId);

        if (msg.sender != order.buyer) {
            revert OnlyBuyer();
        }

        if (!order.createdOnVaraEth) {
            revert OrderIsNotCreatedOnVaraEth();
        }

        bytes32 messageId = VARA_ETH_PROGRAM.ordersCancelOrder(true, order.varaEthOrderId);
        pendingOrderAction[localOrderId] = true;
        pendingOperations[messageId] = PendingOperation(OperationKind.Cancel, localOrderId);

        emit OrderCancelRequested(messageId, localOrderId);
    }

    function replyOn_ordersCreateOrder(bytes32 messageId, uint128 varaEthOrderId) external onlyVaraEthProgram {
        PendingOperation memory operation = _takePending(messageId, OperationKind.Create);
        LocalOrder storage order = orders[operation.localOrderId];

        order.createdOnVaraEth = true;
        order.varaEthOrderId = varaEthOrderId;

        emit OrderCreatedOnVaraEth(messageId, operation.localOrderId, varaEthOrderId);
    }

    function replyOn_ordersReleaseOrder(bytes32 messageId) external onlyVaraEthProgram {
        _completeRelease(messageId);
    }

    function replyOn_ordersRefundOrder(bytes32 messageId) external onlyVaraEthProgram {
        _completeRefund(messageId);
    }

    function replyOn_ordersCancelOrder(bytes32 messageId) external onlyVaraEthProgram {
        _completeCancel(messageId);
    }

    receive() external payable {
        revert UnsupportedCallback(bytes4(0));
    }

    fallback() external payable onlyVaraEthProgram {
        bytes4 selector = msg.sig;

        if (msg.data.length == 36) {
            bytes32 messageId;
            assembly ("memory-safe") {
                messageId := calldataload(4)
            }

            if (selector == UNIT_RELEASE_CALLBACK_SELECTOR) {
                _completeRelease(messageId);
                return;
            }

            if (selector == UNIT_REFUND_CALLBACK_SELECTOR) {
                _completeRefund(messageId);
                return;
            }

            if (selector == UNIT_CANCEL_CALLBACK_SELECTOR) {
                _completeCancel(messageId);
                return;
            }
        }

        revert UnsupportedCallback(selector);
    }

    function _completeRelease(bytes32 messageId) internal {
        PendingOperation memory operation = _takePending(messageId, OperationKind.Release);
        LocalOrder storage order = orders[operation.localOrderId];

        order.closed = true;
        pendingOrderAction[operation.localOrderId] = false;
        claimable[order.seller] += order.amount;

        emit OrderReleased(messageId, operation.localOrderId, order.seller, order.amount);
    }

    function _completeRefund(bytes32 messageId) internal {
        PendingOperation memory operation = _takePending(messageId, OperationKind.Refund);
        LocalOrder storage order = orders[operation.localOrderId];

        order.closed = true;
        pendingOrderAction[operation.localOrderId] = false;
        claimable[order.buyer] += order.amount;

        emit OrderRefunded(messageId, operation.localOrderId, order.buyer, order.amount);
    }

    function _completeCancel(bytes32 messageId) internal {
        PendingOperation memory operation = _takePending(messageId, OperationKind.Cancel);
        LocalOrder storage order = orders[operation.localOrderId];

        order.closed = true;
        pendingOrderAction[operation.localOrderId] = false;
        claimable[order.buyer] += order.amount;

        emit OrderCancelled(messageId, operation.localOrderId, order.buyer, order.amount);
    }

    function onErrorReply(bytes32 messageId, bytes calldata, bytes4 replyCode) external payable onlyVaraEthProgram {
        PendingOperation memory operation = pendingOperations[messageId];

        if (operation.kind == OperationKind.None) {
            revert UnknownMessage(messageId);
        }

        delete pendingOperations[messageId];

        LocalOrder storage order = orders[operation.localOrderId];

        if (operation.kind == OperationKind.Create) {
            order.closed = true;
            claimable[order.buyer] += order.amount;
        } else {
            pendingOrderAction[operation.localOrderId] = false;
            order.failed = true;
        }

        emit OperationFailed(messageId, operation.localOrderId, replyCode);
    }

    function claim() external {
        uint128 amount = claimable[msg.sender];

        if (amount == 0) {
            revert ZeroValue();
        }

        claimable[msg.sender] = 0;
        _sendValue(msg.sender, amount);

        emit Claimed(msg.sender, amount);
    }

    function _openOrder(uint128 localOrderId) internal view returns (LocalOrder storage order) {
        order = orders[localOrderId];

        if (order.buyer == address(0)) {
            revert OrderDoesNotExist();
        }

        if (order.closed) {
            revert OrderIsClosed();
        }

        if (pendingOrderAction[localOrderId]) {
            revert OrderHasPendingOperation();
        }
    }

    function _takePending(bytes32 messageId, OperationKind expectedKind) internal returns (PendingOperation memory operation) {
        operation = pendingOperations[messageId];

        if (operation.kind != expectedKind) {
            revert UnknownMessage(messageId);
        }

        delete pendingOperations[messageId];
    }

    function _sendValue(address recipient, uint128 amount) internal {
        (bool ok,) = recipient.call{value: amount}("");

        if (!ok) {
            revert TransferFailed();
        }
    }
}
