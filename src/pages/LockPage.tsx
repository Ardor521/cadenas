import { useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ArrowRight, Check, Download, FileCode2, FolderLock, Lock, Loader2, Plus, RotateCcw, Trash2, Vault, X, AlertTriangle, Lightbulb, Package } from 'lucide-react';
import { Padlock } from '../components/Padlock';
import { Dropzone } from '../components/Dropzone';
import { MethodSelector } from '../components/MethodSelector';
import { PasswordField } from '../components/PasswordField';
import { KeyFileInput } from '../components/KeyFileInput';
import { FileIcon } from '../components/FileIcon';
import { METHOD_INFO, buildSecret, iterationsFor, passwordStrength, type Method } from '../lib/crypto';
import { buildStandaloneHtml, lockFiles, type PickedFile } from '../lib/container';
import { addToVault } from '../lib/db';
import { downloadBlob, formatBytes, stripExt } from '../lib/format';

type Phase = 'idle' | 'working' | 'done' | 'error';
type OutFormat = 'cadenas' | 'html';

const MAX_WARN = 300 * 1024 * 1024;

function Step({ n, title, children, done }: { n: number; title: string; children: React.ReactNode; done?: boolean }) {
  return (
    <section className="grid md:grid-cols-[56px_1fr] gap-4 md:gap-6">
      <div className="flex md:flex-col items-center gap-3">
        <div
          className={`grid place-items-center size-10 rounded-full border font-display font-bold transition-colors ${
            done ? 'bg-mint/15 border-mint/40 text-mint' : 'border-line-2 text-brass'
          }`}
        >
          {done ? <Check className="size-4" /> : n}
        </div>
        <div className="hidden md:block flex-1 w-px bg-gradient-to-b from-line-2 to-transparent" />
        <h2 className="md:hidden font-display font-bold text-lg">{title}</h2>
      </div>
      <div className="pb-10">
        <h2 className="hidden md:block font-display font-bold text-lg mb-4">{title}</h2>
        {children}
      </div>
    </section>
  );
}

