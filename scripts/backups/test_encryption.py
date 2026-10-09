"""Real local cryptographic roundtrips; only disposable fictional bytes are used."""

from pathlib import Path
import tempfile
import unittest
from common import BackupError
from encryption import crypt, validate_password

PASSWORD = "fictional-local-backup-passphrase-123456789"


class EncryptedBackup(unittest.TestCase):
    def test_authenticated_roundtrip_keeps_plaintext_and_password_out_of_ciphertext(self):
        with tempfile.TemporaryDirectory(prefix="finora-encryption-test-") as directory:
            plain, encrypted, recovered = (Path(directory) / name for name in ("fixture.tar", "fixture.gpg", "recovered.tar"))
            fixture = b"fictional-financial-auth-fixture-12345\x00\x01" * 200
            plain.write_bytes(fixture)
            crypt(plain, encrypted, PASSWORD)
            self.assertNotIn(fixture[:36], encrypted.read_bytes())
            self.assertNotIn(PASSWORD.encode(), encrypted.read_bytes())
            self.assertEqual(encrypted.stat().st_mode & 0o777, 0o600)
            crypt(encrypted, recovered, PASSWORD, decrypt=True)
            self.assertEqual(recovered.read_bytes(), fixture)

    def test_wrong_passphrase_and_ciphertext_corruption_are_rejected(self):
        with tempfile.TemporaryDirectory(prefix="finora-encryption-test-") as directory:
            plain, encrypted, recovered = (Path(directory) / name for name in ("fixture.tar", "fixture.gpg", "recovered.tar"))
            plain.write_bytes(b"fictional-secret-ledger" * 200)
            crypt(plain, encrypted, PASSWORD)
            with self.assertRaises(BackupError):
                crypt(encrypted, recovered, "different-fictional-passphrase-123456789", decrypt=True)
            self.assertFalse(recovered.exists())
            altered = bytearray(encrypted.read_bytes())
            altered[-25] ^= 0x01
            encrypted.write_bytes(altered)
            with self.assertRaises(BackupError):
                crypt(encrypted, recovered, PASSWORD, decrypt=True)
            self.assertFalse(recovered.exists())

    def test_empty_weak_or_multiline_passphrases_are_rejected(self):
        for password in ("", "short", PASSWORD + "\n", PASSWORD + "\x00"):
            with self.subTest(password_length=len(password)), self.assertRaises(BackupError):
                validate_password(password)
