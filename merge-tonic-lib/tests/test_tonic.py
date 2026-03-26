from tonic import initial_state, current_lines, update_state, merge_states
from tonic.conflicts import (
    CONFLICT_ADDED_LEFT, CONFLICT_ADDED_RIGHT, CONFLICT_ADDED_BOTH,
    CONFLICT_DELETED_LEFT, CONFLICT_DELETED_RIGHT, PEACE, END,
)
from itertools import permutations

def swap_left_right(s):
    s = s.replace('left', 'swap')
    s = s.replace('right', 'left')
    s = s.replace('swap', 'right')
    return s

def check_merges(thing1, thing2, expected_result, expected_conflicts = None):
    state1, conflicts1 = merge_states(thing1, thing2)
    state2, conflicts2 = merge_states(thing2, thing1)
    assert state1 == state2
    if expected_conflicts is None:
        assert conflicts1 == conflicts2 == expected_result
    else:
        assert conflicts1 == expected_conflicts
        assert conflicts2 == [swap_left_right(x) for x in expected_conflicts]
    assert current_lines(state1) == expected_result

SAL = '<<<<<<< begin added left'
SAR = '<<<<<<< begin added right'
SAB = '<<<<<<< begin added both'
SDL = '<<<<<<< begin deleted left'
SDR = '<<<<<<< begin deleted right'
SDB = '<<<<<<< begin deleted both'
MAL = '======= begin added left'
MAR = '======= begin added right'
MAB = '======= begin added both'
MDL = '======= begin deleted left'
MDR = '======= begin deleted right'
MDB = '======= begin deleted both'

def test_initial():
    assert initial_state([]) == ''
    assert current_lines('') == []
    v1 = initial_state(['line 1', 'line 4'])
    v2 = initial_state(['line 2', 'line 3'])
    state1, output1 = merge_states(v1, v2)
    state2, output2 = merge_states(v2, v1)
    assert state1 == state2
    assert current_lines(state1) == ['line 1', 'line 4', 'line 2', 'line 3']

def test_bottom_and_top():
    initial = initial_state(['A'])
    insert_below = update_state(initial, ['B', 'A'])
    replace_below = update_state(insert_below, ['B'])
    insert_above = update_state(initial, ['A', 'B'])
    replace_above = update_state(insert_above, ['B'])
    delete = update_state(initial, [])
    check_merges(initial, initial, ['A'])
    check_merges(initial, insert_below, ['B', 'A'])
    check_merges(initial, replace_below, ['B'])
    check_merges(initial, insert_above, ['A', 'B'])
    check_merges(initial, replace_above, ['B'])
    check_merges(initial, delete, [])
    check_merges(insert_below, insert_below, ['B', 'A'])
    check_merges(insert_below, replace_below, ['B'])
    check_merges(insert_below, insert_above, ['B', 'A', 'B'])
    check_merges(insert_below, replace_above, ['B', 'B'], [SAL, 'B', MDR, 'A', MAR, 'B', END])
    check_merges(insert_below, delete, ['B'], [SAL, 'B', MDR, 'A', END])
    check_merges(replace_below, replace_below, ['B'])
    check_merges(replace_below, insert_above, ['B', 'B'], [SAL, 'B', MDL, 'A', MAR, 'B', END])
    check_merges(replace_below, replace_above, ['B', 'B'], [SAL, 'B', MAR, 'B', END])
    check_merges(replace_below, delete, ['B'])
    check_merges(insert_above, insert_above, ['A', 'B'])
    check_merges(insert_above, replace_above, ['B'])
    check_merges(insert_above, delete, ['B'], [SDR, 'A', MAL, 'B', END])
    check_merges(replace_above, replace_above, ['B'])
    check_merges(replace_above, delete, ['B'])
    check_merges(delete, delete, [])

def test_bottom():
    initial = initial_state(['A', 'X'])
    insert_below = update_state(initial, ['B', 'A', 'X'])
    replace_below = update_state(insert_below, ['B', 'X'])
    insert_above = update_state(initial, ['A', 'B', 'X'])
    replace_above = update_state(insert_above, ['B', 'X'])
    delete = update_state(initial, ['X'])
    check_merges(initial, initial, ['A', 'X'])
    check_merges(initial, insert_below, ['B', 'A', 'X'])
    check_merges(initial, replace_below, ['B', 'X'])
    check_merges(initial, insert_above, ['A', 'B', 'X'])
    check_merges(initial, replace_above, ['B', 'X'])
    check_merges(initial, delete, ['X'])
    check_merges(insert_below, insert_below, ['B', 'A', 'X'])
    check_merges(insert_below, replace_below, ['B', 'X'])
    check_merges(insert_below, insert_above, ['B', 'A', 'B', 'X'])
    check_merges(insert_below, replace_above, ['B', 'B', 'X'], [SAL, 'B', MDR, 'A', MAR, 'B', END, 'X'])
    check_merges(insert_below, delete, ['B', 'X'], [SAL, 'B', MDR, 'A', END, 'X'])
    check_merges(replace_below, replace_below, ['B', 'X'])
    check_merges(replace_below, insert_above, ['B', 'B', 'X'], [SAL, 'B', MDL, 'A', MAR, 'B', END, 'X'])
    check_merges(replace_below, replace_above, ['B', 'B', 'X'], [SAL, 'B', MAR, 'B', END, 'X'])
    check_merges(replace_below, delete, ['B', 'X'])
    check_merges(insert_above, insert_above, ['A', 'B', 'X'])
    check_merges(insert_above, replace_above, ['B', 'X'])
    check_merges(insert_above, delete, ['B', 'X'], [SDR, 'A', MAL, 'B', END, 'X'])
    check_merges(replace_above, replace_above, ['B', 'X'])
    check_merges(replace_above, delete, ['B', 'X'])
    check_merges(delete, delete, ['X'])

