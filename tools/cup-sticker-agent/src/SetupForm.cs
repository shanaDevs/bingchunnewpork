// Bing Chun first-install GUI — .NET 4.0 / Windows 7+. No PowerShell.
// User picks the sticker printer; saves local.env; installs runtime + auto-start.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Printing;
using System.IO;
using System.Management;
using System.Text;
using System.Text.RegularExpressions;
using System.Windows.Forms;

static class Program {
  [STAThread]
  static void Main() {
    Application.EnableVisualStyles();
    Application.SetCompatibleTextRenderingDefault(false);
    Application.Run(new SetupForm());
  }
}

sealed class PrinterRow {
  public string Name;
  public string Driver;
  public string Port;
  public string Status;
  public bool Likely;
  public override string ToString() {
    string tag = Likely ? "  [STICKER]" : "";
    string st = string.IsNullOrEmpty(Status) ? "" : "  |  " + Status;
    string port = string.IsNullOrEmpty(Port) ? "" : "  |  " + Port;
    string drv = string.IsNullOrEmpty(Driver) ? "" : "  |  " + Driver;
    return Name + port + drv + st + tag;
  }
}

sealed class SetupForm : Form {
  readonly string agentDir;
  readonly ComboBox cmbPrinter;
  readonly TextBox txtPrinter;
  readonly ListBox lstPrinters;
  readonly Label lblStatus;
  readonly Button btnRefresh;
  readonly Button btnTestPrint;
  readonly Button btnSaveInstall;
  readonly Button btnSaveOnly;
  readonly Button btnClose;
  List<PrinterRow> rows = new List<PrinterRow>();

  public SetupForm() {
    agentDir = Path.GetDirectoryName(Application.ExecutablePath);
    Text = "Bing Chun Cup Sticker — Setup";
    Width = 720;
    Height = 520;
    StartPosition = FormStartPosition.CenterScreen;
    Font = new Font("Segoe UI", 9F, FontStyle.Regular);
    FormBorderStyle = FormBorderStyle.FixedDialog;
    MaximizeBox = false;

    var help = new Label {
      Left = 16, Top = 12, Width = 670, Height = 40,
      Text = "First install: select the correct sticker printer below. This is saved to local.env and used every time the agent starts (Windows 7 compatible — no PowerShell)."
    };
    Controls.Add(help);

    var lblList = new Label { Left = 16, Top = 58, AutoSize = true, Text = "Installed printers" };
    Controls.Add(lblList);

    lstPrinters = new ListBox {
      Left = 16, Top = 80, Width = 670, Height = 200
    };
    lstPrinters.SelectedIndexChanged += delegate {
      PrinterRow r = lstPrinters.SelectedItem as PrinterRow;
      if (r != null) {
        txtPrinter.Text = r.Name;
        cmbPrinter.Text = r.Name;
      }
    };
    Controls.Add(lstPrinters);

    var lblPick = new Label { Left = 16, Top = 295, AutoSize = true, Text = "Selected printer name" };
    Controls.Add(lblPick);

    cmbPrinter = new ComboBox {
      Left = 16, Top = 315, Width = 420, DropDownStyle = ComboBoxStyle.DropDown
    };
    Controls.Add(cmbPrinter);

    txtPrinter = new TextBox {
      Left = 450, Top = 315, Width = 236
    };
    Controls.Add(txtPrinter);

    btnRefresh = new Button { Left = 16, Top = 355, Width = 100, Height = 36, Text = "Refresh" };
    btnRefresh.Click += delegate { LoadPrinters(); };
    Controls.Add(btnRefresh);

    btnTestPrint = new Button {
      Left = 126, Top = 355, Width = 140, Height = 36,
      Text = "Test print",
      BackColor = Color.FromArgb(0, 120, 215),
      ForeColor = Color.White,
      FlatStyle = FlatStyle.Flat,
      Font = new Font("Segoe UI", 9F, FontStyle.Bold)
    };
    btnTestPrint.Click += delegate { TestPrint(); };
    Controls.Add(btnTestPrint);

    btnSaveOnly = new Button { Left = 276, Top = 355, Width = 120, Height = 36, Text = "Save printer" };
    btnSaveOnly.Click += delegate { SaveEnvOnly(); };
    Controls.Add(btnSaveOnly);

    btnSaveInstall = new Button {
      Left = 406, Top = 355, Width = 170, Height = 36,
      Text = "Save && Install",
      BackColor = Color.FromArgb(16, 124, 65),
      ForeColor = Color.White,
      FlatStyle = FlatStyle.Flat,
      Font = new Font("Segoe UI", 9F, FontStyle.Bold)
    };
    btnSaveInstall.Click += delegate { SaveAndInstall(); };
    Controls.Add(btnSaveInstall);

    btnClose = new Button { Left = 586, Top = 355, Width = 100, Height = 36, Text = "Close" };
    btnClose.Click += delegate { Close(); };
    Controls.Add(btnClose);

    lblStatus = new Label {
      Left = 16, Top = 410, Width = 670, Height = 55,
      ForeColor = Color.DarkSlateGray
    };
    Controls.Add(lblStatus);

    Load += delegate {
      LoadPrinters();
      PrefillFromEnv();
    };
  }

