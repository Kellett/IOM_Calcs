"""Build the app's data module from the exported workbook."""
import re, html, json, os, statistics

BASE = '/tmp/opencode/gs'
X = os.path.join(BASE, 'x')
OUT = os.path.expanduser('~/projects/iom-calc/assets')
os.makedirs(OUT, exist_ok=True)

SS = [html.unescape(re.sub(r'<[^>]+>', '', s)) for s in
      re.findall(r'<si>(.*?)</si>', open(os.path.join(X, 'xl/sharedStrings.xml'), encoding='utf-8').read(), re.S)]


def load(sheet):
    xml = open(os.path.join(X, 'xl/worksheets/%s.xml' % sheet), encoding='utf-8').read()
    cells = {}
    for m in re.finditer(r'<row r="(\d+)"[^>]*>(.*?)</row>', xml, re.S):
        rn = int(m.group(1))
        for c in re.finditer(r'<c r="([A-Z]+)\d+"([^>]*?)(?:/>|>(.*?)</c>)', m.group(2), re.S):
            col, attrs, inner = c.group(1), c.group(2), c.group(3) or ''
            v = re.search(r'<v>(.*?)</v>', inner, re.S)
            f = re.search(r'<f[^>]*>(.*?)</f>', inner, re.S)
            t = re.search(r't="([^"]+)"', attrs)
            t = t.group(1) if t else 'n'
            val = None
            if v:
                val = v.group(1)
                if t == 's':
                    val = SS[int(val)]
                elif t == 'b':
                    val = val == '1'
                elif t == 'e':
                    val = None
                else:
                    try:
                        val = float(val)
                        if val.is_integer():
                            val = int(val)
                    except ValueError:
                        pass
            cells['%s%d' % (col, rn)] = {'value': val, 'formula': html.unescape(f.group(1)) if f else None}
    return cells


def val(cells, col, row, default=''):
    c = cells.get('%s%d' % (col, row))
    return c['value'] if c and c['value'] is not None else default


def formula(cells, col, row):
    c = cells.get('%s%d' % (col, row))
    return c['formula'] if c else None


def num(v):
    return v if isinstance(v, (int, float)) and not isinstance(v, bool) else 0


main = load('sheet1')
floors = load('sheet3')
ores = load('sheet4')
nota = load('sheet6')

ore_rows = []
for r in range(2, 88):
    name = val(ores, 'B', r)
    if not name:
        continue
    ore_rows.append({
        'id': int(num(val(ores, 'A', r))),
        'name': name,
        'baseCost': num(val(ores, 'E', r)),
        'craftCost': num(val(ores, 'F', r)),
        'sellPrice': num(val(ores, 'G', r)),
        'oreCard': num(val(ores, 'H', r)),
        'barCard': num(val(ores, 'I', r)),
        'debuff': {'name': val(ores, 'J', r), 'mod': num(val(ores, 'K', r))},
    })

floor_rows = []
for r in range(2, 134):
    zone = val(floors, 'D', r)
    if not zone:
        continue
    floor_rows.append({
        'id': int(num(val(floors, 'A', r))),
        'world': int(num(val(floors, 'B', r))),
        'zone': zone,
        'oreA': {'id': int(num(val(floors, 'E', r))), 'share': num(val(floors, 'G', r))},
        'oreB': {'id': int(num(val(floors, 'H', r))), 'share': num(val(floors, 'J', r))},
        'void': {'o': num(val(floors, 'K', r)), 'a': num(val(floors, 'L', r)), 'b': num(val(floors, 'M', r))},
        'debuffs': [
            {'slot': 'a', 'name': val(floors, 'S', r), 'mod': num(val(floors, 'T', r))},
            {'slot': 'b', 'name': val(floors, 'U', r), 'mod': num(val(floors, 'V', r))},
            {'slot': 'world', 'name': val(floors, 'W', r), 'mod': num(val(floors, 'X', r))},
        ],
    })

deb_rows = []
for r in range(2, 138):
    fid = val(floors, 'BE', r)
    name = val(floors, 'BF', r)
    if isinstance(fid, (int, float)) and name:
        deb_rows.append({'floorId': int(fid), 'name': name, 'mod': num(val(floors, 'BG', r))})

