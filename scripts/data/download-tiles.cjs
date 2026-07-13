// Downloads The Hidden Gaming Lair "world" map tiles (zoom 0-4, webp) into
// public/map/world/{z}/{y}/{x}.webp. Resumable.
//   node scripts/data/download-tiles.cjs
//
// The URL contains a content hash. If th.gl updates their map, find the current
// tiles path in the page source of https://satisfactory.th.gl/maps/World
// (search for "tilesConfig" / "map-tiles/world-...") and update HASH below.
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const HASH = 'world-2df35f0493da3e344578a15599341a95';
const BASE = `https://cdn.th.gl/satisfactory/map-tiles/${HASH}`;
const OUT = path.join(ROOT, 'public/map/world');
const ZMIN = 0, ZMAX = 4, CONCURRENCY = 6;

const tasks = [];
for (let z = ZMIN; z <= ZMAX; z++) {
  const n = 2 ** z;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const file = path.join(OUT, String(z), String(y), `${x}.webp`);
      if (!fs.existsSync(file)) tasks.push({ z, x, y, file });
    }
}

let done = 0, ok = 0, fail = 0;
async function one(t) {
  try {
    const res = await fetch(`${BASE}/${t.z}/${t.y}/${t.x}.webp`, { headers: { 'User-Agent': 'satisfactory-workbench' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    fs.mkdirSync(path.dirname(t.file), { recursive: true });
    fs.writeFileSync(t.file, Buffer.from(await res.arrayBuffer()));
    ok++;
  } catch (e) { fail++; console.error('FAIL', `${t.z}/${t.y}/${t.x}`, e.message); } finally { done++; }
}

(async () => {
  console.log('tiles to fetch:', tasks.length);
  let i = 0;
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => { while (i < tasks.length) await one(tasks[i++]); }));
  console.log(`done: ${ok} ok, ${fail} failed`);
})();
