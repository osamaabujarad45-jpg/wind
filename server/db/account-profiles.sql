CREATE TABLE IF NOT EXISTS captain_profiles (
  user_id BIGINT NOT NULL PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  state TEXT NOT NULL CHECK (state IN ('draft','under_review','action_needed','approved','review','paused','closing','rejected')),
  vehicle TEXT CHECK (vehicle IN ('motorcycle','bicycle','car','van','truck')),
  plate TEXT,
  approved_at BIGINT,
  legacy_role TEXT CHECK (legacy_role IN ('customer','driver')),
  legacy_status TEXT CHECK (legacy_status IN ('active','pending','blocked')),
  revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0)
);
