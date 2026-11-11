// Bing Chun cup sticker printer — .NET 4.0 (Windows 7+). No PowerShell.
// csc /nologo /target:exe /r:System.Drawing.dll /r:System.Runtime.Serialization.dll /out:..\print-stickers.exe PrintStickers.cs
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Printing;
using System.Drawing.Text;
using System.IO;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;

[DataContract]
class Sticker {
  [DataMember] public string orderLabel = "";
  [DataMember] public string cupLabel = "";
  [DataMember] public string itemName = "";
  [DataMember] public string printedAt = "";
  [DataMember] public string advisoryEn = "";
  [DataMember] public string advisorySi = "";
}

[DataContract]
class Payload {
  [DataMember] public string printerName = "";
  [DataMember] public double widthMm = 40;
  [DataMember] public double heightMm = 30;
  [DataMember] public Sticker[] stickers = new Sticker[0];
}

class Program {
  static Sticker current;
  static double WidthMm = 40;
  static double HeightMm = 30;

  static int Main(string[] args) {
    try {
      string jsonPath = null;
      string printerOverride = Environment.GetEnvironmentVariable("BC_STICKER_PRINTER") ?? "";
      for (int i = 0; i < args.Length; i++) {
        if ((args[i] == "-JsonPath" || args[i] == "/JsonPath") && i + 1 < args.Length) jsonPath = args[++i];
        else if ((args[i] == "-PrinterName" || args[i] == "/PrinterName") && i + 1 < args.Length) printerOverride = args[++i];
        else if (!args[i].StartsWith("-") && jsonPath == null) jsonPath = args[i];
      }
      if (string.IsNullOrEmpty(jsonPath) || !File.Exists(jsonPath)) {
        Console.Error.WriteLine("Usage: print-stickers.exe -JsonPath job.json");
        return 2;
      }

      string raw = File.ReadAllText(jsonPath, Encoding.UTF8);
      if (raw.Length > 0 && raw[0] == '\uFEFF') raw = raw.Substring(1);

      Payload payload;
      using (var ms = new MemoryStream(Encoding.UTF8.GetBytes(raw))) {
        var ser = new DataContractJsonSerializer(typeof(Payload));
        payload = (Payload)ser.ReadObject(ms);
      }
      if (payload == null) throw new Exception("Invalid JSON");
      if (payload.stickers == null) payload.stickers = new Sticker[0];
      if (!string.IsNullOrWhiteSpace(printerOverride)) payload.printerName = printerOverride.Trim();
      if (string.IsNullOrWhiteSpace(payload.printerName))
        payload.printerName = Environment.GetEnvironmentVariable("BC_STICKER_PRINTER") ?? "bingchun";

      WidthMm = payload.widthMm > 0 ? payload.widthMm : 40;
      HeightMm = payload.heightMm > 0 ? payload.heightMm : 30;

      string printer = ResolvePrinter(payload.printerName);
      int paperW = ToHundredths(WidthMm);
      int paperH = ToHundredths(HeightMm);
      int printed = 0;

      foreach (var st in payload.stickers) {
        if (st == null) continue;
        current = st;
        using (var doc = new PrintDocument()) {
          doc.PrinterSettings.PrinterName = printer;
          if (!doc.PrinterSettings.IsValid)
            throw new Exception("Printer not found or not ready: '" + printer + "'");
          doc.DocumentName = "Cup " + st.cupLabel + " " + st.orderLabel;
          doc.OriginAtMargins = false;
          doc.DefaultPageSettings.Margins = new Margins(0, 0, 0, 0);
          doc.DefaultPageSettings.Landscape = false;
          doc.DefaultPageSettings.PaperSize = new PaperSize("CupSticker", paperW, paperH);
          doc.PrintController = new StandardPrintController();
          doc.PrintPage += OnPrintPage;
          doc.Print();
        }
        printed++;
        Thread.Sleep(180);
      }
      Console.WriteLine("PRINTED " + printed);
      return 0;
    } catch (Exception ex) {
      Console.Error.WriteLine(ex.Message);
      return 1;
    }
  }

