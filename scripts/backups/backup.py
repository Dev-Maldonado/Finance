#!/usr/bin/env python3
"""Create a consistent private archive of FINORA's public and Auth schemas."""

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sys
from uuid import uuid4
from common import BackupError, SCHEMAS, checksum, connection, data_exclusions, private_directory, require_clients, run, schema_hash, schema_options


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", required=True, help="Private absolute directory outside this checkout (0700).")
    args = parser.parse_args()
    os.umask(0o077)
    db = connection("FINORA_BACKUP")
    directory = private_directory(args.output_dir)
    require_clients(db)
    schema_before = schema_hash(db)
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    name = f"finora-{stamp}-{uuid4().hex[:8]}"
    archive = directory / f"{name}.dump"
    manifest_path = directory / f"{name}.json"
    try:
        run(["pg_dump", "--no-password", "--format=custom", "--no-owner", "--no-acl", *schema_options(), *data_exclusions(), f"--file={archive}"], db["env"])
        archive.chmod(0o600)
        if schema_hash(db) != schema_before:
            raise BackupError("Schema changed during the backup; rerun after migrations have stopped.")
        run(["pg_restore", "--list", str(archive)], db["env"], timeout=60)
        manifest = {"format": "finora-postgres-17-v1", "created_at": datetime.now(timezone.utc).isoformat(),
                    "source_project_ref": db["project"], "source": db["identity"], "schemas": list(SCHEMAS),
                    "archive": archive.name, "sha256": checksum(archive), "schema_sha256": schema_before}
        with manifest_path.open("x", encoding="utf-8") as file:
            json.dump(manifest, file, indent=2)
            file.write("\n")
    except BaseException:
        archive.unlink(missing_ok=True)
        manifest_path.unlink(missing_ok=True)
        raise
    print(f"Private backup created: {manifest_path}")
    print("Auth data is included. Encrypt and copy both files to private durable storage; verify a restore separately.")


if __name__ == "__main__":
    try:
        main()
    except (BackupError, OSError) as error:
        message = str(error) if isinstance(error, BackupError) else "The private backup directory is missing or not writable."
        print(f"Backup refused: {message}", file=sys.stderr)
        sys.exit(1)
