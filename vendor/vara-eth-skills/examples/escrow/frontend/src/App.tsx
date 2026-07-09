import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  cancelOrder,
  claim,
  compactAddress,
  connectEscrow,
  createOrder,
  formatEth,
  readAdapterSnapshot,
  readConfig,
  readOrder,
  readOrders,
  readVaraEthOrderStatus,
  refundOrder,
  releaseOrder,
  type AdapterSnapshot,
  type EscrowSession,
  type LocalOrder,
  type TxOutcome,
  type VaraEthOrderStatus,
} from "./escrow";

type Phase =
  | "Idle"
  | "Wallet"
  | "Ethereum"
  | "Callback"
  | "State"
  | "Confirmed"
  | "Failed";

type LogEntry = {
  at: string;
  text: string;
};

const POLL_INTERVAL_MS = 2_500;
const POLL_TIMEOUT_MS = 120_000;

type WalletEventProvider = NonNullable<typeof window.ethereum> & {
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

function now() {
  return new Date().toLocaleTimeString();
}

function parseOrderId(value: string): bigint {
  const normalized = value.trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error("Order id must be a positive integer");
  }
  return BigInt(normalized);
}

function orderStatus(order: LocalOrder | null): string {
  if (!order) return "No order loaded";
  if (order.failed) return "Failed";
  if (order.closed) return "Closed";
  if (!order.createdOnVaraEth) return "Waiting for Vara.eth";
  return "Open";
}

function orderLifecycle(order: LocalOrder): string {
  if (order.failed) return "Failed";
  if (order.closed) return "Finalized";
  if (order.createdOnVaraEth) return "Created";
  return "Escrowed";
}

function accountRole(order: LocalOrder, account?: string): string {
  if (!account) return "";
  if (order.buyer.toLowerCase() === account.toLowerCase()) return "buyer";
  if (order.seller.toLowerCase() === account.toLowerCase()) return "seller";
  return "";
}

function canRelease(
  order: LocalOrder | null,
  account?: string,
  varaEthStatus?: VaraEthOrderStatus | null,
): boolean {
  return Boolean(
    order &&
      account &&
      order.createdOnVaraEth &&
      !order.closed &&
      !order.failed &&
      (!varaEthStatus || varaEthStatus.status === 1) &&
      order.buyer.toLowerCase() === account.toLowerCase(),
  );
}

function canRefund(
  order: LocalOrder | null,
  account?: string,
  varaEthStatus?: VaraEthOrderStatus | null,
): boolean {
  return Boolean(
    order &&
      account &&
      order.createdOnVaraEth &&
      !order.closed &&
      !order.failed &&
      (!varaEthStatus || varaEthStatus.status === 1) &&
      order.seller.toLowerCase() === account.toLowerCase(),
  );
}

function canCancel(
  order: LocalOrder | null,
  account?: string,
  varaEthStatus?: VaraEthOrderStatus | null,
): boolean {
  return canRelease(order, account, varaEthStatus);
}

