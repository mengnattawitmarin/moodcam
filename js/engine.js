// MoonCam colour engine — identical maths for live preview, edits and full-resolution export.
export const ZERO_HSL = () => [0,1,2,3,4,5].map(() => ({hue:0, sat:0, lum:0}));
export const defAdj = () => ({exposure:0,contrast:0,curve:0,density:0,keepBright:0,highlights:0,shadows:0,blacks:0,temp:0,tint:0,vibrance:0,saturation:0,hsl:ZERO_HSL(),
  grain:0,grainSize:30,vignette:0,fade:0,lightLeak:0,halation:0,bloom:0,
  shadowTintHue:200,shadowTintAmt:0,midTintHue:40,midTintAmt:0,highlightTintHue:35,highlightTintAmt:0,mono:false});
export const A = o => Object.assign(defAdj(), o);
export const hsl6 = arr => arr.map(b => Object.assign({hue:0,sat:0,lum:0}, b));
export const H = (o) => hsl6([o.red||{},o.orange||{},o.yellow||{},o.green||{},o.blue||{},o.purple||{}]);
export const L = (id,name,cat,desc,adj) => ({id,name,cat,desc,adj:A(id==="original"?adj:Object.assign({curve:45,density:30,keepBright:90},adj))});
export const clone = o => JSON.parse(JSON.stringify(o));
export const isIdentity = a => JSON.stringify(a) === JSON.stringify(defAdj());
// Look strength: scale every amount (not hues / grain size) by s; 1 = as designed.
export const NO_SCALE = new Set(["grainSize","keepBright","shadowTintHue","midTintHue","highlightTintHue","mono","hsl"]);
export function effective(a,s){
  if(s===1) return a;
  const o=clone(a);
  for(const k in o){ if(!NO_SCALE.has(k)&&typeof o[k]==="number") o[k]*=s; }
  o.hsl=o.hsl.map(b=>({hue:b.hue*s,sat:b.sat*s,lum:b.lum*s}));
  if(s<0.35) o.mono=false;
  return o;
}

const CENTERS=[0,30,60,120,220,290], SPANS=[30,30,40,60,60,50];
export function hsvToRgb(h,s,v,out){const c=v*s,hp=h/60,x=c*(1-Math.abs(hp%2-1)),m=v-c;let r,g,b;
  switch(hp|0){case 0:r=c;g=x;b=0;break;case 1:r=x;g=c;b=0;break;case 2:r=0;g=c;b=x;break;case 3:r=0;g=x;b=c;break;case 4:r=x;g=0;b=c;break;default:r=c;g=0;b=x;}
  out[0]=r+m;out[1]=g+m;out[2]=b+m;}
export function tintOffset(hue,amt,k0=0.26){ if(amt<=0) return [0,0,0]; const o=[0,0,0]; hsvToRgb(((hue%360)+360)%360,1,1,o);
  const avg=(o[0]+o[1]+o[2])/3,k=amt/100*k0; return [(o[0]-avg)*k,(o[1]-avg)*k,(o[2]-avg)*k]; }
export const smooth=(e0,e1,x)=>{let t=(x-e0)/(e1-e0);t=t<0?0:t>1?1:t;return t*t*(3-2*t)};
export function hash(x,y){let h=(Math.imul(x,374761393)+Math.imul(y,668265263)+1337)|0;h=Math.imul(h^(h>>>13),1274126177);h^=h>>>16;return (h&0xFFFF)/32767.5-1;}

