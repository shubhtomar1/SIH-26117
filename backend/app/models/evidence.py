from sqlalchemy import Column, DateTime, Integer, String, Text, func

from app.models.database import Base


class Evidence(Base):
    __tablename__ = "evidence"
    id = Column(String, primary_key=True)
    task_id = Column(String, nullable=False, index=True)
    document_id = Column(String, nullable=True)
    filename = Column(String, nullable=True)
    page = Column(Integer, nullable=True)
    excerpt = Column(Text, nullable=True)
    claim = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
