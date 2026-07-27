// Soft, named colors for your regular couriers. Anyone not on this list
// gets the neutral "default" gray badge automatically — no need to touch
// this file when a new one-off carrier shows up.
export const CARRIER_COLORS = {
  NordFrost: 'blue',
  Wesemann: 'green',
  LIT: 'gold',
  BlueWater: 'teal',
  Wegner: 'purple',
  Bremer: 'peach',
  Girteka: 'pink',
};

export function carrierColorClass(carrierName) {
  const target = String(carrierName || '').trim().toLowerCase();
  if (!target) return 'default';
  const match = Object.keys(CARRIER_COLORS).find((k) => k.toLowerCase() === target);
  return match ? CARRIER_COLORS[match] : 'default';
}
