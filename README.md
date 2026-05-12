[Japanese README](README.ja.md)

[![Version](https://img.shields.io/badge/version-v0.4.5-4094ff.svg)](https://marketplace.visualstudio.com/items?itemName=komiyamma.commit-message-gene-by-codex)
[![MIT License](https://img.shields.io/badge/license-MIT-blue.svg?style=flat)](LICENSE)
![Windows 10|11](https://img.shields.io/badge/Windows-_10_|_11-6479ff.svg?logo=microsoft&logoColor=white)
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

While generating, the status bar shows “$(sync~spin) Generating commit message…” and it disappears automatically when finished.  
[![Commit StatusBar](images/statusbar.png)](images/statusbar.png)

You can check the execution log in the Output panel “codex exec output”.

## Requirements

| Requirement | Windows | macOS | Linux |
| --- | --- | --- | --- |
| Codex CLI | No specific version requirement | 0.130.0 or later | 0.130.0 or later |
| Codex login | Required | Required | Required |
| VS Code Git extension | Enabled | Enabled | Enabled |
| Source Control (SCM) view | Open | Open | Open |

## Notes

- Privacy: The extension itself does not send your code externally, but the Codex CLI may send repository context to its provider depending on its settings. Please review Codex’s policies.

## License

MIT License © 2025-2026 komiyamma

