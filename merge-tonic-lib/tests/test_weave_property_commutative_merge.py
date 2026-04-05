from __future__ import annotations

import random

from tonic import initial_state, merge_states, update_state


def _rand_lines(rng: random.Random, n: int) -> list[str]:
    return [f"L{rng.randint(0, 9)}" for _ in range(n)]


def test_sampled_merge_states_commutative() -> None:
    rng = random.Random(42)
    for _ in range(24):
        base = _rand_lines(rng, 4)
        sa = initial_state(base, commit_id="0")
        seq_a = list(base)
        seq_b = list(base)
        for i in range(3):
            if rng.random() < 0.5:
                seq_a.append(f"a{i}")
            if rng.random() < 0.5:
                seq_b.append(f"b{i}")
            sa = update_state(sa, list(seq_a), commit_id=f"a{i}")
        sb = initial_state(base, commit_id="0")
        for i in range(3):
            sb = update_state(sb, list(seq_b), commit_id=f"b{i}")
        m1, _ = merge_states(sa, sb)
        m2, _ = merge_states(sb, sa)
        assert m1 == m2
