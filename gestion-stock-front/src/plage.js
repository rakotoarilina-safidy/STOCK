import { useState } from 'react';

const deux = (n) => String(n).padStart(2, '0');

// Date locale au format AAAA-MM-JJ
export const fmt = (d) => `${d.getFullYear()}-${deux(d.getMonth() + 1)}-${deux(d.getDate())}`;

const depuis = (iso) => new Date(`${iso}T00:00:00`);

export const MOIS_COURTS = [
  'Janv.', 'Févr.', 'Mars', 'Avr.', 'Mai', 'Juin',
  'Juil.', 'Août', 'Sept.', 'Oct.', 'Nov.', 'Déc.',
];

// Transforme la période choisie en dates réelles { du, au } (ou null si les dates précises sont incomplètes)
//  - jour    : aujourd'hui
//  - semaine : du lundi à aujourd'hui
//  - mois    : du 1er du mois à aujourd'hui
//  - annee   : le mois choisi de l'année en cours
//  - perso   : les deux dates saisies
export function plagePeriode({ periode, du, au, mois }) {
  const auj = new Date();
  const aujourdhui = fmt(auj);

  if (periode === 'perso') return du && au ? { du, au } : null;
  if (periode === 'jour') return { du: aujourdhui, au: aujourdhui };

  if (periode === 'semaine') {
    const lundi = new Date(auj);
    lundi.setDate(auj.getDate() - ((auj.getDay() + 6) % 7));
    return { du: fmt(lundi), au: aujourdhui };
  }

  if (periode === 'mois') {
    return { du: fmt(new Date(auj.getFullYear(), auj.getMonth(), 1)), au: aujourdhui };
  }

  // annee : un mois à la fois
  const m = mois === undefined || mois === null ? auj.getMonth() : mois;
  const finMois = fmt(new Date(auj.getFullYear(), m + 1, 0));
  return { du: fmt(new Date(auj.getFullYear(), m, 1)), au: finMois > aujourdhui ? aujourdhui : finMois };
}

// Liste des jours entre deux dates, dans l'ordre (AAAA-MM-JJ)
export function joursEntre(du, au) {
  const jours = [];
  for (let d = depuis(du); fmt(d) <= au; d.setDate(d.getDate() + 1)) jours.push(fmt(d));
  return jours;
}

// Semaine, mois et année : un jour par ligne. Jour et dates précises : la liste complète.
export const modeDe = (periode) => (periode === 'jour' || periode === 'perso' ? 'liste' : 'jours');

// 'lundi 20 octobre'
export function libelleJour(iso) {
  const t = depuis(iso).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
  return t.charAt(0).toUpperCase() + t.slice(1);
}

// Gère la période choisie sur une page d'historique, et le jour ouvert en « Détail »
export function usePeriode(initiale = 'jour') {
  const [periode, setPeriodeBrut] = useState(initiale);
  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  const [mois, setMoisBrut] = useState(new Date().getMonth());
  const [jourDetail, setJourDetail] = useState(null);

  const choisir = (fn) => (v) => {
    setJourDetail(null); // changer de période ferme le détail d'un jour
    fn(v);
  };

  const plage = jourDetail
    ? { du: jourDetail, au: jourDetail }
    : plagePeriode({ periode, du, au, mois });
  const mode = jourDetail ? 'liste' : modeDe(periode);

  return {
    plage,
    mode,
    periode,
    jourDetail,
    setJourDetail,
    // à passer tel quel à <SelecteurPeriode {...selecteur} />
    selecteur: {
      periode,
      onPeriode: choisir(setPeriodeBrut),
      du,
      au,
      onDu: choisir(setDu),
      onAu: choisir(setAu),
      mois,
      onMois: choisir(setMoisBrut),
    },
  };
}