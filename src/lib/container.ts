import { CODE_METHOD, METHOD_CODE, deriveKey, randomBytes, type Method } from './crypto';
import { fromBase64, toBase64 } from './format';

/**
 * Format du conteneur .cadenas (v1)
 *
 * [MAGIC "CDNS" 4][VERSION 1][METHOD 1][ITERATIONS u32][SALT 16][IV 12][HINT_LEN u16][HINT utf8][CIPHERTEXT ...]
 *
 * Le texte clair, avant chiffrement AES-256-GCM :
 * [META_LEN u32][META JSON utf8][octets des fichiers concaténés dans l'ordre]
 */

const MAGIC = [0x43, 0x44, 0x4e, 0x53]; // C D N S
const VERSION = 1;
const FIXED_HEADER = 4 + 1 + 1 + 4 + 16 + 12 + 2;

export interface FileEntry {
  name: string;
  path: string;
  type: string;
  size: number;
}

export interface ContainerMeta {
  app: string;
  v: number;
  createdAt: string;
  files: FileEntry[];
}

export interface ContainerHeader {
  version: number;
  method: Method;
  iterations: number;
  salt: Uint8Array<ArrayBuffer>;
  iv: Uint8Array<ArrayBuffer>;
  hint: string;
  ciphertextOffset: number;
  totalSize: number;
}

export interface PickedFile {
  file: File;
  path: string;
}

export interface UnlockedFile {
  entry: FileEntry;
  blob: Blob;
}

export class ContainerError extends Error {
  constructor(
    message: string,
    public code: 'INVALID' | 'VERSION' | 'WRONG_SECRET' | 'CORRUPT',
  ) {
    super(message);
  }
}

export function isContainer(bytes: Uint8Array): boolean {
  return bytes.length > FIXED_HEADER && MAGIC.every((b, i) => bytes[i] === b);
}

export function parseHeader(bytes: Uint8Array<ArrayBuffer>): ContainerHeader {
  if (!isContainer(bytes)) throw new ContainerError('Ce fichier n’est pas un conteneur Cadenas valide.', 'INVALID');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = bytes[4];
  if (version !== VERSION) throw new ContainerError(`Version de conteneur inconnue (${version}).`, 'VERSION');
  const methodCode = bytes[5];
  const method = CODE_METHOD[methodCode];
  if (!method) throw new ContainerError('Méthode de protection inconnue.', 'INVALID');
  const iterations = dv.getUint32(6);
  const salt = bytes.slice(10, 26);
  const iv = bytes.slice(26, 38);
  const hintLen = dv.getUint16(38);
  const hint = new TextDecoder().decode(bytes.slice(40, 40 + hintLen));
  const ciphertextOffset = 40 + hintLen;
  if (ciphertextOffset + 16 > bytes.length) throw new ContainerError('Conteneur tronqué.', 'CORRUPT');
  return { version, method, iterations, salt, iv, hint, ciphertextOffset, totalSize: bytes.length };
}

export interface LockOptions {
  method: Method;
  secret: string;
  hint?: string;
  iterations: number;
  onStep?: (step: string) => void;
}

