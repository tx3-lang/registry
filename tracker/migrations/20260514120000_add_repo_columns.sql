ALTER TABLE matches
    ADD COLUMN repo_scope   TEXT NOT NULL DEFAULT '',
    ADD COLUMN repo_name    TEXT NOT NULL DEFAULT '',
    ADD COLUMN repo_version TEXT NOT NULL DEFAULT '';

UPDATE matches
SET
    repo_scope   = split_part(split_part(source_name, ':', 1), '/', 1),
    repo_name    = split_part(split_part(source_name, ':', 1), '/', 2),
    repo_version = split_part(source_name, ':', 2)
WHERE repo_scope = '';

ALTER TABLE matches
    ALTER COLUMN repo_scope   DROP DEFAULT,
    ALTER COLUMN repo_name    DROP DEFAULT,
    ALTER COLUMN repo_version DROP DEFAULT;

CREATE INDEX idx_matches_repo ON matches (repo_scope, repo_name, id DESC);
