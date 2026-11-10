package com.moodcam.web;

import android.graphics.SurfaceTexture;
import android.opengl.GLES11Ext;
import android.opengl.GLES30;
import android.opengl.GLSurfaceView;
import android.os.Handler;
import android.os.Looper;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.nio.FloatBuffer;

import javax.microedition.khronos.egl.EGLConfig;
import javax.microedition.khronos.opengles.GL10;

/** GPU preview: camera frame → optional 3D LUT (view assist) → zebra / false colour / focus peaking overlays. Recording is untouched. */
public class LutPreview implements GLSurfaceView.Renderer, SurfaceTexture.OnFrameAvailableListener {
    public interface Ready { void onReady(SurfaceTexture st); }
    public interface ScopeSink { void onScope(byte[] rgba, int w, int h); }
    public volatile ScopeSink scopeSink; static final int SW = 128, SH = 72; int fbo, fboTex, vw = 1, vh = 1, frameNo = 0; ByteBuffer scopeBuf;
    final GLSurfaceView view; final Ready ready; final Handler ui = new Handler(Looper.getMainLooper());
    SurfaceTexture st; int oes, lut, prog; int aPos, aUv, uSt, uRot, uCam, uLut, uLutOn, uZebra, uPeak, uFalse, uTexel, uN;
    final float[] stm = new float[16]; FloatBuffer quad;
    volatile float[] pending; volatile int pendingN = 33; int lutN = 33;
    public volatile boolean lutOn = false, zebra = false, peaking = false, falseColor = false;
    public volatile int rotationDeg = 90; public volatile int bufW = 1920, bufH = 1080;

    public LutPreview(GLSurfaceView v, Ready r) { view = v; ready = r; }
    public void setLut(float[] data, int n) { pendingN = n; pending = data; view.requestRender(); }

    static final String VS = "#version 300 es\nin vec2 aPos; in vec2 aUv; uniform mat4 uSt; uniform mat2 uRot; out vec2 vUv;\n"
            + "void main(){ gl_Position = vec4(uRot * aPos, 0.0, 1.0); vUv = (uSt * vec4(aUv, 0.0, 1.0)).xy; }";
    static final String FS = "#version 300 es\n#extension GL_OES_EGL_image_external_essl3 : require\nprecision mediump float;\n"
            + "uniform samplerExternalOES uCam; uniform mediump sampler3D uLut; uniform float uLutOn, uZebra, uPeak, uFalse, uN; uniform vec2 uTexel;\n"
            + "in vec2 vUv; out vec4 o;\n"
            + "vec3 lut(vec3 c){ float s = (uN - 1.0) / uN, b = 0.5 / uN; return texture(uLut, clamp(c, 0.0, 1.0) * s + b).rgb; }\n"
            + "void main(){\n"
            + "  vec3 c = texture(uCam, vUv).rgb; vec3 d = uLutOn > 0.5 ? lut(c) : c;\n"
            + "  float y = dot(d, vec3(0.2126, 0.7152, 0.0722));\n"
            + "  if (uFalse > 0.5) {\n"
            + "    vec3 g = vec3(y * 0.8);\n"
            + "    if (y < 0.03) g = vec3(0.45, 0.1, 0.6); else if (y < 0.12) g = vec3(0.1, 0.35, 0.95); else if (y > 0.38 && y < 0.46) g = vec3(0.2, 0.85, 0.3);\n"
            + "    else if (y > 0.55 && y < 0.62) g = vec3(1.0, 0.55, 0.7); else if (y > 0.97) g = vec3(1.0, 0.1, 0.1); else if (y > 0.9) g = vec3(1.0, 0.9, 0.1);\n"
            + "    d = g;\n"
            + "  }\n"
            + "  if (uZebra > 0.5 && y > 0.95 && mod(gl_FragCoord.x + gl_FragCoord.y, 14.0) < 7.0) d = vec3(0.0);\n"
            + "  if (uPeak > 0.5) {\n"
            + "    vec3 w = vec3(0.299, 0.587, 0.114);\n"
            + "    float gx = dot(texture(uCam, vUv + vec2(uTexel.x, 0.0)).rgb - texture(uCam, vUv - vec2(uTexel.x, 0.0)).rgb, w);\n"
            + "    float gy = dot(texture(uCam, vUv + vec2(0.0, uTexel.y)).rgb - texture(uCam, vUv - vec2(0.0, uTexel.y)).rgb, w);\n"
            + "    if (abs(gx) + abs(gy) > 0.2) d = vec3(1.0, 0.2, 0.15);\n"
            + "  }\n"
            + "  o = vec4(d, 1.0);\n"
            + "}";

