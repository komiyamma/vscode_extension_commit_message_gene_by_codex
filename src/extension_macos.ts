// src/extension_macos.ts

import * as vscode from 'vscode';
import { promisify } from 'util';
import * as child_process from 'child_process';
import { activateDefault } from './extension_default';

const execFileAsync = promisify(child_process.execFile);

export async function activateMacOS(context: vscode.ExtensionContext): Promise<void> {
	const output = vscode.window.createOutputChannel('commit message gene (macOS)');
	context.subscriptions.push(output);

	output.appendLine('[macOS] macOS platform detected — applying macOS adapter.');

	try {
		await ensurePathForMacOS(output);
		await ensureGitAvailable(output);
		output.appendLine('[macOS] macOS environment ready.');
	} catch (err) {
		const m = err instanceof Error ? err.message : String(err);
		vscode.window.showErrorMessage('[macOS] Initialization failed: ' + m);
		output.appendLine('[macOS] Initialization failed: ' + m);
	}

	return activateDefault(context);
}

async function ensurePathForMacOS(output: vscode.OutputChannel) {
	const current = process.env.PATH ?? '';

	const macPaths = [
		'/opt/homebrew/bin',
		'/usr/local/bin',
		'/usr/bin',
		'/bin',
		current,
	];

	process.env.PATH = macPaths.filter(Boolean).join(':');
	output.appendLine('[macOS] PATH patched.');
}

async function ensureGitAvailable(output: vscode.OutputChannel) {
	try {
		const { stdout } = await execFileAsync('git', ['--version']);
		output.appendLine('[macOS] git detected: ' + stdout.trim());
	} catch {
		output.appendLine('[macOS] ERROR: git not found.');
		vscode.window.showErrorMessage('Install XCode Tools: xcode-select --install');
		throw new Error('git unavailable');
	}
}
