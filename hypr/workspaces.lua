-- Independent workspace keys on each monitor, using the Hyprsplit Lua library.
local data_home = os.getenv("XDG_DATA_HOME") or (os.getenv("HOME") .. "/.local/share")
local hs = dofile(data_home .. "/hyprsplit/init.lua")
hs.config({ num_workspaces = 10, persistent_workspaces = false })
-- Replace these output names with yours, in the same order as the bar's monitorOrder.
hs.monitor_priority({ "HDMI-A-1", "DP-1" })
dofile(os.getenv("HOME") .. "/.config/hypr/nwg-workspaces.lua")

-- These keys previously selected overview canvas places / global workspaces.
-- Unbind before replacing them; load this module after any overview bindings.
for workspace = 1, 10 do
  local key = "code:" .. tostring(workspace + 9)
  hl.unbind("SUPER + " .. key)
  hl.unbind("SUPER + SHIFT + " .. key)
  hl.unbind("SUPER + SHIFT + ALT + " .. key)
  o.bind("SUPER + " .. key, "Workspace " .. workspace .. " on this monitor", hs.dsp.focus({ workspace = workspace }))
  o.bind("SUPER + SHIFT + " .. key, "Move window to workspace " .. workspace .. " on this monitor", hs.dsp.window.move({ workspace = workspace }))
  o.bind("SUPER + SHIFT + ALT + " .. key, "Send window to workspace " .. workspace .. " on this monitor, stay", hs.dsp.window.move({ workspace = workspace, follow = false }))
end

for _, binding in ipairs({
  { "SUPER + TAB", "Next workspace on this monitor", "r+1" },
  { "SUPER + SHIFT + TAB", "Previous workspace on this monitor", "r-1" },
  { "SUPER + CTRL + TAB", "Former workspace on this monitor", "previous_per_monitor" },
  { "SUPER + mouse_down", "Next workspace on this monitor", "r+1" },
  { "SUPER + mouse_up", "Previous workspace on this monitor", "r-1" },
}) do
  hl.unbind(binding[1])
  o.bind(binding[1], binding[2], hs.dsp.focus({ workspace = binding[3] }))
end

return hs
