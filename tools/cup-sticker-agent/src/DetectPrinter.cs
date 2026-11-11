// Detect sticker printer — .NET 4.0 / Windows 7+. No PowerShell / no WMIC.exe.
using System;
using System.Collections.Generic;
using System.Drawing.Printing;
using System.Management;
using System.Text.RegularExpressions;

class Program {
  static int Main() {
    try {
      string env = Environment.GetEnvironmentVariable("BC_STICKER_PRINTER");
      if (!string.IsNullOrWhiteSpace(env) && IsReady(env.Trim())) {
        Console.WriteLine(env.Trim());
        return 0;
      }

      var preferred = new List<string>();
      // Prefer Xprinter driver via WMI (name may be renamed e.g. bingchun)
      try {
        using (var searcher = new ManagementObjectSearcher("SELECT Name,DriverName FROM Win32_Printer")) {
          foreach (ManagementObject mo in searcher.Get()) {
            string name = Convert.ToString(mo["Name"]) ?? "";
            string driver = Convert.ToString(mo["DriverName"]) ?? "";
            if (Regex.IsMatch(driver, @"xprinter|xp-d35", RegexOptions.IgnoreCase) ||
                Regex.IsMatch(name, @"xprinter|xp-d35", RegexOptions.IgnoreCase))
              preferred.Add(name);
          }
          foreach (ManagementObject mo in searcher.Get()) {
            string name = Convert.ToString(mo["Name"]) ?? "";
            if (Regex.IsMatch(name, @"^bingchun$", RegexOptions.IgnoreCase))
              preferred.Add(name);
          }
        }
      } catch { }

      foreach (string name in PrinterSettings.InstalledPrinters) {
        if (Regex.IsMatch(name ?? "", @"xprinter|xp-d35|bingchun", RegexOptions.IgnoreCase))
          preferred.Add(name);
      }
      foreach (string name in PrinterSettings.InstalledPrinters) {
        if (!Regex.IsMatch(name ?? "", @"pdf|onenote|fax|xps|microsoft|3d systems", RegexOptions.IgnoreCase))
          preferred.Add(name);
      }

      var seen = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
      foreach (var name in preferred) {
        if (string.IsNullOrWhiteSpace(name) || !seen.Add(name)) continue;
        if (IsReady(name)) {
          Console.WriteLine(name);
          return 0;
        }
      }
      Console.WriteLine("");
      return 1;
    } catch {
      Console.WriteLine("");
      return 1;
    }
  }

  static bool IsReady(string name) {
    try {
      using (var doc = new PrintDocument()) {
        doc.PrinterSettings.PrinterName = name;
        return doc.PrinterSettings.IsValid;
      }
    } catch { return false; }
  }
}
