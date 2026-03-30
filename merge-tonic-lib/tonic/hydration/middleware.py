"""Middleware hooks for agentic hydration search tools."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Protocol, TypeVar

T = TypeVar("T")


@dataclass(frozen=True)
class HydrationToolCallContext:
    slot_id: str
    question: str
    tool_id: str
    params: dict[str, object] | None = None


class HydrationSearchMiddleware(Protocol):
    def before_tool_call(self, context: HydrationToolCallContext) -> None: ...

    def after_tool_call(
        self,
        context: HydrationToolCallContext,
        *,
        record_count: int,
        payload: object | None = None,
    ) -> None: ...

    def on_tool_error(self, context: HydrationToolCallContext, error: Exception) -> None: ...


def run_hydration_tool_with_middleware(
    *,
    middleware: HydrationSearchMiddleware | None,
    context: HydrationToolCallContext,
    runner: Callable[[], T],
    summarize: Callable[[T], tuple[int, Any | None]],
) -> T:
    if middleware and hasattr(middleware, "before_tool_call"):
        middleware.before_tool_call(context)
    try:
        result = runner()
        if middleware and hasattr(middleware, "after_tool_call"):
            record_count, payload = summarize(result)
            middleware.after_tool_call(context, record_count=record_count, payload=payload)
        return result
    except Exception as exc:
        if middleware and hasattr(middleware, "on_tool_error"):
            middleware.on_tool_error(context, exc)
        raise
