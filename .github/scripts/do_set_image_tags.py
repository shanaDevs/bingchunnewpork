#!/usr/bin/env python3
"""Set every container image tag in a DigitalOcean app spec to one git sha.

Leaves secrets, instance counts, and routes alone. Day-to-day deploys only
move the image tag, so a push cannot turn autoscaling on.
"""
import sys

import yaml

path, sha = sys.argv[1], sys.argv[2]
if not sha or sha == "latest":
    sys.exit("refusing to tag images as empty or latest")

with open(path, encoding="utf-8") as handle:
    spec = yaml.safe_load(handle)

if not isinstance(spec, dict):
    sys.exit(f"{path} is not an app spec")


def retag(components: object) -> int:
    if not isinstance(components, list):
        return 0
    changed = 0
    for component in components:
        if not isinstance(component, dict):
            continue
        image = component.get("image")
        if not isinstance(image, dict):
            continue
        image.pop("digest", None)
        image["tag"] = sha
        changed += 1
        print(f"{component.get('name', '?')} -> {image.get('repository', '?')}:{sha}")
    return changed


changed = retag(spec.get("services"))
changed += retag(spec.get("workers"))
changed += retag(spec.get("jobs"))
if changed == 0:
    sys.exit("spec has no container images; refusing to update a GitHub-built app")

with open(path, "w", encoding="utf-8") as handle:
    yaml.safe_dump(spec, handle, sort_keys=False)
