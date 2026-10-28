package com.moodcam.web;

import android.Manifest;
import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.View;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import android.app.ActivityManager;
import android.os.Build;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.ArrayList;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStream;

/**
 * MoodCam test app: a full-screen WebView around the MoodCam web app, so every update
 * published at the same link reaches the app without reinstalling. Adds what a plain
 * browser can't: camera permission bridging, file picking, saving to the gallery and
 * native sharing (Instagram, TikTok, ...).
 */
public class MainActivity extends Activity {
    private static final String APP_URL = "https://mengnattawitmarin.github.io/moodcam/";
    private static final String APP_HOST = "mengnattawitmarin.github.io";
    private static final int REQ_CAMERA = 1;
    private static final int REQ_FILE = 2;
    private static final int REQ_LOCATION = 3;
    private GeolocationPermissions.Callback pendingGeo;
    private String pendingGeoOrigin;

    private WebView web;
    private PermissionRequest pendingPermission;
    private ValueCallback<Uri[]> pendingFiles;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#0B0C0A"));
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(true);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setUserAgentString(s.getUserAgentString() + " MoonCamApp/4");
        s.setGeolocationEnabled(true);

        web.addJavascriptInterface(new Bridge(), "MoodCamAndroid");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                if (APP_HOST.equals(u.getHost()) || "fonts.googleapis.com".equals(u.getHost())) return false;
                try { startActivity(new Intent(Intent.ACTION_VIEW, u)); } catch (Exception ignored) { }
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    boolean wantsCamera = false;
                    for (String r : request.getResources()) if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(r)) wantsCamera = true;
                    if (!wantsCamera) { request.deny(); return; }
                    if (checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED) {
                        request.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
                    } else {
                        pendingPermission = request;
                        requestPermissions(new String[]{Manifest.permission.CAMERA}, REQ_CAMERA);
                    }
                });
            }

            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                if (checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED) {
                    callback.invoke(origin, true, false);
                } else {
                    pendingGeo = callback; pendingGeoOrigin = origin;
                    requestPermissions(new String[]{Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION}, REQ_LOCATION);
                }
            }

            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (pendingFiles != null) pendingFiles.onReceiveValue(null);
                pendingFiles = callback;
                Intent pick = new Intent(Intent.ACTION_GET_CONTENT);
                pick.addCategory(Intent.CATEGORY_OPENABLE);
                pick.setType("image/*");
                if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) pick.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                try {
                    startActivityForResult(Intent.createChooser(pick, "เลือกรูป"), REQ_FILE);
                } catch (Exception e) {
                    pendingFiles = null;
                    return false;
                }
                return true;
            }
        });

        if (savedInstanceState != null) web.restoreState(savedInstanceState);
        else web.loadUrl(APP_URL);
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        if (requestCode == REQ_LOCATION && pendingGeo != null) {
            boolean ok = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
            pendingGeo.invoke(pendingGeoOrigin, ok, false);
            pendingGeo = null;
            return;
        }
        if (requestCode == REQ_CAMERA && pendingPermission != null) {
            if (results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED) {
                pendingPermission.grant(new String[]{PermissionRequest.RESOURCE_VIDEO_CAPTURE});
            } else {
                pendingPermission.deny();
                Toast.makeText(this, "ต้องอนุญาตกล้องเพื่อถ่ายรูป", Toast.LENGTH_LONG).show();
            }
            pendingPermission = null;
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_FILE && pendingFiles != null) {
            Uri[] result = null;
            if (resultCode == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    int n = data.getClipData().getItemCount();
                    result = new Uri[n];
                    for (int i = 0; i < n; i++) result[i] = data.getClipData().getItemAt(i).getUri();
                } else if (data.getData() != null) result = new Uri[]{data.getData()};
            }
            pendingFiles.onReceiveValue(result);
            pendingFiles = null;
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        web.saveState(outState);
    }

    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onPause() {
        super.onPause();
        web.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        web.onResume();
    }

    /** Called from the page's JavaScript as window.MoodCamAndroid.*. */
    private class Bridge {
        @JavascriptInterface
        public boolean isApp() { return true; }

        /** Saves a base64 JPEG into Pictures/MoodCam. */
        @JavascriptInterface
        public boolean saveImage(String base64, String filename) {
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                ContentValues v = new ContentValues();
                v.put(MediaStore.MediaColumns.DISPLAY_NAME, filename);
                v.put(MediaStore.MediaColumns.MIME_TYPE, "image/jpeg");
                v.put(MediaStore.MediaColumns.RELATIVE_PATH, "Pictures/MoonCam");
                v.put(MediaStore.MediaColumns.IS_PENDING, 1);
                Uri uri = getContentResolver().insert(MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), v);
                if (uri == null) return false;
                try (OutputStream out = getContentResolver().openOutputStream(uri)) {
                    if (out == null) return false;
                    out.write(bytes);
                }
                v.clear();
                v.put(MediaStore.MediaColumns.IS_PENDING, 0);
                getContentResolver().update(uri, v, null, null);
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        /** Exact manufacturer / model / memory for Device Sync. */
        @JavascriptInterface
        public String getDeviceInfo() {
            try {
                ActivityManager.MemoryInfo mi = new ActivityManager.MemoryInfo();
                ((ActivityManager) getSystemService(ACTIVITY_SERVICE)).getMemoryInfo(mi);
                return new JSONObject().put("manufacturer", Build.MANUFACTURER).put("model", Build.MODEL).put("brand", Build.BRAND)
                    .put("release", Build.VERSION.RELEASE).put("sdk", Build.VERSION.SDK_INT).put("memoryMB", mi.totalMem / 1048576L).toString();
            } catch (Exception e) { return "{}"; }
        }

        /** Shares one or many images, optionally straight to one app (package name). */
        @JavascriptInterface
        public boolean shareImages(String json, String pkg) {
            try {
                JSONArray arr = new JSONArray(json);
                File dir = new File(getCacheDir(), "shared");
                if (!dir.exists()) dir.mkdirs();
                File[] old = dir.listFiles();
                if (old != null) for (File f : old) f.delete();
                final ArrayList<Uri> uris = new ArrayList<>();
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject o = arr.getJSONObject(i);
                    File file = new File(dir, o.optString("name", "MoonCam_" + i + ".jpg"));
                    try (FileOutputStream out = new FileOutputStream(file)) { out.write(Base64.decode(o.getString("b64"), Base64.DEFAULT)); }
                    uris.add(FileProvider.getUriForFile(MainActivity.this, "com.moodcam.web.fileprovider", file));
                }
                if (uris.isEmpty()) return false;
                if (pkg != null && !pkg.isEmpty()) {
                    try { getPackageManager().getPackageInfo(pkg, 0); } catch (Exception e) { return false; }
                }
                runOnUiThread(() -> {
                    Intent send;
                    if (uris.size() == 1) { send = new Intent(Intent.ACTION_SEND); send.putExtra(Intent.EXTRA_STREAM, uris.get(0)); }
                    else { send = new Intent(Intent.ACTION_SEND_MULTIPLE); send.putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris); }
                    send.setType("image/jpeg");
                    send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    if (pkg != null && !pkg.isEmpty()) { send.setPackage(pkg); try { startActivity(send); return; } catch (Exception e) { send.setPackage(null); } }
                    startActivity(Intent.createChooser(send, "แชร์ภาพจาก MoonCam"));
                });
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        /** Opens the Android share sheet (Instagram, TikTok, LINE, ...) with a base64 JPEG. */
        @JavascriptInterface
        public boolean shareImage(String base64, String filename) {
            try {
                byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                File dir = new File(getCacheDir(), "shared");
                if (!dir.exists()) dir.mkdirs();
                File[] old = dir.listFiles();
                if (old != null) for (File f : old) f.delete();
                File file = new File(dir, filename);
                try (FileOutputStream out = new FileOutputStream(file)) { out.write(bytes); }
                final Uri uri = FileProvider.getUriForFile(MainActivity.this, "com.moodcam.web.fileprovider", file);
                runOnUiThread(() -> {
                    Intent send = new Intent(Intent.ACTION_SEND);
                    send.setType("image/jpeg");
                    send.putExtra(Intent.EXTRA_STREAM, uri);
                    send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivity(Intent.createChooser(send, "แชร์ภาพจาก MoonCam"));
                });
                return true;
            } catch (Exception e) {
                return false;
            }
        }
    }
}
