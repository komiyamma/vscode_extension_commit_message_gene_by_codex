// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as path from 'path';

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
	// コミットメッセージ欄に安全に設定するヘルパー
	async function setCommitMessage(message: string, output: vscode.OutputChannel) {
	try {
			// SCMビューをアクティブ化
			await vscode.commands.executeCommand('workbench.view.scm');
			// git拡張のAPIを取り出し（存在すれば）
			const gitExt = vscode.extensions.getExtension('vscode.git');
			if (gitExt) {
		const exportsAny = gitExt.isActive ? (gitExt.exports as any) : await gitExt.activate();
		// GitExtension 形式なら getAPI(1) で取得、既にAPIの場合はそのまま利用
		const gitApi = typeof exportsAny?.getAPI === 'function' ? exportsAny.getAPI(1) : exportsAny;
		// 最初のリポジトリのinputBoxがあればそこに設定
		const repos = (gitApi?.repositories ?? []) as any[];
				if (repos.length > 0 && repos[0]?.inputBox) {
					repos[0].inputBox.value = message;
					output.appendLine('[コミットメッセージ欄に転写しました: git API]');
					return;
				}
			}
			// フォールバック: scm.inputBox
			const scmAny = vscode.scm as any;
			if (scmAny && scmAny.inputBox) {
				scmAny.inputBox.value = message;
				output.appendLine('[コミットメッセージ欄に転写しました: scm.inputBox]');
				return;
			}
			output.appendLine('[警告] コミットメッセージ欄にアクセスできませんでした');
		} catch (e: any) {
			output.appendLine(`[エラー] コミットメッセージ設定に失敗: ${e?.message ?? e}`);
		}
	}

	// （削除）起動時の挨拶ログと未使用の HelloWorld コマンド登録を整理しました

	// codex_proxy.exeを直接呼び出し、utf8で標準出力・標準エラーをターミナルに順次出力するコマンド
	const codexDisposable = vscode.commands.registerCommand('commit-mesasge-gene-by-codex.runCodexCmd', async () => {
		const output = vscode.window.createOutputChannel('commit message gene');
		output.show(true);
		const proxyPath = path.join(__dirname, 'codex_proxy.exe');
		const proc = spawn(proxyPath, ['utf8'], { cwd: vscode.workspace.workspaceFolders?.[0].uri.fsPath });
		let buffer = '';
		// マーカー行を出力チャンネルに表示しないためのヘルパー
		const containsMarker = (line: string) => {
			const s = line.replace(/\s/g, '');
			return s.includes('■★■★■') || s.includes('▲★▲★▲');
		};
		let stdoutRemainder = '';
		let stderrRemainder = '';
		proc.stdout.on('data', (data) => {
			const text = data.toString('utf8');
			// 画面表示はマーカー行を隠す
			const combined = stdoutRemainder + text;
			const parts = combined.split(/\r?\n/);
			stdoutRemainder = parts.pop() ?? '';
			for (const line of parts) {
				if (!containsMarker(line)) {
					output.appendLine(line);
				}
			}
			// commit 抽出用には生データを保持
			buffer += text;
		});
		proc.stderr.on('data', (data) => {
			const text = data.toString('utf8');
			const combined = stderrRemainder + text;
			const parts = combined.split(/\r?\n/);
			stderrRemainder = parts.pop() ?? '';
			for (const line of parts) {
				if (!containsMarker(line)) {
					output.appendLine(line);
				}
			}
		});
		proc.on('error', (err) => {
			output.appendLine(`[codex_proxy.exe 実行エラー]: ${err.message}`);
		});
		proc.on('close', async (code) => {
			output.appendLine(`\n[codex_proxy.exe 終了: code ${code}]`);
			// 最終行に改行がなかった場合の残余をフラッシュ（必要なら）
			if (stdoutRemainder && !containsMarker(stdoutRemainder)) {
				output.appendLine(stdoutRemainder);
			}
			if (stderrRemainder && !containsMarker(stderrRemainder)) {
				output.appendLine(stderrRemainder);
			}
			// ■★■★■～▲★▲★▲の間の行を抽出
			const lines = buffer.split(/\r?\n/);
			const isMarker = (line: string, marker: string) => line.replace(/\s/g, '') === marker;
			const start = lines.findIndex(line => isMarker(line, '■★■★■'));
			const end = lines.findIndex(line => isMarker(line, '▲★▲★▲'));
			if (start !== -1 && end !== -1 && end > start + 1) {
				const commitLines = lines.slice(start + 1, end);
				const commitMsg = commitLines.join('\n');
									// コミットメッセージ欄へ設定（git API優先、フォールバックあり）
									await setCommitMessage(commitMsg, output);
				output.appendLine('\n[コミットメッセージをコミット入力欄へ転写しました]');
			}
		});
	});
	context.subscriptions.push(codexDisposable);
}

// This method is called when your extension is deactivated
export function deactivate() { }
