from sqlalchemy import Column, DateTime, String, Text, func

from app.models.database import Base


class AuditLog(Base):
    __tablename__ = "audit_logs"
    id = Column(String, primary_key=True)
    user_id = Column(String, nullable=True)
    task_id = Column(String, nullable=True, index=True)
    action = Column(String, nullable=False, index=True)
    component = Column(String, nullable=False, default="api")
    status = Column(String, nullable=False, default="ok")
    details = Column(Text, nullable=True)
    timestamp = Column(DateTime, server_default=func.now())
