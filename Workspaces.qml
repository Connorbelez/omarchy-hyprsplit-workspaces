import QtQuick
import QtQuick.Layouts
import Quickshell
import Quickshell.Hyprland
import Quickshell.Io
import qs.Commons
import qs.Ui

BarWidget {
  id: root
  moduleName: "local.hyprsplit-workspaces"

  // Each bar surface owns a monitor. Hyprsplit reserves a range of global
  // workspace IDs per monitor, while keyboard shortcuts and labels use local numbers.
  readonly property var hostWindow: root.QsWindow.window
  readonly property var monitor: hostWindow && hostWindow.screen ? Hyprland.monitorFor(hostWindow.screen) : null
  readonly property var monitorOrder: root.setting("monitorOrder", [])
  readonly property int workspaceCount: Math.max(1, Number(root.setting("workspaceCount", 10)))
  readonly property int workspaceOffset: monitorIndex() * workspaceCount
  readonly property int activeWorkspaceId: monitor && monitor.activeWorkspace ? monitor.activeWorkspace.id : -1
  readonly property var displayedWorkspaceIds: workspaceIds()

  function monitorIndex() {
    if (!monitor) return 0
    var index = monitorOrder.indexOf(monitor.name)
    if (index !== -1) return index
    var unmapped = Hyprland.monitors.values.filter(function(item) {
      return monitorOrder.indexOf(item.name) === -1
    }).map(function(item) { return item.name }).sort()
    return monitorOrder.length + Math.max(0, unmapped.indexOf(monitor.name))
  }

  function workspaceById(id) {
    var values = Hyprland.workspaces.values
    for (var i = 0; i < values.length; i++) {
      if (values[i].id === id) return values[i]
    }

    return null
  }

  function workspaceIds() {
    var ids = []
    var minimumVisible = Math.min(workspaceCount, Math.max(1, Number(root.setting("minimumVisible", 5))))
    for (var localId = 1; localId <= minimumVisible; localId++) ids.push(localId)
    var values = Hyprland.workspaces.values

    for (var i = 0; i < values.length; i++) {
      var id = values[i].id - workspaceOffset
      if (id > 0 && id <= workspaceCount && values[i].monitor === monitor && ids.indexOf(id) === -1) ids.push(id)
    }

    var activeId = activeWorkspaceId - workspaceOffset
    if (activeId > 0 && activeId <= workspaceCount && ids.indexOf(activeId) === -1) ids.push(activeId)

    ids.sort(function(left, right) { return left - right })
    return ids
  }

  function focusWorkspace(localId) {
    if (!root.bar || !monitor || localId < 1 || localId > workspaceCount) return
    var id = workspaceOffset + localId
    var code = "hl.dispatch(hl.dsp.focus({ monitor = " + JSON.stringify(monitor.name) + " })); " +
      "hl.dispatch(hl.dsp.focus({ workspace = \"" + id + "\", on_current_monitor = true }))"
    root.bar.run("hyprctl eval " + Util.shellQuote(code))
  }

  function debugState() {
    var buttons = []
    for (var i = 0; i < workspaceButtons.count; i++) {
      var button = workspaceButtons.itemAt(i)
      if (button) buttons.push({ localId: button.modelData, globalId: button.workspaceId, active: button.focused, occupied: button.occupied })
    }
    return { screen: monitor ? monitor.name : "", offset: workspaceOffset, activeGlobal: activeWorkspaceId,
      activeLocal: activeWorkspaceId - workspaceOffset, buttons: buttons }
  }

  IpcHandler {
    target: root.moduleName

    function debugState(): string {
      var items = root.bar ? root.bar.moduleWidgets(root.moduleName) : [root]
      return JSON.stringify(items.filter(function(item) { return typeof item.debugState === "function" }).map(function(item) { return item.debugState() }))
    }

    function selectWorkspace(screenName: string, localId: int): bool {
      var items = root.bar ? root.bar.moduleWidgets(root.moduleName) : [root]
      for (var i = 0; i < items.length; i++) {
        if (items[i].monitor && items[i].monitor.name === screenName && localId >= 1 && localId <= items[i].workspaceCount) {
          items[i].focusWorkspace(localId)
          return true
        }
      }
      return false
    }
  }

  readonly property real trailingGap: root.vertical ? 0 : Style.spaceReal(1.5)

  implicitWidth: grid.implicitWidth + trailingGap
  implicitHeight: grid.implicitHeight

  GridLayout {
    id: grid
    anchors.fill: parent
    anchors.rightMargin: root.trailingGap
    columns: root.vertical ? 1 : root.displayedWorkspaceIds.length
    columnSpacing: root.vertical ? 0 : Style.space(1)
    rowSpacing: root.vertical ? Style.space(2) : 0

    Repeater {
      id: workspaceButtons
      model: root.displayedWorkspaceIds

      WidgetButton {
        required property int modelData

        readonly property int workspaceId: root.workspaceOffset + modelData
        readonly property var workspace: root.workspaceById(workspaceId)
        readonly property bool occupied: workspace !== null && workspace.toplevels.values.length > 0
        readonly property bool focused: root.activeWorkspaceId === workspaceId

        bar: root.bar
        text: focused ? "\uDB85\uDCFB" : (modelData === 10 ? "0" : String(modelData))
        opacity: occupied || focused ? 1 : 0.5
        horizontalMargin: 6
        verticalPadding: 6
        fixedWidth: root.vertical ? root.barSize : Style.space(20)
        fixedHeight: root.barSize
        onPressed: function() { root.focusWorkspace(modelData) }
      }
    }
  }
}