def test_top():
    initial = initial_state(['X', 'A'])
    insert_below = update_state(initial, ['X', 'B', 'A'])
    replace_below = update_state(insert_below, ['X', 'B'])
    insert_above = update_state(initial, ['X', 'A', 'B'])
    replace_above = update_state(insert_above, ['X', 'B'])
    delete = update_state(initial, ['X'])
    check_merges(initial, initial, ['X', 'A'])
    check_merges(initial, insert_below, ['X', 'B', 'A'])
    check_merges(initial, replace_below, ['X', 'B'])
    check_merges(initial, insert_above, ['X', 'A', 'B'])
    check_merges(initial, replace_above, ['X', 'B'])
    check_merges(initial, delete, ['X'])
    check_merges(insert_below, insert_below, ['X', 'B', 'A'])
    check_merges(insert_below, replace_below, ['X', 'B'])
    check_merges(insert_below, insert_above, ['X', 'B', 'A', 'B'])
    check_merges(insert_below, replace_above, ['X', 'B', 'B'], ['X', SAL, 'B', MDR, 'A', MAR, 'B', END])
    check_merges(insert_below, delete, ['X', 'B'], ['X', SAL, 'B', MDR, 'A', END])
    check_merges(replace_below, replace_below, ['X', 'B'])
    check_merges(replace_below, insert_above, ['X', 'B', 'B'], ['X', SAL, 'B', MDL, 'A', MAR, 'B', END])
    check_merges(replace_below, replace_above, ['X', 'B', 'B'], ['X', SAL, 'B', MAR, 'B', END])
    check_merges(replace_below, delete, ['X', 'B'])
    check_merges(insert_above, insert_above, ['X', 'A', 'B'])
    check_merges(insert_above, replace_above, ['X', 'B'])
    check_merges(insert_above, delete, ['X', 'B'], ['X', SDR, 'A', MAL, 'B', END])
    check_merges(replace_above, replace_above, ['X', 'B'])
    check_merges(replace_above, delete, ['X', 'B'])
    check_merges(delete, delete, ['X'])

def test_generation_counting():
    count0 = initial_state([])
    count1 = update_state(count0, ['A'])
    count2 = update_state(count1, [])
    count3 = update_state(count2, ['A'])
    count4 = update_state(count3, [])
    check_merges(count0, count1, ['A'])
    check_merges(count0, count2, [])
    check_merges(count0, count3, ['A'])
    check_merges(count0, count4, [])
    check_merges(count1, count1, ['A'])
    check_merges(count1, count2, [])
    check_merges(count1, count3, ['A'])

    check_merges(count1, count4, [])
    check_merges(count2, count2, [])
    check_merges(count2, count3, ['A'])
    check_merges(count2, count4, [])
    check_merges(count3, count3, ['A'])
    check_merges(count3, count4, [])
    check_merges(count4, count4, [])


def test_noop_duplicate_lines_preserves_hidden_history():
    state = initial_state(['A', 'A'])
    state = update_state(state, ['A'])
    assert update_state(state, ['A']) == state


def _test_insertions_single(a, b, c, d):
    state1, junk1 = merge_states(a, b)
    state2, junk2 = merge_states(c, d)
    state3, junk3 = merge_states(state1, state2)
    assert current_lines(state3) == ['A', 'B', 'C', 'D']

def test_insertions():
    mylist = [initial_state([x]) for x in ('A', 'B', 'C', 'D')]
    for perm in permutations(mylist):
        _test_insertions_single(*perm)

def _test_insertions_below_single(a, b, c, d):
    state1, junk1 = merge_states(a, b)
    state2, junk2 = merge_states(c, d)
    state3, junk3 = merge_states(state1, state2)
    assert current_lines(state3) == ['A', 'B', 'C', 'D', 'X']

def test_insertions_below():
    initial = initial_state(['X'])
    mylist = [update_state(initial, [x, 'X']) for x in ('A', 'B', 'C', 'D')]
    for perm in permutations(mylist):
        _test_insertions_below_single(*perm)

