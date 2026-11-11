// Bing Chun cup sticker agent — pure .NET 4.0 (Windows 7+). NO Node.js.
// Avoids ADVAPI32 EventSetInformation crash from Node 16/18/20 on Win7.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Drawing.Printing;
using System.IO;
using System.Net;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;

static class NativeAgent {
  static string AgentDir;
  static string ApiBase = "https://admin.bingchunsrilanka.com/api";
  static string Secret = "bingchun-cup-sticker-local";
  static string Printer = "bingchun";
  static string StoreId = "";
  static double WidthMm = 40;
  static double HeightMm = 30;
  static int ListenPort = 9177;
  static int PollMs = 1500;
  static readonly object PollLock = new object();
  static bool PollBusy;
  static string LastCloudError = "";
  static bool CloudOk;
  static bool InsecureTlsEnabled;

  const string AdvisoryEn =
    "Contains a non nutritive sweetener. Not recommended for children under 3 years of age.";
  const string AdvisorySi =
    "මෙම නිෂ්පාදනයේ අඩංගු කෘතීම පැණිරසකාරක අඩංගු වේ. එමනිසා වයස අවුරුදු 3 ට අඩු දරුවන් සඳහා නිර්දේශ නොකෙරේ.";

  static int Main(string[] args) {
    try {
      AgentDir = AppDomain.CurrentDomain.BaseDirectory.TrimEnd('\\', '/');
      EnableTls12();
      LoadEnv(Path.Combine(AgentDir, "local.env"));
      if (string.IsNullOrWhiteSpace(Printer)) Printer = DetectPrinter() ?? "bingchun";
      Environment.SetEnvironmentVariable("BC_STICKER_PRINTER", Printer);

      FreePort(ListenPort);
      var listener = new HttpListener();
      listener.Prefixes.Add("http://127.0.0.1:" + ListenPort + "/");
      listener.Start();
      Console.WriteLine("[cup-sticker-agent] native .NET listening on http://127.0.0.1:" + ListenPort);
      Console.WriteLine("[cup-sticker-agent] printer=" + Printer + " api=" + ApiBase);
      Console.WriteLine("[cup-sticker-agent] cloud poll keeps Admin 'Agent online' — local service alone is not enough");

      var poll = new Thread(PollLoop);
      poll.IsBackground = true;
      poll.Start();

      while (true) {
        var ctx = listener.GetContext();
        ThreadPool.QueueUserWorkItem(_ => HandleRequest(ctx));
      }
    } catch (Exception ex) {
      Console.Error.WriteLine("[cup-sticker-agent] fatal: " + ex.Message);
      return 1;
    }
  }

  static void EnableTls12() {
    try {
      // 3072 = TLS 1.2 (enum missing on some .NET 4.0 Win7 installs)
      ServicePointManager.SecurityProtocol =
        (SecurityProtocolType)3072 | (SecurityProtocolType)768 | SecurityProtocolType.Tls;
    } catch {
      try { ServicePointManager.SecurityProtocol = (SecurityProtocolType)3072; } catch { }
    }
    try { ServicePointManager.Expect100Continue = false; } catch { }
  }

  static void LoadEnv(string path) {
    if (!File.Exists(path)) return;
    foreach (string raw in File.ReadAllLines(path, Encoding.UTF8)) {
      string line = raw.Trim();
      if (line.Length == 0 || line[0] == '#' || line.IndexOf('=') < 1) continue;
      int eq = line.IndexOf('=');
      string key = line.Substring(0, eq).Trim();
      string val = line.Substring(eq + 1).Trim();
      if (key == "BC_STICKER_API_URL" && val.Length > 0) ApiBase = val.TrimEnd('/');
      else if (key == "BC_STICKER_SECRET" && val.Length > 0) Secret = val;
      else if (key == "BC_STICKER_PRINTER" && val.Length > 0) Printer = val;
      else if (key == "BC_STICKER_STORE_ID") StoreId = val;
      else if (key == "BC_STICKER_WIDTH_MM") { double d; if (double.TryParse(val, out d)) WidthMm = d; }
      else if (key == "BC_STICKER_HEIGHT_MM") { double d; if (double.TryParse(val, out d)) HeightMm = d; }
      else if (key == "BC_STICKER_PORT") { int p; if (int.TryParse(val, out p)) ListenPort = p; }
      else if (key == "BC_STICKER_POLL_MS") { int p; if (int.TryParse(val, out p)) PollMs = p; }
    }
  }

