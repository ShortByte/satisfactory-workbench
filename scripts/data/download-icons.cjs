// Downloads 64px item icons for every item in game-data.json into public/icons/items.
//   node scripts/data/download-icons.cjs
// Run build-game-data.cjs first (needs the icon slugs).
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const data = require(path.join(ROOT, 'src/app/features/calculator/data/game-data.json'));
const OUT = path.join(ROOT, 'public/icons/items');
const BASE = 'https://raw.githubusercontent.com/greeny/SatisfactoryTools/master/www/assets/images/items';

const slugs = [...new Set(Object.values(data.items).map((i) => i.icon).filter(Boolean))];
fs.mkdirSync(OUT, { recursive: true });
let done = 0, ok = 0, fail = 0;

async function one(slug) {
  const file = path.join(OUT, `${slug}.png`);
  if (fs.existsSync(file)) { ok++; done++; return; }
  try {
    const res = await fetch(`${BASE}/${slug}_64.png`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    fs.writeFileSync(file, Buffer.from(await res.arrayBuffer()));
    ok++;
  } catch (e) { fail++; console.error('FAIL', slug, e.message); } finally { done++; }
}

(async () => {
  console.log('icons to fetch:', slugs.length);
  let i = 0;
  await Promise.all(Array.from({ length: 8 }, async () => { while (i < slugs.length) await one(slugs[i++]); }));
  console.log(`done: ${ok} ok, ${fail} failed`);
})();
