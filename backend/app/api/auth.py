from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.core.security import create_token, get_current_user, verify_password
from app.models.database import get_db
from app.models.user import User
from app.schemas.response import err, ok
from app.schemas.task import LoginIn
from app.services import audit as audit_svc

router = APIRouter()


@router.post("/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == body.username, User.active == True).first()  # noqa: E712
    if user is None or not verify_password(body.password, user.password_hash):
        return err("UNAUTHORIZED", "Invalid username or password.", 401)
    audit_svc.log_action(db, "USER_LOGIN", "auth", "ok", user.id)
    return ok({"token": create_token(user.id, user.username, user.role),
               "user": {"id": user.id, "username": user.username, "role": user.role,
                        "department": user.department}})


@router.get("/me")
def me(user: User = Depends(get_current_user)):
    return ok({"id": user.id, "username": user.username, "role": user.role, "department": user.department})
