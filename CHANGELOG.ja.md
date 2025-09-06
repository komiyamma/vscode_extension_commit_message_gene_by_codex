# Change Log

## 0.1.2

- `npm -g`のインストール先が、通常ではないパターンに対応。
- ステージングしている時は、そのステージングしているファイル群のみを対象としたメッセージを作成するようにした。

## 0.1.1

- 日英に対応

## 0.0.20

- バッジのバージョン番号の修正

## 0.0.19

- マーケットプレイスへのリンクミスの修正

## 0.0.18

- VS Code 拡張機能 "commit-message-gene-by-codex" の初回リリース。
- コマンド: "Commit message generation command execution" (`commit-message-gene-by-codex.runCodexCmd`).
- 小さな Windows ヘルパー (`codex_proxy.exe`) を介してローカルの `codex` CLI を呼び出し、Conventional Commits 形式のメッセージを生成。
- 生成メッセージをソース管理のコミット入力欄へ自動挿入し、ワークスペース直下の `.vscode-commit-message.txt` に保存。
- 診断用に "codex exec output" 出力チャンネルを提供。

