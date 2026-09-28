from sqlalchemy import Column, DateTime, ForeignKey, Integer, String, Text, func

from app.models.database import Base


class Task(Base):
    __tablename__ = "tasks"
    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id"), nullable=False)
    input = Column(Text, nullable=False)
    task_type = Column(String, nullable=False, default="analysis")
    input_type = Column(String, nullable=False, default="text")
    file_ids = Column(Text, nullable=False, default="[]")  # JSON list
    status = Column(String, nullable=False, default="CREATED", index=True)
    current_step = Column(String, nullable=True)
    progress = Column(Integer, nullable=False, default=0)
    selected_model = Column(String, nullable=True)
    result = Column(Text, nullable=True)  # JSON blob
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())


class TaskStep(Base):
    __tablename__ = "task_steps"
    id = Column(String, primary_key=True)
    task_id = Column(String, ForeignKey("tasks.id"), nullable=False, index=True)
    step_number = Column(Integer, nullable=False)
    step_type = Column(String, nullable=False)
    status = Column(String, nullable=False, default="pending")
    result = Column(Text, nullable=True)
    created_at = Column(DateTime, server_default=func.now())
