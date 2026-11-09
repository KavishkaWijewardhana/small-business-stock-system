import { useCallback, useEffect, useMemo, useState } from 'react';

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const dateTime = new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeStyle: 'short' });

async function request(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.message || `Request failed (${response.status}).`);
  }
  return response.status === 204 ? null : response.json();
}

function Icon({ name }) {
  const paths = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
    box: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="m3 8 9 5 9-5M3 8v9l9 5 9-5V8M12 13v9" /></>,
    cart: <><circle cx="9" cy="21" r="1" /><circle cx="20" cy="21" r="1" /><path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    plus: <><path d="M12 5v14M5 12h14" /></>,
    arrow: <><path d="M7 17 17 7M7 7h10v10" /></>,
    warning: <><path d="m10.3 3.9-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3l-8-14a2 2 0 0 0-3.4-.1Z" /><path d="M12 9v4m0 4h.01" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    edit: <><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z" /></>,
    trash: <><path d="M3 6h18m-2 0-.9 14H5.9L5 6m4 0V4h6v2m-5 4v6m4-6v6" /></>,
    sliders: <><path d="M4 21v-7m0-4V3m8 18v-9m0-4V3m8 18v-5m0-4V3M2 14h4m4-6h4m4 8h4" /></>,
  };
  return <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function StatCard({ label, value, note, icon, tone }) {
  return <article className="stat-card"><div className={`stat-icon ${tone}`}><Icon name={icon} /></div><p className="stat-label">{label}</p><p className="stat-value">{value}</p><p className="stat-note">{note}</p></article>;
}

function Modal({ title, onClose, children, error }) {
  return <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}><section className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title"><div className="modal-header"><h2 id="modal-title">{title}</h2><button className="icon-button" aria-label="Close dialog" onClick={onClose}><Icon name="close" /></button></div>{error && <p className="modal-error" role="alert">{error}</p>}{children}</section></div>;
}

function Empty({ title, detail }) {
  return <div className="empty-state"><div className="empty-icon"><Icon name="box" /></div><strong>{title}</strong><span>{detail}</span></div>;
}

