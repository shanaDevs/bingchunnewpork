"""Rename Graphify communities to module · function labels (no LLM)."""
from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent
GRAPH = ROOT / "graph.json"
HTML = ROOT / "graph.html"
REPORT = ROOT / "GRAPH_REPORT.md"

GENERIC = {
    "props",
    "state",
    "data",
    "item",
    "result",
    "value",
    "type",
    "error",
    "response",
    "request",
    "config",
    "options",
    "params",
    "context",
    "index",
    "main",
    "app",
    "test",
    "tests",
    "utils",
    "helper",
    "helpers",
    "common",
    # Framework lifecycle / boilerplate — prefer real module or class names
    "initstate",
    "createstate",
    "build",
    "dispose",
    "setstate",
    "didchangedependencies",
    "didupdatewidget",
    "deactivate",
    "reassemble",
    "icon",
    "icons",
    "widget",
    "statelesswidget",
    "statefulwidget",
    "usecallback",
    "usememo",
    "useeffect",
    "usestate",
    "useref",
    "render",
    "tostring",
    "constructor",
}


def module_key(source_file: str) -> str:
    if not source_file:
        return ""
    p = source_file.replace("\\", "/")
    parts = [x for x in p.split("/") if x and x not in (".", "..")]
    if not parts:
        return ""
    roots = {
        "Frontend",
        "backend",
        "customer_mobile",
        "mobile",
        "driver_android",
        "delivery-service",
        "docs",
    }
    if parts[0] in roots:
        depth = 3 if parts[0] in {"Frontend", "backend", "customer_mobile", "mobile"} else 2
        end = min(depth, len(parts) - 1 if len(parts) > 1 else len(parts))
        return "/".join(parts[: max(1, end)])
    return "/".join(parts[: min(3, max(1, len(parts) - 1))])


def label_community(cid, ns: list) -> str:
    files: Counter[str] = Counter()
    callables: Counter[str] = Counter()
    classes: Counter[str] = Counter()
    for n in ns:
        mk = module_key(n.get("source_file") or "")
        if mk:
            files[mk] += 1
        lab = (n.get("label") or "").strip()
        if not lab or lab.lower() in GENERIC:
            continue
        if lab.startswith("_"):
            continue
        if len(lab) < 4 and lab.islower():
            continue
        if n.get("_callable_class"):
            classes[lab] += 1
        elif n.get("_callable"):
            callables[lab] += 1

    mod = files.most_common(1)[0][0] if files else f"module-{cid}"
    short_mod = mod
    if len(short_mod) > 42:
        short_mod = "…/" + "/".join(short_mod.split("/")[-2:])

    top_fn = None
    for lab, _ in classes.most_common(5) + callables.most_common(5):
        if not lab or lab.startswith("_"):
            continue
        if lab[0].isupper() or (lab[0].islower() and len(lab) > 3):
            top_fn = lab
            break
    if not top_fn:
        labs: Counter[str] = Counter()
        for n in ns:
            lab = (n.get("label") or "").strip()
            if lab and lab.lower() not in GENERIC and not lab.startswith("Community"):
                labs[lab] += 1
        if labs:
            # Prefer PascalCase / longer names over short fields
            ranked = sorted(
                labs.items(),
                key=lambda kv: (
                    kv[0][:1].isupper(),
                    not kv[0].startswith("_"),
                    len(kv[0]),
                    kv[1],
                ),
                reverse=True,
            )
            for lab, _ in ranked:
                if lab.startswith("_") or lab.lower() in GENERIC:
                    continue
                if len(lab) < 4 and lab.islower():
                    continue
                top_fn = lab
                break

    if top_fn and top_fn not in short_mod:
        name = f"{short_mod} | {top_fn}"
    else:
        # Prefer a file stem as the "function/module" hint when no callable stands out
        stems: Counter[str] = Counter()
        for n in ns:
            sf = (n.get("source_file") or "").replace("\\", "/")
            if sf and "/" in sf:
                stem = Path(sf).stem
                if stem and stem.lower() not in GENERIC and not stem.startswith("_"):
                    stems[stem] += 1
        if stems:
            name = f"{short_mod} | {stems.most_common(1)[0][0]}"
        else:
            name = f"Module: {short_mod}"
    if len(name) > 56:
        name = name[:53] + "…"
    return name


def main() -> None:
    g = json.loads(GRAPH.read_text(encoding="utf-8"))
    nodes = g["nodes"]
    by_c: dict = defaultdict(list)
    for n in nodes:
        by_c[n.get("community")].append(n)

    names: dict = {}
    used: set[str] = set()
    for cid in sorted(by_c.keys(), key=lambda x: (x is None, x)):
        base = label_community(cid, by_c[cid])
        name = base
        i = 2
        while name.lower() in used:
            name = f"{base} ({i})"
            i += 1
        used.add(name.lower())
        names[cid] = name

    for n in nodes:
        cid = n.get("community")
        if cid in names:
            n["community_name"] = names[cid]

    GRAPH.write_text(json.dumps(g, ensure_ascii=False), encoding="utf-8")
    print(f"Updated graph.json with {len(names)} module/function labels")
    for cid in list(sorted(names.keys(), key=lambda x: (x is None, x)))[:12]:
        print(f"  {cid}: {names[cid]} ({len(by_c[cid])} nodes)")

    html = HTML.read_text(encoding="utf-8")
    m = re.search(r"const RAW_NODES = (\[.*?\]);\s*\n", html, re.S)
    if not m:
        raise SystemExit("RAW_NODES not found")
    raw_nodes = json.loads(m.group(1))
    for n in raw_nodes:
        cid = n.get("community")
        if cid in names:
            n["label"] = names[cid]
            n["title"] = names[cid]
            n["community_name"] = names[cid]

    m2 = re.search(r"const LEGEND = (\[.*?\]);\s*\n", html, re.S)
    if not m2:
        raise SystemExit("LEGEND not found")
    legend = json.loads(m2.group(1))
    for item in legend:
        cid = item.get("cid")
        if cid in names:
            item["label"] = names[cid]

    html2 = html[: m.start()] + f"const RAW_NODES = {json.dumps(raw_nodes, ensure_ascii=False)};\n" + html[m.end() :]
    m2 = re.search(r"const LEGEND = (\[.*?\]);\s*\n", html2, re.S)
    html2 = html2[: m2.start()] + f"const LEGEND = {json.dumps(legend, ensure_ascii=False)};\n" + html2[m2.end() :]
    html2 = html2.replace(">COMMUNITIES</div>", ">MODULES</div>")
    html2 = html2.replace(
        "Community: ${esc(n._community_name)}",
        "Module: ${esc(n._community_name)}",
    )
    HTML.write_text(html2, encoding="utf-8")
    print("Patched graph.html")

    if REPORT.exists():
        rpt = REPORT.read_text(encoding="utf-8")
        for cid, name in names.items():
            rpt = rpt.replace(f"- Community {cid}\n", f"- {name}\n")
            rpt = rpt.replace(f"## Community {cid}\n", f"## {name}\n")
            rpt = rpt.replace(f"### Community {cid}\n", f"### {name}\n")
        REPORT.write_text(rpt, encoding="utf-8")
        print("Updated GRAPH_REPORT.md labels")


if __name__ == "__main__":
    main()
