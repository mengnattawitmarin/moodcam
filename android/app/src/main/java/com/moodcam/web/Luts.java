package com.moodcam.web;

import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.os.Environment;
import android.provider.MediaStore;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** Built-in 3D LUTs for the cinema preview: source curve (MoonLog / HLG / Natural) → Rec.709 → creative look. */
public final class Luts {
    public static final String[] NAMES = {"Rec.709", "Teal & Orange", "Warm Film", "Green Film", "Bleach Bypass", "Noir B&W", "Night Blue", "Golden Hour", "Vintage Fade", "Pastel Soft"};
    public static final int N = 33;

    /** RGB floats, red fastest then green then blue (same order as .cube and GL 3D textures). */
    public static float[] build(int look, String src) {
        float[] out = new float[N * N * N * 3]; int k = 0;
        for (int bi = 0; bi < N; bi++) for (int gi = 0; gi < N; gi++) for (int ri = 0; ri < N; ri++) {
            double[] c = toDisplay(ri / (N - 1.0), gi / (N - 1.0), bi / (N - 1.0), src);
            c = look(c, look);
            for (int i = 0; i < 3; i++) out[k++] = (float) Math.max(0, Math.min(1, c[i]));
        }
        return out;
    }

    // ---------------------------------------------------------------- source curves → display-referred Rec.709
    static double oetf(double l) { l = Math.max(0, Math.min(1, l)); return l < 0.018 ? 4.5 * l : 1.099 * Math.pow(l, 0.45) - 0.099; }
    static double tm(double x) { x = Math.max(0, x); return x * 1.25 / (1 + 0.25 * x); }
    static double moonInv(double y) { return Math.max(0, Math.expm1((y - 0.075) / 0.86 * Math.log1p(38)) / 38); }
    static double hlgInv(double v) { double a = 0.17883277, b = 0.28466892, c = 0.55991073; return v <= 0.5 ? v * v / 3 : (Math.exp((v - c) / a) + b) / 12; }
    static double[] toDisplay(double r, double g, double b, String src) {
        if ("log8".equals(src)) return new double[]{oetf(tm(moonInv(r) * 1.1)), oetf(tm(moonInv(g) * 1.1)), oetf(tm(moonInv(b) * 1.1))};
        if ("hlg10".equals(src)) {
            double lr = hlgInv(r), lg = hlgInv(g), lb = hlgInv(b);
            double R = 1.6605 * lr - 0.5876 * lg - 0.0728 * lb, G = -0.1246 * lr + 1.1329 * lg - 0.0083 * lb, B = -0.0182 * lr - 0.1006 * lg + 1.1187 * lb;
            return new double[]{oetf(tm(R * 3.4)), oetf(tm(G * 3.4)), oetf(tm(B * 3.4))};
        }
        return new double[]{r, g, b};
    }

