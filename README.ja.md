[English README](README.md)

[![Version](https://img.shields.io/badge/version-v0.5.2-4094ff.svg)](https://marketplace.visualstudio.com/items?itemName=komiyamma.commit-message-gene-by-codex)
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
| UI から（推奨） | ソース管理ビューのタイトルバー、またはコミット入力欄の近くにあるボタンをクリック | 「Codexでコミットメッセージを生成」を実行 |
| コマンドパレットから | `Ctrl+Shift+P` → 「Codexでコミットメッセージを生成」と入力 | コマンドを実行し、生成メッセージをコミット入力欄に挿入 |
| 直接コマンド実行 | `commit-message-gene-by-codex.runCodexCmd` を実行 | 同じコマンドを直接実行 |

UI ボタンは Git プロバイダーが有効な場合に表示されます。  
[![Commit Input Box Button](images/button.png)](images/button.png)

Codex が Git の変更を分析し、`feat`、`fix`、`docs`、`refactor` などから最も適切な Conventional Commit 種別を自動で選択します。生成されるタイトルは `type(scope): subject` 形式（例: `feat(extension): add template loading`）になります。

設定画面で英語・日本語・韓国語の固定テンプレートを読み込み、本文を編集できます。読み込むと現在の本文を置き換え、選択欄は元に戻ります。

生成中はステータスバーに「$(sync~spin) コミットメッセージを生成中…」が表示され、完了時に自動で消えます。  
[![Commit StatusBar](images/statusbar.png)](images/statusbar.png)

実行ログは出力パネル「commit message gene」で確認できます。

## 要件

| 要件 | Windows | macOS | Linux |
| --- | --- | --- | --- |
| Codex CLI | 特定のバージョン要件なし | 0.130.0 以上 | 0.130.0 以上 |
| Codex ログイン | 必須 | 必須 | 必須 |
| VS Code の Git 拡張 | 有効 | 有効 | 有効 |
| Source Control (SCM) ビュー | 開いている | 開いている | 開いている |

## 設定

VS Codeの設定を開き、`@ext:komiyamma.commit-message-gene-by-codex` で検索してください。

| 設定 | 動作 |
| --- | --- |
| `Model` | **GPT-5.6 Luna**（初期値）または **Codexの既定モデル** を選択します。選択モデルが利用できない場合はCodexの既定モデルで再試行します。変更時は自動的に再接続します。 |
| `Message Mode` | `summary`（初期値）はタイトル1行、`detailed` はタイトルと変更内容の箇条書き2～6件を生成します。 |
| `Prompt: Load Template` | 英語・日本語・韓国語の固定テンプレートで、現在の本文を置き換えます。 |
| `Prompt: Text` | 生成に使う指示文を自由に編集できます。初期状態から標準本文が表示されます。 |

モデルとプロンプトは、全ワークスペース共通の**ユーザー設定**です。ワークスペース設定では上書きできません。`Message Mode` はワークスペースごとに設定できます。

### プロンプトの編集と標準への復帰

1. `Prompt: Text` の本文を直接編集します。変更は自動保存され、次回の生成に使われます。
2. 標準の本文に戻したいときや言語を切り替えたいときは、`Prompt: Load Template` で「英語テンプレートをロード」「日本語テンプレートをロード」「韓国語テンプレートをロード」のいずれかを選びます。
3. 本文が置き換わり、選択欄は「選択してください」に戻ります。同じテンプレートを繰り返し読み込めます。

**テンプレートを読み込むと、現在の本文の編集内容は置き換わります。** 組み込みテンプレート自体は固定で、本文を編集しても変わりません。初期本文はVS Codeの表示言語に従い、日本語・韓国語以外では英語になります。

### 0.4系からの移行

旧 `commitMessageGene.prompt.intro.en/ja` は拡張機能内にバックアップしてから削除し、現在のUI言語の有効な旧本文を `Prompt: Text` に引き継ぎます。既存の `Prompt: Text` は上書きしません。ほかの言語やフォルダ固有の旧本文はバックアップに保持されます。

## その他

- プライバシー: 拡張自体はコードを外部送信しませんが、codex CLI は設定によりリポジトリの文脈をプロバイダーへ送信する場合があります。codex 側のポリシーをご確認ください。

## ライセンス

MIT License © 2025-2026 komiyamma
