#!/usr/bin/env python3
"""Restore only into a separate, empty database with the exact existing schema."""

import argparse
import json
import os
from pathlib import Path
import sys
from common import BackupError, METADATA_TABLES, checksum, connection, guard_destination, psql, read_manifest, require_clients, run, schema_hash


def quote_identifier(value):
    return '"' + value.replace('"', '""') + '"'


def require_empty(db):
    encoded = psql(db, "SELECT COALESCE(json_agg(json_build_object('schema', schemaname, 'table', tablename)), '[]'::json) FROM pg_tables WHERE schemaname IN ('public', 'auth');")
    tables = json.loads(encoded)
    # Never rely on estimated row counts when deciding whether it is safe to restore.
    for table in tables:
        if table["schema"] + "." + table["table"] in METADATA_TABLES:
            continue
        name = quote_identifier(table["schema"]) + "." + quote_identifier(table["table"])
        if psql(db, f"SELECT EXISTS(SELECT 1 FROM {name} LIMIT 1);") != "f":
            raise BackupError("The destination contains public/Auth data; only an empty isolated database is supported.")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", required=True, help="Private JSON manifest emitted by backup.py.")
    parser.add_argument("--confirm-destination", required=True, help="Exact separate project ref or local label.")
    parser.add_argument("--check-only", action="store_true", help="Verify archive, isolation, schema and emptiness without restoring.")
    args = parser.parse_args()
    os.umask(0o077)
    path = Path(args.manifest).resolve()
    manifest = read_manifest(path)
    archive = path.parent / manifest["archive"]
    if archive.is_symlink() or path.stat().st_mode & 0o077 or archive.stat().st_mode & 0o077:
        raise BackupError("The archive and manifest must be private regular files with mode 0600.")
    if checksum(archive) != manifest["sha256"]:
        raise BackupError("Archive checksum mismatch; do not restore a damaged or modified backup.")
    db = connection("FINORA_RESTORE")
    guard_destination(manifest, db, args.confirm_destination)
    require_clients(db)
    run(["pg_restore", "--list", str(archive)], db["env"], timeout=60)
    if schema_hash(db) != manifest["schema_sha256"]:
        raise BackupError("Destination schema differs. Provision matching FINORA migrations and Auth version in the isolated project first.")
    require_empty(db)
    if args.check_only:
        print("Restore checks passed; no destination data was written.")
        return
    # Data-only preserves the verified target schema, owners, grants and RLS.
    # A single transaction rolls back every table on any unsupported Auth permission.
    run(["pg_restore", "--no-password", "--data-only", "--disable-triggers", "--single-transaction", "--exit-on-error", "--no-owner", "--no-acl", f"--dbname={db['identity']['database']}", str(archive)], db["env"])
    print("Data restored into the isolated destination in one transaction. Verify totals, RLS and Auth before declaring recovery successful.")


if __name__ == "__main__":
    try:
        main()
    except (BackupError, OSError) as error:
        message = str(error) if isinstance(error, BackupError) else "Private backup files are missing or unreadable."
        print(f"Restore refused: {message}", file=sys.stderr)
        sys.exit(1)
