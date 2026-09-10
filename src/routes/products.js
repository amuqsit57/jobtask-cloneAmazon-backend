import { Router } from 'express';
import { query } from '../db/pool.js';
import { serializeProduct, serializeReview } from '../lib/serialize.js';

export const productsRouter = Router();

const SORTS = {
  featured: 'p.is_best_seller DESC, p.review_count DESC',
  'price-asc': 'p.price_cents ASC',
  'price-desc': 'p.price_cents DESC',
  rating: 'p.rating DESC, p.review_count DESC',
  newest: 'p.created_at DESC',
};

/**
 * GET /api/products
 * Supports search (q), category, price range, rating floor, prime filter,
 * sort and pagination - i.e. everything the results page facets need.
 */
productsRouter.get('/', async (req, res, next) => {
  try {
    const {
      q,
      category,
      minPrice,
      maxPrice,
      minRating,
      prime,
      sort = 'featured',
      page = '1',
      limit = '24',
    } = req.query;

    const where = [];
    const params = [];
    const add = (clause, value) => {
      params.push(value);
      where.push(clause.replace('?', `$${params.length}`));
    };

    if (q) add('p.search_tsv @@ plainto_tsquery(\'english\', ?)', q);
    if (category) add('c.slug = ?', category);
    if (minPrice) add('p.price_cents >= ?', Math.round(Number(minPrice) * 100));
    if (maxPrice) add('p.price_cents <= ?', Math.round(Number(maxPrice) * 100));
    if (minRating) add('p.rating >= ?', Number(minRating));
    if (prime === 'true') where.push('p.is_prime = TRUE');
    // Only approved listings reach the storefront. Pending, rejected and
    // archived products stay visible to their seller and to admins only.
    where.push("p.status = 'active'");

    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const orderSql = SORTS[sort] ?? SORTS.featured;

    const perPage = Math.min(Number(limit) || 24, 60);
    const pageNum = Math.max(Number(page) || 1, 1);
    const offset = (pageNum - 1) * perPage;

    // Relevance ordering only makes sense when there is a query to rank against.
    const rankSql = q
      ? `ts_rank(p.search_tsv, plainto_tsquery('english', $1)) DESC,`
      : '';

    const sql = `
      SELECT p.*, c.slug AS category_slug, c.name AS category_name,
             (SELECT url FROM product_images pi WHERE pi.product_id = p.id
               ORDER BY sort LIMIT 1) AS image_url,
             COUNT(*) OVER() AS total_count
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      ${whereSql}
      ORDER BY ${sort === 'featured' && q ? rankSql : ''} ${orderSql}
      LIMIT $${params.length + 1} OFFSET $${params.length + 2}
    `;

    const { rows } = await query(sql, [...params, perPage, offset]);
    const total = rows.length ? Number(rows[0].total_count) : 0;

    res.json({
      products: rows.map((r) => serializeProduct(r)),
      pagination: {
        page: pageNum,
        perPage,
        total,
        totalPages: Math.ceil(total / perPage),
      },
    });
  } catch (err) {
    next(err);
  }
});

/** Search suggestions for the header dropdown. */
productsRouter.get('/suggest', async (req, res, next) => {
  try {
    const { q } = req.query;
    if (!q || q.length < 2) return res.json({ suggestions: [] });

    const { rows } = await query(
      `SELECT title, slug FROM products
       WHERE title ILIKE $1 AND status = 'active'
       ORDER BY review_count DESC LIMIT 8`,
      [`%${q}%`]
    );
    res.json({ suggestions: rows });
  } catch (err) {
    next(err);
  }
});

