import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  FthRoom,
  FthState,
  Gearbase as GearbaseClient,
  ParticipantProfile,
} from "@gearbase/sdk";
import { bytesToHex, concatHex, hexToBytes, keccak256, toHex } from "viem";

const DEFAULT_ROOM_ID = import.meta.env.VITE_ROOM_ID?.trim() ?? "";
const ENV_ETHEREUM_RPC = import.meta.env.VITE_ETHEREUM_RPC?.trim() || undefined;
const ENV_VARA_ETH_RPC = import.meta.env.VITE_VARA_ETH_RPC?.trim() || undefined;
const ENV_ROUTER_ADDRESS = import.meta.env.VITE_ROUTER_ADDRESS?.trim() || undefined;
const ENV_FTH_CODE_ID = import.meta.env.VITE_FTH_CODE_ID?.trim() || undefined;

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

function randomSaltHex(): `0x${string}` {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export function App() {
  const gearbaseRef = useRef<GearbaseClient | null>(null);
  const roomRef = useRef<FthRoom | null>(null);

  const [roomIdInput, setRoomIdInput] = useState(() => readRoomIdFromHash());
  const [activeRoomId, setActiveRoomId] = useState(() => readRoomIdFromHash());
  const [identityMode, setIdentityMode] = useState<IdentityMode>("burner");
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    activeRoomId ? "connecting" : "idle",
  );
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState("Waiting for room id");
  const [error, setError] = useState("");
  const [state, setState] = useState<FthState | null>(null);
  const [participants, setParticipants] = useState<ParticipantProfile[]>([]);
  const [seq, setSeq] = useState(0);
  const [owner, setOwner] = useState("");
  const [fuel, setFuel] = useState<bigint | null>(null);
  const [seatInput, setSeatInput] = useState(0);
  const [answerText, setAnswerText] = useState("");
  const [voteSeat, setVoteSeat] = useState(0);
  const [promptText, setPromptText] = useState("");
  const [commitSeat, setCommitSeat] = useState(0);
  const [commitSalt, setCommitSalt] = useState<`0x${string}`>(() => randomSaltHex());
  const [sponsorAmount, setSponsorAmount] = useState("1000000000000000000");
  const [roundCount, setRoundCount] = useState(3);
  const [revealTimeoutSecs, setRevealTimeoutSecs] = useState(600);
  const [answerMaxBytes, setAnswerMaxBytes] = useState(280);
  const [revealTallyLive, setRevealTallyLive] = useState(false);

  const disconnectCurrent = useCallback(async () => {
    roomRef.current?.dispose();
    roomRef.current = null;
    setState(null);
    setParticipants([]);
    setSeq(0);
    setOwner("");
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
      templateCodeIds: ENV_FTH_CODE_ID
        ? { fth: ENV_FTH_CODE_ID as `0x${string}` }
        : undefined,
    });
    gearbaseRef.current = gearbase;
    setAddress(gearbase.address);
    return gearbase;
  }, []);

  const bindRoom = useCallback(async (room: FthRoom, mode: IdentityMode) => {
    roomRef.current?.dispose();
    roomRef.current = room;
    setState(room.state);
    setParticipants(room.participants);
    setSeq(room.seq);
    setOwner(room.info.owner);
    setFuel(await room.fuel().catch(() => null));

    try {
      await room.send.Join({
        name: mode === "wallet" ? "wallet-player" : `burner-${room.programId.slice(2, 6)}`,
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
      setParticipants([...room.participants]);
      setSeq(room.seq);
      setOwner(room.info.owner);
      void room.fuel().then(setFuel).catch(() => undefined);
    });
    room.on("join", () => setParticipants([...room.participants]));
    room.on("leave", () => setParticipants([...room.participants]));
    room.on("lowFuel", (balance) => {
      setFuel(balance);
      setStatus("Room fuel is low");
    });
    room.on("error", (nextError) => {
      setError(nextError.message);
      setStatus("Room update failed");
    });
  }, []);

  const connectToRoom = useCallback(async (programId: string, mode: IdentityMode) => {
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
      const room = await gearbase.joinFth(programId as `0x${string}`);
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

    void connectToRoom(activeRoomId, identityMode);

    return () => {
      void disconnectCurrent();
    };
  }, [activeRoomId, connectToRoom, disconnectCurrent, identityMode]);

  const currentRound = useMemo(() => state?.rounds[state.rounds.length - 1], [state]);
  const isHost = useMemo(
    () => Boolean(address) && Boolean(owner) && address.toLowerCase() === owner.toLowerCase(),
    [address, owner],
  );
  const commitHashHex = useMemo(
    () =>
      keccak256(
        concatHex([toHex(commitSeat, { size: 1 }), commitSalt]),
      ),
    [commitSalt, commitSeat],
  );
  const voteTotal = useMemo(
    () => (state ? state.tally.reduce((sum, value) => sum + value, 0) : 0),
    [state],
  );

  const submitRoom = useCallback(() => {
    const nextRoomId = roomIdInput.trim();
    if (!nextRoomId) {
      return;
    }
    window.location.hash = `/${nextRoomId}`;
    setActiveRoomId(nextRoomId);
  }, [roomIdInput]);

  const createRoom = useCallback(async () => {
    if (!ENV_FTH_CODE_ID) {
      setError("VITE_FTH_CODE_ID is required to create rooms");
      return;
    }
    if (identityMode !== "wallet") {
      setError("Switch to wallet mode to create and sponsor a room");
      return;
    }

    setConnectionState("connecting");
    setStatus("Creating room");
    setError("");

    try {
      await disconnectCurrent();
      const gearbase = await connectGearbase("wallet");
      const room = await gearbase.create(
        "fth",
        {
          revealTallyLive,
          revealTimeoutSecs,
          roundCount,
          answerMaxBytes,
        },
        {
          codeId: ENV_FTH_CODE_ID as `0x${string}`,
          sponsorWVara: sponsorAmount.trim() ? BigInt(sponsorAmount.trim()) : undefined,
        },
      );
      await bindRoom(room, "wallet");
      setRoomIdInput(room.programId);
      setActiveRoomId(room.programId);
      window.location.hash = `/${room.programId}`;
      setConnectionState("ready");
      setStatus("Room created");
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : String(nextError);
      setConnectionState("error");
      setStatus("Create failed");
      setError(message);
    }
  }, [
    answerMaxBytes,
    bindRoom,
    connectGearbase,
    disconnectCurrent,
    identityMode,
    revealTallyLive,
    revealTimeoutSecs,
    roundCount,
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

  const runAction = useCallback(async (label: string, action: () => Promise<unknown>) => {
    setError("");
    setStatus(label);
    try {
      await action();
      setStatus("Live");
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : String(nextError);
      setError(message);
      setStatus(`${label} failed`);
    }
  }, []);

  const latestAnswerBySeat = useMemo(() => {
    const map = new Map<number, string>();
    if (!currentRound) {
      return map;
    }
    for (const answer of currentRound.answers) {
      map.set(answer.seat, answer.text);
    }
    return map;
  }, [currentRound]);

  return (
    <main className="fth-app">
      <section className="fth-shell">
        <header className="hero">
          <div>
            <div className="eyebrow">gearbase flagship</div>
            <h1>Find the Human</h1>
            <p>Live room controls, burner or wallet identity, and a full transcript view.</p>
          </div>
          <div className={`status-pill status-pill--${connectionState}`}>{status}</div>
        </header>

        <section className="toolbar">
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
          <button className="primary-button" onClick={submitRoom}>Open room</button>
        </section>

        <section className="stats-grid">
          <article>
            <span>Identity</span>
            <strong>{address ? compactAddress(address) : "-"}</strong>
          </article>
          <article>
            <span>Owner</span>
            <strong>{owner ? compactAddress(owner) : "-"}</strong>
          </article>
          <article>
            <span>Phase</span>
            <strong>{state?.phase ?? "-"}</strong>
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

        <section className="panel">
          <header className="panel__header">
            <div>
              <span>Create room</span>
              <strong>Host flow</strong>
            </div>
          </header>

          <div className="host-grid">
            <label className="field">
              <span>Rounds</span>
              <input
                type="number"
                min={1}
                max={10}
                value={roundCount}
                onChange={(event) => setRoundCount(Number(event.target.value))}
              />
            </label>
            <label className="field">
              <span>Reveal timeout</span>
              <input
                type="number"
                min={60}
                value={revealTimeoutSecs}
                onChange={(event) => setRevealTimeoutSecs(Number(event.target.value))}
              />
            </label>
            <label className="field">
              <span>Answer bytes</span>
              <input
                type="number"
                min={64}
                max={280}
                value={answerMaxBytes}
                onChange={(event) => setAnswerMaxBytes(Number(event.target.value))}
              />
            </label>
            <label className="field">
              <span>Initial fuel</span>
              <input
                value={sponsorAmount}
                onChange={(event) => setSponsorAmount(event.target.value)}
                placeholder="wVARA base units"
              />
            </label>
            <button className="secondary-button" onClick={() => setRevealTallyLive((value) => !value)}>
              {revealTallyLive ? "Live tally on" : "Live tally off"}
            </button>
            <div className="action-row">
              <button className="primary-button" onClick={() => void createRoom()}>
                Create room
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

        <section className="layout">
          <article className="panel">
            <header className="panel__header">
              <div>
                <span>Seats</span>
                <strong>{state?.roundsStarted ?? 0} / {state?.config.roundCount ?? 0} rounds</strong>
              </div>
              <div className="pill">{participants.length} participants</div>
            </header>

            <div className="seat-grid">
              {Array.from({ length: 5 }, (_, seat) => {
                const occupant = state?.seats.find((item) => item.seat === seat);
                const answer = latestAnswerBySeat.get(seat);
                return (
                  <article className="seat-card" key={seat}>
                    <div className="seat-card__top">
                      <span>Seat {seat}</span>
                      <button
                        className="secondary-button"
                        onClick={() => void runAction("Sitting down", async () => {
                          await roomRef.current?.send.SitDown({ seat });
                        })}
                      >
                        Sit
                      </button>
                    </div>
                    <strong>{occupant?.name ?? (occupant ? compactAddress(occupant.address) : "Open")}</strong>
                    <p>{answer ?? "No answer yet."}</p>
                  </article>
                );
              })}
            </div>

            <div className="action-row">
              <input
                value={answerText}
                onChange={(event) => setAnswerText(event.target.value)}
                placeholder="submit answer"
              />
              <button
                className="primary-button"
                onClick={() => void runAction("Submitting answer", async () => {
                  await roomRef.current?.send.SubmitAnswer({ text: answerText });
                  setAnswerText("");
                })}
              >
                Answer
              </button>
            </div>
          </article>

          <article className="panel">
            <header className="panel__header">
              <div>
                <span>Voting</span>
                <strong>{voteTotal} votes</strong>
              </div>
              <div className="pill">Reveal seat {state?.revealedHumanSeat ?? "-"}</div>
            </header>

            <div className="vote-list">
              {Array.from({ length: 5 }, (_, seat) => {
                const tally = state?.tally[seat] ?? 0;
                const width = voteTotal === 0 ? 0 : Math.round((tally / voteTotal) * 100);
                return (
                  <button
                    className={`vote-card${voteSeat === seat ? " is-selected" : ""}`}
                    key={seat}
                    onClick={() => setVoteSeat(seat)}
                  >
                    <div className="vote-card__top">
                      <strong>Seat {seat}</strong>
                      <span>{tally}</span>
                    </div>
                    <div className="vote-card__bar">
                      <div className="vote-card__fill" style={{ width: `${width}%` }} />
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="action-row">
              <input
                type="number"
                min={0}
                max={4}
                value={voteSeat}
                onChange={(event) => setVoteSeat(Number(event.target.value))}
              />
              <button
                className="primary-button"
                onClick={() => void runAction("Casting vote", async () => {
                  await roomRef.current?.send.CastVote({ seat: voteSeat });
                })}
              >
                Vote
              </button>
              <button
                className="secondary-button"
                onClick={() => void runAction("Aborting reveal", async () => {
                  await roomRef.current?.send.AbortReveal();
                })}
              >
                Abort
              </button>
            </div>
          </article>
        </section>

        <section className="layout">
          <article className="panel">
            <header className="panel__header">
              <div>
                <span>Host console</span>
                <strong>{isHost ? "Owner controls enabled" : "Read-only for non-owner"}</strong>
              </div>
            </header>

            <div className="host-grid">
              <label className="field">
                <span>Prompt</span>
                <input
                  value={promptText}
                  onChange={(event) => setPromptText(event.target.value)}
                  placeholder="round prompt"
                  disabled={!isHost}
                />
              </label>
              <button
                className="primary-button"
                disabled={!isHost}
                onClick={() => void runAction("Starting round", async () => {
                  await roomRef.current?.send.StartRound({ prompt: promptText });
                  setPromptText("");
                })}
              >
                Start round
              </button>
              <button
                className="secondary-button"
                disabled={!isHost}
                onClick={() => void runAction("Opening voting", async () => {
                  await roomRef.current?.send.OpenVoting();
                })}
              >
                Open voting
              </button>
            </div>

            <div className="host-grid">
              <label className="field">
                <span>Commit seat</span>
                <input
                  type="number"
                  min={0}
                  max={4}
                  value={commitSeat}
                  onChange={(event) => setCommitSeat(Number(event.target.value))}
                  disabled={!isHost}
                />
              </label>
              <label className="field">
                <span>Salt</span>
                <input
                  value={commitSalt}
                  onChange={(event) => setCommitSalt(event.target.value as `0x${string}`)}
                  disabled={!isHost}
                />
              </label>
              <button
                className="secondary-button"
                disabled={!isHost}
                onClick={() => setCommitSalt(randomSaltHex())}
              >
                New salt
              </button>
            </div>

            <div className="commit-box">
              <span>Commit hash</span>
              <code>{commitHashHex}</code>
            </div>

            <div className="action-row">
              <button
                className="primary-button"
                disabled={!isHost}
                onClick={() => void runAction("Submitting commit", async () => {
                  await roomRef.current?.send.HostCommit({ hash: hexToBytes(commitHashHex) });
                })}
              >
                Host commit
              </button>
              <button
                className="secondary-button"
                disabled={!isHost}
                onClick={() => void runAction("Revealing", async () => {
                  await roomRef.current?.send.Reveal({
                    seat: commitSeat,
                    salt: hexToBytes(commitSalt),
                  });
                })}
              >
                Reveal
              </button>
            </div>
          </article>

          <article className="panel">
            <header className="panel__header">
              <div>
                <span>Transcript</span>
                <strong>{state?.rounds.length ?? 0} rounds</strong>
              </div>
            </header>
            <div className="transcript">
              {state?.rounds.map((round) => (
                <section key={round.round} className="round-block">
                  <div className="round-title">Round {round.round}</div>
                  <p>{round.prompt}</p>
                  <div className="answer-list">
                    {round.answers.map((answer) => (
                      <div key={`${round.round}-${answer.seat}`} className="answer-row">
                        <span>Seat {answer.seat}</span>
                        <strong>{answer.text}</strong>
                      </div>
                    ))}
                  </div>
                </section>
              )) ?? <div className="empty">No transcript yet.</div>}
            </div>
          </article>
        </section>

        {error ? <section className="error-banner">{error}</section> : null}
      </section>
    </main>
  );
}
