"""Authenticated GnuPG encryption; passphrases only enter a private subprocess pipe."""

import os
from pathlib import Path
import subprocess
import tempfile
from common import BackupError


def validate_password(password):
    if not isinstance(password, str) or not 32 <= len(password.encode()) <= 4096 or any(character in password for character in "\n\r\x00"):
        raise BackupError("Configure FINORA_BACKUP_PASSWORD as an independent random passphrase of at least 32 bytes without line breaks.")


def crypt(source, destination, password, decrypt=False):
    validate_password(password)
    source, destination = Path(source), Path(destination)
    if not source.is_file() or source.is_symlink() or destination.exists():
        raise BackupError("Encryption requires a regular private input and a new output file.")
    env = {key: os.environ[key] for key in ("PATH", "LANG", "LC_ALL", "TMPDIR") if key in os.environ}
    with tempfile.TemporaryDirectory(prefix="finora-gpg-") as directory:
        Path(directory).chmod(0o700)
        command = ["gpg", "--batch", "--yes", "--no-tty", "--homedir", directory, "--pinentry-mode", "loopback", "--passphrase-fd", "0", "--no-symkey-cache", "--output", str(destination)]
        if decrypt:
            command += ["--decrypt", str(source)]
        else:
            command += ["--symmetric", "--cipher-algo", "AES256", "--force-mdc", "--compress-algo", "none", "--s2k-mode", "3", "--s2k-count", "65011712", "--s2k-digest-algo", "SHA512", str(source)]
        try:
            result = subprocess.run(command, input=password + "\n", text=True, capture_output=True, env=env, timeout=600)
            if result.returncode:
                raise BackupError("Authenticated backup encryption/decryption failed; no passphrase or database details were logged.")
            destination.chmod(0o600)
        except (FileNotFoundError, subprocess.TimeoutExpired):
            destination.unlink(missing_ok=True)
            raise BackupError("Install GnuPG 2 and retry the private encryption operation.") from None
        except BaseException:
            destination.unlink(missing_ok=True)
            raise
