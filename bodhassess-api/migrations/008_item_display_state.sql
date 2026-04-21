-- 008_item_display_state.sql
-- Per-item display overrides + soft-delete flags for the Item Explorer. One
-- row per item_id. `override` JSONB holds partial field changes the admin
-- made in the Item Explorer modal (stem, format, options, risk flag,
-- sub-domain, status). `deleted = true` hides the item from the table.

CREATE TABLE IF NOT EXISTS item_display_state (
    item_id     VARCHAR(128) PRIMARY KEY,
    override    JSONB,
    deleted     BOOLEAN      NOT NULL DEFAULT FALSE,
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_item_display_deleted ON item_display_state (deleted) WHERE deleted = TRUE;

DROP TRIGGER IF EXISTS item_display_state_updated_at ON item_display_state;
CREATE TRIGGER item_display_state_updated_at BEFORE UPDATE ON item_display_state
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
