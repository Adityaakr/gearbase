import type { CanvasState } from "@gearbase/sdk";

import { compactAddress, type HoveredPixel } from "../lib/canvas";

type SidebarProps = {
  address: string;
  activeRoomId: string;
  participants: number;
  seq: number;
  state: CanvasState | null;
  hoveredPixel: HoveredPixel | null;
  error: string;
};

export function Sidebar({
  address,
  activeRoomId,
  participants,
  seq,
  state,
  hoveredPixel,
  error,
}: SidebarProps) {
  return (
    <aside className="sidebar">
      <div className="sidebar__section">
        <div className="sidebar__label">Room</div>
        <dl className="stats">
          <div>
            <dt>Address</dt>
            <dd>{address ? compactAddress(address) : "-"}</dd>
          </div>
          <div>
            <dt>Participants</dt>
            <dd>{participants}</dd>
          </div>
          <div>
            <dt>Seq</dt>
            <dd>{seq}</dd>
          </div>
          <div>
            <dt>Grid</dt>
            <dd>{state ? `${state.config.width} x ${state.config.height}` : "-"}</dd>
          </div>
          <div>
            <dt>Hover</dt>
            <dd>{hoveredPixel ? `${hoveredPixel.x}, ${hoveredPixel.y}` : "-"}</dd>
          </div>
          <div>
            <dt>Hash</dt>
            <dd>{activeRoomId ? compactAddress(activeRoomId) : "-"}</dd>
          </div>
        </dl>
      </div>

      <div className="sidebar__section">
        <div className="sidebar__label">Network</div>
        <div className="network-line">Hoodi testnet</div>
        {error ? <div className="error-line">{error}</div> : null}
      </div>
    </aside>
  );
}
