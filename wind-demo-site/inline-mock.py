import io, re, sys

ROOT = r'C:\Users\osama\.local\share\opencode\worktree\b44bf6\wind-demo-2026-11-11\wind-demo-site'
site = ROOT + r'\public'
mock_path = ROOT + r'\demo-mock.js'
html_path = site + r'\index.html'

with io.open(mock_path, encoding='utf-8') as f:
    mock = f.read()
with io.open(html_path, encoding='utf-8') as f:
    html = f.read()

assert '</script>' not in mock

block = '<script>\n' + mock + '\n</script>'
if '<script src="/demo-mock.js"></script>' in html:
    html = html.replace('<script src="/demo-mock.js"></script>', block)
    print('inline: replaced external tag with inline mock')
else:
    pattern = re.compile(r'<script>\s*/\* demo-mock\.js.*?</script>', re.S)
    new_html, count = pattern.subn(lambda m: block, html, count=1)
    if count == 1:
        html = new_html
        print('inline: refreshed previously inlined mock')
    else:
        print('ERROR: no mock anchor found in index.html', file=sys.stderr)
        sys.exit(1)

with io.open(html_path, 'w', encoding='utf-8', newline='\n') as f:
    f.write(html)
print('assertion ok')
