import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import { ShieldCheck, Cpu, EyeOff, KeyRound, ChevronDown, Lock, FileCode2, AlertTriangle } from 'lucide-react';

const steps = [
  {
    icon: KeyRound,
    t: 'Votre secret devient une clé',
    d: 'Le mot de passe (ou le PIN, ou l’empreinte SHA-256 du fichier-clé) passe dans PBKDF2-SHA256 avec un sel aléatoire de 128 bits et 600 000 itérations. Le résultat est une clé AES de 256 bits impossible à deviner par force brute rapide.',
  },
  {
    icon: Cpu,
    t: 'Le contenu est chiffré et authentifié',
    d: 'Vos fichiers et leurs métadonnées (noms, chemins, types) sont chiffrés avec AES-256-GCM. Le mode GCM garantit qu’une modification du conteneur, même d’un seul bit, est détectée.',
  },
  {
    icon: EyeOff,
    t: 'Rien ne sort de votre appareil',
    d: 'Tout repose sur l’API WebCrypto native du navigateur. Aucun serveur, aucune télémétrie, aucun compte. Coupez votre connexion : l’application fonctionne toujours.',
  },
];

const spec = [
  ['0 – 3', 'Magic « CDNS »', 'Identifie un conteneur Cadenas'],
  ['4', 'Version', 'Actuellement 1'],
  ['5', 'Méthode', '0 mot de passe · 1 PIN · 2 fichier-clé · 3 double'],
  ['6 – 9', 'Itérations', 'PBKDF2, entier 32 bits'],
  ['10 – 25', 'Sel', '16 octets aléatoires'],
  ['26 – 37', 'IV', '12 octets aléatoires (GCM)'],
  ['38 – 39', 'Longueur indice', 'Entier 16 bits'],
  ['40 …', 'Indice', 'UTF-8, en clair, facultatif'],
  ['… fin', 'Texte chiffré', 'AES-256-GCM + tag 128 bits'],
];

const faq = [
  {
    q: 'J’ai oublié mon mot de passe. Pouvez-vous récupérer mes fichiers ?',
    a: 'Non, et c’est volontaire. Il n’existe aucune porte dérobée ni clé maître. Sans le secret exact, le contenu est mathématiquement irrécupérable. Utilisez l’indice pour vous aider, et conservez vos secrets dans un gestionnaire de mots de passe.',
  },
  {
    q: 'Le code PIN est-il sûr ?',
    a: 'Un PIN à 6 chiffres n’offre qu’un million de combinaisons. Les 600 000 itérations PBKDF2 ralentissent fortement chaque essai (~0,5 s), mais un attaquant déterminé avec du matériel dédié finira par y arriver. Réservez le PIN aux données peu sensibles ou combinez-le avec un fichier-clé.',
  },
  {
    q: 'Que contient le fichier-clé ?',
    a: '48 octets aléatoires générés par le navigateur, encodés en texte. C’est l’empreinte SHA-256 du fichier entier qui sert de secret : n’importe quel fichier peut donc faire office de clé (une photo, un PDF…), à condition de ne jamais le modifier.',
  },
  {
    q: 'Le fichier HTML autonome est-il aussi sûr que le .cadenas ?',
    a: 'Oui : il embarque exactement le même conteneur chiffré (encodé en base64) accompagné d’un petit script de déchiffrement. Le fichier est ~33 % plus volumineux, mais s’ouvre partout sans cette application.',
  },
  {
    q: 'Peut-on verrouiller un dossier ?',
    a: 'Oui. Glissez un dossier ou utilisez « Choisir un dossier entier ». Tous les fichiers et leurs chemins relatifs sont regroupés dans un conteneur unique. Au déverrouillage, vous récupérez chaque fichier ou une archive .zip complète.',
  },
  {
    q: 'Y a-t-il une limite de taille ?',
    a: 'Le chiffrement se fait en mémoire. Jusqu’à quelques centaines de Mo, tout est fluide sur un ordinateur récent. Au-delà de 1 Go, le navigateur peut manquer de mémoire : découpez vos données en plusieurs conteneurs.',
  },
  {
    q: 'Le coffre est-il synchronisé dans le cloud ?',
    a: 'Non. Le coffre utilise IndexedDB, un stockage local propre à ce navigateur sur cet appareil. Effacer les données de site le vide. Considérez-le comme un espace de travail pratique, pas comme une sauvegarde.',
  },
];

