"""
bananaflow/agent — BananaFlow AI Agent module.

Architecture:
  gateway (agent_routes.py)
    → graph (LangGraph StateGraph)
      → nodes (normalize → context → classify → execute_* → build_response)
        → tools (generate_image, remove_background, ...)
"""
