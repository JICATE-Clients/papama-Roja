"""Render the Technical Administration Guide as a print-ready HTML document.

Same document language as the Phase 1 delivery register the client already
holds: ivory ground, brand green only where something is settled, saffron for
caution. A 2,100-line reference needs navigation the register did not, so this
adds a numbered contents page and running section titles.
"""
import io
import re

import markdown

SRC = 'docs/user-guide.md'
OUT = 'C:/Users/Admin/AppData/Local/Temp/claude/C--Users-Admin-papama-Roja/4fb4029b-28a2-4bda-82cf-feabd0708ae1/scratchpad/guide-print.html'

text = io.open(SRC, encoding='utf-8').read()

# The title block is a blockquote of metadata; lift it out so it can be set as
# a cover rather than rendered as a pull-quote on page one.
m = re.match(r'#\s*(.+?)\n\n((?:>.*\n)+)', text)
title = m.group(1).strip() if m else 'pApAmA — Technical Administration Guide'
meta_lines = [re.sub(r'^>\s*', '', l) for l in m.group(2).strip().split('\n')] if m else []
body_md = text[m.end():] if m else text

html_body = markdown.markdown(
    body_md,
    extensions=['tables', 'fenced_code', 'attr_list', 'sane_lists', 'toc'],
    extension_configs={'toc': {'permalink': False, 'toc_depth': '2-3'}},
)

md_toc = markdown.Markdown(extensions=['toc', 'tables'], extension_configs={'toc': {'toc_depth': '2-3'}})
md_toc.convert(body_md)
toc_html = md_toc.toc

meta_html = '\n'.join(
    f'<div class="metaline">{re.sub(r"^\*\*(.+?):\*\*", r"<span>\1</span>", l)}</div>' for l in meta_lines
)

CSS = """
:root {
  --ground:#F8F2E7; --surface:#FCF8F0; --surface-2:#F1E8D7; --sunk:#EADFC9;
  --ink:#1C2B24; --ink-soft:#5B6B63; --ink-faint:#8C9A93;
  --rule:#E0D5C0; --rule-strong:#CDBFA4;
  --accent:#0B7A55; --accent-soft:#EAF3EE;
  --warn:#A86A12; --warn-bg:#FBF0DC; --crit:#B14A26; --crit-bg:#FBEAE3;
}
* { box-sizing:border-box; }
body {
  margin:0; background:#fff; color:var(--ink);
  font-family:"Spectral",Georgia,"Times New Roman",serif;
  font-size:10pt; line-height:1.6;
}
h1,h2,h3,h4,th,.ui,.chip,.metaline span,.coverlabel,.tocwrap h2 {
  font-family:"IBM Plex Sans","Segoe UI",system-ui,sans-serif;
}
code,.mono { font-family:"IBM Plex Mono",Consolas,monospace; font-size:0.88em; }

/* ---- cover ---- */
/* A framed ivory panel, not a bleed: Chrome will not reliably carry a
   background into the page margin, and a half-bled cover reads as an error. */
.cover { height:247mm; display:flex; flex-direction:column; justify-content:center;
         background:var(--ground); padding:0 18mm; page-break-after:always; }
.coverlabel { font-size:8.5pt; font-weight:600; letter-spacing:0.18em;
              text-transform:uppercase; color:var(--accent); margin-bottom:14px; }
.cover h1 { font-size:30pt; font-weight:700; letter-spacing:-0.03em; line-height:1.05;
            margin:0 0 20px; max-width:22ch; }
.metaline { font-size:9.5pt; color:var(--ink-soft); padding:3px 0; }
.metaline span { font-weight:600; color:var(--ink); }
.coverrule { height:2px; width:46px; background:var(--ink); margin:22px 0; }
.covernote { font-size:9.5pt; color:var(--ink-soft); max-width:62ch; }

/* ---- contents ---- */
.tocwrap { page-break-after:always; padding-top:4mm; }
.tocwrap h2 { font-size:15pt; margin:0 0 14px; letter-spacing:-0.02em; }
.tocwrap ul { list-style:none; margin:0; padding:0; }
.tocwrap > .toc > ul > li { margin-top:9px; font-weight:600; font-size:10pt;
                            font-family:"IBM Plex Sans",sans-serif; }
.tocwrap ul ul { margin:3px 0 0 14px; }
.tocwrap ul ul li { font-weight:400; font-size:9pt; color:var(--ink-soft);
                    font-family:"Spectral",serif; padding:1px 0; }
.tocwrap a { color:inherit; text-decoration:none; }

/* ---- headings ---- */
h2 { font-size:15pt; font-weight:700; letter-spacing:-0.022em; line-height:1.15;
     margin:0 0 10px; padding-top:10pt; border-top:2px solid var(--rule-strong);
     page-break-after:avoid; page-break-before:auto; }
h3 { font-size:11.5pt; font-weight:600; letter-spacing:-0.01em; margin:16pt 0 6px;
     page-break-after:avoid; }
h4 { font-size:10pt; font-weight:600; margin:12pt 0 4px; color:var(--ink-soft);
     page-break-after:avoid; }
p { margin:0 0 7px; }
strong { font-weight:600; }

/* ---- tables ---- */
table { border-collapse:collapse; width:100%; margin:8px 0 12px; font-size:8.6pt;
        page-break-inside:auto; }
th,td { text-align:left; padding:6px 9px 6px 0; border-bottom:1px solid var(--rule);
        vertical-align:top; line-height:1.45; }
th { font-size:7.6pt; font-weight:600; letter-spacing:0.1em; text-transform:uppercase;
     color:var(--ink-faint); border-bottom:1px solid var(--rule-strong); }
tr { page-break-inside:avoid; }

/* ---- lists ---- */
ul,ol { margin:0 0 9px; padding-left:17px; }
li { margin:2px 0; }

/* ---- status notes ---- */
blockquote {
  margin:9px 0; padding:8px 12px; border-left:3px solid var(--rule-strong);
  background:var(--surface-2); font-size:8.8pt; color:var(--ink-soft);
  page-break-inside:avoid; border-radius:0 3px 3px 0;
}
blockquote p { margin:0 0 4px; }
blockquote p:last-child { margin:0; }
blockquote:has(strong:first-child) { border-left-color:var(--warn); background:var(--warn-bg); }

code { background:var(--sunk); padding:0.5px 3px; border-radius:2px; color:var(--ink); }
hr { border:0; border-top:1px solid var(--rule); margin:14pt 0; }
a { color:var(--accent); text-decoration:none; }

@page { margin:14mm 13mm; }
@media print { * { -webkit-print-color-adjust:exact; print-color-adjust:exact; } }
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
  <h1>{title.replace('pApAmA — ', '')}</h1>
  <div class="coverrule"></div>
  {meta_html}
  <div class="coverrule"></div>
  <div class="covernote">Written for administrators, compliance officers, Food Partner managers,
  implementation partners and technical teams. Section&nbsp;3 is the operating manual;
  Section&nbsp;9 is the configuration reference; Section&nbsp;10 answers the questions
  that come up most often.</div>
</section>

<div class="tocwrap">
  <h2>Contents</h2>
  {toc_html}
</div>

{html_body}
</body></html>
"""

io.open(OUT, 'w', encoding='utf-8').write(doc)
print(f'wrote {OUT} ({len(doc):,} chars)')
