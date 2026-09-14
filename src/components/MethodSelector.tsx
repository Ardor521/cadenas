import { KeyRound, Hash, FileKey2, ShieldCheck } from 'lucide-react';
import { METHOD_INFO, type Method } from '../lib/crypto';

const ICONS: Record<Method, typeof KeyRound> = {
  password: KeyRound,
  pin: Hash,
  keyfile: FileKey2,
  dual: ShieldCheck,
};

export function MethodSelector({ value, onChange }: { value: Method; onChange: (m: Method) => void }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      {(Object.keys(METHOD_INFO) as Method[]).map((m) => {
        const info = METHOD_INFO[m];
        const Icon = ICONS[m];
        const active = value === m;
        return (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            className={`relative text-left rounded-2xl border p-4 transition-all ${
              active ? 'border-brass bg-brass/10 shadow-glow' : 'border-line bg-ink/40 hover:border-line-2 hover:bg-panel-2'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className={`grid place-items-center size-9 rounded-xl ${active ? 'bg-brass text-ink' : 'bg-panel-3 text-brass'}`}>
                <Icon className="size-4.5" />
              </div>
              <span className={`size-2.5 rounded-full mt-1 ${active ? 'bg-brass' : 'bg-line-2'}`} />
            </div>
            <p className="font-display font-bold mt-3 leading-tight">{info.label}</p>
            <p className="text-xs text-muted mt-1 leading-relaxed">{info.description}</p>
            <p className="chip mt-3">{info.strength}</p>
          </button>
        );
      })}
    </div>
  );
}