export function applyAdjust(d,w,h,a){
  if(isIdentity(a)) return;
  const expMul=Math.pow(2,a.exposure/100*1.5),t=a.temp/100,ti=a.tint/100;
  const rM=expMul*(1+.18*t)*(1+.06*ti), gM=expMul*(1-.14*ti), bM=expMul*(1-.18*t)*(1+.06*ti);
  const sh=a.shadows/100,hi=a.highlights/100,shOn=sh!==0||hi!==0;
  // Filmic S-curve: punchy mids, soft roll-off at both ends (instead of linear clipping)
  const ck=(a.contrast>=0?a.contrast/100*1.3:a.contrast/100*.55)+a.curve/100*.9, cOn=ck!==0, dn=a.density/100*.5;
  const bl=a.blacks/100, crush=bl<0?-bl*.14:0, lift=bl>0?bl*.12:0;
  const satM=1+a.saturation/100, vib=a.vibrance/100*.9, satOn=a.saturation!==0||a.vibrance!==0;
  const bh=a.hsl.map(b=>b.hue),bs=a.hsl.map(b=>b.sat),bl2=a.hsl.map(b=>b.lum),hslOn=a.hsl.some(b=>b.hue||b.sat||b.lum);
  const sT=tintOffset(a.shadowTintHue,a.shadowTintAmt),mT=tintOffset(a.midTintHue,a.midTintAmt,.2),hT=tintOffset(a.highlightTintHue,a.highlightTintAmt);
  const splitOn=a.shadowTintAmt>0||a.highlightTintAmt>0||a.midTintAmt>0;
  const fade=a.fade/100,fM=1-fade*.22,fA=fade*.10,vig=a.vignette/100,leak=a.lightLeak/100;
  const tmp=[0,0,0];
  const curve=v=>{const x=v-.5; return ck>0 ? .5+x*(1+ck)/(1+ck*Math.min(1,Math.abs(2*x))*.85) : .5+x*(1+ck);};
  for(let y=0;y<h;y++){
    const ny=(y+.5)/h-.5, ly=(y+.5)/h;
    for(let x=0;x<w;x++){
      const i=(y*w+x)*4;
      let r=d[i]/255*rM,g=d[i+1]/255*gM,b=d[i+2]/255*bM;
      if(shOn){let l=.2126*r+.7152*g+.0722*b;l=l<0?0:l>1?1:l;const inv=1-l,dd=sh*.38*inv*inv*inv+hi*.38*l*l*l;r+=dd;g+=dd;b+=dd;}
      if(cOn){r=curve(r);g=curve(g);b=curve(b);}
      if(crush){r=(r-crush)/(1-crush);g=(g-crush)/(1-crush);b=(b-crush)/(1-crush);if(r<0)r=0;if(g<0)g=0;if(b<0)b=0;}
      if(lift){r=r*(1-lift)+lift;g=g*(1-lift)+lift;b=b*(1-lift)+lift;}
      if(satOn){const l=.2126*r+.7152*g+.0722*b,mx=Math.max(r,g,b),mn=Math.min(r,g,b);let s=mx-mn;s=s<0?0:s>1?1:s;
        const f=Math.max(0,satM*(1+vib*(1-s)));r=l+(r-l)*f;g=l+(g-l)*f;b=l+(b-l)*f;}
      if(hslOn){const cr=Math.min(1,Math.max(0,r)),cg=Math.min(1,Math.max(0,g)),cb=Math.min(1,Math.max(0,b));
        const mx=Math.max(cr,cg,cb),mn=Math.min(cr,cg,cb),dd=mx-mn;
        if(dd>1e-4){let hue=mx===cr?60*(((cg-cb)/dd)%6):mx===cg?60*((cb-cr)/dd+2):60*((cr-cg)/dd+4);if(hue<0)hue+=360;
          const s=dd/mx;let dh=0,ds=0,dl=0;
          for(let k=0;k<6;k++){let dist=Math.abs(hue-CENTERS[k]);if(dist>180)dist=360-dist;const wg=1-dist/SPANS[k];if(wg>0){dh+=wg*bh[k];ds+=wg*bs[k];dl+=wg*bl2[k];}}
          if(dh||ds||dl){let nh=(hue+dh*.3)%360;if(nh<0)nh+=360;const ns=Math.min(1,Math.max(0,s*(1+ds/100)));hsvToRgb(nh,ns,mx*(1+dl/100*.35*s),tmp);r=tmp[0];g=tmp[1];b=tmp[2];}}}
      if(splitOn){let l=.2126*r+.7152*g+.0722*b;l=l<0?0:l>1?1:l;
        // skin protection: warm, moderately saturated pixels (r>g>b) keep ~55% less grading
        const sk=(r>g&&g>b&&l>.12)?Math.min(1,(r-b)*2.6)*Math.min(1,(g-b)/(r-b+1e-4)*1.6)*.55:0,k=1-sk;
        const ws=(1-l)*(1-l)*1.15*k,wh=l*l*k,wm=4*l*(1-l)*k;
        r+=sT[0]*ws+mT[0]*wm+hT[0]*wh;g+=sT[1]*ws+mT[1]*wm+hT[1]*wh;b+=sT[2]*ws+mT[2]*wm+hT[2]*wh;}
      if(dn>0){ // film density: deeper mids, richer colour, highlights kept
        r=r>0?Math.pow(r,1+dn*(1-r*.5)):r; g=g>0?Math.pow(g,1+dn*(1-g*.5)):g; b=b>0?Math.pow(b,1+dn*(1-b*.5)):b; }
      if(a.mono){const l=.2126*r+.7152*g+.0722*b;r=g=b=l;}
      if(fade>0){r=r*fM+fA;g=g*fM+fA;b=b*fM+fA;}
      if(vig>0){const nx=(x+.5)/w-.5,dd=Math.sqrt(nx*nx+ny*ny)*1.4142,m=1-vig*.75*smooth(.4,1.05,dd);r*=m;g*=m;b*=m;}
      if(leak>0){const dx=1-(x+.5)/w,dist=Math.sqrt(dx*dx+ly*ly);let lt=Math.max(0,1-dist/.9);lt=lt*lt*leak;
        r=1-(1-Math.min(1,Math.max(0,r)))*(1-lt);g=1-(1-Math.min(1,Math.max(0,g)))*(1-lt*.55);b=1-(1-Math.min(1,Math.max(0,b)))*(1-lt*.2);}
      d[i]=r*255+.5;d[i+1]=g*255+.5;d[i+2]=b*255+.5;
    }
  }
}
// Halation (film's red glow around bright light) and bloom (soft white glow)
export function applyGlow(d,w,h,a){
  const hal=a.halation/100,blo=a.bloom/100; if(hal<=0&&blo<=0) return;
  const f=4,sw=Math.max(2,Math.ceil(w/f)),sh=Math.max(2,Math.ceil(h/f)),m=new Float32Array(sw*sh);
  for(let y=0;y<sh;y++)for(let x=0;x<sw;x++){const i=(Math.min(h-1,y*f)*w+Math.min(w-1,x*f))*4;
    const l=(.2126*d[i]+.7152*d[i+1]+.0722*d[i+2])/255;const v=Math.max(0,(l-.6)/.4);m[y*sw+x]=v*v;}
  const g=boxBlur(m,sw,sh,1,Math.max(1,Math.round(Math.min(sw,sh)*.035)),3);
  const kr=hal*1.1+blo*.7,kg=hal*.28+blo*.62,kb=hal*.12+blo*.5;
  for(let y=0;y<h;y++){const fy=Math.min(sh-1.001,y/f),y0=fy|0,ty=fy-y0;
    for(let x=0;x<w;x++){const fx=Math.min(sw-1.001,x/f),x0=fx|0,tx=fx-x0,o=y0*sw+x0;
      const v=(g[o]*(1-tx)+g[o+1]*tx)*(1-ty)+(g[o+sw]*(1-tx)+g[o+sw+1]*tx)*ty; if(v<.002) continue;
      const i=(y*w+x)*4;
      d[i]=255-(255-d[i])*(1-Math.min(1,v*kr)); d[i+1]=255-(255-d[i+1])*(1-Math.min(1,v*kg)); d[i+2]=255-(255-d[i+2])*(1-Math.min(1,v*kb));}}
}
export function applyGrain(d,w,h,a){
  const amt=a.grain/100*.16; if(amt<=0) return;
  const px=Math.max(1,Math.min(w,h)/900*(.6+a.grainSize/40));
  for(let y=0;y<h;y++){const gy=Math.floor(y/px);for(let x=0;x<w;x++){const i=(y*w+x)*4;
    const l=(.2126*d[i]+.7152*d[i+1]+.0722*d[i+2])/255,n=hash(Math.floor(x/px),gy)*amt*(1-Math.abs(l-.5)*1.2)*255;
    d[i]+=n;d[i+1]+=n;d[i+2]+=n;}}
}
export function meanLum(d){let s=0,n=0;for(let i=0;i<d.length;i+=64){s+=.2126*d[i]+.7152*d[i+1]+.0722*d[i+2];n++;}return n?s/n/255:0;}
// Brightness balance: grading may darken the picture; lift mid-tones back (gamma) toward
// keepBright% of the original mean. Blacks stay black and whites stay white, so the depth remains.
export function balance(d,before,a){
  if(!(a.keepBright>0)) return; const after=meanLum(d),target=Math.min(.6,before*a.keepBright/100);
  if(after<=0.01||after>=target) return;
  const g=Math.max(.55,Math.log(target)/Math.log(after)); if(g>.995) return;
  const lut=new Uint8ClampedArray(256); for(let v=0;v<256;v++) lut[v]=Math.pow(v/255,g)*255+.5;
  for(let i=0;i<d.length;i+=4){d[i]=lut[d[i]];d[i+1]=lut[d[i+1]];d[i+2]=lut[d[i+2]];}
}
export function applyGrade(d,w,h,a){ const m0=meanLum(d); applyAdjust(d,w,h,a); balance(d,m0,a); applyGlow(d,w,h,a); applyGrain(d,w,h,a); }

