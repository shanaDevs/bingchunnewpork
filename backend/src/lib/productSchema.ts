import { addColumnIfMissing } from './schemaPatch';

export async function ensureProductCostColumn(): Promise<void> {
  await addColumnIfMissing('products', 'cost', 'INT NOT NULL DEFAULT 0');
}

export async function ensureProductImageUrlsColumn(): Promise<void> {
  await addColumnIfMissing('products', 'imageUrls', 'JSON NULL');
}
