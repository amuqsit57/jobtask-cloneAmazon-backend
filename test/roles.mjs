/**
 * Seller and admin flows, end to end, including the full marketplace loop:
 * seller lists a product -> admin approves it -> it appears in customer search
 * -> customer buys it -> seller sees the order and ships it.
 */

const API = 'http://localhost:4000/api';
let pass = 0, fail = 0;
const ok = (n, c, d = '') => {
  if (c) { pass++; console.log(`  PASS  ${n}`); }
  else { fail++; console.log(`  FAIL  ${n} ${d}`); }
};

async function api(path, opts = {}) {
  const res = await fetch(API + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(opts.session ? { 'x-cart-session': opts.session } : {}),
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const login = async (email) =>
  (await api('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password: 'Password123!' }),
  })).body;

console.log('\nACCOUNTS AND ROLES');
const seller = await login('seller@example.com');
const seller2 = await login('seller2@example.com');
const admin = await login('admin@example.com');
const customer = await login('demo@example.com');

ok('seller has seller role', seller.user?.role === 'seller');
ok('seller has a store name', !!seller.user?.storeName);
ok('admin has admin role', admin.user?.role === 'admin');
ok('customer has customer role', customer.user?.role === 'customer');

console.log('\nROLE BOUNDARIES');
ok('customer blocked from seller area',
   (await api('/seller/stats', { token: customer.token })).status === 403);
ok('customer blocked from admin area',
   (await api('/admin/stats', { token: customer.token })).status === 403);
ok('seller blocked from admin area',
   (await api('/admin/stats', { token: seller.token })).status === 403);
ok('admin may use seller area',
   (await api('/seller/stats', { token: admin.token })).status === 200);
ok('anonymous blocked', (await api('/seller/stats')).status === 401);

console.log('\nSELLER DASHBOARD');
const stats = await api('/seller/stats', { token: seller.token });
ok('revenue reported', stats.body.revenue > 0, `${stats.body.revenue}`);
ok('units reported', stats.body.unitsSold > 0);
ok('30-day series has 30 points', stats.body.salesByDay?.length === 30);
ok('top products listed', stats.body.topProducts?.length > 0);
ok('product status counts', stats.body.productsByStatus?.active > 0);

console.log('\nSELLER CATALOG IS SCOPED');
const mine = await api('/seller/products', { token: seller.token });
const theirs = await api('/seller/products', { token: seller2.token });
ok('seller sees own products', mine.body.products?.length > 0);
ok('two sellers see different catalogs',
   mine.body.products[0].id !== theirs.body.products[0].id);
const myIds = new Set(mine.body.products.map((p) => p.id));
ok('no overlap between catalogs',
   !theirs.body.products.some((p) => myIds.has(p.id)));

console.log('\nSELLER CANNOT TOUCH ANOTHER SELLER\'S PRODUCT');
const foreign = theirs.body.products[0];
ok('cannot edit foreign product',
   (await api(`/seller/products/${foreign.id}`, {
     method: 'PATCH', token: seller.token, body: JSON.stringify({ stock: 999 }),
   })).status === 404);
ok('cannot archive foreign product',
   (await api(`/seller/products/${foreign.id}`, {
     method: 'DELETE', token: seller.token,
   })).status === 404);

console.log('\nTHE MARKETPLACE LOOP');
const unique = Date.now();
const listing = await api('/seller/products', {
  method: 'POST', token: seller.token,
  body: JSON.stringify({
    title: `Marketplace Test Widget ${unique}`,
    brand: 'Nova', description: 'A product created by the seller flow test.',
    bullets: ['First bullet', 'Second bullet'],
    price: 49.99, listPrice: 79.99, stock: 25,
    images: ['https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=800'],
  }),
});
ok('seller can create a listing', listing.status === 201, JSON.stringify(listing.body).slice(0, 140));
const newId = listing.body.product?.id;
const newSlug = listing.body.product?.slug;
ok('new listing starts pending', listing.body.product?.status === 'pending');

const hiddenSearch = await api(`/products?q=Marketplace+Test+Widget+${unique}`);
ok('pending listing is NOT in customer search',
   hiddenSearch.body.products?.length === 0,
   `found ${hiddenSearch.body.products?.length}`);

const queue = await api('/admin/products?status=pending', { token: admin.token });
ok('pending listing appears in admin queue',
   queue.body.products?.some((p) => p.id === newId));
ok('admin queue shows the store name',
   queue.body.products?.find((p) => p.id === newId)?.storeName === seller.user.storeName);

const rejectNoReason = await api(`/admin/products/${newId}/moderate`, {
  method: 'POST', token: admin.token, body: JSON.stringify({ decision: 'reject' }),
});
ok('rejection requires a reason', rejectNoReason.status === 400);

const approved = await api(`/admin/products/${newId}/moderate`, {
  method: 'POST', token: admin.token, body: JSON.stringify({ decision: 'approve' }),
});
ok('admin approves the listing', approved.body.product?.status === 'active');

const nowVisible = await api(`/products?q=Marketplace+Test+Widget+${unique}`);
ok('APPROVED LISTING IS NOW IN CUSTOMER SEARCH',
   nowVisible.body.products?.length === 1,
   `found ${nowVisible.body.products?.length}`);

const detail = await api(`/products/${newSlug}`);
ok('product page shows the selling store',
   detail.body.product?.storeName === seller.user.storeName);

console.log('\nCUSTOMER BUYS THE NEW LISTING');
const session = 'roles-' + unique;

// Clear anything left in the demo customer's cart first, so the revenue delta
// below reflects only the item this test adds.
const existing = await api('/cart', { token: customer.token });
for (const item of existing.body.items ?? []) {
  await api(`/cart/items/${item.id}`, { method: 'DELETE', token: customer.token });
}

const beforeRevenue = (await api('/seller/stats', { token: seller.token })).body.revenue;

await api('/cart/items', {
  method: 'POST', token: customer.token, session,
  body: JSON.stringify({ productId: newId, quantity: 2 }),
});
const order = await api('/orders', {
  method: 'POST', token: customer.token,
  body: JSON.stringify({
    shipTo: { full_name: 'Demo Customer', line1: '410 Terry Ave N',
              city: 'Seattle', state: 'WA', postal_code: '98109' },
  }),
});
ok('customer places the order', order.status === 201, JSON.stringify(order.body).slice(0, 120));

const afterRevenue = (await api('/seller/stats', { token: seller.token })).body.revenue;
ok('SELLER REVENUE INCREASED', afterRevenue > beforeRevenue,
   `${beforeRevenue} -> ${afterRevenue}`);
ok('revenue rose by the line total', afterRevenue - beforeRevenue === 4999 * 2,
   `delta ${afterRevenue - beforeRevenue}`);

const sellerOrders = await api('/seller/orders', { token: seller.token });
const line = sellerOrders.body.orders?.find((o) => o.productId === newId);
ok('SELLER SEES THE ORDER', !!line);
ok('line starts unshipped', line?.fulfillmentStatus === 'unshipped');
ok('seller sees the buyer name', !!line?.buyerName);

const otherSellerOrders = await api('/seller/orders', { token: seller2.token });
ok('other seller does NOT see this order',
   !otherSellerOrders.body.orders?.some((o) => o.productId === newId));

console.log('\nSELLER FULFILS');
const shipped = await api(`/seller/orders/${line.id}/ship`, {
  method: 'POST', token: seller.token,
  body: JSON.stringify({ trackingNumber: 'TBA1234567890' }),
});
ok('seller ships the line', shipped.body.item?.fulfillmentStatus === 'shipped');
ok('tracking recorded', shipped.body.item?.trackingNumber === 'TBA1234567890');
ok('cannot ship twice',
   (await api(`/seller/orders/${line.id}/ship`, { method: 'POST', token: seller.token })).status === 404);
ok('other seller cannot ship this line',
   (await api(`/seller/orders/${line.id}/ship`, { method: 'POST', token: seller2.token })).status === 404);

console.log('\nSELLER INVENTORY');
const inv = await api(`/seller/inventory/${newId}`, {
  method: 'PATCH', token: seller.token, body: JSON.stringify({ stock: 77 }),
});
ok('seller updates stock', inv.body.stock === 77);
ok('rejects negative stock',
   (await api(`/seller/inventory/${newId}`, {
     method: 'PATCH', token: seller.token, body: JSON.stringify({ stock: -5 }),
   })).status === 400);
ok('cannot set stock on a foreign product',
   (await api(`/seller/inventory/${foreign.id}`, {
     method: 'PATCH', token: seller.token, body: JSON.stringify({ stock: 5 }),
   })).status === 404);

console.log('\nADMIN MODERATION AND AUDIT');
const rejected = await api(`/admin/products/${newId}/moderate`, {
  method: 'POST', token: admin.token,
  body: JSON.stringify({ decision: 'reject', reason: 'Test rejection' }),
});
ok('admin rejects with a reason', rejected.body.product?.status === 'rejected');
const goneAgain = await api(`/products?q=Marketplace+Test+Widget+${unique}`);
ok('rejected listing leaves the storefront', goneAgain.body.products?.length === 0);

const actions = await api('/admin/actions', { token: admin.token });
ok('moderation is logged', actions.body.actions?.length > 0);
ok('log records the decision',
   actions.body.actions?.some((a) => a.action === 'reject' && a.targetId === newId));

console.log('\nADMIN USERS');
const users = await api('/admin/users', { token: admin.token });
ok('admin lists users', users.body.users?.length > 0);
ok('users carry roles', users.body.users?.some((u) => u.role === 'seller'));
ok('users carry lifetime spend',
   users.body.users?.some((u) => typeof u.lifetimeSpend === 'number'));

const selfDemote = await api(`/admin/users/${admin.user.id}/role`, {
  method: 'PATCH', token: admin.token, body: JSON.stringify({ role: 'customer' }),
});
ok('admin cannot change own role', selfDemote.status === 400);

const promoted = await api(`/admin/users/${customer.user.id}/role`, {
  method: 'PATCH', token: admin.token,
  body: JSON.stringify({ role: 'seller', storeName: 'Demo Test Store' }),
});
ok('admin promotes a customer to seller', promoted.body.user?.role === 'seller');
const restored = await api(`/admin/users/${customer.user.id}/role`, {
  method: 'PATCH', token: admin.token, body: JSON.stringify({ role: 'customer' }),
});
ok('admin restores the role', restored.body.user?.role === 'customer');

const adminOrders = await api('/admin/orders', { token: admin.token });
ok('admin sees all orders', adminOrders.body.orders?.length > 0);
ok('admin orders show the buyer', !!adminOrders.body.orders?.[0]?.buyerEmail);

// Leave the catalog as we found it.
await api(`/admin/products/${newId}/moderate`, {
  method: 'POST', token: admin.token, body: JSON.stringify({ decision: 'archive' }),
});

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
