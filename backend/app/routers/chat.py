import datetime
import json
from typing import List, Dict
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status, Query
from jose import JWTError, jwt
from sqlalchemy import select, or_, and_, desc, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth import get_current_user
from app.config import settings
from app.database import get_db, AsyncSessionLocal
from app.models.chat import ChatMessage
from app.models.user import User
from app.schemas.chat import ChatMessageCreate, ChatMessageRead, ChatThreadRead

router = APIRouter(prefix="/chat", tags=["chat"])

class ConnectionManager:
    def __init__(self):
        # Map user_id to active WebSockets
        self.active_connections: Dict[int, List[WebSocket]] = {}

    async def connect(self, user_id: int, websocket: WebSocket):
        await websocket.accept()
        if user_id not in self.active_connections:
            self.active_connections[user_id] = []
        self.active_connections[user_id].append(websocket)

    def disconnect(self, user_id: int, websocket: WebSocket):
        if user_id in self.active_connections:
            if websocket in self.active_connections[user_id]:
                self.active_connections[user_id].remove(websocket)
            if not self.active_connections[user_id]:
                del self.active_connections[user_id]

    async def send_personal_message(self, message: dict, user_id: int):
        if user_id in self.active_connections:
            for connection in self.active_connections[user_id]:
                try:
                    await connection.send_json(message)
                except Exception:
                    pass

manager = ConnectionManager()

def map_chat_message(m: ChatMessage) -> ChatMessageRead:
    return ChatMessageRead(
        id=m.id,
        sender_id=m.sender_id,
        recipient_id=m.recipient_id,
        sender_name=m.sender.name if m.sender else None,
        recipient_name=m.recipient.name if m.recipient else None,
        content=m.content,
        is_read=m.is_read,
        created_at=m.created_at
    )

