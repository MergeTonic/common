"""Tonic: deterministic merge / conflict engine for version control."""

from .core import (
    current_lines,
    initial_state,
    merge_states,
    update_state,
)

__all__ = [
    "current_lines",
    "initial_state",
    "merge_states",
    "update_state",
]
