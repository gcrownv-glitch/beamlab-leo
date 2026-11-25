using System;
using System.Diagnostics;
using System.IO;
using System.Linq;
using System.Windows.Forms;

internal static class BeamLabPortable
{
    private sealed class SemVer : IComparable<SemVer>
    {
        public int Major;
        public int Minor;
        public int Patch;
        public string[] Pre;

        public static SemVer TryParse(string raw)
        {
            if (string.IsNullOrEmpty(raw)) return null;
            int plus = raw.IndexOf('+');
            if (plus >= 0) raw = raw.Substring(0, plus);
            int dash = raw.IndexOf('-');
            string core = dash >= 0 ? raw.Substring(0, dash) : raw;
            string prePart = dash >= 0 ? raw.Substring(dash + 1) : null;

            string[] nums = core.Split('.');
            if (nums.Length != 3) return null;
            int maj, min, pat;
            if (!int.TryParse(nums[0], out maj) || maj < 0) return null;
            if (!int.TryParse(nums[1], out min) || min < 0) return null;
            if (!int.TryParse(nums[2], out pat) || pat < 0) return null;

            string[] pre = null;
            if (prePart != null)
            {
                if (prePart.Length == 0) return null;
                pre = prePart.Split('.');
                for (int i = 0; i < pre.Length; i++)
                {
                    if (string.IsNullOrEmpty(pre[i])) return null;
                }
            }

            var sv = new SemVer();
            sv.Major = maj;
            sv.Minor = min;
            sv.Patch = pat;
            sv.Pre = pre;
            return sv;
        }

        public int CompareTo(SemVer other)
        {
            if (other == null) return 1;
            if (Major != other.Major) return Major.CompareTo(other.Major);
            if (Minor != other.Minor) return Minor.CompareTo(other.Minor);
            if (Patch != other.Patch) return Patch.CompareTo(other.Patch);
            if (Pre == null && other.Pre == null) return 0;
            if (Pre == null) return 1;
            if (other.Pre == null) return -1;

            int max = Math.Max(Pre.Length, other.Pre.Length);
            for (int i = 0; i < max; i++)
            {
                if (i >= Pre.Length) return -1;
                if (i >= other.Pre.Length) return 1;
                int na, nb;
                bool isA = int.TryParse(Pre[i], out na);
                bool isB = int.TryParse(other.Pre[i], out nb);
                if (isA && isB)
                {
                    if (na != nb) return na.CompareTo(nb);
                }
                else if (isA)
                {
                    return -1;
                }
                else if (isB)
                {
                    return 1;
                }
                else
                {
                    int c = string.CompareOrdinal(Pre[i], other.Pre[i]);
                    if (c != 0) return c;
                }
            }
            return 0;
        }
    }

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
        string best = Directory.GetFiles(root, "BeamLabLEO-*.html")
            .Select(path => new { Path = path, Version = ParseVersion(path) })
            .Where(x => x.Version != null)
            .OrderByDescending(x => x.Version)
            .Select(x => x.Path)
            .FirstOrDefault();
        if (best != null) return best;

        string launcher = Path.Combine(root, "index.html");
        return File.Exists(launcher) ? launcher : null;
    }

    private static SemVer ParseVersion(string path)
    {
        string name = Path.GetFileNameWithoutExtension(path);
        const string prefix = "BeamLabLEO-";
        if (!name.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) return null;
        return SemVer.TryParse(name.Substring(prefix.Length));
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
