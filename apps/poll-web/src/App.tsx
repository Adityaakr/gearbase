import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Gearbase as GearbaseClient, PollRoom, PollState } from "@gearbase/sdk";

const DEFAULT_ROOM_ID = import.meta.env.VITE_ROOM_ID?.trim() ?? "";
const ENV_ETHEREUM_RPC = import.meta.env.VITE_ETHEREUM_RPC?.trim() || undefined;
const ENV_VARA_ETH_RPC = import.meta.env.VITE_VARA_ETH_RPC?.trim() || undefined;
const ENV_ROUTER_ADDRESS = import.meta.env.VITE_ROUTER_ADDRESS?.trim() || undefined;
const ENV_POLL_CODE_ID = import.meta.env.VITE_POLL_CODE_ID?.trim() || undefined;

type ConnectionState = "idle" | "connecting" | "ready" | "error";
type IdentityMode = "burner" | "wallet";

function readRoomIdFromHash(): string {
  const hash = window.location.hash;
  if (hash.startsWith("#/")) {
    return hash.slice(2);
  }
  return DEFAULT_ROOM_ID;
}

function compactAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function totalVotes(state: PollState | null): number {
  return state ? state.tally.reduce((sum, value) => sum + value, 0) : 0;
}

function parseOptions(text: string): string[] {
  return text
    .split("\n")
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 8);
}

