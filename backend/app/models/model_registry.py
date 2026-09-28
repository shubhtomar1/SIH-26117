from sqlalchemy import Boolean, Column, String

from app.models.database import Base


class ModelRecord(Base):
    __tablename__ = "models"
    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    adapter = Column(String, nullable=False)  # adapter key in registry
    provider = Column(String, nullable=False, default="local")
    type = Column(String, nullable=False, default="llm")
    version = Column(String, nullable=False, default="1.0")
    capabilities = Column(String, nullable=False, default="[]")  # JSON list
    enabled = Column(Boolean, nullable=False, default=True)
