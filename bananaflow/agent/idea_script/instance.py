# 单例编排器：供 routes 与 agent 能力图共用，避免 routes ↔ 能力层循环 import。
from agent.idea_script.orchestrator import IdeaScriptOrchestrator

idea_script_orchestrator = IdeaScriptOrchestrator()
