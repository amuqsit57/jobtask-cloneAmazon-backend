/**
 * Walks the complete customer journey exactly as a real visitor would, through
 * the running servers - guest browse, guest cart, register, merge, checkout,
 * order history. Tests the seams between steps, not just the endpoints.
 */

const API = 'http://localhost:4000/api';
const WEB = 'http://localhost:3000';
const SESSION = 'journey-' + Date.now();

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
      'x-cart-session': SESSION,
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const page = async (p) => (await fetch(WEB + p)).status;

console.log('\n1. GUEST LANDS ON HOME');
ok('home page loads', (await page('/')) === 200);
const feat = await api('/products/featured');
ok('home shows deals', feat.body.deals?.length > 0);
ok('home shows best sellers', feat.body.bestSellers?.length > 0);

console.log('\n2. GUEST SEARCHES');
ok('search page loads', (await page('/s?q=headphones')) === 200);
const sug = await api('/products/suggest?q=head');
ok('autocomplete returns results', sug.body.suggestions?.length > 0);
const results = await api('/products?q=headphones');
ok('search finds products', results.body.products?.length > 0);

console.log('\n3. GUEST FILTERS AND SORTS');
const filtered = await api('/products?category=electronics&sort=price-asc');
const pr = filtered.body.products?.map((p) => p.price) ?? [];
ok('category filter works', filtered.body.products?.length > 0);
ok('price sort ascending', pr.every((v, i) => i === 0 || pr[i - 1] <= v));
const primeOnly = await api('/products?prime=true');
ok('prime filter works', primeOnly.body.products?.every((p) => p.isPrime));
const rated = await api('/products?minRating=4');
ok('rating filter works', rated.body.products?.every((p) => p.rating >= 4));

console.log('\n4. GUEST OPENS A PRODUCT');
const target = results.body.products[0];
ok('product page loads', (await page(`/product/${target.slug}`)) === 200);
const detail = await api(`/products/${target.slug}`);
const P = detail.body.product;
ok('has images', P.images?.length > 0);
ok('has bullets', P.bullets?.length > 0);
ok('has reviews', P.reviews?.length > 0);
ok('has rating histogram', Object.keys(P.ratingDistribution ?? {}).length === 5);
ok('has related products', P.related?.length > 0);

console.log('\n5. GUEST ADDS TO CART');
let cart = await api('/cart/items', {
  method: 'POST', body: JSON.stringify({ productId: P.id, quantity: 2 }),
});
ok('added as guest', cart.body.count === 2);
ok('cart page loads', (await page('/cart')) === 200);

const second = feat.body.bestSellers.find((p) => p.id !== P.id);
cart = await api('/cart/items', {
  method: 'POST', body: JSON.stringify({ productId: second.id, quantity: 1 }),
});
ok('second item added', cart.body.items?.length === 2);
ok('subtotal correct', cart.body.subtotal === P.price * 2 + second.price);

console.log('\n6. GUEST SAVES FOR LATER, THEN RESTORES');
const line = cart.body.items.find((i) => i.productId === second.id);
cart = await api(`/cart/items/${line.id}`, {
  method: 'PATCH', body: JSON.stringify({ savedForLater: true }),
});
ok('moved to saved', cart.body.savedForLater?.length === 1);
cart = await api(`/cart/items/${line.id}`, {
  method: 'PATCH', body: JSON.stringify({ savedForLater: false }),
});
ok('moved back to cart', cart.body.items?.length === 2);

console.log('\n7. GUEST REGISTERS  (the critical seam)');
const email = `journey${Date.now()}@example.com`;
const guestSubtotal = cart.body.subtotal;
const reg = await api('/auth/register', {
  method: 'POST',
  body: JSON.stringify({ email, password: 'Password123!', name: 'Journey User' }),
});
ok('account created', reg.status === 201);
const token = reg.body.token;

const merged = await api('/cart/merge', {
  method: 'POST', token, body: JSON.stringify({ sessionId: SESSION }),
});
ok('GUEST CART SURVIVED SIGN-IN', merged.body.subtotal === guestSubtotal,
   `${merged.body.subtotal} vs ${guestSubtotal}`);
ok('both items carried over', merged.body.items?.length === 2);

console.log('\n8. CUSTOMER CHECKS OUT');
ok('checkout page loads', (await page('/checkout')) === 200);
const stockBefore = (await api(`/products/${P.slug}`)).body.product.stock;

const order = await api('/orders', {
  method: 'POST', token,
  body: JSON.stringify({
    shipTo: {
      full_name: 'Journey User', line1: '410 Terry Ave N',
      city: 'Seattle', state: 'WA', postal_code: '98109',
    },
    paymentLast4: '4242',
  }),
});
ok('order placed', order.status === 201, JSON.stringify(order.body).slice(0, 150));
const O = order.body.order;
ok('order number looks real', /^112-\d{7}-\d{7}$/.test(O?.orderNumber ?? ''));
ok('totals add up', O.total === O.subtotal + O.shipping + O.tax);
ok('free shipping over $35', O.subtotal >= 3500 ? O.shipping === 0 : O.shipping > 0);
ok('delivery date set', !!O.deliveryEstimate);

const stockAfter = (await api(`/products/${P.slug}`)).body.product.stock;
ok('stock decremented', stockAfter === stockBefore - 2, `${stockBefore} -> ${stockAfter}`);

const after = await api('/cart', { token });
ok('cart emptied', after.body.items?.length === 0);

console.log('\n9. CUSTOMER VIEWS ORDERS');
ok('orders page loads', (await page('/orders')) === 200);
const hist = await api('/orders', { token });
ok('order in history', hist.body.orders?.length === 1);
const single = await api(`/orders/${O.orderNumber}`, { token });
ok('order detail loads', single.body.order?.orderNumber === O.orderNumber);
ok('line items snapshotted', single.body.order?.items?.[0]?.title?.length > 0);
ok('order detail page loads', (await page(`/orders/${O.orderNumber}`)) === 200);

console.log('\n10. SECURITY BOUNDARIES');
const other = await api('/auth/register', {
  method: 'POST',
  body: JSON.stringify({ email: `other${Date.now()}@x.com`, password: 'Password123!' }),
});
const peek = await api(`/orders/${O.orderNumber}`, { token: other.body.token });
ok("cannot read another user's order", peek.status === 404);
ok('orders require auth', (await api('/orders')).status === 401);

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
