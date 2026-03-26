# state format is [(line, depth, anchored_right, count, provenance_ids)]
# provenance_ids records commit ids for each generation increment.
def serialize_state(state):
    result = []
    for row in state:
        if len(row) == 4:
            line, depth, anchored_right, count = row
            provenance = []
        else:
            line, depth, anchored_right, count, provenance = row
        encoded = ",".join(provenance)
        result.append(f'{depth} {['<', '>'][anchored_right]} {count} [{encoded}] {line}')
    return '\n'.join(result)

def deserialize_state(mystr):
    result = []
    if mystr == '':
        return []
    for line in mystr.split('\n'):
        vals = line.split(' ')
        if len(vals) >= 4 and vals[3].startswith("[") and vals[3].endswith("]"):
            raw = vals[3][1:-1]
            provenance = [p for p in raw.split(",") if p]
            payload = ' '.join(vals[4:])
        else:
            provenance = []
            payload = ' '.join(vals[3:])
        result.append([payload, int(vals[0]), vals[1] == '>', int(vals[2]), provenance])
    return result
