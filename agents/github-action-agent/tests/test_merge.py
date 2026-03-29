from tonic_agent.merge import annotated_to_conflict_file, merge_snapshots


def test_merge_snapshots_simple():
    merged, ann = merge_snapshots(["A"], ["A", "B"])
    assert "B" in merged
    assert isinstance(ann, list)


def test_annotated_to_conflict_file():
    ann = [
        "<<<<<<< begin added left",
        "x",
        "======= begin added right",
        "y",
        ">>>>>>> end conflict",
    ]
    cf = annotated_to_conflict_file("t.txt", ann)
    assert len(cf.conflicts) == 1
    assert cf.conflicts[0].conflict_kind == "added left"
    assert cf.left_label == "left"
    assert cf.right_label == "right"
