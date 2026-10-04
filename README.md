# Per-monitor workspaces with Hyprsplit and nwg-displays

[![CI](https://github.com/Connorbelez/omarchy-hyprsplit-workspaces/actions/workflows/ci.yml/badge.svg)](https://github.com/Connorbelez/omarchy-hyprsplit-workspaces/actions/workflows/ci.yml)

This opt-in example publishes a user-owned clone of `omarchy.workspaces`. Each bar uses its own `QsWindow.screen` to find its Hyprland monitor, labels that monitor's workspace range with local numbers, and highlights `monitor.activeWorkspace` even when another screen has keyboard focus. Clicking a button focuses the bar's monitor before selecting the global workspace ID. Five baseline buttons stay visible; existing or active higher workspaces appear as needed. Local workspace 10 is labelled `0` to match the number-row shortcut.

This community plugin lives outside the shell's first-party plugin directory. Install it into your user plugin directory to opt in. It needs Omarchy's Quickshell bar, Hyprland's Lua configuration API (Hyprland 0.55 or newer), the [Hyprsplit Lua library](https://github.com/shezdy/hyprsplit), and a version of [nwg-displays](https://github.com/nwg-piotr/nwg-displays) that writes paired `.conf` and `.lua` files. The original desktop integration used Hyprland 0.56.2, nwg-displays 0.4.4, and Hyprsplit revision `6b00b677d8905fb38779c91e12d6294e0e586a44`. Hyprsplit is loaded with `dofile`, not as a compiled compositor plugin.

## Choose your monitor ranges

Run `hyprctl monitors all` to find output names. Use explicit names for every participating physical output, in the same order in `hs.monitor_priority(...)` and the widget's `monitorOrder`. Use output names, not monitor descriptions, in both places. Keep disconnected outputs in the list to reserve their ranges.

For example, with `monitorOrder: ["HDMI-A-1", "DP-1"]` and `workspaceCount: 10`, the first output owns global IDs 1–10, and the second owns 11–20. Both bars show local 1–10. Set `num_workspaces` in `workspaces.lua` to the same positive integer as `workspaceCount`, and set the helper's `--num_ws` to the total number of global workspaces you want nwg-displays to offer (20 for this two-output example). If changing the count from ten, adapt the number-key loop too.

The widget defaults to ten workspaces and five baseline buttons, with an empty `monitorOrder`. Unlisted outputs are placed after the explicit list, sorted by name. Configure the explicit list to match Hyprsplit rather than relying on Hyprland's monitor IDs or discovery order; this example's supported setup gives every participating output an explicit slot.

## Install the helpers

Set `example` to this directory in your checkout, then copy the files into your user configuration. Review any existing destination files before replacing them.

```bash
example="$PWD"
data_home="${XDG_DATA_HOME:-$HOME/.local/share}"
mkdir -p "$data_home" "$HOME/.config/hypr" "$HOME/.local/bin" "$HOME/.local/share/applications"
git clone https://github.com/shezdy/hyprsplit.git "$data_home/hyprsplit"
git -C "$data_home/hyprsplit" checkout 6b00b677d8905fb38779c91e12d6294e0e586a44
omarchy pkg add nwg-displays
install -m 644 "$example/hypr/workspaces.lua" "$HOME/.config/hypr/workspaces.lua"
install -m 755 "$example/bin/manage-displays" "$HOME/.local/bin/manage-displays"
install -m 644 "$example/applications/nwg-displays.desktop" "$HOME/.local/share/applications/nwg-displays.desktop"
```

Edit `~/.config/hypr/workspaces.lua` to set your monitor priority. The launcher resolves `manage-displays` through the graphical session's `PATH`, which must include `$HOME/.local/bin` (Omarchy's environment includes it). The helper derives its output paths from `HOME` and forwards additional arguments to nwg-displays.

The helper asks nwg-displays to write these dedicated files:

- `~/.config/hypr/nwg-monitors.conf` and `nwg-monitors.lua` for monitor settings.
- `~/.config/hypr/nwg-workspaces.conf` and `nwg-workspaces.lua` for workspace rules.

### Bridge nwg-displays workspace readback

nwg-displays 0.4.4 reads `~/.config/hypr/workspaces.conf` when opening its workspace panel, even with `--workspaces_path` set to another file. Apply writes the custom path. Before using the GUI, make the canonical `.conf` path a relative symlink to `nwg-workspaces.conf` so reopening reads the assignments you saved.

The following setup preserves any existing canonical file or symlink as `workspaces.conf.before-hyprsplit`. When the dedicated target does not already exist, it also copies any readable canonical contents into that target to retain the initial assignments. It leaves an existing dedicated target intact and refuses to overwrite an existing backup. Running it again with the expected link already in place is harmless.

```bash
(
  set -e
  hypr_dir="$HOME/.config/hypr"
  canonical="$hypr_dir/workspaces.conf"
  generated="$hypr_dir/nwg-workspaces.conf"
  backup="$hypr_dir/workspaces.conf.before-hyprsplit"
  if [[ -L $canonical && $(readlink "$canonical") == "nwg-workspaces.conf" ]]; then
    printf 'Workspace readback link is already configured.\n'
  elif [[ -e $backup || -L $backup ]]; then
    printf 'Existing workspace backup needs review: %s\n' "$backup" >&2
    exit 1
  else
    if [[ -e $canonical && ! -e $generated && ! -L $generated ]]; then
      cp -- "$canonical" "$generated"
    fi
    if [[ -e $canonical || -L $canonical ]]; then
      mv -- "$canonical" "$backup"
    fi
    ln -s -- nwg-workspaces.conf "$canonical"
  fi
)
```

On a fresh setup, the link's target is created by the first workspace save. Keep `--workspaces_path` pointing at `nwg-workspaces.conf`: that is what makes the paired Lua output `nwg-workspaces.lua`. The handwritten `workspaces.lua` remains a separate regular file containing the Hyprsplit bindings; do not link or replace it with generated output.

Run `manage-displays` and save a configuration to create the files before loading them. In its workspace panel, assign global IDs 1–10 to your first output and 11–20 to your second output, with defaults 1 and 11 respectively. Adjust those ranges for your monitor count and workspace count. The GUI and Hyprland use global IDs; the bar and Hyprsplit number shortcuts use local IDs. Keep the GUI's assignments within those ranges.

nwg-displays writes workspace output only when assignments change. If seeded assignments are already correct but `nwg-workspaces.lua` is missing, temporarily change an assignment and Apply, then restore it and Apply again to produce the paired Lua file before loading it.

Append this line to `~/.config/hypr/monitors.lua`, after your fallback monitor settings, retaining your existing scale and environment settings:

```lua
dofile(os.getenv("HOME") .. "/.config/hypr/nwg-monitors.lua")
```

Append this line at the end of `~/.config/hypr/hyprland.lua`, after any overview plugin's configuration and bindings (including Phantomat/spatial-overview):

```lua
require("hypr.workspaces")
```

The module loads the generated workspace rules with `dofile` so subsequent config reloads read the latest GUI output. It unbinds the existing number-row and cycling shortcuts before registering the monitor-local replacements. `Super+1…0` selects a local workspace; `Super+Shift+1…0` moves a window and follows; adding `Alt` moves without following. `Super+Tab` and `Super+Shift+Tab` cycle, `Super+Ctrl+Tab` selects the former workspace on that monitor, and `Super+mouse wheel` cycles. Reload Hyprland after completing the setup.

## Install the widget

Copy the example as a hand-made third-party plugin. The plugin manifest is at the repository root. The manual installation below preserves the module ID used by existing configurations.

```bash
mkdir -p "$HOME/.config/omarchy/plugins"
mkdir -p "$HOME/.config/omarchy/plugins/local.hyprsplit-workspaces"
cp "$example/manifest.json" "$example/Workspaces.qml" "$HOME/.config/omarchy/plugins/local.hyprsplit-workspaces/"
omarchy plugin validate "$HOME/.config/omarchy/plugins/local.hyprsplit-workspaces"
omarchy-shell shell rescanPlugins
omarchy plugin enable local.hyprsplit-workspaces
```

In `~/.config/omarchy/shell.json`, add the three settings to the existing `local.hyprsplit-workspaces` entry, keeping its section and the rest of your layout:

```json
{
  "id": "local.hyprsplit-workspaces",
  "monitorOrder": ["HDMI-A-1", "DP-1"],
  "workspaceCount": 10,
  "minimumVisible": 5
}
```

Replace the example output names with the same names and order configured in Lua, then run `omarchy restart shell`. Direct JSON configuration avoids the tested IPC client's expansion of an array-valued `omarchy bar set ... --json` argument into multiple RPC arguments. `omarchy.clonedFrom: "omarchy.workspaces"` makes enabling this clone replace the built-in workspace entry, preserving its position and settings. The shell creates an instance on each screen from that single layout entry.

## Removal

To return to the built-in widget, run `omarchy plugin remove local.hyprsplit-workspaces`; an active clone's source is restored. To also return to global keyboard shortcuts, remove the final `require("hypr.workspaces")` and reload Hyprland. Generated monitor settings can remain useful independently of the widget.

Keep the readback link while using `manage-displays`. When retiring that GUI integration, remove its launcher and helper, then remove only the expected canonical symlink and restore the original canonical file or symlink from its backup:

```bash
(
  set -e
  hypr_dir="$HOME/.config/hypr"
  canonical="$hypr_dir/workspaces.conf"
  backup="$hypr_dir/workspaces.conf.before-hyprsplit"
  if [[ -L $canonical && $(readlink "$canonical") == "nwg-workspaces.conf" ]]; then
    rm -- "$canonical"
    if [[ -e $backup || -L $backup ]]; then
      mv -- "$backup" "$canonical"
    fi
  else
    printf 'Canonical workspace path is not the example readback link; inspect it before restoring: %s\n' "$canonical" >&2
    exit 1
  fi
)
```

If no canonical path existed before setup, this removes the link without creating a replacement. It retains the dedicated generated files and the handwritten Lua module. Remove generated files only after removing their `dofile` consumers; remove the `nwg-monitors.lua` line from `monitors.lua` too if retiring generated monitor settings. Restore any separately saved handwritten Lua configuration as needed.

## Verify on your desktop

Verify GUI readback before testing the bar:

1. Open `manage-displays`, set workspace assignments within your configured monitor ranges, and Apply. Confirm `nwg-workspaces.conf` and `nwg-workspaces.lua` were written, and that `workspaces.conf` still links to `nwg-workspaces.conf`.
2. Close the workspace panel and the application completely. Reopen from Displays Settings and check that every saved assignment is selected in the workspace panel.
3. Edit an assignment, Apply, close, and reopen again. Confirm the edited assignment survives and both generated files reflect the edit. Restore the intended range assignments, Apply, and reopen once more to confirm them before exercising Hyprsplit.
4. Confirm the handwritten `workspaces.lua` still contains the Hyprsplit setup and shortcuts, rather than generated workspace rules. Check monitor-local keyboard selection after reloading Hyprland.

The example retains the live clone's `debugState` and `selectWorkspace` IPC methods. The target follows the widget's installed module ID, so renaming the plugin does not require a personal IPC target in the QML.

```bash
omarchy-shell local.hyprsplit-workspaces debugState
omarchy-shell local.hyprsplit-workspaces selectWorkspace DP-1 4
omarchy-shell local.hyprsplit-workspaces debugState
```

`debugState` reports every bar instance's screen, offset, active global/local ID, and rendered buttons (`localId`, `globalId`, `active`, `occupied`). `selectWorkspace` routes to the named screen's instance and uses the same action as pressing its button; it returns `false` for an unknown screen or an out-of-range local ID.

Record your original active workspace on each screen and focused monitor before exercising the example. Verify that selecting local 4 on the second output chooses global 14 while the first output's active indicator stays unchanged. Switch focus and select a workspace on the first output; the second bar should keep its own highlight. Select local 6 to check that an active workspace beyond the baseline five appears. Also click the actual buttons on both bars and inspect their spacing, glyphs, and highlights. Restore the original workspaces and focus afterwards.

The original user-owned clone passed real desktop IPC/delegate tests for those transitions and restoration. The generic published example was then installed temporarily on the same M1 desktop with an explicit monitor order: its external local workspace 4 mapped to global 14, both screen instances reported correct active state, and reference/candidate bar captures were visually compared for spacing, glyphs, clipping, and independent highlights. The original shell configuration and workspace views were restored afterwards. Verify your own setup too: automated logic checks do not exercise QML reactivity, real monitor discovery, or rendering.
