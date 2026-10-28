import {L,A,H} from "./engine.js";

export const PRESETS = [
  // ---------------- TREND: mass-appeal social looks
  L("korean_clear","เกาหลีใส","trend","โทนเกาหลีใส ผิวสว่างนุ่ม ฟ้าขาวสะอาด",{exposure:10,contrast:-4,curve:28,density:8,highlights:-22,shadows:16,temp:-6,tint:4,saturation:-8,vibrance:10,fade:6,bloom:18,keepBright:100,hsl:H({orange:{lum:12,sat:-8},red:{sat:-6},blue:{sat:-10,lum:8}})}),
  L("japan_film","ฟิล์มญี่ปุ่น","trend","ฟิล์มญี่ปุ่นอมเขียวฟ้า สีจางละมุน",{temp:-4,tint:-7,fade:18,saturation:-10,contrast:12,shadowTintHue:170,shadowTintAmt:32,highlightTintHue:50,highlightTintAmt:18,grain:20,hsl:H({green:{hue:-15,sat:-10},blue:{hue:-10,lum:8}})}),
  L("cafe","คาเฟ่","trend","โทนคาเฟ่อุ่นละมุน ครีมน้ำตาล",{temp:16,tint:4,exposure:6,contrast:14,saturation:-6,fade:12,highlightTintHue:38,highlightTintAmt:30,shadowTintHue:25,shadowTintAmt:15,hsl:H({orange:{lum:8},yellow:{sat:-12}})}),
  L("y2k_flash","Y2K Flash","trend","แฟลชจัดแบบปี 2000 สีสด คอนทราสต์แรง",{exposure:8,contrast:30,saturation:20,temp:-8,tint:6,highlights:16,vignette:26,grain:12,bloom:16}),
  L("clear_sea","ทะเลฟ้าใส","trend","ทะเลฟ้าใสสดชื่น น้ำเขียวมรกต",{exposure:8,vibrance:30,saturation:10,temp:-6,contrast:18,highlights:-16,keepBright:100,hsl:H({blue:{hue:-10,sat:30,lum:6},green:{hue:12,sat:15},yellow:{sat:10}})}),
  L("bright_skin","ผิวสว่าง","trend","ผิวสว่างใส เนียนสุขภาพดี",{exposure:12,shadows:26,highlights:-20,curve:20,density:6,temp:4,tint:4,saturation:-4,bloom:12,keepBright:100,hsl:H({orange:{lum:18,sat:-10},red:{lum:8}})}),
  L("peach_soft","พีชละมุน","trend","โทนพีชชมพูนุ่ม หวานแบบสาวเกาหลี",{exposure:8,temp:8,tint:10,saturation:-6,fade:10,highlightTintHue:15,highlightTintAmt:28,shadowTintHue:330,shadowTintAmt:12,bloom:14,hsl:H({orange:{hue:-6,lum:10},red:{hue:6}})}),
  L("moody_brown","น้ำตาลมูดี้","trend","โทนน้ำตาลเข้ม มูดี้ เท่ ๆ",{temp:14,saturation:-22,contrast:26,blacks:-14,shadowTintHue:28,shadowTintAmt:30,highlightTintHue:40,highlightTintAmt:24,hsl:H({green:{hue:-30,sat:-40},blue:{sat:-40}})}),
  L("minimal_white","ขาวมินิมอล","trend","โทนขาวสะอาดมินิมอล",{exposure:14,saturation:-26,contrast:4,fade:10,temp:-4,highlights:-10,shadows:14,keepBright:100}),
  L("food_pop","อาหารน่ากิน","trend","อาหารสีสด น่ากิน อุ่นแน่น",{temp:10,vibrance:30,saturation:12,contrast:20,shadows:10,highlights:-10,hsl:H({red:{sat:15},orange:{sat:18,lum:4},yellow:{sat:10},green:{sat:12}})}),
  L("sunset_vibes","Sunset Vibes","trend","ฟ้าเย็นส้มชมพู โรแมนติก",{temp:26,tint:12,saturation:14,contrast:18,highlightTintHue:25,highlightTintAmt:45,shadowTintHue:280,shadowTintAmt:30,bloom:25}),
  L("city_night","City Night","trend","ไฟเมืองกลางคืนเรืองสวย ดำลึก",{exposure:4,contrast:30,blacks:-18,temp:-10,saturation:16,shadowTintHue:220,shadowTintAmt:40,highlightTintHue:35,highlightTintAmt:35,halation:35,bloom:30}),
  // ---------------- FILM: classic stocks, now with real filmic contrast + halation
  L("original","Original","film","ภาพต้นฉบับ ไม่ปรับสี",{}),
  L("warm_film","Warm Film","film","ฟิล์มอุ่นแดดบ่าย ผิวสวย ไฮไลต์ทองฟุ้ง",{temp:18,tint:6,vibrance:22,saturation:4,contrast:28,blacks:-12,highlights:-12,fade:8,grain:20,vignette:22,halation:22,highlightTintHue:38,highlightTintAmt:40,shadowTintHue:15,shadowTintAmt:18,hsl:H({orange:{sat:10,lum:6}})}),
  L("vintage","Vintage","film","ฟิล์มเก่าซีดหวาน ดำยกตัว เม็ดเกรนชัด",{temp:14,saturation:-22,contrast:12,fade:34,grain:38,vignette:34,highlightTintHue:48,highlightTintAmt:40,shadowTintHue:330,shadowTintAmt:26,halation:12}),
  L("night_film","Night Film","film","ฟิล์มกลางคืน เงาฟ้าเขียว ไฟถนนส้มเรือง",{exposure:-6,temp:-12,tint:6,contrast:38,blacks:-22,saturation:12,grain:26,vignette:30,halation:45,bloom:15,shadowTintHue:195,shadowTintAmt:55,highlightTintHue:30,highlightTintAmt:45}),
  L("teal_orange","Teal & Orange","film","สูตรหนังฮอลลีวูด เงาเขียวน้ำทะเลลึก ผิวส้มทอง",{curve:60,density:42,contrast:30,blacks:-20,highlights:-10,vibrance:22,saturation:10,shadowTintHue:188,shadowTintAmt:78,midTintHue:195,midTintAmt:12,highlightTintHue:30,highlightTintAmt:62,vignette:18,halation:12,hsl:H({orange:{sat:24,lum:-4},yellow:{hue:-25},green:{hue:45,sat:-35},blue:{hue:-15,sat:25,lum:-10}})}),
  L("bw_film","B&W Film","film","ขาวดำฟิล์ม คอนทราสต์แน่น เกรนสวย",{mono:true,contrast:42,blacks:-18,grain:34,vignette:26,fade:6,halation:10}),
  L("golden_hour","Golden Hour","film","แสงทองตอนเย็น อบอุ่น ฟุ้งละมุน",{temp:34,tint:6,exposure:4,vibrance:22,contrast:18,highlights:-18,lightLeak:30,bloom:25,highlightTintHue:40,highlightTintAmt:45,shadowTintHue:20,shadowTintAmt:15}),
  L("soft_portrait","Soft Portrait","film","ถ่ายคนผิวเนียนสว่าง โทนครีมนุ่ม",{exposure:8,contrast:6,shadows:18,temp:8,tint:4,saturation:-6,fade:14,bloom:18,highlightTintHue:25,highlightTintAmt:22,hsl:H({orange:{lum:10,sat:-6},red:{sat:-8}})}),
  // ---------------- CINEMATIC: graded like a feature film
  L("amber_drama","Amber Drama","cine","ดราม่าอำพัน ดำลึก ไฮไลต์ทองหนัก",{temp:24,contrast:46,blacks:-28,shadows:-8,highlights:-20,saturation:-6,vignette:42,halation:30,highlightTintHue:35,highlightTintAmt:60,shadowTintHue:25,shadowTintAmt:25,grain:16}),
  L("neon_after_dark","Neon After Dark","cine","เมืองกลางคืนนีออน ม่วงชมพู ไฟเรือง",{temp:-18,tint:7,contrast:40,blacks:-20,vibrance:32,saturation:10,bloom:35,halation:20,grain:16,shadowTintHue:262,shadowTintAmt:60,highlightTintHue:322,highlightTintAmt:40}),
  L("dream_pop","Dream Pop","cine","ฝันพาสเทล ฟุ้งนุ่ม แสงรั่วชมพู",{exposure:10,contrast:-4,fade:24,temp:6,tint:12,vibrance:14,lightLeak:34,bloom:35,highlightTintHue:330,highlightTintAmt:38,shadowTintHue:220,shadowTintAmt:18}),
  L("mono_noir","Mono Noir","cine","ฟิล์มนัวร์ ดำทะมึน แสงเงาแรง",{keepBright:72,mono:true,contrast:70,blacks:-35,highlights:10,grain:42,vignette:55,halation:15}),
  L("indie_film","Indie Film","cine","หนังอินดี้ เขียวหม่น ผิวอุ่น เงียบ ๆ",{temp:8,saturation:-16,fade:20,contrast:22,blacks:-6,grain:26,shadowTintHue:165,shadowTintAmt:40,highlightTintHue:45,highlightTintAmt:30,hsl:H({green:{hue:-15,sat:-20}})}),
  L("bleach_bypass","Bleach Bypass","cine","สีซีดโลหะ คอนทราสต์จัด แบบหนังสงคราม",{keepBright:72,saturation:-50,contrast:62,blacks:-25,highlights:-12,grain:20,vignette:30,shadowTintHue:200,shadowTintAmt:15}),
  L("blockbuster","Blockbuster","cine","บล็อกบัสเตอร์ ฟ้า-ส้มจัดจ้าน",{contrast:48,blacks:-22,vibrance:18,saturation:10,shadowTintHue:186,shadowTintAmt:80,highlightTintHue:28,highlightTintAmt:65,vignette:34,halation:18}),
  L("rainy_city","Rainy City","cine","เมืองฝนตก ฟ้าหม่น เย็นเหงา",{temp:-24,saturation:-24,contrast:26,blacks:-10,fade:16,shadowTintHue:210,shadowTintAmt:45,midTintHue:200,midTintAmt:15,grain:22,vignette:25}),
  // ---------------- MOVIE MOOD: colour inspired by famous films
  L("neo_code","Neo Code","movie","เขียวดิจิทัลแบบหนังไซไฟ The Matrix",{temp:-12,tint:-38,contrast:52,blacks:-30,saturation:-18,shadowTintHue:140,shadowTintAmt:70,midTintHue:120,midTintAmt:25,highlightTintHue:95,highlightTintAmt:35,grain:14,vignette:30,hsl:H({green:{sat:25},yellow:{hue:20}})}),
  L("in_the_mood","In the Mood","movie","แดงเขียวโรแมนติก แบบหนังหว่องกาไว",{temp:10,saturation:22,vibrance:10,contrast:38,blacks:-20,shadowTintHue:160,shadowTintAmt:45,highlightTintHue:15,highlightTintAmt:50,vignette:45,grain:26,halation:40,hsl:H({red:{sat:30,lum:-6},green:{hue:-20,sat:10}})}),
  L("neon_2049","Neon 2049","movie","หมอกส้มอนาคต แบบ Blade Runner 2049",{temp:46,tint:6,contrast:30,blacks:-18,highlights:-24,saturation:-12,fade:10,bloom:45,highlightTintHue:30,highlightTintAmt:75,shadowTintHue:18,shadowTintAmt:35,midTintHue:28,midTintAmt:25}),
  L("desert_spice","Desert Spice","movie","ทะเลทรายทองซีด แบบหนัง Dune",{temp:30,saturation:-38,contrast:36,blacks:-18,fade:8,highlightTintHue:40,highlightTintAmt:50,shadowTintHue:25,shadowTintAmt:35,midTintHue:35,midTintAmt:20,grain:12,vignette:28}),
  L("moonlit","Moonlit Blue","movie","น้ำเงินม่วงยามค่ำ แบบหนัง Moonlight",{temp:-26,tint:6,saturation:18,contrast:34,blacks:-14,shadowTintHue:232,shadowTintAmt:65,highlightTintHue:300,highlightTintAmt:30,bloom:20,hsl:H({blue:{sat:35},purple:{sat:25},orange:{sat:10}})}),
  L("fury_road","Fury Road","movie","ส้มฟ้าสุดขั้ว แบบ Mad Max: Fury Road",{contrast:60,blacks:-28,saturation:32,vibrance:22,shadowTintHue:190,shadowTintAmt:90,highlightTintHue:28,highlightTintAmt:80,vignette:30,hsl:H({orange:{sat:35},blue:{sat:30}})}),
  L("paris_cafe","Paris Café","movie","เขียว-แดงอบอุ่นแบบหนัง Amélie",{temp:16,tint:-12,saturation:26,contrast:28,blacks:-10,highlightTintHue:50,highlightTintAmt:40,shadowTintHue:120,shadowTintAmt:25,vignette:40,halation:20,hsl:H({green:{hue:-30,sat:22},red:{sat:32},yellow:{sat:15}})}),
  L("pastel_hotel","Pastel Hotel","movie","พาสเทลชมพูสมมาตร แบบ Grand Budapest Hotel",{exposure:8,contrast:8,fade:18,tint:20,saturation:14,highlightTintHue:340,highlightTintAmt:40,shadowTintHue:200,shadowTintAmt:20,hsl:H({red:{hue:10,lum:8},purple:{sat:15}})}),
  L("city_of_stars","City of Stars","movie","ม่วงฟ้าโพล้เพล้ แบบ La La Land",{tint:9,temp:-6,saturation:28,contrast:30,blacks:-12,shadowTintHue:250,shadowTintAmt:60,highlightTintHue:320,highlightTintAmt:40,bloom:35,hsl:H({blue:{sat:20},yellow:{sat:20}})}),
  L("night_drive","Night Drive","movie","ชมพูแมเจนต้ากลางคืน แบบหนัง Drive",{tint:12,temp:-14,contrast:44,blacks:-24,saturation:12,shadowTintHue:212,shadowTintAmt:55,highlightTintHue:330,highlightTintAmt:55,halation:35,bloom:25,grain:14}),
  L("sin_noir","Sin Noir","movie","ขาวดำจัดจ้าน แบบ Sin City",{keepBright:72,mono:true,contrast:85,blacks:-45,highlights:15,grain:38,vignette:55}),
  L("gotham_stairs","Gotham Stairs","movie","เขียวเหลืองหม่นบนบันได แบบหนัง Joker",{temp:12,tint:-16,saturation:-8,contrast:38,blacks:-16,shadowTintHue:160,shadowTintAmt:50,highlightTintHue:50,highlightTintAmt:45,grain:26,vignette:35,hsl:H({orange:{sat:15},red:{sat:20}})}),
  L("retro_70s","Retro 70s","movie","ฟิล์มยุค 70 อิ่มสี อุ่นซีด",{temp:22,saturation:20,contrast:20,fade:22,highlightTintHue:42,highlightTintAmt:40,shadowTintHue:12,shadowTintAmt:22,grain:34,vignette:28,hsl:H({red:{sat:20},orange:{sat:15},blue:{hue:15,sat:-15}})}),
  // ---------------- MUSIC MOOD: colour that feels like a genre
  L("lofi","Lo-fi Beats","music","นั่งชิลฟังโลไฟ สีซีดอุ่น เกรนนุ่ม",{fade:32,saturation:-20,temp:12,tint:8,grain:38,contrast:8,highlightTintHue:35,highlightTintAmt:32,shadowTintHue:250,shadowTintAmt:22,vignette:28}),
  L("city_pop","City Pop 80s","music","ซิตี้ป๊อปยุค 80 ชมพูฟ้า ฟุ้งเรโทร",{tint:7,temp:4,saturation:26,vibrance:12,contrast:16,bloom:35,fade:10,highlightTintHue:330,highlightTintAmt:40,shadowTintHue:220,shadowTintAmt:40,grain:16}),
  L("synthwave","Synthwave","music","ซินธ์เวฟนีออนม่วงชมพูสุดจัด",{tint:16,temp:-22,contrast:44,blacks:-20,saturation:38,shadowTintHue:270,shadowTintAmt:80,highlightTintHue:318,highlightTintAmt:65,bloom:45,halation:25,vignette:30}),
  L("kpop_candy","K-Pop Candy","music","เคป๊อปสดใส ผิวใส สีลูกกวาด",{exposure:12,contrast:14,saturation:22,vibrance:32,tint:10,highlights:-18,shadows:16,bloom:22,highlightTintHue:340,highlightTintAmt:22,hsl:H({orange:{lum:10},red:{sat:15},blue:{sat:20}})}),
  L("jazz_club","Jazz Club","music","แจ๊สคลับควันบุหรี่ ดำลึก ไฟอำพัน",{keepBright:72,temp:26,contrast:52,blacks:-34,saturation:-14,highlightTintHue:35,highlightTintAmt:60,shadowTintHue:20,shadowTintAmt:20,vignette:60,grain:32,halation:35}),
  L("indie_folk","Indie Folk","music","อินดี้โฟล์ค ธรรมชาติ หม่นอุ่น",{temp:16,saturation:-18,fade:20,tint:-6,contrast:18,highlightTintHue:45,highlightTintAmt:30,shadowTintHue:100,shadowTintAmt:25,grain:22,hsl:H({green:{hue:-20,sat:-15}})}),
  L("rnb_velvet","R&B Velvet","music","อาร์แอนด์บีกำมะหยี่ ม่วงแดงหรูหรา",{temp:10,tint:8,contrast:40,blacks:-24,saturation:12,shadowTintHue:300,shadowTintAmt:55,highlightTintHue:20,highlightTintAmt:45,bloom:22,vignette:40}),
  L("grunge_90s","Grunge 90s","music","กรันจ์ยุค 90 สีซีดสกปรก เกรนหนัก",{saturation:-38,contrast:44,blacks:-14,tint:-12,temp:-6,shadowTintHue:140,shadowTintAmt:35,grain:60,vignette:45,fade:10}),
  L("bossa_summer","Bossa Summer","music","บอสซาโนวาหน้าร้อน แดดจ้าสดชื่น",{temp:22,exposure:8,vibrance:28,contrast:18,highlights:-18,lightLeak:32,highlightTintHue:45,highlightTintAmt:32,hsl:H({blue:{sat:25,hue:-10},yellow:{sat:15}})}),
  L("luk_thung","Luk Thung Gold","music","ลูกทุ่งทองอร่าม อุ่นสด เวทีไฟวิบวับ",{temp:36,saturation:22,contrast:30,blacks:-12,highlightTintHue:45,highlightTintAmt:60,bloom:30,halation:25,vignette:32,hsl:H({red:{sat:20},yellow:{sat:25}})}),
];

