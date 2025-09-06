using System;
using System.Diagnostics;
using System.IO;
using System.Text;

class Program
{
    static int Main(string[] args)
    {
        // 第1引数が"utf8"なら出力をUTF-8に設定（.NET Framework 4.8ではConsole.OutputEncodingのみ対応)
        if (args.Length > 0 && args[0] == "utf8")
        {
            Console.OutputEncoding = Encoding.UTF8;
        }

        // codex.cmd の絶対パスを組み立て
        string appdata = Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData);
        string codexPath = Path.Combine(appdata, "npm", "codex.cmd");

        // 第2引数で言語切り替え（"en" または "ja"、デフォルトは "ja"）
        string lang = "ja";
        if (args.Length > 1)
        {
            if (args[1] == "en") lang = "en";
            else if (args[1] == "ja") lang = "ja";
        }

        // ローカライズされたエラーメッセージ
        string notFoundMessage = lang == "en"
            ? $"codex command not found: {codexPath}\nPlease confirm it is installed globally with 'npm -g'."
            : $"codex コマンドが見つかりませんでした: {codexPath}\nnpm -g でインストール済みか確認してください。";

        if (!File.Exists(codexPath))
        {
            Console.Error.WriteLine(notFoundMessage);
            return 1;
        }

        // promptの日本語・英語バージョン
        string promptJa = "このリポジトリで「次に行う予定のコミット」のメッセージを日本語で作成してください（コミットは実行はしません、文面のみ考案してください）。コミットメッセージは、最初に Conventional Commits に則って記述してください。最終返答だけを表示してください。ファイルの作成や編集は絶対に行わないこと。git系以外はコマンド実行しないこと。「コミットメッセージ全体の開始位置」に■★■★■と改行を、「コミットメッセージ全体の終了位置」に改行＋▲★▲★▲＋改行を付けてください。";
        string promptEn = "Generate a commit message (text only) in English for the next planned commit in this repository. Do not perform the commit, do not modify the repository, and do not create, edit, or delete any files: produce only the commit message text. The commit message must begin at its first character with a Conventional Commits header following the Conventional Commits specification (for example: 'feat:', 'fix:', 'chore:', etc.) and must conform to that format from the very start. Only output the final commit message and nothing else: do not output reasoning, explanations, step lists, or any extra text before, inside, or after the commit message other than what is specified below. Do not execute any commands except git-related commands; do not run any non-git commands. At the very start of the entire commit message output the exact sequence ■★■★■ followed immediately by a single newline character. At the very end of the entire commit message output a single newline, then the exact sequence ▲★▲★▲, then a single newline. Do not include any additional characters, markers, comments, or surrounding text beyond the required start marker, the commit message itself, and the required end marker and their newlines.";

        // 言語に応じた prompt を選択
        string prompt = lang == "en" ? promptEn : promptJa;

        string safePrompt = prompt.Replace("\"", "'");
        string arguments = $"exec \"{safePrompt}\" -m \"gpt-5\" -c model_reasoning_effort=\"minimal\" -c hide_agent_reasoning=\"true\" --dangerously-bypass-approvals-and-sandbox";

        string cmdArguments = $"/c \"\"{codexPath}\" {arguments}\"";
        var psi = new ProcessStartInfo
        {
            FileName = "cmd.exe",
            Arguments = cmdArguments,
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            StandardOutputEncoding = Encoding.UTF8,
            StandardErrorEncoding = Encoding.UTF8,
            CreateNoWindow = true
        };

        try
        {
            using (var process = Process.Start(psi))
            {
                if (process == null)
                {
                    Console.Error.WriteLine(lang == "en" ? "Could not start the process." : "プロセスを開始できませんでした。");
                    return 1;
                }

                process.OutputDataReceived += (s, e) => { if (e.Data != null) Console.WriteLine(e.Data); };
                process.ErrorDataReceived += (s, e) => { if (e.Data != null) Console.Error.WriteLine(e.Data); };
                process.BeginOutputReadLine();
                process.BeginErrorReadLine();
                process.WaitForExit();
                return process.ExitCode;
            }
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine((lang == "en" ? "Startup error: " : "起動時エラー: ") + ex.Message);
            return 1;
        }
    }
}