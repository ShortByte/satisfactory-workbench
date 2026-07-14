import { Injectable, inject } from '@angular/core';
import gameDataJson from './data/game-data.json';
import { I18nService } from '../../i18n/i18n.service';
import type {
  GameData,
  GRecipe,
  ProdResult,
  ProdStep,
  ProdTreeNode,
  RecipeChoices,
} from './game-data.model';

const DATA = gameDataJson as unknown as GameData;

/**
 * Production calculator over the bundled game data. Expands a target item + rate
 * into the machines and raw resources needed, using default (non-alternate)
 * recipes. Alternate-recipe selection / optimisation can build on this later.
 */
@Injectable({ providedIn: 'root' })
export class CalculatorService {
  private readonly i18n = inject(I18nService);
  readonly data = DATA;
  private readonly resourceSet = new Set(DATA.resources);
  /** item class -> recipes that produce it. */
  private readonly byProduct = new Map<string, GRecipe[]>();

  constructor() {
    for (const r of DATA.recipes) {
      for (const p of r.products) {
        const list = this.byProduct.get(p.item);
        if (list) list.push(r);
        else this.byProduct.set(p.item, [r]);
      }
    }
  }

  itemName(cls: string): string {
    return this.data.items[cls]?.name ?? cls;
  }

  /** Relative URL of an item's icon, or '' if unknown. */
  iconUrl(cls: string): string {
    const icon = this.data.items[cls]?.icon;
    return icon ? `icons/items/${icon}.png` : '';
  }

  isRaw(item: string): boolean {
    return this.resourceSet.has(item) || !this.byProduct.has(item);
  }

  /** Items that can be produced (have at least one machine recipe), for the picker. */
  producibleItems(): { className: string; name: string }[] {
    return [...this.byProduct.keys()]
      .map((cls) => ({ className: cls, name: this.itemName(cls) }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** All recipes that produce an item (for the per-item recipe picker). */
  recipesFor(item: string): GRecipe[] {
    return this.byProduct.get(item) ?? [];
  }

  /** Default recipe for an item: the standard (non-alternate) one, else the first. */
  defaultRecipe(item: string): GRecipe | undefined {
    const list = this.byProduct.get(item);
    if (!list || !list.length) return undefined;
    return list.find((r) => !r.alternate) ?? list[0];
  }

  /** Recipe to use for an item given the user's choices, else the default. */
  private chosenRecipe(item: string, choices: RecipeChoices): GRecipe | undefined {
    const chosen = choices[item];
    if (chosen) {
      const r = this.byProduct.get(item)?.find((x) => x.className === chosen);
      if (r) return r;
    }
    return this.defaultRecipe(item);
  }

  private buildingPower(recipe: GRecipe): number {
    if (recipe.variablePower) return (recipe.minPower + recipe.maxPower) / 2;
    return this.data.buildings[recipe.producedIn]?.power ?? 0;
  }

  /**
   * Solve the production for `rate` (per minute) of `item`, expanding via the
   * chosen recipe per item (falling back to the default). Aggregates identical
   * recipes and sums raw-resource demand. Cuts recipe loops to avoid divergence
   * (a warning is emitted; proper loop handling needs linear solving, later).
   */
  solve(item: string, rate: number, choices: RecipeChoices = {}): ProdResult {
    const stepByRecipe = new Map<string, ProdStep>();
    const rawMap = new Map<string, number>();
    const warnings = new Set<string>();

    const need = (
      targetItem: string,
      targetRate: number,
      depth: number,
      ancestors: ReadonlySet<string>,
    ): void => {
      if (targetRate <= 0 || depth > 200) return;
      if (this.isRaw(targetItem)) {
        rawMap.set(targetItem, (rawMap.get(targetItem) ?? 0) + targetRate);
        return;
      }
      // Cut recipe loops: an item that depends on itself is treated as a raw
      // input here so quantities stay finite.
      if (ancestors.has(targetItem)) {
        warnings.add(this.i18n.t('calc.warnLoop', { item: this.itemName(targetItem) }));
        rawMap.set(targetItem, (rawMap.get(targetItem) ?? 0) + targetRate);
        return;
      }
      const recipe = this.chosenRecipe(targetItem, choices);
      if (!recipe) {
        rawMap.set(targetItem, (rawMap.get(targetItem) ?? 0) + targetRate);
        return;
      }
      const product = recipe.products.find((p) => p.item === targetItem)!;
      const perBuildingPerMin = (product.amount * 60) / recipe.time;
      const buildings = targetRate / perBuildingPerMin;

      const existing = stepByRecipe.get(recipe.className);
      if (existing) {
        existing.buildings += buildings;
        existing.rate += targetRate;
        existing.power += buildings * this.buildingPower(recipe);
      } else {
        stepByRecipe.set(recipe.className, {
          recipe,
          buildingName: this.data.buildings[recipe.producedIn]?.name ?? recipe.producedIn,
          buildings,
          rate: targetRate,
          item: targetItem,
          itemName: this.itemName(targetItem),
          power: buildings * this.buildingPower(recipe),
        });
      }

      const nextAncestors = new Set(ancestors).add(targetItem);
      for (const ing of recipe.ingredients) {
        const ingRatePerBuilding = (ing.amount * 60) / recipe.time;
        need(ing.item, ingRatePerBuilding * buildings, depth + 1, nextAncestors);
      }
    };

    need(item, rate, 0, new Set());

    const steps = [...stepByRecipe.values()];
    const raw = [...rawMap.entries()]
      .map(([it, r]) => ({ item: it, name: this.itemName(it), rate: r }))
      .sort((a, b) => b.rate - a.rate);

    return {
      steps,
      raw,
      totalPower: steps.reduce((s, x) => s + x.power, 0),
      totalBuildings: steps.reduce((s, x) => s + x.buildings, 0),
      warnings: [...warnings],
    };
  }

  /**
   * Build the production as a nested tree (preserves hierarchy, unlike `solve`
   * which aggregates by recipe). Used for the tree view.
   */
  solveTree(item: string, rate: number, choices: RecipeChoices = {}): ProdTreeNode | null {
    if (!item || rate <= 0) return null;

    const build = (
      targetItem: string,
      targetRate: number,
      depth: number,
      ancestors: ReadonlySet<string>,
    ): ProdTreeNode => {
      const leaf = (): ProdTreeNode => ({
        item: targetItem,
        itemName: this.itemName(targetItem),
        rate: targetRate,
        isRaw: true,
        recipe: null,
        buildingName: '',
        buildings: 0,
        power: 0,
        children: [],
      });

      if (depth > 100 || ancestors.has(targetItem)) return leaf();
      if (this.isRaw(targetItem)) return leaf();
      const recipe = this.chosenRecipe(targetItem, choices);
      if (!recipe) return leaf();

      const product = recipe.products.find((p) => p.item === targetItem)!;
      const buildings = targetRate / ((product.amount * 60) / recipe.time);
      const nextAncestors = new Set(ancestors).add(targetItem);
      const children = recipe.ingredients.map((ing) =>
        build(ing.item, ((ing.amount * 60) / recipe.time) * buildings, depth + 1, nextAncestors),
      );

      return {
        item: targetItem,
        itemName: this.itemName(targetItem),
        rate: targetRate,
        isRaw: false,
        recipe,
        buildingName: this.data.buildings[recipe.producedIn]?.name ?? recipe.producedIn,
        buildings,
        power: buildings * this.buildingPower(recipe),
        children,
      };
    };

    return build(item, rate, 0, new Set());
  }
}
