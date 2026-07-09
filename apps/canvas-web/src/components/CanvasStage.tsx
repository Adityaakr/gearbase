import { useEffect, useMemo, useRef } from "react";
import type { CanvasState } from "@gearbase/sdk";

import {
  buildBitmap,
  PALETTE,
  type Camera,
  type HoveredPixel,
  type Viewport,
} from "../lib/canvas";

type CanvasStageProps = {
  state: CanvasState | null;
  camera: Camera;
  viewport: Viewport;
  selectedColor: number;
  hoveredPixel: HoveredPixel | null;
  onPointerDown: (event: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerMove: (event: React.PointerEvent<HTMLCanvasElement>) => void;
  onPointerLeave: () => void;
  onPointerUp: (event: React.PointerEvent<HTMLCanvasElement>) => void;
  onWheel: (event: React.WheelEvent<HTMLCanvasElement>) => void;
};

export function CanvasStage({
  state,
  camera,
  viewport,
  selectedColor,
  hoveredPixel,
  onPointerDown,
  onPointerMove,
  onPointerLeave,
  onPointerUp,
  onWheel,
}: CanvasStageProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const bitmap = useMemo(() => buildBitmap(state), [state]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !bitmap) {
      return;
    }

    const ratio = window.devicePixelRatio || 1;
    const width = Math.floor(viewport.width * ratio);
    const height = Math.floor(viewport.height * ratio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.scale(ratio, ratio);
    ctx.fillStyle = "#070b10";
    ctx.fillRect(0, 0, viewport.width, viewport.height);

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.translate(camera.offsetX, camera.offsetY);
    ctx.scale(camera.zoom, camera.zoom);
    ctx.drawImage(bitmap, 0, 0);

    if (hoveredPixel) {
      ctx.lineWidth = Math.max(0.06, 1 / camera.zoom);
      ctx.strokeStyle = PALETTE[selectedColor];
      ctx.strokeRect(hoveredPixel.x, hoveredPixel.y, 1, 1);
    }

    ctx.restore();
  }, [bitmap, camera, hoveredPixel, selectedColor, viewport]);

  return (
    <canvas
      ref={canvasRef}
      className="stage__canvas"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onPointerUp={onPointerUp}
      onWheel={onWheel}
    />
  );
}
