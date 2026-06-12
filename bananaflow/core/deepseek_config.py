import os
from pathlib import Path

# 后端从 bananaflow/ 目录启动，load_dotenv() 默认会找 bananaflow/.env，
# 而 DEEPSEEK_API_KEY 等配置在 repo 根目录的 .env 里。
# 用 __file__ 定位 repo 根目录，确保不论 CWD 在哪都能加载正确的 .env。
try:
    from dotenv import load_dotenv
    _repo_root = Path(__file__).resolve().parent.parent.parent
    load_dotenv(dotenv_path=_repo_root / ".env", override=False)
    # 同时加载 bananaflow/.env（本地覆盖项，如 AI_CHAT_DOWNSTREAM_URL）
    load_dotenv(dotenv_path=_repo_root / "bananaflow" / ".env", override=False)
except ImportError:
    pass

DEEPSEEK_API_KEY = os.getenv("DEEPSEEK_API_KEY", "")
DEEPSEEK_BASE_URL = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com").rstrip("/")
DEEPSEEK_AGENT_MODEL = os.getenv("DEEPSEEK_AGENT_MODEL", "deepseek-v4-flash")
DEEPSEEK_TIMEOUT_SEC = float(os.getenv("DEEPSEEK_TIMEOUT_SEC", "120"))
