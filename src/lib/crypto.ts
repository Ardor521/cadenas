import { toHex } from './format';

export type Method = 'password' | 'pin' | 'keyfile' | 'dual';

export const METHOD_CODE: Record<Method, number> = { password: 0, pin: 1, keyfile: 2, dual: 3 };
export const CODE_METHOD: Method[] = ['password', 'pin', 'keyfile', 'dual'];

export const METHOD_INFO: Record<
  Method,
  { label: string; short: string; description: string; needsPassword: boolean; needsKeyfile: boolean; strength: string }
> = {
  password: {
    label: 'Mot de passe',
    short: 'Mot de passe',
    description: 'Une phrase secrète que vous seul connaissez. Le choix classique.',
    needsPassword: true,
    needsKeyfile: false,
    strength: 'Dépend de la complexité',
  },
  pin: {
    label: 'Code PIN',
    short: 'PIN',
    description: 'Un code numérique de 4 à 12 chiffres. Rapide à saisir, moins robuste.',
    needsPassword: true,
    needsKeyfile: false,
    strength: 'Confort > sécurité',
  },
  keyfile: {
    label: 'Fichier-clé',
    short: 'Fichier-clé',
    description: 'Un fichier généré aléatoirement fait office de clé. Sans lui, rien ne s’ouvre.',
    needsPassword: false,
    needsKeyfile: true,
    strength: '256 bits aléatoires',
  },
  dual: {
    label: 'Double verrou',
    short: 'Mot de passe + clé',
    description: 'Mot de passe ET fichier-clé requis. Deux facteurs, sécurité maximale.',
    needsPassword: true,
    needsKeyfile: true,
    strength: 'Deux facteurs',
  },
};

export interface Secret {
  password?: string;
  keyfileHash?: string;
}

export function buildSecret(method: Method, s: Secret): string {
  switch (method) {
    case 'password':
    case 'pin':
      return s.password ?? '';
    case 'keyfile':
      return `KF:${s.keyfileHash ?? ''}`;
    case 'dual':
      return `${s.password ?? ''}\u0000KF:${s.keyfileHash ?? ''}`;
  }
}

export function iterationsFor(method: Method): number {
  return method === 'keyfile' ? 100_000 : 600_000;
}

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}

export async function deriveKey(secret: string, salt: Uint8Array<ArrayBuffer>, iterations: number): Promise<CryptoKey> {
  const raw = new TextEncoder().encode(secret);
  const baseKey = await crypto.subtle.importKey('raw', raw, 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function keyFileHash(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return toHex(new Uint8Array(digest));
}

export function generateKeyFileContent(): string {
  const bytes = randomBytes(48);
  const b64 = btoa(String.fromCharCode(...Array.from(bytes)));
  return [
    '-----CADENAS KEY FILE v1-----',
    b64,
    '-----END-----',
    'Conservez ce fichier en lieu sûr. Il est indispensable pour déverrouiller vos données.',
    '',
  ].join('\n');
}

export function generatePassword(len = 20): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%&*+-=?';
  let out = '';
  while (out.length < len) {
    const bytes = randomBytes(len * 2);
    for (let i = 0; i < bytes.length && out.length < len; i++) {
      const v = bytes[i];
      if (v < 256 - (256 % alphabet.length)) out += alphabet[v % alphabet.length];
    }
  }
  return out;
}

export interface Strength {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  entropy: number;
}

export function passwordStrength(pw: string): Strength {
  if (!pw) return { score: 0, label: 'Vide', entropy: 0 };
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/[0-9]/.test(pw)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(pw)) pool += 33;
  const rawEntropy = pw.length * Math.log2(pool || 1);
  const unique = new Set(pw).size;
  const diversity = Math.min(1, unique / Math.max(4, pw.length * 0.6));
  const common = /^(1234|0000|password|motdepasse|azerty|qwerty|admin|1111|abcd)/i.test(pw) ? 0.4 : 1;
  const entropy = Math.round(rawEntropy * diversity * common);
  const score: Strength['score'] = entropy < 28 ? 1 : entropy < 45 ? 2 : entropy < 70 ? 3 : 4;
  const labels = ['Vide', 'Faible', 'Moyen', 'Bon', 'Excellent'];
  return { score, label: labels[score], entropy };
}

export function pinStrength(pin: string): Strength {
  if (!pin) return { score: 0, label: 'Vide', entropy: 0 };
  const entropy = Math.round(pin.length * Math.log2(10));
  const repeated = /^(\d)\1+$/.test(pin) || /^(0123|1234|2345|3456|4567|5678|6789|9876|8765|7654|6543|5432|4321|3210)/.test(pin);
  const score: Strength['score'] = repeated ? 1 : pin.length < 6 ? 1 : pin.length < 8 ? 2 : pin.length < 10 ? 3 : 4;
  const labels = ['Vide', 'Faible', 'Moyen', 'Bon', 'Excellent'];
  return { score, label: labels[score], entropy };
}
