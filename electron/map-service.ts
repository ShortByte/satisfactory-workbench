import type { SatisfactorySave } from '@etothepii/satisfactory-file-parser';
import type {
  FeatureCategory,
  FeatureCategoryCounts,
  MapFeature,
  MapFeatureSet,
} from '../src/shared/ipc-types';
import { RESOURCE_NODES, RESOURCE_WELLS, type RefPurity } from './data/resource-nodes';

/** Shape of the FGLightweightBuildableSubsystem's parsed special properties. */
interface LightweightSpecialProps {
  type?: string;
  buildables?: Array<{
    typeReference?: { pathName?: string };
    instances?: Array<{
      transform?: {
        translation?: { x: number; y: number; z: number };
        rotation?: { x: number; y: number; z: number; w: number };
      };
    }>;
  }>;
}

/** Spatial grid over the reference nodes for fast nearest-match by position. */
const NODE_CELL = 20000; // cm
type RefEntry = { resource: string; purity: RefPurity; x: number; y: number };
const nodeGrid = new Map<string, RefEntry[]>();
for (const [resource, purity, x, y] of RESOURCE_NODES) {
  const key = `${Math.floor(x / NODE_CELL)},${Math.floor(y / NODE_CELL)}`;
  const cell = nodeGrid.get(key);
  if (cell) cell.push({ resource, purity, x, y });
  else nodeGrid.set(key, [{ resource, purity, x, y }]);
}

/** Reference wells (fracking cores) — few of them, so a flat list is fine. */
const WELLS: { resource: string; x: number; y: number }[] = RESOURCE_WELLS.map(
  ([resource, x, y]) => ({ resource, x, y }),
);

/** Resource of the well nearest to (x, y) within ~5 m, if any. */
function matchWell(x: number, y: number): string | undefined {
  let best: string | undefined;
  let bestD = 500 * 500;
  for (const w of WELLS) {
    const d = (w.x - x) ** 2 + (w.y - y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = w.resource;
    }
  }
  return best;
}

/** Find the reference node nearest to (x, y) within ~4 m, if any. */
function matchNode(x: number, y: number): RefEntry | undefined {
  const cx = Math.floor(x / NODE_CELL);
  const cy = Math.floor(y / NODE_CELL);
  let best: RefEntry | undefined;
  let bestD = 400 * 400; // tolerance² (matches are sub-metre; 4 m is generous)
  for (let dx = -1; dx <= 1; dx++) {
    for (let dy = -1; dy <= 1; dy++) {
      const cell = nodeGrid.get(`${cx + dx},${cy + dy}`);
      if (!cell) continue;
      for (const n of cell) {
        const d = (n.x - x) ** 2 + (n.y - y) ** 2;
        if (d < bestD) {
          bestD = d;
          best = n;
        }
      }
    }
  }
  return best;
}

/** All categories, used to initialise counts to zero. */
const CATEGORIES: FeatureCategory[] = [
  'resourceNode',
  'geyser',
  'fracking',
  'resourceDeposit',
  'extractor',
  'production',
  'power',
  'logistics',
  'storage',
  'foundation',
  'wall',
  'ramp',
  'support',
  'vehicle',
  'creature',
  'flora',
  'player',
  'other',
];

/**
 * Ordered classification rules — first match wins, so put specific patterns
 * before generic ones (e.g. geyser before resourceNode).
 */
