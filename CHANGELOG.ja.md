# Change Log

## 0.2.1

- メッセージ生成中に再度コマンドが実行された時は、前回のものは破棄されるようになった。

## 0.1.9

- Readme.mdを簡潔にし、一新した

## 0.1.8

- Readme.mdにUI画像を追加

## 0.1.6

- ソース管理ビューに起動ボタンを追加（コミット入力欄ツールバー／「ソース管理」タイトルバー）
- ドキュメント更新: ボタン位置とステータスバースピナーの説明を追加（英日READMEを整合）
- マニフェスト／メニュー調整: コマンドアイコン、activationEvents、スキーマ修正

## 0.1.4

- コマンドパレットでのコマンド名を「Commit message generation by codex」に変更し、より明確にしました。

## 0.1.3

- 表示言語が英語の場合に、コミットメッセージに不備が発生しやすいので修正。

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