  static string ResolvePrinter(string requested) {
    if (!string.IsNullOrWhiteSpace(requested) && IsReady(requested.Trim())) return requested.Trim();
    var preferred = new List<string>();
    string env = Environment.GetEnvironmentVariable("BC_STICKER_PRINTER");
    if (!string.IsNullOrWhiteSpace(env)) preferred.Add(env.Trim());
    foreach (string name in PrinterSettings.InstalledPrinters) {
      if (Regex.IsMatch(name ?? "", @"xprinter|xp-d35|bingchun", RegexOptions.IgnoreCase))
        preferred.Add(name);
    }
    preferred.Add("Xprinter XP-D35B");
    preferred.Add("bingchun");
    var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
    foreach (var name in preferred) {
      if (string.IsNullOrWhiteSpace(name) || !seen.Add(name)) continue;
      if (IsReady(name)) return name;
    }
    var all = new List<string>();
    foreach (string n in PrinterSettings.InstalledPrinters) all.Add("'" + n + "'");
    throw new Exception("Printer not found or not ready: '" + requested + "'. Installed: " + string.Join(", ", all.ToArray()));
  }

  static bool IsReady(string name) {
    try {
      using (var doc = new PrintDocument()) {
        doc.PrinterSettings.PrinterName = name;
        return doc.PrinterSettings.IsValid;
      }
    } catch { return false; }
  }

  static int ToHundredths(double mm) {
    return (int)Math.Round((mm / 25.4) * 100);
  }

  static string[] SplitAdvisory(string text) {
    if (string.IsNullOrWhiteSpace(text)) return new string[0];
    var parts = Regex.Split(text.Trim(), @"(?<=\.)\s+");
    var list = new List<string>();
    foreach (var p in parts) if (!string.IsNullOrWhiteSpace(p)) list.Add(p.Trim());
    return list.Count > 0 ? list.ToArray() : new[] { text.Trim() };
  }

  static List<string> WrapWords(Graphics g, Font font, string text, float maxWidthMm, int maxLines) {
    var words = (text ?? "").Split(new[] { ' ' }, StringSplitOptions.RemoveEmptyEntries);
    var lines = new List<string>();
    string cur = "";
    foreach (var w in words) {
      string trial = string.IsNullOrEmpty(cur) ? w : cur + " " + w;
      if (g.MeasureString(trial, font).Width <= maxWidthMm || string.IsNullOrEmpty(cur)) cur = trial;
      else {
        lines.Add(cur);
        cur = w;
        if (lines.Count >= maxLines) break;
      }
    }
    if (!string.IsNullOrEmpty(cur) && lines.Count < maxLines) lines.Add(cur);
    if (lines.Count == 0) lines.Add(text ?? "");
    return lines;
  }