export default function App() {
  const config = useMemo(() => readConfig(), []);
  const [session, setSession] = useState<EscrowSession | null>(null);
  const [snapshot, setSnapshot] = useState<AdapterSnapshot | null>(null);
  const [orders, setOrders] = useState<LocalOrder[]>([]);
  const [loadedOrder, setLoadedOrder] = useState<LocalOrder | null>(null);
  const [varaEthOrderStatus, setVaraEthOrderStatus] =
    useState<VaraEthOrderStatus | null>(null);
  const [varaEthStatusError, setVaraEthStatusError] = useState<string | null>(null);
  const [orderIdInput, setOrderIdInput] = useState("");
  const [seller, setSeller] = useState("");
  const [amount, setAmount] = useState("0.01");
  const [phase, setPhase] = useState<Phase>("Idle");
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  function addLog(text: string) {
    setLogs((items) => [{ at: now(), text }, ...items].slice(0, 8));
  }

  async function refresh(nextSession = session, nextOrderId?: bigint) {
    if (!nextSession) return;
    const nextSnapshot = await readAdapterSnapshot(nextSession);
    const nextOrders = await readOrders(nextSession, nextSnapshot.nextLocalOrderId);
    const newestOrder = nextOrders[nextOrders.length - 1];
    const selectedOrderId = nextOrderId ?? loadedOrder?.id ?? newestOrder?.id;
    const nextOrder =
      selectedOrderId !== undefined
        ? nextOrders.find((order) => order.id === selectedOrderId) ??
          (await readOrder(nextSession, selectedOrderId))
        : null;

    setSnapshot(nextSnapshot);
    setOrders(nextOrders);
    setLoadedOrder(nextOrder);
    if (nextOrder) {
      setOrderIdInput(nextOrder.id.toString());
    }

    if (nextOrder?.createdOnVaraEth && nextOrder.varaEthOrderId !== 0n) {
      try {
        const status = await readVaraEthOrderStatus(
          nextSession,
          nextSnapshot.varaEthProgram,
          nextOrder.varaEthOrderId,
        );
        setVaraEthOrderStatus(status);
        setVaraEthStatusError(null);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setVaraEthOrderStatus(null);
        setVaraEthStatusError(message);
      }
    } else {
      setVaraEthOrderStatus(null);
      setVaraEthStatusError(null);
    }
  }

  async function runTask(task: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await task();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setPhase("Failed");
      addLog(message);
    } finally {
      setBusy(false);
    }
  }

  async function connect() {
    await runTask(async () => {
      setPhase("Wallet");
      const nextSession = await connectEscrow();
      setSession(nextSession);
      await refresh(nextSession);
      setPhase("Confirmed");
      addLog(`Connected ${compactAddress(nextSession.account)}`);
    });
  }

  async function reconnect(reason: string) {
    await runTask(async () => {
      setPhase("Wallet");
      const nextSession = await connectEscrow();
      setSession(nextSession);
      await refresh(nextSession);
      setPhase("Confirmed");
      addLog(`${reason}: ${compactAddress(nextSession.account)}`);
    });
  }

  useEffect(() => {
    const wallet = window.ethereum as WalletEventProvider | undefined;
    if (!wallet?.on || !session) return undefined;

    const handleAccountsChanged = (accounts: unknown) => {
      if (!Array.isArray(accounts) || accounts.length === 0) {
        setSession(null);
        setSnapshot(null);
        setOrders([]);
        setLoadedOrder(null);
        setVaraEthOrderStatus(null);
        addLog("Wallet disconnected");
        return;
      }

      void reconnect("Wallet account changed");
    };

    const handleChainChanged = () => {
      void reconnect("Wallet chain changed");
    };

    wallet.on("accountsChanged", handleAccountsChanged);
    wallet.on("chainChanged", handleChainChanged);

    return () => {
      wallet.removeListener?.("accountsChanged", handleAccountsChanged);
      wallet.removeListener?.("chainChanged", handleChainChanged);
    };
  }, [session?.account]);

  async function waitForCallback(
    orderId: bigint,
    predicate: (order: LocalOrder) => boolean,
    confirmedText: (order: LocalOrder) => string,
  ) {
    if (!session) return;
    setPhase("Callback");
    const startedAt = Date.now();

    while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
      const order = await readOrder(session, orderId);
      setLoadedOrder(order);
      await refresh(session, orderId);
      if (predicate(order)) {
        setPhase("Confirmed");
        addLog(confirmedText(order));
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    setPhase("State");
    addLog("Callback not visible yet; refresh the order later");
  }

  function describeOutcome(outcome: TxOutcome) {
    if (outcome.localOrderId !== undefined) {
      setOrderIdInput(outcome.localOrderId.toString());
    }
    addLog(`Ethereum tx ${compactAddress(outcome.hash)} confirmed`);
    if (outcome.messageId) {
      addLog(`Vara.eth message ${compactAddress(outcome.messageId)} requested`);
    }
  }

  async function submitCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;

    await runTask(async () => {
      setPhase("Ethereum");
      const outcome = await createOrder(session, seller, amount);
      describeOutcome(outcome);
      await refresh(session, outcome.localOrderId);

      if (outcome.localOrderId !== undefined) {
        await waitForCallback(
          outcome.localOrderId,
          (order) => order.createdOnVaraEth,
          (order) =>
            `Order #${order.id.toString()} created on Vara.eth as #${order.varaEthOrderId.toString()}`,
        );
      }
    });
  }

  async function loadOrder() {
    if (!session) return;

    await runTask(async () => {
      setPhase("State");
      const id = parseOrderId(orderIdInput);
      await refresh(session, id);
      setPhase("Confirmed");
      addLog(`Loaded order #${id}`);
    });
  }

  async function submitOrderAction(action: "release" | "refund" | "cancel") {
    if (!session || !loadedOrder) return;

    await runTask(async () => {
      setPhase("Ethereum");
      const outcome =
        action === "release"
          ? await releaseOrder(session, loadedOrder.id)
          : action === "refund"
            ? await refundOrder(session, loadedOrder.id)
            : await cancelOrder(session, loadedOrder.id);

      describeOutcome(outcome);
      await refresh(session, loadedOrder.id);
      await waitForCallback(
        loadedOrder.id,
        (order) => order.closed || order.failed,
        (order) =>
          order.failed
            ? `Order #${order.id.toString()} failed on Vara.eth`
            : `Order #${order.id.toString()} finalized by Vara.eth callback`,
      );
    });
  }

  async function submitClaim() {
    if (!session) return;

    await runTask(async () => {
      setPhase("Ethereum");
      const outcome = await claim(session);
      describeOutcome(outcome);
      await refresh(session);
      setPhase("Confirmed");
    });
  }

  const missingConfig = config.missing.length > 0;
  const account = session?.account;

  return (
    <main className="shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Vara.eth ABI Adapter</p>
          <h1>Order Escrow</h1>
        </div>
        <button className="primary" onClick={connect} disabled={busy || missingConfig}>
          {account ? compactAddress(account) : "Connect"}
        </button>
      </section>

      {missingConfig && (
        <section className="notice">
          Missing config: {config.missing.join(", ")}
        </section>
      )}

      {error && <section className="notice danger">{error}</section>}

      <section className="grid">
        <div className="panel">
          <div className="panelHeader">
            <h2>Create Order</h2>
            <span className="status">{phase}</span>
          </div>
          <form onSubmit={submitCreate} className="stack">
            <label>
              Seller
              <input
                value={seller}
                onChange={(event) => setSeller(event.target.value)}
                placeholder="0x..."
                disabled={busy || !session}
              />
            </label>
            <label>
              Amount
              <input
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                inputMode="decimal"
                disabled={busy || !session}
              />
            </label>
            <button className="primary wide" disabled={busy || !session || !seller || !amount}>
              Create
            </button>
          </form>
        </div>

        <div className="panel">
          <div className="panelHeader">
            <h2>Adapter State</h2>
            <button className="secondary" onClick={() => void refresh()} disabled={busy || !session}>
              Refresh
            </button>
          </div>
          <dl className="facts">
            <div>
              <dt>Adapter</dt>
              <dd>{config.adapterAddress ? compactAddress(config.adapterAddress) : "-"}</dd>
            </div>
            <div>
              <dt>Vara.eth Mirror</dt>
              <dd>{snapshot ? compactAddress(snapshot.varaEthProgram) : "-"}</dd>
            </div>
            <div>
              <dt>Next Order</dt>
              <dd>{snapshot ? snapshot.nextLocalOrderId.toString() : "-"}</dd>
            </div>
            <div>
              <dt>Claimable</dt>
              <dd>{snapshot ? formatEth(snapshot.claimable) : "-"}</dd>
            </div>
            <div>
              <dt>Orders</dt>
              <dd>{orders.length.toString()}</dd>
            </div>
          </dl>
          <button className="wide" onClick={submitClaim} disabled={busy || !session || !snapshot?.claimable}>
            Claim
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="panelHeader">
          <h2>Order</h2>
          <span className={`pill ${orderStatus(loadedOrder).toLowerCase().replace(/\s+/g, "-")}`}>
            {orderStatus(loadedOrder)}
          </span>
        </div>

        <div className="lookup">
          <input
            value={orderIdInput}
            onChange={(event) => setOrderIdInput(event.target.value)}
            placeholder="Order id"
            inputMode="numeric"
            disabled={busy || !session}
          />
          <button className="secondary" onClick={loadOrder} disabled={busy || !session || !orderIdInput}>
            Load
          </button>
        </div>

        {orders.length > 0 && (
          <div className="orderList">
            {orders.map((order) => {
              const role = accountRole(order, account);
              const selected = loadedOrder?.id === order.id;

              return (
                <button
                  className={`orderButton ${selected ? "selected" : ""}`}
                  key={order.id.toString()}
                  onClick={() => void refresh(session, order.id)}
                  disabled={busy || !session}
                >
                  <span>#{order.id.toString()}</span>
                  <span>{orderLifecycle(order)}</span>
                  <span>{role || compactAddress(order.seller)}</span>
                  <span>{formatEth(order.amount)}</span>
                </button>
              );
            })}
          </div>
        )}

        <div className="orderGrid">
          <dl className="facts">
            <div>
              <dt>Local ID</dt>
              <dd>{loadedOrder ? loadedOrder.id.toString() : "-"}</dd>
            </div>
            <div>
              <dt>Vara.eth ID</dt>
              <dd>{loadedOrder?.varaEthOrderId ? loadedOrder.varaEthOrderId.toString() : "-"}</dd>
            </div>
            <div>
              <dt>Buyer</dt>
              <dd>{loadedOrder ? compactAddress(loadedOrder.buyer) : "-"}</dd>
            </div>
            <div>
              <dt>Seller</dt>
              <dd>{loadedOrder ? compactAddress(loadedOrder.seller) : "-"}</dd>
            </div>
            <div>
              <dt>Amount</dt>
              <dd>{loadedOrder ? formatEth(loadedOrder.amount) : "-"}</dd>
            </div>
            <div>
              <dt>Adapter State</dt>
              <dd>
                {loadedOrder
                  ? [
                      `createdOnVaraEth = ${loadedOrder.createdOnVaraEth ? "true" : "false"}`,
                      `closed = ${loadedOrder.closed ? "true" : "false"}`,
                      `failed = ${loadedOrder.failed ? "true" : "false"}`,
                    ].join(" / ")
                  : "-"}
              </dd>
            </div>
            <div>
              <dt>Vara.eth State</dt>
              <dd>
                {varaEthStatusError
                  ? "Query failed"
                  : varaEthOrderStatus
                    ? [
                        `status = ${varaEthOrderStatus.label}`,
                        loadedOrder &&
                        !loadedOrder.closed &&
                        varaEthOrderStatus.status !== 1
                          ? "adapter callback not applied"
                          : undefined,
                      ]
                        .filter(Boolean)
                        .join(" / ")
                    : "-"}
              </dd>
            </div>
          </dl>

          <div className="timeline">
            <div className={loadedOrder ? "done" : ""}>Escrowed</div>
            <div className={loadedOrder?.createdOnVaraEth ? "done" : ""}>Created</div>
            <div className={loadedOrder?.closed ? "done" : loadedOrder?.failed ? "failed" : ""}>
              Finalized
            </div>
          </div>
        </div>

        {varaEthStatusError && (
          <p className="inlineError">Vara.eth query failed: {varaEthStatusError}</p>
        )}

        <div className="actions">
          <button
            onClick={() => void submitOrderAction("release")}
            disabled={busy || !canRelease(loadedOrder, account, varaEthOrderStatus)}
          >
            Release
          </button>
          <button
            onClick={() => void submitOrderAction("refund")}
            disabled={busy || !canRefund(loadedOrder, account, varaEthOrderStatus)}
          >
            Refund
          </button>
          <button
            onClick={() => void submitOrderAction("cancel")}
            disabled={busy || !canCancel(loadedOrder, account, varaEthOrderStatus)}
          >
            Cancel
          </button>
        </div>
      </section>

      <section className="panel">
        <div className="panelHeader">
          <h2>Session Activity</h2>
          {session && (
            <span className="muted">
              RPC chain {session.chainId}
              {session.walletChainId ? ` / wallet ${Number(BigInt(session.walletChainId)).toString()}` : ""}
            </span>
          )}
        </div>
        <ol className="logs">
          {logs.length === 0 ? (
            <li>No activity yet</li>
          ) : (
            logs.map((item) => (
              <li key={`${item.at}-${item.text}`}>
                <span>{item.at}</span>
                {item.text}
              </li>
            ))
          )}
        </ol>
      </section>
    </main>
  );
}