    // ---------------------------------------------------------------- looks (display space)
    static double luma(double[] c) { return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; }
    static double curve(double x, double k) { x = Math.max(0, Math.min(1, x)); return x < 0.5 ? 0.5 * Math.pow(2 * x, k) : 1 - 0.5 * Math.pow(2 * (1 - x), k); }
    static void contrast(double[] c, double k) { for (int i = 0; i < 3; i++) c[i] = curve(c[i], k); }
    static void sat(double[] c, double s) { double y = luma(c); for (int i = 0; i < 3; i++) c[i] = y + (c[i] - y) * s; }
    static void add(double[] c, double r, double g, double b) { c[0] += r; c[1] += g; c[2] += b; }
    static void split(double[] c, double[] sh, double[] hi) { double w = Math.max(0, Math.min(1, luma(c))); for (int i = 0; i < 3; i++) c[i] += (1 - w) * sh[i] + w * hi[i]; }
    static void fade(double[] c, double f) { for (int i = 0; i < 3; i++) c[i] = f + c[i] * (1 - f); }
    static void gamma(double[] c, double g) { for (int i = 0; i < 3; i++) c[i] = Math.pow(Math.max(0, c[i]), g); }
    static double[] look(double[] c, int id) {
        switch (id) {
            case 1: contrast(c, 1.25); split(c, new double[]{-0.06, 0.015, 0.07}, new double[]{0.07, 0.02, -0.06}); sat(c, 1.08); break;
            case 2: add(c, 0.035, 0.01, -0.03); contrast(c, 1.15); split(c, new double[]{0.01, 0, -0.01}, new double[]{0.04, 0.02, -0.02}); sat(c, 1.05); fade(c, 0.025); break;
            case 3: split(c, new double[]{-0.02, 0.035, 0.0}, new double[]{0.03, -0.01, 0.02}); contrast(c, 1.12); sat(c, 0.94); break;
            case 4: { double y = luma(c); for (int i = 0; i < 3; i++) c[i] = c[i] * 0.55 + y * 0.45; contrast(c, 1.45); break; }
            case 5: { double y = luma(c); c[0] = c[1] = c[2] = y; contrast(c, 1.5); break; }
            case 6: add(c, -0.05, -0.005, 0.06); for (int i = 0; i < 3; i++) c[i] = Math.max(0, c[i] - 0.03) / 0.97; contrast(c, 1.3); sat(c, 0.85); break;
            case 7: add(c, 0.06, 0.025, -0.05); contrast(c, 1.1); split(c, new double[]{0.02, 0, -0.02}, new double[]{0.05, 0.03, -0.03}); sat(c, 1.15); break;
            case 8: sat(c, 0.75); split(c, new double[]{0.02, 0, 0.04}, new double[]{0.05, 0.03, 0}); contrast(c, 0.95); fade(c, 0.08); break;
            case 9: gamma(c, 0.88); sat(c, 0.8); contrast(c, 0.85); split(c, new double[]{0, 0.01, 0.02}, new double[]{0.03, 0.005, 0.02}); break;
            default: break;
        }
        return c;
    }

    // ---------------------------------------------------------------- .cube in / out
    public static String toCube(String title, float[] d, int n) {
        StringBuilder sb = new StringBuilder("TITLE \"" + title + "\"\nLUT_3D_SIZE " + n + "\nDOMAIN_MIN 0 0 0\nDOMAIN_MAX 1 1 1\n");
        for (int i = 0; i < d.length; i += 3) sb.append(String.format(Locale.US, "%.6f %.6f %.6f\n", d[i], d[i + 1], d[i + 2]));
        return sb.toString();
    }
    /** Returns {size, data...}: data length = size^3*3. Throws on a malformed file. */
    public static Object[] parseCube(InputStream in) throws Exception {
        BufferedReader r = new BufferedReader(new InputStreamReader(in)); String line; int n = 0; List<Float> v = new ArrayList<>();
        double[] dmin = {0, 0, 0}, dmax = {1, 1, 1};
        while ((line = r.readLine()) != null) {
            line = line.trim(); if (line.isEmpty() || line.startsWith("#")) continue;
            String[] p = line.split("\\s+");
            if (p[0].equals("LUT_3D_SIZE")) n = Integer.parseInt(p[1]);
            else if (p[0].equals("DOMAIN_MIN")) for (int i = 0; i < 3; i++) dmin[i] = Double.parseDouble(p[i + 1]);
            else if (p[0].equals("DOMAIN_MAX")) for (int i = 0; i < 3; i++) dmax[i] = Double.parseDouble(p[i + 1]);
            else if (Character.isDigit(p[0].charAt(0)) || p[0].charAt(0) == '-' || p[0].charAt(0) == '.') { if (p.length >= 3) for (int i = 0; i < 3; i++) v.add(Float.parseFloat(p[i])); }
        }
        if (n < 2 || n > 65 || v.size() != n * n * n * 3) throw new Exception("ไฟล์ LUT ไม่ถูกต้อง (ต้องเป็น 3D .cube ขนาด 2–65)");
        float[] d = new float[v.size()]; for (int i = 0; i < d.length; i++) d[i] = Math.max(0f, Math.min(1f, v.get(i)));
        return new Object[]{n, d};
    }
    public static Uri saveToDownloads(Context ctx, String name, String text) throws Exception {
        ContentValues cv = new ContentValues();
        cv.put(MediaStore.Downloads.DISPLAY_NAME, name); cv.put(MediaStore.Downloads.MIME_TYPE, "text/plain");
        cv.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS + "/MoonCam LUTs");
        Uri u = ctx.getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, cv);
        try (OutputStream o = ctx.getContentResolver().openOutputStream(u)) { o.write(text.getBytes("UTF-8")); }
        return u;
    }
}
