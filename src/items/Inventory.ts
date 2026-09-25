import { ALL_INVENTORY, type InventoryId } from '../core/GameState';

export class Inventory {
  private readonly items = new Set<InventoryId>();
  onChange: (() => void) | null = null;

  has(id: InventoryId): boolean {
    return this.items.has(id);
  }

  add(id: InventoryId): void {
    if (this.items.has(id)) return;
    this.items.add(id);
    this.onChange?.();
  }

  /** Liste ordonnée (ordre canonique des objets). */
  list(): InventoryId[] {
    return ALL_INVENTORY.filter((id) => this.items.has(id));
  }
}