const RULES: Array<{ category: FeatureCategory; test: RegExp }> = [
  { category: 'geyser', test: /ResourceNodeGeyser/ },
  { category: 'fracking', test: /Fracking(Core|Satellite)/ },
  { category: 'resourceNode', test: /BP_ResourceNode[._]/ },
  { category: 'resourceDeposit', test: /ResourceDeposit/ },
  {
    category: 'extractor',
    test: /Build_(MinerMk\d|Miner|OilPump|WaterPump|FrackingExtractor|FrackingSmasher)/,
  },
  {
    category: 'power',
    test: /Build_(GeneratorCoal|GeneratorFuel|GeneratorNuclear|GeneratorGeoThermal|GeneratorBiomass|Generator|PowerPole|PowerLine|PowerSwitch|PowerStorage|Battery|AlienPowerBuilding)/,
  },
  {
    category: 'production',
    test: /Build_(SmelterMk\d|Smelter|Foundry|ConstructorMk\d|Constructor|AssemblerMk\d|Assembler|ManufacturerMk\d|Manufacturer|OilRefinery|Refinery|Packager|Blender|HadronCollider|Converter|QuantumEncoder|ParticleAccelerator)/,
  },
  {
    category: 'logistics',
    test: /Build_(ConveyorBelt|ConveyorLift|ConveyorAttachment|ConveyorPole|ConveyorCeiling|Conveyor|PipelinePump|PipelineJunction|PipelineSupport|PipelineFlow|Pipeline|Pipe|Splitter|Merger|DockingStation|TrainStation|TruckStation|RailroadTrack|Railroad|DroneStation|Drone)/,
  },
  {
    category: 'storage',
    test: /Build_(StorageContainer|IndustrialTank|PipeStorageTank|FluidStorage|Storage)/,
  },
  {
    category: 'vehicle',
    test: /(Locomotive|FreightWagon|Wagon|Truck|Tractor|Explorer|FactoryCart|CyberWagon|DroneTransport|Vehicle)/,
  },
  { category: 'creature', test: /(CreatureSpawner|Creature|BP_Hog|BP_.*Spitter|BP_Stinger|BP_Crab|SpaceGiraffe|BP_.*Parts)/ },
  {
    category: 'flora',
    test: /(BerryBush|NutBush|Shroom|Crystal|PowerSlug|Pickup|BP_WAT|Mycelia|Flower|BP_Nut|BP_Berry)/,
  },
  { category: 'player', test: /(Char_Player|FGPlayer|PlayerState|Character\/Player)/ },
  // Structural build pieces, split into individually toggleable layers. Kept last
  // so machines/logistics/power win first; these only catch raw structure.
  // Passthroughs first — they carry "Foundation" but aren't plates.
  { category: 'support', test: /Build_(FoundationPassthrough|Passthrough)/ },
  // Broad match so material variants are caught too (e.g. Foundation_Concrete_8x1).
  { category: 'foundation', test: /Build_Foundation/ },
  { category: 'ramp', test: /Build_Ramp/ },
  { category: 'wall', test: /Build_(Wall|Gate|DoorFrame|BigGarageDoor)/ },
  {
    category: 'support',
    test: /Build_(Beam|Pillar|Frame|Catwalk|Stair|Ladder|QuarterPipe|Fence|Railing|Walkway|Roof|Barrier)/,
  },
];

function classify(typePath: string): FeatureCategory {
  for (const rule of RULES) {
    if (rule.test.test(typePath)) return rule.category;
  }
  return 'other';
}

/** Trailing class name, e.g. "…/Build_MinerMk2.Build_MinerMk2_C" -> "Build_MinerMk2". */
function shortType(typePath: string): string {
  const last = typePath.split('/').pop() ?? typePath;
  return (last.split('.').pop() ?? last).replace(/_C$/, '');
}

/** Compact id from an instance name (drops the level/path prefix). */
function shortId(instanceName: string): string {
  const afterDot = instanceName.split('.').pop() ?? instanceName;
  return afterDot;
}

/** Footprint size (cm) for a scaled structure, or null if it isn't drawn to scale. */
function structureSize(category: FeatureCategory, type: string): { sizeX: number; sizeY: number } | null {
  if (category !== 'foundation' && category !== 'ramp' && category !== 'wall') return null;
  const m = /_(\d+)x\d+/.exec(type);
  if (!m) return null;
  const long = parseInt(m[1], 10) * 100; // metres → cm
  // Walls run along the local Y axis at yaw 0 (verified against save data): long
  // on Y, thin on X. Foundations/ramps are square.
  if (category === 'wall') return { sizeX: 100, sizeY: long };
  return { sizeX: long, sizeY: long };
}

