import { createDefaultDeedGraph } from "../../data/item-deed.mjs";
import { GraphEditor } from "../../components/graph-editor/graph-editor.mjs";
import { GraphPropertiesPanel } from "../../components/graph-editor/graph-properties-panel.mjs";

/**
 * Mounts or re-mounts the GraphEditor and GraphPropertiesPanel on a deed sheet.
 * @param {object} sheet - TrespasserDeedSheet instance
 * @param {HTMLElement} graphContainer
 * @param {HTMLElement} propertiesContainer
 */
export function mountGraphEditor(sheet, graphContainer, propertiesContainer) {
  if (sheet.propertiesPanel) {
    sheet.propertiesPanel.destroy();
    sheet.propertiesPanel = null;
  }
  if (sheet.graphEditor) {
    sheet._graphViewportState = sheet.graphEditor.getViewportState();
    sheet.graphEditor.destroy();
  }

  const savedState = sheet._graphViewportState || sheet.document.getFlag("trespasser", "graphViewport");

  sheet.graphEditor = new GraphEditor(graphContainer, {
    readOnly: !sheet.isEditable,
    panX: savedState?.panX ?? 40,
    panY: savedState?.panY ?? 40,
    zoom: savedState?.zoom ?? 1.0,
    selectedNodeId: savedState?.selectedNodeId ?? null,
    onGraphChange: async (graphData) => {
      if (sheet.graphEditor) {
        sheet._graphViewportState = sheet.graphEditor.getViewportState();
      }
      await sheet.document.update({
        "system.graph": graphData,
        "system.graphVersion": 1,
        "flags.trespasser.graphViewport": sheet._graphViewportState
      });
    },
    onViewportChange: (viewportState) => {
      sheet._graphViewportState = viewportState;
    },
    onNodeSelect: (nodeData) => {
      if (sheet.graphEditor) {
        sheet._graphViewportState = sheet.graphEditor.getViewportState();
      }
      sheet.propertiesPanel?.setNode(nodeData?.id ?? null);
    }
  });

  sheet.propertiesPanel = new GraphPropertiesPanel(propertiesContainer, {
    sheet: sheet,
    editor: sheet.graphEditor,
    readOnly: !sheet.isEditable
  });

  let nodes = sheet.document.system.graph?.nodes || [];
  let connections = sheet.document.system.graph?.connections || [];
  if (nodes.length === 0 && sheet.isEditable) {
    const defaultGraph = createDefaultDeedGraph();
    sheet.document.update({ "system.graph": defaultGraph }).catch(err => {
      console.error("Trespasser | Failed to initialize default deed graph:", err);
    });
    nodes = defaultGraph.nodes;
    connections = defaultGraph.connections;
  }
  sheet.graphEditor.setGraph(nodes, connections);

  if (savedState?.selectedNodeId) {
    sheet.graphEditor.selectNode(savedState.selectedNodeId);
  }
}

/**
 * Unmounts active graph editor components when inactive.
 * @param {object} sheet - TrespasserDeedSheet instance
 */
export function unmountGraphEditor(sheet) {
  if (sheet.propertiesPanel) {
    sheet.propertiesPanel.destroy();
    sheet.propertiesPanel = null;
  }
  if (sheet.graphEditor) {
    sheet._graphViewportState = sheet.graphEditor.getViewportState();
    sheet.graphEditor.destroy();
    sheet.graphEditor = null;
  }
}