export async function lockFiles(picked: PickedFile[], opts: LockOptions): Promise<{ bytes: Uint8Array<ArrayBuffer>; meta: ContainerMeta }> {
  const enc = new TextEncoder();
  opts.onStep?.('Lecture des fichiers');
  const buffers: ArrayBuffer[] = [];
  for (const p of picked) buffers.push(await p.file.arrayBuffer());

  const meta: ContainerMeta = {
    app: 'Cadenas',
    v: 1,
    createdAt: new Date().toISOString(),
    files: picked.map((p, i) => ({
      name: p.file.name,
      path: p.path || p.file.name,
      type: p.file.type || 'application/octet-stream',
      size: buffers[i].byteLength,
    })),
  };

  const metaBytes = enc.encode(JSON.stringify(meta));
  const payloadSize = buffers.reduce((a, b) => a + b.byteLength, 0);
  const plain = new Uint8Array(4 + metaBytes.length + payloadSize);
  new DataView(plain.buffer).setUint32(0, metaBytes.length);
  plain.set(metaBytes, 4);
  let off = 4 + metaBytes.length;
  for (const b of buffers) {
    plain.set(new Uint8Array(b), off);
    off += b.byteLength;
  }

  opts.onStep?.('Dérivation de la clé (PBKDF2)');
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = await deriveKey(opts.secret, salt, opts.iterations);

  opts.onStep?.('Chiffrement AES-256-GCM');
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plain));
  plain.fill(0);

  opts.onStep?.('Assemblage du conteneur');
  const hintBytes = enc.encode((opts.hint ?? '').trim().slice(0, 240));
  const out = new Uint8Array(FIXED_HEADER + hintBytes.length + cipher.length);
  const dv = new DataView(out.buffer);
  out.set(MAGIC, 0);
  out[4] = VERSION;
  out[5] = METHOD_CODE[opts.method];
  dv.setUint32(6, opts.iterations);
  out.set(salt, 10);
  out.set(iv, 26);
  dv.setUint16(38, hintBytes.length);
  out.set(hintBytes, 40);
  out.set(cipher, 40 + hintBytes.length);
  return { bytes: out, meta };
}

export async function unlockContainer(
  bytes: Uint8Array<ArrayBuffer>,
  secret: string,
  onStep?: (s: string) => void,
): Promise<{ meta: ContainerMeta; files: UnlockedFile[] }> {
  const header = parseHeader(bytes);
  onStep?.('Dérivation de la clé (PBKDF2)');
  const key = await deriveKey(secret, header.salt, header.iterations);
  onStep?.('Déchiffrement');
  let plainBuf: ArrayBuffer;
  try {
    plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: header.iv }, key, bytes.slice(header.ciphertextOffset));
  } catch {
    throw new ContainerError('Secret incorrect ou fichier altéré. Le déchiffrement a échoué.', 'WRONG_SECRET');
  }
  const plain = new Uint8Array(plainBuf);
  const metaLen = new DataView(plainBuf).getUint32(0);
  let meta: ContainerMeta;
  try {
    meta = JSON.parse(new TextDecoder().decode(plain.slice(4, 4 + metaLen)));
  } catch {
    throw new ContainerError('Métadonnées illisibles.', 'CORRUPT');
  }
  let off = 4 + metaLen;
  const files: UnlockedFile[] = meta.files.map((entry) => {
    const chunk = plain.slice(off, off + entry.size);
    off += entry.size;
    return { entry, blob: new Blob([chunk], { type: entry.type || 'application/octet-stream' }) };
  });
  return { meta, files };
}

/* ---------- Fichier HTML autonome ---------- */

const HTML_MARKER_RE = /<script id="cdns"[^>]*>([\s\S]*?)<\/script>/;

export function extractFromHtml(text: string): Uint8Array<ArrayBuffer> | null {
  const m = HTML_MARKER_RE.exec(text);
  if (!m) return null;
  try {
    const bytes = fromBase64(m[1]);
    return isContainer(bytes) ? bytes : null;
  } catch {
    return null;
  }
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);
}

