export function memoryStorage(initial = {}) {
  const m = new Map(Object.entries(initial));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    dump: () => Object.fromEntries(m),
  };
}

export function clock(start = 1_700_000_000_000) {
  let t = start;
  const now = () => t;
  now.tick = (ms = 1000) => (t += ms);
  return now;
}
