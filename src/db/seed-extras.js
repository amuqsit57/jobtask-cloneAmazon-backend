/**
 * Seeds the community and promotion data that the extended customer flow needs:
 * coupons, and questions with answers on the busiest products.
 *
 * Split from seed.js so the catalog can be reseeded without wiping Q&A, and so
 * this can run against an existing database after the 002 migration.
 */
import { pool, withTransaction } from './pool.js';

const COUPONS = [
  { code: 'SAVE10', description: '10% off your order', percent: 10, min: 0 },
  { code: 'WELCOME5', description: '$5 off orders over $25', amount: 500, min: 2500 },
  { code: 'BIGDEAL20', description: '20% off orders over $100', percent: 20, min: 10000 },
  { code: 'FREESHIP', description: '$5.99 off shipping', amount: 599, min: 0 },
];

const QA = [
  ['Does this come with a warranty?', 'Yes, it includes a one year manufacturer warranty. I registered mine online in about two minutes.'],
  ['Is it easy to set up?', 'Very. It took me under ten minutes from opening the box to using it. The quick start guide covers everything.'],
  ['How is the build quality?', 'Solid. It does not feel cheap at all, and I have been using mine daily for a few months with no issues.'],
  ['Would you buy it again?', 'Absolutely. I have already recommended it to two friends and one of them bought it.'],
  ['Does it work well for everyday use?', 'That is exactly what I use it for and it has held up perfectly.'],
];

const ASKERS = ['Marcus L.', 'Priya S.', 'Tom H.', 'Elena V.', 'Jordan K.', 'Sam R.'];
const ANSWERERS = ['Verified Buyer', 'Kate M.', 'Devin P.', 'Amazon Customer', 'Rosa G.'];

async function main() {
  await withTransaction(async (c) => {
    for (const co of COUPONS) {
      await c.query(
        `INSERT INTO coupons (code, description, percent_off, amount_off_cents, min_subtotal_cents)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (code) DO UPDATE
           SET description = EXCLUDED.description,
               percent_off = EXCLUDED.percent_off,
               amount_off_cents = EXCLUDED.amount_off_cents,
               min_subtotal_cents = EXCLUDED.min_subtotal_cents`,
        [co.code, co.description, co.percent ?? null, co.amount ?? null, co.min]
      );
    }
    console.log(`[extras] ${COUPONS.length} coupons`);

    // Only seed Q&A once, so re-running does not pile up duplicate questions.
    const existing = await c.query('SELECT COUNT(*)::int AS n FROM questions');
    if (existing.rows[0].n > 0) {
      console.log('[extras] questions already seeded, skipping');
      return;
    }

    const products = await c.query(
      'SELECT id FROM products ORDER BY review_count DESC LIMIT 12'
    );

    let q = 0;
    let a = 0;
    for (const [idx, p] of products.rows.entries()) {
      const howMany = 2 + (idx % 3);
      for (let i = 0; i < howMany; i++) {
        const [question, answer] = QA[(idx + i) % QA.length];
        const { rows } = await c.query(
          `INSERT INTO questions (product_id, author, body, votes, created_at)
           VALUES ($1,$2,$3,$4, NOW() - ($5 || ' days')::interval) RETURNING id`,
          [p.id, ASKERS[(idx + i) % ASKERS.length], question, (idx * 3 + i) % 40, String(10 + i * 9)]
        );
        q++;
        await c.query(
          `INSERT INTO answers (question_id, author, body, votes, created_at)
           VALUES ($1,$2,$3,$4, NOW() - ($5 || ' days')::interval)`,
          [rows[0].id, ANSWERERS[(idx + i) % ANSWERERS.length], answer, (idx + i) % 25, String(8 + i * 7)]
        );
        a++;
      }
    }
    console.log(`[extras] ${q} questions, ${a} answers`);
  });

  const { rows } = await pool.query(
    `SELECT (SELECT COUNT(*) FROM coupons) AS coupons,
            (SELECT COUNT(*) FROM questions) AS questions,
            (SELECT COUNT(*) FROM answers) AS answers`
  );
  console.log('[extras] verify:', rows[0]);
  await pool.end();
}

main().catch((e) => {
  console.error('[extras] failed:', e.message);
  process.exit(1);
});
