import express from 'express';
import { randomUUID } from 'node:crypto';
import { readStore, writeStore } from './storage.js';

const app = express();
app.use(express.json({ limit: '1mb' }));

function httpError(status, message) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) {
    throw httpError(400, `${label} is required.`);
  }
  return value.trim();
}

function requireNumber(value, label, { integer = false, min = 0 } = {}) {
  const number = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim() ? Number(value) : Number.NaN;
  if (!Number.isFinite(number) || number < min || (integer && !Number.isInteger(number))) {
    throw httpError(400, `${label} must be ${integer ? 'a whole number' : 'a number'} of at least ${min}.`);
  }
  return number;
}

function money(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function recordCategory(store, name) {
  if (!store.categories.some((category) => category.toLowerCase() === name.toLowerCase())) {
    store.categories.push(name);
  }
}

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.get('/api/dashboard', (_req, res, next) => {
  try {
    const store = readStore();
    const today = new Date().toISOString().slice(0, 10);
    const todaySales = store.sales.filter((sale) => sale.createdAt.slice(0, 10) === today);
    res.json({
      productCount: store.products.length,
      unitsInStock: store.products.reduce((sum, product) => sum + product.quantity, 0),
      inventoryValue: money(store.products.reduce((sum, product) => sum + product.price * product.quantity, 0)),
      lowStockCount: store.products.filter((product) => product.quantity <= product.lowStockThreshold).length,
      todayRevenue: todaySales.reduce((sum, sale) => sum + sale.total, 0),
      todaySaleCount: todaySales.length,
      lowStockProducts: store.products
        .filter((product) => product.quantity <= product.lowStockThreshold)
        .sort((a, b) => a.quantity - b.quantity)
        .slice(0, 5),
      recentSales: store.sales.slice(0, 5),
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/products', (_req, res, next) => {
  try {
    res.json(readStore().products);
  } catch (error) {
    next(error);
  }
});

app.post('/api/products', (req, res, next) => {
  try {
    const store = readStore();
    const name = requireText(req.body.name, 'Product name');
    const sku = requireText(req.body.sku, 'SKU');
    if (store.products.some((product) => product.sku.toLowerCase() === sku.toLowerCase())) {
      throw httpError(409, 'A product with this SKU already exists.');
    }
    const category = requireText(req.body.category, 'Category');
    const product = {
      id: randomUUID(),
      name,
      sku,
      category,
      price: requireNumber(req.body.price, 'Price'),
      quantity: requireNumber(req.body.quantity, 'Quantity', { integer: true }),
      lowStockThreshold: requireNumber(req.body.lowStockThreshold ?? 5, 'Low-stock threshold', { integer: true }),
      description: typeof req.body.description === 'string' ? req.body.description.trim() : '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    recordCategory(store, category);
    store.products.unshift(product);
    if (product.quantity > 0) {
      store.movements.unshift({
        id: randomUUID(), productId: product.id, productName: product.name,
        type: 'stock_in', quantity: product.quantity, note: 'Opening stock', createdAt: product.createdAt,
      });
    }
    writeStore(store);
    res.status(201).json(product);
  } catch (error) {
    next(error);
  }
});

app.put('/api/products/:id', (req, res, next) => {
  try {
    const store = readStore();
    const product = store.products.find((item) => item.id === req.params.id);
    if (!product) throw httpError(404, 'Product not found.');
    const name = requireText(req.body.name, 'Product name');
    const sku = requireText(req.body.sku, 'SKU');
    if (store.products.some((item) => item.id !== product.id && item.sku.toLowerCase() === sku.toLowerCase())) {
      throw httpError(409, 'A product with this SKU already exists.');
    }
    const category = requireText(req.body.category, 'Category');
    const quantity = requireNumber(req.body.quantity, 'Quantity', { integer: true });
    const previousQuantity = product.quantity;
    Object.assign(product, {
      name,
      sku,
      category,
      price: requireNumber(req.body.price, 'Price'),
      quantity,
      lowStockThreshold: requireNumber(req.body.lowStockThreshold ?? 5, 'Low-stock threshold', { integer: true }),
      description: typeof req.body.description === 'string' ? req.body.description.trim() : '',
      updatedAt: new Date().toISOString(),
    });
    recordCategory(store, category);
    if (quantity !== previousQuantity) {
      store.movements.unshift({
        id: randomUUID(), productId: product.id, productName: product.name,
        type: quantity > previousQuantity ? 'stock_in' : 'stock_out',
        quantity: Math.abs(quantity - previousQuantity), note: 'Product updated', createdAt: product.updatedAt,
      });
    }
    writeStore(store);
    res.json(product);
  } catch (error) {
    next(error);
  }
});

app.delete('/api/products/:id', (req, res, next) => {
  try {
    const store = readStore();
    const index = store.products.findIndex((product) => product.id === req.params.id);
    if (index === -1) throw httpError(404, 'Product not found.');
    store.products.splice(index, 1);
    writeStore(store);
    res.status(204).end();
  } catch (error) {
    next(error);
  }
});

app.get('/api/categories', (_req, res, next) => {
  try {
    res.json(readStore().categories);
  } catch (error) {
    next(error);
  }
});

app.get('/api/sales', (_req, res, next) => {
  try {
    res.json(readStore().sales);
  } catch (error) {
    next(error);
  }
});

app.post('/api/sales', (req, res, next) => {
  try {
    const store = readStore();
    if (!Array.isArray(req.body.items) || req.body.items.length === 0) {
      throw httpError(400, 'Add at least one product to the sale.');
    }
    const quantitiesByProduct = new Map();
    for (const entry of req.body.items) {
      const quantity = requireNumber(entry.quantity, 'Sale quantity', { integer: true, min: 1 });
      quantitiesByProduct.set(entry.productId, (quantitiesByProduct.get(entry.productId) || 0) + quantity);
    }
    const items = Array.from(quantitiesByProduct, ([productId, quantity]) => {
      const product = store.products.find((item) => item.id === productId);
      if (!product) throw httpError(404, 'A product in this sale could not be found.');
      if (quantity > product.quantity) throw httpError(400, `Not enough stock for ${product.name}.`);
      return { product, quantity };
    });
    for (const { product, quantity } of items) {
      product.quantity -= quantity;
      product.updatedAt = new Date().toISOString();
    }
    const sale = {
      id: randomUUID(),
      items: items.map(({ product, quantity }) => ({
        productId: product.id, productName: product.name, sku: product.sku,
        quantity, unitPrice: product.price, subtotal: money(product.price * quantity),
      })),
      total: money(items.reduce((sum, { product, quantity }) => sum + product.price * quantity, 0)),
      customer: typeof req.body.customer === 'string' ? req.body.customer.trim() : '',
      createdAt: new Date().toISOString(),
    };
    store.sales.unshift(sale);
    for (const { product, quantity } of items) {
      store.movements.unshift({
        id: randomUUID(), productId: product.id, productName: product.name,
        type: 'sale', quantity, note: `Sale ${sale.id.slice(0, 8)}`, createdAt: sale.createdAt,
      });
    }
    writeStore(store);
    res.status(201).json(sale);
  } catch (error) {
    next(error);
  }
});

app.get('/api/stock/movements', (_req, res, next) => {
  try {
    res.json(readStore().movements.slice(0, 100));
  } catch (error) {
    next(error);
  }
});

app.post('/api/stock/adjustments/:productId', (req, res, next) => {
  try {
    const store = readStore();
    const product = store.products.find((item) => item.id === req.params.productId);
    if (!product) throw httpError(404, 'Product not found.');
    const adjustment = typeof req.body.adjustment === 'number'
      ? req.body.adjustment
      : typeof req.body.adjustment === 'string' && req.body.adjustment.trim()
        ? Number(req.body.adjustment)
        : Number.NaN;
    if (!Number.isInteger(adjustment) || adjustment === 0) {
      throw httpError(400, 'Adjustment must be a non-zero whole number.');
    }
    if (product.quantity + adjustment < 0) {
      throw httpError(400, 'Stock cannot be reduced below zero.');
    }
    product.quantity += adjustment;
    product.updatedAt = new Date().toISOString();
    store.movements.unshift({
      id: randomUUID(),
      productId: product.id,
      productName: product.name,
      type: adjustment > 0 ? 'stock_in' : 'stock_out',
      quantity: Math.abs(adjustment),
      note: typeof req.body.note === 'string' && req.body.note.trim() ? req.body.note.trim() : 'Manual adjustment',
      createdAt: product.updatedAt,
    });
    writeStore(store);
    res.json(product);
  } catch (error) {
    next(error);
  }
});

app.use((req, _res, next) => next(httpError(404, `Route not found: ${req.method} ${req.path}`)));

app.use((error, _req, res, _next) => {
  if (error instanceof SyntaxError && 'body' in error) {
    return res.status(400).json({ message: 'Request body must be valid JSON.' });
  }
  if (!error.status || error.status >= 500) console.error(error);
  res.status(error.status || 500).json({ message: error.status ? error.message : 'An unexpected server error occurred.' });
});

export default app;
