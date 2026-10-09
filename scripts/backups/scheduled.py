#!/usr/bin/env python3
"""Create and verify encrypted backup artifacts; discard every plaintext temporary file."""

import argparse
from datetime import datetime, timezone
import os
from pathlib import Path
import subprocess
import sys
import tarfile
import tempfile
from uuid import uuid4
from common import BackupError, ROOT, checksum, private_directory, read_manifest
from encryption import crypt, validate_password


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output-dir", required=True, help="Private absolute directory outside the checkout; contains only encrypted artifacts.")
    args = parser.parse_args()
    os.umask(0o077)
    password = os.environ.get("FINORA_BACKUP_PASSWORD", "")
    validate_password(password)
    output = private_directory(args.output_dir)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    sealed = output / f"finora-encrypted-{timestamp}-{uuid4().hex[:8]}.tar.gpg"
    try:
        with tempfile.TemporaryDirectory(prefix="finora-private-backup-") as directory:
            temporary = private_directory(directory)
            plain = temporary / "plain"
            result = subprocess.run([sys.executable, str(ROOT / "scripts/backups/backup.py"), "--output-dir", str(plain)], capture_output=True, text=True, timeout=1800)
            if result.returncode:
                raise BackupError("Private PostgreSQL backup failed; encrypted artifact was not created. Inspect connection and PostgreSQL permissions privately.")
            manifests = list(plain.glob("*.json"))
            if len(manifests) != 1:
                raise BackupError("Backup did not produce exactly one manifest.")
            manifest = read_manifest(manifests[0])
            archive = plain / manifest["archive"]
            if checksum(archive) != manifest["sha256"]:
                raise BackupError("Plain backup checksum mismatch; nothing was uploaded.")
            bundle = temporary / "private.tar"
            with tarfile.open(bundle, "w") as tar:
                tar.add(archive, arcname=archive.name, recursive=False)
                tar.add(manifests[0], arcname=manifests[0].name, recursive=False)
            crypt(bundle, sealed, password)
            recovered = temporary / "verification.tar"
            crypt(sealed, recovered, password, decrypt=True)
            if checksum(bundle) != checksum(recovered):
                raise BackupError("Encrypted backup roundtrip differs; nothing was uploaded.")
            with tarfile.open(recovered, "r") as tar:
                names = {member.name for member in tar.getmembers()}
                if names != {archive.name, manifests[0].name}:
                    raise BackupError("Encrypted bundle has unexpected members.")
            with (output / (sealed.name + ".sha256")).open("x") as file:
                file.write(f"{checksum(sealed)}  {sealed.name}\n")
        print("Encrypted PostgreSQL/Auth backup verified. Output contains only authenticated ciphertext and its checksum; plaintext temporary files were removed.")
    except BaseException:
        sealed.unlink(missing_ok=True)
        (output / (sealed.name + ".sha256")).unlink(missing_ok=True)
        raise


if __name__ == "__main__":
    try:
        main()
    except (BackupError, OSError, subprocess.TimeoutExpired) as error:
        message = str(error) if isinstance(error, BackupError) else "Encrypted backup could not complete; no private details were logged."
        print(message, file=sys.stderr)
        sys.exit(1)