input_rows = []
for r in range(2, 78):
    source = val(main, 'AK', r)
    stat = val(main, 'AM', r)
    if not source or not stat:
        continue
    ap = formula(main, 'AP', r) or ''
    base = {'kind': 'literal', 'value': num(val(main, 'AP', r))}
    m = re.search(r'XLOOKUP\(\s*(?:&quot;|")([^"&]+)(?:&quot;|")', ap)
    if m and 'Stat[Name]' in ap:
        base = {'kind': 'stat', 'key': m.group(1)}
    elif '_exportfloor' in ap and 'Debuff Mod' in ap:
        slot = 'world' if 'World Debuff Mod' in ap else ('a' if 'Ore A' in ap else 'b')
        base = {'kind': 'floorDebuff', 'slot': slot}
    input_rows.append({
        'source': source,
        'section': val(main, 'AL', r),
        'stat': stat,
        'type': val(main, 'AN', r),
        'method': val(main, 'AO', r),
        'base': base,
        'withExport': 1 if num(val(main, 'AQ', r)) else 0,
        'useInCalc': 1 if num(val(main, 'AR', r)) else 0,
    })

stat_rows = []
for r in range(2, 51):
    name = val(main, 'AV', r)
    if not name:
        continue
    stat_rows.append({
        'name': name,
        'group': val(main, 'AW', r),
        'type': val(main, 'AX', r),
        'imported': num(val(main, 'AY', r)),
    })

defaults = []
for r in range(2, 4):
    n = val(main, 'BC', r)
    if n:
        defaults.append({'name': n, 'value': num(val(main, 'BD', r))})

notation = []
for r in range(2, 19):
    v = val(nota, 'A', r)
    if isinstance(v, (int, float)) and v > 0:
        notation.append({'value': v, 'short': val(nota, 'B', r), 'eng': val(nota, 'C', r)})

# gold per bar is constant per ore across every floor in the source sheet
gold = {}
for r in range(2, 5960):
    fid, oid = val(floors, 'BI', r), val(floors, 'BK', r)
    bars, goldhr = val(floors, 'BP', r), val(floors, 'BQ', r)
    if isinstance(fid, (int, float)) and isinstance(oid, (int, float)) and num(bars) and num(goldhr):
        gold.setdefault(int(oid), []).append(goldhr / bars)
for o in ore_rows:
    vals = gold.get(o['id'])
    o['goldPerBar'] = round(statistics.median(vals), 6) if vals else 0
    # Cards are a per-level multiplier; the sheet runs every ore at the same
    # level, so keep the level out and store the bare bar value instead.
    o['hasOreCard'] = o['oreCard'] != 1
    o['hasBarCard'] = o['barCard'] != 1
    o['barValue'] = round(o['goldPerBar'] / (o['barCard'] or 1), 8)

data = {
    'params': {
        'floorsPerHour': num(val(main, 'D', 8)),
        'sourceSheet': 'v1.1.1',
        'sourceGame': 'v2.2.5',
        'exportFloor': int(num(val(main, 'E', 1))),
        'cards': {
            'ore': max([o['oreCard'] for o in ore_rows if o['hasOreCard']] or [1]),
            'bar': max([o['barCard'] for o in ore_rows if o['hasBarCard']] or [1]),
        },
    },
    'ores': ore_rows,
    'floors': floor_rows,
    'floorDebuffs': deb_rows,
    'input': input_rows,
    'stats': stat_rows,
    'replaceDefaults': defaults,
    'notation': notation,
}

with open(os.path.join(OUT, 'data.js'), 'w') as f:
    f.write('// Generated from the workbook, do not edit by hand.\n')
    f.write('window.GAME_DATA = ')
    json.dump(data, f, indent=1, separators=(',', ': '))
    f.write(';\n')

print('ores %d | floors %d | debuffs %d | input %d | stats %d' %
      (len(ore_rows), len(floor_rows), len(deb_rows), len(input_rows), len(stat_rows)))
print('params', data['params'])
print('input kinds', {k: sum(1 for i in input_rows if i['base']['kind'] == k) for k in ('stat', 'floorDebuff', 'literal')})
print('useInCalc set on', sum(1 for i in input_rows if i['useInCalc']), 'rows')
print('missing export keys', sorted({i['base']['key'] for i in input_rows if i['base']['kind'] == 'stat'} - {s['name'] for s in stat_rows}))
print('gold/bar sample', [(o['name'], o['goldPerBar']) for o in ore_rows[:4]])