  static string DetectPrinter() {
    try {
      string exe = Path.Combine(AgentDir, "detect-printer.exe");
      if (File.Exists(exe)) {
        var p = Process.Start(new ProcessStartInfo {
          FileName = exe, UseShellExecute = false,
          RedirectStandardOutput = true, CreateNoWindow = true
        });
        string o = p.StandardOutput.ReadLine();
        p.WaitForExit(10000);
        if (!string.IsNullOrWhiteSpace(o)) return o.Trim();
      }
    } catch { }
    try {
      foreach (string name in PrinterSettings.InstalledPrinters) {
        if (Regex.IsMatch(name ?? "", @"xprinter|xp-d35|bingchun", RegexOptions.IgnoreCase))
          return name;
      }
    } catch { }
    return null;
  }

  static void FreePort(int port) {
    try {
      string bat = Path.Combine(Path.GetTempPath(), "bc-freeport.bat");
      File.WriteAllText(bat,
        "@echo off\r\n" +
        "for /f \"tokens=5\" %%p in ('netstat -ano ^| findstr \":" + port + "\" ^| findstr LISTENING') do taskkill /F /PID %%p >nul 2>&1\r\n");
      var p = Process.Start(new ProcessStartInfo {
        FileName = bat, UseShellExecute = false, CreateNoWindow = true
      });
      if (p != null) p.WaitForExit(8000);
      try { File.Delete(bat); } catch { }
    } catch { }
  }

  static void HandleRequest(HttpListenerContext ctx) {
    try {
      AddCors(ctx.Response);
      string path = ctx.Request.Url.AbsolutePath.TrimEnd('/');
      if (path.Length == 0) path = "/";
      if (ctx.Request.HttpMethod == "OPTIONS") {
        ctx.Response.StatusCode = 204;
        ctx.Response.Close();
        return;
      }
      if (ctx.Request.HttpMethod == "GET" && path == "/health") {
        WriteJson(ctx.Response, 200, HealthJson());
        return;
      }
      if (ctx.Request.HttpMethod == "POST" && path == "/test") {
        string json = BuildPrintJson(Printer, TestStickersJson());
        string result = RunPrintExe(json);
        WriteJson(ctx.Response, 200, "{\"ok\":true,\"printed\":1,\"stdout\":" + JsonString(result) + "}");
        return;
      }
      if (ctx.Request.HttpMethod == "POST" && path == "/print") {
        string body = ReadBody(ctx.Request);
        // Pass through stickers array from body; ensure printer fields.
        string stickers = ExtractJsonArray(body, "stickers");
        if (stickers == null || stickers == "[]") {
          WriteJson(ctx.Response, 400, "{\"ok\":false,\"error\":\"stickers array required\"}");
          return;
        }
        string printer = ExtractJsonString(body, "printerName");
        if (string.IsNullOrEmpty(printer)) printer = Printer;
        string payload = "{\"printerName\":" + JsonString(printer) +
          ",\"widthMm\":" + WidthMm.ToString(System.Globalization.CultureInfo.InvariantCulture) +
          ",\"heightMm\":" + HeightMm.ToString(System.Globalization.CultureInfo.InvariantCulture) +
          ",\"stickers\":" + stickers + "}";
        string result = RunPrintExe(payload);
        WriteJson(ctx.Response, 200, "{\"ok\":true,\"stdout\":" + JsonString(result) + "}");
        return;
      }
      WriteJson(ctx.Response, 404, "{\"ok\":false,\"error\":\"not found\"}");
    } catch (Exception ex) {
      try { WriteJson(ctx.Response, 500, "{\"ok\":false,\"error\":" + JsonString(ex.Message) + "}"); }
      catch { }
    }
  }

