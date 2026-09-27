# Backend DB Folder

Holds the SQLite database (`database.db`, git-ignored) and the cronjob lock
file. Create it with `just db-init` (or `just db-seed` for sample data: one
product tracked in two stores, with 60 days of prices each).

The schema has no migrations: after a change to `src/models/database_models.py`
(e.g. the split of products into offers per store), delete and recreate the
database.
