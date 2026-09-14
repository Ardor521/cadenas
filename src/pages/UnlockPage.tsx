import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useLocation } from 'react-router-dom';
import { zipSync } from 'fflate';
import { AlertTriangle, Download, Eye, FileArchive, Lightbulb, Loader2, Lock, Unlock, X, Timer, ExternalLink, Vault } from 'lucide-react';
import { Padlock } from '../components/Padlock';
import { Dropzone } from '../components/Dropzone';
import { PasswordField } from '../components/PasswordField';
import { KeyFileInput } from '../components/KeyFileInput';
import { FileIcon } from '../components/FileIcon';
import { METHOD_INFO, buildSecret } from '../lib/crypto';
import { ContainerError, extractFromHtml, isContainer, parseHeader, unlockContainer, type ContainerHeader, type ContainerMeta, type PickedFile, type UnlockedFile } from '../lib/container';
import { getVaultData } from '../lib/db';
import { downloadBlob, fileKind, formatBytes, formatDate } from '../lib/format';

interface Source {
  bytes: Uint8Array<ArrayBuffer>;
  name: string;
  header: ContainerHeader;
  fromVault?: boolean;
}

const AUTO_CLEAR_S = 10 * 60;

function Preview({ file, onClose }: { file: UnlockedFile; onClose: () => void }) {
  const kind = fileKind(file.entry.type, file.entry.name);
  const url = useMemo(() => URL.createObjectURL(file.blob), [file]);
  const [text, setText] = useState<string | null>(null);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  useEffect(() => {
    if (kind === 'text') file.blob.slice(0, 20000).text().then(setText);
  }, [file, kind]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-ink/90 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 10 }}
        animate={{ scale: 1, y: 0 }}
        className="card w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-line">
          <FileIcon type={file.entry.type} name={file.entry.name} className="size-4 text-brass" />
          <p className="truncate flex-1 text-sm font-medium">{file.entry.path}</p>
          <span className="text-xs font-mono text-muted">{formatBytes(file.entry.size)}</span>
          <button onClick={() => downloadBlob(file.blob, file.entry.name)} className="p-2 rounded-lg text-muted hover:text-fg hover:bg-panel-3" title="Télécharger">
            <Download className="size-4" />
          </button>
          <button onClick={onClose} className="p-2 rounded-lg text-muted hover:text-fg hover:bg-panel-3" title="Fermer">
            <X className="size-4" />
          </button>
        </div>
        <div className="flex-1 overflow-auto scrollbar-thin bg-ink/60 grid place-items-center min-h-[300px]">
          {kind === 'image' && <img src={url} alt={file.entry.name} className="max-w-full max-h-[75vh] object-contain" />}
          {kind === 'video' && <video src={url} controls className="max-w-full max-h-[75vh]" />}
          {kind === 'audio' && <audio src={url} controls className="w-full max-w-md" />}
          {kind === 'pdf' && <iframe src={url} title={file.entry.name} className="w-full h-[75vh] bg-white" />}
          {kind === 'text' && (
            <pre className="w-full p-5 text-xs font-mono whitespace-pre-wrap break-words text-fg-2 self-start">{text ?? 'Chargement…'}</pre>
          )}
          {(kind === 'archive' || kind === 'other') && (
            <div className="text-center p-8">
              <FileIcon type={file.entry.type} name={file.entry.name} className="size-12 text-muted mx-auto" />
              <p className="text-muted mt-3 text-sm">Aperçu indisponible pour ce type de fichier.</p>
              <button onClick={() => downloadBlob(file.blob, file.entry.name)} className="btn btn-primary mt-4">
                <Download className="size-4" /> Télécharger
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

export function UnlockPage() {
  const location = useLocation();
  const vaultId = (location.state as { vaultId?: string } | null)?.vaultId;

  const [source, setSource] = useState<Source | null>(null);
  const [loadError, setLoadError] = useState('');
  const [password, setPassword] = useState('');
  const [key, setKey] = useState<{ hash: string | null }>({ hash: null });
  const [phase, setPhase] = useState<'idle' | 'working' | 'error'>('idle');
  const [step, setStep] = useState('');
  const [error, setError] = useState('');
  const [opened, setOpened] = useState<{ meta: ContainerMeta; files: UnlockedFile[] } | null>(null);
  const [preview, setPreview] = useState<UnlockedFile | null>(null);
  const [remaining, setRemaining] = useState(AUTO_CLEAR_S);

  const loadBytes = useCallback((bytes: Uint8Array<ArrayBuffer>, name: string, fromVault = false) => {
    try {
      const header = parseHeader(bytes);
      setSource({ bytes, name, header, fromVault });
      setLoadError('');
      setError('');
      setPassword('');
      setKey({ hash: null });
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Fichier illisible.');
    }
  }, []);

  const onFiles = async (files: PickedFile[]) => {
    const f = files[0].file;
    const buf = new Uint8Array(await f.arrayBuffer());
    if (isContainer(buf)) return loadBytes(buf, f.name);
    const fromHtml = extractFromHtml(new TextDecoder().decode(buf));
    if (fromHtml) return loadBytes(fromHtml, f.name);
    setLoadError('Ce fichier n’est ni un conteneur .cadenas ni un fichier HTML autonome Cadenas.');
  };

  useEffect(() => {
    if (!vaultId) return;
    getVaultData(vaultId).then((r) => {
      if (r) loadBytes(r.bytes, r.item.name, true);
      else setLoadError('Élément introuvable dans le coffre.');
    });
  }, [vaultId, loadBytes]);

  const closeAll = useCallback(() => {
    setOpened(null);
    setPreview(null);
    setPassword('');
    setKey({ hash: null });
    setRemaining(AUTO_CLEAR_S);
  }, []);

  useEffect(() => {
    if (!opened) return;
    setRemaining(AUTO_CLEAR_S);
    const t = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          clearInterval(t);
          closeAll();
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [opened, closeAll]);

  const info = source ? METHOD_INFO[source.header.method] : null;
  const canUnlock = !!source && (!info?.needsPassword || password.length > 0) && (!info?.needsKeyfile || !!key.hash) && phase !== 'working';

  const unlock = async () => {
    if (!source || !canUnlock) return;
    setPhase('working');
    setError('');
    try {
      const secret = buildSecret(source.header.method, { password, keyfileHash: key.hash ?? undefined });
      const res = await unlockContainer(source.bytes, secret, setStep);
      setOpened(res);
      setPhase('idle');
    } catch (e) {
      setError(e instanceof ContainerError ? e.message : 'Erreur inattendue lors du déchiffrement.');
      setPhase('error');
    }
  };

  const downloadAll = async () => {
    if (!opened) return;
    if (opened.files.length === 1) return downloadBlob(opened.files[0].blob, opened.files[0].entry.name);
    const entries: Record<string, Uint8Array> = {};
    for (const f of opened.files) entries[f.entry.path || f.entry.name] = new Uint8Array(await f.blob.arrayBuffer());
    const zipped = zipSync(entries, { level: 0 });
    downloadBlob(new Blob([zipped as BlobPart], { type: 'application/zip' }), `${(source?.name ?? 'archive').replace(/\.(cadenas|html)$/i, '')}.zip`);
  };

  const totalSize = opened?.files.reduce((a, f) => a + f.entry.size, 0) ?? 0;
  const mm = String(Math.floor(remaining / 60)).padStart(2, '0');
  const ss = String(remaining % 60).padStart(2, '0');

  return (
    <div className="mx-auto max-w-4xl px-4 sm:px-6 pt-12 sm:pt-16">
      <div className="text-center mb-10">
        <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="flex justify-center mb-5">
          <Padlock locked={!opened} size={120} />
        </motion.div>
        <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="font-display font-extrabold text-4xl sm:text-5xl tracking-tight">
          {opened ? 'Déverrouillé' : 'Ouvrir un fichier verrouillé'}
        </motion.h1>
        <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }} className="text-muted mt-3 max-w-xl mx-auto">
          {opened
            ? 'Le contenu est déchiffré en mémoire uniquement. Il sera effacé automatiquement.'
            : 'Déposez un conteneur .cadenas ou un fichier HTML autonome, puis saisissez votre secret.'}
        </motion.p>
      </div>

      <AnimatePresence mode="wait">
        {opened ? (
          <motion.div key="opened" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="card shadow-deep overflow-hidden">
            <div className="flex flex-wrap items-center gap-3 px-5 py-4 border-b border-line bg-panel-2/60">
              <p className="text-sm">
                <span className="font-semibold">{opened.files.length}</span> fichier{opened.files.length > 1 ? 's' : ''}
                <span className="text-muted"> · {formatBytes(totalSize)}</span>
                <span className="text-muted hidden sm:inline"> · verrouillé le {formatDate(opened.meta.createdAt)}</span>
              </p>
              <div className="ml-auto flex items-center gap-2">
                <span className={`chip ${remaining < 60 ? 'text-danger border-danger/40' : ''}`}>
                  <Timer className="size-3" /> {mm}:{ss}
                </span>
                <button onClick={downloadAll} className="btn btn-primary py-2 text-sm">
                  {opened.files.length > 1 ? <FileArchive className="size-4" /> : <Download className="size-4" />}
                  {opened.files.length > 1 ? 'Tout télécharger (.zip)' : 'Télécharger'}
                </button>
                <button onClick={closeAll} className="btn btn-ghost py-2 text-sm">
                  <Lock className="size-4" /> Refermer
                </button>
              </div>
            </div>
            <ul className="divide-y divide-line/60 max-h-[60vh] overflow-y-auto scrollbar-thin">
              {opened.files.map((f, i) => {
                const kind = fileKind(f.entry.type, f.entry.name);
                const previewable = kind !== 'other' && kind !== 'archive';
                return (
                  <motion.li
                    key={f.entry.path + i}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(i * 0.03, 0.5) }}
                    className="flex items-center gap-3 px-5 py-3 hover:bg-panel-2/50"
                  >
                    <span className="grid place-items-center size-9 rounded-lg bg-brass/10 text-brass shrink-0">
                      <FileIcon type={f.entry.type} name={f.entry.name} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{f.entry.path}</p>
                      <p className="text-xs text-muted font-mono">
                        {formatBytes(f.entry.size)} · {f.entry.type || 'inconnu'}
                      </p>
                    </div>
                    {previewable && (
                      <button onClick={() => setPreview(f)} className="p-2 rounded-lg text-muted hover:text-fg hover:bg-panel-3" title="Aperçu">
                        <Eye className="size-4" />
                      </button>
                    )}
                    <button
                      onClick={() => window.open(URL.createObjectURL(f.blob), '_blank', 'noopener')}
                      className="p-2 rounded-lg text-muted hover:text-fg hover:bg-panel-3 hidden sm:block"
                      title="Ouvrir dans un onglet"
                    >
                      <ExternalLink className="size-4" />
                    </button>
                    <button onClick={() => downloadBlob(f.blob, f.entry.name)} className="p-2 rounded-lg text-brass hover:bg-brass/10" title="Télécharger">
                      <Download className="size-4" />
                    </button>
                  </motion.li>
                );
              })}
            </ul>
          </motion.div>
        ) : (
          <motion.div key="locked" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="card p-5 sm:p-8 shadow-deep">
            {!source ? (
              <>
                <Dropzone onFiles={onFiles} multiple={false} accept=".cadenas,.html" title="Déposez un fichier .cadenas ou .html" subtitle="ou cliquez pour le sélectionner" />
                {loadError && (
                  <p className="mt-4 text-sm text-danger flex items-center gap-1.5">
                    <AlertTriangle className="size-4" /> {loadError}
                  </p>
                )}
                <p className="mt-5 text-sm text-muted text-center">
                  Vos conteneurs sauvegardés se trouvent dans{' '}
                  <Link to="/coffre" className="text-brass hover:underline inline-flex items-center gap-1">
                    <Vault className="size-3.5" /> votre coffre
                  </Link>
                  .
                </p>
              </>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void unlock();
                }}
                className="space-y-6"
              >
                <div className="flex items-start gap-4 rounded-2xl border border-line bg-ink/40 p-4">
                  <div className="grid place-items-center size-11 rounded-xl bg-brass/10 text-brass shrink-0">
                    <Lock className="size-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{source.name}</p>
                    <p className="text-xs text-muted font-mono mt-0.5">
                      {formatBytes(source.header.totalSize)} · {info?.label} · PBKDF2 × {source.header.iterations.toLocaleString('fr-FR')}
                      {source.fromVault && ' · depuis le coffre'}
                    </p>
                    {source.header.hint && (
                      <p className="mt-3 text-sm flex items-start gap-2 rounded-xl border border-dashed border-line-2 bg-panel-2/60 px-3 py-2">
                        <Lightbulb className="size-4 text-brass shrink-0 mt-0.5" />
                        <span>
                          <span className="text-muted text-xs uppercase tracking-wider block">Indice</span>
                          {source.header.hint}
                        </span>
                      </p>
                    )}
                  </div>
                  <button type="button" onClick={() => setSource(null)} className="p-2 rounded-lg text-muted hover:text-fg hover:bg-panel-3" title="Changer de fichier">
                    <X className="size-4" />
                  </button>
                </div>

                {info?.needsPassword && (
                  <PasswordField
                    id="unlock-pw"
                    label={source.header.method === 'pin' ? 'Code PIN' : 'Mot de passe'}
                    mode={source.header.method === 'pin' ? 'pin' : 'password'}
                    value={password}
                    onChange={setPassword}
                    placeholder={source.header.method === 'pin' ? '••••••' : 'Votre mot de passe'}
                    autoFocus
                  />
                )}
                {info?.needsKeyfile && (
                  <div>
                    <p className="text-sm text-muted mb-1.5">Fichier-clé</p>
                    <KeyFileInput mode="use" onChange={(s) => setKey({ hash: s.hash })} />
                  </div>
                )}

                <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                  <button type="submit" disabled={!canUnlock} className="btn btn-primary text-base px-7 py-4">
                    {phase === 'working' ? <Loader2 className="size-5 animate-spin" /> : <Unlock className="size-5" />}
                    {phase === 'working' ? step || 'Déverrouillage…' : 'Déverrouiller'}
                  </button>
                  {phase === 'error' && (
                    <motion.p initial={{ x: -6 }} animate={{ x: 0 }} className="text-sm text-danger flex items-center gap-1.5">
                      <AlertTriangle className="size-4 shrink-0" /> {error}
                    </motion.p>
                  )}
                </div>
              </form>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>{preview && <Preview file={preview} onClose={() => setPreview(null)} />}</AnimatePresence>
    </div>
  );
}
