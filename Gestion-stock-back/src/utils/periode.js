const fmt = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const arrondi = (n) => Math.round(Number(n) * 100) / 100;

// Retourne { du, au } (format AAAA-MM-JJ) à partir de la requête :
//  - ?du=2026-10-01&au=2026-10-31          -> dates exactes
//  - ?periode=jour|semaine|mois|annee      -> depuis le début de la période en cours jusqu'à aujourd'hui
//  - rien                                  -> aujourd'hui
function bornes(query = {}) {
  if (query.du && query.au) return { du: query.du, au: query.au };

  const now = new Date();
  let debut = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  switch (query.periode) {
    case 'semaine': {
      const joursDepuisLundi = (now.getDay() + 6) % 7;
      debut.setDate(debut.getDate() - joursDepuisLundi);
      break;
    }
    case 'mois':
      debut = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case 'annee':
      debut = new Date(now.getFullYear(), 0, 1);
      break;
    default:
      break; // jour
  }
  return { du: fmt(debut), au: fmt(now) };
}

module.exports = { bornes, arrondi, fmt };