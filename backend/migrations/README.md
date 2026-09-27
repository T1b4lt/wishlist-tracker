# Database Migrations

The SQLite schema is versioned with [Alembic](https://alembic.sqlalchemy.org).
`versions/` holds one script per schema change; the database records the
revision it is at in the `alembic_version` table.

`src/core/migrations.py` applies them: `python -m src.setup_backend` (run by
`just db-init` / `just db-migrate` and by the container entrypoint on every
start) creates a new database by running every migration, or backs up an
existing one to `db/backups/` and upgrades it. The API refuses to start while
migrations are pending.

## Changing the Schema

1. Edit the models in `src/models/database_models.py`.
2. Generate the migration from the difference between the models and your
   (up-to-date) local database:

   ```bash
   just db-revision "add notes to products"
   ```

3. Review the generated `versions/<date>_<rev>_<slug>.py`. Autogenerate does
   not detect everything (e.g. renamed columns show up as a drop plus an add,
   losing the data) and cannot fill in values for existing rows.
4. Apply it with `just db-migrate` and run `just test-backend`:
   `tests/test_migrations.py` fails if the migrations do not produce exactly
   the models' schema, or if a downgrade does not undo its upgrade.
5. Commit the model change and the migration together.

Once a migration is part of a published release, never edit it: add a new
one instead, since existing databases have already run it.

## Writing Migrations for SQLite

- **Batch mode.** SQLite cannot alter most column properties, so migrations
  use `op.batch_alter_table(...)`: Alembic recreates the table with the new
  definition and copies the rows. Autogenerate already emits it.
- **New non-null columns need a default for existing rows**, e.g.
  `Field(default="", sa_column_kwargs={"server_default": ""})` in the model,
  or add the column as nullable, fill it with `op.execute(...)`, then make it
  non-null.
- **Data migrations** (moving or transforming rows) go in the same script,
  with `op.execute(...)` or `op.get_bind()`. Do not import the application
  models there: they describe the latest schema, not the one at that point.
- **Foreign keys are off during migrations** (the migration engine never
  enables them), so recreating a parent table does not cascade-delete its
  children.
- **Downgrades** are kept working (the tests run them), but updates are
  rolled back by restoring the backup, not by downgrading.

## Useful Commands

Run from `backend/`:

```bash
uv run alembic current                 # Revision of db/database.db
uv run alembic history --indicate-current
uv run alembic upgrade head --sql      # Print the SQL instead of running it
uv run alembic -x db_url=sqlite:////tmp/scratch.db upgrade head  # Another database
```
