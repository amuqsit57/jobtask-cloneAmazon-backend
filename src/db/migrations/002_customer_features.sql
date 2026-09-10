-- Wishlists, Q&A, customer-written reviews, coupons, returns and Prime.

CREATE TABLE IF NOT EXISTS wishlists (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name       TEXT NOT NULL DEFAULT 'Shopping List',
  is_public  BOOLEAN NOT NULL DEFAULT FALSE,
  share_slug TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_wishlists_user ON wishlists(user_id);

CREATE TABLE IF NOT EXISTS wishlist_items (
  id          SERIAL PRIMARY KEY,
  wishlist_id INTEGER NOT NULL REFERENCES wishlists(id) ON DELETE CASCADE,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  added_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (wishlist_id, product_id)
);

CREATE TABLE IF NOT EXISTS questions (
  id         SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  author     TEXT NOT NULL,
  body       TEXT NOT NULL,
  votes      INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_questions_product ON questions(product_id);

CREATE TABLE IF NOT EXISTS answers (
  id          SERIAL PRIMARY KEY,
  question_id INTEGER NOT NULL REFERENCES questions(id) ON DELETE CASCADE,
  user_id     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  author      TEXT NOT NULL,
  body        TEXT NOT NULL,
  votes       INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_answers_question ON answers(question_id);

-- Coupons applied at checkout.
CREATE TABLE IF NOT EXISTS coupons (
  code            TEXT PRIMARY KEY,
  description     TEXT NOT NULL,
  percent_off     INTEGER CHECK (percent_off BETWEEN 1 AND 90),
  amount_off_cents INTEGER CHECK (amount_off_cents > 0),
  min_subtotal_cents INTEGER NOT NULL DEFAULT 0,
  active          BOOLEAN NOT NULL DEFAULT TRUE,
  expires_at      TIMESTAMPTZ,
  CHECK (percent_off IS NOT NULL OR amount_off_cents IS NOT NULL)
);

-- Returns against a delivered order line.
CREATE TABLE IF NOT EXISTS returns (
  id            SERIAL PRIMARY KEY,
  order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  order_item_id INTEGER NOT NULL REFERENCES order_items(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reason        TEXT NOT NULL,
  comments      TEXT,
  status        TEXT NOT NULL DEFAULT 'requested',
  refund_cents  INTEGER NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (order_item_id)
);
CREATE INDEX IF NOT EXISTS idx_returns_user ON returns(user_id);

-- Order-level additions for coupons and gift options.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS discount_cents INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS is_gift BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS gift_message TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS shipping_speed TEXT NOT NULL DEFAULT 'standard';

-- Prime membership and review authorship.
ALTER TABLE users ADD COLUMN IF NOT EXISTS prime_since TIMESTAMPTZ;
ALTER TABLE reviews ADD COLUMN IF NOT EXISTS images JSONB NOT NULL DEFAULT '[]'::jsonb;

-- One review per customer per product.
CREATE UNIQUE INDEX IF NOT EXISTS idx_reviews_user_product
  ON reviews(user_id, product_id) WHERE user_id IS NOT NULL;

-- Track who found a review helpful so a vote cannot be repeated.
CREATE TABLE IF NOT EXISTS review_votes (
  review_id INTEGER NOT NULL REFERENCES reviews(id) ON DELETE CASCADE,
  user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (review_id, user_id)
);
