-- Removes columns for features cut from the product:
--   * the appearance / host-transfer / FoF-visibility / default-private
--     settings toggles (non-functional — never enforced)
--   * the notional activity "map" coordinates (no real geolocation)

ALTER TABLE user_settings DROP COLUMN appearance;
ALTER TABLE user_settings DROP COLUMN host_transfer_enabled;
ALTER TABLE user_settings DROP COLUMN show_me_to_fof;
ALTER TABLE user_settings DROP COLUMN default_private;

ALTER TABLE activities DROP COLUMN map_x;
ALTER TABLE activities DROP COLUMN map_y;