  static string HealthJson() {
    var names = new List<string>();
    bool ready = false;
    try {
      foreach (string n in PrinterSettings.InstalledPrinters) {
        names.Add(n);
        if (string.Equals(n, Printer, StringComparison.OrdinalIgnoreCase)) ready = true;
      }
    } catch { }
    var sb = new StringBuilder();
    sb.Append("{\"ok\":true,\"printer\":").Append(JsonString(Printer));
    sb.Append(",\"printerReady\":").Append(ready ? "true" : "false");
    sb.Append(",\"native\":true,\"runtime\":\"dotnet4\"");
    sb.Append(",\"cloudOk\":").Append(CloudOk ? "true" : "false");
    sb.Append(",\"cloudError\":").Append(JsonString(LastCloudError ?? ""));
    sb.Append(",\"apiBase\":").Append(JsonString(ApiBase));
    sb.Append(",\"widthMm\":").Append(WidthMm.ToString(System.Globalization.CultureInfo.InvariantCulture));
    sb.Append(",\"heightMm\":").Append(HeightMm.ToString(System.Globalization.CultureInfo.InvariantCulture));
    sb.Append(",\"installedPrinters\":[");
    for (int i = 0; i < names.Count; i++) {
      if (i > 0) sb.Append(',');
      sb.Append(JsonString(names[i]));
    }
    sb.Append("]}");
    return sb.ToString();
  }

  static string TestStickersJson() {
    string now = DateTime.Now.ToString("dd/MM HH:mm");
    return "[{" +
      "\"orderLabel\":\"OP-001\",\"cupLabel\":\"1/1\",\"itemName\":\"Bobo\"," +
      "\"printedAt\":" + JsonString(now) + "," +
      "\"advisoryEn\":" + JsonString(AdvisoryEn) + "," +
      "\"advisorySi\":" + JsonString(AdvisorySi) + "}]";
  }

  static string BuildPrintJson(string printer, string stickersJson) {
    return "{\"printerName\":" + JsonString(printer) +
      ",\"widthMm\":" + WidthMm.ToString(System.Globalization.CultureInfo.InvariantCulture) +
      ",\"heightMm\":" + HeightMm.ToString(System.Globalization.CultureInfo.InvariantCulture) +
      ",\"stickers\":" + stickersJson + "}";
  }

  static string RunPrintExe(string payloadJson) {
    string exe = Path.Combine(AgentDir, "print-stickers.exe");
    if (!File.Exists(exe)) throw new Exception("print-stickers.exe missing next to agent");
    string tmp = Path.Combine(Path.GetTempPath(), "bc-cup-" + Guid.NewGuid().ToString("N") + ".json");
    // UTF-8 BOM
    File.WriteAllText(tmp, "\uFEFF" + payloadJson, new UTF8Encoding(true));
    try {
      var psi = new ProcessStartInfo {
        FileName = exe,
        Arguments = "-JsonPath \"" + tmp + "\"",
        WorkingDirectory = AgentDir,
        UseShellExecute = false,
        RedirectStandardOutput = true,
        RedirectStandardError = true,
        CreateNoWindow = true
      };
      psi.EnvironmentVariables["BC_STICKER_PRINTER"] = Printer;
      using (var p = Process.Start(psi)) {
        string stdout = p.StandardOutput.ReadToEnd();
        string stderr = p.StandardError.ReadToEnd();
        p.WaitForExit(120000);
        if (p.ExitCode != 0)
          throw new Exception(string.IsNullOrWhiteSpace(stderr) ? stdout : stderr);
        return (stdout ?? "").Trim();
      }
    } finally {
      try { File.Delete(tmp); } catch { }
    }
  }

  static void PollLoop() {
    while (true) {
      try { PollOnce(); }
      catch (Exception ex) {
        CloudOk = false;
        LastCloudError = ex.Message ?? "poll failed";
        Console.WriteLine("[cup-sticker-agent] poll ERROR: " + LastCloudError);
        MaybeEnableInsecureTls(LastCloudError);
      }
      Thread.Sleep(PollMs > 500 ? PollMs : 1500);
    }
  }

