from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from app import operations
from app.admin_auth import require_admin
from app.db import get_session
from app.errors import GroupNotFound
from app.lock import lock_match
from app.messaging.rabbit import publish_pick_locked
from app.models import Group, GroupMember, User
from app.schemas import (
    AddMemberIn,
    AdminGroupIn,
    AdminUserOut,
    BetTypeUpdateIn,
    GroupOut,
    PasswordUpdateIn,
)
from app.security import hash_password

router = APIRouter(prefix="/admin", tags=["admin"], dependencies=[Depends(require_admin)])


@router.post("/matches/{match_id}/force-lock")
def force_lock(match_id: str, session: Session = Depends(get_session)) -> dict:
    """Demo affordance: lock a match's picks now, regardless of its lock time."""
    published = lock_match(session, match_id, publish_pick_locked)
    return {"status": "locked", "match_id": match_id, "events_published": published}


@router.get("/users", response_model=list[AdminUserOut])
def list_users(session: Session = Depends(get_session)) -> list[User]:
    """Every account on the platform -- used by the admin console."""
    return session.query(User).order_by(User.created_at).all()


@router.delete("/users/{user_id}", status_code=204)
def delete_user(
    user_id: str,
    session: Session = Depends(get_session),
) -> Response:
    """Admin affordance: permanently delete a user and their group memberships."""
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="user not found")
    if user.is_admin:
        raise HTTPException(status_code=400, detail="cannot delete an admin account")
    session.query(GroupMember).filter_by(user_id=user_id).delete()
    session.delete(user)
    session.commit()
    return Response(status_code=204)


@router.put("/users/{user_id}/password", status_code=204)
def reset_password(
    user_id: str,
    body: PasswordUpdateIn,
    session: Session = Depends(get_session),
) -> Response:
    """Admin affordance: overwrite a user's password."""
    user = session.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="user not found")
    user.password_hash = hash_password(body.new_password)
    session.commit()
    return Response(status_code=204)


@router.post("/groups", response_model=GroupOut, status_code=201)
def create_group(
    body: AdminGroupIn,
    session: Session = Depends(get_session),
) -> Group:
    """Admin affordance: create a group on behalf of any user."""
    owner_id = body.owner_user_id
    if owner_id is None:
        owner = session.query(User).order_by(User.created_at).first()
    else:
        owner = session.get(User, owner_id)
    if owner is None:
        raise HTTPException(status_code=404, detail="owner user not found")
    return operations.create_group(session, body.name, body.bet_type, owner)


@router.put("/groups/{group_id}/bet-type", response_model=GroupOut)
def update_bet_type(
    group_id: str,
    body: BetTypeUpdateIn,
    session: Session = Depends(get_session),
) -> Group:
    """Admin affordance: switch a group between European and Asian odds."""
    group = session.get(Group, group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="group not found")
    group.bet_type = body.bet_type
    session.commit()
    session.refresh(group)
    return group


@router.post("/groups/{group_id}/members")
def add_member(
    group_id: str,
    body: AddMemberIn,
    session: Session = Depends(get_session),
) -> dict:
    """Admin affordance: add an existing user to a group by username."""
    target = session.query(User).filter_by(username=body.username).one_or_none()
    if target is None:
        raise HTTPException(status_code=404, detail="user not found")
    try:
        operations.join_group(session, group_id, target)
    except GroupNotFound:
        raise HTTPException(status_code=404, detail="group not found")
    return {"status": "added", "group_id": group_id, "user_id": target.id}


@router.delete("/groups/{group_id}/members/{user_id}", status_code=204)
def remove_member(
    group_id: str,
    user_id: str,
    session: Session = Depends(get_session),
) -> Response:
    """Admin affordance: remove a user from a group."""
    member = (
        session.query(GroupMember)
        .filter_by(group_id=group_id, user_id=user_id)
        .one_or_none()
    )
    if member is None:
        raise HTTPException(status_code=404, detail="member not found")
    session.delete(member)
    session.commit()
    return Response(status_code=204)
