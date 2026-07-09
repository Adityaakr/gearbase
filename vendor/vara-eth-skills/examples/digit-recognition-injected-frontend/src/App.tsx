import { useEffect, useRef, useState } from "react";
import {
  bestDigit,
  connectVaraEth,
  readConfig,
  readDigitResult,
  sendInjectedPrediction,
  type DigitPrediction,
  type InjectedPredictionResult,
  type VaraEthSession,
} from "./varaEth";
import "./styles.css";

const CANVAS_SIZE = 280;
const LOW_RES_SIZE = 28;
const INJECTED_TX_TIMER = "digit-recognition: injected tx";
const RESULT_READ_TIMER = "digit-recognition: result read";

type Phase =
  | "idle"
  | "connecting"
  | "ready"
  | "signing"
  | "waiting"
  | "reading"
  | "confirmed"
  | "failed";

function shortHex(value: string) {
  return `${value.slice(0, 8)}...${value.slice(-6)}`;
}

function emptyCanvas(ctx: CanvasRenderingContext2D) {
  ctx.fillStyle = "#050505";
  ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
}

function getCanvasPoint(canvas: HTMLCanvasElement, event: React.PointerEvent) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: ((event.clientX - rect.left) / rect.width) * CANVAS_SIZE,
    y: ((event.clientY - rect.top) / rect.height) * CANVAS_SIZE,
  };
}

function downscaleCanvas(canvas: HTMLCanvasElement): number[] {
  const offscreen = document.createElement("canvas");
  offscreen.width = LOW_RES_SIZE;
  offscreen.height = LOW_RES_SIZE;

  const ctx = offscreen.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not create downscale canvas");

  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(canvas, 0, 0, LOW_RES_SIZE, LOW_RES_SIZE);

  const image = ctx.getImageData(0, 0, LOW_RES_SIZE, LOW_RES_SIZE).data;
  const pixels: number[] = [];

  for (let i = 0; i < image.length; i += 4) {
    const gray = Math.round(
      0.299 * image[i] + 0.587 * image[i + 1] + 0.114 * image[i + 2],
    );
    pixels.push(gray);
  }

  return pixels;
}