export const CATS=[["trend","🔥 ยอดนิยม"],["movie","🎬 Movie"],["music","🎧 Music"],["cine","Cinematic"],["film","Film"],["mine","My Looks"]];

// Simulated lenses (applied to every photo, on top of the real camera)
export const LENSES=[
  {id:"natural",name:"Natural",desc:"เลนส์ธรรมชาติของกล้อง"},
  {id:"wide",name:"Wide 18",desc:"มุมกว้างจำลอง ขอบโค้งเล็กน้อย",barrel:.10,vig:.15},
  {id:"35",name:"35mm",desc:"สตรีทคลาสสิก ครอปแน่นขึ้น",crop:1.3},
  {id:"50",name:"50mm",desc:"เลนส์มาตรฐาน มุมมองเหมือนตา",crop:1.85},
  {id:"85",name:"85 Portrait",desc:"เลนส์พอร์ตเทรต ขอบหลังละลาย",crop:2.3,bokeh:.9},
  {id:"fisheye",name:"Fisheye",desc:"ฟิชอายโค้งจัด ขอบวงกลม",barrel:.55,vig:.55,circle:true},
  {id:"anamorphic",name:"Anamorphic",desc:"เลนส์หนังจอกว้าง แสงแฟลร์ยาวสีฟ้า",streak:.9,vig:.25,oval:true},
  {id:"vintage",name:"Vintage",desc:"เลนส์เก่า นุ่มฟุ้ง ขอบสีเหลื่อม",soft:.6,ca:.8,vig:.35},
];