  void SetStatus(string msg, bool ok) {
    lblStatus.ForeColor = ok ? Color.DarkGreen : Color.Firebrick;
    lblStatus.Text = msg;
  }

  void PrefillFromEnv() {
    string envPath = Path.Combine(agentDir, "local.env");
    if (!File.Exists(envPath)) return;
    try {
      foreach (string line in File.ReadAllLines(envPath)) {
        string t = line.Trim();
        if (t.StartsWith("#") || t.IndexOf('=') < 1) continue;
        int eq = t.IndexOf('=');
        string key = t.Substring(0, eq).Trim();
        string val = t.Substring(eq + 1).Trim();
        if (key == "BC_STICKER_PRINTER" && val.Length > 0) {
          txtPrinter.Text = val;
          cmbPrinter.Text = val;
          for (int i = 0; i < lstPrinters.Items.Count; i++) {
            var r = lstPrinters.Items[i] as PrinterRow;
            if (r != null && string.Equals(r.Name, val, StringComparison.OrdinalIgnoreCase)) {
              lstPrinters.SelectedIndex = i;
              break;
            }
          }
          SetStatus("Loaded saved printer from local.env: " + val, true);
          return;
        }
      }
    } catch { }
  }

  void LoadPrinters() {
    rows = new List<PrinterRow>();
    lstPrinters.Items.Clear();
    cmbPrinter.Items.Clear();

    var byName = new Dictionary<string, PrinterRow>(StringComparer.OrdinalIgnoreCase);

    // 1) System.Drawing list (works even when WMIC is missing)
    try {
      foreach (string name in PrinterSettings.InstalledPrinters) {
        if (string.IsNullOrWhiteSpace(name)) continue;
        byName[name] = new PrinterRow {
          Name = name, Driver = "", Port = "", Status = "", Likely = Regex.IsMatch(name, @"xprinter|xp-d35|bingchun", RegexOptions.IgnoreCase)
        };
      }
    } catch (Exception ex) {
      SetStatus("Could not list printers: " + ex.Message, false);
      return;
    }

    // 2) WMI Win32_Printer — driver/port/status (Win7 + Win10/11; no wmic.exe needed)
    try {
      using (var searcher = new ManagementObjectSearcher("SELECT Name,DriverName,PortName,PrinterStatus,WorkOffline FROM Win32_Printer")) {
        foreach (ManagementObject mo in searcher.Get()) {
          string name = Convert.ToString(mo["Name"]) ?? "";
          if (name.Length == 0) continue;
          string driver = Convert.ToString(mo["DriverName"]) ?? "";
          string port = Convert.ToString(mo["PortName"]) ?? "";
          string statusCode = Convert.ToString(mo["PrinterStatus"]) ?? "";
          bool offline = false;
          try { offline = Convert.ToBoolean(mo["WorkOffline"]); } catch { }
          string status = offline ? "Offline" : ("Status=" + statusCode);
          bool likely = Regex.IsMatch(name + " " + driver, @"xprinter|xp-d35|bingchun", RegexOptions.IgnoreCase);
          byName[name] = new PrinterRow {
            Name = name, Driver = driver, Port = port, Status = status, Likely = likely
          };
        }
      }
    } catch {
      // WMI optional — names from PrinterSettings are enough to select
    }

    rows.AddRange(byName.Values);
    rows.Sort(delegate(PrinterRow a, PrinterRow b) {
      if (a.Likely != b.Likely) return a.Likely ? -1 : 1;
      return string.Compare(a.Name, b.Name, StringComparison.OrdinalIgnoreCase);
    });

    string suggested = "";
    foreach (var r in rows) {
      lstPrinters.Items.Add(r);
      cmbPrinter.Items.Add(r.Name);
      if (r.Likely && suggested.Length == 0) suggested = r.Name;
    }

    if (suggested.Length == 0 && rows.Count > 0) suggested = rows[0].Name;
    if (txtPrinter.Text.Trim().Length == 0 && suggested.Length > 0) {
      txtPrinter.Text = suggested;
      cmbPrinter.Text = suggested;
      for (int i = 0; i < lstPrinters.Items.Count; i++) {
        var r = lstPrinters.Items[i] as PrinterRow;
        if (r != null && r.Name == suggested) { lstPrinters.SelectedIndex = i; break; }
      }
    }

    if (rows.Count == 0) {
      SetStatus("No printers found. Plug in USB sticker printer, install Xprinter driver, then Refresh.", false);
    } else {
      SetStatus(rows.Count + " printer(s). Pick the one marked [STICKER] (Xprinter / bingchun), then Save && Install. Use Test print to verify.", true);
    }
  }

