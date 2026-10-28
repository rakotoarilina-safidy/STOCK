// Transforme la période choisie en paramètres d'adresse pour l'API.
// Renvoie null si les dates précises ne sont pas encore toutes choisies.
export function requetePeriode(periode, du, au) {
  if (periode === 'perso') return du && au ? `du=${du}&au=${au}` : null;
  return `periode=${periode}`;
}
