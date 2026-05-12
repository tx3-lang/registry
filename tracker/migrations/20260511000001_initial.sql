CREATE TABLE matches (
    id            BIGSERIAL   PRIMARY KEY,
    tx_hash       BYTEA       NOT NULL,
    block_slot    BIGINT      NOT NULL,
    block_hash    BYTEA       NOT NULL,
    source_name   TEXT        NOT NULL,
    protocol_name TEXT        NOT NULL,
    tx_name       TEXT        NOT NULL,
    profile_name  TEXT        NOT NULL,
    lifted        JSONB       NOT NULL,
    matched_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tx_hash, source_name)
);

CREATE INDEX idx_matches_block  ON matches (block_slot, block_hash);
CREATE INDEX idx_matches_source ON matches (source_name);

CREATE TABLE cursor (
    id         SMALLINT PRIMARY KEY CHECK (id = 1),
    slot       BIGINT   NOT NULL,
    block_hash BYTEA    NOT NULL
);