export function boxBlur(src,w,h,ch,r,passes){ // src: Float32Array with ch channels
  let a=Float32Array.from(src),b=new Float32Array(src.length);r=Math.max(1,Math.min(r,(Math.min(w,h)>>1)-1));const div=2*r+1;
  for(let p=0;p<passes;p++){
    for(let y=0;y<h;y++)for(let c=0;c<ch;c++){let s=0;const o=y*w;for(let k=-r;k<=r;k++)s+=a[(o+Math.min(w-1,Math.max(0,k)))*ch+c];
      for(let x=0;x<w;x++){b[(o+x)*ch+c]=s/div;s+=a[(o+Math.min(w-1,x+r+1))*ch+c]-a[(o+Math.max(0,x-r))*ch+c];}}
    for(let x=0;x<w;x++)for(let c=0;c<ch;c++){let s=0;for(let k=-r;k<=r;k++)s+=b[(Math.min(h-1,Math.max(0,k))*w+x)*ch+c];
      for(let y=0;y<h;y++){a[(y*w+x)*ch+c]=s/div;s+=b[(Math.min(h-1,y+r+1)*w+x)*ch+c]-b[(Math.max(0,y-r)*w+x)*ch+c];}}
  }
  return a;
}

// ---------------------------------------------------------------- Copy Look (colour transfer)
// Opponent colour space: L = luma, a = red-green, b = yellow-blue. Matching the reference's
// mean / spread per channel (Reinhard-style) reproduces its overall grade on any photo.
export function colorStats(d){
  let n=0; const s=[0,0,0], q=[0,0,0];
  for(let i=0;i<d.length;i+=16){
    const r=d[i]/255,g=d[i+1]/255,b=d[i+2]/255;
    const L=.299*r+.587*g+.114*b, A=r-g, B=(r+g)/2-b;
    s[0]+=L;s[1]+=A;s[2]+=B;q[0]+=L*L;q[1]+=A*A;q[2]+=B*B;n++;
  }
  const m=s.map(v=>v/n), sd=q.map((v,i)=>Math.sqrt(Math.max(1e-6,v/n-m[i]*m[i])));
  return {m,s:sd};
}
export function applyTransfer(d,ref,amt=1){
  if(!ref||amt<=0) return;
  const src=colorStats(d), k=amt;
  const sc=[0,1,2].map(i=>Math.min(2.2,Math.max(.45,ref.s[i]/src.s[i])));
  for(let i=0;i<d.length;i+=4){
    const r=d[i]/255,g=d[i+1]/255,b=d[i+2]/255;
    let L=.299*r+.587*g+.114*b, A=r-g, B=(r+g)/2-b;
    const L2=(L-src.m[0])*sc[0]+ref.m[0], A2=(A-src.m[1])*sc[1]+ref.m[1], B2=(B-src.m[2])*sc[2]+ref.m[2];
    L+= (L2-L)*k; A+=(A2-A)*k; B+=(B2-B)*k;
    // back to RGB:  r-g=A, (r+g)/2-b=B, .299r+.587g+.114b=L
    // exact solve: let g=x; r=x+A; b=(r+g)/2-B = x+A/2-B; L=.299(x+A)+.587x+.114(x+A/2-B) = x + .356A - .114B
    const x=L-.356*A+.114*B;
    d[i]=(x+A)*255+.5; d[i+1]=x*255+.5; d[i+2]=(x+A/2-B)*255+.5;
  }
}

// ---------------------------------------------------------------- photo analysis for Look suggestions
export function analyze(d,w,h){
  let n=0,lum=0,skin=0,sky=0,green=0,warm=0,sat=0,dark=0,blue=0;
  for(let y=0;y<h;y+=4)for(let x=0;x<w;x+=4){
    const i=(y*w+x)*4,r=d[i],g=d[i+1],b=d[i+2],L=(.299*r+.587*g+.114*b)/255;
    const mx=Math.max(r,g,b),mn=Math.min(r,g,b),s=mx?(mx-mn)/mx:0;
    const cb=128-.168736*r-.331264*g+.5*b,cr=128+.5*r-.418688*g-.081312*b;
    n++;lum+=L;sat+=s;if(L<.22)dark++;
    if(cr>135&&cr<172&&cb>80&&cb<128&&L>.2) skin++;
    if(y<h*.45&&b>r&&b>g-10&&L>.45) sky++;
    if(g>r+8&&g>b+4) green++;
    if(b>r+15&&b>g) blue++;
    warm+=(r-b)/255;
  }
  return {lum:lum/n,sat:sat/n,skin:skin/n,sky:sky/n,green:green/n,blue:blue/n,warm:warm/n,dark:dark/n};
}
