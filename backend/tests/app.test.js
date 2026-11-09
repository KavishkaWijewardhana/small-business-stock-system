import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const dataDirectory = mkdtempSync(join(tmpdir(), 'stockroom-test-'));
process.env.STOCKROOM_DATA_PATH = join(dataDirectory, 'store.json');
const { default: app } = await import('../src/app.js');
let server;
let baseUrl;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}/api`;
});

after(async () => {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  rmSync(dataDirectory, { recursive: true, force: true });
});

async function api(path, options) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options?.headers },
  });
  return { response, body: response.status === 204 ? null : await response.json() };
}

test('creates products, adjusts stock, and records a sale without overselling', async () => {
  const created = await api('/products', {
    method: 'POST',
    body: JSON.stringify({ name: 'Tea', sku: 'TEA-1', category: 'Drinks', price: 4.5, quantity: 8, lowStockThreshold: 2 }),
  });
  assert.equal(created.response.status, 201);
  assert.equal(created.body.quantity, 8);

  const duplicate = await api('/products', {
    method: 'POST',
    body: JSON.stringify({ name: 'Other tea', sku: 'tea-1', category: 'Drinks', price: 2, quantity: 1 }),
  });
  assert.equal(duplicate.response.status, 409);

  const adjusted = await api(`/stock/adjustments/${created.body.id}`, {
    method: 'POST',
    body: JSON.stringify({ adjustment: 2, note: 'Restock' }),
  });
  assert.equal(adjusted.body.quantity, 10);

  const sale = await api('/sales', {
    method: 'POST',
    body: JSON.stringify({ customer: 'Alex', items: [{ productId: created.body.id, quantity: 3 }] }),
  });
  assert.equal(sale.response.status, 201);
  assert.equal(sale.body.total, 13.5);

  const products = await api('/products');
  assert.equal(products.body[0].quantity, 7);
  const movements = await api('/stock/movements');
  assert.equal(movements.body[0].type, 'sale');

  const oversell = await api('/sales', {
    method: 'POST',
    body: JSON.stringify({ items: [{ productId: created.body.id, quantity: 8 }] }),
  });
  assert.equal(oversell.response.status, 400);

  const duplicateLines = await api('/sales', {
    method: 'POST',
    body: JSON.stringify({ items: [{ productId: created.body.id, quantity: 4 }, { productId: created.body.id, quantity: 4 }] }),
  });
  assert.equal(duplicateLines.response.status, 400);
  assert.equal((await api('/products')).body[0].quantity, 7);
});

test('rejects invalid quantities and missing products', async () => {
  const invalid = await api('/products', {
    method: 'POST',
    body: JSON.stringify({ name: 'Bad', sku: 'BAD-1', category: 'Test', price: 3, quantity: -1 }),
  });
  assert.equal(invalid.response.status, 400);

  const missing = await api('/stock/adjustments/unknown', {
    method: 'POST',
    body: JSON.stringify({ adjustment: 1 }),
  });
  assert.equal(missing.response.status, 404);
});
