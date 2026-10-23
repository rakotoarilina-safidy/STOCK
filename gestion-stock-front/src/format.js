const formateur = new Intl.NumberFormat('fr-FR');

export const nombre = (n) => formateur.format(Math.round(Number(n) || 0));

export const montant = (n) => `${nombre(n)} Ar`;

// Accepte '2026-10-22' (date simple) ou une date complète renvoyée par le serveur
// et l'affiche en heure locale : '22/10/2026'
export const dateFr = (valeur) => {
  const s = String(valeur);
  const d = s.length === 10 ? new Date(`${s}T00:00:00`) : new Date(s);
  return d.toLocaleDateString('fr-FR');
};

// Date et heure complètes renvoyées par le serveur : '22/10/2026 14:51'
export const dateHeureFr = (valeur) =>
  new Date(valeur).toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });

// 1 500 000 -> '1,5 M'   |   190 000 -> '190 k'
export const compact = (n) => {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1).replace('.', ',').replace(',0', '')} M`;
  if (v >= 1_000) return `${Math.round(v / 1_000)} k`;
  return String(Math.round(v));
};