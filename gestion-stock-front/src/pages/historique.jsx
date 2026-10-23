import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth-context.js';
import SelecteurPeriode from '../components/SelecteurPeriode.jsx';
import { montant, dateHeureFr, dateFr } from '../format.js';
import { requetePeriode } from '../requete-periode.js';
import '../components/ui.css';

export default function Historique() {
  const { user } = useAuth();
  // Le bénéfice n'est envoyé par le serveur qu'à la responsable
  const voirBenefice = user.role === 'RESPONSABLE';

  const [periode, setPeriode] = useState('jour');
  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState('');
  const [q, setQ] = useState('');
  const [vue, setVue] = useState('lignes'); // 'lignes' ou 'articles'
  const [version, setVersion] = useState(0);

  const cle = requetePeriode(periode, du, au);

  useEffect(() => {
    if (cle === null) return;
    let actif = true;
    api(`/ventes/historique?${cle}`)
      .then((d) => {
        if (!actif) return;
        setErreur('');
        setDonnees(d);
      })
      .catch((e) => actif && setErreur(e.message));
    return () => {
      actif = false;
    };
  }, [cle, version]);

  const lignes = useMemo(() => {
    if (!donnees) return [];
    const terme = q.trim().toLowerCase();
    return donnees.lignes.filter(
      (l) =>
        l.designation.toLowerCase().includes(terme) ||
        l.numero_facture.toLowerCase().includes(terme) ||
        l.caissier.toLowerCase().includes(terme)
    );
  }, [donnees, q]);

  const totaux = useMemo(
    () => ({
      quantite: lignes.reduce((s, l) => s + Number(l.quantite_vendue), 0),
      montant: lignes.reduce((s, l) => s + Number(l.total_ligne), 0),
      benefice: lignes.reduce((s, l) => s + Number(l.benefice_ligne || 0), 0),
    }),
    [lignes]
  );

  // Résumé : une ligne par article, du plus vendu au moins vendu
  const parArticle = useMemo(() => {
    const m = new Map();
    for (const l of lignes) {
      const a = m.get(l.designation) || { designation: l.designation, quantite: 0, montant: 0, benefice: 0 };
      a.quantite += Number(l.quantite_vendue);
      a.montant += Number(l.total_ligne);
      a.benefice += Number(l.benefice_ligne || 0);
      m.set(l.designation, a);
    }
    return [...m.values()].sort((a, b) => b.quantite - a.quantite);
  }, [lignes]);

  const colonnes = voirBenefice ? 8 : 7;

  return (
    <div>
      <div className="entete">
        <h1>Historique des ventes</h1>
        <div className="onglets">
          <button className={vue === 'lignes' ? 'actif' : ''} onClick={() => setVue('lignes')}>
            Ligne par ligne
          </button>
          <button className={vue === 'articles' ? 'actif' : ''} onClick={() => setVue('articles')}>
            Résumé par article
          </button>
        </div>
      </div>

      <div className="barre">
        <SelecteurPeriode
          periode={periode}
          onPeriode={setPeriode}
          du={du}
          au={au}
          onDu={setDu}
          onAu={setAu}
        />
        <button className="btn btn-secondaire pousse" onClick={() => setVersion((v) => v + 1)}>
          Actualiser
        </button>
      </div>

      <div className="barre">
        <input
          className="recherche-liste"
          placeholder="Rechercher un article, une facture, un caissier..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        {donnees && (
          <span className="muted">
            Du {dateFr(donnees.du)} au {dateFr(donnees.au)}
          </span>
        )}
      </div>

      {periode === 'perso' && cle === null && <p className="muted">Choisissez les deux dates.</p>}

      {donnees && (
        <div className="stats">
          <div className="stat carte">
            <span className="muted">Articles vendus (quantité)</span>
            <strong>{totaux.quantite}</strong>
          </div>
          <div className="stat carte">
            <span className="muted">Montant des ventes</span>
            <strong>{montant(totaux.montant)}</strong>
          </div>
          {voirBenefice && (
            <div className="stat carte">
              <span className="muted">Bénéfice</span>
              <strong>{montant(totaux.benefice)}</strong>
            </div>
          )}
        </div>
      )}

      {erreur && <div className="erreur">{erreur}</div>}

      <div className="tableau-conteneur">
        {vue === 'lignes' ? (
          <table className="tableau">
            <thead>
              <tr>
                <th>Date et heure</th>
                <th>Facture</th>
                <th>Article</th>
                <th className="nombre">Quantité</th>
                <th className="nombre">Prix unitaire</th>
                <th className="nombre">Total</th>
                <th>Caissier</th>
                {voirBenefice && <th className="nombre">Bénéfice</th>}
              </tr>
            </thead>
            <tbody>
              {!donnees && !erreur && (
                <tr>
                  <td colSpan={colonnes} className="vide">
                    Chargement...
                  </td>
                </tr>
              )}
              {donnees && lignes.length === 0 && (
                <tr>
                  <td colSpan={colonnes} className="vide">
                    Aucune vente sur cette période.
                  </td>
                </tr>
              )}
              {lignes.map((l, i) => (
                <tr key={`${l.id_vente}-${i}`}>
                  <td>{dateHeureFr(l.date_vente)}</td>
                  <td>{l.numero_facture}</td>
                  <td>{l.designation}</td>
                  <td className="nombre">{l.quantite_vendue}</td>
                  <td className="nombre">{montant(l.prix_unitaire_applique)}</td>
                  <td className="nombre">{montant(l.total_ligne)}</td>
                  <td>{l.caissier}</td>
                  {voirBenefice && <td className="nombre plus">{montant(l.benefice_ligne)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="tableau">
            <thead>
              <tr>
                <th>Article</th>
                <th className="nombre">Quantité vendue</th>
                <th className="nombre">Montant</th>
                {voirBenefice && <th className="nombre">Bénéfice</th>}
              </tr>
            </thead>
            <tbody>
              {!donnees && !erreur && (
                <tr>
                  <td colSpan={voirBenefice ? 4 : 3} className="vide">
                    Chargement...
                  </td>
                </tr>
              )}
              {donnees && parArticle.length === 0 && (
                <tr>
                  <td colSpan={voirBenefice ? 4 : 3} className="vide">
                    Aucune vente sur cette période.
                  </td>
                </tr>
              )}
              {parArticle.map((a) => (
                <tr key={a.designation}>
                  <td>
                    <strong>{a.designation}</strong>
                  </td>
                  <td className="nombre">{a.quantite}</td>
                  <td className="nombre">{montant(a.montant)}</td>
                  {voirBenefice && <td className="nombre plus">{montant(a.benefice)}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}