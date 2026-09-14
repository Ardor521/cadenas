import { useEffect, useRef, useState, type DragEvent } from 'react';
import { FolderOpen, Upload } from 'lucide-react';
import type { PickedFile } from '../lib/container';

interface Props {
  onFiles: (files: PickedFile[]) => void;
  multiple?: boolean;
  accept?: string;
  allowFolder?: boolean;
  title: string;
  subtitle?: string;
  compact?: boolean;
}

async function readEntry(entry: FileSystemEntry, prefix: string): Promise<PickedFile[]> {
  if (entry.isFile) {
    const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej));
    return [{ file, path: prefix + file.name }];
  }
  if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    const all: FileSystemEntry[] = [];
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej));
      if (!batch.length) break;
      all.push(...batch);
    }
    const out: PickedFile[] = [];
    for (const e of all) out.push(...(await readEntry(e, `${prefix}${entry.name}/`)));
    return out;
  }
  return [];
}

async function filesFromDataTransfer(dt: DataTransfer): Promise<PickedFile[]> {
  const items = Array.from(dt.items ?? []);
  const entries = items.map((i) => (typeof i.webkitGetAsEntry === 'function' ? i.webkitGetAsEntry() : null));
  if (entries.some(Boolean)) {
    const out: PickedFile[] = [];
    for (const e of entries) if (e) out.push(...(await readEntry(e, '')));
    if (out.length) return out;
  }
  return Array.from(dt.files).map((file) => ({ file, path: file.name }));
}

export function Dropzone({ onFiles, multiple = true, accept, allowFolder, title, subtitle, compact }: Props) {
  const [over, setOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dirRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    dirRef.current?.setAttribute('webkitdirectory', '');
    dirRef.current?.setAttribute('directory', '');
  }, []);

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    setOver(false);
    const files = await filesFromDataTransfer(e.dataTransfer);
    if (!files.length) return;
    onFiles(multiple ? files : files.slice(0, 1));
  };

  const fromInput = (list: FileList | null) => {
    if (!list?.length) return;
    const files = Array.from(list).map((file) => ({
      file,
      path: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
    }));
    onFiles(multiple ? files : files.slice(0, 1));
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={onDrop}
      className={`relative group cursor-pointer rounded-2xl border-2 border-dashed transition-all ${
        over ? 'border-brass bg-brass/10 scale-[1.01]' : 'border-line-2 hover:border-brass/60 bg-ink/50'
      } ${compact ? 'p-6' : 'p-10 sm:p-14'} text-center outline-none focus-visible:ring-2 focus-visible:ring-brass`}
    >
      <input
        ref={inputRef}
        type="file"
        multiple={multiple}
        accept={accept}
        className="hidden"
        onChange={(e) => {
          fromInput(e.target.files);
          e.target.value = '';
        }}
      />
      {allowFolder && (
        <input
          ref={dirRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            fromInput(e.target.files);
            e.target.value = '';
          }}
        />
      )}
      <div className="flex flex-col items-center gap-3">
        <div className="relative">
          <div className={`absolute inset-0 rounded-full bg-brass/30 ${over ? 'animate-pulse-ring' : 'opacity-0'}`} />
          <div className="relative grid place-items-center size-14 rounded-2xl bg-panel-3 border border-line-2 text-brass group-hover:-translate-y-0.5 transition-transform">
            <Upload className="size-6" />
          </div>
        </div>
        <div>
          <p className="font-display font-bold text-lg">{title}</p>
          {subtitle && <p className="text-muted text-sm mt-1">{subtitle}</p>}
        </div>
        {allowFolder && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              dirRef.current?.click();
            }}
            className="btn btn-ghost text-sm mt-1"
          >
            <FolderOpen className="size-4" /> Choisir un dossier entier
          </button>
        )}
      </div>
    </div>
  );
}
