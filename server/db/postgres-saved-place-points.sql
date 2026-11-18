-- Saved places keep their own pin (research priority #6). Nullable: older rows stay landmark-only.
ALTER TABLE saved_places ADD COLUMN lat DOUBLE PRECISION, ADD COLUMN lng DOUBLE PRECISION;
ALTER TABLE saved_places ADD CONSTRAINT saved_places_point_pair CHECK ((lat IS NULL) = (lng IS NULL));
