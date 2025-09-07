[English README](README.md)

[![Version](https://img.shields.io/badge/version-v0.1.9-4094ff.svg)](https://marketplace.visualstudio.com/items?itemName=komiyamma.commit-message-gene-by-codex)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat)](LICENSE)
![Windows 10|11](https://img.shields.io/badge/Windows-_10_|_11-6479ff.svg?logo=windows&logoColor=white)

# コミットメッセージジェネレーター (by Codex)

リポジトリの変更から Conventional Commits 形式のコミットメッセージを自動生成して、ソース管理の入力欄へ挿入する VS Code 拡張です。  
codexが動作する環境であれば、利用可能です。  
GitHub Copilot が使えない環境でも手軽に使えます。

## 使い方

- UI から（推奨）
  - ソース管理ビューのタイトルバーとコミット入力欄の近くにボタンが追加されます。クリックで「Commit message generation by codex」を実行します。
  - Git プロバイダーが有効な場合に表示されます。  
  [![Commit Input Box Button](images/button.png)](images/button.png)
  - 生成中はステータスバーに「$(sync~spin) コミットメッセージを生成中…」が表示され、完了時に自動で消えます。  
  [![Commit StatusBar](images/statusbar.png)](images/statusbar.png)
- コマンドパレットから
  - `Ctrl+Shift+P` → 「Commit message generation by codex」と入力
  - あるいは「Commit message generation by codex」(`commit-message-gene-by-codex.runCodexCmd`) を直接実行
  - 完了すると、生成メッセージはコミット入力欄に挿入されます。実行ログは出力パネル「codex exec output」で確認できます。

## 要件

- Windows 10/11 + VS Code の Git 拡張が有効であること
- ソース管理ビュー（SCM）を開いていること
- codex CLI をグローバルにインストールしてあり、`%APPDATA%\npm\codex.cmd` から実行できること  （ヘルパーはこの場所を探し `cmd.exe` 経由で起動します）

## その他

- プライバシー: 拡張自体はコードを外部送信しませんが、codex CLI は設定によりリポジトリの文脈をプロバイダーへ送信する場合があります。codex 側のポリシーをご確認ください。

## ライセンス

MIT License © 2025 komiyamma
