import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth-context.js';
import Histogramme from '../components/Histogramme.jsx';
import SelecteurPeriode from '../components/SelecteurPeriode.jsx';
import { montant, dateFr } from '../format.js';
import { requetePeriode } from '../requete-periode.js';
import '../components/ui.css';

const MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];

const GROUPES = [
  ['jour', 'Par jour', '30 derniers jours'],
  ['semaine', 'Par semaine', '12 dernières semaines'],
  ['mois', 'Par mois', '12 derniers mois'],
  ['annee', 'Par année', '5 dernières années'],
];

function etiquette(groupe, p) {
  if (groupe === 'jour') return `${p.slice(8, 10)}/${p.slice(5, 7)}`;
  if (groupe === 'semaine') {
    const [annee, semaine] = p.split('-S');
    return `S${semaine} ${annee}`;
  }
  if (groupe === 'mois') {
    const [annee, mois] = p.split('-');
    return `${MOIS[Number(mois) - 1]} ${annee}`;
  }
  return p;
}

export default function Bilan() {
  const { user } = useAuth();
  // Le serveur n'envoie les bénéfices et coûts qu'à la responsable
  const voirBenefice = user.role === 'RESPONSABLE';
  const titre = voirBenefice ? 'Bilan financier' : 'Statistiques';

  // --- Bilan d'une période ---
  const [periode, setPeriode] = useState('mois');
  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  const [bilan, setBilan] = useState(null);
  const [top, setTop] = useState(null);
  const [erreurBilan, setErreurBilan] = useState('');

  const cle = requetePeriode(periode, du, au);

  useEffect(() => {
    if (cle === null) return;
    let actif = true;
    Promise.all([
      api(`/statistiques/resume?${cle}`),
      api(`/statistiques/top-articles?${cle}&limite=10`),
    ])
      .then(([r, t]) => {
        if (!actif) return;
        setErreurBilan('');
        setBilan(r);
        setTop(t.articles);
      })
      .catch((e) => actif && setErreurBilan(e.message));
    return () => {
      actif = false;
    };
  }, [cle]);

  // --- Évolution ---
  const [groupe, setGroupe] = useState('jour');
  const [evolution, setEvolution] = useState(null);
  const [erreurEvolution, setErreurEvolution] = useState('');

  useEffect(() => {
    let actif = true;
    api(`/statistiques/evolution?groupe=${groupe}`)
      .then((d) => {
        if (!actif) return;
        setErreurEvolution('');
        setEvolution(d);
      })
      .catch((e) => actif && setErreurEvolution(e.message));
    return () => {
      actif = false;
    };
  }, [groupe]);

  const series = voirBenefice
    ? [
        { nom: 'Ventes', couleur: '#1d4ed8' },
        { nom: 'Bénéfice', couleur: '#16a34a' },
      ]
    : [{ nom: 'Ventes', couleur: '#1d4ed8' }];

  const donneesEvolution =
    evolution && evolution.groupe === groupe ? evolution.donnees : null;

  return (
    <div>
      <div className="entete">
        <h1>{titre}</h1>
      </div>

      {/* ---------- Bilan de la période ---------- */}
      <div className="carte section">
        <h2>Bilan de la période</h2>
        <div className="barre">
          <SelecteurPeriode
            periode={periode}
            onPeriode={setPeriode}
            du={du}
            au={au}
            onDu={setDu}
            onAu={setAu}
          />
        </div>
        {periode === 'perso' && cle === null && <p className="muted">Choisissez les deux dates.</p>}
        {erreurBilan && <div className="erreur">{erreurBilan}</div>}

        {bilan && (
          <>
            <p className="muted">
              Du {dateFr(bilan.du)} au {dateFr(bilan.au)}
            </p>
            <div className="stats">
              <div className="stat carte">
                <span className="muted">Total des ventes</span>
                <strong>{montant(bilan.chiffre_affaires)}</strong>
              </div>
              <div className="stat carte">
                <span className="muted">Nombre de ventes</span>
                <strong>{bilan.nb_ventes}</strong>
              </div>
              <div className="stat carte">
                <span className="muted">Articles vendus</span>
                <strong>{bilan.quantite_vendue}</strong>
              </div>
              <div className="stat carte">
                <span className="muted">Achats (livraisons)</span>
                <strong>{montant(bilan.total_achats)}</strong>
              </div>
              {voirBenefice && (
                <>
                  <div className="stat carte">
                    <span className="muted">Coût des marchandises vendues</span>
                    <strong>{montant(bilan.cout_marchandises)}</strong>
                  </div>
                  <div className="stat carte benefice">
                    <span className="muted">Bénéfice</span>
                    <strong>{montant(bilan.benefice)}</strong>
                  </div>
                </>
              )}
            </div>
          </>
        )}

        {top && (
          <>
            <h3>Articles les plus vendus</h3>
            <div className="tableau-conteneur">
              <table className="tableau">
                <thead>
                  <tr>
                    <th>Article</th>
                    <th className="nombre">Quantité</th>
                    <th className="nombre">Montant</th>
                    {voirBenefice && <th className="nombre">Bénéfice</th>}
                  </tr>
                </thead>
                <tbody>
                  {top.length === 0 && (
                    <tr>
                      <td colSpan={voirBenefice ? 4 : 3} className="vide">
                        Aucune vente sur cette période.
                      </td>
                    </tr>
                  )}
                  {top.map((a) => (
                    <tr key={a.id_article}>
                      <td>{a.designation}</td>
                      <td className="nombre">{a.quantite_vendue}</td>
                      <td className="nombre">{montant(a.chiffre_affaires)}</td>
                      {voirBenefice && <td className="nombre plus">{montant(a.benefice)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {/* ---------- Évolution ---------- */}
      <div className="carte section">
        <div className="entete">
          <h2>Évolution des ventes</h2>
          <div className="onglets">
            {GROUPES.map(([cleGroupe, libelle]) => (
              <button
                key={cleGroupe}
                className={groupe === cleGroupe ? 'actif' : ''}
                onClick={() => setGroupe(cleGroupe)}
              >
                {libelle}
              </button>
            ))}
          </div>
        </div>
        <p className="muted">{GROUPES.find((g) => g[0] === groupe)[2]}</p>

        {erreurEvolution && <div className="erreur">{erreurEvolution}</div>}
        {!donneesEvolution && !erreurEvolution && <p className="muted">Chargement...</p>}

        {donneesEvolution && (
          <>
            <Histogramme
              series={series}
              donnees={donneesEvolution.map((d) => ({
                etiquette: etiquette(groupe, d.periode),
                valeurs: voirBenefice ? [d.chiffre_affaires, d.benefice] : [d.chiffre_affaires],
              }))}
            />

            <div className="tableau-conteneur espace-haut">
              <table className="tableau">
                <thead>
                  <tr>
                    <th>Période</th>
                    <th className="nombre">Ventes</th>
                    <th className="nombre">Total des ventes</th>
                    {voirBenefice && <th className="nombre">Bénéfice</th>}
                  </tr>
                </thead>
                <tbody>
                  {[...donneesEvolution].reverse().map((d) => (
                    <tr key={d.periode}>
                      <td>{etiquette(groupe, d.periode)}</td>
                      <td className="nombre">{d.nb_ventes}</td>
                      <td className="nombre">{montant(d.chiffre_affaires)}</td>
                      {voirBenefice && <td className="nombre plus">{montant(d.benefice)}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}