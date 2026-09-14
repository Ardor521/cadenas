import { motion } from 'framer-motion';
import { useId } from 'react';

interface Props {
  locked: boolean;
  size?: number;
  className?: string;
}

export function Padlock({ locked, size = 160, className }: Props) {
  const id = useId().replace(/:/g, '');
  return (
    <svg viewBox="0 0 120 140" width={size} height={(size * 140) / 120} className={className} aria-hidden>
      <defs>
        <linearGradient id={`${id}-brass`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f7dc8e" />
          <stop offset="0.45" stopColor="#e2ad4c" />
          <stop offset="1" stopColor="#8a611c" />
        </linearGradient>
        <linearGradient id={`${id}-steel`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#d7dbe3" />
          <stop offset="0.5" stopColor="#8e95a3" />
          <stop offset="1" stopColor="#cfd4dc" />
        </linearGradient>
        <linearGradient id={`${id}-shine`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.35" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.g
        initial={false}
        animate={{ y: locked ? 0 : -20, x: locked ? 0 : 6, rotate: locked ? 0 : -8 }}
        transition={{ type: 'spring', stiffness: 200, damping: 16 }}
        style={{ originX: '85px', originY: '62px' }}
      >
        <path d="M35 66 V42 a25 25 0 0 1 50 0 V66" fill="none" stroke="#3a3f4a" strokeWidth="14" strokeLinecap="round" />
        <path d="M35 66 V42 a25 25 0 0 1 50 0 V66" fill="none" stroke={`url(#${id}-steel)`} strokeWidth="10" strokeLinecap="round" />
      </motion.g>
      <rect x="18" y="58" width="84" height="68" rx="14" fill="#3a2a0c" />
      <rect x="18" y="56" width="84" height="66" rx="14" fill={`url(#${id}-brass)`} />
      <rect x="24" y="60" width="72" height="26" rx="10" fill={`url(#${id}-shine)`} />
      <circle cx="60" cy="86" r="9" fill="#1a1408" />
      <rect x="56" y="90" width="8" height="20" rx="3.5" fill="#1a1408" />
      <motion.circle
        cx="60"
        cy="86"
        r="4"
        initial={false}
        animate={{ opacity: locked ? 0 : 1 }}
        fill="#7fe0b5"
      />
    </svg>
  );
}
