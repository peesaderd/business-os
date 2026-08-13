#!/usr/bin/env python3
"""Write the new single-page passport UI to the frontend directory."""
import os

OUT = "/home/openhands/erp-stack/frontend/passport/index.html"

HTML = r'''<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<title>Passport Photo Studio</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#f8fafc;--surface:#fff;--surface2:#f1f5f9;--border:#e2e8f0;--text:#0f172a;--dim:#64748b;--muted:#94a3b8;--accent:#6366f1;--accent-hover:#4f46e5;--accent-light:#eef2ff;--accent-glow:rgba(99,102,241,.15);--success:#10b981;--danger:#ef4444;--radius:16px;--radius-sm:12px;--radius-xs:8px;--shadow:0 1px 3px rgba(0,0,0,.06);--shadow-md:0 4px 12px rgba(0,0,0,.08);--shadow-lg:0 12px 24px rgba(0,0,0,.1)}
html{scroll-behavior:smooth}
body{font-family:'Inter',-apple-system,sans-serif;background:var(--bg);min-height:100vh;-webkit-font-smoothing:antialiased;color:var(--text)}
.header{padding:24px 20px 16px;max-width:960px;margin:0 auto;display:flex;align-items:center;justify-content:space-between}
.header h1{font-size:1.4rem;font-weight:800;letter-spacing:-.03em;display:flex;align-items:center;gap:10px}
.header h1 span{font-size:1.6rem}
.header p{font-size:.78rem;color:var(--dim);margin-top:2px}
.header-price{font-size:.7rem;color:var(--accent);font-weight:600;background:var(--accent-light);padding:6px 12px;border-radius:20px;white-space:nowrap}
.page{max-width:960px;margin:0 auto;padding:0 16px 60px}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:20px;align-items:start}
.card{background:var(--surface);border-radius:var(--radius);border:1px solid var(--border);overflow:hidden;box-shadow:var(--shadow)}
.card-head{padding:14px 18px;border-bottom:1px solid var(--border);font-size:.8rem;font-weight:700;display:flex;align-items:center;gap:8px}
.card-body{padding:18px}
.upload-zone{border:2px dashed var(--border);border-radius:var(--radius-sm);padding:32px 20px;text-align:center;cursor:pointer;transition:all .3s;background:var(--surface2);position:relative}
.upload-zone:hover{border-color:var(--accent);background:var(--accent-light)}
.upload-zone.dragover{border-color:var(--accent);background:var(--accent-light)}
.upload-zone.has-file{border-style:solid;border-color:var(--accent);padding:12px;display:flex;align-items:center;gap:14px;text-align:left}
.upload-icon{font-size:36px;margin-bottom:8px;opacity:.5}
.upload-title{font-size:.85rem;font-weight:600}
.upload-sub{font-size:.72rem;color:var(--dim);margin-top:4px}
.upload-zone img{width:60px;height:60px;object-fit:cover;border-radius:var(--radius-xs);flex-shrink:0}
.upload-zone .file-info{flex:1}
.upload-zone .file-name{font-size:.78rem;font-weight:600;margin-bottom:2px;word-break:break-all}
.upload-zone .file-meta{font-size:.68rem;color:var(--dim)}
.gender-badge{display:inline-flex;align-items:center;gap:4px;margin-top:4px;padding:3px 8px;border-radius:12px;font-size:.65rem;font-weight:600;background:var(--accent-light);color:var(--accent)}
.bulk-badge{display:inline-flex;align-items:center;gap:4px;margin-top:4px;padding:3px 8px;border-radius:12px;font-size:.65rem;font-weight:600;background:#dcfce7;color:#16a34a}
.upload-zone .clear-btn{position:absolute;top:8px;right:8px;width:22px;height:22px;border-radius:50%;background:var(--surface);border:1px solid var(--border);cursor:pointer;font-size:10px;display:flex;align-items:center;justify-content:center;color:var(--dim);transition:all .2s}
.upload-zone .clear-btn:hover{background:var(--danger);color:#fff;border-color:var(--danger)}
.upload-zone input{display:none}
.preview-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:10px}
.preview-thumb{position:relative;aspect-ratio:3/4;border-radius:var(--radius-xs);overflow:hidden;box-shadow:var(--shadow)}
.preview-thumb img{width:100%;height:100%;object-fit:cover}
.preview-thumb .remove{position:absolute;top:3px;right:3px;width:16px;height:16px;border-radius:50%;background:rgba(0,0,0,.6);color:#fff;border:none;cursor:pointer;font-size:8px;display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .2s}
.preview-thumb:hover .remove{opacity:1}
.country-select{width:100%;padding:10px 14px;border:1.5px solid var(--border);border-radius:var(--radius-xs);font-size:.82rem;font-weight:500;background:var(--surface);color:var(--text);outline:none;cursor:pointer;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center;padding-right:36px;transition:border-color .2s}
.country-select:focus{border-color:var(--accent)}
.custom-row{display:flex;gap:6px;align-items:center;margin-top:8px}
.custom-row input{flex:1;padding:8px 10px;border:1.5px solid var(--border);border-radius:var(--radius-xs);font-size:.75rem;outline:none;background:var(--surface);text-align:center}
.custom-row input:focus{border-color:var(--accent)}
.custom-row span{color:var(--muted);font-weight:600}
.custom-row button{padding:8px 14px;border:none;border-radius:var(--radius-xs);font-size:.7rem;font-weight:600;cursor:pointer;background:var(--accent);color:#fff;transition:all .2s;white-space:nowrap}
.custom-row button:hover{background:var(--accent-hover)}
.carousel-wrap{position:relative;margin:0 -4px;padding:0 4px}
.carousel{display:flex;gap:8px;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;scrollbar-width:none;padding:6px 0 8px}
.carousel::-webkit-scrollbar{display:none}
.carousel-item{flex:0 0 80px;scroll-snap-align:start;cursor:pointer;border:2px solid var(--border);border-radius:var(--radius-xs);overflow:hidden;transition:all .25s;background:var(--surface);position:relative}
.carousel-item:hover{border-color:var(--accent);transform:translateY(-2px);box-shadow:var(--shadow-md)}
.carousel-item.active{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-glow)}
.carousel-item img{width:100%;height:96px;object-fit:cover;display:block;background:var(--surface2)}
.carousel-item .label{text-align:center;padding:6px 3px;font-size:.62rem;font-weight:600;color:var(--dim);line-height:1.2}
.carousel-item.active .label{color:var(--accent)}
.carousel-item .check{position:absolute;top:4px;right:4px;width:18px;height:18px;border-radius:50%;background:var(--accent);color:#fff;display:none;align-items:center;justify-content:center;font-size:9px;font-weight:700}
.carousel-item.active .check{display:flex}
.carousel-arrow{position:absolute;top:50%;transform:translateY(-50%);width:28px;height:28px;border-radius:50%;background:var(--surface);border:1px solid var(--border);box-shadow:var(--shadow);cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--dim);z-index:5;transition:all .2s}
.carousel-arrow:hover{background:var(--accent);color:#fff;border-color:var(--accent)}
.carousel-arrow.left{left:-10px}
.carousel-arrow.right{right:-10px}
.bg-row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.bg-dot{width:36px;height:36px;border-radius:50%;cursor:pointer;border:3px solid var(--border);transition:all .2s;position:relative;box-shadow:var(--shadow)}
.bg-dot:hover{transform:scale(1.1);box-shadow:var(--shadow-md)}
.bg-dot.active{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-glow)}
.bg-dot.active::after{content:'✓';position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:.6rem;font-weight:700;color:var(--accent)}
.bg-dot.custom{border-style:dashed;display:flex;align-items:center;justify-content:center;font-size:1rem;color:var(--muted)}
.color-wrap{position:relative;width:36px;height:36px}
.color-wrap input[type=color]{position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%}
.print-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
.print-field label{font-size:.62rem;color:var(--muted);margin-bottom:3px;display:block;font-weight:500}
.print-field select,.print-field input{width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:var(--radius-xs);font-size:.75rem;background:var(--surface);color:var(--text);outline:none;transition:border-color .2s}
.print-field select:focus,.print-field input:focus{border-color:var(--accent)}
.blade-toggle{display:flex;align-items:center;gap:6px;margin-top:8px;font-size:.68rem;color:var(--dim);cursor:pointer;user-select:none}
.blade-toggle input{accent-color:var(--accent);width:13px;height:13px}
.gen-btn{width:100%;padding:14px;border:none;border-radius:var(--radius-sm);font-size:.9rem;font-weight:700;cursor:pointer;background:linear-gradient(135deg,var(--accent) 0%,#8b5cf6 100%);color:#fff;transition:all .3s;margin-top:16px;box-shadow:0 4px 15px var(--accent-glow)}
.gen-btn:hover{transform:translateY(-2px);box-shadow:0 6px 20px var(--accent-glow)}
.gen-btn:active{transform:translateY(0)}
.gen-btn:disabled{opacity:.4;cursor:not-allowed;transform:none;box-shadow:none}
.result-section{display:none;animation:slideUp .4s ease}
.result-section.show{display:block}
@keyframes slideUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
.result-card{background:var(--surface);border-radius:var(--radius);overflow:hidden;box-shadow:var(--shadow-lg);border:1px solid var(--border)}
.result-img{width:100%;max-height:400px;object-fit:contain;background:var(--surface2)}
.result-stats{display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid var(--border)}
.result-stat{padding:10px 6px;text-align:center;border-right:1px solid var(--border)}
.result-stat:last-child{border-right:none}
.result-stat .val{font-size:.82rem;font-weight:700;color:var(--accent)}
.result-stat .lbl{font-size:.55rem;color:var(--muted);margin-top:2px;font-weight:500}
.result-actions{display:flex;gap:6px;padding:14px}
.result-btn{flex:1;padding:10px;border:none;border-radius:var(--radius-xs);font-size:.75rem;font-weight:600;cursor:pointer;transition:all .2s;display:flex;align-items:center;justify-content:center;gap:5px}
.result-btn.primary{background:var(--success);color:#fff}
.result-btn.primary:hover{filter:brightness(1.1);transform:translateY(-1px)}
.result-btn.secondary{background:var(--surface2);color:var(--text);border:1px solid var(--border)}
.result-btn.secondary:hover{border-color:var(--accent);color:var(--accent)}
.print-section{padding:14px;border-top:1px solid var(--border)}
.print-section img{width:100%;border-radius:var(--radius-sm);background:var(--surface2)}
.bulk-list{padding:0 14px 14px}
.bulk-item{display:flex;align-items:center;gap:8px;padding:8px 10px;background:var(--surface2);border-radius:var(--radius-xs);margin-bottom:5px;font-size:.7rem;transition:all .2s}
.bulk-item:hover{background:var(--accent-light)}
.bulk-item .num{font-weight:700;color:var(--muted);min-width:22px}
.bulk-item .info{flex:1}
.bulk-item .status{font-size:.6rem;padding:2px 6px;border-radius:8px;font-weight:600}
.bulk-item .status.ok{background:#dcfce7;color:#16a34a}
.bulk-item .status.err{background:#fee2e2;color:#ef4444}
.bulk-item a{color:var(--accent);text-decoration:none;font-weight:600;font-size:.68rem}
.overlay{display:none;position:fixed;inset:0;background:rgba(255,255,255,.92);z-index:998;justify-content:center;align-items:center;flex-direction:column;gap:14px;backdrop-filter:blur(8px)}
.overlay.show{display:flex}
.spinner{width:36px;height:36px;border:3px solid var(--border);border-top-color:var(--accent);border-radius:50%;animation:spin .8s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
.overlay-text{font-size:.85rem;color:var(--dim);font-weight:500}
.toast{position:fixed;bottom:20px;left:50%;transform:translateX(-50%) translateY(100px);background:var(--text);color:#fff;border-radius:20px;padding:10px 20px;z-index:999;font-size:.78rem;font-weight:500;box-shadow:var(--shadow-md);transition:transform .3s ease}
.toast.show{transform:translateX(-50%) translateY(0)}
.toast.error{background:var(--danger)}
@media(max-width:768px){.cols{grid-template-columns:1fr}.header{flex-direction:column;align-items:flex-start;gap:8px}.carousel-item{width:72px}.carousel-item img{height:84px}}
</style>
</head>
<body>
<div class="header"><div><h1><span>📸</span> Passport Photo Studio</h1><p>สร้างรูปพาสปอร์ตด้วย AI · ไม่ถึง 10 วินาที</p></div><div class="header-price">⚡ $0.004 / รูป</div></div>
<div class="overlay" id="overlay"><div class="spinner"></div><div class="overlay-text" id="overlayText">กำลังสร้างรูป...</div></div>
<div class="toast" id="toast"></div>
<div class="page"><div class="cols">
<div>
<div class="card"><div class="card-head">📷 อัพโหลดรูป</div><div class="card-body">
<div class="upload-zone" id="uploadZone">
<div id="uploadEmpty"><div class="upload-icon">📷</div><div class="upload-title">ลากไฟล์มาที่นี่ หรือคลิกเพื่อเลือก</div><div class="upload-sub">JPG หรือ PNG · รองรับสูงสุด 20 ไฟล์</div></div>
<div id="uploadFilled" style="display:none"><img id="previewThumb" alt=""><div class="file-info"><div class="file-name" id="fileName"></div><div class="file-meta" id="fileMeta"></div><div id="genderBadge"></div><div id="bulkBadge" style="display:none"></div></div></div>
<button class="clear-btn" id="clearBtn" style="display:none" title="ลบรูป">✕</button>
<input type="file" id="fileInput" accept="image/jpeg,image/png" multiple>
</div>
<div class="preview-grid" id="previewGrid"></div>
</div></div>
<div class="card" style="margin-top:14px"><div class="card-head">🌍 ประเทศ & ขนาด</div><div class="card-body">
<select class="country-select" id="countrySelect"><option value="">— เลือกประเทศ —</option></select>
<div class="custom-row"><input type="number" id="customW" placeholder="กว้าง (mm)" min="10" max="200"><span>×</span><input type="number" id="customH" placeholder="สูง (mm)" min="10" max="200"><button id="customBtn">กำหนดเอง</button></div>
</div></div>
<div class="card" style="margin-top:14px"><div class="card-head">👔 เสื้อผ้า <span class="count" id="clothingCount" style="margin-left:auto">0</span></div><div class="card-body" style="padding:12px 14px">
<div class="carousel-wrap"><button class="carousel-arrow left" id="clothingLeft">◀</button><div class="carousel" id="clothingCarousel"></div><button class="carousel-arrow right" id="clothingRight">▶</button></div>
</div></div>
<div class="card" style="margin-top:14px"><div class="card-head">🎨 พื้นหลัง</div><div class="card-body"><div class="bg-row" id="bgRow"></div></div></div>
<div class="card" style="margin-top:14px"><div class="card-head">🖨️ การพิมพ์</div><div class="card-body">
<div class="print-grid">
<div class="print-field"><label>กระดาษ</label><select id="printSize"><option value="4x6">4×6"</option><option value="5x7">5×7"</option><option value="a6">A6</option><option value="a4">A4</option></select></div>
<div class="print-field"><label>จำนวนรูป</label><input type="number" id="photoCount" value="6" min="1" max="20"></div>
<div class="print-field"><label>ขอบ</label><select id="borderType"><option value="guidelines">เส้นตัด</option><option value="none">ไม่มี</option><option value="frame">กรอบขาว</option></select></div>
</div>
<label class="blade-toggle"><input type="checkbox" id="bladeMode"> เปิดโหมด blade สำหรับตัด</label>
</div></div>
<button class="gen-btn" id="genBtn" disabled>✨ สร้างรูปพาสปอร์ต</button>
</div>
<div>
<div class="card"><div class="card-head">📋 ผลลัพธ์</div><div class="card-body">
<div class="result-section show" id="resultEmpty" style="text-align:center;padding:40px 20px;color:var(--muted)">
<div style="font-size:2.5rem;margin-bottom:12px;opacity:.4">🖼️</div>
<div style="font-size:.82rem;font-weight:500">อัพโหลดรูปแล้วกด "สร้างรูป"</div>
<div style="font-size:.72rem;margin-top:4px">ผลลัพธ์จะแสดงที่นี่</div></div>
<div class="result-section" id="resultContent"><div class="result-card">
<img class="result-img" id="resultImg" alt="Result">
<div class="result-stats" id="resultStats"></div>
<div class="result-actions"><button class="result-btn primary" id="dlPassport">💾 ดาวน์โหลด</button><button class="result-btn secondary" id="dlPrint">🖨️ แผ่นพิมพ์</button><button class="result-btn secondary" id="retryBtn">🔄 ใหม่</button></div>
<div class="print-section" id="printSection" style="display:none"><img id="printImg" alt="Print Sheet"></div>
<div class="bulk-list" id="bulkList" style="display:none"></div>
</div></div>
</div></div>
</div>
</div></div>
<script>
const API='/api/passport';const $=id=>document.getElementById(id);
const FLAGS={Thailand:'\u{1F1F9}\u{1F1ED}',Japan:'\u{1F1EF}\u{1F1F5}',China:'\u{1F1E8}\u{1F1F3}','South Korea':'\u{1F1F0}\u{1F1F7}','United States':'\u{1F1FA}\u{1F1F8}','United Kingdom':'\u{1F1EC}\u{1F1E7}','European Union':'\u{1F1EA}\u{1F1FA}',Canada:'\u{1F1E8}\u{1F1E6}',Australia:'\u{1F1E6}\u{1F1FA}',India:'\u{1F1EE}\u{1F1F3}',Singapore:'\u{1F1F8}\u{1F1EC}',Malaysia:'\u{1F1F2}\u{1F1FE}',Philippines:'\u{1F1F5}\u{1F1ED}',Indonesia:'\u{1F1EE}\u{1F1E9}',Vietnam:'\u{1F1FB}\u{1F1F3}',Cambodia:'\u{1F1F0}\u{1F1ED}',Laos:'\u{1F1F1}\u{1F1E6}',Myanmar:'\u{1F1F2}\u{1F1E2}','Hong Kong':'\u{1F1ED}\u{1F1F0}',France:'\u{1F1EB}\u{1F1F7}',Germany:'\u{1F1E9}\u{1F1EA}'};
const state={photo:null,photos:[],isBulk:false,gender:'male',clothing:'white_shirt',background:'light_blue',template:'us_passport',bgCustom:null,customW:null,customH:null,sessionId:null};
let clothingData={male:[],female:[]},bgData=[],tplData=[];
async function init(){await loadData();setupUpload();setupActions();renderCountryDropdown();renderClothing();renderBg();}
async function loadData(){try{const[m,f,bg,tp]=await Promise.all([fetch(`${API}/clothing?gender=male`),fetch(`${API}/clothing?gender=female`),fetch(`${API}/backgrounds`),fetch(`${API}/templates`)]);const mj=await m.json();clothingData.male=mj.options||mj;const fj=await f.json();clothingData.female=fj.options||fj;const bj=await bg.json();bgData=bj.options||bj;const tj=await tp.json();tplData=tj.templates||tj;}catch(e){console.error(e);}}
function setupUpload(){const z=$('uploadZone'),i=$('fileInput');z.addEventListener('click',e=>{if(e.target.id==='clearBtn'||e.target.closest('.clear-btn'))return;i.click();});z.addEventListener('dragover',e=>{e.preventDefault();z.classList.add('dragover')});z.addEventListener('dragleave',()=>z.classList.remove('dragover'));z.addEventListener('drop',e=>{e.preventDefault();z.classList.remove('dragover');handleFiles(e.dataTransfer.files)});i.addEventListener('change',e=>handleFiles(e.target.files));$('clearBtn').addEventListener('click',e=>{e.stopPropagation();clearFile()});}
function handleFiles(files){const a=[...files].filter(f=>f.type.startsWith('image/'));if(!a.length)return;if(a.length===1){state.photo=a[0];state.photos=[a[0]];state.isBulk=false;}else{state.photos=a.slice(0,20);state.photo=a[0];state.isBulk=true;}showUploadState();detectGender();$('genBtn').disabled=false;}
function showUploadState(){const z=$('uploadZone');if(!state.photo){z.classList.remove('has-file');$('uploadEmpty').style.display='';$('uploadFilled').style.display='none';$('clearBtn').style.display='none';$('previewGrid').innerHTML='';return;}z.classList.add('has-file');$('uploadEmpty').style.display='none';$('uploadFilled').style.display='';$('clearBtn').style.display='flex';$('previewThumb').src=URL.createObjectURL(state.photo);$('fileName').textContent=state.photo.name;$('fileMeta').textContent=state.isBulk?`${state.photos.length} files`:`${(state.photo.size/1024).toFixed(0)} KB`;$('bulkBadge').style.display=state.isBulk?'inline-flex':'none';if(state.isBulk)$('bulkBadge').textContent=`📸 ${state.photos.length}`;if(state.photos.length>1){$('previewGrid').innerHTML=state.photos.slice(0,8).map((f,i)=>`<div class="preview-thumb"><img src="${URL.createObjectURL(f)}"><button class="remove" onclick="event.stopPropagation();removePhoto(${i})">✕</button></div>`).join('')+(state.photos.length>8?`<div class="preview-thumb" style="display:flex;align-items:center;justify-content:center;background:var(--surface2);font-size:.65rem;color:var(--dim)">+${state.photos.length-8}</div>`:'');}else $('previewGrid').innerHTML='';}
function removePhoto(i){state.photos.splice(i,1);if(!state.photos.length){clearFile();return;}state.photo=state.photos[0];state.isBulk=state.photos.length>1;showUploadState();}
function clearFile(){state.photo=null;state.photos=[];state.isBulk=false;state.gender='male';state.clothing='white_shirt';$('fileInput').value='';$('genderBadge').innerHTML='';$('bulkBadge').style.display='none';$('genBtn').disabled=true;showUploadState();renderClothing();$('resultEmpty').style.display='';$('resultContent').style.display='none';}
async function detectGender(){if(!state.photo)return;try{const b=await toBase64(state.photo);const fd=new FormData();fd.append('image_base64',b);const r=await fetch(`${API}/detect-gender`,{method:'POST',body:fd});const d=await r.json();if(d.ok&&d.gender){state.gender=d.gender;state.clothing=state.gender==='male'?'white_shirt':'white_blouse';$('genderBadge').innerHTML=`<span class="gender-badge">${d.gender==='male'?'\u{1F468}':'\u{1F469}'} ${d.gender}</span>`;renderClothing();}}catch(e){console.error(e);}}
function setupActions(){$('genBtn').addEventListener('click',generate);$('dlPassport').addEventListener('click',()=>dl('passport'));$('dlPrint').addEventListener('click',()=>dl('print'));$('retryBtn').addEventListener('click',()=>clearFile());$('customBtn').addEventListener('click',()=>{const w=parseInt($('customW').value),h=parseInt($('customH').value);if(w>0&&h>0){state.customW=w;state.customH=h;state.template='custom';$('countrySelect').value='';toast(`${w}x${h}mm`);}});$('countrySelect').addEventListener('change',e=>{state.template=e.target.value;state.customW=null;state.customH=null;});$('clothingLeft').addEventListener('click',()=>{$('clothingCarousel').scrollBy({left:-100,behavior:'smooth'})});$('clothingRight').addEventListener('click',()=>{$('clothingCarousel').scrollBy({left:100,behavior:'smooth'})});}
function renderCountryDropdown(){let h='<option value="">— Select Country —</option>';for(const t of tplData){const f=FLAGS[t.country]||'';h+=`<option value="${t.code}" ${t.code===state.template?'selected':''}>${f} ${t.name} (${t.width_mm}x${t.height_mm}mm)</option>`;}$('countrySelect').innerHTML=h;}
function renderClothing(){const d=state.gender==='male'?clothingData.male:clothingData.female;if(!d||!d.length){$('clothingCarousel').innerHTML='<div style="padding:16px;color:var(--muted);font-size:.75rem">No clothing data</div>';$('clothingCount').textContent='0';return;}$('clothingCount').textContent=d.length;$('clothingCarousel').innerHTML=d.map(c=>`<div class="carousel-item ${c.key===state.clothing?'active':''}" data-key="${c.key}"><img src="/img/clothing/${state.gender}/${c.key}.png" alt="${c.name}" loading="lazy" onerror="this.style.background='var(--surface2)';this.style.height='96px'"><div class="label">${c.name}</div><div class="check">\u2713</div></div>`).join('');document.querySelectorAll('.carousel-item').forEach(i=>{i.addEventListener('click',()=>{state.clothing=i.dataset.key;document.querySelectorAll('.carousel-item').forEach(x=>x.classList.remove('active'));i.classList.add('active');});});}
function renderBg(){$('bgRow').innerHTML=bgData.map(b=>`<div class="bg-dot ${b.key===state.background?'active':''}" style="background:${b.hex||'#ccc'}" data-key="${b.key}" title="${b.name}"></div>`).join('')+'<div class="color-wrap"><div class="bg-dot custom" title="Custom">+</div><input type="color" value="#C4DCFF" id="customColor"></div>';document.querySelectorAll('.bg-dot:not(.custom)').forEach(d=>{d.addEventListener('click',()=>{state.background=d.dataset.key;state.bgCustom=null;document.querySelectorAll('.bg-dot').forEach(x=>x.classList.remove('active'));d.classList.add('active');});});$('customColor').addEventListener('input',e=>{state.bgCustom=e.target.value;state.background='custom';document.querySelectorAll('.bg-dot').forEach(x=>x.classList.remove('active'));});}
async function generate(){if(!state.photo)return;if(state.isBulk&&state.photos.length>1)return generateBulk();showOverlay('Generating...');try{const b=await toBase64(state.photo);const body={image_base64:b,template_code:state.template,gender:state.gender,clothing:state.clothing,background:state.background,strength:0.65};if(state.bgCustom)body.background_color=state.bgCustom;if(state.customW&&state.customH){body.custom_width=state.customW;body.custom_height=state.customH;}const r=await fetch(`${API}/generate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!d.ok)throw new Error(d.detail||'Error');state.sessionId=d.session_id;showResult(d);}catch(e){toast(`Error: ${e.message}`,'error');}finally{hideOverlay();}}
async function generateBulk(){showOverlay(`Generating ${state.photos.length} photos...`);try{const imgs=[];for(const f of state.photos)imgs.push(await toBase64(f));const body={images:imgs,template_code:state.template,gender:state.gender,clothing:state.clothing,background:state.background,strength:0.65,print_size:$('printSize').value,photo_count:parseInt($('photoCount').value)||6,border:$('borderType').value,blade_mode:$('bladeMode').checked};if(state.bgCustom)body.background_color=state.bgCustom;if(state.customW&&state.customH){body.custom_width=state.customW;body.custom_height=state.customH;}const r=await fetch(`${API}/bulk-generate`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const d=await r.json();if(!d.ok)throw new Error(d.detail||'Error');state.sessionId=d.results[0]?.session_id;showBulkResult(d);}catch(e){toast(`Error: ${e.message}`,'error');}finally{hideOverlay();}}
function showResult(d){$('resultEmpty').style.display='none';$('resultContent').style.display='';$('resultStats').innerHTML=`<div class="result-stat"><div class="val">${d.time_seconds||'?'}s</div><div class="lbl">Time</div></div><div class="result-stat"><div class="val">${d.dimensions?.w}x${d.dimensions?.h}</div><div class="lbl">mm</div></div><div class="result-stat"><div class="val">${d.gender==='male'?'\u{1F468}':'\u{1F469}'}</div><div class="lbl">Gender</div></div><div class="result-stat"><div class="val">$0.004</div><div class="lbl">Cost</div></div>`;$('resultImg').src=`${API}/download/${d.session_id}_passport.jpg?t=${Date.now()}`;if(d.download_print){$('printImg').src=`${API}/download/${d.session_id}_print.jpg?t=${Date.now()}`;$('printSection').style.display