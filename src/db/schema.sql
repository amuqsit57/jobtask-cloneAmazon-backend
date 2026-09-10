-- Amazon clone schema.
--
-- Money is stored in integer cents throughout. Floating point money is the classic
-- e-commerce bug: 0.1 + 0.2 != 0.3, and it surfaces as a cart total that is a penny
-- off after a few line items.

DROP TABLE IF EXISTS order_items CASCADE;
DROP TABLE IF EXISTS orders CASCADE;
DROP TABLE IF EXISTS cart_items CASCADE;
DROP TABLE IF EXISTS carts CASCADE;
DROP TABLE IF EXISTS reviews CASCADE;
DROP TABLE IF EXISTS product_images CASCADE;
DROP TABLE IF EXISTS product_variants CASCADE;
DROP TABLE IF EXISTS products CASCADE;
DROP TABLE IF EXISTS categories CASCADE;
DROP TABLE IF EXISTS addresses CASCADE;
DROP TABLE IF EXISTS users CASCADE;

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  password_hash TEXT,                       -- null for OAuth-only accounts
  is_prime      BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE addresses (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  full_name    TEXT NOT NULL,
  line1        TEXT NOT NULL,
  line2        TEXT,
  city         TEXT NOT NULL,
  state        TEXT NOT NULL,
  postal_code  TEXT NOT NULL,
  country      TEXT NOT NULL DEFAULT 'United States',
  phone        TEXT,
  is_default   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_addresses_user ON addresses(user_id);

CREATE TABLE categories (
  id        SERIAL PRIMARY KEY,
  slug      TEXT NOT NULL UNIQUE,
  name      TEXT NOT NULL,
  parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  image_url TEXT,
  sort      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_categories_parent ON categories(parent_id);

CREATE TABLE products (
  id             SERIAL PRIMARY KEY,
  slug           TEXT NOT NULL UNIQUE,
  title          TEXT NOT NULL,
  brand          TEXT,
  description    TEXT,
  bullets        JSONB NOT NULL DEFAULT '[]'::jsonb,
  category_id    INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  price_cents    INTEGER NOT NULL CHECK (price_cents >= 0),
  list_price_cents INTEGER CHECK (list_price_cents >= 0),   -- struck-through "was" price
  currency       TEXT NOT NULL DEFAULT 'USD',
  stock          INTEGER NOT NULL DEFAULT 0,
  rating         NUMERIC(2,1) NOT NULL DEFAULT 0,           -- denormalised, refreshed on review write
  review_count   INTEGER NOT NULL DEFAULT 0,
  is_prime       BOOLEAN NOT NULL DEFAULT TRUE,
  is_best_seller BOOLEAN NOT NULL DEFAULT FALSE,
  free_returns   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_price ON products(price_cents);
CREATE INDEX idx_products_rating ON products(rating DESC);

-- Full-text search over title + brand + description. A GIN index on a generated
-- tsvector keeps search fast without a separate search service.
ALTER TABLE products ADD COLUMN search_tsv tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(brand, '')), 'B') ||
    setweight(to_tsvector('english', coalesce(description, '')), 'C')
  ) STORED;
CREATE INDEX idx_products_search ON products USING GIN (search_tsv);

CREATE TABLE product_images (
  id         SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url        TEXT NOT NULL,
  alt        TEXT,
  sort       INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_product_images_product ON product_images(product_id);

CREATE TABLE product_variants (
  id          SERIAL PRIMARY KEY,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,               -- e.g. "Color", "Size"
  value       TEXT NOT NULL,               -- e.g. "Midnight", "Large"
  price_delta_cents INTEGER NOT NULL DEFAULT 0,
  image_url   TEXT
);
CREATE INDEX idx_variants_product ON product_variants(product_id);

CREATE TABLE reviews (
  id         SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  author     TEXT NOT NULL,
  rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title      TEXT,
  body       TEXT,
  verified   BOOLEAN NOT NULL DEFAULT TRUE,
  helpful    INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_reviews_product ON reviews(product_id);

CREATE TABLE carts (
  id         SERIAL PRIMARY KEY,
  user_id    INTEGER UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  session_id TEXT UNIQUE,                  -- guest carts, merged on sign-in
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (user_id IS NOT NULL OR session_id IS NOT NULL)
);

CREATE TABLE cart_items (
  id         SERIAL PRIMARY KEY,
  cart_id    INTEGER NOT NULL REFERENCES carts(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  quantity   INTEGER NOT NULL CHECK (quantity > 0),
  saved_for_later BOOLEAN NOT NULL DEFAULT FALSE,
  added_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (cart_id, product_id)
);
CREATE INDEX idx_cart_items_cart ON cart_items(cart_id);

CREATE TABLE orders (
  id              SERIAL PRIMARY KEY,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  order_number    TEXT NOT NULL UNIQUE,
  status          TEXT NOT NULL DEFAULT 'placed',
  subtotal_cents  INTEGER NOT NULL,
  shipping_cents  INTEGER NOT NULL DEFAULT 0,
  tax_cents       INTEGER NOT NULL DEFAULT 0,
  total_cents     INTEGER NOT NULL,
  ship_to         JSONB NOT NULL,          -- snapshot: address may change later
  payment_last4   TEXT,
  placed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  delivery_estimate DATE
);
CREATE INDEX idx_orders_user ON orders(user_id, placed_at DESC);

-- Line items snapshot title and price. An order must always show what was actually
-- bought at the price actually paid, even after the product is edited or deleted.
CREATE TABLE order_items (
  id             SERIAL PRIMARY KEY,
  order_id       INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id     INTEGER REFERENCES products(id) ON DELETE SET NULL,
  title          TEXT NOT NULL,
  image_url      TEXT,
  unit_price_cents INTEGER NOT NULL,
  quantity       INTEGER NOT NULL CHECK (quantity > 0)
);
CREATE INDEX idx_order_items_order ON order_items(order_id);
