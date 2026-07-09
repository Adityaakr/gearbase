import { PALETTE } from "../lib/canvas";

type PaletteProps = {
  selectedColor: number;
  onSelect: (colorIndex: number) => void;
};

export function Palette({ selectedColor, onSelect }: PaletteProps) {
  return (
    <div className="sidebar__section">
      <div className="sidebar__label">Palette</div>
      <div className="palette">
        {PALETTE.map((color, index) => (
          <button
            key={color}
            className={`palette__swatch${selectedColor === index ? " is-active" : ""}`}
            style={{ backgroundColor: color }}
            onClick={() => onSelect(index)}
            aria-label={`Select color ${index}`}
          />
        ))}
      </div>
    </div>
  );
}