export function LockPage() {
  const [picked, setPicked] = useState<PickedFile[]>([]);
  const [method, setMethod] = useState<Method>('password');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [key, setKey] = useState<{ hash: string | null; name: string | null; downloaded: boolean }>({ hash: null, name: null, downloaded: false });
  const [hint, setHint] = useState('');
  const [format, setFormat] = useState<OutFormat>('cadenas');
  const [customName, setCustomName] = useState('');
  const [phase, setPhase] = useState<Phase>('idle');
  const [step, setStep] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ container: Uint8Array<ArrayBuffer>; output: Blob; name: string; fileCount: number } | null>(null);
  const [vaultState, setVaultState] = useState<'idle' | 'saving' | 'saved'>('idle');

  const info = METHOD_INFO[method];
  const totalSize = useMemo(() => picked.reduce((a, p) => a + p.file.size, 0), [picked]);
  const isFolder = picked.some((p) => p.path.includes('/'));
  const folderName = isFolder ? picked[0].path.split('/')[0] : '';

  const defaultName = useMemo(() => {
    if (!picked.length) return 'archive';
    if (isFolder) return folderName;
    if (picked.length === 1) return stripExt(picked[0].file.name);
    return `archive-${new Date().toISOString().slice(0, 10)}`;
  }, [picked, isFolder, folderName]);

  const baseName = (customName.trim() || defaultName).replace(/[\\/:*?"<>|]/g, '_');
  const outName = `${baseName}.${format === 'html' ? 'html' : 'cadenas'}`;

  /* ---- validation ---- */
  const pwProblems: string[] = [];
  if (info.needsPassword) {
    if (method === 'pin') {
      if (password.length < 4) pwProblems.push('Le code PIN doit contenir au moins 4 chiffres.');
    } else if (password.length < 8) pwProblems.push('Le mot de passe doit contenir au moins 8 caractères.');
    if (password && confirm && password !== confirm) pwProblems.push('Les deux saisies ne correspondent pas.');
    if (password && !confirm) pwProblems.push('Confirmez votre saisie.');
  }
  const keyProblems: string[] = [];
  if (info.needsKeyfile) {
    if (!key.hash) keyProblems.push('Générez ou importez un fichier-clé.');
    else if (!key.downloaded) keyProblems.push('Téléchargez votre fichier-clé avant de continuer.');
  }
  const protectionOk = pwProblems.length === 0 && keyProblems.length === 0 && (info.needsPassword ? password.length > 0 : true);
  const canLock = picked.length > 0 && protectionOk && phase !== 'working';
  const weak = method === 'password' && password.length >= 8 && passwordStrength(password).score <= 1;

  const addFiles = (files: PickedFile[]) => {
    setPicked((prev) => {
      const seen = new Set(prev.map((p) => p.path + p.file.size));
      return [...prev, ...files.filter((f) => !seen.has(f.path + f.file.size))];
    });
  };

  const reset = () => {
    setPicked([]);
    setPassword('');
    setConfirm('');
    setKey({ hash: null, name: null, downloaded: false });
    setHint('');
    setCustomName('');
    setResult(null);
    setPhase('idle');
    setError('');
    setVaultState('idle');
  };

  const lock = async () => {
    if (!canLock) return;
    setPhase('working');
    setError('');
    try {
      const secret = buildSecret(method, { password, keyfileHash: key.hash ?? undefined });
      const { bytes } = await lockFiles(picked, { method, secret, hint, iterations: iterationsFor(method), onStep: setStep });
      let output: Blob;
      if (format === 'html') {
        setStep('Génération du fichier HTML autonome');
        output = new Blob([buildStandaloneHtml(bytes, baseName)], { type: 'text/html' });
      } else {
        output = new Blob([bytes], { type: 'application/octet-stream' });
      }
      setResult({ container: bytes, output, name: outName, fileCount: picked.length });
      setPhase('done');
      setPassword('');
      setConfirm('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Une erreur inattendue est survenue.');
      setPhase('error');
    }
  };

  const saveToVault = async () => {
    if (!result) return;
    setVaultState('saving');
    await addToVault(`${baseName}.cadenas`, result.container, { method, hint, fileCount: result.fileCount });
    setVaultState('saved');
  };

  return (
    <div className="mx-auto max-w-6xl px-4 sm:px-6">
      {/* HERO */}
      <section className="pt-14 sm:pt-20 pb-12 grid lg:grid-cols-[1.2fr_1fr] gap-10 items-center">
        <div>
          <motion.p initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="chip text-brass border-brass/30">
            <Lock className="size-3" /> Chiffrement local · zéro serveur
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="font-display font-extrabold text-4xl sm:text-5xl lg:text-6xl leading-[1.02] tracking-tight mt-5"
          >
            Verrouillez <span className="shimmer-text">n’importe quel</span> fichier ou dossier.
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }} className="text-fg-2 text-lg mt-5 max-w-xl leading-relaxed">
            Photos, PDF, contrats, dossiers entiers : ils deviennent illisibles sans votre mot de passe, votre code PIN ou votre fichier-clé.
            Tout se passe dans votre navigateur — rien n’est envoyé, rien n’est stocké ailleurs.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="flex flex-wrap gap-3 mt-7">
            <a href="#verrouiller" className="btn btn-primary">
              Verrouiller un fichier <ArrowRight className="size-4" />
            </a>
            <Link to="/ouvrir" className="btn btn-ghost">
              J’ai un fichier .cadenas à ouvrir
            </Link>
          </motion.div>
          <motion.dl initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }} className="grid grid-cols-3 gap-4 mt-10 max-w-lg">
            {[
              ['AES-256', 'GCM authentifié'],
              ['600 000', 'itérations PBKDF2'],
              ['100 %', 'hors ligne'],
            ].map(([v, l]) => (
              <div key={l} className="border-l border-line-2 pl-3">
                <dt className="font-display font-bold text-xl text-brass">{v}</dt>
                <dd className="text-xs text-muted mt-0.5">{l}</dd>
              </div>
            ))}
          </motion.dl>
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.15, type: 'spring', stiffness: 120 }}
          className="relative hidden lg:flex justify-center"
        >
          <div className="absolute inset-0 blur-3xl bg-brass/15 rounded-full scale-75" />
          <div className="animate-float relative">
            <Padlock locked={phase !== 'done'} size={260} />
          </div>
        </motion.div>
      </section>

      {/* WORKFLOW */}
      <section id="verrouiller" className="card p-5 sm:p-8 lg:p-10 shadow-deep scroll-mt-24">
        <AnimatePresence mode="wait">
          {phase === 'done' && result ? (
            <motion.div key="done" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-center py-6">
              <div className="flex justify-center mb-4">
                <Padlock locked size={110} />
              </div>
              <p className="chip text-mint border-mint/30 mx-auto">
                <Check className="size-3" /> Verrouillé avec succès
              </p>
              <h2 className="font-display font-extrabold text-3xl mt-4">Votre conteneur est prêt</h2>
              <p className="text-muted mt-2 max-w-lg mx-auto">
                {result.fileCount} fichier{result.fileCount > 1 ? 's' : ''} · {formatBytes(result.output.size)} · protection : {METHOD_INFO[method].label}
              </p>
              <div className="mt-6 inline-flex items-center gap-3 rounded-2xl border border-line bg-ink/60 px-4 py-3 font-mono text-sm">
                {format === 'html' ? <FileCode2 className="size-4 text-brass" /> : <FolderLock className="size-4 text-brass" />}
                {result.name}
              </div>
              <div className="flex flex-col sm:flex-row gap-3 justify-center mt-7">
                <button onClick={() => downloadBlob(result.output, result.name)} className="btn btn-primary">
                  <Download className="size-4" /> Télécharger
                </button>
                <button onClick={saveToVault} disabled={vaultState !== 'idle'} className="btn btn-ghost">
                  {vaultState === 'saved' ? <Check className="size-4 text-mint" /> : vaultState === 'saving' ? <Loader2 className="size-4 animate-spin" /> : <Vault className="size-4" />}
                  {vaultState === 'saved' ? 'Ajouté au coffre' : 'Garder dans mon coffre'}
                </button>
                <button onClick={reset} className="btn btn-ghost">
                  <RotateCcw className="size-4" /> Verrouiller autre chose
                </button>
              </div>
              <div className="mt-8 mx-auto max-w-xl rounded-2xl border border-amber/30 bg-amber/5 p-4 text-left flex gap-3">
                <AlertTriangle className="size-5 text-amber shrink-0 mt-0.5" />
                <p className="text-sm text-fg-2">
                  <span className="font-semibold text-amber">Aucune récupération possible.</span> Si vous perdez votre{' '}
                  {info.needsPassword && info.needsKeyfile ? 'mot de passe ou votre fichier-clé' : info.needsKeyfile ? 'fichier-clé' : method === 'pin' ? 'code PIN' : 'mot de passe'}, le contenu est
                  définitivement perdu. Personne — pas même nous — ne peut le déchiffrer.
                </p>
              </div>
            </motion.div>
          ) : (
            <motion.div key="form" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              {/* STEP 1 */}
              <Step n={1} title="Choisissez vos fichiers" done={picked.length > 0}>
                {picked.length === 0 ? (
                  <Dropzone
                    onFiles={addFiles}
                    allowFolder
                    title="Déposez des fichiers ici"
                    subtitle="ou cliquez pour parcourir — tout type de fichier, plusieurs à la fois"
                  />
                ) : (
                  <div className="rounded-2xl border border-line bg-ink/40 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-line bg-panel-2/60">
                      <p className="text-sm">
                        <span className="font-semibold">{picked.length}</span> fichier{picked.length > 1 ? 's' : ''}
                        {isFolder && (
                          <span className="text-muted">
                            {' '}
                            · dossier <span className="font-mono text-brass">{folderName}/</span>
                          </span>
                        )}
                        <span className="text-muted"> · {formatBytes(totalSize)}</span>
                      </p>
                      <button onClick={() => setPicked([])} className="text-xs text-muted hover:text-danger flex items-center gap-1">
                        <Trash2 className="size-3.5" /> Tout retirer
                      </button>
                    </div>
                    <ul className="max-h-64 overflow-y-auto scrollbar-thin divide-y divide-line/60">
                      {picked.map((p, i) => (
                        <li key={p.path + i} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                          <span className="text-brass shrink-0">
                            <FileIcon type={p.file.type} name={p.file.name} />
                          </span>
                          <span className="truncate flex-1" title={p.path}>
                            {p.path}
                          </span>
                          <span className="text-muted font-mono text-xs shrink-0">{formatBytes(p.file.size)}</span>
                          <button
                            onClick={() => setPicked((prev) => prev.filter((_, j) => j !== i))}
                            className="p-1 rounded text-muted hover:text-danger"
                            title="Retirer"
                          >
                            <X className="size-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                    <div className="p-3 border-t border-line">
                      <Dropzone onFiles={addFiles} allowFolder compact title="Ajouter d’autres fichiers" />
                    </div>
                  </div>
                )}
                {totalSize > MAX_WARN && (
                  <p className="mt-3 text-xs text-amber flex items-center gap-1.5">
                    <AlertTriangle className="size-3.5" /> Volume important ({formatBytes(totalSize)}) : le chiffrement se fait en mémoire, cela peut être lent.
                  </p>
                )}
              </Step>

              {/* STEP 2 */}
              <Step n={2} title="Choisissez la protection" done={protectionOk}>
                <MethodSelector
                  value={method}
                  onChange={(m) => {
                    setMethod(m);
                    setPassword('');
                    setConfirm('');
                  }}
                />
                <div className="mt-5 grid gap-4">
                  {info.needsPassword && (
                    <div className="grid sm:grid-cols-2 gap-4">
                      <PasswordField
                        id="pw"
                        label={method === 'pin' ? 'Code PIN (4 à 12 chiffres)' : 'Mot de passe'}
                        mode={method === 'pin' ? 'pin' : 'password'}
                        value={password}
                        onChange={setPassword}
                        placeholder={method === 'pin' ? '••••••' : 'Une phrase longue et unique…'}
                        showStrength
                        allowGenerate
                      />
                      <PasswordField
                        id="pw2"
                        label="Confirmation"
                        mode={method === 'pin' ? 'pin' : 'password'}
                        value={confirm}
                        onChange={setConfirm}
                        placeholder="Saisissez à nouveau"
                      />
                    </div>
                  )}
                  {info.needsKeyfile && (
                    <div>
                      <p className="text-sm text-muted mb-1.5">Fichier-clé</p>
                      <KeyFileInput mode="create" onChange={setKey} />
                    </div>
                  )}
                  {(pwProblems.length > 0 || keyProblems.length > 0) && (password || confirm || key.hash) && (
                    <ul className="text-xs text-amber space-y-1">
                      {[...pwProblems, ...keyProblems].map((p) => (
                        <li key={p} className="flex items-center gap-1.5">
                          <AlertTriangle className="size-3" /> {p}
                        </li>
                      ))}
                    </ul>
                  )}
                  {weak && (
                    <p className="text-xs text-amber flex items-center gap-1.5">
                      <AlertTriangle className="size-3" /> Ce mot de passe est faible. Préférez une phrase de 4 mots ou plus, ou utilisez le générateur.
                    </p>
                  )}
                </div>
              </Step>

              {/* STEP 3 */}
              <Step n={3} title="Options">
                <div className="grid lg:grid-cols-2 gap-5">
                  <div>
                    <label htmlFor="hint" className="block text-sm text-muted mb-1.5">
                      <Lightbulb className="inline size-3.5 mr-1 -mt-0.5" />
                      Indice (facultatif, visible sans déverrouiller)
                    </label>
                    <input id="hint" className="input" value={hint} onChange={(e) => setHint(e.target.value.slice(0, 240))} placeholder="Ex. : le nom de mon premier chat + année" />
                    <label htmlFor="outname" className="block text-sm text-muted mb-1.5 mt-4">
                      Nom du fichier de sortie
                    </label>
                    <div className="flex items-center">
                      <input id="outname" className="input rounded-r-none" value={customName} onChange={(e) => setCustomName(e.target.value)} placeholder={defaultName} />
                      <span className="font-mono text-sm text-brass border border-l-0 border-line-2 rounded-r-[0.85rem] px-3 py-[0.9rem] bg-panel-2">
                        .{format === 'html' ? 'html' : 'cadenas'}
                      </span>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm text-muted mb-1.5">Format de sortie</p>
                    <div className="grid gap-2">
                      {(
                        [
                          {
                            v: 'cadenas',
                            icon: Package,
                            t: 'Conteneur .cadenas',
                            d: 'Compact. S’ouvre depuis cette application (onglet « Ouvrir »).',
                          },
                          {
                            v: 'html',
                            icon: FileCode2,
                            t: 'Fichier HTML autonome',
                            d: 'S’ouvre dans n’importe quel navigateur, même sans cette application. Idéal pour partager.',
                          },
                        ] as const
                      ).map((o) => (
                        <button
                          key={o.v}
                          type="button"
                          onClick={() => setFormat(o.v)}
                          className={`flex items-start gap-3 text-left rounded-2xl border p-3.5 transition-colors ${
                            format === o.v ? 'border-brass bg-brass/10' : 'border-line bg-ink/40 hover:border-line-2'
                          }`}
                        >
                          <o.icon className={`size-5 mt-0.5 shrink-0 ${format === o.v ? 'text-brass' : 'text-muted'}`} />
                          <span>
                            <span className="block font-semibold text-sm">{o.t}</span>
                            <span className="block text-xs text-muted mt-0.5">{o.d}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </Step>

              {/* ACTION */}
              <div className="md:pl-[80px] flex flex-col sm:flex-row sm:items-center gap-4">
                <button onClick={lock} disabled={!canLock} className="btn btn-primary text-base px-7 py-4">
                  {phase === 'working' ? <Loader2 className="size-5 animate-spin" /> : <Lock className="size-5" />}
                  {phase === 'working' ? step || 'Verrouillage…' : 'Verrouiller maintenant'}
                </button>
                {!canLock && phase !== 'working' && (
                  <p className="text-sm text-muted">
                    {picked.length === 0 ? 'Ajoutez au moins un fichier.' : !protectionOk ? 'Complétez la protection à l’étape 2.' : ''}
                  </p>
                )}
                {phase === 'error' && (
                  <p className="text-sm text-danger flex items-center gap-1.5">
                    <AlertTriangle className="size-4" /> {error}
                  </p>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>

      {/* FEATURES */}
      <section className="mt-20 grid md:grid-cols-3 gap-5">
        {[
          {
            icon: FolderLock,
            t: 'Fichiers et dossiers entiers',
            d: 'Glissez un dossier complet : l’arborescence est conservée dans un seul conteneur chiffré.',
          },
          {
            icon: FileCode2,
            t: 'Partage sans installation',
            d: 'Le format HTML autonome embarque son propre déchiffreur. Le destinataire n’a besoin que d’un navigateur.',
          },
          {
            icon: Plus,
            t: 'Trois façons de verrouiller',
            d: 'Mot de passe, code PIN, fichier-clé — ou combinez mot de passe et fichier-clé pour un double verrou.',
          },
        ].map((f, i) => (
          <motion.div
            key={f.t}
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ delay: i * 0.08 }}
            className="card p-6"
          >
            <div className="grid place-items-center size-11 rounded-xl bg-brass/10 text-brass">
              <f.icon className="size-5" />
            </div>
            <h3 className="font-display font-bold text-lg mt-4">{f.t}</h3>
            <p className="text-sm text-muted mt-2 leading-relaxed">{f.d}</p>
          </motion.div>
        ))}
      </section>
    </div>
  );
}
