from pathlib import Path
import json,re
root=Path(__file__).resolve().parents[1]
page=(root/'index.html').read_text()
for bad in ['fetch(', 'XMLHttpRequest', 'WebSocket(', 'sendBeacon(', '/api/', '/home/', 'docs.google.com', 'gitlab.com', 'github.com', 'http://', 'https://']:
    assert bad not in page, bad
assert not re.search(r'<script[^>]+src=',page)
assert 'operation-deck-turn-journal-r01' not in page
sample=json.loads((root/'sample.json').read_text())
assert len(sample['notes'])==9
assert all(n['id'].startswith('demo-') for n in sample['notes'])
assert len({n['id'] for n in sample['notes']})==9
assert all(n.get('memo','').find('/home/')<0 for n in sample['notes'])
print('PASS: no API/network/private references; isolated storage; synthetic sample')
