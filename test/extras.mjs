/** Tests the extended customer features: wishlist, Q&A, reviews, coupons, returns, Prime. */

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
      'x-cart-session': opts.session ?? 'extras-' + Date.now(),
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

const email = `extras${Date.now()}@example.com`;
const reg = await api('/auth/register', {
  method: 'POST',
  body: JSON.stringify({ email, password: 'Password123!', name: 'Extras Tester' }),
});
const token = reg.body.token;
const session = 'extras-' + Date.now();

const { body: cat } = await api('/products?limit=3');
const P = cat.products[0];

console.log('\nWISHLIST');
let wl = await api('/wishlist', { token });
ok('empty wishlist created lazily', wl.body.wishlist?.items?.length === 0);
wl = await api('/wishlist/items', {
  method: 'POST', token, body: JSON.stringify({ productId: P.id }),
});
ok('added to wishlist', wl.body.items?.length === 1);
wl = await api('/wishlist/items', {
  method: 'POST', token, body: JSON.stringify({ productId: P.id }),
});
ok('duplicate add is a no-op', wl.body.items?.length === 1);

const shared = await api('/wishlist', {
  method: 'PATCH', token, body: JSON.stringify({ isPublic: true, name: 'Gift Ideas' }),
});
ok('list renamed and shared', shared.body.wishlist?.isPublic === true);
const slug = shared.body.wishlist.shareSlug;
const pub = await api(`/wishlist/shared/${slug}`);
ok('shared list readable without auth', pub.body.wishlist?.items?.length === 1);
ok('shared list shows owner', !!pub.body.wishlist?.ownerName);

const removed = await api(`/wishlist/items/${P.id}`, { method: 'DELETE', token });
ok('removed from wishlist', removed.body.items?.length === 0);

console.log('\nQ&A');
const qa = await api(`/questions/product/${P.id}`);
ok('questions load', Array.isArray(qa.body.questions));
const asked = await api(`/questions/product/${P.id}`, {
  method: 'POST', token, body: JSON.stringify({ body: 'Does this ship internationally?' }),
});
ok('can ask a question', asked.status === 201);
const answered = await api(`/questions/${asked.body.question.id}/answers`, {
  method: 'POST', token, body: JSON.stringify({ body: 'Yes, it shipped to me in Canada.' }),
});
ok('can answer a question', answered.status === 201);
const tooShort = await api(`/questions/product/${P.id}`, {
  method: 'POST', token, body: JSON.stringify({ body: 'hi' }),
});
ok('rejects an empty question', tooShort.status === 400);

console.log('\nCOUPONS');
const good = await api('/coupons/validate', {
  method: 'POST', body: JSON.stringify({ code: 'SAVE10', subtotal: 10000 }),
});
ok('percent coupon validates', good.body.coupon?.discount === 1000);
const flat = await api('/coupons/validate', {
  method: 'POST', body: JSON.stringify({ code: 'WELCOME5', subtotal: 5000 }),
});
ok('flat coupon validates', flat.body.coupon?.discount === 500);
const belowMin = await api('/coupons/validate', {
  method: 'POST', body: JSON.stringify({ code: 'WELCOME5', subtotal: 1000 }),
});
ok('rejects below minimum', belowMin.status === 400);
const bogus = await api('/coupons/validate', {
  method: 'POST', body: JSON.stringify({ code: 'NOTREAL', subtotal: 10000 }),
});
ok('rejects unknown code', bogus.status === 404);

console.log('\nPRIME');
let prime = await api('/prime', { token });
ok('prime status readable', prime.body.isPrime === false);
ok('lists benefits', prime.body.benefits?.length > 0);
prime = await api('/prime', { method: 'POST', token, body: JSON.stringify({ join: true }) });
ok('can join prime', prime.body.isPrime === true);

console.log('\nCHECKOUT WITH COUPON + SPEED');
await api('/cart/items', {
  method: 'POST', token, session,
  body: JSON.stringify({ productId: P.id, quantity: 2 }),
});
const cart = await api('/cart', { token });
const sub = cart.body.subtotal;

