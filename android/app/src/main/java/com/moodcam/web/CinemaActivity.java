package com.moodcam.web;

import android.Manifest;
import android.app.Activity;
import android.content.ContentValues;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.opengl.GLSurfaceView;
import android.content.pm.PackageManager;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Matrix;
import android.graphics.Paint;
import android.graphics.Rect;
import android.graphics.RectF;
import android.graphics.SurfaceTexture;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraDevice;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CameraMetadata;
import android.hardware.camera2.CaptureRequest;
import android.hardware.camera2.CaptureResult;
import android.hardware.camera2.TotalCaptureResult;
import android.hardware.camera2.params.DynamicRangeProfiles;
import android.hardware.camera2.params.MeteringRectangle;
import android.hardware.camera2.params.OutputConfiguration;
import android.hardware.camera2.params.SessionConfiguration;
import android.hardware.camera2.params.StreamConfigurationMap;
import android.hardware.camera2.params.TonemapCurve;
import android.media.MediaCodec;
import android.media.MediaCodecInfo;
import android.media.MediaRecorder;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.Looper;
import android.os.ParcelFileDescriptor;
import android.os.StatFs;
import android.os.SystemClock;
import android.provider.MediaStore;
import android.util.Range;
import android.util.Size;
import android.util.SizeF;
import android.view.ScaleGestureDetector;
import android.view.Gravity;
import android.view.MotionEvent;
import android.view.Surface;
import android.view.TextureView;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.SeekBar;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.File;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.Executor;

/**
 * MoonCam Cinema: native Camera2 video recorder (FiLMiC-style).
 * Profiles: Natural (8-bit H.264) · MoonLog (8-bit, log tone curve applied in the camera ISP) · HLG 10-bit (HEVC Main10, flat HDR curve).
 */
public class CinemaActivity extends Activity {
    static final int GOLD = 0xFFD8B87A, INK = 0xFFF4EFE6, MUTED = 0xFF9A958B, RED = 0xFFE5483B, PANEL = 0xCC0B0B0D;
    static final int REQ_PERMS = 31;

    CameraManager cm; String camId; CameraCharacteristics ch; CameraDevice dev; CameraCaptureSession session;
    HandlerThread bgThread; Handler bg; final Handler ui = new Handler(Looper.getMainLooper());
    GLSurfaceView gv; LutPreview lp; volatile SurfaceTexture camST; Surface previewSurface, recSurface; Size videoSize, previewSize;
    MediaRecorder mr; ParcelFileDescriptor pfd; Uri outUri; volatile boolean recording; long recStart;
    SharedPreferences sp;

    // settings
    int fps = 30; String res = "1080"; String profile = "natural";
    boolean manualExp = false; int iso = 100; int angle = 180; int ev = 0;
    int wbIdx = 0; boolean awbLock = false; boolean manualFocus = false; float focusDist = 0f; boolean stab = true; int guide = 1;
    MeteringRectangle[] afRegions = null;
    static final int[] WB_MODES = {CaptureRequest.CONTROL_AWB_MODE_AUTO, CaptureRequest.CONTROL_AWB_MODE_INCANDESCENT, CaptureRequest.CONTROL_AWB_MODE_FLUORESCENT,
            CaptureRequest.CONTROL_AWB_MODE_DAYLIGHT, CaptureRequest.CONTROL_AWB_MODE_CLOUDY_DAYLIGHT, CaptureRequest.CONTROL_AWB_MODE_SHADE};
    static final String[] WB_NAMES = {"AWB", "3200K", "4000K", "5600K", "6500K", "7500K"};
    static final String[] GUIDES = {"ปิด", "3×3", "2.39", "1.85", "9:16"};

    // capabilities
    boolean capManual, cap10, capCurve; Range<Integer> isoRange; Range<Long> expRange; Range<Integer> evRange; float minFocus;
    final List<Integer> fpsList = new ArrayList<>(); final List<String> resList = new ArrayList<>(); final List<String> profList = new ArrayList<>();
    int liveIso = 0; long liveExp = 0; long lastUi = 0;
    // v2: shutter as 1/x, aperture, AE/AF lock, LUT view assist, scopes
    int shutterDen = 60; float[] apertures; int apIdx = 0; boolean aeLock = false, afLock = false;
    int lutIdx = -1; float[] customLut; int customN = 33; String customName = null; int rotOffset = 0;
    boolean zebra = false, peaking = false, falseColor = false;
    LinearLayout strip; HorizontalScrollView stripWrap; String stripMode = null; TextView segAuto, segManual, minusBtn, plusBtn;
    static final int[] ISO_STEPS = {50, 64, 80, 100, 125, 160, 200, 250, 320, 400, 500, 640, 800, 1000, 1250, 1600, 2000, 2500, 3200, 4000, 5000, 6400, 8000, 10000, 12800};
    static final int[] SH_STEPS = {24, 25, 30, 48, 50, 60, 96, 100, 120, 125, 180, 250, 500, 1000, 2000, 4000, 8000};
    static final int REQ_LUT = 41;
    static final int BAR = 0xF20D0E10, LABEL = 0xFF8C9096, WHITE = 0xFFF2F2F2, AUTOC = 0xFF8FD3FF, AMBER = 0xFFF5B83D, TOPBAR = 50, BOTBAR = 46;
    LinearLayout bot, tcBox; TextView clipTv, batTv; ScopeView scope; int scopeMode = 0, quality = 1; long batAt = 0; String batTxt = "";
    String mainId; List<Lens> lenses = new ArrayList<>(); int lensIdx = 0; float zoomRatio = 1f; Range<Float> zoomRange; LinearLayout lensCol;