  static void MaybeEnableInsecureTls(string err) {
    if (InsecureTlsEnabled || string.IsNullOrEmpty(err)) return;
    string e = err.ToLowerInvariant();
    if (e.IndexOf("ssl") >= 0 || e.IndexOf("tls") >= 0 || e.IndexOf("secure channel") >= 0 || e.IndexOf("certificate") >= 0) {
      InsecureTlsEnabled = true;
      ServicePointManager.ServerCertificateValidationCallback = delegate { return true; };
      Console.WriteLine("[cup-sticker-agent] WARN: insecure TLS fallback enabled for old Windows");
    }
  }

  static void PollOnce() {
    lock (PollLock) {
      if (PollBusy) return;
      PollBusy = true;
    }
    try {
      // Heartbeat marks Admin "Agent online" (local 9177 alone does NOT).
      try {
        HttpGet(ApiBase + "/cup-sticker-agent/heartbeat");
        CloudOk = true;
        LastCloudError = "";
      } catch (Exception hbEx) {
        LastCloudError = hbEx.Message ?? "heartbeat failed";
        MaybeEnableInsecureTls(LastCloudError);
        HttpGet(ApiBase + "/cup-sticker-agent/heartbeat");
        CloudOk = true;
        LastCloudError = "";
      }

      string qs = string.IsNullOrEmpty(StoreId) ? "" : ("?storeId=" + Uri.EscapeDataString(StoreId));
      string url = ApiBase + "/cup-sticker-agent/claim" + qs;
      string raw = HttpGet(url);
      CloudOk = true;
      LastCloudError = "";

      string id = ExtractJsonString(raw, "id");
      if (string.IsNullOrEmpty(id)) {
        string data = ExtractJsonObject(raw, "data");
        if (!string.IsNullOrEmpty(data)) {
          id = ExtractJsonString(data, "id");
          raw = data;
        }
      }
      if (string.IsNullOrEmpty(id)) return;

      string stickers = ExtractJsonArray(raw, "stickers");
      if (string.IsNullOrEmpty(stickers)) stickers = "[]";
      string jobPrinter = ExtractJsonString(raw, "printerName");
      if (string.IsNullOrEmpty(jobPrinter)) jobPrinter = Printer;

      Console.WriteLine("[cup-sticker-agent] claimed job " + id);
      try {
        string payload = BuildPrintJson(jobPrinter, stickers);
        string result = RunPrintExe(payload);
        CompleteJob(id, "{\"ok\":true,\"printed\":1,\"stdout\":" + JsonString(result) + "}");
        Console.WriteLine("[cup-sticker-agent] job " + id + " printed");
      } catch (Exception ex) {
        CompleteJob(id, "{\"ok\":false,\"error\":" + JsonString(ex.Message) + "}");
        Console.WriteLine("[cup-sticker-agent] job " + id + " failed: " + ex.Message);
      }
    } finally {
      lock (PollLock) { PollBusy = false; }
    }
  }

  static void CompleteJob(string id, string bodyJson) {
    try {
      string url = ApiBase + "/cup-sticker-agent/jobs/" + Uri.EscapeDataString(id) + "/complete";
      HttpPost(url, bodyJson);
    } catch { }
  }

