"""Compatibility capability identifiers for legacy `/api/agent/*` endpoints.

These names are still used by the optional capability LangGraph wrapper and older
HTTP endpoints. New conversational agent work should prefer the coordinator
gateway capability catalog instead of adding to this list.
"""

SKILL_CHITCHAT = "agent_chitchat"
SKILL_DRAMA = "agent_drama"
SKILL_PROMPT_POLISH = "agent_prompt_polish"
SKILL_IDEA_SCRIPT = "agent_idea_script"

__all__ = [
    "SKILL_CHITCHAT",
    "SKILL_DRAMA",
    "SKILL_PROMPT_POLISH",
    "SKILL_IDEA_SCRIPT",
]
