-- Seller and admin roles.
--
-- A seller is a user with a different role reading the same catalog, not a
-- separate identity system. That keeps one auth model across the whole product.

ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'customer';
ALTER TABLE users ADD COLUMN IF NOT EXISTS store_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS store_slug TEXT UNIQUE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS seller_since TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE users ADD CONSTRAINT users_role_check
    CHECK (role IN ('customer', 'seller', 'admin'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Every product belongs to a seller. Null means it predates seller support and
-- is backfilled by the seed.
ALTER TABLE products ADD COLUMN IF NOT EXISTS seller_id INTEGER
  REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_products_seller ON products(seller_id);

-- Listing moderation: admins approve or reject what sellers publish.
ALTER TABLE products ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';
DO $$ BEGIN
  ALTER TABLE products ADD CONSTRAINT products_status_check
    CHECK (status IN ('active', 'pending', 'rejected', 'archived'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);

ALTER TABLE products ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Per-line seller attribution, snapshotted like the rest of the order line, so a
-- seller's sales history survives the product being reassigned or deleted.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS seller_id INTEGER
  REFERENCES users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_order_items_seller ON order_items(seller_id);

-- Fulfilment state per line: a seller confirms shipment of their own items even
-- when an order contains items from several sellers.
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS fulfillment_status TEXT
  NOT NULL DEFAULT 'unshipped';
DO $$ BEGIN
  ALTER TABLE order_items ADD CONSTRAINT order_items_fulfillment_check
    CHECK (fulfillment_status IN ('unshipped', 'shipped', 'delivered', 'cancelled'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE order_items ADD COLUMN IF NOT EXISTS shipped_at TIMESTAMPTZ;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS tracking_number TEXT;

-- Admin actions, so moderation is auditable rather than silent.
CREATE TABLE IF NOT EXISTS admin_actions (
  id          SERIAL PRIMARY KEY,
  admin_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
  action      TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id   INTEGER,
  note        TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_admin_actions_created ON admin_actions(created_at DESC);