@router.get("/threads", response_model=List[ChatThreadRead])
async def list_chat_threads(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    """
    If admin: returns list of all users with chat history or registered users.
    If regular user: returns thread with admin.
    """
    if current_user.role == "admin":
        users_res = await db.execute(
            select(User).where(User.id != current_user.id).order_by(User.name.asc())
        )
        other_users = users_res.scalars().all()
    else:
        admin_res = await db.execute(
            select(User).where(User.role == "admin").order_by(User.id.asc())
        )
        other_users = admin_res.scalars().all()

    threads = []
    for other in other_users:
        # Count unread messages from this user to current_user
        unread_res = await db.execute(
            select(func.count(ChatMessage.id)).where(
                and_(
                    ChatMessage.sender_id == other.id,
                    ChatMessage.recipient_id == current_user.id,
                    ChatMessage.is_read == False
                )
            )
        )
        unread_count = unread_res.scalar() or 0

        # Get last message
        last_msg_res = await db.execute(
            select(ChatMessage).where(
                or_(
                    and_(ChatMessage.sender_id == current_user.id, ChatMessage.recipient_id == other.id),
                    and_(ChatMessage.sender_id == other.id, ChatMessage.recipient_id == current_user.id)
                )
            ).order_by(desc(ChatMessage.created_at)).limit(1)
        )
        last_msg = last_msg_res.scalars().first()

        threads.append(ChatThreadRead(
            other_user_id=other.id,
            other_user_name=other.name,
            other_user_email=other.email,
            other_user_role=other.role,
            unread_count=unread_count,
            last_message=last_msg.content if last_msg else None,
            last_message_at=last_msg.created_at if last_msg else None
        ))

    # Sort threads with recent messages first
    threads.sort(key=lambda t: t.last_message_at or datetime.datetime.min, reverse=True)
    return threads

@router.get("/messages/{other_user_id}", response_model=List[ChatMessageRead])
async def get_messages(
    other_user_id: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    # Mark unread messages from other_user to current_user as read
    res_unread = await db.execute(
        select(ChatMessage).where(
            and_(
                ChatMessage.sender_id == other_user_id,
                ChatMessage.recipient_id == current_user.id,
                ChatMessage.is_read == False
            )
        )
    )
    for msg in res_unread.scalars().all():
        msg.is_read = True
    await db.commit()

    # Fetch history
    result = await db.execute(
        select(ChatMessage)
        .options(selectinload(ChatMessage.sender), selectinload(ChatMessage.recipient))
        .where(
            or_(
                and_(ChatMessage.sender_id == current_user.id, ChatMessage.recipient_id == other_user_id),
                and_(ChatMessage.sender_id == other_user_id, ChatMessage.recipient_id == current_user.id)
            )
        )
        .order_by(ChatMessage.created_at.asc())
    )
    messages = result.scalars().all()
    return [map_chat_message(m) for m in messages]

@router.post("/messages", response_model=ChatMessageRead)
async def send_message(
    payload: ChatMessageCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db)
):
    recip_res = await db.execute(select(User).where(User.id == payload.recipient_id))
    recipient = recip_res.scalars().first()
    if not recipient:
        raise HTTPException(status_code=404, detail="Destinatario no encontrado")

    new_msg = ChatMessage(
        sender_id=current_user.id,
        recipient_id=payload.recipient_id,
        content=payload.content.strip()
    )
    db.add(new_msg)
    await db.commit()
    await db.refresh(new_msg)

    # Reload with relations
    res = await db.execute(
        select(ChatMessage)
        .options(selectinload(ChatMessage.sender), selectinload(ChatMessage.recipient))
        .where(ChatMessage.id == new_msg.id)
    )
    loaded_msg = res.scalars().first()
    msg_dict = {
        "id": loaded_msg.id,
        "sender_id": loaded_msg.sender_id,
        "recipient_id": loaded_msg.recipient_id,
        "sender_name": loaded_msg.sender.name if loaded_msg.sender else "Usuario",
        "recipient_name": loaded_msg.recipient.name if loaded_msg.recipient else "Usuario",
        "content": loaded_msg.content,
        "created_at": loaded_msg.created_at.isoformat(),
        "is_read": False
    }

    # Push to recipient via WebSocket if online
    await manager.send_personal_message(msg_dict, payload.recipient_id)

    return map_chat_message(loaded_msg)

@router.websocket("/ws")
async def websocket_endpoint(
    websocket: WebSocket,
    token: str = Query(...)
):
    # Authenticate via JWT token query param
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        user_id = int(payload.get("sub"))
    except (JWTError, ValueError):
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await manager.connect(user_id, websocket)
    try:
        while True:
            data = await websocket.receive_text()
            parsed = json.loads(data)
            # When client sends a message over websocket
            recipient_id = parsed.get("recipient_id")
            content = parsed.get("content", "").strip()
            if recipient_id and content:
                async with AsyncSessionLocal() as db:
                    new_msg = ChatMessage(
                        sender_id=user_id,
                        recipient_id=recipient_id,
                        content=content
                    )
                    db.add(new_msg)
                    await db.commit()
                    await db.refresh(new_msg)

                    res = await db.execute(
                        select(ChatMessage)
                        .options(selectinload(ChatMessage.sender), selectinload(ChatMessage.recipient))
                        .where(ChatMessage.id == new_msg.id)
                    )
                    loaded_msg = res.scalars().first()
                    msg_dict = {
                        "id": loaded_msg.id,
                        "sender_id": loaded_msg.sender_id,
                        "recipient_id": loaded_msg.recipient_id,
                        "sender_name": loaded_msg.sender.name if loaded_msg.sender else "Usuario",
                        "recipient_name": loaded_msg.recipient.name if loaded_msg.recipient else "Usuario",
                        "content": loaded_msg.content,
                        "created_at": loaded_msg.created_at.isoformat(),
                        "is_read": False
                    }
                    # Send ack back to sender
                    await websocket.send_json(msg_dict)
                    # Send to recipient
                    await manager.send_personal_message(msg_dict, recipient_id)
    except WebSocketDisconnect:
        manager.disconnect(user_id, websocket)
    except Exception:
        manager.disconnect(user_id, websocket)