export function SecurityPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 sm:px-6 pt-12 sm:pt-16">
      <div className="max-w-2xl">
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="chip text-brass border-brass/30">
          <ShieldCheck className="size-3" /> Transparence totale
        </motion.p>
        <motion.h1 initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="font-display font-extrabold text-4xl sm:text-5xl tracking-tight mt-4">
          Comment vos fichiers sont protégés
        </motion.h1>
        <motion.p initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }} className="text-muted mt-4 text-lg leading-relaxed">
          Pas de magie, uniquement des primitives cryptographiques standard, implémentées nativement par votre navigateur et auditables par tous.
        </motion.p>
      </div>

      <section className="mt-12 grid md:grid-cols-3 gap-5">
        {steps.map((s, i) => (
          <motion.div
            key={s.t}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 + i * 0.08 }}
            className="card p-6 relative overflow-hidden"
          >
            <span className="absolute -top-4 -right-2 font-display font-extrabold text-[7rem] leading-none text-brass/5 select-none">{i + 1}</span>
            <div className="grid place-items-center size-11 rounded-xl bg-brass/10 text-brass">
              <s.icon className="size-5" />
            </div>
            <h3 className="font-display font-bold text-lg mt-4">{s.t}</h3>
            <p className="text-sm text-muted mt-2 leading-relaxed">{s.d}</p>
          </motion.div>
        ))}
      </section>

      <section className="mt-16 grid lg:grid-cols-[1fr_1.1fr] gap-8">
        <div>
          <h2 className="font-display font-bold text-2xl">Anatomie d’un fichier .cadenas</h2>
          <p className="text-muted mt-3 leading-relaxed">
            Le format est volontairement simple et documenté, pour que vos données restent lisibles dans dix ans avec quelques lignes de code, même si cette application disparaît.
          </p>
          <div className="mt-6 rounded-2xl border border-amber/30 bg-amber/5 p-4 flex gap-3">
            <AlertTriangle className="size-5 text-amber shrink-0 mt-0.5" />
            <p className="text-sm text-fg-2">
              L’indice est stocké <span className="font-semibold text-amber">en clair</span>. N’y inscrivez jamais le mot de passe lui-même ni un élément qui le trahirait.
            </p>
          </div>
        </div>
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-panel-2/60 text-left text-xs uppercase tracking-wider text-muted">
                <th className="px-4 py-3 font-mono">Octets</th>
                <th className="px-4 py-3">Champ</th>
                <th className="px-4 py-3">Contenu</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line/60">
              {spec.map(([o, f, c]) => (
                <tr key={f}>
                  <td className="px-4 py-2.5 font-mono text-brass whitespace-nowrap">{o}</td>
                  <td className="px-4 py-2.5 font-medium">{f}</td>
                  <td className="px-4 py-2.5 text-muted">{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-16">
        <h2 className="font-display font-bold text-2xl mb-6">Questions fréquentes</h2>
        <div className="grid gap-2">
          {faq.map((f) => (
            <details key={f.q} className="card group open:border-brass/40">
              <summary className="flex items-center justify-between gap-4 px-5 py-4 cursor-pointer font-medium">
                {f.q}
                <ChevronDown className="size-4 text-muted shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              <p className="px-5 pb-5 text-sm text-muted leading-relaxed -mt-1">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="mt-16 card p-8 sm:p-10 text-center shadow-deep relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(60%_80%_at_50%_120%,rgba(230,184,92,0.15),transparent)]" />
        <h2 className="relative font-display font-extrabold text-3xl">Prêt à verrouiller ?</h2>
        <p className="relative text-muted mt-2">Trois étapes, quelques secondes, zéro compromis.</p>
        <div className="relative flex flex-col sm:flex-row justify-center gap-3 mt-6">
          <Link to="/" className="btn btn-primary">
            <Lock className="size-4" /> Verrouiller un fichier
          </Link>
          <Link to="/ouvrir" className="btn btn-ghost">
            <FileCode2 className="size-4" /> Ouvrir un conteneur
          </Link>
        </div>
      </section>
    </div>
  );
}
