from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.dependencies import get_current_user, require_roles
from app.db.session import get_db
from app.models.user import UserAccount
from app.schemas.user import (
    AdminChangePassword,
    ChangePassword,
    UserCreate,
    UserOut as UserResponse,
    UserUpdate,
)
from app.services import user_service

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("/me", response_model=UserResponse)
def get_me(current_user: UserAccount = Depends(get_current_user)):
    """
    This route returns the get me data the caller asked for
    """
    return current_user


@router.put("/me", response_model=UserResponse)
def update_me(
    data: UserUpdate,
    db: Session = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user),
):
    """
    This route updates the update me flow and passes the request into the service layer
    It can also receive full_name as Optional[str], username as Optional[str], email as Optional[EmailStr], role_id as Optional[UUID], role_name as Optional[str], and is_active as Optional[bool]
    """
    safe = UserUpdate(
        full_name=data.full_name,
        username=data.username,
        email=data.email,
    )
    return user_service.update_user(db, current_user, safe)


@router.post("/me/change-password")
def change_my_password(
    data: ChangePassword,
    db: Session = Depends(get_db),
    current_user: UserAccount = Depends(get_current_user),
):
    """
    This route creates the change my password flow and passes the request into the service layer
    It expects old_password as str and new_password as str
    """
    return user_service.change_password(db, current_user, data.old_password, data.new_password)


@router.post("/", response_model=UserResponse)
def create_user(
    data: UserCreate,
    db: Session = Depends(get_db),
    _: UserAccount = Depends(require_roles("ADMIN")),
):
    """
    This route creates the create user flow and passes the request into the service layer
    It expects full_name as str, username as str, email as EmailStr, and password as str
    It can also receive role_id as Optional[UUID] and role_name as Optional[str]
    """
    return user_service.create_user(db, data)


@router.get("/", response_model=list[UserResponse])
def list_users(
    db: Session = Depends(get_db),
    _: UserAccount = Depends(require_roles("ADMIN")),
):
    """
    This route returns the list users data the caller asked for
    """
    return user_service.get_users(db)


@router.get("/{user_id}", response_model=UserResponse)
def get_user(
    user_id: UUID,
    db: Session = Depends(get_db),
    _: UserAccount = Depends(get_current_user),
):
    """
    This route returns the get user data the caller asked for
    """
    user = user_service.get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    return user


@router.put("/{user_id}", response_model=UserResponse)
def update_user(
    user_id: UUID,
    data: UserUpdate,
    db: Session = Depends(get_db),
    current_user: UserAccount = Depends(require_roles("ADMIN")),
):
    """
    This route updates the update user flow and passes the request into the service layer
    It can also receive full_name as Optional[str], username as Optional[str], email as Optional[EmailStr], role_id as Optional[UUID], role_name as Optional[str], and is_active as Optional[bool]
    """
    user = user_service.get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    if user.user_id == current_user.user_id and data.is_active is False:
        raise HTTPException(status_code=400, detail="You cannot deactivate your own account.")
    return user_service.update_user(db, user, data)


@router.delete("/{user_id}")
def delete_user(
    user_id: UUID,
    db: Session = Depends(get_db),
    current_user: UserAccount = Depends(require_roles("ADMIN")),
):
    """
    This route removes the delete user flow and lets the service decide whether it should be deleted or deactivated
    """
    user = user_service.get_user(db, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    if user.user_id == current_user.user_id:
        raise HTTPException(status_code=400, detail="You cannot deactivate your own account.")
    user_service.delete_user(db, user)
    return {"message": "User account was set to inactive."}


@router.put("/{user_id}/reset-password")
def admin_reset_password(
    user_id: UUID,
    data: AdminChangePassword,
    db: Session = Depends(get_db),
    _: UserAccount = Depends(require_roles("ADMIN")),
):
    """
    This route updates the admin reset password flow and passes the request into the service layer
    It expects new_password as str
    """
    return user_service.admin_reset_password(db, user_id, data.new_password)
