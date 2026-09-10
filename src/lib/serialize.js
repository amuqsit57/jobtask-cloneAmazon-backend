/**
 * Row -> API shape.
 *
 * Prices cross the wire as integer cents plus a preformatted display string.
 * Formatting once on the server keeps every surface consistent and stops each
 * component from reinventing currency rendering.
 */

const usd = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

export const formatPrice = (cents) => usd.format((cents ?? 0) / 100);

/** Amazon splits the price visually: $12 then a raised 99. */
export function priceParts(cents) {
  const whole = Math.floor((cents ?? 0) / 100);
  const frac = String((cents ?? 0) % 100).padStart(2, '0');
  return { whole: whole.toLocaleString('en-US'), frac };
}

export function serializeProduct(row, extras = {}) {
  const price = Number(row.price_cents);
  const list = row.list_price_cents == null ? null : Number(row.list_price_cents);
  const discount =
    list && list > price ? Math.round(((list - price) / list) * 100) : null;

  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    brand: row.brand,
    description: row.description,
    bullets: row.bullets ?? [],
    categoryId: row.category_id,
    categorySlug: row.category_slug ?? null,
    categoryName: row.category_name ?? null,
    price,
    priceFormatted: formatPrice(price),
    priceParts: priceParts(price),
    listPrice: list,
    listPriceFormatted: list == null ? null : formatPrice(list),
    discountPercent: discount,
    stock: Number(row.stock),
    inStock: Number(row.stock) > 0,
    rating: Number(row.rating),
    reviewCount: Number(row.review_count),
    isPrime: row.is_prime,
    isBestSeller: row.is_best_seller,
    freeReturns: row.free_returns,
    image: row.image_url ?? extras.image ?? null,
    images: extras.images ?? (row.image_url ? [row.image_url] : []),
    variants: extras.variants ?? [],
    ...extras.rest,
  };
}

export function serializeReview(row) {
  return {
    id: row.id,
    author: row.author,
    rating: Number(row.rating),
    title: row.title,
    body: row.body,
    verified: row.verified,
    helpful: Number(row.helpful),
    createdAt: row.created_at,
  };
}

export function serializeOrder(row, items = []) {
  return {
    id: row.id,
    orderNumber: row.order_number,
    status: row.status,
    subtotal: Number(row.subtotal_cents),
    subtotalFormatted: formatPrice(row.subtotal_cents),
    shipping: Number(row.shipping_cents),
    shippingFormatted: formatPrice(row.shipping_cents),
    tax: Number(row.tax_cents),
    taxFormatted: formatPrice(row.tax_cents),
    total: Number(row.total_cents),
    totalFormatted: formatPrice(row.total_cents),
    discount: Number(row.discount_cents ?? 0),
    discountFormatted: formatPrice(row.discount_cents ?? 0),
    couponCode: row.coupon_code ?? null,
    isGift: row.is_gift ?? false,
    giftMessage: row.gift_message ?? null,
    shippingSpeed: row.shipping_speed ?? 'standard',
    shipTo: row.ship_to,
    paymentLast4: row.payment_last4,
    placedAt: row.placed_at,
    deliveryEstimate: row.delivery_estimate,
    items: items.map((i) => ({
      id: i.id,
      productId: i.product_id,
      slug: i.slug ?? null,
      title: i.title,
      image: i.image_url,
      unitPrice: Number(i.unit_price_cents),
      unitPriceFormatted: formatPrice(i.unit_price_cents),
      quantity: Number(i.quantity),
      lineTotal: Number(i.unit_price_cents) * Number(i.quantity),
      lineTotalFormatted: formatPrice(
        Number(i.unit_price_cents) * Number(i.quantity)
      ),
    })),
  };
}
