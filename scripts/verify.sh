#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD" node tests/workspaces.cjs
bash -n bin/manage-displays
python3 - <<'CHECK'
import json,pathlib
root=pathlib.Path('.')
m=json.loads((root/'manifest.json').read_text())
assert m['id']=='local.hyprsplit-workspaces'
for entry in m['entryPoints'].values(): assert (root/entry).is_file()
assert m['omarchy']['clonedFrom']=='omarchy.workspaces'
print('PASS: root manifest and entry points')
CHECK
