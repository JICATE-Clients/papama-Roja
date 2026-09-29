# Printing the Technical Administration Guide

`docs/user-guide.md` is the source. The PDF beside it,
`docs/technical-administration-guide-v1.2.pdf`, is printed from it in three
steps, because the contents list carries real page numbers and those can only
be known after a first print.

```bash
S=scripts
# 1. render, print once, and find where each heading landed
python $S/build-guide-html.py
node   $S/print-guide.mjs <html-path> pass1.pdf
python $S/guide-page-map.py pass1.pdf pagemap.json

# 2. render again with the page numbers, and print the real thing
python $S/build-guide-html.py --page-map pagemap.json
node   $S/print-guide.mjs <html-path> docs/technical-administration-guide-v1.2.pdf

# 3. confirm the numbers did not move
python $S/guide-page-map.py docs/technical-administration-guide-v1.2.pdf pagemap2.json
# diff pagemap.json pagemap2.json — identical means the contents is honest
```

`build-guide-html.py` writes its HTML into the session scratchpad; the path it
prints is the `<html-path>` for the next step.

## Two things worth knowing

**puppeteer, not the Chrome CLI.** Chrome has no CSS paged-media margin boxes,
so the running header and the page numbers come from puppeteer's own header and
footer templates. `print-guide.mjs` needs `puppeteer-core` resolvable — run it
from a directory that has it installed.

**Lists are opened before conversion.** The guide writes a bold label
immediately above its bullets. GitHub renders that as a list; python-markdown
runs the bullets into the paragraph. `open_lists()` inserts the blank line at
render time, so the markdown source stays as written.

## If the figures change

Update `docs/user-guide.md`, reprint, and commit both. The version and date live
in the markdown front matter, and the cover reads them from there.
