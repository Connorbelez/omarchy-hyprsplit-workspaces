const path = require('path')
const root = process.env.ROOT

function fail(description, detail) {
  if (detail) console.error(detail)
  console.error(`not ok - ${description}`)
  process.exit(1)
}

function pass(description) {
  console.log(`ok - ${description}`)
}

function assert(condition, description, detail) {
  if (!condition) fail(description, detail)
  pass(description)
}

function assertEqual(actual, expected, description) {
  assert(
    actual === expected,
    description,
    `expected: ${expected}\nactual:   ${actual}`
  )
}

function assertDeepEqual(actual, expected, description) {
  const actualJson = JSON.stringify(actual)
  const expectedJson = JSON.stringify(expected)
  assert(
    actualJson === expectedJson,
    description,
    `expected: ${expectedJson}\nactual:   ${actualJson}`
  )
}

function requireFromRoot(relativePath) {
  return require(path.join(root, relativePath))
}

const fs = require('fs')
const vm = require('vm')
const dir = root
const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'))
const source = fs.readFileSync(path.join(dir, manifest.entryPoints.barWidget), 'utf8')
assertEqual(manifest.omarchy.clonedFrom, 'omarchy.workspaces', 'enabling the example uses the workspace clone replacement contract')
assertEqual(manifest.barWidget.allowMultiple, false, 'example uses one layout entry with instances on each screen')

// Execute the published QML's JavaScript, not a second implementation of its
// mapping. This is logic coverage only; it does not test Qt bindings or rendering.
function functionSource(name, indent = 2) {
  const spaces = ' '.repeat(indent)
  const match = source.match(new RegExp(`^${spaces}function ${name}\\([^)]*\\)(?:: \\w+)? \\{[\\s\\S]*?^${spaces}\\}`, 'm'))
  if (!match) throw new Error(`missing QML function ${name}`)
  return match[0].replace(/: (string|int|bool)\b/g, '')
}

const first = { name: 'HDMI-A-1', activeWorkspace: { id: 2 } }
const second = { name: 'DP-1', activeWorkspace: { id: 11 } }
const Hyprland = {
  monitors: { values: [second, first] },
  workspaces: { values: [] },
  focusedWorkspace: { id: 2 },
  monitorFor: screen => screen.monitor
}
const commands = []
const widgets = []
const bar = { run: command => commands.push(command), moduleWidgets: id => id === manifest.id ? widgets : [] }

function instance(monitor) {
  const settings = { monitorOrder: ['HDMI-A-1', 'DP-1'] }
  const widget = { bar, moduleName: manifest.id, QsWindow: { window: { screen: { monitor } } }, setting: (key, fallback) => settings[key] ?? fallback }
  const context = vm.createContext({ root: widget, Hyprland, Util: { shellQuote: value => JSON.stringify(value) } })
  for (const name of ['hostWindow', 'monitor', 'monitorOrder', 'workspaceCount', 'workspaceOffset', 'activeWorkspaceId']) {
    const expression = source.match(new RegExp(`^  readonly property \\w+ ${name}: (.*)$`, 'm'))[1]
    const get = () => vm.runInContext(expression, context)
    Object.defineProperty(context, name, { get })
    Object.defineProperty(widget, name, { get })
  }
  for (const name of ['monitorIndex', 'workspaceById', 'workspaceIds', 'focusWorkspace']) {
    vm.runInContext(functionSource(name), context)
    widget[name] = context[name]
  }
  widget.selectWorkspace = vm.runInContext(`(${functionSource('selectWorkspace', 4)})`, context)
  widgets.push(widget)
  return widget
}

const left = instance(first)
const right = instance(second)
assertEqual(left.workspaceOffset, 0, 'first configured output owns the first range despite discovery order')
assertEqual(right.workspaceOffset, 10, 'second configured output owns global workspaces 11–20')
assertDeepEqual(right.workspaceIds(), [1, 2, 3, 4, 5], 'empty ranges retain five baseline buttons')
Hyprland.workspaces.values = [
  { id: 19, monitor: second }, { id: 19, monitor: second },
  { id: 18, monitor: first }, { id: 21, monitor: second }, { id: -1, monitor: second }
]
second.activeWorkspace.id = 16
assertDeepEqual(right.workspaceIds(), [1, 2, 3, 4, 5, 6, 9], 'higher existing and active IDs appear once, excluding other monitors and out-of-range IDs')
Hyprland.focusedWorkspace.id = 3
assertEqual(right.activeWorkspaceId, 16, 'changing global focus preserves the external monitor active workspace')
assertEqual(left.activeWorkspaceId, 2, 'external selection preserves the first monitor active workspace')

assertEqual(left.selectWorkspace('DP-1', 4), true, 'IPC on either instance routes selection to the requested screen')
const code = JSON.parse(commands[0].slice('hyprctl eval '.length))
assert(code.indexOf('monitor = "DP-1"') < code.indexOf('workspace = "14"') && code.includes('monitor = "DP-1"') && code.includes('workspace = "14"'), 'bar selection focuses its output before choosing the translated global ID')
assert(code.includes('on_current_monitor = true'), 'selection keeps the workspace on the clicked monitor')
for (const [screen, localId] of [['unknown', 1], ['DP-1', 0], ['DP-1', 11]]) {
  assertEqual(right.selectWorkspace(screen, localId), false, `IPC rejects ${screen} local workspace ${localId}`)
}
assertEqual(commands.length, 1, 'rejected selections do not dispatch compositor commands')

