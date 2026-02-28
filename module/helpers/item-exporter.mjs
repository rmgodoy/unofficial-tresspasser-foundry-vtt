/**
 * Helper class for exporting and importing items and folders.
 */
export class ItemExporter {
  /**
   * Export all items and folders to a single JSON file.
   */
  static async exportAll() {
    const folders = game.folders.filter(f => f.type === "Item").map(f => f.toObject());
    const items = game.items.map(i => i.toObject());

    const data = {
      system: game.system.id,
      version: game.system.version,
      folders: folders,
      items: items
    };

    const filename = `trespasser-items-export-${new Date().toISOString().split('T')[0]}.json`;
    saveDataToFile(JSON.stringify(data, null, 2), "text/json", filename);
  }

  /**
   * Import items and folders from a JSON file.
   */
  static async importData() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";

    input.onchange = async (event) => {
      const file = event.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (e) => {
        try {
          const data = JSON.parse(e.target.result);
          if (data.system !== game.system.id) {
            ui.notifications.warn("This export belongs to a different system.");
            return;
          }

          ui.notifications.info("Importing items and folders...");
          await this._processImport(data);
          ui.notifications.info("Import complete.");
        } catch (err) {
          console.error(err);
          ui.notifications.error("Failed to parse the JSON file.");
        }
      };
      reader.readAsText(file);
    };

    input.click();
  }

  /**
   * Process the imported data.
   * @private
   */
  static async _processImport(data) {
    const folders = data.folders || [];
    const items = data.items || [];

    // Map old folder IDs to new folder IDs if they change,
    // but we'll try to keep them if possible.
    const folderMapping = {};

    // 1. Create folders
    // We sort them by depth or just loop until all are created to handle parents.
    let remainingFolders = [...folders];
    let iterations = 0;
    while (remainingFolders.length > 0 && iterations < 10) {
      const nextBatch = [];
      const toCreate = [];

      for (const f of remainingFolders) {
        if (!f.folder || folderMapping[f.folder] || game.folders.has(f.folder)) {
          toCreate.push(f);
        } else {
          nextBatch.push(f);
        }
      }

      for (const fData of toCreate) {
        let folder = game.folders.get(fData._id);
        if (!folder) {
          folder = await Folder.create(fData, { keepId: true });
        } else {
          await folder.update(fData);
        }
        folderMapping[fData._id] = folder.id;
      }

      remainingFolders = nextBatch;
      iterations++;
    }

    // 2. Create items
    for (const iData of items) {
      let item = game.items.get(iData._id);
      if (item) {
        await item.update(iData);
      } else {
        await Item.create(iData, { keepId: true });
      }
    }
  }
}