  void TestPrint() {
    string printer = ChosenPrinter();
    if (printer.Length == 0) {
      SetStatus("Select a printer first.", false);
      MessageBox.Show("Select or type the sticker printer name first.", "Test print",
        MessageBoxButtons.OK, MessageBoxIcon.Information);
      return;
    }
    string exe = Path.Combine(agentDir, "print-stickers.exe");
    if (!File.Exists(exe)) {
      SetStatus("print-stickers.exe missing in this folder.", false);
      MessageBox.Show("print-stickers.exe is missing next to Setup.\nCopy the full cup-sticker-agent folder.",
        "Test print", MessageBoxButtons.OK, MessageBoxIcon.Error);
      return;
    }

    btnTestPrint.Enabled = false;
    SetStatus("Sending test print to '" + printer + "' ...", true);
    Application.DoEvents();
    try {
      WriteLocalEnv(printer);
      string tmp = Path.Combine(Path.GetTempPath(), "bc-setup-test.json");
      string json =
        "{\"printerName\":" + Quote(printer) + ",\"widthMm\":40,\"heightMm\":30,\"stickers\":[{" +
        "\"orderLabel\":\"TEST\",\"cupLabel\":\"1/1\",\"itemName\":\"Bobo\"," +
        "\"printedAt\":\"" + DateTime.Now.ToString("dd/MM HH:mm") + "\"," +
        "\"advisoryEn\":\"Contains a non nutritive sweetener.\"," +
        "\"advisorySi\":\"test\"}]}";
      File.WriteAllText(tmp, "\uFEFF" + json, new UTF8Encoding(true));
      var psi = new ProcessStartInfo {
        FileName = exe,
        Arguments = "-JsonPath \"" + tmp + "\"",
        WorkingDirectory = agentDir,
        UseShellExecute = false,
        RedirectStandardOutput = true,
        RedirectStandardError = true,
        CreateNoWindow = true
      };
      psi.EnvironmentVariables["BC_STICKER_PRINTER"] = printer;
      using (var p = Process.Start(psi)) {
        string stdout = p.StandardOutput.ReadToEnd();
        string stderr = p.StandardError.ReadToEnd();
        p.WaitForExit(60000);
        try { File.Delete(tmp); } catch { }
        if (p.ExitCode != 0) {
          string err = string.IsNullOrWhiteSpace(stderr) ? stdout : stderr;
          SetStatus("Test print FAILED: " + err, false);
          MessageBox.Show(
            "Test print FAILED on:\n" + printer + "\n\n" + err +
            "\n\nCheck: power/USB, queue Online, correct printer selected.",
            "Test print", MessageBoxButtons.OK, MessageBoxIcon.Warning);
          return;
        }
        SetStatus("Test print OK on '" + printer + "'. Saved to local.env. " + (stdout ?? "").Trim(), true);
        MessageBox.Show(
          "Test print OK.\n\nPrinter: " + printer + "\nSaved in local.env for the agent.",
          "Test print", MessageBoxButtons.OK, MessageBoxIcon.Information);
      }
    } catch (Exception ex) {
      SetStatus(ex.Message, false);
      MessageBox.Show(ex.Message, "Test print", MessageBoxButtons.OK, MessageBoxIcon.Error);
    } finally {
      btnTestPrint.Enabled = true;
    }
  }

  static string Quote(string s) {
    return "\"" + (s ?? "").Replace("\\", "\\\\").Replace("\"", "\\\"") + "\"";
  }

  string ChosenPrinter() {
    string name = txtPrinter.Text.Trim();
    if (name.Length == 0) name = cmbPrinter.Text.Trim();
    return name;
  }

