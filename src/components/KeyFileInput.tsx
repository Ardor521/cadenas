import { useRef, useState } from 'react';
import { Download, FileKey2, RefreshCw, Upload, Check, X } from 'lucide-react';
import { generateKeyFileContent, keyFileHash } from '../lib/crypto';
import { downloadBlob } from '../lib/format';

interface Props {
  mode: 'create' | 'use';
  onChange: (state: { hash: string | null; name: string | null; downloaded: boolean }) => void;
}

export function KeyFileInput({ mode, onChange }: Props) {
  const [generated, setGenerated] = useState<{ content: string; hash: string } | null>(null);
  const [imported, setImported] = useState<{ name: string; hash: string } | null>(null);
  const [downloaded, setDownloaded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const generate = async () => {
    const content = generateKeyFileContent();
    const hash = await keyFileHash(new TextEncoder().encode(content).buffer as ArrayBuffer);
    setGenerated({ content, hash });
    setImported(null);
    setDownloaded(false);
    onChange({ hash, name: 'cadenas.key', downloaded: false });
  };

  const download = () => {
    if (!generated) return;
    downloadBlob(new Blob([generated.content], { type: 'text/plain' }), `cadenas-${generated.hash.slice(0, 8)}.key`);
    setDownloaded(true);
    onChange({ hash: generated.hash, name: `cadenas-${generated.hash.slice(0, 8)}.key`, downloaded: true });
  };

  const importFile = async (file: File) => {
    const hash = await keyFileHash(await file.arrayBuffer());
    setImported({ name: file.name, hash });
    setGenerated(null);
    onChange({ hash, name: file.name, downloaded: true });
  };

  const clear = () => {
    setGenerated(null);
    setImported(null);
    setDownloaded(false);
    onChange({ hash: null, name: null, downloaded: false });
  };

  const active = generated ?? imported;

  return (
    <div className="rounded-2xl border border-line bg-ink/40 p-4">
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void importFile(f);
          e.target.value = '';
        }}
      />
      {!active ? (
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
          {mode === 'create' && (
            <button type="button" onClick={generate} className="btn btn-primary flex-1">
              <FileKey2 className="size-4" /> Générer un fichier-clé
            </button>
          )}
          <button type="button" onClick={() => inputRef.current?.click()} className={`btn btn-ghost flex-1`}>
            <Upload className="size-4" /> {mode === 'create' ? 'Utiliser un fichier existant' : 'Sélectionner le fichier-clé'}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <div className="grid place-items-center size-10 rounded-xl bg-brass/15 text-brass shrink-0">
              <FileKey2 className="size-5" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">{generated ? 'Fichier-clé généré' : imported?.name}</p>
              <p className="text-xs font-mono text-muted truncate">empreinte {active.hash.slice(0, 16)}…</p>
            </div>
            <button type="button" onClick={clear} className="p-2 rounded-lg text-muted hover:text-fg hover:bg-panel-3" title="Retirer">
              <X className="size-4" />
            </button>
          </div>
          {generated && (
            <div className="flex flex-col sm:flex-row gap-2">
              <button type="button" onClick={download} className={`btn flex-1 ${downloaded ? 'btn-ghost' : 'btn-primary'}`}>
                {downloaded ? <Check className="size-4 text-mint" /> : <Download className="size-4" />}
                {downloaded ? 'Fichier-clé téléchargé' : 'Télécharger le fichier-clé'}
              </button>
              <button type="button" onClick={generate} className="btn btn-ghost">
                <RefreshCw className="size-4" /> Regénérer
              </button>
            </div>
          )}
          {generated && !downloaded && (
            <p className="text-xs text-amber">
              Téléchargez et conservez ce fichier avant de verrouiller : il ne sera plus jamais affiché.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
