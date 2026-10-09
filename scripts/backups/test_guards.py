"""Offline safety checks; no real connections, credentials or dumps are used."""

import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from common import BackupError, ROOT, connection, guard_destination, private_directory, read_manifest

SOURCE = "abcdefghijklmnopqrst"
TARGET = "zyxwvutsrqponmlkjihg"


def fixture_env(ref=SOURCE, host=None, user="postgres", query=""):
    return {"FINORA_BACKUP_PROJECT_REF": ref,
            "FINORA_BACKUP_DATABASE_URL": f"postgresql://{user}:unit-test-placeholder@{host or 'db.' + ref + '.supabase.co'}:5432/postgres{query}"}


class BackupGuards(unittest.TestCase):
    def test_separate_private_fields_encode_password_and_cannot_mix_with_url(self):
        env = {"FINORA_BACKUP_PROJECT_REF": SOURCE, "FINORA_BACKUP_PGHOST": f"db.{SOURCE}.supabase.co", "FINORA_BACKUP_PGUSER": "postgres", "FINORA_BACKUP_PGDATABASE": "postgres", "FINORA_BACKUP_PGPASSWORD": "fictional:p@ss/%$&"}
        with patch.dict(os.environ, env, clear=True):
            db = connection("FINORA_BACKUP")
        self.assertEqual(db["env"]["PGPASSWORD"], "fictional:p@ss/%$&")
        self.assertEqual(db["env"]["PGSSLMODE"], "verify-full")
        env["FINORA_BACKUP_DATABASE_URL"] = fixture_env()["FINORA_BACKUP_DATABASE_URL"]
        with patch.dict(os.environ, env, clear=True), self.assertRaises(BackupError):
            connection("FINORA_BACKUP")

    def test_private_config_does_not_inherit_postgres_overrides(self):
        env = fixture_env()
        env.update(PGHOSTADDR="203.0.113.1", PGOPTIONS="unsafe-placeholder", SUPABASE_SERVICE_ROLE_KEY="unit-test-placeholder")
        with patch.dict(os.environ, env, clear=True):
            db = connection("FINORA_BACKUP")
        self.assertEqual(db["identity"]["host"], f"db.{SOURCE}.supabase.co")
        self.assertEqual(db["env"]["PGSSLMODE"], "verify-full")
        self.assertEqual(db["env"]["PGSSLROOTCERT"], "system")
        self.assertNotIn("PGHOSTADDR", db["env"])
        self.assertNotIn("PGOPTIONS", db["env"])
        self.assertNotIn("SUPABASE_SERVICE_ROLE_KEY", db["env"])

    def test_declared_hosted_project_must_match(self):
        with patch.dict(os.environ, fixture_env(host=f"db.{TARGET}.supabase.co"), clear=True):
            with self.assertRaises(BackupError):
                connection("FINORA_BACKUP")

    def test_pooler_requires_project_specific_user(self):
        with patch.dict(os.environ, fixture_env(host="aws-0-sa-east-1.pooler.supabase.com", user=f"postgres.{SOURCE}"), clear=True):
            self.assertEqual(connection("FINORA_BACKUP")["project"], SOURCE)
        with patch.dict(os.environ, fixture_env(host="aws-0-sa-east-1.pooler.supabase.com", user=f"postgres.{TARGET}"), clear=True):
            with self.assertRaises(BackupError):
                connection("FINORA_BACKUP")

    def test_tls_downgrade_and_connection_options_refused(self):
        for query in ("?sslmode=disable", "?sslmode=require", "?hostaddr=203.0.113.1", "?sslmode=verify-full&sslmode=disable"):
            with self.subTest(query=query), patch.dict(os.environ, fixture_env(query=query), clear=True):
                with self.assertRaises(BackupError):
                    connection("FINORA_BACKUP")

    def test_database_cannot_override_destination(self):
        env = fixture_env()
        env["FINORA_BACKUP_DATABASE_URL"] = f"postgresql://postgres:unit-test-placeholder@db.{SOURCE}.supabase.co/postgres%20host%3Ddb.{TARGET}.supabase.co"
        with patch.dict(os.environ, env, clear=True):
            with self.assertRaises(BackupError):
                connection("FINORA_BACKUP")

    def test_transaction_pooler_is_not_a_backup_connection(self):
        env = fixture_env(host="aws-0-sa-east-1.pooler.supabase.com", user=f"postgres.{SOURCE}")
        env["FINORA_BACKUP_DATABASE_URL"] = env["FINORA_BACKUP_DATABASE_URL"].replace(":5432/", ":6543/")
        with patch.dict(os.environ, env, clear=True):
            with self.assertRaises(BackupError):
                connection("FINORA_BACKUP")

    def test_local_label_and_identity(self):
        env = fixture_env(ref="local-recovery", host="127.0.0.1")
        with patch.dict(os.environ, env, clear=True):
            db = connection("FINORA_BACKUP")
        self.assertTrue(db["local"])
        self.assertEqual(db["env"]["PGSSLMODE"], "disable")
        with patch.dict(os.environ, fixture_env(host="127.0.0.1"), clear=True):
            with self.assertRaises(BackupError):
                connection("FINORA_BACKUP")

    def test_restore_cannot_target_source_via_other_host_or_label(self):
        source = {"source_project_ref": SOURCE, "source": {"host": f"db.{SOURCE}.supabase.co", "port": 5432, "database": "postgres"}}
        same_project_other_host = {"project": SOURCE, "identity": {"host": "aws-0-sa-east-1.pooler.supabase.com", "port": 5432, "database": "postgres"}, "local": False}
        same_identity_other_label = {"project": TARGET, "identity": source["source"], "local": False}
        for target in (same_project_other_host, same_identity_other_label):
            with self.subTest(target=target), self.assertRaises(BackupError):
                guard_destination(source, target, target["project"])

    def test_restore_requires_confirmation_and_hosted_isolation(self):
        source = {"source_project_ref": SOURCE, "source": {"host": f"db.{SOURCE}.supabase.co", "port": 5432, "database": "postgres"}}
        target = {"project": TARGET, "identity": {"host": f"db.{TARGET}.supabase.co", "port": 5432, "database": "postgres"}, "local": False}
        with patch.dict(os.environ, {}, clear=True):
            with self.assertRaises(BackupError):
                guard_destination(source, target, SOURCE)
            with self.assertRaises(BackupError):
                guard_destination(source, target, TARGET)
        with patch.dict(os.environ, {"FINORA_RESTORE_ISOLATED": "yes"}, clear=True):
            guard_destination(source, target, TARGET)

    def test_output_cannot_enter_repository_or_public_directory(self):
        with self.assertRaises(BackupError):
            private_directory(str(ROOT))
        with self.assertRaises(BackupError):
            private_directory("relative-path")
        with tempfile.TemporaryDirectory(prefix="finora-backup-guards-") as folder:
            directory = Path(folder)
            self.assertEqual(private_directory(str(directory)), directory.resolve())
            directory.chmod(0o755)
            with self.assertRaises(BackupError):
                private_directory(str(directory))

    def test_manifest_rejects_archive_path_traversal(self):
        manifest = {"format": "finora-postgres-17-v1", "schemas": ["public", "auth"], "archive": "../private.dump",
                    "sha256": "a" * 64, "schema_sha256": "b" * 64, "source_project_ref": SOURCE,
                    "source": {"host": f"db.{SOURCE}.supabase.co", "port": 5432, "database": "postgres"}}
        with tempfile.TemporaryDirectory(prefix="finora-backup-guards-") as folder:
            path = Path(folder) / "manifest.json"
            path.write_text(json.dumps(manifest))
            with self.assertRaises(BackupError):
                read_manifest(path)
            manifest["archive"] = "private.dump"
            path.write_text(json.dumps(manifest))
            self.assertEqual(read_manifest(path)["archive"], "private.dump")


if __name__ == "__main__":
    unittest.main()