export function buildStandaloneHtml(container: Uint8Array, title: string): string {
  const b64 = toBase64(container);
  const safeTitle = escapeHtml(title);
  // Le script de déchiffrement est écrit en JS simple, sans template literals,
  // pour être embarqué sans conflit dans ce gabarit.
  const script = [
    '(function(){',
    'var $=function(id){return document.getElementById(id)};',
    'var b64=$("cdns").textContent.replace(/\\s+/g,"");',
    'var bin=atob(b64);var buf=new Uint8Array(bin.length);for(var i=0;i<bin.length;i++)buf[i]=bin.charCodeAt(i);',
    'var dv=new DataView(buf.buffer);',
    'function err(m){$("err").textContent=m;$("err").style.display=m?"block":"none";}',
    'if(!(buf[0]===67&&buf[1]===68&&buf[2]===78&&buf[3]===83)){err("Conteneur invalide.");return;}',
    'var method=buf[5],iterations=dv.getUint32(6),salt=buf.slice(10,26),iv=buf.slice(26,38),hintLen=dv.getUint16(38);',
    'var hint=new TextDecoder().decode(buf.slice(40,40+hintLen));var cipher=buf.slice(40+hintLen);',
    'var names=["Mot de passe","Code PIN","Fichier-clé","Mot de passe + fichier-clé"];',
    'var needPw=method===0||method===1||method===3,needKf=method===2||method===3;',
    '$("method").textContent=names[method]||"Inconnu";',
    '$("size").textContent=fmt(buf.length);',
    'if(hint){$("hint").style.display="block";$("hintText").textContent=hint;}',
    '$("pwWrap").style.display=needPw?"block":"none";$("kfWrap").style.display=needKf?"block":"none";',
    'if(method===1){$("pw").setAttribute("inputmode","numeric");$("pwLabel").textContent="Code PIN";}',
    'function fmt(n){if(n<1024)return n+" o";var u=["Ko","Mo","Go"],v=n/1024,i=0;while(v>=1024&&i<u.length-1){v/=1024;i++;}return v.toFixed(v<10?2:v<100?1:0)+" "+u[i];}',
    'function hex(b){var a=new Uint8Array(b),s="";for(var i=0;i<a.length;i++)s+=(a[i]<16?"0":"")+a[i].toString(16);return s;}',
    'function readKf(){var f=$("kf").files[0];if(!f)return Promise.resolve("");return f.arrayBuffer().then(function(ab){return crypto.subtle.digest("SHA-256",ab)}).then(hex);}',
    'function derive(secret){var enc=new TextEncoder().encode(secret);return crypto.subtle.importKey("raw",enc,"PBKDF2",false,["deriveKey"]).then(function(k){return crypto.subtle.deriveKey({name:"PBKDF2",salt:salt,iterations:iterations,hash:"SHA-256"},k,{name:"AES-GCM",length:256},false,["decrypt"]);});}',
    '$("f").addEventListener("submit",function(e){e.preventDefault();err("");',
    'var pw=$("pw").value;if(needPw&&!pw){err("Saisissez votre secret.");return;}',
    'if(needKf&&!$("kf").files[0]){err("Sélectionnez votre fichier-clé.");return;}',
    '$("btn").disabled=true;$("btn").textContent="Déverrouillage…";',
    'readKf().then(function(kh){var secret=method===0||method===1?pw:method===2?"KF:"+kh:pw+"\\u0000KF:"+kh;return derive(secret);})',
    '.then(function(key){return crypto.subtle.decrypt({name:"AES-GCM",iv:iv},key,cipher);})',
    '.then(function(plain){var p=new Uint8Array(plain),ml=new DataView(plain).getUint32(0),meta=JSON.parse(new TextDecoder().decode(p.slice(4,4+ml)));var off=4+ml;var out=$("out");out.innerHTML="";',
    'meta.files.forEach(function(fe){var chunk=p.slice(off,off+fe.size);off+=fe.size;var blob=new Blob([chunk],{type:fe.type||"application/octet-stream"});var url=URL.createObjectURL(blob);',
    'var row=document.createElement("a");row.className="file";row.href=url;row.download=fe.name;row.innerHTML="<span class=\\"n\\"></span><span class=\\"s\\"></span><span class=\\"d\\">Télécharger ↓</span>";row.querySelector(".n").textContent=fe.path||fe.name;row.querySelector(".s").textContent=fmt(fe.size);out.appendChild(row);});',
    '$("f").style.display="none";$("ok").style.display="block";document.querySelector(".shackle").classList.add("open");$("title").textContent="Déverrouillé";})',
    '.catch(function(){err("Secret incorrect ou fichier altéré.");$("btn").disabled=false;$("btn").textContent="Déverrouiller";});});',
    '})();',
  ].join('\n');

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${safeTitle} — verrouillé avec Cadenas</title>
<style>
:root{color-scheme:dark}
*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0d11;color:#f2f3f5;font:16px/1.5 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;background-image:radial-gradient(60% 50% at 50% 0%,rgba(230,184,92,.12),transparent 70%)}
main{width:min(560px,92vw);padding:2rem 0}
.card{background:#12151b;border:1px solid #252a34;border-radius:20px;padding:2rem;box-shadow:0 30px 80px rgba(0,0,0,.5)}
.lock{display:flex;justify-content:center;margin-bottom:1rem}
.shackle{transition:transform .5s cubic-bezier(.2,.8,.2,1)}
.shackle.open{transform:translateY(-16px)}
h1{font-size:1.6rem;margin:.25rem 0 .5rem;text-align:center;letter-spacing:-.01em}
.meta{display:flex;gap:1rem;justify-content:center;flex-wrap:wrap;color:#8b93a1;font-size:.85rem;margin-bottom:1.25rem}
.meta b{color:#e6b85c;font-weight:600}
.hint{display:none;background:#181c24;border:1px dashed #313848;border-radius:12px;padding:.75rem 1rem;font-size:.9rem;color:#c9ced8;margin-bottom:1rem}
.hint small{display:block;color:#8b93a1;font-size:.75rem;text-transform:uppercase;letter-spacing:.08em;margin-bottom:.2rem}
label{display:block;font-size:.85rem;color:#8b93a1;margin:.75rem 0 .35rem}
input[type=password],input[type=text]{width:100%;padding:.85rem 1rem;border-radius:12px;border:1px solid #313848;background:#0b0d11;color:#fff;font-size:1rem;outline:none}
input:focus{border-color:#e6b85c}
input[type=file]{width:100%;color:#c9ced8;font-size:.9rem}
button{width:100%;margin-top:1.25rem;padding:.95rem;border:0;border-radius:12px;background:#e6b85c;color:#1a1408;font-weight:700;font-size:1rem;cursor:pointer}
button:hover{background:#f0c86f}
button:disabled{opacity:.6;cursor:wait}
.err{display:none;color:#ff6f6f;margin-top:1rem;text-align:center;font-size:.9rem}
#ok{display:none}
.file{display:grid;grid-template-columns:1fr auto auto;gap:1rem;align-items:center;padding:.8rem 1rem;border:1px solid #252a34;border-radius:12px;margin-top:.5rem;text-decoration:none;color:#f2f3f5;background:#0b0d11}
.file:hover{border-color:#e6b85c}
.file .n{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.file .s{color:#8b93a1;font-size:.85rem}
.file .d{color:#e6b85c;font-weight:600;font-size:.85rem}
.ok-title{color:#7fe0b5;text-align:center;font-weight:600;margin:0 0 .5rem}
footer{text-align:center;color:#5d6572;font-size:.75rem;margin-top:1.5rem}
</style>
</head>
<body>
<main>
<div class="card">
<div class="lock">
<svg width="84" height="96" viewBox="0 0 120 140" fill="none">
<path class="shackle" d="M35 62 V42 a25 25 0 0 1 50 0 V62" stroke="#a7adb8" stroke-width="11" stroke-linecap="round"/>
<rect x="18" y="58" width="84" height="66" rx="12" fill="#e6b85c"/>
<circle cx="60" cy="86" r="8" fill="#1a1408"/><rect x="56" y="90" width="8" height="18" rx="3" fill="#1a1408"/>
</svg>
</div>
<h1 id="title">${safeTitle}</h1>
<div class="meta"><span>Protection : <b id="method">…</b></span><span>Taille : <b id="size">…</b></span></div>
<div class="hint" id="hint"><small>Indice</small><span id="hintText"></span></div>
<form id="f" autocomplete="off">
<div id="pwWrap"><label for="pw" id="pwLabel">Mot de passe</label><input id="pw" type="password" autocomplete="off" autofocus></div>
<div id="kfWrap"><label for="kf">Fichier-clé</label><input id="kf" type="file"></div>
<button type="submit" id="btn">Déverrouiller</button>
</form>
<p class="err" id="err"></p>
<div id="ok"><p class="ok-title">Contenu déverrouillé — cliquez pour télécharger</p><div id="out"></div></div>
<footer>Chiffré avec Cadenas · AES-256-GCM · Le déchiffrement s’effectue entièrement dans votre navigateur, rien n’est envoyé.</footer>
</div>
</main>
<script id="cdns" type="text/plain">${b64}</script>
<script>${script}</script>
</body>
</html>`;
}
