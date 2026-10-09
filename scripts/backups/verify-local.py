#!/usr/bin/env python3
"""Exercise backup/restore on disposable PostgreSQL 17, using local schema only."""

import os
from pathlib import Path
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
import tarfile
import time
from uuid import uuid4
from encryption import crypt

ROOT = Path(__file__).resolve().parents[2]
USER_A = "10000000-0000-4000-8000-000000000001"
USER_B = "10000000-0000-4000-8000-000000000002"
ACCOUNT_A = "20000000-0000-4000-8000-000000000001"
ACCOUNT_B = "20000000-0000-4000-8000-000000000002"
ACCOUNT_GOAL = "20000000-0000-4000-8000-000000000003"
GOAL = "30000000-0000-4000-8000-000000000001"
CARD = "40000000-0000-4000-8000-000000000001"
PURCHASE = "50000000-0000-4000-8000-000000000001"
ASSET = "60000000-0000-4000-8000-000000000001"


def execute(command, env, sql=None, expected=0, expected_message=None):
    result = subprocess.run(command, env=env, input=sql, text=True, capture_output=True, timeout=180)
    if result.returncode != expected or (expected_message is not None and expected_message not in result.stderr):
        diagnostic = ""
        if command[0].endswith("docker") and "psql" in command and command[command.index("psql") + 1:] and "finora-local-db-1" not in command:
            # Only isolated fixture SQL is eligible; never print DETAIL/rows.
            error = re.search(r"ERROR:\s+([^\n]+)", result.stderr)
            if error:
                diagnostic = " " + error.group(1)[:180]
        elif len(command) > 1 and Path(command[1]).name in ("backup.py", "restore.py"):
            diagnostic = " " + result.stderr.strip()[:300]
        raise RuntimeError(f"Local roundtrip step failed: {Path(command[0]).name}; exit {result.returncode}.{diagnostic}")
    return result.stdout.strip()


