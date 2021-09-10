import { window, commands, ExtensionContext } from 'vscode';

import {
  validateSelection,
  askForComponentName,
  createNewComponent,
  updateOriginalComponent,
} from "./utils/splitter";

export const activate = (context: ExtensionContext) => {
  context.subscriptions.push(
    commands.registerCommand(
      "react-native-component-splitter.split",
      async () => {
        try {
          validateSelection();

          const newComponentName = await askForComponentName();
          const newComponent = await createNewComponent(newComponentName);
          await updateOriginalComponent({ newComponent });
        } catch (error) {
          window.showErrorMessage(error.message);
        }
      }
    )
  );
};


// this method is called when your extension is deactivated
export function deactivate() { }
