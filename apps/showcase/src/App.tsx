import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CanvasRoom,
  Gearbase as GearbaseClient,
  PollRoom,
  PollState,
} from "@gearbase/sdk";

const ENV_ETHEREUM_RPC = import.meta.env.VITE_ETHEREUM_RPC?.trim() || undefined;
const ENV_VARA_ETH_RPC = import.meta.env.VITE_VARA_ETH_RPC?.trim() || undefined;
const ENV_ROUTER_ADDRESS = import.meta.env.VITE_ROUTER_ADDRESS?.trim() || undefined;
const DEFAULT_CANVAS_ROOM_ID = import.meta.env.VITE_CANVAS_ROOM_ID?.trim() ?? "";
const DEFAULT_POLL_ROOM_ID = import.meta.env.VITE_POLL_ROOM_ID?.trim() ?? "";

const PALETTE = [
  "#101418",
  "#f5f7fa",
  "#ef4444",
  "#f97316",
  "#facc15",
  "#84cc16",
  "#22c55e",
  "#14b8a6",
  "#06b6d4",
  "#3b82f6",
  "#6366f1",
  "#8b5cf6",
  "#d946ef",
  "#ec4899",
  "#9a3412",
  "#64748b",
] as const;

type ConnectionState = "idle" | "connecting" | "ready" | "error";