def test_space_separated_insert_insert():
    initial = initial_state([''])
    insert_left = update_state(initial, ['A', ''])
    insert_right = update_state(initial, ['', 'B'])
    check_merges(insert_left, insert_right, ['A', '', 'B'], [SAL, 'A', MAB, '', MAR, 'B', END])

def test_space_separated_insert_delete():
    initial = initial_state(['', 'B'])
    insert_left = update_state(initial, ['A', '', 'B'])
    delete_right = update_state(initial, [''])
    check_merges(insert_left, delete_right, ['A', ''], [SAL, 'A', MAB, '', MDR, 'B', END])

def test_space_separated_delete_insert():
    initial = initial_state(['A', ''])
    delete_left = update_state(initial, [''])
    insert_right = update_state(initial, ['A', '', 'B'])
    check_merges(delete_left, insert_right, ['', 'B'], [SDL, 'A', MAB, '', MAR, 'B', END])

def test_space_separated_delete_delete():
    initial = initial_state(['A', '', 'B'])
    delete_left = update_state(initial, ['', 'B'])
    delete_right = update_state(initial, ['A', ''])
    check_merges(delete_left, delete_right, [''])

def test_deleted_both():
    initial = initial_state(['', 'X', ''])
    left = update_state(initial, ['A', '', ''])
    right = update_state(initial, ['', '', 'B'])
    check_merges(left, right, ['A', '', '', 'B'], [SAL, 'A', MAB, '', '', MAR, 'B', END])

def test_deleted_both2():
    initial = initial_state(['A'])
    left = update_state(initial, ['X', 'A'])
    left = update_state(left, ['X'])
    right = update_state(initial, ['A', 'Y'])
    right = update_state(initial, ['Y'])
    check_merges(left, right, ['X', 'Y'], [SAL, 'X', MAR, 'Y', END])

def test_update_insert_multiple():
    initial = initial_state(['A', 'B'])
    updated = update_state(initial, ['A', 'X', 'Y', 'B'])
    assert current_lines(updated) == ['A', 'X', 'Y', 'B']

def test_insert_low_tree():
    initial = initial_state(['A'])
    updated = update_state(initial, ['Y', 'A'])
    updated = update_state(updated, ['X', 'Y', 'A'])
    right = update_state(initial, ['A', 'B'])
    check_merges(updated, right, ['X', 'Y', 'A', 'B'])

def check_associative(a, b, c):
    ab, _ = merge_states(a, b)
    ab_c, _ = merge_states(ab, c)
    bc, _ = merge_states(b, c)
    a_bc, _ = merge_states(a, bc)
    assert ab_c == a_bc
    assert current_lines(ab_c) == current_lines(a_bc)


def test_associativity_generation_counts():
    # Three branches from same ancestor with different generation counts (PR #3 scenario)
    start = initial_state(['X'])
    a = start                                          # count 1
    b = update_state(start, [])                        # count 2
    c = update_state(update_state(start, []), ['X'])   # count 3

    ac, _ = merge_states(a, c)
    acb, _ = merge_states(ac, b)

    cb, _ = merge_states(c, b)
    a_cb, _ = merge_states(a, cb)

    assert current_lines(acb) == current_lines(a_cb)


def test_associativity():
    s = initial_state(['A', 'B'])
    a = update_state(s, ['A', 'X', 'B'])
    b = update_state(s, ['A', 'Y', 'B'])
    c = update_state(s, ['A', 'B', 'Z'])
    check_associative(a, b, c)
    a = update_state(s, ['B'])
    b = update_state(s, ['A'])
    c = update_state(s, ['A', 'B', 'C'])
    check_associative(a, b, c)
    a = update_state(update_state(s, []), ['A', 'B'])
    b = update_state(s, [])
    c = update_state(s, [])
    check_associative(a, b, c)
    a = initial_state(['P'])
    b = initial_state(['Q'])
    c = initial_state(['R'])
    check_associative(a, b, c)
    s = initial_state(['M'])
    left = update_state(s, ['M', 'L'])
    right = update_state(s, ['R', 'M'])
    merged, _ = merge_states(left, right)
    check_associative(left, right, merged)
    check_associative(merged, left, update_state(s, []))


def check_idempotent(state):
    merged, _ = merge_states(state, state)
    assert merged == state


def test_idempotency():
    check_idempotent(initial_state([]))
    check_idempotent(initial_state(['A', 'B', 'C']))
    state = initial_state(['A', 'B'])
    check_idempotent(state)
    state = update_state(state, ['A', 'X', 'B'])
    check_idempotent(state)
    state = update_state(state, ['A', 'B'])
    check_idempotent(state)
    state = update_state(state, ['A', 'X', 'B'])
    check_idempotent(state)
    left = update_state(initial_state(['M']), ['M', 'L'])
    right = update_state(initial_state(['M']), ['R', 'M'])
    merged, _ = merge_states(left, right)
    check_idempotent(merged)
