"""Local auth (pbkdf2, stdlib) + JWT sessions + RBAC dependencies."""
import hashlib
import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.database import get_db

bearer_scheme = HTTPBearer(auto_error=False)

# action -> roles allowed to perform it
POLICY_MATRIX: dict[str, set[str]] = {
    "manage_users": {"ADMIN"},
    "manage_models": {"ADMIN"},
    "manage_knowledge": {"ADMIN", "ENGINEER"},
    "view_audit": {"ADMIN"},
    "upload": {"ADMIN", "ENGINEER", "ANALYST"},
    "create_task": {"ADMIN", "ENGINEER", "ANALYST"},
    "run_task": {"ADMIN", "ENGINEER"},
    "approve": {"ADMIN", "ENGINEER"},
    "use_tools": {"ADMIN", "ENGINEER", "ANALYST"},
    "view_outputs": {"ADMIN", "ENGINEER", "ANALYST", "VIEWER"},
}


def hash_password(password: str, salt: str | None = None) -> str:
    salt = salt or secrets.token_hex(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 200_000)
    return f"{salt}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, digest = stored.split("$", 1)
    except ValueError:
        return False
    return hmac.compare_digest(hash_password(password, salt), stored)


def create_token(user_id: str, username: str, role: str) -> str:
    exp = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    return jwt.encode(
        {"sub": user_id, "username": username, "role": role, "exp": exp},
        settings.JWT_SECRET,
        algorithm="HS256",
    )


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token expired.")
    except jwt.InvalidTokenError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid token.")


def get_current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    db: Session = Depends(get_db),
):
    from app.models.user import User  # late import: avoid circulars

    if creds is None or not creds.credentials:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Authentication required.")
    payload = decode_token(creds.credentials)
    user = db.query(User).filter(User.id == payload.get("sub"), User.active == True).first()  # noqa: E712
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "User not found or inactive.")
    return user


def require_roles(*roles: str):
    def checker(user=Depends(get_current_user)):
        if user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "User is not authorized.")
        return user

    return checker


def can(user_role: str, action: str) -> bool:
    return user_role in POLICY_MATRIX.get(action, set())