function compactAddress(address: string): string {
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function getPackedPixel(pixels: Uint8Array, width: number, x: number, y: number): number {
  const index = y * width + x;
  const byte = pixels[Math.floor(index / 2)] ?? 0;
  return index % 2 === 1 ? (byte >> 4) & 0x0f : byte & 0x0f;
}

export function App() {
  const previewRef = useRef<HTMLCanvasElement | null>(null);
  const gearbaseRef = useRef<GearbaseClient | null>(null);
  const canvasRoomRef = useRef<CanvasRoom | null>(null);
  const pollRoomRef = useRef<PollRoom | null>(null);

  const [connectionState, setConnectionState] = useState<ConnectionState>("idle");
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState("Not connected");
  const [error, setError] = useState("");
  const [canvasRoomId, setCanvasRoomId] = useState(DEFAULT_CANVAS_ROOM_ID);
  const [pollRoomId, setPollRoomId] = useState(DEFAULT_POLL_ROOM_ID);
  const [canvasSeq, setCanvasSeq] = useState(0);
  const [canvasParticipants, setCanvasParticipants] = useState(0);
  const [canvasState, setCanvasState] = useState<CanvasRoom["state"] | null>(null);
  const [pollSeq, setPollSeq] = useState(0);
  const [pollParticipants, setPollParticipants] = useState(0);
  const [pollState, setPollState] = useState<PollState | null>(null);
  const [selectedPollOption, setSelectedPollOption] = useState<number | null>(null);

  const connect = useCallback(async () => {
    if (gearbaseRef.current) {
      return;
    }

    setConnectionState("connecting");
    setStatus("Connecting burner identity");
    setError("");

    try {
      const { Gearbase } = await import("@gearbase/sdk");
      const gearbase = await Gearbase.connect({
        network: "testnet",
        identity: "burner",
        pollMs: 500,
        ethereumRpc: ENV_ETHEREUM_RPC,
        varaEthRpc: ENV_VARA_ETH_RPC as `ws://${string}` | `wss://${string}` | undefined,
        routerAddress: ENV_ROUTER_ADDRESS as `0x${string}` | undefined,
      });
      gearbaseRef.current = gearbase;
      setAddress(gearbase.address);
      setConnectionState("ready");
      setStatus("Connected");
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : String(nextError);
      setConnectionState("error");
      setStatus("Connection failed");
      setError(message);
    }
  }, []);

  const openCanvas = useCallback(async () => {
    if (!gearbaseRef.current || !canvasRoomId.trim()) {
      return;
    }

    setStatus("Opening canvas room");
    setError("");

    try {
      canvasRoomRef.current?.dispose();
      const room = await gearbaseRef.current.joinCanvas(canvasRoomId.trim() as `0x${string}`);
      canvasRoomRef.current = room;
      setCanvasState(room.state);
      setCanvasSeq(room.seq);
      setCanvasParticipants(room.participants.length);
      room.on("update", (nextState) => {
        setCanvasState(nextState);
        setCanvasSeq(room.seq);
        setCanvasParticipants(room.participants.length);
      });
      room.on("join", () => setCanvasParticipants(room.participants.length));
      room.on("leave", () => setCanvasParticipants(room.participants.length));
      room.on("error", (nextError) => {
        setError(nextError.message);
        setStatus("Canvas update failed");
      });
      setStatus("Canvas room live");
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : String(nextError);
      setError(message);
      setStatus("Canvas room failed");
    }
  }, [canvasRoomId]);

  const openPoll = useCallback(async () => {
    if (!gearbaseRef.current || !pollRoomId.trim()) {
      return;
    }

    setStatus("Opening poll room");
    setError("");

    try {
      pollRoomRef.current?.dispose();
      const room = await gearbaseRef.current.joinPoll(pollRoomId.trim() as `0x${string}`);
      pollRoomRef.current = room;
      setPollState(room.state);
      setPollSeq(room.seq);
      setPollParticipants(room.participants.length);
      room.on("update", (nextState) => {
        setPollState(nextState);
        setPollSeq(room.seq);
        setPollParticipants(room.participants.length);
      });
      room.on("join", () => setPollParticipants(room.participants.length));
      room.on("leave", () => setPollParticipants(room.participants.length));
      room.on("error", (nextError) => {
        setError(nextError.message);
        setStatus("Poll update failed");
      });
      setStatus("Poll room live");
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : String(nextError);
      setError(message);
      setStatus("Poll room failed");
    }
  }, [pollRoomId]);

  const placeRandomPixel = useCallback(async () => {
    const room = canvasRoomRef.current;
    const state = canvasState;
    if (!room || !state) {
      return;
    }

    const x = Math.floor(Math.random() * state.config.width);
    const y = Math.floor(Math.random() * state.config.height);
    const color = Math.floor(Math.random() * Math.max(1, state.config.paletteSize));

    try {
      await room.send.PlacePixel({ x, y, color });
      setStatus(`Placed pixel ${x},${y}`);
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : String(nextError);
      setError(message);
      setStatus("Canvas write failed");
    }
  }, [canvasState]);

  const castPollVote = useCallback(async () => {
    if (selectedPollOption === null || !pollRoomRef.current) {
      return;
    }

    try {
      await pollRoomRef.current.send.Vote({ option: selectedPollOption });
      setStatus(`Voted for option ${selectedPollOption + 1}`);
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : String(nextError);
      setError(message);
      setStatus("Poll vote failed");
    }
  }, [selectedPollOption]);

  const totalVotes = useMemo(
    () => (pollState ? pollState.tally.reduce((sum, value) => sum + value, 0) : 0),
    [pollState],
  );

  useEffect(() => {
    const canvas = previewRef.current;
    const state = canvasState;
    if (!canvas || !state) {
      return;
    }

    canvas.width = state.config.width;
    canvas.height = state.config.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const image = ctx.createImageData(state.config.width, state.config.height);
    for (let y = 0; y < state.config.height; y += 1) {
      for (let x = 0; x < state.config.width; x += 1) {
        const color = PALETTE[getPackedPixel(state.pixels, state.config.width, x, y)] ?? PALETTE[0];
        const offset = (y * state.config.width + x) * 4;
        image.data[offset] = Number.parseInt(color.slice(1, 3), 16);
        image.data[offset + 1] = Number.parseInt(color.slice(3, 5), 16);
        image.data[offset + 2] = Number.parseInt(color.slice(5, 7), 16);
        image.data[offset + 3] = 255;
      }
    }
    ctx.putImageData(image, 0, 0);
  }, [canvasState]);

  useEffect(() => {
    return () => {
      canvasRoomRef.current?.dispose();
      pollRoomRef.current?.dispose();
      void gearbaseRef.current?.disconnect().catch(() => undefined);
    };
  }, []);

  return (
    <main className="playground-app">
      <section className="playground-shell">
        <header className="hero">
          <div>
            <div className="eyebrow">gearbase playground</div>
            <h1>Light-themed onchain test surface</h1>
            <p>
              Burner identity, Hoodi testnet, live injected writes and free state reads.
            </p>
          </div>
          <div className={`status-pill status-pill--${connectionState}`}>{status}</div>
        </header>

        <section className="network-card">
          <div>
            <span>Identity</span>
            <strong>{address ? compactAddress(address) : "Not connected"}</strong>
          </div>
          <div>
            <span>Ethereum RPC</span>
            <strong>{ENV_ETHEREUM_RPC ?? "Hoodi default"}</strong>
          </div>
          <div>
            <span>Vara.eth WS</span>
            <strong>{ENV_VARA_ETH_RPC ?? "Hoodi default"}</strong>
          </div>
          <button className="primary-button" onClick={() => void connect()}>
            {connectionState === "ready" ? "Connected" : "Connect burner"}
          </button>
        </section>

        <section className="grid">
          <article className="panel">
            <header className="panel__header">
              <div>
                <span>Canvas room</span>
                <strong>{canvasState ? "Attached" : "Not attached"}</strong>
              </div>
              <button className="secondary-button" onClick={() => void openCanvas()}>
                Open
              </button>
            </header>
            <label className="field">
              <span>Room id</span>
              <input
                value={canvasRoomId}
                onChange={(event) => setCanvasRoomId(event.target.value)}
                placeholder="0x..."
              />
            </label>
            <div className="mini-stats">
              <div><span>Participants</span><strong>{canvasParticipants}</strong></div>
              <div><span>Seq</span><strong>{canvasSeq}</strong></div>
            </div>
            <div className="canvas-preview-wrap">
              <canvas ref={previewRef} className="canvas-preview" />
            </div>
            <button
              className="primary-button"
              onClick={() => void placeRandomPixel()}
              disabled={!canvasState}
            >
              Place random pixel
            </button>
          </article>

          <article className="panel">
            <header className="panel__header">
              <div>
                <span>Poll room</span>
                <strong>{pollState ? "Attached" : "Not attached"}</strong>
              </div>
              <button className="secondary-button" onClick={() => void openPoll()}>
                Open
              </button>
            </header>
            <label className="field">
              <span>Room id</span>
              <input
                value={pollRoomId}
                onChange={(event) => setPollRoomId(event.target.value)}
                placeholder="0x..."
              />
            </label>
            <div className="mini-stats">
              <div><span>Participants</span><strong>{pollParticipants}</strong></div>
              <div><span>Seq</span><strong>{pollSeq}</strong></div>
              <div><span>Total votes</span><strong>{totalVotes}</strong></div>
            </div>
            <div className="poll-preview">
              <div className="poll-question">{pollState?.config.question ?? "No poll loaded"}</div>
              <div className="poll-options">
                {pollState?.config.options.map((option, index) => {
                  const tally = pollState.tally[index] ?? 0;
                  const percent = totalVotes === 0 ? 0 : Math.round((tally / totalVotes) * 100);
                  return (
                    <button
                      key={`${option}-${index}`}
                      className={`poll-option${selectedPollOption === index ? " is-selected" : ""}`}
                      onClick={() => setSelectedPollOption(index)}
                    >
                      <div className="poll-option__top">
                        <strong>{option}</strong>
                        <span>{tally}</span>
                      </div>
                      <div className="poll-option__bar">
                        <div className="poll-option__fill" style={{ width: `${percent}%` }} />
                      </div>
                    </button>
                  );
                }) ?? <div className="empty">No poll data loaded.</div>}
              </div>
            </div>
            <button
              className="primary-button"
              onClick={() => void castPollVote()}
              disabled={selectedPollOption === null || !pollState}
            >
              Cast poll vote
            </button>
          </article>
        </section>

        {error ? <section className="error-banner">{error}</section> : null}
      </section>
    </main>
  );
}