/** Yaw (degrees) around the Z axis from a rotation quaternion (x,y,z,w). */
function yawDegrees(q: { x: number; y: number; z: number; w: number }): number {
  const siny = 2 * (q.w * q.z + q.x * q.y);
  const cosy = 1 - 2 * (q.y * q.y + q.z * q.z);
  return (Math.atan2(siny, cosy) * 180) / Math.PI;
}

/** Read an ObjectProperty's pathName, if present. */
function objectPropPath(properties: unknown, key: string): string | undefined {
  const props = properties as Record<string, { value?: { pathName?: string } }> | undefined;
  const v = props?.[key]?.value;
  return v && typeof v.pathName === 'string' ? v.pathName : undefined;
}

/** Read a numeric (Float/Int) property value, if present. */
function numberProp(properties: unknown, key: string): number | undefined {
  const props = properties as Record<string, { value?: unknown }> | undefined;
  const v = props?.[key]?.value;
  return typeof v === 'number' ? v : undefined;
}

/** "…/Desc_OreIron.Desc_OreIron_C" -> "OreIron". */
function shortResource(itemPath: string): string {
  const last = itemPath.split('.').pop() ?? itemPath;
  return last.replace(/^Desc_/, '').replace(/_C$/, '');
}

/**
 * Determine the resource an extractor produces, straight from the save's
 * OutputInventory component (authoritative & update-safe). Prefers the allowed
 * item descriptors (independent of the current buffer) and falls back to the
 * items currently in the stacks.
 */
function extractorResource(
  extractorInstanceName: string,
  byName: Map<string, { properties?: unknown }>,
): string | undefined {
  const inv = byName.get(`${extractorInstanceName}.OutputInventory`);
  const props = inv?.properties as
    | {
        mAllowedItemDescriptors?: { values?: Array<{ pathName?: string }> };
        mInventoryStacks?: {
          values?: Array<{ properties?: { Item?: { value?: { itemReference?: { pathName?: string } } } } }>;
        };
      }
    | undefined;

  const allowed = props?.mAllowedItemDescriptors?.values;
  if (allowed && allowed.length && allowed[0].pathName) return shortResource(allowed[0].pathName);

  for (const stack of props?.mInventoryStacks?.values ?? []) {
    const ref = stack?.properties?.Item?.value?.itemReference?.pathName;
    if (ref) return shortResource(ref);
  }
  return undefined;
}

/**
 * Walk every level of a parsed save and produce a compact, categorised set of
 * positioned features for the map.
 */
