import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Link, useNavigate } from 'react-router-dom';
import { Download, Lightbulb, Lock, Plus, Trash2, Unlock, Vault, HardDrive, Pencil, Check, X } from 'lucide-react';
import { Dropzone } from '../components/Dropzone';
import { METHOD_INFO } from '../lib/crypto';
import { addToVault, getVaultData, listVault, removeFromVault, renameVaultItem, type VaultItem } from '../lib/db';
import { extractFromHtml, isContainer, parseHeader, type PickedFile } from '../lib/container';
import { downloadBlob, formatBytes, formatDate } from '../lib/format';

export function VaultPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<VaultItem[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  const refresh = () => listVault().then(setItems);
  useEffect(() => {
    void refresh();
  }, []);

  const onImport = async (files: PickedFile[]) => {
    setImportError('');
    let failed = 0;
    for (const { file } of files) {
      try {
        let bytes = new Uint8Array(await file.arrayBuffer());
        if (!isContainer(bytes)) {
          const html = extractFromHtml(new TextDecoder().decode(bytes));
          if (!html) throw new Error('invalid');
          bytes = html;
        }
        const header = parseHeader(bytes);
        await addToVault(file.name.replace(/\.html$/i, '.cadenas'), bytes, { method: header.method, hint: header.hint, fileCount: null });
      } catch {
        failed++;
      }
    }
    if (failed) setImportError(`${failed} fichier${failed > 1 ? 's' : ''} ignoré${failed > 1 ? 's' : ''} : format non reconnu.`);
    setImporting(false);
    void refresh();
  };

  const download = async (item: VaultItem) => {
    const r = await getVaultData(item.id);
    if (r) downloadBlob(new Blob([r.bytes], { type: 'application/octet-stream' }), item.name);
  };

  const remove = async (id: string) => {
    await removeFromVault(id);
    setConfirmId(null);
    void refresh();
  };

  const rename = async () => {
    if (!editing) return;
    const name = editing.name.trim();
    if (name) await renameVaultItem(editing.id, name.endsWith('.cadenas') ? name : `${name}.cadenas`);
    setEditing(null);
    void refresh();
  };

  const total = items?.reduce((a, i) => a + i.size, 0) ?? 0;

  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 pt-12 sm:pt-16">
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6 mb-8">
        <div>
          <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="chip text-brass border-brass/30">
            <HardDrive className="size-3" /> Stocké dans ce navigateur
          </motion.p>
          <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="font-display font-extrabold text-4xl sm:text-5xl tracking-tight mt-4">
            Mon coffre
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }} className="text-muted mt-3 max-w-xl">
            Vos conteneurs restent chiffrés, enregistrés localement (IndexedDB). Ils ne peuvent être ouverts qu’avec leur secret.
          </motion.p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setImporting((v) => !v)} className="btn btn-ghost">
            <Plus className="size-4" /> Importer
          </button>
          <Link to="/" className="btn btn-primary">
            <Lock className="size-4" /> Verrouiller
          </Link>
        </div>
      </div>

      <AnimatePresence>
        {importing && (
          <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="overflow-hidden mb-6">
            <Dropzone onFiles={onImport} accept=".cadenas,.html" compact title="Déposez des fichiers .cadenas ou .html" subtitle="Ils seront ajoutés au coffre tels quels, toujours chiffrés" />
          </motion.div>
        )}
      </AnimatePresence>
      {importError && <p className="text-sm text-danger mb-4">{importError}</p>}

      {items === null ? (
        <div className="card p-12 text-center text-muted">Chargement du coffre…</div>
      ) : items.length === 0 ? (
        <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="card p-12 sm:p-16 text-center shadow-deep">
          <div className="grid place-items-center size-16 rounded-2xl bg-brass/10 text-brass mx-auto">
            <Vault className="size-8" />
          </div>
          <h2 className="font-display font-bold text-2xl mt-5">Le coffre est vide</h2>
          <p className="text-muted mt-2 max-w-md mx-auto">
            Verrouillez un fichier puis choisissez « Garder dans mon coffre », ou importez un conteneur existant.
          </p>
          <div className="flex justify-center gap-3 mt-6">
            <Link to="/" className="btn btn-primary">
              <Lock className="size-4" /> Verrouiller un fichier
            </Link>
            <button onClick={() => setImporting(true)} className="btn btn-ghost">
              <Plus className="size-4" /> Importer
            </button>
          </div>
        </motion.div>
      ) : (
        <>
          <p className="text-xs font-mono text-muted mb-3">
            {items.length} conteneur{items.length > 1 ? 's' : ''} · {formatBytes(total)}
          </p>
          <ul className="grid gap-3">
            {items.map((item, i) => (
              <motion.li
                key={item.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i * 0.05, 0.4) }}
                className="card p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center gap-4"
              >
                <div className="grid place-items-center size-12 rounded-xl bg-brass/10 text-brass shrink-0">
                  <Lock className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  {editing?.id === item.id ? (
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        className="input py-2 text-sm"
                        value={editing.name}
                        onChange={(e) => setEditing({ id: item.id, name: e.target.value })}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') void rename();
                          if (e.key === 'Escape') setEditing(null);
                        }}
                      />
                      <button onClick={rename} className="p-2 text-mint hover:bg-mint/10 rounded-lg">
                        <Check className="size-4" />
                      </button>
                      <button onClick={() => setEditing(null)} className="p-2 text-muted hover:bg-panel-3 rounded-lg">
                        <X className="size-4" />
                      </button>
                    </div>
                  ) : (
                    <p className="font-medium truncate flex items-center gap-2">
                      {item.name}
                      <button onClick={() => setEditing({ id: item.id, name: item.name })} className="text-muted hover:text-fg" title="Renommer">
                        <Pencil className="size-3.5" />
                      </button>
                    </p>
                  )}
                  <p className="text-xs text-muted font-mono mt-1 flex flex-wrap gap-x-2">
                    <span>{formatBytes(item.size)}</span>
                    <span>·</span>
                    <span className="text-brass">{METHOD_INFO[item.method].short}</span>
                    {item.fileCount != null && (
                      <>
                        <span>·</span>
                        <span>
                          {item.fileCount} fichier{item.fileCount > 1 ? 's' : ''}
                        </span>
                      </>
                    )}
                    <span>·</span>
                    <span>{formatDate(item.createdAt)}</span>
                  </p>
                  {item.hint && (
                    <p className="text-xs text-fg-2 mt-1.5 flex items-center gap-1.5">
                      <Lightbulb className="size-3 text-brass" /> {item.hint}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {confirmId === item.id ? (
                    <>
                      <span className="text-xs text-muted mr-1">Supprimer ?</span>
                      <button onClick={() => remove(item.id)} className="btn btn-danger py-2 text-sm">
                        Oui
                      </button>
                      <button onClick={() => setConfirmId(null)} className="btn btn-ghost py-2 text-sm">
                        Non
                      </button>
                    </>
                  ) : (
                    <>
                      <button onClick={() => navigate('/ouvrir', { state: { vaultId: item.id } })} className="btn btn-primary py-2 text-sm">
                        <Unlock className="size-4" /> Ouvrir
                      </button>
                      <button onClick={() => download(item)} className="p-2.5 rounded-xl border border-line-2 text-muted hover:text-fg hover:border-brass" title="Télécharger">
                        <Download className="size-4" />
                      </button>
                      <button onClick={() => setConfirmId(item.id)} className="p-2.5 rounded-xl border border-line-2 text-muted hover:text-danger hover:border-danger/50" title="Supprimer">
                        <Trash2 className="size-4" />
                      </button>
                    </>
                  )}
                </div>
              </motion.li>
            ))}
          </ul>
          <p className="text-xs text-muted mt-6 leading-relaxed">
            Le coffre dépend du stockage de ce navigateur : vider les données de site le supprime. Téléchargez une copie de vos conteneurs importants.
          </p>
        </>
      )}
    </div>
  );
}
