"""Find which printed page each heading landed on, for the contents list.

Matched on the heading text as it appears in the extracted page text, which is
more reliable than anchor ids: the printed page has no ids, only words.
"""
import io
import json
import re
import sys

import markdown
from pypdf import PdfReader

PDF = sys.argv[1]
OUT = sys.argv[2]

text = io.open('docs/user-guide.md', encoding='utf-8').read()
m = re.match(r'#\s*(.+?)\n\n((?:>.*\n)+)', text)
body_md = text[m.end():] if m else text

md = markdown.Markdown(extensions=['toc', 'tables'], extension_configs={'toc': {'toc_depth': '2-3'}})
md.convert(body_md)

headings = []


def walk(tokens):
    for t in tokens:
        headings.append((t['id'], t['name']))
        walk(t['children'])


walk(md.toc_tokens)

reader = PdfReader(PDF)
pages = [(p.extract_text() or '') for p in reader.pages]
# The printed page number shown in the footer is the sheet number, 1-based.
norm = [re.sub(r'\s+', ' ', t) for t in pages]

# The contents pages list every heading, so a forward search starting at page
# one matches them all against the contents itself. Start after them.
body_start = 0
for i, t in enumerate(norm):
    if t.strip().startswith('Contents'):
        body_start = i + 1
    elif body_start and i == body_start:
        # Contents can run to more than one page; keep skipping while the page
        # is still mostly a list of headings with trailing page numbers.
        import re as _re
        if len(_re.findall(r'\s\d{1,3}(?:\s|$)', t)) > 12:
            body_start = i + 1

page_map = {}
search_from = body_start
for hid, name in headings:
    needle = re.sub(r'\s+', ' ', name).strip()
    # Search forward only: headings appear in document order, so a later
    # heading cannot land on an earlier page than one before it.
    for i in range(search_from, len(norm)):
        if needle and needle in norm[i]:
            page_map[hid] = i + 1
            search_from = i
            break

json.dump(page_map, io.open(OUT, 'w', encoding='utf-8'), indent=1)
print(f'located {len(page_map)} of {len(headings)} headings across {len(pages)} pages (body starts p{body_start + 1})')
missing = [n for h, n in headings if h not in page_map]
if missing:
    print('not located:', ', '.join(missing[:6]))