const order = await api('/orders', {
  method: 'POST', token,
  body: JSON.stringify({
    shipTo: { full_name: 'Extras Tester', line1: '1 Main St', city: 'Seattle',
              state: 'WA', postal_code: '98109' },
    couponCode: 'SAVE10',
    shippingSpeed: 'priority',
    isGift: true,
    giftMessage: 'Happy birthday',
  }),
});
ok('order placed with coupon', order.status === 201, JSON.stringify(order.body).slice(0, 140));
const O = order.body.order;
ok('discount applied', O?.discount === Math.round(sub * 0.1), `${O?.discount}`);
ok('coupon recorded', O?.couponCode === 'SAVE10');
ok('gift flag stored', O?.isGift === true);
ok('gift message stored', O?.giftMessage === 'Happy birthday');
ok('prime gets priority shipping free', O?.shipping === 0);
ok('tax on discounted subtotal',
   O?.tax === Math.round((O.subtotal - O.discount) * 0.0725));
ok('total is consistent',
   O?.total === O.subtotal - O.discount + O.shipping + O.tax);

const bad = await api('/orders', {
  method: 'POST', token,
  body: JSON.stringify({
    shipTo: { full_name: 'X', line1: '1 St', city: 'Seattle', state: 'WA', postal_code: '98109' },
    couponCode: 'NOTREAL',
  }),
});
ok('invalid coupon rejected at checkout', bad.status === 400);

console.log('\nREVIEWS');
const wrote = await api(`/reviews/product/${P.id}`, {
  method: 'POST', token,
  body: JSON.stringify({ rating: 5, title: 'Great', body: 'Exactly as described.' }),
});
ok('can write a review', wrote.status === 201);
ok('marked verified after purchase', wrote.body.review?.verified === true);
const dupe = await api(`/reviews/product/${P.id}`, {
  method: 'POST', token, body: JSON.stringify({ rating: 4 }),
});
ok('one review per product', dupe.status === 409);
const badRating = await api(`/reviews/product/${cat.products[1].id}`, {
  method: 'POST', token, body: JSON.stringify({ rating: 9 }),
});
ok('rejects invalid rating', badRating.status === 400);

const helpful = await api(`/reviews/${wrote.body.review.id}/helpful`, {
  method: 'POST', token,
});
ok('can vote helpful', helpful.body.helpful === 1);
const revote = await api(`/reviews/${wrote.body.review.id}/helpful`, {
  method: 'POST', token,
});
ok('cannot vote twice', revote.status === 409);

console.log('\nRETURNS');
const reasons = await api('/returns/reasons');
ok('return reasons listed', reasons.body.reasons?.length > 0);
const itemId = O.items[0].id;
const stockBefore = (await api(`/products/${P.slug}`)).body.product.stock;
const ret = await api('/returns', {
  method: 'POST', token,
  body: JSON.stringify({ orderItemId: itemId, reason: 'No longer needed', comments: 'Changed my mind' }),
});
ok('return requested', ret.status === 201, JSON.stringify(ret.body).slice(0, 140));
ok('refund calculated', ret.body.return?.refund === O.items[0].lineTotal);
const stockAfter = (await api(`/products/${P.slug}`)).body.product.stock;
ok('stock restored on return', stockAfter > stockBefore, `${stockBefore} -> ${stockAfter}`);
const dupeRet = await api('/returns', {
  method: 'POST', token,
  body: JSON.stringify({ orderItemId: itemId, reason: 'No longer needed' }),
});
ok('cannot return the same item twice', dupeRet.status === 409);
const badReason = await api('/returns', {
  method: 'POST', token,
  body: JSON.stringify({ orderItemId: O.items[0].id, reason: 'because' }),
});
ok('rejects invalid reason', badReason.status === 400);
const list = await api('/returns', { token });
ok('returns listed', list.body.returns?.length === 1);

console.log(`\n=== ${pass} passed, ${fail} failed ===`);
process.exit(fail === 0 ? 0 : 1);
