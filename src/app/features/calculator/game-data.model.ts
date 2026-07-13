/** Types for the bundled Satisfactory game data (compacted from data1.0.json). */

export interface GItem {
  name: string;
  liquid: boolean;
  /** Icon slug, e.g. "desc-ironingot-c" (image at icons/items/<slug>.png). */
  icon: string;
}

export interface GStack {
  item: string;
  amount: number;
}

export interface GRecipe {
  className: string;
  name: string;
  alternate: boolean;
  /** Seconds per production cycle. */
  time: number;
  ingredients: GStack[];
  products: GStack[];
  /** Building class it is produced in. */
  producedIn: string;
  variablePower: boolean;
  minPower: number;
  maxPower: number;
}

export interface GBuilding {
  name: string;
  /** Base power draw in MW at 100 % clock. */
  power: number;
}

export interface GameData {
  items: Record<string, GItem>;
  recipes: GRecipe[];
  buildings: Record<string, GBuilding>;
  /** Raw resource item classes (no machine recipe). */
  resources: string[];
}

/** One aggregated production step (a recipe run across N buildings). */
export interface ProdStep {
  recipe: GRecipe;
  buildingName: string;
  /** Number of buildings (may be fractional). */
  buildings: number;
  /** Output rate of the primary product, items or m³ per minute. */
  rate: number;
  /** Primary product item class. */
  item: string;
  itemName: string;
  /** Power draw in MW. */
  power: number;
}

/** A required raw resource. */
export interface RawInput {
  item: string;
  name: string;
  rate: number;
}

export interface ProdResult {
  steps: ProdStep[];
  raw: RawInput[];
  totalPower: number;
  totalBuildings: number;
  /** Non-fatal notes, e.g. a recipe loop that was cut to avoid divergence. */
  warnings: string[];
}

/** Per-item recipe override: item class -> chosen recipe class. */
export type RecipeChoices = Record<string, string>;

/** A node in the production tree (preserves the dependency hierarchy). */
export interface ProdTreeNode {
  item: string;
  itemName: string;
  /** Rate of this item required at this point, per minute. */
  rate: number;
  isRaw: boolean;
  recipe: GRecipe | null;
  buildingName: string;
  /** Number of buildings for this node (0 for raw). */
  buildings: number;
  power: number;
  children: ProdTreeNode[];
}
