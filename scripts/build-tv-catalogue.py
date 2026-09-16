import concurrent.futures, html, json, re, urllib.request
from pathlib import Path

source = open("tv-and-movie-links.md", encoding="utf8").read()
links, seen = [], set()
for title, url in re.findall(r"^- \[([^\]]+)\]\(<([^>]+)>\)", source, re.M):
    m = re.search(r"/folders/([^/?]+)", url)
    if m and m.group(1) not in seen:
        seen.add(m.group(1)); links.append((title.strip(), url))

def read_folder(item):
    title, url = item
    try: data = urllib.request.urlopen(url, timeout=30).read().decode("utf8", "ignore")
    except Exception: return title, url, []
    found, ids = [], set()
    names = re.findall(r'aria-label="([^"]+?) Video Shared"', data)
    fileids = re.findall(r'data-id="([\w-]{20,})"', data)
    for fid, raw in zip(fileids, names):
        if fid not in ids: ids.add(fid); found.append((fid, raw))
    return title, url, found

with concurrent.futures.ThreadPoolExecutor(max_workers=20) as pool:
    results = list(pool.map(read_folder, links))
base = json.load(open("src/lib/tv.catalogue.json", encoding="utf8"))[:5]
known = {x["slug"] for x in base}
def slug(s): return re.sub(r"^-|-$", "", re.sub(r"[^a-z0-9]+", "-", s.lower()))
for title, url, files in results:
    key = slug(title)
    if not key or key in known or not files: continue
    known.add(key); episodes = []
    for i, (fid, name) in enumerate(files, 1):
        sm = re.search(r"S(?:eason)?\s*0*(\d+)", name, re.I)
        em = re.search(r"E(?:pisode)?\s*0*(\d+)", name, re.I)
        episodes.append({"fileId": fid, "season": int(sm.group(1)) if sm else 1,
                         "number": int(em.group(1)) if em else i, "title": name})
    base.append({"slug": key, "title": title, "genre": "anime" if re.search(r"anime|manga|naruto|one punch|attack|jujutsu|saga|man", title, re.I) else "animation",
                 "thumbnail": "", "episodes": episodes, "sourceUrl": url})
# Artwork identities are reviewed explicitly. Never replace them with fuzzy
# title searches, blank thumbnails, or generated placeholder images on rebuild.
artwork = json.load(open("scripts/data/tv-artwork.json", encoding="utf8"))
missing = [entry["slug"] for entry in base if entry["slug"] not in artwork]
if missing:
    raise SystemExit("Resolve real artwork before rebuilding: " + ", ".join(missing))
for entry in base:
    entry["thumbnail"] = artwork[entry["slug"]]["thumbnail"]
    if not Path("public" + entry["thumbnail"]).is_file():
        raise SystemExit("Missing local artwork: " + entry["thumbnail"])
json.dump(base, open("src/lib/tv.catalogue.json", "w", encoding="utf8"), indent=2, ensure_ascii=False); open("src/lib/tv.catalogue.json", "a").write("\n")
print(f"shows={len(base)} episodes={sum(len(x['episodes']) for x in base)} folders={len(links)}")
