# Backend DB Folder

Holds the SQLite database (`database.db`, git-ignored), the cronjob lock
file and `backups/`. Create it with `just db-init` (or `just db-seed` for
sample data: one product tracked in two stores, with 60 days of prices each).

The schema is managed with Alembic migrations (see
[`../migrations/README.md`](../migrations/README.md)). `just db-migrate` (the
same as `just db-init`, and what the container runs on every start) applies
the pending ones, first copying the database to
`backups/database-<old revision>-<date>.db`. Backups are never deleted
automatically.
