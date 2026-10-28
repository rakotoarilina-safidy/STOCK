import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAuth } from '../auth-context.js';
import Histogramme from '../components/Histogramme.jsx';
import CarteCaisse from '../components/CarteCaisse.jsx';
import { montant } from '../format.js';
import '../components/ui.css';

function CarteChiffres({ titre, d, voirBenefice }) {
  return (
    <div className="stat carte">
      <span className="muted">{titre}</span>
      <strong>{montant(d.chiffre_affaires)}</strong>
      <span className="muted">
        {d.nb_ventes} vente{d.nb_ventes > 1 ? 's' : ''}
      </span>
      {voirBenefice && (
        <span className="plus">Bénéfice : {montant(d.benefice)}</span>
      )}
    </div>
  );
}

const jourCourt = (p) => `${p.slice(8, 10)}/${p.slice(5, 7)}`;

export default function Accueil() {
  const { user } = useAuth();
  const estResponsable = user.role === 'RESPONSABLE';
  // Les bénéfices ne s'affichent pas ici : ils sont uniquement dans le Bilan financier
  const voirBenefice = false;

  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let actif = true;
    api('/statistiques/tableau-de-bord')
      .then((d) => {
        if (!actif) return;
        setErreur('');
        setDonnees(d);
      })
      .catch((e) => actif && setErreur(e.message));
    return () => {
      actif = false;
    };
  }, [version]);

  const series = voirBenefice
    ? [
        { nom: 'Ventes', couleur: '#0f766e' },
        { nom: 'Bénéfice', couleur: '#e8a317' },
      ]
    : [{ nom: 'Ventes', couleur: '#0f766e' }];

  return (
    <div>
      <div className="entete">
        <h1>{estResponsable ? 'État financier du magasin' : `Bonjour, ${user.nom}`}</h1>
        <button className="btn btn-secondaire" onClick={() => setVersion((v) => v + 1)}>
          Actualiser
        </button>
      </div>

      {erreur && <div className="erreur">{erreur}</div>}
      {!donnees && !erreur && <p className="muted">Chargement...</p>}

      {donnees && (
        <>
          <div className="stats">
            <CarteChiffres titre="Aujourd’hui" d={donnees.aujourdhui} voirBenefice={voirBenefice} />
            <CarteChiffres titre="Cette semaine" d={donnees.cette_semaine} voirBenefice={voirBenefice} />
            <CarteChiffres titre="Ce mois" d={donnees.ce_mois} voirBenefice={voirBenefice} />
            <CarteChiffres titre="Cette année" d={donnees.cette_annee} voirBenefice={voirBenefice} />
          </div>

          {!estResponsable && <CarteCaisse />}

          <div className="carte section">
            <h2>Ventes des 10 derniers jours</h2>
            <Histogramme
              series={series}
              donnees={donnees.derniers_jours.map((j) => ({
                etiquette: jourCourt(j.periode),
                valeurs: voirBenefice ? [j.chiffre_affaires, j.benefice] : [j.chiffre_affaires],
              }))}
            />
          </div>

          <div className="deux-colonnes">
            <div className="carte section">
              <h2>Articles les plus vendus ce mois</h2>
              {donnees.top_articles_du_mois.length === 0 ? (
                <p className="muted">Aucune vente ce mois-ci.</p>
              ) : (
                <div className="tableau-conteneur">
                  <table className="tableau">
                    <thead>
                      <tr>
                        <th>Article</th>
                        <th className="nombre">Quantité</th>
                        <th className="nombre">Montant</th>
                      </tr>
                    </thead>
                    <tbody>
                      {donnees.top_articles_du_mois.map((a) => (
                        <tr key={a.id_article}>
                          <td>{a.designation}</td>
                          <td className="nombre">{a.quantite_vendue}</td>
                          <td className="nombre">{montant(a.chiffre_affaires)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="carte section">
              <h2>Stock bas</h2>
              {donnees.stock_bas.length === 0 ? (
                <p className="muted">Aucun article en stock bas.</p>
              ) : (
                <div className="tableau-conteneur">
                  <table className="tableau">
                    <thead>
                      <tr>
                        <th>Article</th>
                        <th className="nombre">Stock</th>
                        <th className="nombre">Seuil</th>
                      </tr>
                    </thead>
                    <tbody>
                      {donnees.stock_bas.map((a) => (
                        <tr key={a.id_article} className="alerte">
                          <td>{a.designation}</td>
                          <td className="nombre">
                            <strong>{a.quantite_stock}</strong>
                            {a.quantite_stock <= 0 && <span className="badge">Rupture</span>}
                          </td>
                          <td className="nombre">{a.seuil_alerte}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <p className="aide">
                <Link to="/stock">Voir tout le stock</Link> · <Link to="/fournisseurs">Enregistrer une livraison</Link>
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
