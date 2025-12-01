// src/extension.ts
// Main entry point for the VS Code extension.
// VS Code 拡張機能のメインエントリーポイント。

import * as vscode from 'vscode';
import { activateDefault } from './extension_default';
import { activateMacOS } from './extension_macos';

// Called when the extension is activated.
// 拡張機能が有効化されたときに呼ばれる関数。
export async function activate(context: vscode.ExtensionContext): Promise<void> {

	// If running on macOS, use the macOS-specific activation flow.
	// macOS の場合、macOS 専用の初期化処理を実行。
	if (process.platform === 'darwin') {
		return activateMacOS(context);
	}

	// Otherwise, fallback to the default activation (Windows/Linux).
	// それ以外の OS（Windows / Linux）は通常の初期化処理を実行。
	return activateDefault(context);
}