    static int shader(int type, String src) {
        int s = GLES30.glCreateShader(type); GLES30.glShaderSource(s, src); GLES30.glCompileShader(s);
        int[] ok = new int[1]; GLES30.glGetShaderiv(s, GLES30.GL_COMPILE_STATUS, ok, 0);
        if (ok[0] == 0) throw new RuntimeException("shader: " + GLES30.glGetShaderInfoLog(s));
        return s;
    }

    @Override public void onSurfaceCreated(GL10 gl, EGLConfig cfg) {
        prog = GLES30.glCreateProgram();
        GLES30.glAttachShader(prog, shader(GLES30.GL_VERTEX_SHADER, VS)); GLES30.glAttachShader(prog, shader(GLES30.GL_FRAGMENT_SHADER, FS));
        GLES30.glLinkProgram(prog);
        aPos = GLES30.glGetAttribLocation(prog, "aPos"); aUv = GLES30.glGetAttribLocation(prog, "aUv");
        uSt = GLES30.glGetUniformLocation(prog, "uSt"); uRot = GLES30.glGetUniformLocation(prog, "uRot"); uCam = GLES30.glGetUniformLocation(prog, "uCam"); uLut = GLES30.glGetUniformLocation(prog, "uLut");
        uLutOn = GLES30.glGetUniformLocation(prog, "uLutOn"); uZebra = GLES30.glGetUniformLocation(prog, "uZebra"); uPeak = GLES30.glGetUniformLocation(prog, "uPeak");
        uFalse = GLES30.glGetUniformLocation(prog, "uFalse"); uTexel = GLES30.glGetUniformLocation(prog, "uTexel"); uN = GLES30.glGetUniformLocation(prog, "uN");
        float[] q = {-1, -1, 0, 0, 1, -1, 1, 0, -1, 1, 0, 1, 1, 1, 1, 1};
        quad = ByteBuffer.allocateDirect(q.length * 4).order(ByteOrder.nativeOrder()).asFloatBuffer(); quad.put(q).position(0);
        int[] t = new int[2]; GLES30.glGenTextures(2, t, 0); oes = t[0]; lut = t[1];
        GLES30.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, oes);
        GLES30.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES30.GL_TEXTURE_MIN_FILTER, GLES30.GL_LINEAR);
        GLES30.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES30.GL_TEXTURE_MAG_FILTER, GLES30.GL_LINEAR);
        GLES30.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES30.GL_TEXTURE_WRAP_S, GLES30.GL_CLAMP_TO_EDGE);
        GLES30.glTexParameteri(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, GLES30.GL_TEXTURE_WRAP_T, GLES30.GL_CLAMP_TO_EDGE);
        GLES30.glBindTexture(GLES30.GL_TEXTURE_3D, lut);
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_3D, GLES30.GL_TEXTURE_MIN_FILTER, GLES30.GL_LINEAR);
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_3D, GLES30.GL_TEXTURE_MAG_FILTER, GLES30.GL_LINEAR);
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_3D, GLES30.GL_TEXTURE_WRAP_S, GLES30.GL_CLAMP_TO_EDGE);
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_3D, GLES30.GL_TEXTURE_WRAP_T, GLES30.GL_CLAMP_TO_EDGE);
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_3D, GLES30.GL_TEXTURE_WRAP_R, GLES30.GL_CLAMP_TO_EDGE);
        if (pending == null) pending = Luts.build(0, "natural");
        int[] f = new int[1]; GLES30.glGenFramebuffers(1, f, 0); fbo = f[0]; int[] ft = new int[1]; GLES30.glGenTextures(1, ft, 0); fboTex = ft[0];
        GLES30.glBindTexture(GLES30.GL_TEXTURE_2D, fboTex);
        GLES30.glTexImage2D(GLES30.GL_TEXTURE_2D, 0, GLES30.GL_RGBA, SW, SH, 0, GLES30.GL_RGBA, GLES30.GL_UNSIGNED_BYTE, null);
        GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MIN_FILTER, GLES30.GL_LINEAR); GLES30.glTexParameteri(GLES30.GL_TEXTURE_2D, GLES30.GL_TEXTURE_MAG_FILTER, GLES30.GL_LINEAR);
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, fbo); GLES30.glFramebufferTexture2D(GLES30.GL_FRAMEBUFFER, GLES30.GL_COLOR_ATTACHMENT0, GLES30.GL_TEXTURE_2D, fboTex, 0);
        GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, 0);
        scopeBuf = ByteBuffer.allocateDirect(SW * SH * 4).order(ByteOrder.nativeOrder());
        st = new SurfaceTexture(oes); st.setOnFrameAvailableListener(this);
        final SurfaceTexture s = st; ui.post(() -> ready.onReady(s));
    }
    @Override public void onSurfaceChanged(GL10 gl, int w, int h) { vw = w; vh = h; GLES30.glViewport(0, 0, w, h); }
    @Override public void onDrawFrame(GL10 gl) {
        if (st == null) return;
        try { st.updateTexImage(); } catch (Exception e) { return; }
        st.getTransformMatrix(stm);
        float[] p = pending;
        if (p != null) {
            pending = null; lutN = pendingN; byte[] b = new byte[p.length]; for (int i = 0; i < p.length; i++) b[i] = (byte) Math.round(p[i] * 255f);
            ByteBuffer bb = ByteBuffer.allocateDirect(b.length); bb.put(b).position(0);
            GLES30.glBindTexture(GLES30.GL_TEXTURE_3D, lut); GLES30.glPixelStorei(GLES30.GL_UNPACK_ALIGNMENT, 1);
            GLES30.glTexImage3D(GLES30.GL_TEXTURE_3D, 0, GLES30.GL_RGB8, lutN, lutN, lutN, 0, GLES30.GL_RGB, GLES30.GL_UNSIGNED_BYTE, bb);
        }
        GLES30.glClearColor(0, 0, 0, 1); GLES30.glClear(GLES30.GL_COLOR_BUFFER_BIT);
        draw(true);
        ScopeSink sink = scopeSink;
        if (sink != null && (++frameNo % 3) == 0) {
            GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, fbo); GLES30.glViewport(0, 0, SW, SH);
            draw(false);
            scopeBuf.position(0); GLES30.glReadPixels(0, 0, SW, SH, GLES30.GL_RGBA, GLES30.GL_UNSIGNED_BYTE, scopeBuf);
            GLES30.glBindFramebuffer(GLES30.GL_FRAMEBUFFER, 0); GLES30.glViewport(0, 0, vw, vh);
            final byte[] out = new byte[SW * SH * 4]; scopeBuf.position(0); scopeBuf.get(out);
            ui.post(() -> sink.onScope(out, SW, SH));
        }
    }
    void draw(boolean overlays) {
        GLES30.glUseProgram(prog);
        GLES30.glActiveTexture(GLES30.GL_TEXTURE0); GLES30.glBindTexture(GLES11Ext.GL_TEXTURE_EXTERNAL_OES, oes); GLES30.glUniform1i(uCam, 0);
        GLES30.glActiveTexture(GLES30.GL_TEXTURE1); GLES30.glBindTexture(GLES30.GL_TEXTURE_3D, lut); GLES30.glUniform1i(uLut, 1);
        GLES30.glUniformMatrix4fv(uSt, 1, false, stm, 0);
        double a = Math.toRadians(rotationDeg); float c = (float) Math.cos(a), s = (float) Math.sin(a);
        GLES30.glUniformMatrix2fv(uRot, 1, false, new float[]{c, s, -s, c}, 0);
        GLES30.glUniform1f(uLutOn, lutOn ? 1f : 0f); GLES30.glUniform1f(uZebra, overlays && zebra ? 1f : 0f); GLES30.glUniform1f(uPeak, overlays && peaking ? 1f : 0f); GLES30.glUniform1f(uFalse, overlays && falseColor ? 1f : 0f);
        GLES30.glUniform1f(uN, lutN); GLES30.glUniform2f(uTexel, 1.5f / bufW, 1.5f / bufH);
        quad.position(0); GLES30.glVertexAttribPointer(aPos, 2, GLES30.GL_FLOAT, false, 16, quad); GLES30.glEnableVertexAttribArray(aPos);
        quad.position(2); GLES30.glVertexAttribPointer(aUv, 2, GLES30.GL_FLOAT, false, 16, quad); GLES30.glEnableVertexAttribArray(aUv);
        GLES30.glDrawArrays(GLES30.GL_TRIANGLE_STRIP, 0, 4);
    }
    @Override public void onFrameAvailable(SurfaceTexture s) { view.requestRender(); }
}