export function extractMapFeatures(save: SatisfactorySave): MapFeatureSet {
  const features: MapFeature[] = [];
  const counts = Object.fromEntries(CATEGORIES.map((c) => [c, 0])) as FeatureCategoryCounts;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  // Index every object by instance name so extractors can find their
  // OutputInventory component (and future features can resolve references).
  const byName = new Map<string, { properties?: unknown }>();
  // Resource nodes/wells that already have an extractor on them — their own
  // marker is suppressed so it doesn't sit doubled underneath the extractor.
  const occupiedSources = new Set<string>();
  for (const level of Object.values(save.levels)) {
    for (const obj of level.objects ?? []) {
      const name = (obj as { instanceName?: string }).instanceName;
      if (name) byName.set(name, obj as { properties?: unknown });
      if ((obj as { type?: string }).type === 'SaveEntity') {
        const tp = (obj as { typePath?: string }).typePath ?? '';
        if (classify(tp) === 'extractor') {
          const src = objectPropPath((obj as { properties?: unknown }).properties, 'mExtractableResource');
          if (src) occupiedSources.add(src);
        }
      }
    }
  }

  for (const level of Object.values(save.levels)) {
    for (const obj of level.objects ?? []) {
      if ((obj as { type?: string }).type !== 'SaveEntity') continue;
      const entity = obj as unknown as {
        typePath: string;
        instanceName: string;
        transform?: { translation?: { x: number; y: number; z: number }; rotation?: { x: number; y: number; z: number; w: number } };
        properties?: unknown;
      };
      const t = entity.transform?.translation;
      if (!t || typeof t.x !== 'number') continue;

      // Skip a resource node/well that an extractor already occupies.
      if (occupiedSources.has(entity.instanceName)) continue;

      const category = classify(entity.typePath);
      counts[category]++;

      const feature: MapFeature = {
        id: shortId(entity.instanceName),
        category,
        type: shortType(entity.typePath),
        x: Math.round(t.x),
        y: Math.round(t.y),
        z: Math.round(t.z),
      };

      const rot = entity.transform?.rotation;
      if (rot && typeof rot.w === 'number') feature.rot = Math.round(yawDegrees(rot));

      if (category === 'resourceNode') {
        // Nodes aren't typed in the save — match position against reference data.
        const m = matchNode(t.x, t.y);
        if (m) {
          feature.resource = m.resource;
          feature.purity = m.purity;
        }
      }

      const sz = structureSize(category, feature.type);
      if (sz) {
        feature.sizeX = sz.sizeX;
        feature.sizeY = sz.sizeY;
      }

      if (category === 'fracking' && /FrackingCore/.test(entity.typePath)) {
        // Type the well core (oil / nitrogen / water) via the reference wells.
        const resource = matchWell(t.x, t.y);
        if (resource) feature.resource = resource;
      }

      if (category === 'extractor') {
        const extracts = objectPropPath(entity.properties, 'mExtractableResource');
        if (extracts) feature.extracts = extracts;
        const resource = extractorResource(entity.instanceName, byName);
        if (resource) feature.resource = resource;
        // Overclock: default 100 % if not stored (only overclocked ones save it).
        feature.clock =
          numberProp(entity.properties, 'mCurrentPotential') ??
          numberProp(entity.properties, 'mPendingPotential') ??
          1;
        // Purity of the mined node: match the referenced node's position.
        const node = byName.get(extracts ?? '') as
          | { transform?: { translation?: { x: number; y: number } } }
          | undefined;
        const nt = node?.transform?.translation;
        const m = nt ? matchNode(nt.x, nt.y) : matchNode(t.x, t.y);
        if (m) feature.purity = m.purity;
      }

      features.push(feature);
      minX = Math.min(minX, feature.x);
      maxX = Math.max(maxX, feature.x);
      minY = Math.min(minY, feature.y);
      maxY = Math.max(maxY, feature.y);
    }
  }

  // Lightweight buildables: since Satisfactory 1.0, simple structures (foundations,
  // walls, ramps, pillars, roofs, …) are stored in bulk inside the
  // FGLightweightBuildableSubsystem instead of as individual objects.
  let lwIndex = 0;
  for (const level of Object.values(save.levels)) {
    for (const obj of level.objects ?? []) {
      const sp = (obj as { specialProperties?: LightweightSpecialProps }).specialProperties;
      if (sp?.type !== 'BuildableSubsystemSpecialProperties' || !Array.isArray(sp.buildables)) {
        continue;
      }
      for (const group of sp.buildables) {
        const typePath = group.typeReference?.pathName ?? '';
        if (!typePath) continue;
        const category = classify(typePath);
        const type = shortType(typePath);
        const sz = structureSize(category, type);
        for (const inst of group.instances ?? []) {
          const t = inst.transform?.translation;
          if (!t || typeof t.x !== 'number') continue;
          counts[category]++;

          const feature: MapFeature = {
            id: `lw${lwIndex++}`,
            category,
            type,
            x: Math.round(t.x),
            y: Math.round(t.y),
            z: Math.round(t.z),
          };
          const rot = inst.transform?.rotation;
          if (rot && typeof rot.w === 'number') feature.rot = Math.round(yawDegrees(rot));
          if (sz) {
            feature.sizeX = sz.sizeX;
            feature.sizeY = sz.sizeY;
          }

          features.push(feature);
          minX = Math.min(minX, feature.x);
          maxX = Math.max(maxX, feature.x);
          minY = Math.min(minY, feature.y);
          maxY = Math.max(maxY, feature.y);
        }
      }
    }
  }

  if (!Number.isFinite(minX)) {
    minX = maxX = minY = maxY = 0;
  }

  return { features, counts, bounds: { minX, maxX, minY, maxY } };
}
