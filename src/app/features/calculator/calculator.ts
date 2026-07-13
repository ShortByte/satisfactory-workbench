import { Component, computed, inject, signal } from '@angular/core';
import { DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CalculatorService } from './calculator.service';
import { MapService } from '../../core/map.service';
import { SaveService } from '../../core/save.service';
import type { GRecipe, ProdResult, ProdTreeNode, RecipeChoices } from './game-data.model';
import {
  descToNodeKey,
  extractorProduction,
  resourceAvailability,
  type ResourceAvailability,
} from './world-availability';

@Component({
  selector: 'app-calculator',
  imports: [DecimalPipe, NgTemplateOutlet, FormsModule],
  templateUrl: './calculator.html',
  styleUrl: './calculator.scss',
})
export class Calculator {
  private readonly calc = inject(CalculatorService);
  private readonly mapService = inject(MapService);
  protected readonly save = inject(SaveService);

  /** All producible items for the picker. */
  protected readonly items = this.calc.producibleItems();

  constructor() {
    // Pull the map/node data for the loaded save so we can show world availability.
    if (this.save.hasSave() && !this.mapService.hasData()) void this.mapService.load();
  }

  protected readonly target = signal<string>(this.defaultItem());
  protected readonly rate = signal<number>(60);
  /** Per-item recipe overrides. */
  protected readonly choices = signal<RecipeChoices>({});

  /** View mode for the breakdown. */
  protected readonly view = signal<'table' | 'tree'>('table');

  /** Production breakdown for the current target + rate + recipe choices. */
  protected readonly result = computed<ProdResult | null>(() => {
    const item = this.target();
    const r = this.rate();
    if (!item || !r || r <= 0) return null;
    return this.calc.solve(item, r, this.choices());
  });

  /** Production as a nested tree (for the tree view). */
  protected readonly tree = computed<ProdTreeNode | null>(() =>
    this.calc.solveTree(this.target(), this.rate(), this.choices()),
  );

  /** Per-raw-resource world availability from the loaded save (or null if none). */
  protected readonly worldAvailability = computed<
    | (ResourceAvailability & {
        name: string;
        icon: string;
        needed: number;
        enough: boolean;
        extractingRate: number;
        extractingCount: number;
      })[]
    | null
  >(() => {
    const res = this.result();
    const data = this.mapService.data();
    if (!res || !data) return null;
    return res.raw.map((raw) => {
      const key = descToNodeKey(raw.item);
      const avail = resourceAvailability(data.features, key);
      const prod = extractorProduction(data.features, key);
      return {
        ...avail,
        name: raw.name,
        icon: this.calc.iconUrl(raw.item),
        needed: raw.rate,
        enough: avail.maxRate >= raw.rate,
        extractingRate: prod.rate,
        extractingCount: prod.count,
      };
    });
  });

  /** Icon URL for an item class ('' if none). */
  protected icon(item: string): string {
    return this.calc.iconUrl(item);
  }

  /** Recipes available for an item (for the per-step recipe picker). */
  protected recipesFor(item: string): GRecipe[] {
    return this.calc.recipesFor(item);
  }

  /** Override the recipe used for an item (empty string = back to default). */
  protected chooseRecipe(item: string, recipeClass: string): void {
    const next = { ...this.choices() };
    if (recipeClass) next[item] = recipeClass;
    else delete next[item];
    this.choices.set(next);
  }

  protected resetRecipes(): void {
    this.choices.set({});
  }

  protected hasChoices(): boolean {
    return Object.keys(this.choices()).length > 0;
  }

  private defaultItem(): string {
    const items = this.calc.producibleItems();
    return (
      items.find((i) => i.name === 'Reinforced Iron Plate')?.className ??
      items[0]?.className ??
      ''
    );
  }
}
