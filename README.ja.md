[English README](README.md)

[![Version](https://img.shields.io/badge/version-v0.5.1-4094ff.svg)](https://marketplace.visualstudio.com/items?itemName=komiyamma.commit-message-gene-by-codex)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat)](LICENSE)
![Windows 10｜11](https://img.shields.io/badge/Windows-10%20%7C%2011-5865F2?logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI%2BPHBhdGggZmlsbD0iI2ZmZiIgZD0iTTAgMWgxMHYxMEgweiBNMTMgMWgxMHYxMEgxM3ogTTAgMTNoMTB2MTBIMHogTTEzIDEzaDEwdjEwSDEzeiIvPjwvc3ZnPg%3D%3D)
![macOS](https://img.shields.io/badge/macOS-OK-6479ff.svg?logo=apple&logoColor=white)
![Linux](https://img.shields.io/badge/Linux-OK-6479ff.svg?logo=linux&logoColor=white)

# コミットメッセージジェネレーター (by Codex)

リポジトリの変更から Conventional Commits 形式のコミットメッセージを自動生成して、ソース管理の入力欄へ挿入する VSCode 拡張です。  
Codex が動作する環境で利用できます。  
GitHub Copilot が使えない場合や、Antigravity や AWS Kiro などの VSCodium 系エディタで使う用途も想定しています。

主なプラットフォーム要件は次のとおりです。

| プラットフォーム | Codex CLI 要件 | その他の要件 |
| --- | --- | --- |
| Windows | 特定のバージョン要件なし | Codex にログイン済み |
| macOS | Codex CLI 0.130.0 以上 | Codex にログイン済み |
| Linux | Codex CLI 0.130.0 以上 | Codex にログイン済み |

## 使い方

| 方法 | 実行方法 | 結果 |
| --- | --- | --- |
| UI から（推奨） | ソース管理ビューのタイトルバー、またはコミット入力欄の近くにあるボタンをクリック | 「Commit message generation by codex」を実行 |
| コマンドパレットから | `Ctrl+Shift+P` → 「Commit message generation by codex」と入力 | コマンドを実行し、生成メッセージをコミット入力欄に挿入 |
| 直接コマンド実行 | `commit-message-gene-by-codex.runCodexCmd` を実行 | 同じコマンドを直接実行 |

UI ボタンは Git プロバイダーが有効な場合に表示されます。  
[![Commit Input Box Button](images/button.png)](images/button.png)

Codex が Git の変更を分析し、`feat`、`fix`、`docs`、`refactor` などから最も適切な Conventional Commit 種別を自動で選択します。生成されるタイトルは `type(scope): subject` 形式（例: `feat(extension): add prompt profiles`）になります。

ソース管理タイトルバーまたはコマンドパレットの **Commit Message Gene: Select Prompt Profile** で、英語・日本語・韓国語の基本プロファイルを選択できます。**Commit Message Gene: Manage Prompt Profiles** では、カスタムプロファイルを追加・編集・削除できます。

生成中はステータスバーに「$(sync~spin) コミットメッセージを生成中…」が表示され、完了時に自動で消えます。  
[![Commit StatusBar](images/statusbar.png)](images/statusbar.png)

実行ログは出力パネル「codex exec output」で確認できます。

## 要件

| 要件 | Windows | macOS | Linux |
| --- | --- | --- | --- |
| Codex CLI | 特定のバージョン要件なし | 0.130.0 以上 | 0.130.0 以上 |
| Codex ログイン | 必須 | 必須 | 必須 |
| VS Code の Git 拡張 | 有効 | 有効 | 有効 |
| Source Control (SCM) ビュー | 開いている | 開いている | 開いている |

## 設定

- `Commit Message Gene by Codex: Model`: **GPT-5.6 Luna**（初期値）と **Codexの既定モデル** から選択します。全ワークスペース共通のユーザー設定です。Lunaを選択した場合はまずLunaを使用し、モデルが利用できない場合はCodex側の既定モデルで再試行します。「Codexの既定モデル」を選択した場合は最初からモデルを指定せず、Codex側の設定に従います。変更時は自動的に再接続します。
- `Commit Message Gene by Codex: Message Mode`: `summary` はタイトルのみ、`detailed` はタイトルに続けて具体的なコード・動作変更を示す 2～6 件の箇条書きを生成します。
- `Commit Message Gene by Codex: Prompt Profile`: 英語・日本語・韓国語、または保存済みカスタムプロファイルを読み込みます。
- `Commit Message Gene by Codex: Prompt Text`: 有効なプロンプトを自由に編集する単一の複数行テキストエリアです。プロファイルコマンドでカスタムプロファイルの読み込み、保存、編集、削除を行えます。

## その他

- プライバシー: 拡張自体はコードを外部送信しませんが、codex CLI は設定によりリポジトリの文脈をプロバイダーへ送信する場合があります。codex 側のポリシーをご確認ください。

## ライセンス

MIT License © 2025-2026 komiyamma

### 旧プロンプト設定の移行

起動時に旧 `commitMessageGene.prompt.intro.en/ja` の明示的な設定をカスタムプロファイルへ保存し、保存成功後に旧設定を削除します。以降の生成は新しいプロファイルと Prompt Text のみを参照します。既存の新設定は上書きしません。フォルダ固有の旧設定もプロファイルとして保存され、選択コマンドから利用できます。Prompt Profile の `auto` はUI言語に従う指定です（モデル選択とは別の設定です）。Prompt Text が空でなければ、その内容を優先します。選択コマンドで編集用に読み込み、管理コマンドで保存してください。