const third = { name: 'USB-C-1', activeWorkspace: { id: 21 } }
Hyprland.monitors.values.push(third)
assertEqual(instance(third).workspaceOffset, 20, 'unlisted outputs follow the reserved explicit ranges')

// Run the documented setup/removal commands against real temporary files.
// nwg-displays 0.4.4 writes the custom path but reopens the canonical path;
// exercise those distinct boundaries without launching GTK or the compositor.
const { spawnSync } = require('child_process')
const readme = fs.readFileSync(path.join(dir, 'README.md'), 'utf8')
function documentedScript(heading) {
  const index = readme.indexOf(heading)
  if (index === -1) throw new Error(`missing documentation section ${heading}`)
  const section = readme.slice(index + heading.length)
  const block = section.match(/```bash\n([\s\S]*?)\n```/)
  if (!block) throw new Error(`missing documented commands for ${heading}`)
  return block[1]
}
const setup = documentedScript('### Bridge nwg-displays workspace readback')
const removal = documentedScript('## Removal')
const temporary = fs.mkdtempSync(path.join(require('os').tmpdir(), 'hyprsplit-readback-'))
try {
  for (const original of ['file', 'symlink', 'absent', 'existing-target']) {
    const home = path.join(temporary, `home with spaces-${original}`)
    const hypr = path.join(home, '.config/hypr')
    fs.mkdirSync(hypr, { recursive: true })
    const canonical = path.join(hypr, 'workspaces.conf')
    const generated = path.join(hypr, 'nwg-workspaces.conf')
    const backup = path.join(hypr, 'workspaces.conf.before-hyprsplit')
    const handwritten = path.join(hypr, 'workspaces.lua')
    const bindings = '-- handwritten bindings, not GUI output\n'
    const initial = 'workspace=1,monitor:HDMI-A-1\n'
    const saved = 'workspace=11,monitor:DP-1\n'
    const edited = 'workspace=12,monitor:DP-1\n'
    fs.writeFileSync(handwritten, bindings)
    if (original === 'symlink') {
      fs.writeFileSync(path.join(hypr, 'original.conf'), initial)
      fs.symlinkSync('original.conf', canonical)
    } else if (original !== 'absent') {
      fs.writeFileSync(canonical, initial)
    }
    if (original === 'existing-target') fs.writeFileSync(generated, saved)
    const run = script => spawnSync('bash', ['-euc', script], { env: { ...process.env, HOME: home }, encoding: 'utf8' })
    if (original === 'file') {
      fs.writeFileSync(backup, 'earlier backup\n')
      assertEqual(run(setup).status, 1, 'setup refuses an existing backup before changing canonical configuration')
      assertEqual(fs.readFileSync(backup, 'utf8'), 'earlier backup\n', 'refused setup preserves the earlier backup')
      assertEqual(fs.readFileSync(canonical, 'utf8'), initial, 'refused setup preserves canonical assignments')
      fs.unlinkSync(backup)
    }
    assertEqual(run(setup).status, 0, `${original}: documented readback setup succeeds`)
    if (original !== 'absent') {
      assertEqual(fs.readFileSync(backup, 'utf8'), initial, `${original}: canonical contents are backed up`)
      assertEqual(fs.readFileSync(canonical, 'utf8'), original === 'existing-target' ? saved : initial, `${original}: setup retains initial or existing dedicated assignments`)
    }
    assertEqual(run(setup).status, 0, `${original}: repeated setup preserves the backup and link`)
    fs.writeFileSync(generated, saved)
    assertEqual(fs.readFileSync(canonical, 'utf8'), saved, `${original}: reopening the canonical path reads the custom-path save`)
    fs.writeFileSync(generated, edited)
    assertEqual(fs.readFileSync(canonical, 'utf8'), edited, `${original}: edit-save-reopen reads the latest assignments`)
    assertEqual(run(removal).status, 0, `${original}: documented removal succeeds`)
    if (original === 'absent') {
      assertEqual(fs.existsSync(canonical), false, 'fresh setup removal leaves no canonical path')
    } else {
      assertEqual(fs.readFileSync(canonical, 'utf8'), initial, `${original}: removal restores original contents`)
      assertEqual(fs.lstatSync(canonical).isSymbolicLink(), original === 'symlink', `${original}: removal restores the original path type`)
    }
    if (original === 'file') {
      assertEqual(run(removal).status, 1, 'removal refuses a canonical file that is not the example link')
      assertEqual(fs.readFileSync(canonical, 'utf8'), initial, 'refused removal preserves the restored canonical file')
    }
    assertEqual(fs.readFileSync(generated, 'utf8'), edited, `${original}: removal retains GUI output`)
    assertEqual(fs.readFileSync(handwritten, 'utf8'), bindings, `${original}: handwritten Lua stays separate`)
  }
} finally {
  fs.rmSync(temporary, { recursive: true, force: true })
}