    // UI
    FrameLayout root; LinearLayout bar, panel; TextView tc, info, panelLabel, recDot; SeekBar panelSeek; FrameLayout recBtn; View recInner;
    ProgressBar meter; GuideView guides; String panelKey = null;
    final List<TextView[]> chips = new ArrayList<>();

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_FULLSCREEN);
        cm = (CameraManager) getSystemService(CAMERA_SERVICE);
        sp = getSharedPreferences("cinema", MODE_PRIVATE);
        fps = sp.getInt("fps", 30); res = sp.getString("res", "1080"); profile = sp.getString("profile", "natural");
        stab = sp.getBoolean("stab", true); guide = sp.getInt("guide", 1);
        lutIdx = sp.getInt("lut", -1); rotOffset = sp.getInt("rotOffset", 0); shutterDen = sp.getInt("shutterDen", 0);
        loadCustomLut(); quality = sp.getInt("quality", 1); scopeMode = sp.getInt("scope", 1);
        pickCamera();
        buildUi();
    }

    @Override protected void onResume() {
        super.onResume(); hideSystemUi();
        bgThread = new HandlerThread("cinema"); bgThread.start(); bg = new Handler(bgThread.getLooper());
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED || checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO}, REQ_PERMS);
        } else if (camST != null) openCamera();
        if (gv != null) gv.onResume();
    }

    @Override protected void onPause() {
        if (recording) stopRecording();
        closeCamera();
        if (bgThread != null) { bgThread.quitSafely(); bgThread = null; bg = null; }
        if (gv != null) gv.onPause();
        super.onPause();
    }

    @Override public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        if (code != REQ_PERMS) return;
        if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) { if (camST != null) openCamera(); }
        else { toast("ต้องอนุญาตกล้องก่อน"); finish(); }
    }

    @Override public void onBackPressed() { if (recording) { stopRecording(); return; } super.onBackPressed(); }

    @SuppressWarnings("deprecation")
    void hideSystemUi() {
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
    }

    // ------------------------------------------------------------------ capabilities
    void pickCamera() {
        try {
            for (String id : cm.getCameraIdList()) {
                CameraCharacteristics c = cm.getCameraCharacteristics(id);
                Integer f = c.get(CameraCharacteristics.LENS_FACING);
                if (f != null && f == CameraCharacteristics.LENS_FACING_BACK) { camId = id; ch = c; break; }
            }
            if (camId == null) { camId = cm.getCameraIdList()[0]; ch = cm.getCameraCharacteristics(camId); }
            mainId = camId;
            try { lenses = lensPlan(cm); } catch (Exception e) { lenses = new ArrayList<>(); }
            for (int i = 0; i < lenses.size(); i++) if (lenses.get(i).ratio == 1f) lensIdx = i;
        } catch (Exception e) { toast("เปิดกล้องไม่ได้: " + e.getMessage()); finish(); return; }
        readCaps();
    }
    void readCaps() {
        fpsList.clear(); resList.clear(); profList.clear();
        zoomRange = Build.VERSION.SDK_INT >= 30 ? ch.get(CameraCharacteristics.CONTROL_ZOOM_RATIO_RANGE) : null;
        int[] caps = ch.get(CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES);
        capManual = has(caps, CameraMetadata.REQUEST_AVAILABLE_CAPABILITIES_MANUAL_SENSOR);
        cap10 = false;
        if (Build.VERSION.SDK_INT >= 33 && has(caps, CameraMetadata.REQUEST_AVAILABLE_CAPABILITIES_DYNAMIC_RANGE_TEN_BIT)) {
            DynamicRangeProfiles p = ch.get(CameraCharacteristics.REQUEST_AVAILABLE_DYNAMIC_RANGE_PROFILES);
            cap10 = p != null && p.getSupportedProfiles().contains(DynamicRangeProfiles.HLG10);
        }
        capCurve = has(ch.get(CameraCharacteristics.TONEMAP_AVAILABLE_TONE_MAP_MODES), CameraMetadata.TONEMAP_MODE_CONTRAST_CURVE);
        isoRange = ch.get(CameraCharacteristics.SENSOR_INFO_SENSITIVITY_RANGE);
        expRange = ch.get(CameraCharacteristics.SENSOR_INFO_EXPOSURE_TIME_RANGE);
        evRange = ch.get(CameraCharacteristics.CONTROL_AE_COMPENSATION_RANGE);
        Float mf = ch.get(CameraCharacteristics.LENS_INFO_MINIMUM_FOCUS_DISTANCE); minFocus = mf == null ? 0 : mf;
        if (isoRange == null || expRange == null) capManual = false;
        if (capManual) iso = Math.max(isoRange.getLower(), Math.min(isoRange.getUpper(), 100));
        apertures = ch.get(CameraCharacteristics.LENS_INFO_AVAILABLE_APERTURES); if (apertures == null || apertures.length == 0) apertures = null; if (apertures != null && apIdx >= apertures.length) apIdx = 0;

        StreamConfigurationMap map = ch.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
        Size[] vs = map.getOutputSizes(MediaRecorder.class);
        if (hasSize(vs, 3840, 2160)) resList.add("4K");
        if (hasSize(vs, 1920, 1080)) resList.add("1080");
        if (hasSize(vs, 1280, 720)) resList.add("720");
        if (resList.isEmpty()) resList.add("1080");
        if (!resList.contains(res)) res = resList.contains("1080") ? "1080" : resList.get(0);

        Range<Integer>[] fr = ch.get(CameraCharacteristics.CONTROL_AE_AVAILABLE_TARGET_FPS_RANGES);
        for (int t : new int[]{24, 25, 30, 60}) if (fr != null) for (Range<Integer> r : fr) if (r.getUpper() == t || (r.getLower() <= t && r.getUpper() >= t && t != 60)) { fpsList.add(t); break; }
        if (fpsList.isEmpty()) fpsList.add(30);
        if (!fpsList.contains(fps)) fps = fpsList.contains(30) ? 30 : fpsList.get(0);

        profList.add("natural"); if (capCurve) profList.add("log8"); if (cap10) profList.add("hlg10");
        if (!profList.contains(profile)) profile = "natural";
    }
    void selectLens(int i) {
        if (i < 0 || i >= lenses.size()) return;
        Lens l = lenses.get(i); String target = l.zoom ? mainId : l.camId;
        if (!target.equals(camId)) {
            if (recording) { toast("หยุดบันทึกก่อนสลับกล้องตัวนี้"); return; }
            try { camId = target; ch = cm.getCameraCharacteristics(camId); } catch (Exception e) { toast("สลับเลนส์ไม่ได้"); return; }
            readCaps(); lensIdx = i; zoomRatio = l.zoom ? l.ratio : 1f;
            if (bg != null) bg.post(() -> { closeCamera(); openCamera(); });
        } else { lensIdx = i; zoomRatio = l.zoom ? l.ratio : 1f; updateRepeating(); }
        toast("เลนส์ " + l.label + "× · " + Math.round(l.eq) + "mm" + (l.zoom ? "" : " (กล้องแยก)"));
        renderLenses(); refreshChips();
    }
    void renderLenses() {
        if (lensCol == null) return; lensCol.removeAllViews();
        for (int i = 0; i < lenses.size(); i++) {
            final int idx = i; Lens l = lenses.get(i); boolean on = i == lensIdx;
            TextView b = new TextView(this); b.setGravity(Gravity.CENTER); b.setTextSize(12); b.setTypeface(Typeface.DEFAULT_BOLD);
            String txt = l.label; if (on && l.zoom && Math.abs(zoomRatio - l.ratio) > 0.05f) txt = String.format(Locale.US, "%.1f", zoomRatio);
            b.setText(txt + "×"); b.setTextColor(on ? GOLD : INK);
            GradientDrawable g = new GradientDrawable(); g.setShape(GradientDrawable.OVAL); g.setColor(on ? 0xCC1B1408 : 0x99000000); if (on) g.setStroke(dp(1.5f), GOLD); b.setBackground(g);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(dp(46), dp(46)); lp.setMargins(0, dp(5), 0, dp(5));
            b.setOnClickListener(v -> selectLens(idx)); lensCol.addView(b, lp);
        }
    }
    static boolean has(int[] a, int v) { if (a == null) return false; for (int x : a) if (x == v) return true; return false; }
    static boolean hasSize(Size[] a, int w, int h) { if (a == null) return false; for (Size s : a) if (s.getWidth() == w && s.getHeight() == h) return true; return false; }

    Size chooseVideoSize() {
        if ("4K".equals(res)) return new Size(3840, 2160);
        if ("720".equals(res)) return new Size(1280, 720);
        return new Size(1920, 1080);
    }
    Size choosePreviewSize() {
        StreamConfigurationMap map = ch.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
        Size best = new Size(1280, 720);
        for (Size s : map.getOutputSizes(SurfaceTexture.class)) {
            if (s.getWidth() * 9 == s.getHeight() * 16 && s.getWidth() <= 1920 && s.getWidth() > best.getWidth()) best = s;
        }
        return best;
    }
    int bitrate() {
        int[] t = "4K".equals(res) ? new int[]{60, 110, 160} : "720".equals(res) ? new int[]{12, 20, 30} : new int[]{24, 45, 70};
        double m = t[Math.max(0, Math.min(2, quality))];
        if (fps >= 50) m *= 1.4;
        if ("hlg10".equals(profile)) m *= 1.15;
        return (int) (m * 1_000_000);
    }
    boolean useHevc() { return "hlg10".equals(profile) || quality >= 1; }
    String profName(String p) { return "hlg10".equals(p) ? "HLG 10-bit" : "log8".equals(p) ? "MoonLog" : "Natural"; }

    // ------------------------------------------------------------------ camera
    void openCamera() {
        if (dev != null || bg == null) return;
        try { cm.openCamera(camId, new CameraDevice.StateCallback() {
            @Override public void onOpened(CameraDevice d) { dev = d; createSession(); }
            @Override public void onDisconnected(CameraDevice d) { d.close(); dev = null; }
            @Override public void onError(CameraDevice d, int e) { d.close(); dev = null; ui.post(() -> toast("กล้องผิดพลาด (" + e + ")")); }
        }, bg); } catch (SecurityException | CameraAccessException e) { toast("เปิดกล้องไม่ได้: " + e.getMessage()); }
    }
    void closeCamera() {
        try { if (session != null) session.close(); } catch (Exception ignored) {}
        session = null;
        if (dev != null) { dev.close(); dev = null; }
        if (recSurface != null) { recSurface.release(); recSurface = null; }
    }

    void createSession() {
        if (dev == null) return;
        try {
            if (session != null) { session.close(); session = null; }
            videoSize = chooseVideoSize(); previewSize = choosePreviewSize();
            ui.post(this::layoutPreview);
            SurfaceTexture st = camST; if (st == null) return;
            if (lp != null) { lp.bufW = previewSize.getWidth(); lp.bufH = previewSize.getHeight(); }
            st.setDefaultBufferSize(previewSize.getWidth(), previewSize.getHeight());
            previewSurface = new Surface(st);
            if (recSurface != null) recSurface.release();
            recSurface = MediaCodec.createPersistentInputSurface();
            MediaRecorder prime = buildRecorder(new File(getCacheDir(), "prime.mp4").getAbsolutePath(), null, false);
            prime.prepare(); prime.release();
            List<OutputConfiguration> outs = new ArrayList<>();
            OutputConfiguration a = new OutputConfiguration(previewSurface), r = new OutputConfiguration(recSurface);
            if ("hlg10".equals(profile) && Build.VERSION.SDK_INT >= 33) { a.setDynamicRangeProfile(DynamicRangeProfiles.HLG10); r.setDynamicRangeProfile(DynamicRangeProfiles.HLG10); }
            outs.add(a); outs.add(r);
            Executor ex = run -> { if (bg != null) bg.post(run); };
            dev.createCaptureSession(new SessionConfiguration(SessionConfiguration.SESSION_REGULAR, outs, ex, new CameraCaptureSession.StateCallback() {
                @Override public void onConfigured(CameraCaptureSession s) { session = s; updateRepeating(); ui.post(CinemaActivity.this::refreshUi); }
                @Override public void onConfigureFailed(CameraCaptureSession s) { fallback("เครื่องไม่รองรับ " + profName(profile) + " ที่ " + res + "/" + fps + "fps"); }
            }));
        } catch (Exception e) { fallback("ตั้งค่ากล้องไม่ได้: " + e.getMessage()); }
    }
    void fallback(String why) {
        ui.post(() -> toast(why + " — กลับไปใช้ Natural 1080p"));
        if ("natural".equals(profile) && "1080".equals(res)) return;
        profile = "natural"; if (resList.contains("1080")) res = "1080"; savePrefs();
        if (bg != null) bg.post(this::createSession);
    }

    MediaRecorder buildRecorder(String path, java.io.FileDescriptor fd, boolean audio) throws Exception { return buildRecorder(path, fd, audio, 1); }
    MediaRecorder buildRecorder(String path, java.io.FileDescriptor fd, boolean audio, int channels) throws Exception {
        MediaRecorder r = Build.VERSION.SDK_INT >= 31 ? new MediaRecorder(this) : new MediaRecorder();
        if (audio) r.setAudioSource(MediaRecorder.AudioSource.CAMCORDER);
        r.setVideoSource(MediaRecorder.VideoSource.SURFACE);
        r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
        if (fd != null) r.setOutputFile(fd); else r.setOutputFile(path);
        r.setVideoEncodingBitRate(bitrate());
        r.setVideoFrameRate(fps);
        r.setVideoSize(videoSize.getWidth(), videoSize.getHeight());
        boolean hlg = "hlg10".equals(profile);
        r.setVideoEncoder(useHevc() ? MediaRecorder.VideoEncoder.HEVC : MediaRecorder.VideoEncoder.H264);
        if (hlg) r.setVideoEncodingProfileLevel(MediaCodecInfo.CodecProfileLevel.HEVCProfileMain10, MediaCodecInfo.CodecProfileLevel.HEVCMainTierLevel51);
        if (audio) { r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC); r.setAudioEncodingBitRate(channels == 2 ? 256000 : 160000); r.setAudioSamplingRate(48000); r.setAudioChannels(channels); }
        r.setInputSurface(recSurface);
        r.setOrientationHint(orientationHint());
        return r;
    }
    @SuppressWarnings("deprecation")
    int displayDegrees() { int r = getWindowManager().getDefaultDisplay().getRotation(); return r == Surface.ROTATION_90 ? 90 : r == Surface.ROTATION_180 ? 180 : r == Surface.ROTATION_270 ? 270 : 0; }
    int orientationHint() { Integer s = ch.get(CameraCharacteristics.SENSOR_ORIENTATION); return ((s == null ? 90 : s) - displayDegrees() + 360) % 360; }

    void updateRepeating() {
        if (session == null || dev == null) return;
        try {
            CaptureRequest.Builder b = dev.createCaptureRequest(recording ? CameraDevice.TEMPLATE_RECORD : CameraDevice.TEMPLATE_PREVIEW);
            b.addTarget(previewSurface); if (recording) b.addTarget(recSurface);
            applySettings(b);
            session.setRepeatingRequest(b.build(), captureCb, bg);
        } catch (Exception e) { ui.post(() -> toast("ตั้งค่าไม่ได้: " + e.getMessage())); }
    }
    void applySettings(CaptureRequest.Builder b) {
        b.set(CaptureRequest.CONTROL_MODE, CaptureRequest.CONTROL_MODE_AUTO);
        b.set(CaptureRequest.CONTROL_AE_TARGET_FPS_RANGE, fpsRange());
        if (manualExp && capManual) {
            b.set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_OFF);
            b.set(CaptureRequest.SENSOR_SENSITIVITY, iso);
            if (shutterDen < fps) shutterDen = defaultDen();
            long frame = 1_000_000_000L / fps, exp = Math.min(frame, 1_000_000_000L / shutterDen);
            exp = Math.max(expRange.getLower(), Math.min(expRange.getUpper(), exp));
            b.set(CaptureRequest.SENSOR_EXPOSURE_TIME, exp); b.set(CaptureRequest.SENSOR_FRAME_DURATION, frame);
        } else {
            b.set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON);
            b.set(CaptureRequest.CONTROL_AE_EXPOSURE_COMPENSATION, ev);
            b.set(CaptureRequest.CONTROL_AE_LOCK, aeLock);
            if (afRegions != null) b.set(CaptureRequest.CONTROL_AE_REGIONS, afRegions);
        }
        if (apertures != null && apertures.length > 1) b.set(CaptureRequest.LENS_APERTURE, apertures[apIdx]);
        b.set(CaptureRequest.CONTROL_AWB_MODE, WB_MODES[wbIdx]); b.set(CaptureRequest.CONTROL_AWB_LOCK, awbLock);
        if (manualFocus && minFocus > 0) { b.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_OFF); b.set(CaptureRequest.LENS_FOCUS_DISTANCE, focusDist); }
        else { b.set(CaptureRequest.CONTROL_AF_MODE, afLock ? CaptureRequest.CONTROL_AF_MODE_AUTO : CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_VIDEO); if (afRegions != null) b.set(CaptureRequest.CONTROL_AF_REGIONS, afRegions); }
        b.set(CaptureRequest.CONTROL_VIDEO_STABILIZATION_MODE, stab ? CaptureRequest.CONTROL_VIDEO_STABILIZATION_MODE_ON : CaptureRequest.CONTROL_VIDEO_STABILIZATION_MODE_OFF);
        if (zoomRange != null && Build.VERSION.SDK_INT >= 30) b.set(CaptureRequest.CONTROL_ZOOM_RATIO, Math.max(zoomRange.getLower(), Math.min(zoomRange.getUpper(), zoomRatio)));
        if ("log8".equals(profile) && capCurve) { b.set(CaptureRequest.TONEMAP_MODE, CaptureRequest.TONEMAP_MODE_CONTRAST_CURVE); b.set(CaptureRequest.TONEMAP_CURVE, logCurve()); }
        if (quality == 2) { // MAX: hand the encoder a cleaner, less processed picture for grading
            if (has(ch.get(CameraCharacteristics.EDGE_AVAILABLE_EDGE_MODES), CameraMetadata.EDGE_MODE_OFF)) b.set(CaptureRequest.EDGE_MODE, CaptureRequest.EDGE_MODE_OFF);
            if (has(ch.get(CameraCharacteristics.NOISE_REDUCTION_AVAILABLE_NOISE_REDUCTION_MODES), CameraMetadata.NOISE_REDUCTION_MODE_MINIMAL)) b.set(CaptureRequest.NOISE_REDUCTION_MODE, CaptureRequest.NOISE_REDUCTION_MODE_MINIMAL);
            if (has(ch.get(CameraCharacteristics.COLOR_CORRECTION_AVAILABLE_ABERRATION_MODES), CameraMetadata.COLOR_CORRECTION_ABERRATION_MODE_HIGH_QUALITY)) b.set(CaptureRequest.COLOR_CORRECTION_ABERRATION_MODE, CaptureRequest.COLOR_CORRECTION_ABERRATION_MODE_HIGH_QUALITY);
        }
    }
    Range<Integer> fpsRange() {
        Range<Integer>[] fr = ch.get(CameraCharacteristics.CONTROL_AE_AVAILABLE_TARGET_FPS_RANGES); Range<Integer> best = null;
        if (fr != null) for (Range<Integer> r : fr) { if (r.getUpper() == fps && (best == null || r.getLower() > best.getLower())) best = r; }
        if (best == null && fr != null) for (Range<Integer> r : fr) if (r.contains(fps)) { best = r; break; }
        return best != null ? best : new Range<>(fps, fps);
    }
    /** MoonLog: lifted blacks, long highlight roll-off (log-shaped), same curve on R/G/B. */
    TonemapCurve logCurve() {
        Integer mx = ch.get(CameraCharacteristics.TONEMAP_MAX_CURVE_POINTS); int n = Math.max(32, Math.min(128, mx == null ? 64 : mx)); float[] p = new float[n * 2];
        for (int i = 0; i < n; i++) { float x = i / (float) (n - 1); p[2 * i] = x; p[2 * i + 1] = (float) (0.075 + 0.86 * Math.log1p(38 * x) / Math.log1p(38)); }
        return new TonemapCurve(p, p.clone(), p.clone());
    }
    final CameraCaptureSession.CaptureCallback captureCb = new CameraCaptureSession.CaptureCallback() {
        @Override public void onCaptureCompleted(CameraCaptureSession s, CaptureRequest r, TotalCaptureResult res) {
            Integer i = res.get(CaptureResult.SENSOR_SENSITIVITY); Long e = res.get(CaptureResult.SENSOR_EXPOSURE_TIME);
            if (i != null) liveIso = i; if (e != null) liveExp = e;
            long now = SystemClock.elapsedRealtime(); if (now - lastUi > 300) { lastUi = now; ui.post(CinemaActivity.this::refreshChips); }
        }
    };

    // ------------------------------------------------------------------ recording
    void toggleRec() { if (recording) stopRecording(); else startRecording(); }
    void startRecording() {
        if (session == null || recording) return;
        try {
            String name = "MoonCam_" + clipName() + "_" + new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date()) + "_" + profName(profile).replace(" ", "") + ".mp4";
            ContentValues cv = new ContentValues();
            cv.put(MediaStore.Video.Media.DISPLAY_NAME, name); cv.put(MediaStore.Video.Media.MIME_TYPE, "video/mp4");
            cv.put(MediaStore.Video.Media.RELATIVE_PATH, Environment.DIRECTORY_MOVIES + "/MoonCam"); cv.put(MediaStore.Video.Media.IS_PENDING, 1);
            outUri = getContentResolver().insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, cv);
            pfd = getContentResolver().openFileDescriptor(outUri, "w");
            boolean audio = checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
            try { mr = buildRecorder(null, pfd.getFileDescriptor(), audio, 2); mr.prepare(); }
            catch (Exception stereo) { try { mr.release(); } catch (Exception ignored) {} mr = buildRecorder(null, pfd.getFileDescriptor(), audio, 1); mr.prepare(); }
            recording = true; updateRepeating(); mr.start();
            recStart = SystemClock.elapsedRealtime(); hidePanel(); refreshUi(); ui.post(tick);
        } catch (Exception e) {
            recording = false; toast("เริ่มบันทึกไม่ได้: " + e.getMessage());
            try { if (mr != null) mr.release(); } catch (Exception ignored) {} mr = null;
            try { if (outUri != null) getContentResolver().delete(outUri, null, null); } catch (Exception ignored) {}
            updateRepeating(); refreshUi();
        }
    }
    void stopRecording() {
        if (!recording) return;
        recording = false; boolean ok = true;
        try { mr.stop(); } catch (RuntimeException e) { ok = false; }
        try { mr.release(); } catch (Exception ignored) {} mr = null;
        try { if (pfd != null) pfd.close(); } catch (Exception ignored) {} pfd = null;
        try {
            if (ok) { ContentValues cv = new ContentValues(); cv.put(MediaStore.Video.Media.IS_PENDING, 0); getContentResolver().update(outUri, cv, null, null); toast("บันทึก " + clipName() + " · Movies/MoonCam"); sp.edit().putInt("clip", sp.getInt("clip", 1) + 1).apply(); }
            else { getContentResolver().delete(outUri, null, null); toast("คลิปสั้นเกินไป ไม่ได้บันทึก"); }
        } catch (Exception ignored) {}
        updateRepeating(); refreshUi(); meter.setProgress(0);
    }
    final Runnable tick = new Runnable() { @Override public void run() {
        if (!recording) { tc.setText("00:00:00:00"); return; }
        long ms = SystemClock.elapsedRealtime() - recStart, s = ms / 1000, f = (ms % 1000) * fps / 1000;
        tc.setText(String.format(Locale.US, "%02d:%02d:%02d:%02d", s / 3600, s / 60 % 60, s % 60, f));
        recDot.setAlpha((ms / 500) % 2 == 0 ? 1f : .25f);
        try { int amp = mr != null ? mr.getMaxAmplitude() : 0; double db = amp > 0 ? 20 * Math.log10(amp / 32767.0) : -60; meter.setProgress((int) Math.max(0, Math.min(100, (db + 60) / 60 * 100))); } catch (Exception ignored) {}
        ui.postDelayed(this, 80);
    }};

    // ------------------------------------------------------------------ UI
    int dp(float v) { return Math.round(v * getResources().getDisplayMetrics().density); }
    void buildUi() {
        root = new FrameLayout(this); root.setBackgroundColor(Color.BLACK);
        gv = new GLSurfaceView(this); gv.setEGLContextClientVersion(3); gv.setPreserveEGLContextOnPause(true);
        lp = new LutPreview(gv, st -> { camST = st; if (dev != null && bg != null) bg.post(this::createSession); else if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) openCamera(); });
        gv.setRenderer(lp); gv.setRenderMode(GLSurfaceView.RENDERMODE_WHEN_DIRTY);
        lp.zebra = zebra; lp.peaking = peaking; lp.falseColor = falseColor;
        root.addView(gv, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT, Gravity.CENTER));
        guides = new GuideView(this); root.addView(guides, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT, Gravity.CENTER));
        // gestures: tap = focus + exposure point · drag up/down = brightness (EV in auto, ISO in manual) · long-press = AE/AF lock · pinch = zoom
        final boolean[] st8 = {false, false, false}; // scaled, dragging, longPressed
        final float[] down = {0, 0}; final int[] base = {0};
        final Runnable longPress = () -> { st8[2] = true; lockAt(down[0], down[1], gv.getWidth(), gv.getHeight()); };
        final ScaleGestureDetector sg = new ScaleGestureDetector(this, new ScaleGestureDetector.SimpleOnScaleGestureListener() {
            @Override public boolean onScale(ScaleGestureDetector d) {
                if (zoomRange == null) return false; st8[0] = true; ui.removeCallbacks(longPress);
                zoomRatio = Math.max(zoomRange.getLower(), Math.min(Math.min(zoomRange.getUpper(), 10f), zoomRatio * d.getScaleFactor()));
                if (camId.equals(mainId)) { int best = lensIdx; for (int i = 0; i < lenses.size(); i++) { Lens l = lenses.get(i); if (l.zoom && zoomRatio >= l.ratio - 0.02f) best = i; } lensIdx = best; }
                updateRepeating(); renderLenses(); return true;
            }
        });
        gv.setOnTouchListener((v, e) -> {
            sg.onTouchEvent(e);
            switch (e.getActionMasked()) {
                case MotionEvent.ACTION_DOWN: st8[0] = false; st8[1] = false; st8[2] = false; down[0] = e.getX(); down[1] = e.getY(); base[0] = manualExp ? isoIndex() : ev; ui.postDelayed(longPress, 650); break;
                case MotionEvent.ACTION_MOVE: {
                    if (st8[0] || e.getPointerCount() > 1) break;
                    float dy = down[1] - e.getY();
                    if (!st8[1] && Math.abs(dy) > dp(14)) { st8[1] = true; ui.removeCallbacks(longPress); if (!guides.showing()) guides.focus(down[0], down[1]); }
                    if (st8[1]) dragExposure(base[0], Math.round(dy / dp(26)));
                    break;
                }
                case MotionEvent.ACTION_UP:
                    ui.removeCallbacks(longPress);
                    if (!st8[0] && !st8[1] && !st8[2]) tapFocus(e.getX(), e.getY(), v.getWidth(), v.getHeight());
                    break;
                case MotionEvent.ACTION_CANCEL: ui.removeCallbacks(longPress); break;
                default: break;
            }
            return true;
        });

        // ---------------- ARRI-style status bars
        bar = bar(Gravity.TOP);
        addChip(bar, "", "exit", v -> { if (recording) stopRecording(); finish(); }, 0);
        addChip(bar, "AE", "exp", v -> toggleManual(), 1);
        addChip(bar, "FPS", "fps", v -> cycleConfig("fps"), 1);
        addChip(bar, "SHUTTER", "sh", v -> openPanel("sh"), 1);
        addChip(bar, "EI / ISO", "iso", v -> openPanel("iso"), 1);
        addChip(bar, "IRIS", "ap", v -> cycleAperture(), 1);
        addChip(bar, "WB", "wb", v -> { if (recording) return; wbIdx = (wbIdx + 1) % WB_MODES.length; awbLock = false; updateRepeating(); refreshChips(); }, 1);
        addChip(bar, "EV", "ev", v -> openPanel("ev"), 1);
        addChip(bar, "FOCUS", "af", v -> openPanel("af"), 1);
        addChip(bar, "LOOK", "lut", v -> openStrip("lut"), 1);
        addChip(bar, "COLOR", "prof", v -> cycleConfig("prof"), 1);
        addChip(bar, "RES", "res", v -> cycleConfig("res"), 1);

        bot = bar(Gravity.BOTTOM);
        LinearLayout tcBox = new LinearLayout(this); tcBox.setGravity(Gravity.CENTER_VERTICAL); tcBox.setPadding(dp(14), 0, dp(14), 0);
        recDot = new TextView(this); recDot.setText("● "); recDot.setTextColor(RED); recDot.setTextSize(13); recDot.setAlpha(.25f);
        tc = new TextView(this); tc.setText("00:00:00:00"); tc.setTextColor(WHITE); tc.setTextSize(21); tc.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
        tcBox.addView(recDot); tcBox.addView(tc); this.tcBox = tcBox;
        bot.addView(tcBox, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.MATCH_PARENT));
        clipTv = statusText(bot, 15, true); info = statusText(bot, 12, false); batTv = statusText(bot, 12, false);
        FrameLayout mw = new FrameLayout(this); mw.setPadding(dp(12), 0, dp(12), 0);
        meter = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal); meter.setMax(100); meter.setProgressTintList(android.content.res.ColorStateList.valueOf(0xFF5BD06A));
        mw.addView(meter, new FrameLayout.LayoutParams(dp(96), dp(6), Gravity.CENTER_VERTICAL)); divider(bot); bot.addView(mw, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.MATCH_PARENT));
        addChip(bot, "QUALITY", "q", v -> cycleQuality(), 1);
        addChip(bot, "SCOPE", "scope", v -> cycleScope(), 1);
        addChip(bot, "TOOLS", "tools", v -> openStrip("tools"), 1);
        addChip(bot, "GUIDE", "guide", v -> { guide = (guide + 1) % GUIDES.length; savePrefs(); guides.invalidate(); refreshChips(); }, 1);
        addChip(bot, "STAB", "stab", v -> { stab = !stab; savePrefs(); updateRepeating(); refreshChips(); }, 1);

        // record button + lenses (right gutter) · scope (left gutter)
        recBtn = new FrameLayout(this);
        GradientDrawable ring = new GradientDrawable(); ring.setShape(GradientDrawable.OVAL); ring.setStroke(dp(3), 0xFFE8E8E8); ring.setColor(0x66000000); recBtn.setBackground(ring);
        recInner = new View(this); GradientDrawable in = new GradientDrawable(); in.setShape(GradientDrawable.OVAL); in.setColor(RED); recInner.setBackground(in);
        recBtn.addView(recInner, new FrameLayout.LayoutParams(dp(58), dp(58), Gravity.CENTER));
        FrameLayout.LayoutParams rl = new FrameLayout.LayoutParams(dp(80), dp(80), Gravity.END | Gravity.CENTER_VERTICAL); rl.setMarginEnd(dp(20));
        root.addView(recBtn, rl); recBtn.setOnClickListener(v -> toggleRec());
        lensCol = new LinearLayout(this); lensCol.setOrientation(LinearLayout.VERTICAL); lensCol.setGravity(Gravity.CENTER);
        FrameLayout.LayoutParams ll = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.END | Gravity.CENTER_VERTICAL); ll.setMarginEnd(dp(114));
        root.addView(lensCol, ll); renderLenses();
        scope = new ScopeView(this); root.addView(scope, new FrameLayout.LayoutParams(dp(200), dp(124), Gravity.START | Gravity.CENTER_VERTICAL)); scope.setVisibility(View.GONE);
        lp.scopeSink = (px, w, h) -> { if (scopeMode > 0) scope.update(px, w, h); };

        // slider panel (bottom centre): label · − · slider · + · [AUTO | MANUAL]
        panel = new LinearLayout(this); panel.setOrientation(LinearLayout.HORIZONTAL); panel.setGravity(Gravity.CENTER_VERTICAL); panel.setPadding(dp(14), dp(6), dp(8), dp(6));
        GradientDrawable pbg = new GradientDrawable(); pbg.setColor(PANEL); pbg.setCornerRadius(dp(18)); panel.setBackground(pbg);
        panelLabel = new TextView(this); panelLabel.setTextColor(GOLD); panelLabel.setTextSize(14); panelLabel.setTypeface(Typeface.MONOSPACE, Typeface.BOLD); panelLabel.setMinWidth(dp(132));
        minusBtn = pill("−", false); plusBtn = pill("+", false);
        panelSeek = new SeekBar(this); panelSeek.setMax(1000);
        panelSeek.setProgressTintList(android.content.res.ColorStateList.valueOf(GOLD)); panelSeek.setThumbTintList(android.content.res.ColorStateList.valueOf(GOLD));
        segAuto = pill("AUTO", false); segManual = pill("MANUAL", false);
        panel.addView(panelLabel); panel.addView(minusBtn, new LinearLayout.LayoutParams(dp(40), dp(36)));
        panel.addView(panelSeek, new LinearLayout.LayoutParams(dp(230), ViewGroup.LayoutParams.WRAP_CONTENT)); panel.addView(plusBtn, new LinearLayout.LayoutParams(dp(40), dp(36)));
        LinearLayout.LayoutParams sl = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(36)); sl.setMarginStart(dp(10)); panel.addView(segAuto, sl);
        LinearLayout.LayoutParams sm = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(36)); sm.setMarginStart(dp(4)); panel.addView(segManual, sm);
        FrameLayout.LayoutParams pl = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        pl.bottomMargin = dp(BOTBAR + 10); root.addView(panel, pl); panel.setVisibility(View.GONE);
        panelSeek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar sb, int p, boolean user) { if (user) panelChanged(p); }
            @Override public void onStartTrackingTouch(SeekBar sb) {}
            @Override public void onStopTrackingTouch(SeekBar sb) {}
        });
        minusBtn.setOnClickListener(v -> { panelSeek.setProgress(Math.max(0, panelSeek.getProgress() - (panelSeek.getMax() > 100 ? 20 : 1))); panelChanged(panelSeek.getProgress()); });
        plusBtn.setOnClickListener(v -> { panelSeek.setProgress(Math.min(panelSeek.getMax(), panelSeek.getProgress() + (panelSeek.getMax() > 100 ? 20 : 1))); panelChanged(panelSeek.getProgress()); });
        segAuto.setOnClickListener(v -> panelMode(false)); segManual.setOnClickListener(v -> panelMode(true));
        // option strip (LUT list / tools)
        stripWrap = new HorizontalScrollView(this); stripWrap.setHorizontalScrollBarEnabled(false);
        strip = new LinearLayout(this); strip.setOrientation(LinearLayout.HORIZONTAL); strip.setPadding(dp(8), dp(6), dp(8), dp(6)); stripWrap.addView(strip);
        GradientDrawable sbg = new GradientDrawable(); sbg.setColor(PANEL); sbg.setCornerRadius(dp(18)); stripWrap.setBackground(sbg);
        FrameLayout.LayoutParams swl = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        swl.bottomMargin = dp(BOTBAR + 10); swl.setMarginStart(dp(60)); swl.setMarginEnd(dp(120)); root.addView(stripWrap, swl); stripWrap.setVisibility(View.GONE);
        scope.mode = scopeMode; scope.setVisibility(scopeMode > 0 ? View.VISIBLE : View.GONE);
        setContentView(root);
        refreshUi();
    }
    // ---------------- status bar helpers (ARRI look: black bars, grey labels, white values, thin dividers)
    LinearLayout bar(int gravity) {
        LinearLayout b = new LinearLayout(this); b.setOrientation(LinearLayout.HORIZONTAL); b.setGravity(Gravity.CENTER_VERTICAL); b.setBackgroundColor(BAR);
        FrameLayout.LayoutParams p = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(gravity == Gravity.TOP ? TOPBAR : BOTBAR), gravity);
        root.addView(b, p); return b;
    }
    void divider(LinearLayout parent) { View d = new View(this); d.setBackgroundColor(0x2EFFFFFF); parent.addView(d, new LinearLayout.LayoutParams(dp(1), ViewGroup.LayoutParams.MATCH_PARENT)); }
    TextView statusText(LinearLayout parent, float size, boolean bold) {
        divider(parent); TextView t = new TextView(this); t.setTextColor(bold ? WHITE : LABEL); t.setTextSize(size); t.setGravity(Gravity.CENTER); t.setPadding(dp(12), 0, dp(12), 0);
        t.setTypeface(Typeface.create("sans-serif-condensed", bold ? Typeface.BOLD : Typeface.NORMAL)); t.setSingleLine(true);
        parent.addView(t, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.MATCH_PARENT)); return t;
    }
    void addChip(LinearLayout parent, String label, String key, View.OnClickListener l, float weight) {
        if (parent.getChildCount() > 0) divider(parent);
        LinearLayout c = new LinearLayout(this); c.setOrientation(LinearLayout.VERTICAL); c.setGravity(Gravity.CENTER); c.setPadding(dp(4), 0, dp(4), 0);
        TextView t = new TextView(this); t.setText(label); t.setTextColor(LABEL); t.setTextSize(9.5f); t.setLetterSpacing(.08f); t.setGravity(Gravity.CENTER); t.setSingleLine(true);
        t.setTypeface(Typeface.create("sans-serif-condensed", Typeface.NORMAL));
        TextView v = new TextView(this); v.setTextColor(WHITE); v.setTextSize(key.equals("exit") ? 20 : 15.5f); v.setGravity(Gravity.CENTER); v.setTag(key); v.setSingleLine(true);
        v.setTypeface(Typeface.create("sans-serif-condensed", Typeface.BOLD));
        if (!label.isEmpty()) c.addView(t); c.addView(v); c.setOnClickListener(l);
        parent.addView(c, weight > 0 ? new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.MATCH_PARENT, weight) : new LinearLayout.LayoutParams(dp(52), ViewGroup.LayoutParams.MATCH_PARENT));
        chips.add(new TextView[]{t, v});
    }
    void refreshUi() { refreshChips(); recInnerShape(); }
    void recInnerShape() {
        if (recInner == null) return;
        GradientDrawable in = new GradientDrawable(); in.setColor(RED);
        if (recording) { in.setShape(GradientDrawable.RECTANGLE); in.setCornerRadius(dp(6)); recInner.setLayoutParams(new FrameLayout.LayoutParams(dp(30), dp(30), Gravity.CENTER)); }
        else { in.setShape(GradientDrawable.OVAL); recInner.setLayoutParams(new FrameLayout.LayoutParams(dp(58), dp(58), Gravity.CENTER)); }
        recInner.setBackground(in);
        recDot.setAlpha(recording ? 1f : .25f);
        if (tcBox != null) tcBox.setBackgroundColor(recording ? 0xFFB3201B : 0x00000000);
        if (guides != null) { guides.rec = recording; guides.invalidate(); }
    }
    String clipName() { return String.format(Locale.US, "A001C%03d", sp.getInt("clip", 1)); }
    void cycleQuality() {
        if (recording) { toast("หยุดบันทึกก่อนเปลี่ยน"); return; }
        quality = (quality + 1) % 3; sp.edit().putInt("quality", quality).apply();
        toast(quality == 2 ? "MAX — บิตเรตสูงสุด HEVC · ปิดการเร่งความคม ลด NR ของกล้อง (ภาพดิบเหมาะเกรด ไฟล์ใหญ่)" : quality == 1 ? "HIGH — HEVC บิตเรตสูง สมดุลคุณภาพ/ขนาดไฟล์" : "STD — H.264 ไฟล์เล็ก เปิดได้ทุกที่");
        updateRepeating(); refreshChips();
    }
    void cycleScope() {
        scopeMode = (scopeMode + 1) % 4; sp.edit().putInt("scope", scopeMode).apply();
        scope.mode = scopeMode; scope.setVisibility(scopeMode > 0 ? View.VISIBLE : View.GONE); layoutPreview(); refreshChips();
    }

    /** Waveform / RGB parade / histogram from a small GPU read-back of the picture you see (LUT included). */
    class ScopeView extends View {
        int mode = 0; byte[] px; int pw, ph; final android.graphics.Bitmap bmp = android.graphics.Bitmap.createBitmap(128, 100, android.graphics.Bitmap.Config.ARGB_8888);
        final int[] buf = new int[128 * 100]; final Paint p = new Paint(Paint.FILTER_BITMAP_FLAG), grid = new Paint(), txt = new Paint(Paint.ANTI_ALIAS_FLAG);
        final Rect src = new Rect(0, 0, 128, 100); final RectF dst = new RectF();
        ScopeView(Context c) { super(c); grid.setColor(0x40FFFFFF); grid.setStrokeWidth(1); txt.setColor(LABEL); txt.setTextSize(dp(9)); txt.setTypeface(Typeface.create("sans-serif-condensed", Typeface.NORMAL)); }
        void update(byte[] d, int w, int h) { px = d; pw = w; ph = h; build(); postInvalidate(); }
        void build() {
            if (px == null) return; java.util.Arrays.fill(buf, 0);
            int[] acc = new int[128 * 100 * 3];
            if (mode == 3) {
                int[][] hist = new int[4][128]; int mx = 1;
                for (int i = 0; i < pw * ph; i++) { int r = px[i * 4] & 255, g = px[i * 4 + 1] & 255, b = px[i * 4 + 2] & 255, y = (r * 54 + g * 183 + b * 19) >> 8; hist[0][r >> 1]++; hist[1][g >> 1]++; hist[2][b >> 1]++; hist[3][y >> 1]++; }
                for (int c = 0; c < 4; c++) for (int x = 0; x < 128; x++) mx = Math.max(mx, hist[c][x]);
                for (int x = 0; x < 128; x++) for (int c = 0; c < 4; c++) { int hgt = (int) (Math.sqrt(hist[c][x] / (double) mx) * 99); for (int y = 99; y > 99 - hgt; y--) { int k = (y * 128 + x) * 3; if (c == 3) { acc[k] += 60; acc[k + 1] += 60; acc[k + 2] += 60; } else acc[k + c] += 110; } }
            } else {
                for (int y = 0; y < ph; y++) for (int x = 0; x < pw; x++) {
                    int i = (y * pw + x) * 4, r = px[i] & 255, g = px[i + 1] & 255, b = px[i + 2] & 255;
                    if (mode == 1) { int l = (r * 54 + g * 183 + b * 19) >> 8, col = x * 128 / pw, row = 99 - l * 99 / 255, k = (row * 128 + col) * 3; acc[k] += 28; acc[k + 1] += 40; acc[k + 2] += 28; }
                    else { int col = x * 42 / pw; int[] v = {r, g, b}; for (int c = 0; c < 3; c++) { int row = 99 - v[c] * 99 / 255, k = (row * 128 + c * 43 + col) * 3; acc[k + c] += 70; } }
                }
            }
            for (int i = 0; i < buf.length; i++) { int r = Math.min(255, acc[i * 3]), g = Math.min(255, acc[i * 3 + 1]), b = Math.min(255, acc[i * 3 + 2]); buf[i] = (r | g | b) == 0 ? 0 : 0xFF000000 | (r << 16) | (g << 8) | b; }
            bmp.setPixels(buf, 0, 128, 0, 0, 128, 100);
        }
        @Override protected void onDraw(Canvas c) {
            int w = getWidth(), h = getHeight(); c.drawColor(0xCC0B0C0E);
            float top = dp(14), bh = h - top - dp(4); dst.set(dp(4), top, w - dp(4), top + bh);
            for (int i = 0; i <= 4; i++) { float y = top + bh * i / 4f; c.drawLine(dst.left, y, dst.right, y, grid); }
            if (px != null) c.drawBitmap(bmp, src, dst, p);
            c.drawText(mode == 1 ? "WAVEFORM" : mode == 2 ? "RGB PARADE" : "HISTOGRAM", dp(6), dp(11), txt);
            if (mode != 3) { c.drawText("100", w - dp(22), top + dp(8), txt); c.drawText("50", w - dp(16), top + bh / 2 + dp(3), txt); c.drawText("0", w - dp(10), top + bh, txt); }
        }
    }
    void refreshChips() {
        for (TextView[] c : chips) {
            String k = (String) c[1].getTag(); String v; int mode = 0; // 0 neutral · 1 auto · 2 manual
            switch (k) {
                case "exp": v = manualExp ? "MANUAL" : "AUTO"; mode = manualExp ? 2 : 1; break;
                case "iso": v = manualExp ? String.valueOf(iso) : (liveIso > 0 ? String.valueOf(liveIso) : "—"); mode = manualExp ? 2 : 1; break;
                case "sh": v = manualExp ? "1/" + shutterDen : (liveExp > 0 ? "1/" + Math.round(1e9 / liveExp) : "—"); mode = manualExp ? 2 : 1; break;
                case "ap": v = apertures == null ? "—" : String.format(Locale.US, "f/%.1f", apertures[apIdx]); mode = apertures != null && apertures.length > 1 ? 2 : 0; break;
                case "ev": v = manualExp ? "—" : (ev > 0 ? "+" + ev : String.valueOf(ev)) + (aeLock ? " 🔒" : ""); mode = manualExp ? 0 : (ev != 0 || aeLock ? 2 : 1); break;
                case "wb": v = WB_NAMES[wbIdx] + (awbLock ? "🔒" : ""); mode = wbIdx == 0 ? 1 : 2; break;
                case "af": v = manualFocus ? (focusDist <= 0.01f ? "MF ∞" : String.format(Locale.US, "MF %.1fm", 1 / focusDist)) : afLock ? "AF 🔒" : "AF"; mode = manualFocus || afLock ? 2 : 1; break;
                case "lut": v = lutIdx < 0 ? "ปิด" : lutIdx == 100 ? (customName == null ? "ของฉัน" : customName) : Luts.NAMES[lutIdx]; mode = lutIdx < 0 ? 0 : 2; break;
                case "tools": v = (zebra ? "Z " : "") + (falseColor ? "FC " : "") + (peaking ? "PK" : ""); if (v.isEmpty()) v = "—"; break;
                case "exit": v = "✕"; break;
                case "q": v = quality == 2 ? "MAX" : quality == 1 ? "HIGH" : "STD"; mode = quality > 0 ? 2 : 0; break;
                case "scope": v = scopeMode == 1 ? "WAVE" : scopeMode == 2 ? "PARADE" : scopeMode == 3 ? "HIST" : "OFF"; break;
                case "fps": v = fps + ""; break;
                case "res": v = "4K".equals(res) ? "4K" : res + "p"; break;
                case "prof": v = profName(profile); mode = "natural".equals(profile) ? 0 : 2; break;
                case "stab": v = stab ? "ON" : "OFF"; break;
                case "guide": v = GUIDES[guide]; break;
                default: v = "";
            }
            boolean sel = k.equals(panelKey) || k.equals(stripMode);
            c[1].setText((mode == 1 && !k.equals("exp") ? "A " : "") + v);
            c[1].setTextColor(k.equals("exp") ? (manualExp ? WHITE : AUTOC) : mode == 1 ? AUTOC : (mode == 2 && (k.equals("lut") || k.equals("prof") || k.equals("q"))) ? AMBER : WHITE);
            View box = (View) c[1].getParent();
            box.setBackgroundColor(sel ? 0xFF2A2C31 : 0x00000000);
            c[0].setTextColor(sel ? WHITE : LABEL);
            boolean locked = recording && (k.equals("fps") || k.equals("res") || k.equals("prof") || k.equals("q"));
            box.setAlpha(locked ? .35f : 1f);
        }
        if (info != null) {
            long secs = -1;
            try { StatFs s = new StatFs(Environment.getExternalStorageDirectory().getPath()); secs = s.getAvailableBytes() / (bitrate() / 8 + 24_000); } catch (Exception ignored) {}
            info.setText((useHevc() ? ("hlg10".equals(profile) ? "HEVC 10-bit" : "HEVC") : "H.264") + " · " + (bitrate() / 1_000_000) + " Mb/s" + (secs < 0 ? "" : String.format(Locale.US, " · %dh%02dm", secs / 3600, secs / 60 % 60)));
            if (clipTv != null) clipTv.setText(clipName());
            long now = SystemClock.elapsedRealtime();
            if (batTv != null && now - batAt > 5000) { batAt = now; try { Intent bi = registerReceiver(null, new android.content.IntentFilter(Intent.ACTION_BATTERY_CHANGED)); if (bi != null) { int lv = bi.getIntExtra("level", -1), sc = bi.getIntExtra("scale", 100), tp = bi.getIntExtra("temperature", 0); batTxt = Math.round(lv * 100f / sc) + "% · " + Math.round(tp / 10f) + "°C"; } } catch (Exception ignored) {} batTv.setText(batTxt); }
        }
    }

    // ---- config that needs a new session
    void cycleConfig(String k) {
        if (recording) { toast("หยุดบันทึกก่อนเปลี่ยน"); return; }
        if (k.equals("fps")) { fps = fpsList.get((fpsList.indexOf(fps) + 1) % fpsList.size()); shutterDen = defaultDen(); }
        if (k.equals("res")) res = resList.get((resList.indexOf(res) + 1) % resList.size());
        if (k.equals("prof")) {
            profile = profList.get((profList.indexOf(profile) + 1) % profList.size());
            if (profList.size() == 1) toast("เครื่องนี้มีแค่ Natural (ไม่รองรับ log curve / 10-bit)");
            else toast("hlg10".equals(profile) ? "HLG 10-bit · HEVC — ภาพแบน เปิด LUT เพื่อพรีวิวสี" : "log8".equals(profile) ? "MoonLog — ภาพแบนไว้เกรดสี เปิด LUT เพื่อพรีวิวสี" : "Natural — สีปกติพร้อมใช้");
            applyLut();
        }
        savePrefs(); refreshChips();
        if (bg != null) bg.post(this::createSession);
    }
    void savePrefs() {
        sp.edit().putInt("fps", fps).putString("res", res).putString("profile", profile).putBoolean("stab", stab).putInt("guide", guide)
                .putInt("lut", lutIdx).putInt("rotOffset", rotOffset).putInt("shutterDen", shutterDen).apply();
    }

    // ---- exposure helpers
    int defaultDen() { return snapDen(fps * 2); } // 180° shutter rule
    int[] isoSteps() { List<Integer> l = new ArrayList<>(); if (isoRange != null) for (int v : ISO_STEPS) if (v >= isoRange.getLower() && v <= isoRange.getUpper()) l.add(v); if (l.isEmpty()) l.add(iso); int[] a = new int[l.size()]; for (int i = 0; i < a.length; i++) a[i] = l.get(i); return a; }
    int[] shSteps() { List<Integer> l = new ArrayList<>(); for (int d : SH_STEPS) { if (d < fps) continue; long e = 1_000_000_000L / d; if (expRange != null && (e < expRange.getLower() || e > expRange.getUpper())) continue; l.add(d); } if (l.isEmpty()) l.add(fps); int[] a = new int[l.size()]; for (int i = 0; i < a.length; i++) a[i] = l.get(i); return a; }
    static int nearest(int[] a, int v) { int best = 0; for (int i = 0; i < a.length; i++) if (Math.abs(a[i] - v) < Math.abs(a[best] - v)) best = i; return best; }
    int snapIso(int v) { int[] a = isoSteps(); return a[nearest(a, v)]; }
    int snapDen(int v) { int[] a = shSteps(); return a[nearest(a, v)]; }
    int isoIndex() { return nearest(isoSteps(), iso); }
    void toggleManual() {
        if (!capManual) { toast("เครื่องนี้ไม่ให้แอปปรับ ISO/Shutter เอง — ใช้ EV หรือจิ้มแล้วลากขึ้นลงที่จอ"); return; }
        manualExp = !manualExp;
        if (manualExp) { if (liveIso > 0) iso = snapIso(liveIso); if (liveExp > 0) shutterDen = snapDen((int) Math.round(1e9 / liveExp)); if (shutterDen < fps) shutterDen = defaultDen(); aeLock = false; toast("MANUAL — ล็อก ISO / Shutter ตามค่าตอนนี้"); }
        else toast("AUTO — กล้องปรับแสงเอง");
        updateRepeating(); refreshChips(); if (panelKey != null) syncPanel();
    }
    void cycleAperture() {
        if (apertures == null) { toast("เครื่องไม่บอกค่ารูรับแสง"); return; }
        if (apertures.length < 2) { toast(String.format(Locale.US, "รูรับแสง f/%.1f เป็นค่าคงที่ของเลนส์นี้ — มือถือส่วนใหญ่ปรับไม่ได้ ใช้ Shutter / ISO / ND แทน", apertures[0])); return; }
        apIdx = (apIdx + 1) % apertures.length; updateRepeating(); refreshChips();
    }
    /** drag up/down on the picture: EV in auto, ISO in manual */
    void dragExposure(int base, int steps) {
        if (manualExp) { int[] a = isoSteps(); int i = Math.max(0, Math.min(a.length - 1, base + steps)); if (a[i] != iso) { iso = a[i]; updateRepeating(); refreshChips(); } guides.sun = "ISO " + iso; }
        else { if (evRange == null) return; int e = Math.max(evRange.getLower(), Math.min(evRange.getUpper(), base + steps)); if (e != ev) { ev = e; aeLock = false; updateRepeating(); refreshChips(); } guides.sun = "☀ " + (ev > 0 ? "+" : "") + ev; }
        guides.keep(); if (panelKey != null) syncPanel();
    }

    // ---- slider panel
    TextView pill(String t, boolean on) {
        TextView b = new TextView(this); b.setText(t); b.setGravity(Gravity.CENTER); b.setTextSize(12); b.setTypeface(Typeface.DEFAULT_BOLD); b.setPadding(dp(12), 0, dp(12), 0);
        stylePill(b, on); return b;
    }
    void stylePill(TextView b, boolean on) {
        GradientDrawable g = new GradientDrawable(); g.setCornerRadius(dp(16)); g.setColor(on ? GOLD : 0x22FFFFFF); if (!on) g.setStroke(dp(1), 0x44FFFFFF);
        b.setBackground(g); b.setTextColor(on ? 0xFF1B1408 : INK);
    }
    void openPanel(String k) {
        hideStrip();
        if ((k.equals("iso") || k.equals("sh")) && !capManual) { toast("เครื่องนี้ไม่ให้แอปปรับ ISO/Shutter เอง — ใช้ EV หรือจิ้มแล้วลากขึ้นลงที่จอ"); return; }
        if (k.equals("ev") && (evRange == null || evRange.getUpper() == 0)) { toast("เครื่องนี้ไม่รองรับ EV"); return; }
        if (k.equals("af") && minFocus <= 0) { toast("เครื่องนี้ไม่ให้โฟกัสเอง (Fixed focus)"); return; }
        if (k.equals(panelKey) && panel.getVisibility() == View.VISIBLE) { hidePanel(); return; }
        panelKey = k; panel.setVisibility(View.VISIBLE); syncPanel(); refreshChips();
    }
    void hidePanel() { if (panel != null) panel.setVisibility(View.GONE); panelKey = null; }
    int clampIso(int v) { return Math.max(isoRange.getLower(), Math.min(isoRange.getUpper(), v)); }
    void syncPanel() {
        if (panelKey == null) return;
        boolean manual = false; segManual.setVisibility(View.VISIBLE); segAuto.setText("AUTO"); segManual.setText("MANUAL");
        switch (panelKey) {
            case "iso": { int[] a = isoSteps(); panelSeek.setMax(a.length - 1); panelSeek.setProgress(nearest(a, manualExp ? iso : (liveIso > 0 ? liveIso : iso))); panelLabel.setText("ISO " + (manualExp ? iso : (liveIso > 0 ? liveIso : iso))); manual = manualExp; break; }
            case "sh": { int[] a = shSteps(); int d = manualExp ? shutterDen : (liveExp > 0 ? (int) Math.round(1e9 / liveExp) : defaultDen()); panelSeek.setMax(a.length - 1); panelSeek.setProgress(nearest(a, d));
                panelLabel.setText("1/" + d + " · " + Math.round(360.0 * fps / d) + "°"); manual = manualExp; break; }
            case "ev": panelSeek.setMax(evRange.getUpper() - evRange.getLower()); panelSeek.setProgress(ev - evRange.getLower()); panelLabel.setText("EV " + (ev > 0 ? "+" : "") + ev + (aeLock ? " 🔒" : ""));
                segAuto.setText("0"); segManual.setText(aeLock ? "ปลดล็อก" : "ล็อกแสง"); manual = aeLock; break;
            case "af": panelSeek.setMax(1000); panelSeek.setProgress(Math.round((1 - focusDist / minFocus) * 1000));
                panelLabel.setText(manualFocus ? (focusDist <= 0.01f ? "MF ∞" : String.format(Locale.US, "MF %.2fm", 1 / focusDist)) : "AF ต่อเนื่อง"); segAuto.setText("AF"); segManual.setText("MF"); manual = manualFocus; break;
        }
        stylePill(segAuto, !manual); stylePill(segManual, manual);
        panelSeek.setAlpha((panelKey.equals("iso") || panelKey.equals("sh")) && !manualExp ? .45f : 1f);
    }
    void panelChanged(int p) {
        switch (panelKey) {
            case "iso": { if (!manualExp) toggleManualSilently(); int[] a = isoSteps(); iso = a[Math.max(0, Math.min(a.length - 1, p))]; break; }
            case "sh": { if (!manualExp) toggleManualSilently(); int[] a = shSteps(); shutterDen = a[Math.max(0, Math.min(a.length - 1, p))]; break; }
            case "ev": ev = evRange.getLower() + p; aeLock = false; break;
            case "af": manualFocus = true; afLock = false; focusDist = (1 - p / 1000f) * minFocus; break;
        }
        syncPanel(); updateRepeating(); refreshChips(); savePrefs();
    }
    void toggleManualSilently() { manualExp = true; if (liveIso > 0) iso = snapIso(liveIso); if (liveExp > 0) shutterDen = snapDen((int) Math.round(1e9 / liveExp)); if (shutterDen < fps) shutterDen = defaultDen(); aeLock = false; }
    void panelMode(boolean manual) {
        switch (panelKey) {
            case "iso": case "sh": if (manual != manualExp) toggleManual(); break;
            case "ev": if (manual) { aeLock = !aeLock; toast(aeLock ? "ล็อกแสง (AE LOCK)" : "ปลดล็อกแสง"); } else { ev = 0; aeLock = false; } break;
            case "af": if (manual) { manualFocus = true; afLock = false; } else { manualFocus = false; afLock = false; afRegions = null; } break;
        }
        syncPanel(); updateRepeating(); refreshChips();
    }

    // ---- tap = focus + exposure point · long press = AE/AF lock
    MeteringRectangle[] regionAt(float x, float y, int w, int h) {
        Rect a = ch.get(CameraCharacteristics.SENSOR_INFO_ACTIVE_ARRAY_SIZE); if (a == null) return null;
        float nx = x / w, ny = y / h; if (displayDegrees() == 270) { nx = 1 - nx; ny = 1 - ny; }
        int cx = (int) (nx * a.width()), cy = (int) (ny * a.height()), r = a.width() / 12;
        return new MeteringRectangle[]{new MeteringRectangle(Math.max(0, cx - r), Math.max(0, cy - r), r * 2, r * 2, MeteringRectangle.METERING_WEIGHT_MAX - 1)};
    }
    void triggerAf() {
        if (session == null || dev == null) return;
        try {
            CaptureRequest.Builder b = dev.createCaptureRequest(recording ? CameraDevice.TEMPLATE_RECORD : CameraDevice.TEMPLATE_PREVIEW);
            b.addTarget(previewSurface); if (recording) b.addTarget(recSurface); applySettings(b);
            b.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_AUTO); b.set(CaptureRequest.CONTROL_AF_TRIGGER, CaptureRequest.CONTROL_AF_TRIGGER_START);
            if (!manualExp) b.set(CaptureRequest.CONTROL_AE_PRECAPTURE_TRIGGER, CaptureRequest.CONTROL_AE_PRECAPTURE_TRIGGER_START);
            session.capture(b.build(), null, bg);
        } catch (Exception ignored) {}
    }
    void tapFocus(float x, float y, int w, int h) {
        if (panel.getVisibility() == View.VISIBLE || stripWrap.getVisibility() == View.VISIBLE) { hidePanel(); hideStrip(); return; }
        afRegions = regionAt(x, y, w, h); if (afRegions == null) return;
        manualFocus = false; afLock = false; aeLock = false; guides.lock = false;
        guides.sun = manualExp ? "ISO " + iso : "☀ " + (ev > 0 ? "+" : "") + ev; guides.focus(x, y);
        triggerAf(); updateRepeating(); refreshChips();
    }
    void lockAt(float x, float y, int w, int h) {
        afRegions = regionAt(x, y, w, h); if (afRegions == null) return;
        manualFocus = false; afLock = true; aeLock = !manualExp; guides.lock = true; guides.sun = "AE/AF LOCK"; guides.focus(x, y);
        triggerAf(); updateRepeating(); refreshChips();
        toast("ล็อกโฟกัสและแสง — จิ้มที่อื่นเพื่อปลด");
    }

    // ---- LUT view assist + tools
    void applyLut() {
        if (lp == null) return;
        lp.lutOn = lutIdx >= 0;
        if (lutIdx < 0) { gv.requestRender(); return; }
        final int idx = lutIdx; final String src = profile;
        new Thread(() -> { float[] d; int n = Luts.N; if (idx == 100 && customLut != null) { d = customLut; n = customN; } else d = Luts.build(Math.min(idx, Luts.NAMES.length - 1), src); lp.setLut(d, n); }).start();
    }
    void openStrip(String mode) {
        hidePanel();
        if (mode.equals(stripMode) && stripWrap.getVisibility() == View.VISIBLE) { hideStrip(); return; }
        stripMode = mode; strip.removeAllViews();
        if (mode.equals("lut")) {
            addStripBtn("ปิด", lutIdx < 0, v -> setLut(-1));
            for (int i = 0; i < Luts.NAMES.length; i++) { final int idx = i; addStripBtn(Luts.NAMES[i], lutIdx == i, v -> setLut(idx)); }
            if (customLut != null) addStripBtn("★ " + (customName == null ? "LUT ของฉัน" : customName), lutIdx == 100, v -> setLut(100));
            addStripBtn("+ นำเข้า .cube", false, v -> importLut());
            addStripBtn("⇩ ส่งออก LUT", false, v -> exportLut());
        } else {
            addStripBtn("Zebra", zebra, v -> { zebra = !zebra; lp.zebra = zebra; gv.requestRender(); openStripAgain(); });
            addStripBtn("False Color", falseColor, v -> { falseColor = !falseColor; lp.falseColor = falseColor; gv.requestRender(); openStripAgain(); });
            addStripBtn("Focus Peaking", peaking, v -> { peaking = !peaking; lp.peaking = peaking; gv.requestRender(); openStripAgain(); });
            addStripBtn(aeLock || afLock ? "ปลดล็อก AE/AF" : "ล็อก AE/AF กลางจอ", aeLock || afLock, v -> { if (aeLock || afLock) { aeLock = false; afLock = false; guides.lock = false; updateRepeating(); refreshChips(); } else lockAt(gv.getWidth() / 2f, gv.getHeight() / 2f, gv.getWidth(), gv.getHeight()); openStripAgain(); });
            addStripBtn("หมุนพรีวิว ↻", false, v -> { rotOffset = (rotOffset + 90) % 360; savePrefs(); layoutPreview(); toast("หมุนพรีวิว (ไฟล์วิดีโอไม่เปลี่ยน)"); });
        }
        stripWrap.setVisibility(View.VISIBLE); refreshChips();
    }
    void openStripAgain() { String m = stripMode; stripMode = null; openStrip(m); }
    void hideStrip() { if (stripWrap != null) stripWrap.setVisibility(View.GONE); stripMode = null; }
    void addStripBtn(String t, boolean on, View.OnClickListener l) {
        TextView b = pill(t, on); b.setOnClickListener(l);
        LinearLayout.LayoutParams p = new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(38)); p.setMarginEnd(dp(6)); strip.addView(b, p);
    }
    void setLut(int idx) {
        lutIdx = idx; savePrefs(); applyLut(); openStripAgain();
        if (idx >= 0 && "natural".equals(profile)) toast("LUT ออกแบบมาสำหรับ MoonLog / HLG — ใน Natural จะเป็นฟิลเตอร์พรีวิวแทน");
        else if (idx >= 0) toast("พรีวิว LUT: " + (idx == 100 ? customName : Luts.NAMES[idx]) + " — ไฟล์วิดีโอยังเป็น log สำหรับเกรดทีหลัง");
    }
    void importLut() {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT); i.addCategory(Intent.CATEGORY_OPENABLE); i.setType("*/*");
        try { startActivityForResult(i, REQ_LUT); } catch (Exception e) { toast("เปิดตัวเลือกไฟล์ไม่ได้"); }
    }
    @Override protected void onActivityResult(int req, int result, Intent data) {
        super.onActivityResult(req, result, data);
        if (req != REQ_LUT || result != RESULT_OK || data == null || data.getData() == null) return;
        try (java.io.InputStream in = getContentResolver().openInputStream(data.getData())) {
            Object[] r = Luts.parseCube(in); customN = (Integer) r[0]; customLut = (float[]) r[1];
            String name = data.getData().getLastPathSegment(); if (name != null) { name = name.substring(name.lastIndexOf('/') + 1).replace(".cube", ""); if (name.length() > 18) name = name.substring(0, 18); }
            customName = name;
            try (java.io.FileOutputStream o = new java.io.FileOutputStream(new File(getFilesDir(), "custom.cube"))) { o.write(Luts.toCube(customName == null ? "custom" : customName, customLut, customN).getBytes("UTF-8")); }
            sp.edit().putString("customName", customName).apply();
            setLut(100); toast("นำเข้า LUT แล้ว (" + customN + "³)");
        } catch (Exception e) { toast("นำเข้าไม่ได้: " + e.getMessage()); }
    }
    void loadCustomLut() {
        File f = new File(getFilesDir(), "custom.cube"); if (!f.exists()) return;
        try (java.io.InputStream in = new java.io.FileInputStream(f)) { Object[] r = Luts.parseCube(in); customN = (Integer) r[0]; customLut = (float[]) r[1]; customName = sp.getString("customName", "LUT ของฉัน"); }
        catch (Exception ignored) {}
    }
    void exportLut() {
        final String src = profile;
        new Thread(() -> {
            try {
                String tag = "hlg10".equals(src) ? "HLG" : "log8".equals(src) ? "MoonLog" : "Natural";
                for (int i = 0; i < Luts.NAMES.length; i++) Luts.saveToDownloads(this, "MoonCam_" + tag + "_" + Luts.NAMES[i].replace(" ", "").replace("&", "and").replace(".", "") + ".cube", Luts.toCube("MoonCam " + tag + " " + Luts.NAMES[i], Luts.build(i, src), Luts.N));
                toast("ส่งออก LUT 10 ไฟล์ (" + tag + ") ไว้ที่ Download/MoonCam LUTs แล้ว");
            } catch (Exception e) { toast("ส่งออกไม่ได้: " + e.getMessage()); }
        }).start();
    }

    // ---- preview geometry
    int previewRotation() { int r = displayDegrees(); return (r == 90 ? 90 : r == 270 ? -90 : r == 180 ? 180 : 0) + rotOffset; }
    void layoutPreview() {
        int W = root.getWidth(), H = root.getHeight(); if (W == 0 || H == 0) { root.post(this::layoutPreview); return; }
        int top = dp(TOPBAR), avail = H - top - dp(BOTBAR), aw = W - dp(240);
        int w = aw, h = aw * 9 / 16; if (h > avail) { h = avail; w = avail * 16 / 9; }
        FrameLayout.LayoutParams g1 = new FrameLayout.LayoutParams(w, h, Gravity.TOP | Gravity.CENTER_HORIZONTAL); g1.topMargin = top + (avail - h) / 2; gv.setLayoutParams(g1);
        FrameLayout.LayoutParams g2 = new FrameLayout.LayoutParams(w, h, Gravity.TOP | Gravity.CENTER_HORIZONTAL); g2.topMargin = g1.topMargin; guides.setLayoutParams(g2);
        if (scope != null) { int gut = (W - w) / 2 - dp(16); int sw = Math.max(dp(150), Math.min(dp(230), gut)); FrameLayout.LayoutParams sp2 = new FrameLayout.LayoutParams(sw, sw * 62 / 100, Gravity.START | Gravity.CENTER_VERTICAL); sp2.setMarginStart(dp(8)); scope.setLayoutParams(sp2); }
        if (lp != null) { lp.rotationDeg = previewRotation(); gv.requestRender(); }
        applyLut();
    }
    void toast(String s) { ui.post(() -> Toast.makeText(this, s, Toast.LENGTH_SHORT).show()); }

    /** Frame guides, grid and the focus / exposure square drawn over the preview. */
    class GuideView extends View {
        final Paint line = new Paint(Paint.ANTI_ALIAS_FLAG), shade = new Paint(), gold = new Paint(Paint.ANTI_ALIAS_FLAG), text = new Paint(Paint.ANTI_ALIAS_FLAG);
        float fx = -1, fy = -1; long ft = 0; String sun = ""; boolean lock = false, rec = false; final Paint tally = new Paint();
        GuideView(Context c) {
            super(c); line.setColor(0x66FFFFFF); line.setStrokeWidth(dp(1)); shade.setColor(0x88000000);
            gold.setColor(GOLD); gold.setStyle(Paint.Style.STROKE); gold.setStrokeWidth(dp(1.8f));
            text.setColor(GOLD); text.setTextSize(dp(13)); text.setTypeface(Typeface.create(Typeface.MONOSPACE, Typeface.BOLD)); text.setShadowLayer(dp(2), 0, 0, 0xCC000000);
        }
        void focus(float x, float y) { fx = x; fy = y; keep(); }
        void keep() { ft = SystemClock.elapsedRealtime(); invalidate(); removeCallbacks(fade); postDelayed(fade, 2600); }
        final Runnable fade = this::invalidate;
        boolean showing() { return fx >= 0 && (lock || SystemClock.elapsedRealtime() - ft < 2500); }
        @Override protected void onDraw(Canvas c) {
            int w = getWidth(), h = getHeight();
            if (guide >= 1) { c.drawLine(w / 3f, 0, w / 3f, h, line); c.drawLine(2 * w / 3f, 0, 2 * w / 3f, h, line); c.drawLine(0, h / 3f, w, h / 3f, line); c.drawLine(0, 2 * h / 3f, w, 2 * h / 3f, line); }
            float r = guide == 2 ? 2.39f : guide == 3 ? 1.85f : 0;
            if (r > 0) { float bh = (h - w / r) / 2; c.drawRect(0, 0, w, bh, shade); c.drawRect(0, h - bh, w, h, shade); c.drawLine(0, bh, w, bh, gold); c.drawLine(0, h - bh, w, h - bh, gold); }
            if (guide == 4) { float bw = h * 9f / 16f, x0 = (w - bw) / 2; c.drawRect(0, 0, x0, h, shade); c.drawRect(x0 + bw, 0, w, h, shade); c.drawRect(x0, 0, x0 + bw, h, gold); }
            if (rec) { tally.setColor(0xFFE0302A); tally.setStyle(Paint.Style.STROKE); tally.setStrokeWidth(dp(4)); c.drawRect(dp(2), dp(2), w - dp(2), h - dp(2), tally); }
            if (showing()) {
                float s = dp(38); c.drawRect(fx - s, fy - s, fx + s, fy + s, gold);
                float sx = fx + s + dp(10); c.drawLine(sx, fy - s, sx, fy + s, gold);
                if (!sun.isEmpty()) c.drawText(sun, sx + dp(8), fy + dp(5), text);
                if (lock) c.drawText("LOCK", fx - s, fy - s - dp(8), text);
            }
        }
    }

    // ------------------------------------------------------------------ lenses: real cameras → 0.6× / 1× / 3× like the phone's own app
    static class Lens { String label; float ratio, eq; String camId; boolean zoom; }
    static float eqFocal(CameraCharacteristics c) {
        float[] fl = c.get(CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS); SizeF s = c.get(CameraCharacteristics.SENSOR_INFO_PHYSICAL_SIZE);
        if (fl == null || fl.length == 0 || s == null) return 0;
        return (float) (fl[0] * 43.27 / Math.hypot(s.getWidth(), s.getHeight()));
    }
    static String ratioLabel(float r) { if (r < 0.95f) return String.format(Locale.US, "%.1f", r); return Math.abs(r - Math.round(r)) < 0.12f ? String.valueOf(Math.round(r)) : String.format(Locale.US, "%.1f", r); }
    static List<Lens> lensPlan(CameraManager cm) throws CameraAccessException {
        List<Lens> out = new ArrayList<>(); List<String> backs = new ArrayList<>();
        for (String id : cm.getCameraIdList()) { Integer f = cm.getCameraCharacteristics(id).get(CameraCharacteristics.LENS_FACING); if (f != null && f == CameraCharacteristics.LENS_FACING_BACK) backs.add(id); }
        if (backs.isEmpty()) return out;
        String main = backs.get(0); CameraCharacteristics mc = cm.getCameraCharacteristics(main); float mainEq = eqFocal(mc);
        Range<Float> zr = Build.VERSION.SDK_INT >= 30 ? mc.get(CameraCharacteristics.CONTROL_ZOOM_RATIO_RANGE) : null;
        Lens m = new Lens(); m.ratio = 1f; m.eq = mainEq; m.camId = main; m.zoom = zr != null; m.label = "1"; out.add(m);
        List<String> candIds = new ArrayList<>(); List<Float> candEq = new ArrayList<>();
        if (Build.VERSION.SDK_INT >= 28) for (String pid : mc.getPhysicalCameraIds()) { try { candIds.add(null); candEq.add(eqFocal(cm.getCameraCharacteristics(pid))); } catch (Exception ignored) {} }
        for (int i = 1; i < backs.size(); i++) { candIds.add(backs.get(i)); candEq.add(eqFocal(cm.getCameraCharacteristics(backs.get(i)))); }
        for (int i = 0; i < candEq.size(); i++) {
            float eq = candEq.get(i); if (eq <= 0 || mainEq <= 0) continue;
            float r = eq / mainEq; if (Math.abs(r - 1) < 0.15f) continue;
            boolean dup = false; for (Lens l : out) if (Math.abs(l.ratio - r) / r < 0.12f) dup = true; if (dup) continue;
            Lens l = new Lens(); l.eq = eq;
            if (zr != null && r >= zr.getLower() - 0.06f && r <= zr.getUpper()) { l.zoom = true; l.ratio = Math.max(zr.getLower(), r); l.camId = main; }
            else if (candIds.get(i) != null) { l.zoom = false; l.ratio = r; l.camId = candIds.get(i); }
            else continue;
            l.label = ratioLabel(l.ratio); out.add(l);
        }
        // logical camera that hides its ultra-wide but still reaches it through the zoom ratio
        boolean hasUw = false; for (Lens l : out) if (l.ratio < 0.95f) hasUw = true;
        if (!hasUw && zr != null && zr.getLower() < 0.95f) { Lens l = new Lens(); l.zoom = true; l.ratio = zr.getLower(); l.eq = mainEq * l.ratio; l.camId = main; l.label = ratioLabel(l.ratio); out.add(l); }
        boolean hasTwo = false; for (Lens l : out) if (l.ratio > 1.5f) hasTwo = true;
        if (!hasTwo && zr != null && zr.getUpper() >= 2f) { Lens l = new Lens(); l.zoom = true; l.ratio = 2f; l.eq = mainEq * 2; l.camId = main; l.label = "2"; out.add(l); }
        out.sort((a, b) -> Float.compare(a.ratio, b.ratio));
        return out;
    }

    // ------------------------------------------------------------------ device check (for the web "เช็กมือถือ" sheet)
    static String cameraInfoJson(Context ctx) {
        JSONObject o = new JSONObject();
        try {
            CameraManager cm = (CameraManager) ctx.getSystemService(CAMERA_SERVICE);
            o.put("android", Build.VERSION.SDK_INT); o.put("model", Build.MANUFACTURER + " " + Build.MODEL);
            JSONArray cams = new JSONArray();
            for (String id : cm.getCameraIdList()) {
                CameraCharacteristics c = cm.getCameraCharacteristics(id); JSONObject j = new JSONObject();
                Integer f = c.get(CameraCharacteristics.LENS_FACING); j.put("id", id); j.put("facing", f == null ? "?" : f == CameraCharacteristics.LENS_FACING_BACK ? "หลัง" : f == CameraCharacteristics.LENS_FACING_FRONT ? "หน้า" : "ภายนอก");
                Integer lvl = c.get(CameraCharacteristics.INFO_SUPPORTED_HARDWARE_LEVEL);
                j.put("level", lvl == null ? "?" : lvl == 0 ? "LIMITED" : lvl == 1 ? "FULL" : lvl == 2 ? "LEGACY" : lvl == 3 ? "LEVEL_3" : "EXTERNAL");
                int[] caps = c.get(CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES);
                j.put("manualSensor", has(caps, CameraMetadata.REQUEST_AVAILABLE_CAPABILITIES_MANUAL_SENSOR));
                j.put("manualPost", has(caps, CameraMetadata.REQUEST_AVAILABLE_CAPABILITIES_MANUAL_POST_PROCESSING));
                j.put("raw", has(caps, CameraMetadata.REQUEST_AVAILABLE_CAPABILITIES_RAW));
                boolean ten = false; JSONArray prof = new JSONArray();
                if (Build.VERSION.SDK_INT >= 33 && has(caps, CameraMetadata.REQUEST_AVAILABLE_CAPABILITIES_DYNAMIC_RANGE_TEN_BIT)) {
                    DynamicRangeProfiles p = c.get(CameraCharacteristics.REQUEST_AVAILABLE_DYNAMIC_RANGE_PROFILES);
                    if (p != null) { Set<Long> s = p.getSupportedProfiles(); ten = s.contains(DynamicRangeProfiles.HLG10);
                        if (s.contains(DynamicRangeProfiles.HLG10)) prof.put("HLG10"); if (s.contains(DynamicRangeProfiles.HDR10)) prof.put("HDR10"); if (s.contains(DynamicRangeProfiles.HDR10_PLUS)) prof.put("HDR10+");
                        if (s.contains(DynamicRangeProfiles.DOLBY_VISION_10B_HDR_OEM)) prof.put("DolbyVision"); }
                }
                j.put("tenBit", ten); j.put("hdrProfiles", prof);
                j.put("logCurve", has(c.get(CameraCharacteristics.TONEMAP_AVAILABLE_TONE_MAP_MODES), CameraMetadata.TONEMAP_MODE_CONTRAST_CURVE));
                StreamConfigurationMap map = c.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP); JSONArray vs = new JSONArray();
                if (map != null) { Size[] s = map.getOutputSizes(MediaRecorder.class); if (hasSize(s, 3840, 2160)) vs.put("4K"); if (hasSize(s, 1920, 1080)) vs.put("1080p"); if (hasSize(s, 1280, 720)) vs.put("720p"); }
                j.put("video", vs);
                JSONArray fr = new JSONArray(); Range<Integer>[] r = c.get(CameraCharacteristics.CONTROL_AE_AVAILABLE_TARGET_FPS_RANGES); if (r != null) for (Range<Integer> x : r) fr.put(x.getLower() + "-" + x.getUpper());
                j.put("fps", fr);
                Range<Integer> iso = c.get(CameraCharacteristics.SENSOR_INFO_SENSITIVITY_RANGE); if (iso != null) j.put("iso", iso.getLower() + "-" + iso.getUpper());
                Range<Long> ex = c.get(CameraCharacteristics.SENSOR_INFO_EXPOSURE_TIME_RANGE); if (ex != null) j.put("shutter", "1/" + Math.round(1e9 / ex.getLower()) + " - " + (ex.getUpper() >= 1e9 ? Math.round(ex.getUpper() / 1e9) + "s" : "1/" + Math.round(1e9 / ex.getUpper())));
                float[] fl = c.get(CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS); if (fl != null && fl.length > 0) j.put("focal", fl[0]);
                j.put("eq", Math.round(eqFocal(c)));
                if (Build.VERSION.SDK_INT >= 28) j.put("physical", new JSONArray(c.getPhysicalCameraIds()));
                if (Build.VERSION.SDK_INT >= 30) { Range<Float> zr = c.get(CameraCharacteristics.CONTROL_ZOOM_RATIO_RANGE); if (zr != null) j.put("zoom", String.format(Locale.US, "%.2f-%.1f", zr.getLower(), zr.getUpper())); }
                j.put("ois", has(c.get(CameraCharacteristics.LENS_INFO_AVAILABLE_OPTICAL_STABILIZATION), CameraMetadata.LENS_OPTICAL_STABILIZATION_MODE_ON));
                cams.put(j);
            }
            o.put("cameras", cams);
            JSONArray ls = new JSONArray();
            for (Lens l : lensPlan(cm)) { JSONObject j = new JSONObject(); j.put("label", l.label); j.put("ratio", l.ratio); j.put("eq", Math.round(l.eq)); j.put("camId", l.camId); j.put("via", l.zoom ? "zoom" : "id"); ls.put(j); }
            o.put("lenses", ls);
        } catch (Exception e) { try { o.put("error", String.valueOf(e.getMessage())); } catch (Exception ignored) {} }
        return o.toString();
    }
}
