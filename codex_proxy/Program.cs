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

        if (!File.Exists(codexPath))
        {
            Console.Error.WriteLine($"codex コマンドが見つかりませんでした: {codexPath}\nnpm -g でインストール済みか確認してください。");
            return 1;
        }

        // 実行したいコマンド・引数（ここで全て指定）
        string prompt = "このリポジトリの最新のコミット予定のメッセージを簡潔に日本語で考えてください。コミットメッセージは、最初に Conventional Commits に則って記述してください。最終返答だけを表示してください。ファイルの作成や編集は絶対に行わないこと。git系以外はコマンド実行しないこと。「コミットメッセージ全体の開始位置」に■★■★■と改行を、「コミットメッセージ全体の終了位置」に改行＋▲★▲★▲＋改行を付けてください。";
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
                    Console.Error.WriteLine("プロセスを開始できませんでした。");
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
            Console.Error.WriteLine("起動時エラー: " + ex.Message);
            return 1;
        }
    }
}