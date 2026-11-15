using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Windows.Forms;

internal static class BeamLabPortable
{
    [STAThread]
    private static void Main()
    {
        Application.EnableVisualStyles();
        try
        {
            string root = AppDomain.CurrentDomain.BaseDirectory;
            string target = FindTarget(root);
            if (target == null)
            {
                MessageBox.Show(
                    "No se encontró BeamLabLEO-<versión>.html ni index.html junto a este ejecutable.\n\n" +
                    "Descarga el paquete portable completo y mantén los archivos juntos.",
                    "BeamLab LEO",
                    MessageBoxButtons.OK,
                    MessageBoxIcon.Warning);
                return;
            }

            string browser = FindBrowser();
            if (browser != null)
            {
                string uri = new Uri(target).AbsoluteUri;
                var psi = new ProcessStartInfo(browser)
                {
                    UseShellExecute = false,
                    Arguments = "--app=\"" + uri + "\" --no-first-run"
                };
                Process.Start(psi);
            }
            else
            {
                Process.Start(new ProcessStartInfo(target) { UseShellExecute = true });
            }
        }
        catch (Exception ex)
        {
            MessageBox.Show(
                "No se pudo abrir BeamLab LEO.\n\n" + ex.Message,
                "BeamLab LEO",
                MessageBoxButtons.OK,
                MessageBoxIcon.Error);
        }
    }

    private static string FindTarget(string root)
    {
        string launcher = Path.Combine(root, "index.html");
        if (File.Exists(launcher)) return launcher;

        return Directory.GetFiles(root, "BeamLabLEO-*.html")
            .Select(path => new { Path = path, Version = ParseVersion(path) })
            .Where(x => x.Version != null)
            .OrderByDescending(x => x.Version)
            .Select(x => x.Path)
            .FirstOrDefault();
    }

    private static Version ParseVersion(string path)
    {
        string name = Path.GetFileNameWithoutExtension(path);
        const string prefix = "BeamLabLEO-";
        if (!name.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) return null;
        Version version;
        return Version.TryParse(name.Substring(prefix.Length), out version) ? version : null;
    }

    private static string FindBrowser()
    {
        string pf86 = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFilesX86);
        string pf = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        string local = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
        string[] candidates =
        {
            Path.Combine(pf86, "Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine(pf, "Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine(local, "Microsoft", "Edge", "Application", "msedge.exe"),
            Path.Combine(pf86, "Google", "Chrome", "Application", "chrome.exe"),
            Path.Combine(pf, "Google", "Chrome", "Application", "chrome.exe"),
            Path.Combine(local, "Google", "Chrome", "Application", "chrome.exe")
        };
        return candidates.FirstOrDefault(File.Exists);
    }
}