// Simulated camera bodies: colour + character + stamps
export const BODIES=[
  {id:"none",name:"Off",desc:"ไม่จำลองกล้อง"},
  {id:"compact",name:"Film Compact",desc:"กล้องฟิล์มคอมแพค แฟลชในตัว วันที่สีส้ม",adj:{temp:10,contrast:14,saturation:6,grain:26,fade:6,highlightTintHue:40,highlightTintAmt:20},flash:.35,date:"film"},
  {id:"disposable",name:"Disposable",desc:"กล้องใช้แล้วทิ้ง แฟลชจัด เงาอมเขียว แสงรั่ว",adj:{tint:-8,contrast:20,saturation:-6,grain:45,fade:12,shadowTintHue:150,shadowTintAmt:35,lightLeak:30},flash:.6,soft:.35,date:"film"},
  {id:"instant",name:"Instant",desc:"ฟิล์มอินสแตนท์ สีครีมซีด กรอบขาว",adj:{fade:28,saturation:-14,contrast:6,temp:6,shadowTintHue:185,shadowTintAmt:28,highlightTintHue:45,highlightTintAmt:22,grain:14},soft:.25,frame:"Polaroid"},
  {id:"ccd",name:"CCD 2005",desc:"ดิจิคอม CCD ยุค 2000 สีสด แฟลชแรง คมจัด",adj:{exposure:6,contrast:26,saturation:18,temp:-8,highlights:14,grain:8},flash:.3,sharpen:.8,noise:.35,date:"digital"},
  {id:"vhs",name:"VHS",desc:"กล้องวิดีโอ VHS เส้นสแกน สีเลื่อม",adj:{saturation:-18,contrast:-8,fade:14,temp:4},chroma:.7,scan:.55,noise:.45,soft:.3,date:"vhs"},
];
