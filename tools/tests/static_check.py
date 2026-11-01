from pathlib import Path
import json,re,hashlib
root=Path(__file__).resolve().parents[1]
patterns=[r'/home/lancer',r'127\.0\.0\.1:8100',r'localhost:8100',r'https?://docs\.google\.com',r'https?://drive\.google\.com',r'fetch\s*\(',r'AIza[0-9A-Za-z_-]{20,}',r'-----BEGIN .*PRIVATE KEY-----']
issues=[]
for p in root.rglob('*'):
 if not p.is_file() or p==Path(__file__).resolve() or p.suffix not in ['.html','.js','.json','.md','.cjs','.css']:continue
 s=p.read_text()
 for rule in patterns:
  if re.search(rule,s):issues.append((str(p.relative_to(root)),rule))
assert not issues,issues
m=root/'public-files.json'
if m.exists():
 for row in json.loads(m.read_text())['files']:
  f=root/row['path'];assert hashlib.sha256(f.read_bytes()).hexdigest()==row['sha256'],row['path']
print('PASS: private references / API calls / credential patterns absent; manifest hashes match if present')
