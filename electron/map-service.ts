import type { SatisfactorySave } from '@etothepii/satisfactory-file-parser';
import type {
  FeatureCategory,
  FeatureCategoryCounts,
  MapFeature,
  MapFeatureSet,
} from '../src/shared/ipc-types';
import { RESOURCE_NODES, type RefPurity } from './data/resource-nodes';

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

  if (!Number.isFinite(minX)) {
    minX = maxX = minY = maxY = 0;
  }

  return { features, counts, bounds: { minX, maxX, minY, maxY } };
}