export default function App() {
  const [page, setPage] = useState('dashboard');
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [categories, setCategories] = useState([]);
  const [dashboard, setDashboard] = useState(null);
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All categories');
  const [modal, setModal] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    const [productData, salesData, categoryData, dashboardData] = await Promise.all([
      request('/products'), request('/sales'), request('/categories'), request('/dashboard'),
    ]);
    setProducts(productData);
    setSales(salesData);
    setCategories(categoryData);
    setDashboard(dashboardData);
  }, []);

  useEffect(() => {
    refresh().catch((err) => setError(err.message)).finally(() => setLoading(false));
  }, [refresh]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(''), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const filteredProducts = useMemo(() => products.filter((product) => {
    const matchesText = `${product.name} ${product.sku} ${product.category}`.toLowerCase().includes(query.toLowerCase());
    const matchesCategory = categoryFilter === 'All categories' || product.category === categoryFilter;
    return matchesText && matchesCategory;
  }), [products, query, categoryFilter]);

  async function runAction(action, successMessage) {
    setBusy(true);
    setError('');
    try {
      await action();
      await refresh();
      setModal(null);
      setNotice(successMessage);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  function openProduct(product = null) {
    setModal({ type: 'product', product });
  }

  function submitProduct(event) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    payload.price = Number(payload.price);
    payload.quantity = Number(payload.quantity);
    payload.lowStockThreshold = Number(payload.lowStockThreshold);
    const path = modal.product ? `/products/${modal.product.id}` : '/products';
    const method = modal.product ? 'PUT' : 'POST';
    runAction(() => request(path, { method, body: JSON.stringify(payload) }), modal.product ? 'Product updated.' : 'Product added.');
  }

  function submitStock(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = { adjustment: Number(form.get('adjustment')), note: form.get('note') };
    runAction(() => request(`/stock/adjustments/${modal.product.id}`, { method: 'POST', body: JSON.stringify(payload) }), 'Stock adjusted.');
  }

  function submitSale(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = { customer: form.get('customer'), items: [{ productId: form.get('productId'), quantity: Number(form.get('quantity')) }] };
    runAction(() => request('/sales', { method: 'POST', body: JSON.stringify(payload) }), 'Sale recorded and stock updated.');
  }

  async function deleteProduct(product) {
    if (!window.confirm(`Delete "${product.name}"? This cannot be undone.`)) return;
    await runAction(() => request(`/products/${product.id}`, { method: 'DELETE' }), 'Product deleted.');
  }

  const pageTitle = { dashboard: 'Dashboard', products: 'Inventory', sales: 'Sales' }[page];

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" onClick={(event) => { event.preventDefault(); setPage('dashboard'); }}><span className="brand-mark"><Icon name="box" /></span><span>stockroom<small>BUSINESS MANAGER</small></span></a>
        <div className="nav-caption">WORKSPACE</div>
        <nav className="nav-list" aria-label="Main navigation">
          {[['dashboard', 'Overview', 'grid'], ['products', 'Inventory', 'box'], ['sales', 'Sales', 'cart']].map(([key, label, icon]) => <button key={key} aria-label={label} className={`nav-item ${page === key ? 'active' : ''}`} onClick={() => { setPage(key); setError(''); }}><Icon name={icon} /><span>{label}</span>{key === 'products' && dashboard?.lowStockCount > 0 && <span className="nav-count">{dashboard.lowStockCount}</span>}</button>)}
        </nav>
        <div className="sidebar-bottom"><div className="sidebar-help"><span className="help-dot" /><span><strong>All systems ready</strong><small>Your inventory is up to date</small></span></div><div className="sidebar-version">STOCKROOM · BASIC</div></div>
      </aside>

      <main className="main-area">
        <header className="topbar"><div className="breadcrumbs">Workspace <span>/</span> <strong>{pageTitle}</strong></div><div className="topbar-right"><span className="live-dot" /> Local workspace <span className="avatar">S</span></div></header>
        <div className="content">
          <div className="page-heading"><div><p className="eyebrow">{new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'long', day: 'numeric' }).format(new Date())}</p><h1>{pageTitle}</h1><p className="page-subtitle">{page === 'dashboard' ? 'Here is what is happening with your business today.' : page === 'products' ? 'Keep track of products, quantities and stock levels.' : 'Review transactions and record a new sale.'}</p></div><div className="heading-actions">{page === 'sales' ? <button className="button button-primary" onClick={() => setModal({ type: 'sale' })}><Icon name="plus" /> New sale</button> : page === 'products' ? <button className="button button-primary" onClick={() => openProduct()}><Icon name="plus" /> Add product</button> : <><button className="button button-secondary" onClick={() => setPage('products')}><Icon name="box" /> Manage stock</button><button className="button button-primary" onClick={() => setModal({ type: 'sale' })}><Icon name="plus" /> New sale</button></>}</div></div>

          {error && <div className="alert alert-error" role="alert"><Icon name="warning" />{error}<button onClick={() => setError('')} aria-label="Dismiss error"><Icon name="close" /></button></div>}
          {loading ? <div className="loading"><span className="spinner" /> Loading your workspace…</div> : page === 'dashboard' ? (
            <>
              <section className="stats-grid">
                <StatCard label="Total products" value={dashboard?.productCount ?? 0} note="Unique items in your catalog" icon="box" tone="green" />
                <StatCard label="Units in stock" value={(dashboard?.unitsInStock ?? 0).toLocaleString()} note="Across all products" icon="grid" tone="blue" />
                <StatCard label="Inventory value" value={currency.format(dashboard?.inventoryValue ?? 0)} note="Based on current stock" icon="arrow" tone="purple" />
                <StatCard label="Today's sales" value={currency.format(dashboard?.todayRevenue ?? 0)} note={`${dashboard?.todaySaleCount ?? 0} transactions today`} icon="cart" tone="orange" />
              </section>
              <div className="dashboard-grid">
                <section className="panel"><div className="panel-heading"><div><h2>Low stock alerts</h2><p>Products at or below their reorder level</p></div><button className="text-button" onClick={() => setPage('products')}>View inventory <span>→</span></button></div>{dashboard?.lowStockProducts?.length ? <div className="simple-list">{dashboard.lowStockProducts.map((product) => <div className="simple-row" key={product.id}><span className="product-avatar">{product.name.slice(0, 1).toUpperCase()}</span><div className="row-product"><strong>{product.name}</strong><small>{product.sku} · {product.category}</small></div><span className={`stock-pill ${product.quantity === 0 ? 'out' : 'low'}`}>{product.quantity === 0 ? 'Out of stock' : `${product.quantity} left`}</span></div>)}</div> : <Empty title="Stock levels look good" detail="Products needing a reorder will appear here." />}</section>
                <section className="panel"><div className="panel-heading"><div><h2>Recent sales</h2><p>Your latest transactions</p></div><button className="text-button" onClick={() => setPage('sales')}>All sales <span>→</span></button></div>{dashboard?.recentSales?.length ? <div className="simple-list">{dashboard.recentSales.slice(0, 5).map((sale) => <div className="simple-row" key={sale.id}><span className="sale-icon"><Icon name="cart" /></span><div className="row-product"><strong>{sale.customer || 'Walk-in customer'}</strong><small>{sale.items.reduce((sum, item) => sum + item.quantity, 0)} items · {dateTime.format(new Date(sale.createdAt))}</small></div><strong className="sale-total">{currency.format(sale.total)}</strong></div>)}</div> : <Empty title="No sales yet" detail="Record your first sale to see activity here." />}</section>
              </div>
              <section className="tip-banner"><span className="tip-icon">✦</span><div><strong>A little organization goes a long way</strong><p>Add your products and keep stock quantities current to get helpful low-stock alerts.</p></div><button className="text-button" onClick={() => openProduct()}>Add a product <span>→</span></button></section>
            </>
          ) : page === 'products' ? (
            <section className="panel inventory-panel"><div className="inventory-toolbar"><div><h2>All products <span className="total-badge">{products.length}</span></h2><p>Manage your product catalog and stock levels</p></div><div className="toolbar-controls"><label className="search-field"><Icon name="search" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search products..." /></label><label className="select-field"><Icon name="sliders" /><select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option>All categories</option>{categories.map((category) => <option key={category}>{category}</option>)}</select></label></div></div>
              {filteredProducts.length ? <div className="table-scroll"><table><thead><tr><th>PRODUCT</th><th>SKU</th><th>CATEGORY</th><th>PRICE</th><th>IN STOCK</th><th>STATUS</th><th aria-label="Actions" /></tr></thead><tbody>{filteredProducts.map((product) => {
                const low = product.quantity <= product.lowStockThreshold;
                return <tr key={product.id}><td><div className="table-product"><span className="product-avatar">{product.name.slice(0, 1).toUpperCase()}</span><span><strong>{product.name}</strong><small>{product.description || '—'}</small></span></div></td><td className="muted-cell">{product.sku}</td><td><span className="category-tag">{product.category}</span></td><td className="price-cell">{currency.format(product.price)}</td><td><strong>{product.quantity}</strong><span className="muted-cell"> units</span></td><td><span className={`status-badge ${product.quantity === 0 ? 'status-out' : low ? 'status-low' : 'status-good'}`}><span />{product.quantity === 0 ? 'Out of stock' : low ? 'Low stock' : 'In stock'}</span></td><td><div className="row-actions"><button title="Adjust stock" onClick={() => setModal({ type: 'stock', product })}><Icon name="sliders" /></button><button title="Edit product" onClick={() => openProduct(product)}><Icon name="edit" /></button><button title="Delete product" onClick={() => deleteProduct(product)}><Icon name="trash" /></button></div></td></tr>;
              })}</tbody></table></div> : <Empty title={products.length ? 'No matching products' : 'Your inventory is empty'} detail={products.length ? 'Try another search or category.' : 'Add a product to start tracking your stock.'} />}
              <div className="table-footer">Showing <strong>{filteredProducts.length}</strong> of <strong>{products.length}</strong> products <span>Stock value: <strong>{currency.format(products.reduce((sum, product) => sum + product.quantity * product.price, 0))}</strong></span></div>
            </section>
          ) : (
            <section className="panel inventory-panel"><div className="inventory-toolbar"><div><h2>Sales history <span className="total-badge">{sales.length}</span></h2><p>Recorded transactions and their totals</p></div></div>{sales.length ? <div className="table-scroll"><table><thead><tr><th>SALE</th><th>DATE</th><th>ITEMS</th><th>CUSTOMER</th><th>TOTAL</th></tr></thead><tbody>{sales.map((sale) => <tr key={sale.id}><td><span className="sale-reference">#{sale.id.slice(0, 8).toUpperCase()}</span></td><td className="muted-cell">{dateTime.format(new Date(sale.createdAt))}</td><td>{sale.items.map((item) => `${item.productName} × ${item.quantity}`).join(', ')}</td><td>{sale.customer || 'Walk-in customer'}</td><td className="price-cell">{currency.format(sale.total)}</td></tr>)}</tbody></table></div> : <Empty title="No sales recorded" detail="Your sales will appear here after you record a transaction." />}<div className="table-footer">Total transactions <strong>{sales.length}</strong><span>All-time revenue: <strong>{currency.format(sales.reduce((sum, sale) => sum + sale.total, 0))}</strong></span></div></section>
          )}
        </div>
        <footer className="page-footer">Stockroom <span>·</span> Simple tools for a well-run business</footer>
      </main>

      {notice && <div className="toast" role="status"><span>✓</span>{notice}</div>}
      {modal?.type === 'product' && <Modal title={modal.product ? 'Edit product' : 'Add a product'} onClose={() => setModal(null)} error={error}><form className="form-body" onSubmit={submitProduct}>
        <label>Product name<input name="name" required maxLength="100" defaultValue={modal.product?.name || ''} placeholder="e.g. Cotton tote bag" /></label>
        <div className="form-row"><label>SKU<input name="sku" required maxLength="40" defaultValue={modal.product?.sku || ''} placeholder="e.g. BAG-001" /></label><label>Category<input name="category" required maxLength="60" list="category-options" defaultValue={modal.product?.category || ''} placeholder="e.g. Accessories" /><datalist id="category-options">{categories.map((category) => <option key={category} value={category} />)}</datalist></label></div>
        <div className="form-row"><label>Unit price<input name="price" type="number" min="0" step="0.01" required defaultValue={modal.product?.price ?? ''} placeholder="0.00" /></label><label>Quantity in stock<input name="quantity" type="number" min="0" step="1" required defaultValue={modal.product?.quantity ?? 0} /></label></div>
        <label>Low-stock alert at<input name="lowStockThreshold" type="number" min="0" step="1" defaultValue={modal.product?.lowStockThreshold ?? 5} /></label>
        <label>Description <span className="optional">(optional)</span><textarea name="description" rows="3" maxLength="300" defaultValue={modal.product?.description || ''} placeholder="A short note about this product" /></label>
        <div className="form-actions"><button type="button" className="button button-secondary" onClick={() => setModal(null)}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? 'Saving…' : modal.product ? 'Save changes' : 'Add product'}</button></div>
      </form></Modal>}
      {modal?.type === 'stock' && <Modal title="Adjust stock" onClose={() => setModal(null)} error={error}><form className="form-body" onSubmit={submitStock}><div className="stock-current"><span className="product-avatar">{modal.product.name.slice(0, 1).toUpperCase()}</span><span><strong>{modal.product.name}</strong><small>{modal.product.quantity} units currently in stock</small></span></div><label>Adjustment<input name="adjustment" type="number" step="1" required placeholder="e.g. 10 to add, -2 to remove" /><span className="field-help">Use a positive number to add stock or a negative number to remove it.</span></label><label>Reason <span className="optional">(optional)</span><input name="note" maxLength="120" placeholder="e.g. New shipment received" /></label><div className="form-actions"><button type="button" className="button button-secondary" onClick={() => setModal(null)}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? 'Saving…' : 'Update stock'}</button></div></form></Modal>}
      {modal?.type === 'sale' && <Modal title="Record a sale" onClose={() => setModal(null)} error={error}>{products.filter((product) => product.quantity > 0).length === 0 ? <div className="form-body"><Empty title="No stock available" detail="Add products with available stock before recording a sale." /><div className="form-actions"><button className="button button-primary" onClick={() => { setModal(null); setPage('products'); }}>Go to inventory</button></div></div> : <form className="form-body" onSubmit={submitSale}><label>Product<select name="productId" required>{products.filter((product) => product.quantity > 0).map((product) => <option key={product.id} value={product.id}>{product.name} — {currency.format(product.price)} · {product.quantity} available</option>)}</select></label><label>Quantity<input name="quantity" type="number" min="1" step="1" required defaultValue="1" /></label><label>Customer name <span className="optional">(optional)</span><input name="customer" maxLength="100" placeholder="Walk-in customer" /></label><p className="field-help">Stock will be reduced automatically when this sale is recorded.</p><div className="form-actions"><button type="button" className="button button-secondary" onClick={() => setModal(null)}>Cancel</button><button className="button button-primary" disabled={busy}>{busy ? 'Recording…' : 'Record sale'}</button></div></form>}</Modal>}
    </div>
  );
}