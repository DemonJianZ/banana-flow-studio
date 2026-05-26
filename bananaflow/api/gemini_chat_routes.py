import ast
import json
import operator
import os
from contextlib import contextmanager
from datetime import datetime

from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from langchain_core.tools import tool
from langchain_google_genai import ChatGoogleGenerativeAI
from langgraph.checkpoint.memory import MemorySaver
from langgraph.prebuilt import create_react_agent

from core.config import API_KEY

# ── proxy helper (mirrors genai_client._temporary_proxy_env) ──────────────

@contextmanager
def _proxy_env():
    """Temporarily set HTTPS_PROXY to the configured agent-chat proxy."""
    proxy = os.getenv("AGENT_CHAT_HTTPS_PROXY") or os.getenv("AGENT_CHAT_HTTP_PROXY") or ""
    if not proxy:
        yield
        return
    keys = ("HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy")
    saved = {k: os.environ.get(k) for k in keys}
    for k in keys:
        os.environ[k] = proxy
    try:
        yield
    finally:
        for k, v in saved.items():
            if v is None:
                os.environ.pop(k, None)
            else:
                os.environ[k] = v

gemini_chat_router = APIRouter(prefix="/api/gemini-chat", tags=["gemini-chat"])

# ── tools ──────────────────────────────────────────────────────────────────

@tool
def get_current_time() -> str:
    """Get the current date and time."""
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


_SAFE_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.Pow: operator.pow,
    ast.USub: operator.neg,
}


def _safe_eval(node):
    if isinstance(node, ast.Constant) and isinstance(node.value, (int, float)):
        return node.value
    if isinstance(node, ast.BinOp) and type(node.op) in _SAFE_OPS:
        return _SAFE_OPS[type(node.op)](_safe_eval(node.left), _safe_eval(node.right))
    if isinstance(node, ast.UnaryOp) and type(node.op) in _SAFE_OPS:
        return _SAFE_OPS[type(node.op)](_safe_eval(node.operand))
    raise ValueError(f"Unsupported expression: {ast.dump(node)}")


@tool
def calculate(expression: str) -> str:
    """Evaluate a safe arithmetic expression. Example: '(10 + 2) * 3 / 4'"""
    try:
        result = _safe_eval(ast.parse(expression.strip(), mode="eval").body)
        return str(result)
    except Exception as exc:
        return f"Error: {exc}"


# ── agent (lazy init) ──────────────────────────────────────────────────────

_agent = None


_SYSTEM_PROMPT = """你是 AI 小禹智能体，用户的 AI 创意伙伴，专注于图片生成、视频创作和故事分镜设计。

当用户打招呼（如"你好"、"hi"、"hello"等问候语）时，请严格按照以下格式回复，不要增删内容：

你好！我是 AI 小禹智能体，你的 AI 创意伙伴。我可以为你创作精美的图片、生动的视频，或者打造完整的故事分镜。

请问今天你想创作些什么？无论是简单的构思还是具体的创意，我都可以帮你实现。

好的，我已经准备就绪，随时可以开始创作。

请告诉我你想生成的画面描述，或者从以下建议开始：

- 生成一张风景图
- 制作一段产品宣传视频
- 为一个故事创作完整的分镜脚本

其他情况下，正常回答用户问题，保持中文交流，自我介绍时使用"AI 小禹智能体"这个名字。"""


def _get_agent():
    global _agent
    if _agent is None:
        proxy = os.getenv("AGENT_CHAT_HTTPS_PROXY") or os.getenv("AGENT_CHAT_HTTP_PROXY") or ""
        llm_kwargs: dict = {"model": "gemini-2.5-flash", "google_api_key": API_KEY}
        if proxy:
            llm_kwargs["client_args"] = {"proxy": proxy}
        llm = ChatGoogleGenerativeAI(**llm_kwargs)
        _agent = create_react_agent(
            llm,
            [get_current_time, calculate],
            checkpointer=MemorySaver(),
            prompt=_SYSTEM_PROMPT,
        )
    return _agent


# ── endpoint ───────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    thread_id: str = "default"


@gemini_chat_router.post("/chat")
async def chat(req: ChatRequest):
    agent = _get_agent()

    async def _stream():
        yield f"data: {json.dumps({'type': 'ping'})}\n\n"
        config = {"configurable": {"thread_id": req.thread_id}}
        try:
            async for event in agent.astream_events(
                {"messages": [("human", req.message)]},
                config=config,
                version="v2",
            ):
                etype = event["event"]
                if etype == "on_chat_model_stream":
                    content = event["data"]["chunk"].content
                    if isinstance(content, list):
                        for part in content:
                            if isinstance(part, dict) and part.get("type") == "text" and part.get("text"):
                                yield f"data: {json.dumps({'type': 'token', 'content': part['text']})}\n\n"
                    elif isinstance(content, str) and content:
                        yield f"data: {json.dumps({'type': 'token', 'content': content})}\n\n"
                elif etype == "on_tool_start":
                    yield f"data: {json.dumps({'type': 'tool_start', 'tool': event.get('name', 'tool')})}\n\n"
                elif etype == "on_tool_end":
                    yield f"data: {json.dumps({'type': 'tool_end', 'tool': event.get('name', 'tool')})}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'content': str(exc)})}\n\n"
        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
