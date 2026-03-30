from pathlib import Path
import shutil

from tonic.hydration import (
    acquire_hydration_persist_lock,
    build_hydration_cache_key,
    check_hydration_persist_health,
    write_hydration_persist_manifest,
)


TMP = Path("tests/_tmp_persistence")


def _workspace_tmp(name: str) -> Path:
    target = TMP / name
    shutil.rmtree(target, ignore_errors=True)
    target.mkdir(parents=True, exist_ok=True)
    return target


def test_build_hydration_cache_key_is_order_independent():
    first = build_hydration_cache_key(
        strategy_id="incremental-content-hash",
        pr_identifiers=["42", "17"],
        embedder_model="fake-v1",
        chunker_version="line-estimate-v1",
    )
    second = build_hydration_cache_key(
        strategy_id="incremental-content-hash",
        pr_identifiers=["17", "42"],
        embedder_model="fake-v1",
        chunker_version="line-estimate-v1",
    )
    assert first.cache_key == second.cache_key
    assert first.pr_list_hash == second.pr_list_hash


def test_persist_health_rejects_partial_restore_without_manifest():
    persist_root = _workspace_tmp("partial_restore") / "persist"
    persist_root.mkdir()
    (persist_root / "chroma.sqlite3").write_text("", encoding="utf-8")
    health = check_hydration_persist_health(persist_root)
    assert health.ok is False
    assert "index-state.json" in health.reason


def test_persist_manifest_and_lock_guard_the_store():
    persist_root = _workspace_tmp("lock_guard") / "persist"
    persist_root.mkdir()
    (persist_root / "index-state.json").write_text("{}", encoding="utf-8")
    (persist_root / "chroma.sqlite3").write_text("", encoding="utf-8")
    write_hydration_persist_manifest(
        persist_root=persist_root,
        writer_kind="chroma-persistent",
        cache_key="demo",
    )
    health = check_hydration_persist_health(persist_root)
    assert health.ok is True
    lock = acquire_hydration_persist_lock(persist_root, "test-owner")
    try:
        try:
            acquire_hydration_persist_lock(persist_root, "other-owner")
        except RuntimeError:
            pass
        else:
            raise AssertionError("expected writer lock contention")
    finally:
        lock.release()
