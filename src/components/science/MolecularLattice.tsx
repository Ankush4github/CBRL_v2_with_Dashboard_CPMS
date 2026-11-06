/**
 * A faint hexagonal lattice with a few lipid-like tails, drawn in currentColor.
 * Pure decoration behind page headers: aria-hidden, no motion, no data.
 */
export default function MolecularLattice({ className }: { className?: string }) {
  // Flat-topped hexagons on a fixed grid. Deterministic so the server and
  // client render the same markup.
  const hexes: Array<[number, number]> = [
    [60, 40], [112, 70], [164, 40], [216, 70], [268, 40],
    [112, 130], [164, 160], [216, 130], [268, 160], [320, 130],
    [164, 220], [216, 250], [268, 220], [320, 250], [372, 220],
    [268, 300], [320, 330], [372, 300],
  ];
  const hex = (x: number, y: number) =>
    `M${x - 30} ${y}l15 -26h30l15 26l-15 26h-30z`;

  return (
    <svg className={className} viewBox="0 0 440 400" fill="none" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.2">
        {hexes.map(([x, y]) => (
          <path key={`${x}-${y}`} d={hex(x, y)} />
        ))}
        {/* Acyl chains trailing off two of the rings */}
        <path d="M402 300l18 10l18 -10l18 10l18 -10" />
        <path d="M402 220l18 -10l18 10l18 -10" />
        <path d="M30 40l-18 10l-18 -10" />
      </g>
      <g fill="currentColor">
        {hexes.filter((_, i) => i % 4 === 0).map(([x, y]) => (
          <circle key={`d-${x}-${y}`} cx={x + 15} cy={y - 26} r="3" />
        ))}
      </g>
    </svg>
  );
}
