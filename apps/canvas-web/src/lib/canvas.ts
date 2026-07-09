import type { CanvasState } from "@gearbase/sdk";

export const PALETTE = [
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

export type Viewport = {
  width: number;
  height: number;
};

export type Camera = {
  zoom: number;
  offsetX: number;
  offsetY: number;
};

export type HoveredPixel = {
  x: number;
  y: number;
};

export function compactAddress(value: string): string {
  return `${value.slice(0, 6)}...${value.slice(-4)}`;
}

export function readRoomIdFromHash(defaultRoomId: string): string {
  const hash = window.location.hash;
  if (hash.startsWith("#/")) {
    return hash.slice(2);
  }
  return defaultRoomId;
}

export function getPackedPixel(
  pixels: Uint8Array,
  width: number,
  x: number,
  y: number,
): number {
  const index = y * width + x;
  const byte = pixels[Math.floor(index / 2)] ?? 0;
  return index % 2 === 1 ? (byte >> 4) & 0x0f : byte & 0x0f;
}

export function buildBitmap(state: CanvasState | null): HTMLCanvasElement | null {
  if (!state) {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = state.config.width;
  canvas.height = state.config.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return null;
  }

  const image = ctx.createImageData(state.config.width, state.config.height);
  for (let y = 0; y < state.config.height; y += 1) {
    for (let x = 0; x < state.config.width; x += 1) {
      const colorIndex = getPackedPixel(state.pixels, state.config.width, x, y);
      const color = PALETTE[colorIndex] ?? PALETTE[0];
      const offset = (y * state.config.width + x) * 4;
      image.data[offset] = Number.parseInt(color.slice(1, 3), 16);
      image.data[offset + 1] = Number.parseInt(color.slice(3, 5), 16);
      image.data[offset + 2] = Number.parseInt(color.slice(5, 7), 16);
      image.data[offset + 3] = 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  return canvas;
}

export function fitCamera(state: CanvasState, viewport: Viewport): Camera {
  const zoom = Math.max(
    2,
    Math.floor(
      Math.min(
        (viewport.width - 32) / Math.max(1, state.config.width),
        (viewport.height - 32) / Math.max(1, state.config.height),
      ),
    ),
  );

  return {
    zoom,
    offsetX: Math.floor((viewport.width - state.config.width * zoom) / 2),
    offsetY: Math.floor((viewport.height - state.config.height * zoom) / 2),
  };
}