  string ReadEnvValue(string key, string fallback) {
    string envPath = Path.Combine(agentDir, "local.env");
    if (!File.Exists(envPath)) return fallback;
    try {
      foreach (string line in File.ReadAllLines(envPath)) {
        string t = line.Trim();
        if (t.StartsWith("#") || t.IndexOf('=') < 1) continue;
        int eq = t.IndexOf('=');
        if (t.Substring(0, eq).Trim() == key) {
          string v = t.Substring(eq + 1).Trim();
          return v.Length > 0 ? v : fallback;
        }
      }
    } catch { }
    return fallback;
  }

  bool WriteLocalEnv(string printer) {
    string port = "";
    string driver = "";
    foreach (var r in rows) {
      if (string.Equals(r.Name, printer, StringComparison.OrdinalIgnoreCase)) {
        port = r.Port ?? "";
        driver = r.Driver ?? "";
        break;
      }
    }

    string api = ReadEnvValue("BC_STICKER_API_URL", "https://admin.bingchunsrilanka.com/api");
    string secret = ReadEnvValue("BC_STICKER_SECRET", "bingchun-cup-sticker-local");
    string store = ReadEnvValue("BC_STICKER_STORE_ID", "");

    var sb = new StringBuilder();
    sb.AppendLine("# Auto-generated by BingChunCupStickerSetup.exe");
    sb.AppendLine("BC_STICKER_API_URL=" + api);
    sb.AppendLine("BC_STICKER_SECRET=" + secret);
    sb.AppendLine("BC_STICKER_PRINTER=" + printer);
    sb.AppendLine("BC_STICKER_PRINTER_PORT=" + port);
    sb.AppendLine("BC_STICKER_PRINTER_HOST=");
    sb.AppendLine("BC_STICKER_PRINTER_TCP_PORT=");
    sb.AppendLine("BC_STICKER_WIDTH_MM=40");
    sb.AppendLine("BC_STICKER_HEIGHT_MM=30");
    sb.AppendLine("BC_STICKER_STORE_ID=" + store);
    sb.AppendLine("BC_STICKER_SILENT=1");
    File.WriteAllText(Path.Combine(agentDir, "local.env"), sb.ToString(), Encoding.ASCII);
    return true;
  }

  void SaveEnvOnly() {
    string printer = ChosenPrinter();
    if (printer.Length == 0) {
      SetStatus("Select or type a printer name first.", false);
      return;
    }
    try {
      WriteLocalEnv(printer);
      SetStatus("Saved local.env with printer=" + printer + ". Future starts will use this printer.", true);
    } catch (Exception ex) {
      SetStatus(ex.Message, false);
    }
  }

  void CreateStartupShortcut() {
    // Point Startup shortcut at the .EXE directly — .bat often fails / is blocked on Win7.
    string startup = Path.Combine(
      Environment.GetFolderPath(Environment.SpecialFolder.Startup),
      "Bing Chun Cup Sticker Agent.lnk");
    string agentExe = Path.Combine(agentDir, "BingChunCupStickerAgent.exe");
    string vbs = Path.Combine(Path.GetTempPath(), "bc-sticker-startup.vbs");
    var sb = new StringBuilder();
    sb.AppendLine("Set s = CreateObject(\"WScript.Shell\")");
    sb.AppendLine("Set sc = s.CreateShortcut(\"" + startup.Replace("\"", "\"\"") + "\")");
    sb.AppendLine("sc.TargetPath = \"" + agentExe.Replace("\"", "\"\"") + "\"");
    sb.AppendLine("sc.WorkingDirectory = \"" + agentDir.Replace("\"", "\"\"") + "\"");
    sb.AppendLine("sc.WindowStyle = 7");
    sb.AppendLine("sc.Description = \"Bing Chun cup sticker agent\"");
    sb.AppendLine("sc.Save");
    File.WriteAllText(vbs, sb.ToString());
    var psi = new ProcessStartInfo {
      FileName = "cscript.exe",
      Arguments = "//nologo \"" + vbs + "\"",
      UseShellExecute = false,
      CreateNoWindow = true
    };
    using (var p = Process.Start(psi)) p.WaitForExit(10000);
    try { File.Delete(vbs); } catch { }
  }

  void StopOldAgent() {
    try {
      foreach (var p in Process.GetProcessesByName("BingChunCupStickerAgent")) {
        try { p.Kill(); } catch { }
      }
    } catch { }
    try {
      // Free port 9177 if something else holds it
      var psi = new ProcessStartInfo {
        FileName = "cmd.exe",
        Arguments = "/c for /f \"tokens=5\" %a in ('netstat -ano ^| findstr :9177 ^| findstr LISTENING') do taskkill /F /PID %a",
        UseShellExecute = false,
        CreateNoWindow = true
      };
      using (var p = Process.Start(psi)) if (p != null) p.WaitForExit(8000);
    } catch { }
  }

