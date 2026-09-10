import { Router } from 'express';
import { query, withTransaction } from '../db/pool.js';
import { requireAuth, optionalAuth } from '../lib/auth.js';
import { serializeReview } from '../lib/serialize.js';

export const qaRouter = Router();

/** Questions and answers for a product, newest-and-most-voted first. */
qaRouter.get('/product/:productId', async (req, res, next) => {
  try {
    const { rows: questions } = await query(
      `SELECT * FROM questions WHERE product_id = $1
       ORDER BY votes DESC, created_at DESC LIMIT 20`,
      [req.params.productId]
    );

    const ids = questions.map((q) => q.id);
    const answers = ids.length
      ? (
          await query(
            `SELECT * FROM answers WHERE question_id = ANY($1::int[])
             ORDER BY votes DESC, created_at`,
            [ids]
          )
        ).rows
      : [];

    res.json({
      questions: questions.map((q) => ({
        id: q.id,
        author: q.author,
        body: q.body,
        votes: q.votes,
        createdAt: q.created_at,
        answers: answers
          .filter((a) => a.question_id === q.id)
          .map((a) => ({
            id: a.id,
            author: a.author,
            body: a.body,
            votes: a.votes,
            createdAt: a.created_at,
          })),
      })),
    });
  } catch (err) {
    next(err);
  }
});

qaRouter.post('/product/:productId', requireAuth, async (req, res, next) => {
  try {
    const body = (req.body?.body ?? '').trim();
    if (body.length < 5) {
      return res.status(400).json({ error: 'Please write a longer question' });
    }
    const { rows } = await query(
      `INSERT INTO questions (product_id, user_id, author, body)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.params.productId, req.user.id, req.user.name || 'Amazon Customer', body]
    );
    res.status(201).json({ question: { ...rows[0], answers: [] } });
  } catch (err) {
    next(err);
  }
});

qaRouter.post('/:questionId/answers', requireAuth, async (req, res, next) => {
  try {
    const body = (req.body?.body ?? '').trim();
    if (body.length < 2) {
      return res.status(400).json({ error: 'Please write a longer answer' });
    }
    const { rows } = await query(
      `INSERT INTO answers (question_id, user_id, author, body)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [req.params.questionId, req.user.id, req.user.name || 'Amazon Customer', body]
    );
    res.status(201).json({ answer: rows[0] });
  } catch (err) {
    next(err);
  }
});

// ---------------------------------------------------------------------------

export const reviewsRouter = Router();

reviewsRouter.get('/product/:productId', optionalAuth, async (req, res, next) => {
  try {
    const sort = req.query.sort === 'recent'
      ? 'created_at DESC'
      : 'helpful DESC, created_at DESC';
    const filter = req.query.rating ? 'AND rating = $2' : '';
    const params = req.query.rating
      ? [req.params.productId, Number(req.query.rating)]
      : [req.params.productId];

    const { rows } = await query(
      `SELECT * FROM reviews WHERE product_id = $1 ${filter} ORDER BY ${sort} LIMIT 30`,
      params
    );
    res.json({ reviews: rows.map(serializeReview) });
  } catch (err) {
    next(err);
  }
});

/**
 * Write a review. Only for products the customer actually bought - that is what
 * makes "Verified Purchase" mean anything. Writing also refreshes the product's
 * denormalised rating and count in the same transaction.
 */
reviewsRouter.post('/product/:productId', requireAuth, async (req, res, next) => {
  try {
    const { rating, title, body } = req.body ?? {};
    const stars = Number(rating);
    if (!Number.isInteger(stars) || stars < 1 || stars > 5) {
      return res.status(400).json({ error: 'Choose a rating between 1 and 5 stars' });
    }

    const bought = await query(
      `SELECT 1 FROM order_items oi
       JOIN orders o ON o.id = oi.order_id
       WHERE o.user_id = $1 AND oi.product_id = $2 LIMIT 1`,
      [req.user.id, req.params.productId]
    );

    const existing = await query(
      'SELECT 1 FROM reviews WHERE user_id = $1 AND product_id = $2',
      [req.user.id, req.params.productId]
    );
    if (existing.rowCount) {
      return res.status(409).json({ error: 'You have already reviewed this item' });
    }

    const review = await withTransaction(async (c) => {
      const { rows } = await c.query(
        `INSERT INTO reviews (product_id, user_id, author, rating, title, body, verified)
         VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
        [
          req.params.productId,
          req.user.id,
          req.user.name || 'Amazon Customer',
          stars,
          title?.trim() || null,
          body?.trim() || null,
          bought.rowCount > 0,
        ]
      );

      await c.query(
        `UPDATE products SET
           rating = COALESCE((SELECT ROUND(AVG(rating)::numeric, 1) FROM reviews WHERE product_id = $1), 0),
           review_count = review_count + 1
         WHERE id = $1`,
        [req.params.productId]
      );

      return rows[0];
    });

    res.status(201).json({ review: serializeReview(review) });
  } catch (err) {
    next(err);
  }
});

/** One helpful vote per person; the composite PK makes a repeat a no-op. */
reviewsRouter.post('/:reviewId/helpful', requireAuth, async (req, res, next) => {
  try {
    const inserted = await query(
      `INSERT INTO review_votes (review_id, user_id) VALUES ($1, $2)
       ON CONFLICT DO NOTHING RETURNING 1`,
      [req.params.reviewId, req.user.id]
    );
    if (!inserted.rowCount) {
      return res.status(409).json({ error: 'You already marked this helpful' });
    }
    const { rows } = await query(
      'UPDATE reviews SET helpful = helpful + 1 WHERE id = $1 RETURNING helpful',
      [req.params.reviewId]
    );
    res.json({ helpful: rows[0]?.helpful ?? 0 });
  } catch (err) {
    next(err);
  }
});