/** Home page rails. */
productsRouter.get('/featured', async (_req, res, next) => {
  try {
    const pick = (sql, params = []) =>
      query(
        `SELECT p.*, c.slug AS category_slug, c.name AS category_name,
                (SELECT url FROM product_images pi WHERE pi.product_id = p.id
                  ORDER BY sort LIMIT 1) AS image_url
         FROM products p LEFT JOIN categories c ON c.id = p.category_id
         ${sql}`,
        params
      );

    const [bestSellers, deals, topRated] = await Promise.all([
      pick("WHERE p.is_best_seller = TRUE AND p.status = 'active' ORDER BY p.review_count DESC LIMIT 12"),
      pick(
        `WHERE p.list_price_cents > p.price_cents AND p.status = 'active'
         ORDER BY (p.list_price_cents - p.price_cents)::float / p.list_price_cents DESC
         LIMIT 12`
      ),
      pick("WHERE p.status = 'active' ORDER BY p.rating DESC, p.review_count DESC LIMIT 12"),
    ]);

    res.json({
      bestSellers: bestSellers.rows.map((r) => serializeProduct(r)),
      deals: deals.rows.map((r) => serializeProduct(r)),
      topRated: topRated.rows.map((r) => serializeProduct(r)),
    });
  } catch (err) {
    next(err);
  }
});

/** Product detail, with images, variants and displayed reviews. */
productsRouter.get('/:slug', async (req, res, next) => {
  try {
    const { rows } = await query(
      `SELECT p.*, c.slug AS category_slug, c.name AS category_name,
              u.store_name, u.store_slug
       FROM products p
       LEFT JOIN categories c ON c.id = p.category_id
       LEFT JOIN users u ON u.id = p.seller_id
       WHERE p.slug = $1`,
      [req.params.slug]
    );
    if (!rows.length) return res.status(404).json({ error: 'Product not found' });

    const product = rows[0];

    const [images, variants, reviews, related, breakdown, questions] = await Promise.all([
      query(
        'SELECT url, alt FROM product_images WHERE product_id = $1 ORDER BY sort',
        [product.id]
      ),
      query(
        `SELECT name, value, price_delta_cents FROM product_variants
         WHERE product_id = $1 ORDER BY id`,
        [product.id]
      ),
      query(
        'SELECT * FROM reviews WHERE product_id = $1 ORDER BY helpful DESC, created_at DESC LIMIT 10',
        [product.id]
      ),
      query(
        `SELECT p.*, (SELECT url FROM product_images pi WHERE pi.product_id = p.id
                       ORDER BY sort LIMIT 1) AS image_url
         FROM products p
         WHERE p.category_id = $1 AND p.id <> $2 AND p.status = 'active'
         ORDER BY p.rating DESC LIMIT 8`,
        [product.category_id, product.id]
      ),
      query(
        `SELECT rating, COUNT(*)::int AS n FROM reviews
         WHERE product_id = $1 GROUP BY rating`,
        [product.id]
      ),
      query(
        `SELECT q.*,
                COALESCE(json_agg(
                  json_build_object('id', a.id, 'author', a.author,
                                    'body', a.body, 'votes', a.votes)
                  ORDER BY a.votes DESC
                ) FILTER (WHERE a.id IS NOT NULL), '[]') AS answers
         FROM questions q
         LEFT JOIN answers a ON a.question_id = q.id
         WHERE q.product_id = $1
         GROUP BY q.id
         ORDER BY q.votes DESC, q.created_at DESC
         LIMIT 6`,
        [product.id]
      ),
    ]);

    // Group variants by their axis (Color, Size, ...) for the buy box selectors.
    const grouped = {};
    for (const v of variants.rows) {
      (grouped[v.name] ??= []).push({
        value: v.value,
        priceDelta: Number(v.price_delta_cents),
      });
    }

    const dist = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    for (const r of breakdown.rows) dist[r.rating] = r.n;

    res.json({
      product: serializeProduct(product, {
        images: images.rows.map((i) => i.url),
        image: images.rows[0]?.url ?? null,
        variants: grouped,
        rest: {
          reviews: reviews.rows.map(serializeReview),
          ratingDistribution: dist,
          related: related.rows.map((r) => serializeProduct(r)),
          storeName: product.store_name ?? null,
          storeSlug: product.store_slug ?? null,
          questions: questions.rows.map((q) => ({
            id: q.id,
            author: q.author,
            body: q.body,
            votes: q.votes,
            createdAt: q.created_at,
            answers: q.answers,
          })),
        },
      }),
    });
  } catch (err) {
    next(err);
  }
});
