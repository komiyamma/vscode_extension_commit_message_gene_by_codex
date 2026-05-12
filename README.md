[Japanese README](README.ja.md)

[![Version](https://img.shields.io/badge/version-v0.3.31-4094ff.svg)](https://marketplace.visualstudio.com/items?itemName=komiyamma.commit-message-gene-by-codex)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat)](LICENSE)
![Windows 10|11](https://img.shields.io/badge/Windows-_10_|_11-6479ff.svg?logo=windows&logoColor=white)
![macOS](https://img.shields.io/badge/macOS-10.15%2B-6479ff.svg?logo=apple&logoColor=white)
![Linux](https://img.shields.io/badge/Linux-64%2B-6479ff.svg?logo=linux&logoColor=white)

# Commit Message Generator (by Codex)

VS Code extension that automatically generates a Conventional Commits-style commit message from your repository changes and inserts it into the Source Control input box.  
It can be used in any environment where Codex runs.  
It is also intended for use when GitHub Copilot is unavailable, or when using VSCodium-family editors such as Antigravity and AWS Kiro.

On macOS and Linux, Codex CLI 0.130.0 or later is required. That version was released on 2026-05-08. On Windows, there is no Codex CLI version constraint. In all cases, you must also be logged in to Codex.

## Usage

- From the UI (recommended)
  - A button is added to the Source Control view title bar and near the commit input box. Click it to run “Commit message generation by codex.”
  - It appears when the Git provider is active.  
  [![Commit Input Box Button](images/button.png)](images/button.png)
  - While generating, the status bar shows “$(sync~spin) Generating commit message…” and it disappears automatically when finished.  
  [![Commit StatusBar](images/statusbar.png)](images/statusbar.png)
- From the Command Palette
  - Press `Ctrl+Shift+P` and type “Commit message generation by codex”.
  - Or run “Commit message generation by codex” (`commit-message-gene-by-codex.runCodexCmd`) directly.
  - When finished, the generated message is inserted into the commit input box. You can check the execution log in the Output panel “codex exec output”.

## Requirements

- macOS / Linux: Codex CLI 0.130.0 or later is installed, and you are logged in to Codex
- macOS / Linux: Codex CLI 0.130.0 was released on 2026-05-08
- Windows: there is no Codex CLI version requirement, and you are logged in to Codex
- Windows 10/11: Codex CLI is installed globally and executable
- All OSes: VS Code's Git extension is enabled
- All OSes: the Source Control (SCM) view is open
- All OSes: you are logged in to Codex

## Notes

- Privacy: The extension itself does not send your code externally, but the Codex CLI may send repository context to its provider depending on its settings. Please review Codex’s policies.

## License

MIT License © 2025-2026 komiyamma

