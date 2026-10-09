"""Private PostgreSQL backup helpers. Connection secrets never enter argv or logs."""

import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
from urllib.parse import parse_qs, quote, unquote, urlsplit

ROOT = Path(__file__).resolve().parents[2]
SCHEMAS = ("public", "auth")
METADATA_TABLES = ("public.finora_migrations", "auth.schema_migrations")


class BackupError(Exception):
    pass


def connection(prefix):
    value = os.environ.get(f"{prefix}_DATABASE_URL", "")
    project = os.environ.get(f"{prefix}_PROJECT_REF", "")
    fields = {key: os.environ.get(f"{prefix}_{key}", "") for key in ("PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD")}
    if value and any(fields.values()):
        raise BackupError("Use either the private DATABASE_URL or the separate PG fields, not both.")
    if not value and any(fields.values()):
        if not all(fields[key] for key in ("PGHOST", "PGDATABASE", "PGUSER", "PGPASSWORD")):
            raise BackupError("Configure PGHOST, PGDATABASE, PGUSER and PGPASSWORD together in the private environment.")
        host = fields["PGHOST"]
        if ":" in host and not host.startswith("["):
            host = f"[{host}]"
        value = f"postgresql://{quote(fields['PGUSER'], safe='')}:{quote(fields['PGPASSWORD'], safe='')}@{host}:{fields['PGPORT'] or '5432'}/{quote(fields['PGDATABASE'], safe='')}"
    try:
        url = urlsplit(value)
        host = (url.hostname or "").lower().rstrip(".")
        port = url.port or 5432
        user = unquote(url.username or "")
        password = unquote(url.password or "")
        database = unquote(url.path.removeprefix("/"))
    except ValueError:
        raise BackupError("Invalid PostgreSQL connection configuration.") from None
    if url.scheme not in ("postgres", "postgresql") or not host or not user or not database or url.fragment:
        raise BackupError("Supply a complete PostgreSQL URL in the private environment.")
    if not re.fullmatch(r"[a-zA-Z0-9_.-]{1,63}", database) or "\x00" in value:
        raise BackupError("Invalid PostgreSQL database name or connection configuration.")
    local = host in ("localhost", "127.0.0.1", "::1")
    if local:
        if not re.fullmatch(r"local-[a-z0-9-]+", project):
            raise BackupError("A loopback database requires a project label such as local-restore.")
    else:
        if not re.fullmatch(r"[a-z0-9]{20}", project) or not password:
            raise BackupError("A hosted database requires its project ref and password in the private environment.")
        direct = host == f"db.{project}.supabase.co"
        pooler = host.endswith(".pooler.supabase.com") and user == f"postgres.{project}"
        if not direct and not pooler:
            raise BackupError("The PostgreSQL host/user must match the declared Supabase project ref.")
        if pooler and port != 5432:
            raise BackupError("Use the Supabase session pooler on port 5432, not the transaction pooler.")
    params = parse_qs(url.query)
    if set(params) - {"sslmode"}:
        raise BackupError("Only sslmode is supported in the connection URL; use a direct or session-pooler connection.")
    sslmode = params.get("sslmode", ["disable" if local else "verify-full"])
    if len(sslmode) != 1 or (not local and sslmode[0] != "verify-full"):
        raise BackupError("Hosted connections require sslmode=verify-full.")
    if sslmode[0] not in ("disable", "require", "verify-ca", "verify-full"):
        raise BackupError("Invalid sslmode.")
    # Ignore inherited PGHOSTADDR, PGSERVICE, PGOPTIONS and unrelated application secrets.
    env = {name: os.environ[name] for name in ("PATH", "HOME", "LANG", "LC_ALL", "TMPDIR", "SYSTEMROOT") if name in os.environ}
    env.update(PGHOST=host, PGPORT=str(port), PGDATABASE=database, PGUSER=user, PGPASSWORD=password,
               PGSSLMODE=sslmode[0], PGCONNECT_TIMEOUT="10", PGAPPNAME="finora-private-backup")
    if sslmode[0] == "verify-full" and not local:
        # libpq 17 uses the operating system trust store with this value.
        env["PGSSLROOTCERT"] = "system"
    return {"env": env, "project": project, "local": local,
            "identity": {"host": host, "port": port, "database": database}}