  static string HttpGet(string url) {
    try {
      var req = (HttpWebRequest)WebRequest.Create(url);
      req.Method = "GET";
      req.Accept = "application/json";
      req.Headers["X-Cup-Sticker-Secret"] = Secret;
      req.Timeout = 20000;
      using (var resp = (HttpWebResponse)req.GetResponse())
      using (var sr = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
        return sr.ReadToEnd();
    } catch (WebException wex) {
      string body = "";
      try {
        if (wex.Response != null) {
          using (var sr = new StreamReader(wex.Response.GetResponseStream(), Encoding.UTF8))
            body = sr.ReadToEnd();
          var http = wex.Response as HttpWebResponse;
          if (http != null && (int)http.StatusCode == 401)
            throw new Exception("401 Unauthorized — BC_STICKER_SECRET must match server CUP_STICKER_AGENT_SECRET (default bingchun-cup-sticker-local). " + body);
          throw new Exception("HTTP " + (http != null ? ((int)http.StatusCode).ToString() : "?") + " from " + url + " " + body);
        }
      } catch (Exception inner) {
        if (inner.Message.StartsWith("401") || inner.Message.StartsWith("HTTP")) throw;
      }
      throw new Exception(wex.Message + " (" + url + ")");
    }
  }

  static string HttpPost(string url, string json) {
    var req = (HttpWebRequest)WebRequest.Create(url);
    req.Method = "POST";
    req.ContentType = "application/json; charset=utf-8";
    req.Headers["X-Cup-Sticker-Secret"] = Secret;
    req.Timeout = 20000;
    byte[] data = Encoding.UTF8.GetBytes(json ?? "{}");
    req.ContentLength = data.Length;
    using (var s = req.GetRequestStream()) s.Write(data, 0, data.Length);
    using (var resp = (HttpWebResponse)req.GetResponse())
    using (var sr = new StreamReader(resp.GetResponseStream(), Encoding.UTF8))
      return sr.ReadToEnd();
  }

  static void AddCors(HttpListenerResponse res) {
    res.Headers["Access-Control-Allow-Origin"] = "*";
    res.Headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS";
    res.Headers["Access-Control-Allow-Headers"] = "Content-Type, Access-Control-Request-Private-Network";
    res.Headers["Access-Control-Allow-Private-Network"] = "true";
  }

  static void WriteJson(HttpListenerResponse res, int code, string json) {
    byte[] buf = Encoding.UTF8.GetBytes(json ?? "{}");
    res.StatusCode = code;
    res.ContentType = "application/json; charset=utf-8";
    res.ContentLength64 = buf.Length;
    res.OutputStream.Write(buf, 0, buf.Length);
    res.OutputStream.Close();
  }

  static string ReadBody(HttpListenerRequest req) {
    using (var sr = new StreamReader(req.InputStream, req.ContentEncoding ?? Encoding.UTF8))
      return sr.ReadToEnd();
  }

  static string JsonString(string s) {
    if (s == null) s = "";
    var sb = new StringBuilder();
    sb.Append('"');
    foreach (char c in s) {
      switch (c) {
        case '\\': sb.Append("\\\\"); break;
        case '"': sb.Append("\\\""); break;
        case '\n': sb.Append("\\n"); break;
        case '\r': sb.Append("\\r"); break;
        case '\t': sb.Append("\\t"); break;
        default:
          if (c < 32) sb.AppendFormat("\\u{0:x4}", (int)c);
          else sb.Append(c);
          break;
      }
    }
    sb.Append('"');
    return sb.ToString();
  }

  static string ExtractJsonString(string json, string key) {
    if (string.IsNullOrEmpty(json)) return null;
    var m = Regex.Match(json, "\"" + Regex.Escape(key) + "\"\\s*:\\s*\"((?:\\\\.|[^\"\\\\])*)\"");
    if (!m.Success) return null;
    return Regex.Unescape(m.Groups[1].Value);
  }

  static string ExtractJsonArray(string json, string key) {
    if (string.IsNullOrEmpty(json)) return null;
    int keyIdx = json.IndexOf("\"" + key + "\"");
    if (keyIdx < 0) return null;
    int colon = json.IndexOf(':', keyIdx);
    if (colon < 0) return null;
    int start = json.IndexOf('[', colon);
    if (start < 0) return null;
    int depth = 0;
    for (int i = start; i < json.Length; i++) {
      char c = json[i];
      if (c == '[') depth++;
      else if (c == ']') {
        depth--;
        if (depth == 0) return json.Substring(start, i - start + 1);
      }
    }
    return null;
  }

  static string ExtractJsonObject(string json, string key) {
    if (string.IsNullOrEmpty(json)) return null;
    int keyIdx = json.IndexOf("\"" + key + "\"");
    if (keyIdx < 0) return null;
    int colon = json.IndexOf(':', keyIdx);
    if (colon < 0) return null;
    int start = json.IndexOf('{', colon);
    if (start < 0) return null;
    int depth = 0;
    for (int i = start; i < json.Length; i++) {
      char c = json[i];
      if (c == '{') depth++;
      else if (c == '}') {
        depth--;
        if (depth == 0) return json.Substring(start, i - start + 1);
      }
    }
    return null;
  }
}
