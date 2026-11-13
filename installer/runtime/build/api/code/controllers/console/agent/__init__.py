"""Console agent routes.

The personal assistant is a real DeepSeek Harness backed runtime.  The
frontend may still be run in mock mode for isolated UI work, but production
routes must stay registered here so configuration, sessions and artifacts are
persisted by the API and executed by the Harness broker.
"""
from . import composer, roster, personal, collaboration, knowledge_bridge, visibility, reviews, governance

__all__ = ["composer", "roster", "personal", "collaboration", "knowledge_bridge"]

from . import app_operations

from . import personal_agent_cli

from . import salesbuddy_cli

from . import desktop_device

from . import external_knowledge

from . import my_agent_cli