def main():
    if len(sys.argv) != 1:
        raise RuntimeError("No connection/profile arguments are accepted; this verification uses disposable local databases only.")
    env = {key: os.environ[key] for key in ("PATH", "HOME", "LANG", "LC_ALL", "TMPDIR") if key in os.environ}
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    docker = shutil.which("docker", path=env.get("PATH"))
    if not docker:
        raise RuntimeError("Docker is required. Start the repository's local database with npm run db:start first.")
    # No rows, credentials, .env files or production connections are copied.
    schema = execute([docker, "exec", "finora-local-db-1", "env", "-i", "PATH=/usr/local/bin:/usr/bin:/bin",
                      "pg_dump", "--host=/var/run/postgresql", "--port=5432", "--dbname=postgres", "-U", "postgres",
                      "--no-password", "--schema-only", "--no-owner", "--no-acl", "--schema=public", "--schema=auth"], env)
    container = "finora-backup-check-" + uuid4().hex[:12]
    with tempfile.TemporaryDirectory(prefix="finora-backup-check-") as folder:
        temporary = Path(folder)
        try:
            execute([docker, "run", "--detach", "--rm", "--name", container, "--network", "none",
                     "--mount", f"type=bind,source={folder},target={folder}", "--tmpfs", "/var/lib/postgresql/data:rw,size=256m",
                     "--env", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:17-alpine"], env)
            for attempt in range(60):
                ready = subprocess.run([docker, "exec", container, "pg_isready", "-U", "postgres"], env=env, capture_output=True, timeout=5)
                if ready.returncode == 0:
                    break
                time.sleep(0.5)
            else:
                raise RuntimeError("Disposable PostgreSQL did not become ready.")
            base = [docker, "exec", "-i", container, "psql", "-U", "postgres", "--no-psqlrc", "--set=ON_ERROR_STOP=1", "--tuples-only", "--no-align"]
            execute(base, env, "CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN BYPASSRLS; CREATE ROLE authenticator NOLOGIN; CREATE DATABASE finora_backup_source; CREATE DATABASE finora_restore_target;")
            grants = "SET search_path=public,auth; GRANT USAGE ON SCHEMA public,auth TO authenticated,anon; GRANT SELECT ON financial_accounts,transactions,savings_lots,credit_card_installments,account_balances TO authenticated,anon;"
            for database in ("finora_backup_source", "finora_restore_target"):
                execute(base + ["--dbname", database], env, "DROP SCHEMA public CASCADE; CREATE SCHEMA extensions;\n" + schema + "\n" + grants)
                metadata_version = "source-test" if database == "finora_backup_source" else "target-test"
                execute(base + ["--dbname", database], env,
                        f"INSERT INTO public.finora_migrations(name) VALUES ('{database}'); INSERT INTO auth.schema_migrations(version) VALUES ('{metadata_version}');")
            fixture = f"""
INSERT INTO auth.users(id,email,raw_user_meta_data,raw_app_meta_data) VALUES
('{USER_A}','backup-one@example.test','{{"name":"Backup test A"}}','{{}}'),
('{USER_B}','backup-two@example.test','{{"name":"Backup test B"}}','{{}}');
INSERT INTO auth.identities(user_id,provider,provider_id,identity_data) VALUES
('{USER_A}','email','{USER_A}','{{"sub":"{USER_A}","email":"backup-one@example.test"}}'),
('{USER_B}','email','{USER_B}','{{"sub":"{USER_B}","email":"backup-two@example.test"}}');
INSERT INTO financial_accounts(id,user_id,name,initial_balance,kind) VALUES
('{ACCOUNT_A}','{USER_A}','Test checking','1000.00','bank'),
('{ACCOUNT_B}','{USER_B}','Other user','2000.00','bank'),
('{ACCOUNT_GOAL}','{USER_A}','Test reserve','500.00','savings');
INSERT INTO transactions(user_id,account_id,description,type,amount,date) VALUES
('{USER_A}','{ACCOUNT_A}','Test income','income','100.15','2026-10-01'),
('{USER_A}','{ACCOUNT_A}','Test expense','expense','-33.34','2026-10-01');
INSERT INTO credit_cards(id,user_id,name,credit_limit,closing_day,due_day,account_id) VALUES
('{CARD}','{USER_A}','Test card','1000',5,10,'{ACCOUNT_A}');
INSERT INTO credit_card_purchases(id,user_id,card_id,description,amount,date,installments) VALUES
('{PURCHASE}','{USER_A}','{CARD}','Test purchase','100.00','2026-10-01',3);
INSERT INTO credit_card_invoices(id,user_id,card_id,due_date) VALUES
('70000000-0000-4000-8000-000000000001','{USER_A}','{CARD}','2026-10-10'),
('70000000-0000-4000-8000-000000000002','{USER_A}','{CARD}','2026-11-10'),
('70000000-0000-4000-8000-000000000003','{USER_A}','{CARD}','2026-12-10');
INSERT INTO credit_card_installments(user_id,purchase_id,invoice_id,number,amount) VALUES
('{USER_A}','{PURCHASE}','70000000-0000-4000-8000-000000000001',1,'33.34'),
('{USER_A}','{PURCHASE}','70000000-0000-4000-8000-000000000002',2,'33.33'),
('{USER_A}','{PURCHASE}','70000000-0000-4000-8000-000000000003',3,'33.33');
INSERT INTO savings_goals(id,user_id,name,account_id,target,indexer,percentage,product) VALUES
('{GOAL}','{USER_A}','Test reserve','{ACCOUNT_GOAL}','5000','cdi','110','cdb');
INSERT INTO savings_lots(user_id,goal_id,principal,remaining,start_date,indexer,percentage,product,tax_exempt) VALUES
('{USER_A}','{GOAL}','500.00','500.00','2026-10-01','cdi','110','cdb',false);
INSERT INTO investment_assets(id,user_id,ticker,name,asset_class) VALUES
('{ASSET}','{USER_A}','TEST4','Backup fixture','stock');
INSERT INTO investment_opening_positions(user_id,asset_id,quantity,cost,date) VALUES
('{USER_A}','{ASSET}','10','100','2026-10-01');
"""
            execute(base + ["--dbname", "finora_backup_source"], env, fixture)
            wrappers = temporary / "bin"
            wrappers.mkdir(mode=0o700)
            variables = ("PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD", "PGSSLMODE", "PGCONNECT_TIMEOUT", "PGAPPNAME", "PGSSLROOTCERT")
            for tool in ("psql", "pg_dump", "pg_restore"):
                script = wrappers / tool
                command = [docker, "exec", "-i", "--user", f"{os.getuid()}:{os.getgid()}"]
                for variable in variables:
                    command.extend(["--env", variable])
                command.extend([container, tool])
                script.write_text("#!/bin/sh\nexec " + shlex.join(command) + ' "$@"\n')
                script.chmod(0o700)
            profile = {**env, "PATH": str(wrappers) + os.pathsep + env.get("PATH", ""),
                       "TMPDIR": folder,
                       "FINORA_BACKUP_DATABASE_URL": "postgresql://postgres:fixture@127.0.0.1:5432/finora_backup_source",
                       "FINORA_BACKUP_PROJECT_REF": "local-roundtrip-source",
                       "FINORA_RESTORE_DATABASE_URL": "postgresql://postgres:fixture@127.0.0.1:5432/finora_restore_target",
                       "FINORA_RESTORE_PROJECT_REF": "local-roundtrip-target"}
            directory = temporary / "private"
            execute([sys.executable, str(ROOT / "scripts/backups/backup.py"), "--output-dir", str(directory)], profile)
            manifests = list(directory.glob("*.json"))
            if len(manifests) != 1:
                raise RuntimeError("Expected exactly one private backup manifest.")
            restore = [sys.executable, str(ROOT / "scripts/backups/restore.py"), "--manifest", str(manifests[0]), "--confirm-destination", "local-roundtrip-target"]
            execute(restore + ["--check-only"], profile)
            if execute(base + ["--dbname", "finora_restore_target"], env, "SELECT count(*) FROM auth.users;") != "0":
                raise RuntimeError("Check-only unexpectedly wrote data.")
            execute(restore, profile)
            target = base + ["--dbname", "finora_restore_target"]
            expected = "2|2|2|3|3566.81|100.00|500.00|10.00000000|100.00"
            totals = "SELECT (SELECT count(*) FROM auth.users),(SELECT count(*) FROM auth.identities),(SELECT count(*) FROM transactions),(SELECT count(*) FROM credit_card_installments),(SELECT sum(balance::numeric) FROM account_balances),(SELECT sum(amount) FROM credit_card_installments),(SELECT sum(remaining) FROM savings_lots),(SELECT sum(quantity) FROM investment_opening_positions),(SELECT sum(cost) FROM investment_opening_positions);"
            if execute(target, env, totals) != expected:
                raise RuntimeError("Restored Auth/financial counts or decimal totals differ.")
            if execute(target, env, "SELECT name FROM finora_migrations;") != "finora_restore_target" or execute(target, env, "SELECT version FROM auth.schema_migrations;") != "target-test":
                raise RuntimeError("Restore unexpectedly replaced destination migration metadata.")
            for user, count in ((USER_A, "2"), (USER_B, "1"), (str(uuid4()), "0")):
                output = execute(target, env, f"SET ROLE authenticated; SET request.jwt.claim.sub='{user}'; SELECT count(*) FROM financial_accounts;")
                if output.splitlines()[-1] != count:
                    raise RuntimeError("Restored RLS does not isolate user accounts.")
            if execute(target, env, "SET ROLE anon; SELECT count(*) FROM financial_accounts;").splitlines()[-1] != "0":
                raise RuntimeError("Restored RLS exposes accounts to anonymous role.")
            # Exercise the scheduled path too: only ciphertext leaves its private tempdir.
            password = "fictional-local-encrypted-backup-passphrase-123456789"
            encrypted_directory = temporary / "encrypted"
            execute([sys.executable, str(ROOT / "scripts/backups/scheduled.py"), "--output-dir", str(encrypted_directory)], {**profile, "FINORA_BACKUP_PASSWORD": password})
            encrypted_files = list(encrypted_directory.iterdir())
            if len(encrypted_files) != 2 or not all(path.name.endswith((".tar.gpg", ".tar.gpg.sha256")) for path in encrypted_files):
                raise RuntimeError("Scheduled backup output unexpectedly contains plaintext.")
            encrypted = next(encrypted_directory.glob("*.tar.gpg"))
            recovered = temporary / "encrypted-roundtrip.tar"
            crypt(encrypted, recovered, password, decrypt=True)
            extracted = temporary / "decrypted-private"
            extracted.mkdir(mode=0o700)
            with tarfile.open(recovered, "r") as tar:
                tar.extractall(extracted, filter="data")
            execute(base, env, "CREATE DATABASE finora_encrypted_restore;")
            encrypted_target = base + ["--dbname", "finora_encrypted_restore"]
            execute(encrypted_target, env, "DROP SCHEMA public CASCADE; CREATE SCHEMA extensions;\n" + schema + "\n" + grants)
            encrypted_restore = [sys.executable, str(ROOT / "scripts/backups/restore.py"), "--manifest", str(next(extracted.glob("*.json"))), "--confirm-destination", "local-encrypted-target"]
            encrypted_profile = {**profile, "FINORA_RESTORE_DATABASE_URL": "postgresql://postgres:fixture@127.0.0.1:5432/finora_encrypted_restore", "FINORA_RESTORE_PROJECT_REF": "local-encrypted-target"}
            execute(encrypted_restore + ["--check-only"], encrypted_profile)
            execute(encrypted_restore, encrypted_profile)
            if execute(encrypted_target, env, totals) != expected:
                raise RuntimeError("Decrypted scheduled backup changed Auth or decimal totals after restoration.")
            execute(restore + ["--check-only"], profile, expected=1, expected_message="destination contains public/Auth data")
            source_profile = {**profile, "FINORA_RESTORE_DATABASE_URL": profile["FINORA_BACKUP_DATABASE_URL"], "FINORA_RESTORE_PROJECT_REF": "local-roundtrip-source"}
            source_restore = restore[:-1] + ["local-roundtrip-source", "--check-only"]
            execute(source_restore, source_profile, expected=1, expected_message="Restoring into the source project/database is prohibited")
            archive = next(directory.glob("*.dump"))
            with archive.open("ab") as file:
                file.write(b"fixture-checksum-corruption")
            execute(restore + ["--check-only"], profile, expected=1, expected_message="Archive checksum mismatch")
            print("PASS PostgreSQL17 plain/encrypted backup/restore: Auth, centavos, parcelas, lotes, posição inicial, RLS, migration metadata, check-only and unsafe restore guards.")
        finally:
            subprocess.run([docker, "rm", "--force", container], env=env, capture_output=True, timeout=30)


if __name__ == "__main__":
    try:
        main()
    except (RuntimeError, OSError, subprocess.TimeoutExpired) as error:
        message = str(error) if isinstance(error, RuntimeError) else "Local verification could not complete."
        print(message, file=sys.stderr)
        sys.exit(1)
