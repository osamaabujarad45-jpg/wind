-- Presentation and revision binding only; this migration does not activate boarding.
ALTER TABLE ride_lifecycle ADD COLUMN IF NOT EXISTS pin_issued_at BIGINT;
ALTER TABLE ride_lifecycle ADD COLUMN IF NOT EXISTS pin_verified_at BIGINT;
ALTER TABLE ride_lifecycle ADD COLUMN IF NOT EXISTS pin_revision BIGINT NOT NULL DEFAULT 0 CHECK (pin_revision >= 0);
-- The code a rotation replaced, so a client that sends no revision is refused without spending the new challenge's attempts.
ALTER TABLE ride_lifecycle ADD COLUMN IF NOT EXISTS previous_boarding_code TEXT CHECK (previous_boarding_code ~ '^[0-9]{4}$');
