/** End-to-end smoke test of every API flow, against the running server. */

const BASE = 'http://localhost:4000/api';
const SESSION = 'test-session-' + Date.now();

let pass = 0;
let fail = 0;

function check(name, cond, detail = '') {
  if (cond) {
    pass++;
    console.log(`  PASS  ${name}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name} ${detail}`);
  }
}

async function api(path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'x-cart-session': SESSION,
      ...(opts.headers || {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

console.log('\n--- catalog ---');
const list = await api('/products?limit=5');
check('list products', list.body.products?.length === 5, JSON.stringify(list.body).slice(0, 120));
check('pagination total', list.body.pagination?.total === 20, `got ${list.body.pagination?.total}`);
check('price formatted', /^\$\d/.test(list.body.products?.[0]?.priceFormatted ?? ''));

const search = await api('/products?q=wireless+headphones');
check('full-text search', search.body.products?.length > 0);
check(
  'search relevance',
  /sony|airpods|headphone/i.test(search.body.products?.[0]?.title ?? ''),
  search.body.products?.[0]?.title?.slice(0, 50)
);

const filtered = await api('/products?category=electronics&minPrice=100&sort=price-asc');
check('category + price filter', filtered.body.products?.every((p) => p.price >= 10000));
const prices = filtered.body.products?.map((p) => p.price) ?? [];
check('sort price-asc', prices.every((p, i) => i === 0 || prices[i - 1] <= p));

const suggest = await api('/products/suggest?q=echo');
check('suggestions', suggest.body.suggestions?.length > 0);

const featured = await api('/products/featured');
check('featured rails', featured.body.bestSellers?.length > 0 && featured.body.deals?.length > 0);
check('deals have discount', featured.body.deals?.every((p) => p.discountPercent > 0));

const slug = list.body.products[0].slug;
const detail = await api(`/products/${slug}`);
check('product detail', detail.body.product?.slug === slug);
check('detail has images', detail.body.product?.images?.length > 0);
check('detail has reviews', detail.body.product?.reviews?.length > 0);
check('detail has related', detail.body.product?.related?.length > 0);
check('rating distribution', typeof detail.body.product?.ratingDistribution === 'object');

const missing = await api('/products/does-not-exist-xyz');
check('404 unknown product', missing.status === 404);

console.log('\n--- guest cart ---');
const p1 = list.body.products[0];
const p2 = list.body.products[1];

let cart = await api('/cart/items', {
  method: 'POST',
  body: JSON.stringify({ productId: p1.id, quantity: 2 }),
});
check('add to cart', cart.body.count === 2, JSON.stringify(cart.body).slice(0, 120));

cart = await api('/cart/items', {
  method: 'POST',
  body: JSON.stringify({ productId: p2.id, quantity: 1 }),
});
check('add second item', cart.body.items?.length === 2);
check('subtotal computed', cart.body.subtotal === p1.price * 2 + p2.price);

// Re-adding the same product should merge, not duplicate.
cart = await api('/cart/items', {
  method: 'POST',
  body: JSON.stringify({ productId: p1.id, quantity: 1 }),
});
check('re-add merges quantity', cart.body.items?.length === 2 && cart.body.count === 4);

const itemId = cart.body.items.find((i) => i.productId === p1.id).id;
cart = await api(`/cart/items/${itemId}`, {
  method: 'PATCH',
  body: JSON.stringify({ quantity: 1 }),
});
check('update quantity', cart.body.count === 2);

cart = await api(`/cart/items/${itemId}`, {
  method: 'PATCH',
  body: JSON.stringify({ savedForLater: true }),
});
check('save for later', cart.body.savedForLater?.length === 1 && cart.body.items?.length === 1);

console.log('\n--- auth ---');
const email = `test${Date.now()}@example.com`;
const reg = await api('/auth/register', {
  method: 'POST',
  body: JSON.stringify({ email, password: 'Password123!', name: 'Test User' }),
});
check('register', reg.status === 201 && !!reg.body.token);

const dupe = await api('/auth/register', {
  method: 'POST',
  body: JSON.stringify({ email, password: 'Password123!' }),
});
check('duplicate email rejected', dupe.status === 409);

const badEmail = await api('/auth/register', {
  method: 'POST',
  body: JSON.stringify({ email: 'nope', password: 'Password123!' }),
});
check('invalid email rejected', badEmail.status === 400);

const login = await api('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email, password: 'Password123!' }),
});
check('login', login.status === 200 && !!login.body.token);

const badLogin = await api('/auth/login', {
  method: 'POST',
  body: JSON.stringify({ email, password: 'wrong-password' }),
});
check('wrong password rejected', badLogin.status === 401);

const token = login.body.token;
const auth = { Authorization: `Bearer ${token}` };

const me = await api('/auth/me', { headers: auth });
check('me endpoint', me.body.user?.email === email);

const noAuth = await api('/orders');
check('orders require auth', noAuth.status === 401);

console.log('\n--- cart merge on sign-in ---');
const merged = await api('/cart/merge', {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({ sessionId: SESSION }),
});
check('guest cart merged', merged.body.items?.length >= 1, JSON.stringify(merged.body).slice(0, 150));

console.log('\n--- checkout ---');
const addr = await api('/addresses', {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({
    full_name: 'Test User', line1: '410 Terry Ave N', city: 'Seattle',
    state: 'WA', postal_code: '98109', phone: '206-555-0142', is_default: true,
  }),
});
check('create address', addr.status === 201);

const beforeStock = (await api(`/products/${p2.slug}`)).body.product.stock;

const order = await api('/orders', {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({
    shipTo: {
      full_name: 'Test User', line1: '410 Terry Ave N', city: 'Seattle',
      state: 'WA', postal_code: '98109',
    },
    paymentLast4: '4242',
  }),
});
check('place order', order.status === 201, JSON.stringify(order.body).slice(0, 200));
check('order number format', /^112-\d{7}-\d{7}$/.test(order.body.order?.orderNumber ?? ''));
check('order has items', order.body.order?.items?.length > 0);

const o = order.body.order;
if (o) {
  const expectedTax = Math.round(o.subtotal * 0.0725);
  check('tax computed', o.tax === expectedTax, `${o.tax} vs ${expectedTax}`);
  check('total = sub+ship+tax', o.total === o.subtotal + o.shipping + o.tax);
}

const afterStock = (await api(`/products/${p2.slug}`)).body.product.stock;
check('stock decremented', afterStock < beforeStock, `${beforeStock} -> ${afterStock}`);

const emptied = await api('/cart', { headers: auth });
check('cart emptied after order', emptied.body.items?.length === 0);

const orders = await api('/orders', { headers: auth });
check('order history', orders.body.orders?.length === 1);

const single = await api(`/orders/${o.orderNumber}`, { headers: auth });
check('order detail', single.body.order?.orderNumber === o.orderNumber);

const emptyOrder = await api('/orders', {
  method: 'POST',
  headers: auth,
  body: JSON.stringify({
    shipTo: { full_name: 'X', line1: '1 St', city: 'Seattle', state: 'WA', postal_code: '98109' },
  }),
});
check('empty cart rejected', emptyOrder.status === 400);

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
