// src/extension.ts

import * as vscode from 'vscode';
import { activateDefault } from './extension_default';
import { activateMacOS } from './extension_macos';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
	if (process.platform === 'darwin') {
		return activateMacOS(context);
	}

	return activateDefault(context);
}
