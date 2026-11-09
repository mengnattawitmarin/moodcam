package com.moodcam.web;

import android.Manifest;
import android.app.Activity;
import android.content.ContentValues;
import android.content.Context;
import android.content.SharedPreferences;
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
    TextureView tv; Surface previewSurface, recSurface; Size videoSize, previewSize;
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

    // UI
    FrameLayout root; LinearLayout bar, panel; TextView tc, info, panelLabel, recDot; SeekBar panelSeek; Button panelAuto; FrameLayout recBtn; View recInner;
    ProgressBar meter; GuideView guides; String panelKey = null;
    final List<TextView[]> chips = new ArrayList<>();

    @Override protected void onCreate(Bundle b) {
        super.onCreate(b);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON | WindowManager.LayoutParams.FLAG_FULLSCREEN);
        cm = (CameraManager) getSystemService(CAMERA_SERVICE);
        sp = getSharedPreferences("cinema", MODE_PRIVATE);
        fps = sp.getInt("fps", 30); res = sp.getString("res", "1080"); profile = sp.getString("profile", "natural");
        stab = sp.getBoolean("stab", true); guide = sp.getInt("guide", 1);
        pickCamera();
        buildUi();
    }

    @Override protected void onResume() {
        super.onResume(); hideSystemUi();
        bgThread = new HandlerThread("cinema"); bgThread.start(); bg = new Handler(bgThread.getLooper());
        if (checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED || checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(new String[]{Manifest.permission.CAMERA, Manifest.permission.RECORD_AUDIO}, REQ_PERMS);
        } else if (tv.isAvailable()) openCamera();
    }

    @Override protected void onPause() {
        if (recording) stopRecording();
        closeCamera();
        if (bgThread != null) { bgThread.quitSafely(); bgThread = null; bg = null; }
        super.onPause();
    }

    @Override public void onRequestPermissionsResult(int code, String[] perms, int[] res) {
        if (code != REQ_PERMS) return;
        if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) { if (tv.isAvailable()) openCamera(); }
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
        } catch (Exception e) { toast("เปิดกล้องไม่ได้: " + e.getMessage()); finish(); return; }
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
        int base = "4K".equals(res) ? 60_000_000 : "720".equals(res) ? 12_000_000 : 24_000_000;
        if (fps >= 50) base = base * 3 / 2;
        if ("hlg10".equals(profile)) base = base * 5 / 4;
        return base;
    }
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
            SurfaceTexture st = tv.getSurfaceTexture(); st.setDefaultBufferSize(previewSize.getWidth(), previewSize.getHeight());
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

    MediaRecorder buildRecorder(String path, java.io.FileDescriptor fd, boolean audio) throws Exception {
        MediaRecorder r = Build.VERSION.SDK_INT >= 31 ? new MediaRecorder(this) : new MediaRecorder();
        if (audio) r.setAudioSource(MediaRecorder.AudioSource.CAMCORDER);
        r.setVideoSource(MediaRecorder.VideoSource.SURFACE);
        r.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
        if (fd != null) r.setOutputFile(fd); else r.setOutputFile(path);
        r.setVideoEncodingBitRate(bitrate());
        r.setVideoFrameRate(fps);
        r.setVideoSize(videoSize.getWidth(), videoSize.getHeight());
        boolean hlg = "hlg10".equals(profile);
        r.setVideoEncoder(hlg ? MediaRecorder.VideoEncoder.HEVC : MediaRecorder.VideoEncoder.H264);
        if (hlg) r.setVideoEncodingProfileLevel(MediaCodecInfo.CodecProfileLevel.HEVCProfileMain10, MediaCodecInfo.CodecProfileLevel.HEVCMainTierLevel51);
        if (audio) { r.setAudioEncoder(MediaRecorder.AudioEncoder.AAC); r.setAudioEncodingBitRate(192000); r.setAudioSamplingRate(48000); r.setAudioChannels(1); }
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
            long frame = 1_000_000_000L / fps, exp = Math.min(frame, (long) (angle / 360.0 * frame));
            exp = Math.max(expRange.getLower(), Math.min(expRange.getUpper(), exp));
            b.set(CaptureRequest.SENSOR_EXPOSURE_TIME, exp); b.set(CaptureRequest.SENSOR_FRAME_DURATION, frame);
        } else {
            b.set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON);
            b.set(CaptureRequest.CONTROL_AE_EXPOSURE_COMPENSATION, ev);
        }
        b.set(CaptureRequest.CONTROL_AWB_MODE, WB_MODES[wbIdx]); b.set(CaptureRequest.CONTROL_AWB_LOCK, awbLock);
        if (manualFocus && minFocus > 0) { b.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_OFF); b.set(CaptureRequest.LENS_FOCUS_DISTANCE, focusDist); }
        else { b.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_VIDEO); if (afRegions != null) b.set(CaptureRequest.CONTROL_AF_REGIONS, afRegions); }
        b.set(CaptureRequest.CONTROL_VIDEO_STABILIZATION_MODE, stab ? CaptureRequest.CONTROL_VIDEO_STABILIZATION_MODE_ON : CaptureRequest.CONTROL_VIDEO_STABILIZATION_MODE_OFF);
        if ("log8".equals(profile) && capCurve) { b.set(CaptureRequest.TONEMAP_MODE, CaptureRequest.TONEMAP_MODE_CONTRAST_CURVE); b.set(CaptureRequest.TONEMAP_CURVE, logCurve()); }
    }
    Range<Integer> fpsRange() {
        Range<Integer>[] fr = ch.get(CameraCharacteristics.CONTROL_AE_AVAILABLE_TARGET_FPS_RANGES); Range<Integer> best = null;
        if (fr != null) for (Range<Integer> r : fr) { if (r.getUpper() == fps && (best == null || r.getLower() > best.getLower())) best = r; }
        if (best == null && fr != null) for (Range<Integer> r : fr) if (r.contains(fps)) { best = r; break; }
        return best != null ? best : new Range<>(fps, fps);
    }
    /** MoonLog: lifted blacks, long highlight roll-off (log-shaped), same curve on R/G/B. */
    static TonemapCurve logCurve() {
        int n = 32; float[] p = new float[n * 2];
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
            String name = "MoonCam_" + new SimpleDateFormat("yyyyMMdd_HHmmss", Locale.US).format(new Date()) + "_" + profName(profile).replace(" ", "") + ".mp4";
            ContentValues cv = new ContentValues();
            cv.put(MediaStore.Video.Media.DISPLAY_NAME, name); cv.put(MediaStore.Video.Media.MIME_TYPE, "video/mp4");
            cv.put(MediaStore.Video.Media.RELATIVE_PATH, Environment.DIRECTORY_MOVIES + "/MoonCam"); cv.put(MediaStore.Video.Media.IS_PENDING, 1);
            outUri = getContentResolver().insert(MediaStore.Video.Media.EXTERNAL_CONTENT_URI, cv);
            pfd = getContentResolver().openFileDescriptor(outUri, "w");
            boolean audio = checkSelfPermission(Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
            mr = buildRecorder(null, pfd.getFileDescriptor(), audio); mr.prepare();
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
            if (ok) { ContentValues cv = new ContentValues(); cv.put(MediaStore.Video.Media.IS_PENDING, 0); getContentResolver().update(outUri, cv, null, null); toast("บันทึกแล้ว · Movies/MoonCam"); }
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
        tv = new TextureView(this);
        root.addView(tv, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT, Gravity.CENTER));
        guides = new GuideView(this); root.addView(guides, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT, Gravity.CENTER));
        tv.setSurfaceTextureListener(new TextureView.SurfaceTextureListener() {
            @Override public void onSurfaceTextureAvailable(SurfaceTexture s, int w, int h) { if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) openCamera(); }
            @Override public void onSurfaceTextureSizeChanged(SurfaceTexture s, int w, int h) { configureTransform(); }
            @Override public boolean onSurfaceTextureDestroyed(SurfaceTexture s) { return true; }
            @Override public void onSurfaceTextureUpdated(SurfaceTexture s) {}
        });
        tv.setOnTouchListener((v, e) -> { if (e.getAction() == MotionEvent.ACTION_UP) tapFocus(e.getX(), e.getY(), v.getWidth(), v.getHeight()); return true; });

        // top bar of chips
        HorizontalScrollView hs = new HorizontalScrollView(this); hs.setHorizontalScrollBarEnabled(false);
        bar = new LinearLayout(this); bar.setOrientation(LinearLayout.HORIZONTAL); bar.setGravity(Gravity.CENTER_VERTICAL); bar.setPadding(dp(8), dp(4), dp(8), dp(4));
        hs.addView(bar); hs.setBackgroundColor(0x99000000);
        root.addView(hs, new FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.TOP));
        addChip("✕", "ออก", v -> { if (recording) stopRecording(); finish(); });
        addChip("ISO", "iso", v -> openPanel("iso"));
        addChip("SHUTTER", "sh", v -> openPanel("sh"));
        addChip("EV", "ev", v -> openPanel("ev"));
        addChip("WB", "wb", v -> { if (recording) return; wbIdx = (wbIdx + 1) % WB_MODES.length; awbLock = false; updateRepeating(); refreshChips(); });
        addChip("FOCUS", "af", v -> openPanel("af"));
        addChip("FPS", "fps", v -> cycleConfig("fps"));
        addChip("RES", "res", v -> cycleConfig("res"));
        addChip("PROFILE", "prof", v -> cycleConfig("prof"));
        addChip("STAB", "stab", v -> { stab = !stab; savePrefs(); updateRepeating(); refreshChips(); });
        addChip("GUIDE", "guide", v -> { guide = (guide + 1) % GUIDES.length; savePrefs(); guides.invalidate(); refreshChips(); });

        // record button
        recBtn = new FrameLayout(this);
        GradientDrawable ring = new GradientDrawable(); ring.setShape(GradientDrawable.OVAL); ring.setStroke(dp(4), INK); recBtn.setBackground(ring);
        recInner = new View(this); GradientDrawable in = new GradientDrawable(); in.setShape(GradientDrawable.OVAL); in.setColor(RED); recInner.setBackground(in);
        recBtn.addView(recInner, new FrameLayout.LayoutParams(dp(54), dp(54), Gravity.CENTER));
        FrameLayout.LayoutParams rl = new FrameLayout.LayoutParams(dp(76), dp(76), Gravity.END | Gravity.CENTER_VERTICAL); rl.setMarginEnd(dp(18));
        root.addView(recBtn, rl); recBtn.setOnClickListener(v -> toggleRec());

        // timecode + meter (bottom left)
        LinearLayout bl = new LinearLayout(this); bl.setOrientation(LinearLayout.VERTICAL); bl.setPadding(dp(14), dp(8), dp(14), dp(8));
        GradientDrawable bbg = new GradientDrawable(); bbg.setColor(PANEL); bbg.setCornerRadius(dp(12)); bl.setBackground(bbg);
        LinearLayout tcRow = new LinearLayout(this); tcRow.setGravity(Gravity.CENTER_VERTICAL);
        recDot = new TextView(this); recDot.setText("● "); recDot.setTextColor(RED); recDot.setTextSize(14); recDot.setAlpha(.25f);
        tc = new TextView(this); tc.setText("00:00:00:00"); tc.setTextColor(INK); tc.setTextSize(20); tc.setTypeface(Typeface.MONOSPACE, Typeface.BOLD);
        tcRow.addView(recDot); tcRow.addView(tc); bl.addView(tcRow);
        meter = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal); meter.setMax(100); meter.setProgressTintList(android.content.res.ColorStateList.valueOf(0xFF5BD06A));
        bl.addView(meter, new LinearLayout.LayoutParams(dp(170), dp(6)));
        info = new TextView(this); info.setTextColor(MUTED); info.setTextSize(11); info.setTypeface(Typeface.MONOSPACE); bl.addView(info);
        FrameLayout.LayoutParams bll = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM | Gravity.START);
        bll.setMargins(dp(14), 0, 0, dp(14)); root.addView(bl, bll);

        // slider panel (bottom centre)
        panel = new LinearLayout(this); panel.setOrientation(LinearLayout.HORIZONTAL); panel.setGravity(Gravity.CENTER_VERTICAL); panel.setPadding(dp(14), dp(6), dp(8), dp(6));
        GradientDrawable pbg = new GradientDrawable(); pbg.setColor(PANEL); pbg.setCornerRadius(dp(16)); panel.setBackground(pbg);
        panelLabel = new TextView(this); panelLabel.setTextColor(GOLD); panelLabel.setTextSize(13); panelLabel.setTypeface(Typeface.MONOSPACE, Typeface.BOLD); panelLabel.setMinWidth(dp(120));
        panelSeek = new SeekBar(this); panelSeek.setMax(1000);
        panelSeek.setProgressTintList(android.content.res.ColorStateList.valueOf(GOLD)); panelSeek.setThumbTintList(android.content.res.ColorStateList.valueOf(GOLD));
        panelAuto = new Button(this); panelAuto.setText("AUTO"); panelAuto.setTextColor(0xFF1B1408); panelAuto.setAllCaps(false);
        GradientDrawable ab = new GradientDrawable(); ab.setColor(GOLD); ab.setCornerRadius(dp(14)); panelAuto.setBackground(ab); panelAuto.setPadding(dp(12), 0, dp(12), 0);
        panel.addView(panelLabel); panel.addView(panelSeek, new LinearLayout.LayoutParams(dp(260), ViewGroup.LayoutParams.WRAP_CONTENT)); panel.addView(panelAuto, new LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, dp(34)));
        FrameLayout.LayoutParams pl = new FrameLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM | Gravity.CENTER_HORIZONTAL);
        pl.bottomMargin = dp(14); root.addView(panel, pl); panel.setVisibility(View.GONE);
        panelSeek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            @Override public void onProgressChanged(SeekBar s, int p, boolean user) { if (user) panelChanged(p / 1000f); }
            @Override public void onStartTrackingTouch(SeekBar s) {}
            @Override public void onStopTrackingTouch(SeekBar s) {}
        });
        panelAuto.setOnClickListener(v -> panelAutoPressed());
        setContentView(root);
        refreshUi();
    }
    void addChip(String label, String key, View.OnClickListener l) {
        LinearLayout c = new LinearLayout(this); c.setOrientation(LinearLayout.VERTICAL); c.setGravity(Gravity.CENTER); c.setPadding(dp(10), dp(4), dp(10), dp(4)); c.setMinimumWidth(dp(54));
        TextView t = new TextView(this); t.setText(label); t.setTextColor(INK); t.setTextSize(11); t.setTypeface(Typeface.DEFAULT_BOLD); t.setGravity(Gravity.CENTER);
        TextView v = new TextView(this); v.setTextColor(GOLD); v.setTextSize(10.5f); v.setTypeface(Typeface.MONOSPACE); v.setGravity(Gravity.CENTER); v.setTag(key);
        c.addView(t); c.addView(v); c.setOnClickListener(l);
        bar.addView(c); chips.add(new TextView[]{t, v});
    }
    void refreshUi() { refreshChips(); recInnerShape(); }
    void recInnerShape() {
        if (recInner == null) return;
        GradientDrawable in = new GradientDrawable(); in.setColor(RED);
        if (recording) { in.setShape(GradientDrawable.RECTANGLE); in.setCornerRadius(dp(6)); recInner.setLayoutParams(new FrameLayout.LayoutParams(dp(30), dp(30), Gravity.CENTER)); }
        else { in.setShape(GradientDrawable.OVAL); recInner.setLayoutParams(new FrameLayout.LayoutParams(dp(54), dp(54), Gravity.CENTER)); }
        recInner.setBackground(in);
        recDot.setAlpha(recording ? 1f : .25f);
    }
    void refreshChips() {
        for (TextView[] c : chips) {
            String k = (String) c[1].getTag(); String v = "";
            switch (k) {
                case "iso": v = manualExp ? String.valueOf(iso) : (liveIso > 0 ? "A " + liveIso : "AUTO"); break;
                case "sh": v = manualExp ? angle + "°" : (liveExp > 0 ? "A 1/" + Math.round(1e9 / liveExp) : "AUTO"); break;
                case "ev": v = manualExp ? "—" : (ev > 0 ? "+" + ev : String.valueOf(ev)); break;
                case "wb": v = WB_NAMES[wbIdx] + (awbLock ? "🔒" : ""); break;
                case "af": v = manualFocus ? String.format(Locale.US, "MF %.1f", focusDist) : "AF"; break;
                case "fps": v = fps + "p"; break;
                case "res": v = "4K".equals(res) ? "4K" : res + "p"; break;
                case "prof": v = profName(profile); break;
                case "stab": v = stab ? "ON" : "OFF"; break;
                case "guide": v = GUIDES[guide]; break;
                default: v = "";
            }
            c[1].setText(v);
            boolean locked = recording && (k.equals("fps") || k.equals("res") || k.equals("prof"));
            c[0].setAlpha(locked ? .35f : 1f); c[1].setAlpha(locked ? .35f : 1f);
        }
        if (info != null) {
            long secs = -1;
            try { StatFs s = new StatFs(Environment.getExternalStorageDirectory().getPath()); secs = s.getAvailableBytes() / (bitrate() / 8 + 24_000); } catch (Exception ignored) {}
            String left = secs < 0 ? "" : String.format(Locale.US, " · เหลือ %dh%02dm", secs / 3600, secs / 60 % 60);
            info.setText(("4K".equals(res) ? "2160p" : res + "p") + " · " + fps + "fps · " + profName(profile) + " · " + (bitrate() / 1_000_000) + "Mbps" + left);
        }
    }

    // ---- config that needs a new session
    void cycleConfig(String k) {
        if (recording) { toast("หยุดบันทึกก่อนเปลี่ยน"); return; }
        if (k.equals("fps")) fps = fpsList.get((fpsList.indexOf(fps) + 1) % fpsList.size());
        if (k.equals("res")) res = resList.get((resList.indexOf(res) + 1) % resList.size());
        if (k.equals("prof")) {
            profile = profList.get((profList.indexOf(profile) + 1) % profList.size());
            if (profList.size() == 1) toast("เครื่องนี้มีแค่ Natural (ไม่รองรับ log curve / 10-bit)");
            else toast("hlg10".equals(profile) ? "HLG 10-bit · HEVC — ภาพจะดูแบน ใช้ LUT แปลงตอนตัดต่อ" : "log8".equals(profile) ? "MoonLog — ยกเงา เก็บไฮไลต์ ภาพแบนไว้เกรดสี" : "Natural — สีปกติพร้อมใช้");
        }
        savePrefs(); refreshChips();
        if (bg != null) bg.post(this::createSession);
    }
    void savePrefs() { sp.edit().putInt("fps", fps).putString("res", res).putString("profile", profile).putBoolean("stab", stab).putInt("guide", guide).apply(); }

    // ---- slider panel
    void openPanel(String k) {
        if (k.equals("iso") || k.equals("sh")) { if (!capManual) { toast("เครื่องนี้ไม่ให้แอปปรับ ISO/Shutter เอง — ใช้ EV แทน"); return; } if (!manualExp) { manualExp = true; if (liveIso > 0) iso = clampIso(liveIso); updateRepeating(); } }
        if (k.equals("ev") && manualExp) { toast("EV ใช้ได้ตอน ISO/Shutter เป็น AUTO"); return; }
        if (k.equals("ev") && (evRange == null || evRange.getUpper() == 0)) { toast("เครื่องนี้ไม่รองรับ EV"); return; }
        if (k.equals("af")) { if (minFocus <= 0) { toast("เครื่องนี้ไม่ให้โฟกัสเอง"); return; } manualFocus = true; updateRepeating(); }
        if (k.equals(panelKey) && panel.getVisibility() == View.VISIBLE) { hidePanel(); return; }
        panelKey = k; panel.setVisibility(View.VISIBLE); syncPanel(); refreshChips();
    }
    void hidePanel() { if (panel != null) panel.setVisibility(View.GONE); panelKey = null; }
    int clampIso(int v) { return Math.max(isoRange.getLower(), Math.min(isoRange.getUpper(), v)); }
    void syncPanel() {
        float t = 0;
        switch (panelKey) {
            case "iso": t = (float) (Math.log(iso / (double) isoRange.getLower()) / Math.log(isoRange.getUpper() / (double) isoRange.getLower())); panelLabel.setText("ISO " + iso); break;
            case "sh": t = (angle - 11.25f) / (360 - 11.25f); panelLabel.setText(angle + "° · 1/" + Math.round(fps * 360.0 / angle)); break;
            case "ev": t = (ev - evRange.getLower()) / (float) (evRange.getUpper() - evRange.getLower()); panelLabel.setText("EV " + (ev > 0 ? "+" : "") + ev); break;
            case "af": t = 1 - focusDist / minFocus; panelLabel.setText(focusDist <= 0.01f ? "MF ∞" : String.format(Locale.US, "MF %.2fm", 1 / focusDist)); break;
        }
        panelSeek.setProgress(Math.round(t * 1000));
    }
    void panelChanged(float t) {
        switch (panelKey) {
            case "iso": iso = clampIso((int) Math.round(isoRange.getLower() * Math.pow(isoRange.getUpper() / (double) isoRange.getLower(), t))); break;
            case "sh": { int[] steps = {11, 22, 45, 90, 144, 172, 180, 270, 360}; int best = 180; float target = 11.25f + t * (360 - 11.25f), d = 1e9f; for (int s : steps) if (Math.abs(s - target) < d) { d = Math.abs(s - target); best = s; } angle = best; break; }
            case "ev": ev = Math.round(evRange.getLower() + t * (evRange.getUpper() - evRange.getLower())); break;
            case "af": focusDist = (1 - t) * minFocus; break;
        }
        syncPanel(); updateRepeating(); refreshChips();
    }
    void panelAutoPressed() {
        switch (panelKey) {
            case "iso": case "sh": manualExp = false; break;
            case "ev": ev = 0; break;
            case "af": manualFocus = false; afRegions = null; break;
        }
        hidePanel(); updateRepeating(); refreshChips();
    }

    void tapFocus(float x, float y, int w, int h) {
        if (panel.getVisibility() == View.VISIBLE) { hidePanel(); return; }
        Rect a = ch.get(CameraCharacteristics.SENSOR_INFO_ACTIVE_ARRAY_SIZE); if (a == null || session == null) return;
        float nx = x / w, ny = y / h; if (displayDegrees() == 270) { nx = 1 - nx; ny = 1 - ny; }
        int cx = (int) (nx * a.width()), cy = (int) (ny * a.height()), r = a.width() / 12;
        afRegions = new MeteringRectangle[]{new MeteringRectangle(Math.max(0, cx - r), Math.max(0, cy - r), r * 2, r * 2, MeteringRectangle.METERING_WEIGHT_MAX - 1)};
        manualFocus = false; guides.focus(x, y);
        try {
            CaptureRequest.Builder b = dev.createCaptureRequest(recording ? CameraDevice.TEMPLATE_RECORD : CameraDevice.TEMPLATE_PREVIEW);
            b.addTarget(previewSurface); if (recording) b.addTarget(recSurface); applySettings(b);
            b.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_AUTO); b.set(CaptureRequest.CONTROL_AF_TRIGGER, CaptureRequest.CONTROL_AF_TRIGGER_START);
            session.capture(b.build(), null, bg);
        } catch (Exception ignored) {}
        updateRepeating(); refreshChips();
    }

    // ---- preview geometry
    void layoutPreview() {
        int W = root.getWidth(), H = root.getHeight(); if (W == 0 || H == 0) { root.post(this::layoutPreview); return; }
        int w = W, h = W * 9 / 16; if (h > H) { h = H; w = H * 16 / 9; }
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(w, h, Gravity.CENTER); tv.setLayoutParams(lp);
        guides.setLayoutParams(new FrameLayout.LayoutParams(w, h, Gravity.CENTER));
        tv.post(this::configureTransform);
    }
    void configureTransform() {
        if (previewSize == null) return;
        int vw = tv.getWidth(), vh = tv.getHeight(); if (vw == 0) return;
        int rot = displayDegrees(); Matrix m = new Matrix();
        RectF view = new RectF(0, 0, vw, vh), buf = new RectF(0, 0, previewSize.getHeight(), previewSize.getWidth());
        float cx = view.centerX(), cy = view.centerY();
        if (rot == 90 || rot == 270) {
            buf.offset(cx - buf.centerX(), cy - buf.centerY()); m.setRectToRect(view, buf, Matrix.ScaleToFit.FILL);
            float s = Math.max((float) vh / previewSize.getHeight(), (float) vw / previewSize.getWidth()); m.postScale(s, s, cx, cy); m.postRotate(rot - 180, cx, cy);
        } else if (rot == 180) m.postRotate(180, cx, cy);
        tv.setTransform(m);
    }
    void toast(String s) { ui.post(() -> Toast.makeText(this, s, Toast.LENGTH_SHORT).show()); }

    /** Frame guides, grid and focus square drawn over the preview. */
    class GuideView extends View {
        final Paint line = new Paint(Paint.ANTI_ALIAS_FLAG), shade = new Paint(), gold = new Paint(Paint.ANTI_ALIAS_FLAG);
        float fx = -1, fy = -1; long ft = 0;
        GuideView(Context c) { super(c); line.setColor(0x66FFFFFF); line.setStrokeWidth(dp(1)); shade.setColor(0x88000000); gold.setColor(GOLD); gold.setStyle(Paint.Style.STROKE); gold.setStrokeWidth(dp(1.5f)); }
        void focus(float x, float y) { fx = x; fy = y; ft = SystemClock.elapsedRealtime(); invalidate(); postDelayed(this::invalidate, 1300); }
        @Override protected void onDraw(Canvas c) {
            int w = getWidth(), h = getHeight();
            if (guide >= 1) { c.drawLine(w / 3f, 0, w / 3f, h, line); c.drawLine(2 * w / 3f, 0, 2 * w / 3f, h, line); c.drawLine(0, h / 3f, w, h / 3f, line); c.drawLine(0, 2 * h / 3f, w, 2 * h / 3f, line); }
            float r = guide == 2 ? 2.39f : guide == 3 ? 1.85f : 0;
            if (r > 0) { float bh = (h - w / r) / 2; c.drawRect(0, 0, w, bh, shade); c.drawRect(0, h - bh, w, h, shade); c.drawLine(0, bh, w, bh, gold); c.drawLine(0, h - bh, w, h - bh, gold); }
            if (guide == 4) { float bw = h * 9f / 16f, x0 = (w - bw) / 2; c.drawRect(0, 0, x0, h, shade); c.drawRect(x0 + bw, 0, w, h, shade); c.drawRect(x0, 0, x0 + bw, h, gold); }
            if (fx >= 0 && SystemClock.elapsedRealtime() - ft < 1200) { float s = dp(36); c.drawRect(fx - s, fy - s, fx + s, fy + s, gold); }
        }
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
                j.put("ois", has(c.get(CameraCharacteristics.LENS_INFO_AVAILABLE_OPTICAL_STABILIZATION), CameraMetadata.LENS_OPTICAL_STABILIZATION_MODE_ON));
                cams.put(j);
            }
            o.put("cameras", cams);
        } catch (Exception e) { try { o.put("error", String.valueOf(e.getMessage())); } catch (Exception ignored) {} }
        return o.toString();
    }
}
