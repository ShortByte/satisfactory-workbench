// Regenerates src/app/features/calculator/data/game-data.json from the upstream
// greeny/SatisfactoryTools data1.0.json (items, machine recipes, buildings, resources).
//   node scripts/data/build-game-data.cjs
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../..');
const SRC = 'https://raw.githubusercontent.com/greeny/SatisfactoryTools/master/data/data1.0.json';
const OUT = path.join(ROOT, 'src/app/features/calculator/data/game-data.json');

(async () => {
  console.log('fetching', SRC);
  const res = await fetch(SRC);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const d = await res.json();

  const recipes = Object.values(d.recipes)
    .filter((r) => r.inMachine && !r.forBuilding && r.producedIn && r.producedIn.length)
    .map((r) => ({
      className: r.className,
      name: r.name,
      alternate: r.alternate,
      time: r.time,
      ingredients: r.ingredients.map((i) => ({ item: i.item, amount: i.amount })),
      products: r.products.map((p) => ({ item: p.item, amount: p.amount })),
      producedIn: r.producedIn[0],
      variablePower: r.isVariablePower || false,
      minPower: r.minPower || 0,
      maxPower: r.maxPower || 0,
    }));

  const buildings = {};
  for (const cn of new Set(recipes.map((r) => r.producedIn))) {
    const b = d.buildings[cn];
    buildings[cn] = { name: b ? b.name : cn, power: b && b.metadata ? b.metadata.powerConsumption || 0 : 0 };
  }

  const itemSet = new Set();
  for (const r of recipes) {
    r.ingredients.forEach((i) => itemSet.add(i.item));
    r.products.forEach((p) => itemSet.add(p.item));
  }
  Object.keys(d.resources).forEach((k) => itemSet.add(k));
  const items = {};
  for (const cn of itemSet) {
    const it = d.items[cn];
    items[cn] = { name: it ? it.name : cn, liquid: it ? !!it.liquid : false, icon: it ? it.icon : '' };
  }

  const out = { items, recipes, buildings, resources: Object.keys(d.resources) };
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(
    `wrote ${path.relative(ROOT, OUT)}: ${Object.keys(items).length} items, ${recipes.length} recipes, ` +
      `${Object.keys(buildings).length} buildings, ${out.resources.length} resources`,
  );
})().catch((e) => { console.error(e); process.exit(1); });
