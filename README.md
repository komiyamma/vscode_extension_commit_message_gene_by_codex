[Japanese README](README.ja.md)

[![Version](https://img.shields.io/badge/version-v0.5.2-4094ff.svg)](https://marketplace.visualstudio.com/items?itemName=komiyamma.commit-message-gene-by-codex)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat)](LICENSE)
![Windows 10｜11](https://img.shields.io/badge/Windows-10%20%7C%2011-5865F2?logo=data%3Aimage%2Fsvg%2Bxml%3Bbase64%2CPHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI%2BPHBhdGggZmlsbD0iI2ZmZiIgZD0iTTAgMWgxMHYxMEgweiBNMTMgMWgxMHYxMEgxM3ogTTAgMTNoMTB2MTBIMHogTTEzIDEzaDEwdjEwSDEzeiIvPjwvc3ZnPg%3D%3D)

![macOS](https://img.shields.io/badge/macOS-OK-6479ff.svg?logo=apple&logoColor=white)
![Linux](https://img.shields.io/badge/Linux-OK-6479ff.svg?logo=linux&logoColor=white)

# Commit Message Generator (by Codex)

VS Code extension that automatically generates a Conventional Commits-style commit message from your repository changes and inserts it into the Source Control input box.  
It can be used in any environment where Codex runs.  
It is also intended for use when GitHub Copilot is unavailable, or when using VSCodium-family editors such as Antigravity and AWS Kiro.

The main platform requirements are:

| Platform | Codex CLI requirement | Other requirement |
| --- | --- | --- |
| Windows | No specific version requirement | Logged in to Codex |
| macOS | Codex CLI 0.130.0 or later | Logged in to Codex |
| Linux | Codex CLI 0.130.0 or later | Logged in to Codex |

## Usage

| Method | How to run | Result |
| --- | --- | --- |
| UI (recommended) | Click the button in the Source Control view title bar or near the commit input box. | Runs “Commit message generation by codex.” |
| Command Palette | Press `Ctrl+Shift+P` and type “Commit message generation by codex”. | Runs the command and inserts the generated message into the commit input box. |
| Direct command | Run `commit-message-gene-by-codex.runCodexCmd`. | Runs the same command directly. |

The UI button appears when the Git provider is active.  
[![Commit Input Box Button](images/button.png)](images/button.png)

Codex analyzes the Git changes and chooses the most appropriate Conventional Commit type, such as `feat`, `fix`, `docs`, or `refactor`. The generated summary follows the `type(scope): subject` format—for example, `feat(extension): add template loading`.

Load fixed English, Japanese, or Korean templates in Settings. Loading replaces the current text and resets the selector.

While generating, the status bar shows “$(sync~spin) Generating commit message…” and it disappears automatically when finished.  
[![Commit StatusBar](images/statusbar.png)](images/statusbar.png)

You can check the execution log in the Output panel “commit message gene”.

## Requirements

| Requirement | Windows | macOS | Linux |
| --- | --- | --- | --- |
| Codex CLI | No specific version requirement | 0.130.0 or later | 0.130.0 or later |
| Codex login | Required | Required | Required |
| VS Code Git extension | Enabled | Enabled | Enabled |
| Source Control (SCM) view | Open | Open | Open |

## Settings

Open VS Code Settings and search for `@ext:komiyamma.commit-message-gene-by-codex`.

| Setting | Behavior |
| --- | --- |
| `Model` | Choose **GPT-5.6 Luna** (default) or **Codex default**. If the selected model is unavailable, retry with the model configured in Codex. Changes reconnect automatically. |
| `Message Mode` | `summary` (default) generates a one-line title; `detailed` adds 2–6 bullets describing concrete changes. |
| `Prompt: Load Template` | Replace the current text with a fixed English, Japanese, or Korean template. |
| `Prompt: Text` | Edit the instructions used for generation. The standard text is already populated initially. |

Model and prompt settings are **User Settings** shared across all workspaces; workspace settings cannot override them. `Message Mode` can be configured per workspace.

### Editing and restoring the prompt

1. Edit `Prompt: Text` directly. Changes are saved automatically and used for the next generation.
2. To restore standard text or switch languages, select **Load English template**, **Load Japanese template**, or **Load Korean template** under `Prompt: Load Template`.
3. The text is replaced and the selector returns to **Select a template**. You can load the same template again at any time.

**Loading a template replaces your current edits.** The built-in templates are fixed; editing the text does not modify them. The initial text follows the VS Code UI language: Japanese, Korean, or English for all other languages.

### Upgrading from 0.4.x

Legacy `commitMessageGene.prompt.intro.en/ja` settings are backed up in extension storage before removal. The effective legacy text for the current UI language is migrated to `Prompt: Text`; existing `Prompt: Text` is preserved. Other language and folder-specific legacy text remains in the backup.

## Notes

- Privacy: The extension itself does not send your code externally, but the Codex CLI may send repository context to its provider depending on its settings. Please review Codex’s policies.

## License

MIT License © 2025-2026 komiyamma