def run(command, env, sql=None, timeout=1800):
    try:
        result = subprocess.run(command, env=env, input=sql, capture_output=True, text=True, timeout=timeout)
    except FileNotFoundError:
        raise BackupError("Install PostgreSQL 17 client tools (pg_dump, pg_restore and psql).") from None
    except subprocess.TimeoutExpired:
        raise BackupError("PostgreSQL operation exceeded its time limit; inspect the isolated environment privately.") from None
    if result.returncode:
        # Provider messages can contain connection details or financial rows.
        raise BackupError(f"{Path(command[0]).name} failed (exit {result.returncode}); no connection values or SQL rows were logged.")
    return result.stdout.strip()


def psql(db, sql):
    return run(["psql", "--no-psqlrc", "--no-password", "--tuples-only", "--no-align", "--set=ON_ERROR_STOP=1"], db["env"], sql, timeout=60)


def require_clients(db):
    for tool in ("psql", "pg_dump", "pg_restore"):
        version = run([tool, "--version"], db["env"], timeout=10)
        match = re.search(r"(\d+)\.\d+", version)
        if not match or int(match.group(1)) != 17:
            raise BackupError("Use PostgreSQL 17 client tools for this repository's PostgreSQL 17 environment.")
    if int(psql(db, "SHOW server_version_num;")) // 10000 != 17:
        raise BackupError("This runbook supports PostgreSQL 17 only; review tooling before backing up another major version.")


def schema_options():
    return [f"--schema={schema}" for schema in SCHEMAS]


def data_exclusions():
    # Provisioning establishes migration metadata in the isolated target.
    return [f"--exclude-table-data={table}" for table in METADATA_TABLES]


def schema_hash(db):
    schema = run(["pg_dump", "--no-password", "--schema-only", "--no-owner", "--no-acl", "--no-comments", "--no-security-labels", *schema_options()], db["env"])
    # pg_dump 17.6+ emits random psql restriction tokens; they are not schema.
    normalized = "\n".join(line.rstrip() for line in schema.splitlines()
                           if line.strip() and not line.startswith(("--", "\\restrict ", "\\unrestrict ")))
    return hashlib.sha256(normalized.encode()).hexdigest()


def checksum(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    return digest.hexdigest()


def private_directory(value):
    path = Path(value)
    if not path.is_absolute():
        raise BackupError("The backup directory must be an absolute path outside the repository.")
    path = path.resolve()
    if path == ROOT or ROOT in path.parents:
        raise BackupError("Backups containing financial and Auth data cannot be written inside the repository.")
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    if path.stat().st_mode & 0o077:
        raise BackupError("Use a private directory with mode 0700 before writing backups.")
    return path


def read_manifest(path):
    try:
        manifest = json.loads(path.read_text())
        if manifest["format"] != "finora-postgres-17-v1" or manifest["schemas"] != list(SCHEMAS):
            raise ValueError()
        if not re.fullmatch(r"[a-zA-Z0-9._-]+\.dump", manifest["archive"]):
            raise ValueError()
        if not re.fullmatch(r"[a-f0-9]{64}", manifest["sha256"]) or not re.fullmatch(r"[a-f0-9]{64}", manifest["schema_sha256"]):
            raise ValueError()
        identity = manifest["source"]
        if not isinstance(identity["port"], int) or not all(isinstance(identity[key], str) and identity[key] for key in ("host", "database")):
            raise ValueError()
        if not isinstance(manifest["source_project_ref"], str) or not manifest["source_project_ref"]:
            raise ValueError()
    except (OSError, ValueError, KeyError, TypeError):
        raise BackupError("Invalid or unreadable private backup manifest.") from None
    return manifest


def guard_destination(source, target, confirmation):
    if confirmation != target["project"]:
        raise BackupError("Explicitly confirm the isolated destination project ref/label with --confirm-destination.")
    if target["project"] == source["source_project_ref"] or target["identity"] == source["source"]:
        raise BackupError("Restoring into the source project/database is prohibited.")
    if not target["local"] and os.environ.get("FINORA_RESTORE_ISOLATED") != "yes":
        raise BackupError("A hosted destination requires FINORA_RESTORE_ISOLATED=yes after verifying it is a separate, disposable project.")
