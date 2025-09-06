[To English Version README](README.md)

[![Version](https://img.shields.io/badge/version-v0.0.20-4094ff.svg)](https://marketplace.visualstudio.com/items?itemName=komiyamma.commit-mesasge-gene-by-codex)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat)](LICENSE)
![Windows 10|11](https://img.shields.io/badge/Windows-_10_|_11-6479ff.svg?logo=windows&logoColor=white)


# コミットメッセージジェネレーター (by Codex)

この拡張機能は、Windows の小さなヘルパー (codex_proxy.exe) を介してローカルの codex CLI を呼び出し、現在のリポジトリ向けに Conventional Commits 形式のコミットメッセージを生成する軽量な VS Code 拡張機能です。GitHub Copilot が使えない環境や、別のプロバイダーを使いたい場合に便利です。

[English README](./README.md)

## 特長

- コマンド一発で Conventional Commits スタイルのメッセージを生成
- 生成結果を Git のコミット入力欄に自動で書き込み
  - 「Commit message generation command execution」(`commit-mesasge-gene-by-codex.runCodexCmd`)
  - コマンドパレット (Ctrl+Shift+P) で「Commit message generation」と入力して検索できます

## 要件

- 生成後のメッセージは以下に反映されます:
  - ソース管理ビューのコミットメッセージ入力欄に挿入

- ヘルパーは `%APPDATA%\npm\codex.cmd` を探し、`cmd.exe` 経由で実行します。
- `codex.cmd` が上記パスに存在するよう、codex CLI をグローバルにインストールしておいてください。

  codex exec "《prompt》" -m "gpt-5" -c model_reasoning_effort="minimal" -c hide_agent_reasoning="true" --dangerously-bypass-approvals-and-sandbox

- プロンプトは Codex に対し、日本語の最終コミットメッセージのみを出力し、全文を特定のマーカー行で囲むよう要求します。
  - ソース管理ビューを一度開いてから再試行してください。
  - 組み込みの Git 拡張機能が有効か確認してください。
  - 出力パネルの「codex exec output」を確認してエラーがないかチェックしてください。

## 使い方

1. 次のコマンドを実行:
   - 「Commit message generation command execution」(`commit-mesasge-gene-by-codex.runCodexCmd`)
   - コマンドパレット (Ctrl+Shift+P) で「Commit message generation」と入力して検索できます
2. 実行中は出力パネルの「codex exec output」を確認します。
3. 完了すると、生成メッセージはソース管理のコミットメッセージ入力欄に挿入されます。

## 仕組み

- 拡張機能は `utf8` フラグ付きで `codex_proxy.exe`（コンパイル済み拡張の隣に同梱）を起動します。
- ヘルパーは `%APPDATA%\npm\codex.cmd` を見つけて、次のコマンドを実行します:

  codex exec "《prompt》" -m "gpt-5" -c model_reasoning_effort="minimal" -c hide_agent_reasoning="true" --dangerously-bypass-approvals-and-sandbox

- プロンプトは Codex に対し、日本語の最終コミットメッセージのみを出力し、全文を特定のマーカー行で囲むよう要求します。
- 拡張機能は標準出力からマーカー間のテキストを抽出し、Git 拡張 API（フォールバックとして `scm.inputBox`）を通じてコミット入力欄に書き込みます。

## プライバシーとデータ

- この拡張機能自体はコードを外部にアップロードしません。ただし、ローカルの codex CLI は設定に応じて、リポジトリの文脈をバックエンドプロバイダーに送信する場合があります。codex 側のプライバシー・データ取り扱いをご確認ください。

## トラブルシューティング

- 「codex command not found」: `%APPDATA%\npm\codex.cmd` が存在し、実行可能であることを確認してください。codex CLI をグローバル再インストール/更新してください。
- コミット欄に何も出ない:
  - ソース管理ビューを一度開いてから再試行してください。
  - 組み込みの Git 拡張機能が有効か確認してください。
  - 出力パネルの「codex exec output」でエラーを確認してください。


## 開発

- Build: `npm run compile`
- Watch: `npm run watch`
- Lint: `npm run lint`
- テストのスキャフォールドは `@vscode/test-electron` を利用しています。

主要ソース:

- `src/extension.ts` — VS Code のアクティベーションとコマンド登録
- `codex_proxy/` — codex を呼び出す Windows ヘルパー

## ライセンス

MIT License © 2025 komiyamma