  void StartAgentExe() {
    string agentExe = Path.Combine(agentDir, "BingChunCupStickerAgent.exe");
    if (!File.Exists(agentExe))
      throw new Exception("BingChunCupStickerAgent.exe missing in:\n" + agentDir);

    StopOldAgent();
    System.Threading.Thread.Sleep(800);

    var psi = new ProcessStartInfo {
      FileName = agentExe,
      WorkingDirectory = agentDir,
      UseShellExecute = false,
      CreateNoWindow = true,
      WindowStyle = ProcessWindowStyle.Hidden
    };
    // Ensure child finds local.env / print-stickers.exe next to itself
    psi.EnvironmentVariables["BC_STICKER_AGENT_DIR"] = agentDir;
    Process.Start(psi);
  }

  bool HasDotNet4() {
    try {
      Microsoft.Win32.RegistryKey k =
        Microsoft.Win32.Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full");
      if (k != null && k.GetValue("Release") != null) return true;
      k = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Client");
      return k != null && k.GetValue("Release") != null;
    } catch { return false; }
  }

  void SaveAndInstall() {
    string printer = ChosenPrinter();
    if (printer.Length == 0) {
      SetStatus("Select or type a printer name first.", false);
      return;
    }

    btnSaveInstall.Enabled = false;
    btnSaveOnly.Enabled = false;
    try {
      SetStatus("Saving local.env with printer=" + printer + " ...", true);
      Application.DoEvents();
      WriteLocalEnv(printer);

      if (!HasDotNet4()) {
        throw new Exception(
          ".NET Framework 4 is missing.\n\n" +
          "Install it, then run setup again:\n" +
          "https://www.microsoft.com/en-us/download/details.aspx?id=17718\n\n" +
          "Or run ensure-dotnet.cmd as Administrator.");
      }

      string agentExe = Path.Combine(agentDir, "BingChunCupStickerAgent.exe");
      string printExe = Path.Combine(agentDir, "print-stickers.exe");
      if (!File.Exists(agentExe) || !File.Exists(printExe)) {
        throw new Exception(
          "Required EXE files are missing in this folder:\n" +
          "- BingChunCupStickerAgent.exe\n" +
          "- print-stickers.exe\n\n" +
          "Copy the FULL cup-sticker-agent folder from the build PC.\n" +
          "(Do not rely on .bat files on Windows 7.)");
      }

      SetStatus("Creating Startup shortcut to BingChunCupStickerAgent.exe ...", true);
      Application.DoEvents();
      CreateStartupShortcut();

      SetStatus("Starting BingChunCupStickerAgent.exe (no .bat)...", true);
      Application.DoEvents();
      StartAgentExe();

      // Quick health check
      System.Threading.Thread.Sleep(2000);
      string healthNote = "";
      try {
        var req = (System.Net.HttpWebRequest)System.Net.WebRequest.Create("http://127.0.0.1:9177/health");
        req.Timeout = 4000;
        using (var resp = (System.Net.HttpWebResponse)req.GetResponse())
        using (var sr = new System.IO.StreamReader(resp.GetResponseStream()))
          healthNote = "\nAgent health: OK";
      } catch {
        healthNote = "\nAgent started — if health fails, run BingChunCupStickerAgent.exe manually.";
      }

      SetStatus(
        "Done. Printer saved: " + printer +
        "\nHealth: http://127.0.0.1:9177/health" + healthNote +
        "\nAuto-start uses the .EXE (not .bat).",
        true);
      MessageBox.Show(
        "Installed.\n\nPrinter: " + printer +
        "\nSaved in local.env.\n\n" +
        "Agent started via BingChunCupStickerAgent.exe\n" +
        "(no .bat — works on Windows 7).\n" +
        "Startup shortcut also points to the .EXE." + healthNote,
        "Bing Chun Setup",
        MessageBoxButtons.OK,
        MessageBoxIcon.Information);
    } catch (Exception ex) {
      SetStatus(ex.Message, false);
      MessageBox.Show(ex.Message, "Bing Chun Setup", MessageBoxButtons.OK, MessageBoxIcon.Error);
    } finally {
      btnSaveInstall.Enabled = true;
      btnSaveOnly.Enabled = true;
    }
  }
}
