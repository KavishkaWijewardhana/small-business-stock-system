import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const dataPath = process.env.STOCKROOM_DATA_PATH || join(dirname(fileURLToPath(import.meta.url)), '..', 'data', 'store.json');

export function readStore() {
  try {
    const store = JSON.parse(readFileSync(dataPath, 'utf8'));
    return {
      products: Array.isArray(store.products) ? store.products : [],
      categories: Array.isArray(store.categories) ? store.categories : [],
      sales: Array.isArray(store.sales) ? store.sales : [],
      movements: Array.isArray(store.movements) ? store.movements : [],
    };
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    return { products: [], categories: [], sales: [], movements: [] };
  }
}

export function writeStore(store) {
  mkdirSync(dirname(dataPath), { recursive: true });
  const tempPath = `${dataPath}.tmp`;
  writeFileSync(tempPath, `${JSON.stringify(store, null, 2)}\n`, 'utf8');
  renameSync(tempPath, dataPath);
}
