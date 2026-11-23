-- Migration 43 (owner, 23 Nov 2026): restaurants join the shop line, so a customer can order a meal. Same rule on SQLite
-- (server/db/sqlite-schema.ts). The inline CHECK from migration 33 carries PostgreSQL's default name.
ALTER TABLE merchants DROP CONSTRAINT IF EXISTS merchants_category_check;
ALTER TABLE merchants ADD CONSTRAINT merchants_category_check CHECK (category IN ('grocery','bakery','goods','restaurant'));
