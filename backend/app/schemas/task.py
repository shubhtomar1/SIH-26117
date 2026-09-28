from pydantic import BaseModel, Field


class LoginIn(BaseModel):
    username: str
    password: str


class TaskCreate(BaseModel):
    task: str = Field(min_length=1, max_length=4000)
    task_type: str = "analysis"
    input_type: str = "text"
    file_ids: list[str] = []


class ApproveIn(BaseModel):
    decision: str  # approve | reject


class ModelRegister(BaseModel):
    id: str
    name: str
    adapter: str
    provider: str = "local"
    type: str = "llm"
    version: str = "1.0"
    capabilities: list[str] = []


class KnowledgeIndex(BaseModel):
    filename: str
    content: str = Field(min_length=1)
    department: str = "general"
    category: str = "general"


class ToolExec(BaseModel):
    tool: str
    input: dict = {}