function PredictionBars({ predictions }: { predictions: DigitPrediction[] }) {
  const max = Math.max(...predictions.map((item) => item.probability), 0);

  return (
    <div className="bars" aria-label="Digit probabilities">
      {predictions.map((item) => (
        <div className="barRow" key={item.digit}>
          <span className="digit">{item.digit}</span>
          <span className="barTrack">
            <span
              className="barFill"
              style={{
                width:
                  max > 0 ? `${(item.probability / max) * 100}%` : "0%",
              }}
            />
          </span>
          <span className="pct">{(item.probability * 100).toFixed(2)}%</span>
        </div>
      ))}
    </div>
  );
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [session, setSession] = useState<VaraEthSession | null>(null);
  const [hasInk, setHasInk] = useState(false);
  const [predictions, setPredictions] = useState<DigitPrediction[]>([]);
  const [injectedResult, setInjectedResult] =
    useState<InjectedPredictionResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const config = readConfig();
  const hasConfig = config.missing.length === 0;
  const best = bestDigit(predictions);
  const isBusy =
    phase === "connecting" ||
    phase === "signing" ||
    phase === "waiting" ||
    phase === "reading";

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d", { willReadFrequently: true });
    if (ctx) emptyCanvas(ctx);
  }, []);

  useEffect(() => {
    return () => {
      session?.provider.disconnect();
    };
  }, [session]);

  async function connect() {
    try {
      setError(null);
      setPhase("connecting");
      const nextSession = await connectVaraEth();
      setSession(nextSession);
      setPhase("ready");
    } catch (cause) {
      setPhase("failed");
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  function clear() {
    const ctx = canvasRef.current?.getContext("2d", {
      willReadFrequently: true,
    });
    if (ctx) emptyCanvas(ctx);
    setHasInk(false);
    setPredictions([]);
    setInjectedResult(null);
    setError(null);
    setPhase(session ? "ready" : "idle");
  }

  function startDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
    if (isBusy) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    canvas.setPointerCapture(event.pointerId);
    drawingRef.current = true;
    const point = getCanvasPoint(canvas, event);
    ctx.beginPath();
    ctx.moveTo(point.x, point.y);
    setHasInk(true);
  }

  function draw(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || isBusy) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;

    const point = getCanvasPoint(canvas, event);
    ctx.strokeStyle = "#f7f7f1";
    ctx.lineWidth = 18;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
  }

  function stopDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
    drawingRef.current = false;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  async function submit() {
    const activeSession = session ?? (await connectVaraEth());
    if (!session) setSession(activeSession);

    const canvas = canvasRef.current;
    if (!canvas) return;

    try {
      setError(null);
      setPredictions([]);
      setInjectedResult(null);

      const pixels = downscaleCanvas(canvas);
      setPhase("signing");

      console.time(INJECTED_TX_TIMER);
      let result: InjectedPredictionResult;
      try {
        result = await sendInjectedPrediction(activeSession, pixels);
      } finally {
        console.timeEnd(INJECTED_TX_TIMER);
      }
      setInjectedResult(result);

      setPhase("reading");
      console.time(RESULT_READ_TIMER);
      let nextPredictions: DigitPrediction[];
      try {
        nextPredictions = await readDigitResult(activeSession);
      } finally {
        console.timeEnd(RESULT_READ_TIMER);
      }
      setPredictions(nextPredictions);
      setPhase("confirmed");
    } catch (cause) {
      setPhase("failed");
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  async function refreshState() {
    if (!session) return;

    try {
      setError(null);
      setPhase("reading");
      setPredictions(await readDigitResult(session));
      setPhase("confirmed");
    } catch (cause) {
      setPhase("failed");
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }

  return (
    <main className="shell">
      <section className="workspace">
        <div className="canvasPanel">
          <div className="canvasFrame">
            <canvas
              ref={canvasRef}
              width={CANVAS_SIZE}
              height={CANVAS_SIZE}
              className="digitCanvas"
              onPointerDown={startDrawing}
              onPointerMove={draw}
              onPointerUp={stopDrawing}
              onPointerLeave={() => {
                drawingRef.current = false;
              }}
            />
          </div>
          <div className="toolbar">
            <button type="button" onClick={clear} disabled={isBusy}>
              Clear
            </button>
            <button
              type="button"
              className="primary"
              onClick={submit}
              disabled={!hasInk || isBusy || !hasConfig}
            >
              Submit
            </button>
          </div>
        </div>

        <aside className="sidePanel">
          <div className="topline">
            <h1>Digit Recognition</h1>
            <button type="button" onClick={connect} disabled={isBusy}>
              {session ? shortHex(session.address) : "Connect"}
            </button>
          </div>

          <div className={`status ${phase}`}>
            <span>{phase}</span>
            {!hasConfig && (
              <strong>Missing config: {config.missing.join(", ")}</strong>
            )}
            {error && <strong>{error}</strong>}
          </div>

          <dl className="facts">
            <div>
              <dt>Program</dt>
              <dd>{config.programId ? shortHex(config.programId) : "not set"}</dd>
            </div>
            <div>
              <dt>Router</dt>
              <dd>
                {config.routerAddress ? shortHex(config.routerAddress) : "not set"}
              </dd>
            </div>
            {injectedResult && (
              <>
                <div>
                  <dt>Message</dt>
                  <dd>{shortHex(injectedResult.messageId)}</dd>
                </div>
                <div>
                  <dt>Promise</dt>
                  <dd>{shortHex(injectedResult.txHash)}</dd>
                </div>
                <div>
                  <dt>Reply</dt>
                  <dd>{injectedResult.replyCode}</dd>
                </div>
              </>
            )}
          </dl>

          {best && (
            <div className="answer">
              <span className="answerDigit">{best.digit}</span>
              <span>{(best.probability * 100).toFixed(2)}%</span>
            </div>
          )}

          {predictions.length > 0 && <PredictionBars predictions={predictions} />}

          <button
            type="button"
            className="secondary"
            onClick={refreshState}
            disabled={!session || isBusy}
          >
            Refresh State
          </button>
        </aside>
      </section>
    </main>
  );
}