export function App() {
  const gearbaseRef = useRef<GearbaseClient | null>(null);
  const roomRef = useRef<PollRoom | null>(null);

  const [roomIdInput, setRoomIdInput] = useState(() => readRoomIdFromHash());
  const [activeRoomId, setActiveRoomId] = useState(() => readRoomIdFromHash());
  const [identityMode, setIdentityMode] = useState<IdentityMode>("burner");
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    activeRoomId ? "connecting" : "idle",
  );
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState("Waiting for room id");
  const [error, setError] = useState("");
  const [state, setState] = useState<PollState | null>(null);
  const [participants, setParticipants] = useState(0);
  const [seq, setSeq] = useState(0);
  const [fuel, setFuel] = useState<bigint | null>(null);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [sponsorAmount, setSponsorAmount] = useState("1000000000000000000");
  const [createQuestion, setCreateQuestion] = useState("Who wins?");
  const [createOptions, setCreateOptions] = useState("Alpha\nBeta");
  const [createEndsAt, setCreateEndsAt] = useState("");

  const disconnectCurrent = useCallback(async () => {
    roomRef.current?.dispose();
    roomRef.current = null;
    setState(null);
    setParticipants(0);
    setSeq(0);
    setFuel(null);

    if (gearbaseRef.current) {
      await gearbaseRef.current.disconnect().catch(() => undefined);
      gearbaseRef.current = null;
    }
  }, []);

  const connectGearbase = useCallback(async (mode: IdentityMode) => {
    const { Gearbase } = await import("@gearbase/sdk");
    const gearbase = await Gearbase.connect({
      network: "testnet",
      identity: mode,
      pollMs: 500,
      ethereumRpc: ENV_ETHEREUM_RPC,
      varaEthRpc: ENV_VARA_ETH_RPC as `ws://${string}` | `wss://${string}` | undefined,
      routerAddress: ENV_ROUTER_ADDRESS as `0x${string}` | undefined,
      templateCodeIds: ENV_POLL_CODE_ID
        ? { poll: ENV_POLL_CODE_ID as `0x${string}` }
        : undefined,
    });
    gearbaseRef.current = gearbase;
    setAddress(gearbase.address);
    return gearbase;
  }, []);

  const bindRoom = useCallback(async (room: PollRoom, mode: IdentityMode) => {
    roomRef.current?.dispose();
    roomRef.current = room;

    setState(room.state);
    setParticipants(room.participants.length);
    setSeq(room.seq);
    setFuel(await room.fuel().catch(() => null));

    try {
      await room.send.Join({
        name: mode === "wallet" ? "owner" : `voter-${room.programId.slice(2, 6)}`,
        kind: "human",
      });
    } catch (joinError) {
      const message = joinError instanceof Error ? joinError.message : String(joinError);
      if (!message.toLowerCase().includes("already")) {
        throw joinError;
      }
    }

    room.on("update", (nextState) => {
      setState(nextState);
      setParticipants(room.participants.length);
      setSeq(room.seq);
      void room.fuel().then(setFuel).catch(() => undefined);
    });
    room.on("join", () => setParticipants(room.participants.length));
    room.on("leave", () => setParticipants(room.participants.length));
    room.on("lowFuel", (balance) => {
      setFuel(balance);
      setStatus("Room fuel is low");
    });
    room.on("error", (nextError) => {
      setError(nextError.message);
      setStatus("Update failed");
    });
  }, []);

  const openRoom = useCallback(async (programId: string, mode: IdentityMode) => {
    if (!programId) {
      setConnectionState("idle");
      setStatus("Waiting for room id");
      return;
    }

    setConnectionState("connecting");
    setStatus(`Connecting ${mode}`);
    setError("");

    try {
      await disconnectCurrent();
      const gearbase = await connectGearbase(mode);
      setStatus("Attaching to room");
      const room = await gearbase.joinPoll(programId as `0x${string}`);
      await bindRoom(room, mode);
      setConnectionState("ready");
      setStatus("Live");
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : String(nextError);
      setConnectionState("error");
      setStatus("Connection failed");
      setError(message);
    }
  }, [bindRoom, connectGearbase, disconnectCurrent]);

  useEffect(() => {
    const handleHashChange = () => {
      const nextRoomId = readRoomIdFromHash();
      setRoomIdInput(nextRoomId);
      setActiveRoomId(nextRoomId);
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => window.removeEventListener("hashchange", handleHashChange);
  }, []);

  useEffect(() => {
    if (!activeRoomId) {
      return;
    }

    void openRoom(activeRoomId, identityMode);
  }, [activeRoomId, identityMode, openRoom]);

  useEffect(() => {
    return () => {
      void disconnectCurrent();
    };
  }, [disconnectCurrent]);

  const voteTotal = useMemo(() => totalVotes(state), [state]);

  const submitRoom = useCallback(() => {
    const nextRoomId = roomIdInput.trim();
    if (!nextRoomId) {
      return;
    }
    window.location.hash = `/${nextRoomId}`;
    setActiveRoomId(nextRoomId);
  }, [roomIdInput]);

  const submitVote = useCallback(async () => {
    if (selectedOption === null || !roomRef.current) {
      return;
    }

    setSubmitting(true);
    setError("");
    try {
      await roomRef.current.send.Vote({ option: selectedOption });
      setStatus(`Voted for option ${selectedOption + 1}`);
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : String(nextError);
      setError(message);
      setStatus("Vote failed");
    } finally {
      setSubmitting(false);
    }
  }, [selectedOption]);

  const createPoll = useCallback(async () => {
    if (!ENV_POLL_CODE_ID) {
      setError("VITE_POLL_CODE_ID is required to create rooms");
      return;
    }
    if (identityMode !== "wallet") {
      setError("Switch to wallet mode to create and sponsor a poll room");
      return;
    }

    const options = parseOptions(createOptions);
    if (options.length < 2) {
      setError("Add at least two poll options");
      return;
    }

    setConnectionState("connecting");
    setStatus("Creating poll room");
    setError("");

    try {
      await disconnectCurrent();
      const gearbase = await connectGearbase("wallet");
      const room = await gearbase.create(
        "poll",
        {
          question: createQuestion.trim(),
          options,
          endsAt: createEndsAt ? Number(createEndsAt) : undefined,
        },
        {
          codeId: ENV_POLL_CODE_ID as `0x${string}`,
          sponsorWVara: sponsorAmount.trim() ? BigInt(sponsorAmount.trim()) : undefined,
        },
      );
      await bindRoom(room, "wallet");
      setRoomIdInput(room.programId);
      setActiveRoomId(room.programId);
      window.location.hash = `/${room.programId}`;
      setConnectionState("ready");
      setStatus("Poll room created");
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : String(nextError);
      setConnectionState("error");
      setStatus("Create failed");
      setError(message);
    }
  }, [
    bindRoom,
    connectGearbase,
    createEndsAt,
    createOptions,
    createQuestion,
    disconnectCurrent,
    identityMode,
    sponsorAmount,
  ]);

  const sponsorRoom = useCallback(async () => {
    if (!roomRef.current) {
      return;
    }

    setStatus("Sponsoring room");
    setError("");
    try {
      await roomRef.current.sponsor(BigInt(sponsorAmount.trim()));
      setFuel(await roomRef.current.fuel());
      setStatus("Room sponsored");
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : String(nextError);
      setError(message);
      setStatus("Sponsor failed");
    }
  }, [sponsorAmount]);

  return (
    <main className="poll-app">
      <section className="poll-shell">
        <header className="poll-header">
          <div>
            <div className="eyebrow">gearbase</div>
            <h1>Live poll room</h1>
          </div>
          <div className={`status-pill status-pill--${connectionState}`}>{status}</div>
        </header>

        <section className="room-bar">
          <label className="room-field">
            <span>Room</span>
            <input
              value={roomIdInput}
              onChange={(event) => setRoomIdInput(event.target.value)}
              placeholder="0x..."
            />
          </label>
          <div className="identity-switch">
            <button
              className={identityMode === "burner" ? "is-active" : ""}
              onClick={() => setIdentityMode("burner")}
            >
              Burner
            </button>
            <button
              className={identityMode === "wallet" ? "is-active" : ""}
              onClick={() => setIdentityMode("wallet")}
            >
              Wallet
            </button>
          </div>
          <button className="primary-button" onClick={submitRoom}>
            Open room
          </button>
        </section>

        <section className="stats-grid">
          <article>
            <span>Voter</span>
            <strong>{address ? compactAddress(address) : "-"}</strong>
          </article>
          <article>
            <span>Participants</span>
            <strong>{participants}</strong>
          </article>
          <article>
            <span>Seq</span>
            <strong>{seq}</strong>
          </article>
          <article>
            <span>Fuel</span>
            <strong>{fuel?.toString() ?? "-"}</strong>
          </article>
        </section>

        <section className="poll-card">
          <div className="poll-meta">
            <span>Create room</span>
            <strong>Owner flow</strong>
          </div>
          <div className="create-grid">
            <label className="room-field">
              <span>Question</span>
              <input
                value={createQuestion}
                onChange={(event) => setCreateQuestion(event.target.value)}
                placeholder="Who looks human?"
              />
            </label>
            <label className="room-field">
              <span>Ends at</span>
              <input
                value={createEndsAt}
                onChange={(event) => setCreateEndsAt(event.target.value)}
                placeholder="unix timestamp optional"
              />
            </label>
            <label className="room-field room-field--wide">
              <span>Options</span>
              <textarea
                value={createOptions}
                onChange={(event) => setCreateOptions(event.target.value)}
                placeholder={"Alpha\nBeta"}
                rows={4}
              />
            </label>
            <label className="room-field">
              <span>Initial fuel</span>
              <input
                value={sponsorAmount}
                onChange={(event) => setSponsorAmount(event.target.value)}
                placeholder="wVARA base units"
              />
            </label>
            <div className="actions">
              <button className="primary-button" onClick={() => void createPoll()}>
                Create poll
              </button>
              <button
                className="secondary-button"
                onClick={() => void sponsorRoom()}
                disabled={!roomRef.current}
              >
                Sponsor room
              </button>
            </div>
          </div>
        </section>

        <section className="poll-card">
          <div className="poll-meta">
            <span>Question</span>
            <strong>{state?.config.question ?? "Loading..."}</strong>
          </div>

          <div className="option-list">
            {state?.config.options.map((option, index) => {
              const tally = state.tally[index] ?? 0;
              const percent = voteTotal === 0 ? 0 : Math.round((tally / voteTotal) * 100);
              return (
                <button
                  key={`${option}-${index}`}
                  className={`option-card${selectedOption === index ? " is-selected" : ""}`}
                  onClick={() => setSelectedOption(index)}
                >
                  <div className="option-card__top">
                    <strong>{option}</strong>
                    <span>{tally}</span>
                  </div>
                  <div className="option-card__bar">
                    <div className="option-card__fill" style={{ width: `${percent}%` }} />
                  </div>
                  <div className="option-card__bottom">
                    <span>{percent}%</span>
                    <span>option {index + 1}</span>
                  </div>
                </button>
              );
            }) ?? <div className="empty-state">No poll data yet.</div>}
          </div>

          <div className="actions">
            <button
              className="primary-button"
              onClick={() => void submitVote()}
              disabled={selectedOption === null || submitting || !state}
            >
              {submitting ? "Submitting..." : "Cast vote"}
            </button>
            <div className="actions__hint">
              Burner mode for free voting. Wallet mode for create and sponsor.
            </div>
          </div>
        </section>

        {error ? <section className="error-banner">{error}</section> : null}
      </section>
    </main>
  );
}