  static void OnPrintPage(object sender, PrintPageEventArgs e) {
    var s = current;
    var g = e.Graphics;
    g.PageUnit = GraphicsUnit.Millimeter;
    g.TextRenderingHint = TextRenderingHint.AntiAliasGridFit;
    g.SmoothingMode = SmoothingMode.HighQuality;
    g.Clear(Color.White);

    float padL = 4.2f, padY = 0.8f;
    float wrapW = Math.Max(20f, (float)WidthMm - padL - 4.2f);
    float contentLeft = padL;

    using (var orderFont = new Font("Arial", 9, FontStyle.Bold, GraphicsUnit.Point))
    using (var qtyFont = new Font("Arial", 9, FontStyle.Bold, GraphicsUnit.Point))
    using (var metaFont = new Font("Arial", 5, FontStyle.Regular, GraphicsUnit.Point))
    using (var advEn = new Font("Arial", 3.9f, FontStyle.Regular, GraphicsUnit.Point))
    using (var advSi = new Font("Nirmala UI", 3.7f, FontStyle.Regular, GraphicsUnit.Point))
    using (var sfLeftMid = new StringFormat { Alignment = StringAlignment.Near, LineAlignment = StringAlignment.Center, FormatFlags = StringFormatFlags.NoClip, Trimming = StringTrimming.None })
    using (var sfRightMid = new StringFormat { Alignment = StringAlignment.Far, LineAlignment = StringAlignment.Center, FormatFlags = StringFormatFlags.NoClip, Trimming = StringTrimming.None })
    using (var sfCenterMid = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Center, FormatFlags = StringFormatFlags.NoClip, Trimming = StringTrimming.None })
    using (var sfCenterWrap = new StringFormat { Alignment = StringAlignment.Center, LineAlignment = StringAlignment.Near, Trimming = StringTrimming.Word, FormatFlags = StringFormatFlags.LineLimit }) {
      float siReserveMm = 6.8f;
      float siTop = (float)HeightMm - padY - siReserveMm;
      float topBudget = Math.Max(10f, siTop - padY - 0.4f);
      float headerH = 4f, timeH = 2.2f, gap1 = 0.15f, gap2 = 0.2f, enLineH = 2f;
      var enLines = SplitAdvisory(s.advisoryEn);
      float enH = enLines.Length * enLineH;
      float nameBudget = Math.Max(4f, topBudget - headerH - gap1 - timeH - gap2 - enH);
      int maxNameLines = nameBudget < 5f ? 1 : (nameBudget < 7.5f ? 2 : 3);

      Font itemFont = null;
      List<string> itemLines = null;
      float[] trySizes = { 11f, 10f, 9f, 8f, 7.5f, 7f };
      foreach (var sz in trySizes) {
        var f = new Font("Arial", sz, FontStyle.Bold, GraphicsUnit.Point);
        var lines = WrapWords(g, f, s.itemName, wrapW, maxNameLines);
        bool ok = true;
        foreach (var line in lines) {
          if (g.MeasureString(line, f).Width > wrapW + 0.5f) { ok = false; break; }
        }
        if (ok || sz == trySizes[trySizes.Length - 1]) { itemFont = f; itemLines = lines; break; }
        f.Dispose();
      }
      if (itemFont == null) {
        itemFont = new Font("Arial", 8, FontStyle.Bold, GraphicsUnit.Point);
        itemLines = WrapWords(g, itemFont, s.itemName, wrapW, maxNameLines);
      }

      float itemLineH = Math.Min(2.8f, Math.Max(2.3f, nameBudget / Math.Max(1, itemLines.Count)));
      if (itemLines.Count * itemLineH > nameBudget) itemLineH = nameBudget / Math.Max(1, itemLines.Count);

      float blockH = headerH + gap1 + (itemLines.Count * itemLineH) + timeH + gap2 + enH;
      float y = padY + Math.Max(0f, (topBudget - blockH) / 2f);

      string orderText = s.orderLabel ?? "";
      string cupText = s.cupLabel ?? "";
      float orderDrawW = Math.Max(g.MeasureString(orderText, orderFont).Width + 1.8f, 12f);
      float cupDrawW = Math.Max(g.MeasureString(cupText, qtyFont).Width + 1.2f, 6f);
      float cupDrawLeft = contentLeft + wrapW - cupDrawW;
      if (cupDrawLeft < contentLeft + orderDrawW + 1f) cupDrawLeft = contentLeft + orderDrawW + 1f;

      Brush brush = Brushes.Black;
      g.DrawString(orderText, orderFont, brush, new RectangleF(contentLeft, y, orderDrawW, headerH), sfLeftMid);
      g.DrawString(cupText, qtyFont, brush, new RectangleF(cupDrawLeft, y, cupDrawW, headerH), sfRightMid);
      y += headerH + gap1;

      foreach (var line in itemLines) {
        g.DrawString(line, itemFont, brush, new RectangleF(contentLeft, y, wrapW, itemLineH), sfCenterMid);
        y += itemLineH;
      }

      string printedAt = s.printedAt ?? "";
      if (string.IsNullOrWhiteSpace(printedAt)) printedAt = DateTime.Now.ToString("dd/MM HH:mm");
      else {
        printedAt = Regex.Replace(printedAt, @"(\d{1,2}:\d{2}):\d{2}\s*$", "$1").Trim();
        printedAt = Regex.Replace(printedAt.Replace(',', ' '), @"\s+", " ").Trim();
        var m = Regex.Match(printedAt, @"^(\d{1,2}/\d{1,2})\s+(\d{1,2})[:\s](\d{2})$");
        if (m.Success) printedAt = m.Groups[1].Value + " " + m.Groups[2].Value + ":" + m.Groups[3].Value;
      }
      g.DrawString(printedAt, metaFont, brush, new RectangleF(contentLeft, y, wrapW, timeH), sfCenterMid);
      y += timeH + gap2;

      foreach (var line in enLines) {
        if (y + enLineH > siTop - 0.2f) break;
        g.DrawString(line, advEn, brush, new RectangleF(contentLeft, y, wrapW, enLineH), sfCenterWrap);
        y += enLineH;
      }
      if (!string.IsNullOrWhiteSpace(s.advisorySi))
        g.DrawString(s.advisorySi, advSi, brush, new RectangleF(contentLeft, siTop, wrapW, siReserveMm), sfCenterWrap);
      itemFont.Dispose();
    }
    e.HasMorePages = false;
  }
}
