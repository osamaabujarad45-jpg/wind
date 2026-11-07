-- Presentation and revision binding only; this migration does not activate boarding.
ALTER TABLE ride_lifecycle ADD COLUMN IF NOT EXISTS pin_issued_at BIGINT;
ALTER TABLE ride_lifecycle ADD COLUMN IF NOT EXISTS pin_verified_at BIGINT;
ALTER TABLE ride_lifecycle ADD COLUMN IF NOT EXISTS pin_revision BIGINT NOT NULL DEFAULT 0 CHECK (pin_revision >= 0);
