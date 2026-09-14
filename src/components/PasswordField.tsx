import { useState } from 'react';
import { Eye, EyeOff, Wand2, Copy, Check } from 'lucide-react';
import { generatePassword, passwordStrength, pinStrength } from '../lib/crypto';

interface Props {
  value: string;
  onChange: (v: string) => void;
  label?: string;
  placeholder?: string;
  mode?: 'password' | 'pin';
  showStrength?: boolean;
  allowGenerate?: boolean;
  autoFocus?: boolean;
  id?: string;
}

const COLORS = ['bg-line-2', 'bg-danger', 'bg-amber', 'bg-brass', 'bg-mint'];
const TEXT = ['text-muted', 'text-danger', 'text-amber', 'text-brass', 'text-mint'];

export function PasswordField({
  value,
  onChange,
  label,
  placeholder,
  mode = 'password',
  showStrength,
  allowGenerate,
  autoFocus,
  id,
}: Props) {
  const [visible, setVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const strength = mode === 'pin' ? pinStrength(value) : passwordStrength(value);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard indisponible */
    }
  };

  return (
    <div>
      {label && (
        <label htmlFor={id} className="block text-sm text-muted mb-1.5">
          {label}
        </label>
      )}
      <div className="relative flex items-center">
        <input
          id={id}
          type={visible ? 'text' : 'password'}
          inputMode={mode === 'pin' ? 'numeric' : undefined}
          autoComplete="off"
          autoFocus={autoFocus}
          spellCheck={false}
          value={value}
          maxLength={mode === 'pin' ? 12 : 256}
          onChange={(e) => onChange(mode === 'pin' ? e.target.value.replace(/\D/g, '') : e.target.value)}
          placeholder={placeholder}
          className={`input pr-24 ${mode === 'pin' || visible ? 'font-mono' : ''} ${mode === 'pin' ? 'tracking-[0.35em] text-lg' : ''}`}
        />
        <div className="absolute right-2 flex items-center gap-1">
          {allowGenerate && value && (
            <button
              type="button"
              onClick={copy}
              title="Copier"
              className="p-2 rounded-lg text-muted hover:text-fg hover:bg-panel-3 transition-colors"
            >
              {copied ? <Check className="size-4 text-mint" /> : <Copy className="size-4" />}
            </button>
          )}
          {allowGenerate && (
            <button
              type="button"
              onClick={() => {
                onChange(mode === 'pin' ? String(Math.floor(crypto.getRandomValues(new Uint32Array(1))[0] % 1e8)).padStart(8, '0') : generatePassword(20));
                setVisible(true);
              }}
              title="Générer"
              className="p-2 rounded-lg text-brass hover:bg-brass/10 transition-colors"
            >
              <Wand2 className="size-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            title={visible ? 'Masquer' : 'Afficher'}
            className="p-2 rounded-lg text-muted hover:text-fg hover:bg-panel-3 transition-colors"
          >
            {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
          </button>
        </div>
      </div>
      {showStrength && (
        <div className="mt-2.5 flex items-center gap-3">
          <div className="flex-1 grid grid-cols-4 gap-1">
            {[1, 2, 3, 4].map((i) => (
              <div
                key={i}
                className={`h-1.5 rounded-full transition-colors duration-300 ${i <= strength.score ? COLORS[strength.score] : 'bg-line'}`}
              />
            ))}
          </div>
          <span className={`text-xs font-mono ${TEXT[strength.score]} min-w-[6.5rem] text-right`}>
            {value ? `${strength.label} · ${strength.entropy} bits` : '—'}
          </span>
        </div>
      )}
    </div>
  );
}
