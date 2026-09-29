"""Render the Technical Administration Guide to print-ready HTML.

Same content as the markdown, set for reading on paper: a controlled measure,
major sections opening on a fresh page, tables that carry their headers across
page breaks, and status notes colour-coded by what they actually say.

Page numbers and the running header are added by print_guide.mjs, which drives
Chrome through puppeteer; Chrome does not support CSS paged-media margin boxes.
A second pass re-runs this script with --page-map to print the contents list
with real page numbers.
"""
import argparse
import io
import json
import re

import markdown

SRC = 'docs/user-guide.md'
OUT = 'C:/Users/Admin/AppData/Local/Temp/claude/C--Users-Admin-papama-Roja/4fb4029b-28a2-4bda-82cf-feabd0708ae1/scratchpad/guide-print.html'

ap = argparse.ArgumentParser()
ap.add_argument('--page-map', help='JSON of {heading anchor: page number} from the first pass')
args = ap.parse_args()
page_map = json.load(io.open(args.page_map, encoding='utf-8')) if args.page_map else {}

text = io.open(SRC, encoding='utf-8').read()

m = re.match(r'#\s*(.+?)\n\n((?:>.*\n)+)', text)
title = m.group(1).strip() if m else 'pApAmA — Technical Administration Guide'
meta_lines = [re.sub(r'^>\s*', '', l) for l in m.group(2).strip().split('\n')] if m else []
body_md = text[m.end():] if m else text

def open_lists(src: str) -> str:
    """Put a blank line before a list that follows a paragraph.

    The guide writes `**What the admin can do:**` immediately above its bullets.
    GitHub renders that as a list; python-markdown treats the bullets as a lazy
    continuation of the paragraph and runs them together on the page.
    Presentation only \u2014 the markdown source is left exactly as written.
    """
    item = re.compile(r'\s*(?:[-*+]\s|\d+\.\s)')
    out = []
    prev = ''
    for line in src.split(chr(10)):
        if item.match(line) and prev.strip() and not item.match(prev) and not prev.lstrip().startswith('>'):
            out.append('')
        out.append(line)
        prev = line
    return chr(10).join(out)


body_md = open_lists(body_md)

md = markdown.Markdown(
    extensions=['tables', 'fenced_code', 'attr_list', 'sane_lists', 'toc'],
    extension_configs={'toc': {'permalink': False, 'toc_depth': '2-3'}},
)
html_body = md.convert(body_md)
toc_tokens = md.toc_tokens

# ---- status notes: colour by what the note actually says ------------------
def classify(match):
    inner = match.group(1)
    if 'Built —' in inner or 'Built \u2014' in inner:
        cls = 'note built'
    elif 'Partly built' in inner:
        cls = 'note partly'
    elif 'Awaiting a client decision' in inner:
        cls = 'note decision'
    elif 'Planned' in inner:
        cls = 'note planned'
    else:
        cls = 'note'
    return f'<div class="{cls}">{inner}</div>'

html_body = re.sub(r'<blockquote>\s*(.*?)\s*</blockquote>', classify, html_body, flags=re.S)

# ---- contents, with page numbers on the second pass -----------------------
def render_toc(tokens, depth=0):
    if not tokens:
        return ''
    out = ['<ul class="toc-l%d">' % depth]
    for t in tokens:
        page = page_map.get(t['id'])
        leader = f'<span class="pg">{page}</span>' if page else ''
        out.append(f'<li><span class="tt">{t["name"]}</span>{leader}</li>')
        if t['children'] and depth < 1:
            out.append(render_toc(t['children'], depth + 1))
    out.append('</ul>')
    return '\n'.join(out)

toc_html = render_toc(toc_tokens)

meta_html = '\n'.join(
    f'<div class="metaline">{re.sub(r"^\*\*(.+?):\*\*", r"<span>\1</span>", l)}</div>' for l in meta_lines
)

