# Creates the first admin (admins are otherwise invitation-only). Password from ADMIN_PASSWORD
# or prompted: python -m app.cli create-admin --email you@example.org --name "Your Name"

import argparse
import getpass
import os
import sys
from datetime import UTC, datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.db import get_engine
from app.models import Role, User
from app.services.audit import audit
from app.services.security import hash_password


def create_admin(email: str, name: str, password: str) -> int:
    if len(password) < get_settings().password_min_length:
        print(f"Password must be at least {get_settings().password_min_length} characters.")
        return 1
    email = email.strip().lower()
    with Session(get_engine()) as db:
        if db.scalar(select(User).where(User.email == email)):
            print(f"A user with email {email} already exists.")
            return 1
        user = User(
            email=email,
            password_hash=hash_password(password),
            full_name=name,
            role=Role.admin,
            consent_privacy_at=datetime.now(UTC),
            consent_terms_at=datetime.now(UTC),
        )
        db.add(user)
        db.flush()
        audit(db, "user.create_admin_cli", user_id=user.id, entity_type="user", entity_id=user.id)
        db.commit()
    print(f"Admin {email} created.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli")
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("create-admin")
    p.add_argument("--email", required=True)
    p.add_argument("--name", required=True)
    args = parser.parse_args(argv)
    if args.cmd == "create-admin":
        password = os.environ.get("ADMIN_PASSWORD") or getpass.getpass("Password: ")
        return create_admin(args.email, args.name, password)
    return 1


if __name__ == "__main__":
    sys.exit(main())
