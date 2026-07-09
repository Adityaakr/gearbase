import { useCallback, useEffect, useRef, useState } from "react";
import type { CanvasRoom, CanvasState, Gearbase as GearbaseClient } from "@gearbase/sdk";

import { CanvasStage } from "./components/CanvasStage";
import { Palette } from "./components/Palette";
import { Sidebar } from "./components/Sidebar";
import {
  fitCamera,
  readRoomIdFromHash,
  type Camera,
  type HoveredPixel,
  type Viewport,
} from "./lib/canvas";

const DEFAULT_ROOM_ID = import.meta.env.VITE_ROOM_ID?.trim() ?? "";
const ENV_ETHEREUM_RPC = import.meta.env.VITE_ETHEREUM_RPC?.trim() || undefined;
const ENV_VARA_ETH_RPC = import.meta.env.VITE_VARA_ETH_RPC?.trim() || undefined;
const ENV_ROUTER_ADDRESS = import.meta.env.VITE_ROUTER_ADDRESS?.trim() || undefined;

type ConnectionState = "idle" | "connecting" | "ready" | "error";

export function App() {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const roomRef = useRef<CanvasRoom | null>(null);
  const gearbaseRef = useRef<GearbaseClient | null>(null);
  const dragStartRef = useRef<{
    pointerX: number;
    pointerY: number;
    offsetX: number;
    offsetY: number;
    moved: boolean;
  } | null>(null);

  const [roomIdInput, setRoomIdInput] = useState(() => readRoomIdFromHash(DEFAULT_ROOM_ID));
  const [activeRoomId, setActiveRoomId] = useState(() => readRoomIdFromHash(DEFAULT_ROOM_ID));
  const [connectionState, setConnectionState] = useState<ConnectionState>(
    activeRoomId ? "connecting" : "idle",
  );
  const [address, setAddress] = useState("");
  const [status, setStatus] = useState("Waiting for room id");
  const [error, setError] = useState("");
  const [state, setState] = useState<CanvasState | null>(null);
  const [seq, setSeq] = useState(0);
  const [participants, setParticipants] = useState(0);
  const [selectedColor, setSelectedColor] = useState(8);
  const [hoveredPixel, setHoveredPixel] = useState<HoveredPixel | null>(null);
  const [viewport, setViewport] = useState<Viewport>({ width: 960, height: 720 });
  const [camera, setCamera] = useState<Camera>({
    zoom: 4,
    offsetX: 32,
    offsetY: 32,
  });

  const connectToRoom = useCallback(
    async (programId: string) => {
      if (!programId) {
        setConnectionState("idle");
        setStatus("Waiting for room id");
        return;
      }

      roomRef.current?.dispose();
      roomRef.current = null;
      if (gearbaseRef.current) {
        await gearbaseRef.current.disconnect().catch(() => undefined);
        gearbaseRef.current = null;
      }

      setConnectionState("connecting");
      setError("");
      setStatus("Connecting burner identity");

      try {
        const { Gearbase } = await import("@gearbase/sdk");
        const gearbase = await Gearbase.connect({
          network: "testnet",
          identity: "burner",
          pollMs: 400,
          ethereumRpc: ENV_ETHEREUM_RPC,
          varaEthRpc: ENV_VARA_ETH_RPC as `ws://${string}` | `wss://${string}` | undefined,
          routerAddress: ENV_ROUTER_ADDRESS as `0x${string}` | undefined,
        });
        gearbaseRef.current = gearbase;
        setAddress(gearbase.address);
        setStatus("Attaching to room");

        const room = await gearbase.joinCanvas(programId as `0x${string}`);
        roomRef.current = room;
        setState(room.state);
        setSeq(room.seq);
        setParticipants(room.participants.length);
        setCamera((current) => (state ? current : fitCamera(room.state, viewport)));

        try {
          setStatus("Joining room");
          await room.send.Join({
            name: `burner-${gearbase.address.slice(2, 6)}`,
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
          setSeq(room.seq);
          setParticipants(room.participants.length);
        });
        room.on("error", (nextError) => {
          setError(nextError.message);
          setStatus("Room update failed");
        });
        room.on("join", () => {
          setParticipants(room.participants.length);
        });
        room.on("leave", () => {
          setParticipants(room.participants.length);
        });

        setConnectionState("ready");
        setStatus("Live");
      } catch (nextError) {
        const message = nextError instanceof Error ? nextError.message : String(nextError);
        setConnectionState("error");
        setError(message);
        setStatus("Connection failed");
      }
    },
    [state, viewport],
  );

  useEffect(() => {
    const handleHashChange = () => {
      const nextRoomId = readRoomIdFromHash(DEFAULT_ROOM_ID);
      setRoomIdInput(nextRoomId);
      setActiveRoomId(nextRoomId);
    };

    window.addEventListener("hashchange", handleHashChange);
    return () => {
      window.removeEventListener("hashchange", handleHashChange);
    };
  }, []);

  useEffect(() => {
    if (!activeRoomId) {
      return;
    }

    void connectToRoom(activeRoomId);

    return () => {
      roomRef.current?.dispose();
      roomRef.current = null;
      void gearbaseRef.current?.disconnect().catch(() => undefined);
      gearbaseRef.current = null;
    };
  }, [activeRoomId, connectToRoom]);

  useEffect(() => {
    if (!stageRef.current) {
      return;
    }

    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      const nextViewport = {
        width: Math.max(320, Math.floor(entry.contentRect.width)),
        height: Math.max(320, Math.floor(entry.contentRect.height)),
      };
      setViewport(nextViewport);
      setCamera((current) => {
        if (!state) {
          return current;
        }
        if (current.zoom === 4 && current.offsetX === 32 && current.offsetY === 32) {
          return fitCamera(state, nextViewport);
        }
        return current;
      });
    });

    resizeObserver.observe(stageRef.current);
    return () => {
      resizeObserver.disconnect();
    };
  }, [state]);

  const pixelFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      if (!state || !stageRef.current) {
        return null;
      }

      const rect = stageRef.current.getBoundingClientRect();
      const x = Math.floor((clientX - rect.left - camera.offsetX) / camera.zoom);
      const y = Math.floor((clientY - rect.top - camera.offsetY) / camera.zoom);

      if (x < 0 || y < 0 || x >= state.config.width || y >= state.config.height) {
        return null;
      }

      return { x, y };
    },
    [camera, state],
  );

  const submitRoom = useCallback(() => {
    const nextRoomId = roomIdInput.trim();
    if (!nextRoomId) {
      return;
    }
    window.location.hash = `/${nextRoomId}`;
    setActiveRoomId(nextRoomId);
  }, [roomIdInput]);

  const placePixel = useCallback(
    async (pixel: HoveredPixel) => {
      const room = roomRef.current;
      if (!room) {
        return;
      }

      try {
        await room.send.PlacePixel({
          x: pixel.x,
          y: pixel.y,
          color: selectedColor,
        });
        setStatus(`Placed ${pixel.x}, ${pixel.y}`);
        setError("");
      } catch (nextError) {
        const message = nextError instanceof Error ? nextError.message : String(nextError);
        setError(message);
        setStatus("Pixel write failed");
      }
    },
    [selectedColor],
  );

  return (
    <main className="canvas-app">
      <section className="toolbar">
        <div className="toolbar__group toolbar__group--grow">
          <div className="brand">
            <strong>gearbase</strong>
            <span>canvas</span>
          </div>
          <label className="room-input">
            <span>Room</span>
            <input
              value={roomIdInput}
              onChange={(event) => setRoomIdInput(event.target.value)}
              placeholder="0x..."
            />
          </label>
          <button className="action-button" onClick={submitRoom}>
            Open room
          </button>
        </div>
        <div className="toolbar__group">
          <div className={`pill pill--${connectionState}`}>{status}</div>
        </div>
      </section>

      <section className="workspace">
        <div className="stage" ref={stageRef}>
          <CanvasStage
            state={state}
            camera={camera}
            viewport={viewport}
            selectedColor={selectedColor}
            hoveredPixel={hoveredPixel}
            onPointerDown={(event) => {
              dragStartRef.current = {
                pointerX: event.clientX,
                pointerY: event.clientY,
                offsetX: camera.offsetX,
                offsetY: camera.offsetY,
                moved: false,
              };
            }}
            onPointerMove={(event) => {
              const pixel = pixelFromPointer(event.clientX, event.clientY);
              setHoveredPixel(pixel);

              const drag = dragStartRef.current;
              if (!drag || (event.buttons & 1) === 0) {
                return;
              }

              const deltaX = event.clientX - drag.pointerX;
              const deltaY = event.clientY - drag.pointerY;
              if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
                drag.moved = true;
              }
              if (drag.moved) {
                setCamera((current) => ({
                  ...current,
                  offsetX: drag.offsetX + deltaX,
                  offsetY: drag.offsetY + deltaY,
                }));
              }
            }}
            onPointerLeave={() => {
              setHoveredPixel(null);
              dragStartRef.current = null;
            }}
            onPointerUp={(event) => {
              const drag = dragStartRef.current;
              const pixel = pixelFromPointer(event.clientX, event.clientY);
              dragStartRef.current = null;
              if (drag && !drag.moved && pixel) {
                void placePixel(pixel);
              }
            }}
            onWheel={(event) => {
              event.preventDefault();
              const pixel = pixelFromPointer(event.clientX, event.clientY);
              const scaleFactor = event.deltaY > 0 ? 0.88 : 1.14;
              setCamera((current) => {
                const nextZoom = Math.min(36, Math.max(2, current.zoom * scaleFactor));
                if (!pixel || !stageRef.current) {
                  return { ...current, zoom: nextZoom };
                }

                const rect = stageRef.current.getBoundingClientRect();
                const pointerX = event.clientX - rect.left;
                const pointerY = event.clientY - rect.top;

                return {
                  zoom: nextZoom,
                  offsetX: pointerX - pixel.x * nextZoom,
                  offsetY: pointerY - pixel.y * nextZoom,
                };
              });
            }}
          />
        </div>

        <div className="sidebar-wrap">
          <Palette selectedColor={selectedColor} onSelect={setSelectedColor} />
          <Sidebar
            address={address}
            activeRoomId={activeRoomId}
            participants={participants}
            seq={seq}
            state={state}
            hoveredPixel={hoveredPixel}
            error={error}
          />
        </div>
      </section>
    </main>
  );
}
