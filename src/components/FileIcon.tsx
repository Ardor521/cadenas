import { FileArchive, FileAudio, FileImage, FileText, FileVideo, File as FileIconBase, FileType2 } from 'lucide-react';
import { fileKind } from '../lib/format';

export function FileIcon({ type, name, className = 'size-4' }: { type: string; name: string; className?: string }) {
  const kind = fileKind(type, name);
  const Icon =
    kind === 'image' ? FileImage : kind === 'video' ? FileVideo : kind === 'audio' ? FileAudio : kind === 'pdf' ? FileType2 : kind === 'text' ? FileText : kind === 'archive' ? FileArchive : FileIconBase;
  return <Icon className={className} />;
}
