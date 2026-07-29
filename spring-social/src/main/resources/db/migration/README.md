# Flyway migrations

Empty on purpose. The schema was last rebuilt from the JPA entities, so there
is no baseline script — `ddl-auto: update` creates and extends tables, and
Flyway sits ready for the changes it cannot express.

## When to write a migration

`ddl-auto: update` only ever *adds*. It will never drop a column, rename one,
backfill data, re-parent a row, or tighten a column to `NOT NULL` — and when
asked to do those implicitly it half-applies the change and logs the failures
as warnings, leaving orphaned rows behind a healthy-looking startup.

So anything in that list ships here as a script:

```
V1__short_description.sql
V2__another_change.sql
```

Numbering starts at V1 and never reuses a number. Files run in version order
on startup, before JPA initialises.

## Rules learned the hard way

- **Never edit an applied migration.** Flyway checksums them; a changed file
  fails every subsequent boot. Corrections go in a new `V<n>`.
- **MySQL commits DDL implicitly** — a failed migration cannot roll back.
  Put any "refuse to run" guard at the very top so a bad state aborts before
  the first `ALTER`, and take a dump before deploying one.
- **Backfill before tightening:** add the column `NULL`, `UPDATE` it, then
  `MODIFY ... NOT NULL`. Adding a `NOT NULL` column straight onto a populated
  table fills it with zeros.
- **Watch FK-backing indexes:** dropping a unique key that a foreign key
  relies on for its index fails with errno 1553. Add the replacement key
  first, then drop the old one.
- **Guard messages are table names**, so keep them under MySQL's 64-character
  identifier limit or the error reads "identifier name is too long" instead
  of the actual reason.

## Adoption

`baseline-on-migrate: true` with `baseline-version: 0` means the first script
added here lands cleanly on the existing entity-built schema: Flyway stamps
what is already in the database, then applies every version above it.

Flyway is disabled for tests (`src/test/resources/application.yml`) — these
scripts are MySQL-flavoured and the tests build their schema from the
entities on H2.
