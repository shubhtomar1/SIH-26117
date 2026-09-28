from sqlalchemy import Column, DateTime, Integer, String, Text, func

from app.models.database import Base


class Document(Base):
    __tablename__ = "documents"
    id = Column(String, primary_key=True)
    filename = Column(String, nullable=False)
    path = Column(String, nullable=False)
    type = Column(String, nullable=False, default="txt")
    department = Column(String, nullable=False, default="general")
    category = Column(String, nullable=False, default="general")
    version = Column(String, nullable=False, default="1.0")
    content = Column(Text, nullable=False, default="")
    needs_ocr = Column(Integer, nullable=False, default=0)
    created_at = Column(DateTime, server_default=func.now())