CSS = """
:root {
  --ground:#F8F2E7; --surface:#FCF8F0; --surface-2:#F1E8D7; --sunk:#EADFC9;
  --ink:#1C2B24; --ink-soft:#54645C; --ink-faint:#8C9A93;
  --rule:#E3D9C6; --rule-strong:#CDBFA4;
  --accent:#0B7A55; --accent-soft:#EDF5F0;
  --warn:#A86A12; --warn-bg:#FBF2E0; --crit:#B14A26; --crit-bg:#FBEAE3;
}
* { box-sizing:border-box; }
html { -webkit-print-color-adjust:exact; print-color-adjust:exact; }
body {
  margin:0; color:var(--ink); background:#fff;
  font-family:"Spectral",Georgia,serif;
  font-size:9.7pt; line-height:1.55;
  text-rendering:geometricPrecision;
}
h1,h2,h3,h4,th,.chip,.metaline span,.coverlabel,.tocwrap h2,.note b,.note strong,.secnum,.pg,.tt {
  font-family:"IBM Plex Sans","Segoe UI",system-ui,sans-serif;
}
code,.mono { font-family:"IBM Plex Mono",Consolas,monospace; font-size:0.86em; }

/* Long prose stays inside a comfortable measure; tables may use full width. */
p, ul, ol, .note { max-width:43em; }

/* ---------------- cover ---------------- */
.cover { height:243mm; display:flex; flex-direction:column; justify-content:center;
         background:var(--ground); padding:0 20mm; page-break-after:always; }
.coverlabel { font-size:8pt; font-weight:600; letter-spacing:0.2em;
              text-transform:uppercase; color:var(--accent); margin-bottom:16px; }
.cover h1 { font-size:31pt; font-weight:700; letter-spacing:-0.032em; line-height:1.03;
            margin:0 0 22px; max-width:20ch; }
.metaline { font-size:9.5pt; color:var(--ink-soft); padding:3.5px 0; max-width:none; }
.metaline span { font-weight:600; color:var(--ink); display:inline-block; min-width:92px; }
.coverrule { height:2px; width:48px; background:var(--ink); margin:20px 0; }
.covernote { font-size:9.5pt; color:var(--ink-soft); max-width:56ch; }

/* ---------------- contents ---------------- */
.tocwrap { page-break-after:always; }
.tocwrap h2 { font-size:16pt; margin:0 0 16px; border:0; padding:0; }
.tocwrap ul { list-style:none; margin:0; padding:0; max-width:40em; }
.tocwrap li { display:flex; align-items:baseline; gap:8px; padding:2.5px 0; }
.tocwrap .tt { flex:0 1 auto; }
.tocwrap li::after {
  content:""; flex:1 1 auto; order:1;
  border-bottom:1px dotted var(--rule-strong); transform:translateY(-3px);
}
.tocwrap .pg { order:2; flex:0 0 auto; font-size:8.5pt; font-variant-numeric:tabular-nums;
               color:var(--ink-faint); }
.toc-l0 > li { font-weight:600; font-size:10pt; margin-top:10px; }
.toc-l1 { margin:2px 0 0 0; }
.toc-l1 > li { font-weight:400; font-size:8.8pt; color:var(--ink-soft);
               font-family:"Spectral",serif; }
.toc-l1 .tt { padding-left:14px; }

/* ---------------- headings ---------------- */
/* Each numbered section starts a fresh page: in a reference, finding the
   section matters more than saving paper. */
h2 { font-size:17pt; font-weight:700; letter-spacing:-0.026em; line-height:1.12;
     margin:0 0 4px; padding:0 0 10px; border-bottom:2px solid var(--ink);
     page-break-before:always; page-break-after:avoid; max-width:24ch; }
.tocwrap h2, h2.nobreak { page-break-before:auto; border-bottom:0; }
h3 { font-size:11.5pt; font-weight:600; letter-spacing:-0.008em;
     margin:12pt 0 4px; page-break-after:avoid; color:var(--ink); }
h4 { font-size:9.6pt; font-weight:600; margin:9pt 0 3px; color:var(--ink-soft);
     letter-spacing:0.01em; page-break-after:avoid; }
p { margin:0 0 5.5px; }
strong { font-weight:600; }
em { font-style:italic; }

/* ---------------- tables ---------------- */
table { border-collapse:collapse; width:100%; margin:7px 0 11px; font-size:8.3pt;
        line-height:1.45; }
thead { display:table-header-group; }   /* header repeats on every page */
th,td { text-align:left; padding:4.5px 10px 4.5px 0; vertical-align:top;
        border-bottom:1px solid var(--rule); }
th { font-size:7.4pt; font-weight:600; letter-spacing:0.11em; text-transform:uppercase;
     color:var(--ink-faint); border-bottom:1.5px solid var(--rule-strong);
     padding-top:0; padding-bottom:5px; }
tbody tr:nth-child(even) { background:#FBF7EF; }
tr { page-break-inside:avoid; }
td code { white-space:nowrap; }

/* ---------------- lists ---------------- */
ul,ol { margin:0 0 8px; padding-left:16px; }
li { margin:1.5px 0; }
li > ul, li > ol { margin-top:2px; }

/* ---------------- status notes ---------------- */
.note { margin:9px 0; padding:7px 12px; font-size:8.6pt; line-height:1.5;
        border-left:3px solid var(--rule-strong); background:var(--surface-2);
        color:var(--ink-soft); border-radius:0 3px 3px 0; page-break-inside:avoid; }
.note p { margin:0 0 4px; max-width:none; }
.note p:last-child { margin:0; }
.note.built    { border-left-color:var(--accent); background:var(--accent-soft); }
.note.partly   { border-left-color:var(--warn);   background:var(--warn-bg); }
.note.planned  { border-left-color:var(--rule-strong); background:var(--surface-2); }
.note.decision { border-left-color:var(--crit);   background:var(--crit-bg); }

code { background:var(--sunk); padding:0.5px 3px; border-radius:2px; }
hr { border:0; border-top:1px solid var(--rule); margin:10pt 0; max-width:43em; }
a { color:inherit; text-decoration:none; }

@page { margin:16mm 13mm 15mm; }
"""

doc = f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<title>{title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600;700&family=Spectral:ital,wght@0,400;0,500;0,600;1,400&display=swap">
<style>{CSS}</style></head>
<body>
<section class="cover">
  <div class="coverlabel">pApAmA &middot; Phase 1</div>
  <h1>Technical Administration Guide</h1>
  <div class="coverrule"></div>
  {meta_html}
  <div class="coverrule"></div>
  <div class="covernote">Section&nbsp;3 is the operating manual for administrators.
  Section&nbsp;9 is the configuration reference. Section&nbsp;10 answers the questions
  that come up most often. Everything marked <b>Built</b> exists in the running
  platform; everything marked <b>Planned</b> does not yet.</div>
</section>

<div class="tocwrap">
  <h2>Contents</h2>
  {toc_html}
</div>

{html_body}
</body></html>
"""

io.open(OUT, 'w', encoding='utf-8').write(doc)
print(f'html written ({len(doc):,} chars, toc entries: {len(toc_tokens)}, page numbers: {"yes" if page_map else "no"})')
