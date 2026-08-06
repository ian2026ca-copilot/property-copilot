from pydantic import BaseModel


class CopilotMessage(BaseModel):
    role: str  # "user" | "assistant"
    text: str


class CopilotChatIn(BaseModel):
    messages: list[CopilotMessage]
    created_context: dict = {}


class CopilotChatOut(BaseModel):
    reply: str
    pending_action: dict | None = None
    created_context: dict = {}


class CopilotExecuteIn(BaseModel):
    action: str
    payload: dict
    created_context: dict = {}


class CopilotExecuteOut(BaseModel):
    summary: str
    created_context: dict
