import { useEffect, useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth-context.js';
import SelecteurPeriode from '../components/SelecteurPeriode.jsx';
import { montant, dateFr } from '../format.js';
import { requetePeriode } from '../requete-periode.js';
import { genererInventairePdf, telechargerPdf } from '../inventaire-pdf.js';
import '../components/ui.css';

const deuxChiffres = (n) => String(n).padStart(2, '0');

// ------------------------------------------------------------
// Onglet 1 : inventaire du stock (tous les produits, de A à Z) + PDF
// ------------------------------------------------------------
function InventaireStock() {
  const { user } = useAuth();
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState('');
  const [q, setQ] = useState('');
  const [colonneCompte, setColonneCompte] = useState(false);
  const [generation, setGeneration] = useState(false);

  useEffect(() => {
    let actif = true;
    api('/inventaire/stock')
      .then((d) => actif && setDonnees(d))
      .catch((e) => actif && setErreur(e.message));
    return () => {
      actif = false;
    };
  }, []);

  // Ordre alphabétique, de A à Z
  const tous = useMemo(
    () =>
      donnees
        ? [...donnees.articles].sort((a, b) => a.designation.localeCompare(b.designation, 'fr'))
        : [],
    [donnees]
  );

  const visibles = useMemo(() => {
    const terme = q.trim().toLowerCase();
    return tous.filter((a) => a.designation.toLowerCase().includes(terme));
  }, [tous, q]);

  async function telecharger() {
    setGeneration(true);
    setErreur('');
    try {
      // Le PDF contient toujours tous les produits, quelle que soit la recherche affichée
      const octets = await genererInventairePdf({
        articles: tous,
        utilisateur: user.nom,
        colonneCompte,
      });
      const j = new Date();
      telechargerPdf(
        octets,
        `inventaire-${j.getFullYear()}-${deuxChiffres(j.getMonth() + 1)}-${deuxChiffres(j.getDate())}.pdf`
      );
    } catch (e) {
      setErreur(`Impossible de créer le PDF : ${e.message}`);
    } finally {
      setGeneration(false);
    }
  }

  const t = donnees ? donnees.totaux : null;

  return (
    <>
      {t && (
        <div className="stats">
          <div className="stat carte">
            <span className="muted">Produits</span>
            <strong>{t.nb_articles}</strong>
          </div>
          <div className={t.nb_a_reapprovisionner > 0 ? 'stat carte alerte' : 'stat carte'}>
            <span className="muted">À réapprovisionner</span>
            <strong>{t.nb_a_reapprovisionner}</strong>
          </div>
        </div>
      )}

      <div className="barre">
        <input
          className="recherche-liste"
          placeholder="Rechercher un produit..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <label className="coche">
          <input
            type="checkbox"
            checked={colonneCompte}
            onChange={(e) => setColonneCompte(e.target.checked)}
          />
          Ajouter une colonne « Compté » à remplir à la main (PDF)
        </label>
        <button className="btn pousse" onClick={telecharger} disabled={generation || !donnees}>
          <Download size={17} />
          {generation ? 'Création du PDF...' : 'Télécharger l’inventaire (PDF A4)'}
        </button>
      </div>

      {erreur && <div className="erreur">{erreur}</div>}

      <div className="tableau-conteneur">
        <table className="tableau">
          <thead>
            <tr>
              <th>Produit</th>
              <th className="nombre">Stock</th>
              <th className="nombre">Prix d’achat unitaire</th>
              <th className="nombre">Vente au détail</th>
              <th className="nombre">Vente en gros</th>
              <th>État</th>
            </tr>
          </thead>
          <tbody>
            {!donnees && !erreur && (
              <tr>
                <td colSpan="6" className="vide">
                  Chargement...
                </td>
              </tr>
            )}
            {donnees && visibles.length === 0 && (
              <tr>
                <td colSpan="6" className="vide">
                  Aucun produit.
                </td>
              </tr>
            )}
            {visibles.map((a) => (
              <tr key={a.id_article} className={a.statut !== 'OK' ? 'alerte' : ''}>
                <td>{a.designation}</td>
                <td className="nombre">
                  <strong>{a.quantite_stock}</strong>
                </td>
                <td className="nombre">{montant(a.prix_achat)}</td>
                <td className="nombre">{montant(a.prix_vente_detail)}</td>
                <td className="nombre">{montant(a.prix_vente_gros)}</td>
                <td>
                  {a.statut === 'RUPTURE' && <span className="badge sans-marge">Rupture</span>}
                  {a.statut === 'BAS' && <span className="badge sans-marge">Stock bas</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ------------------------------------------------------------
// Onglet 2 : mouvements du stock sur une période
// ------------------------------------------------------------
function Mouvements() {
  const [periode, setPeriode] = useState('jour');
  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState('');
  const [mouvementSeulement, setMouvementSeulement] = useState(false);

  const cle = requetePeriode(periode, du, au);

  useEffect(() => {
    if (cle === null) return;
    let actif = true;
    api(`/inventaire/mouvements?${cle}`)
      .then((d) => {
        if (!actif) return;
        setErreur('');
        setDonnees(d);
      })
      .catch((e) => actif && setErreur(e.message));
    return () => {
      actif = false;
    };
  }, [cle]);

  const lignes = donnees
    ? donnees.articles.filter((a) => !mouvementSeulement || a.entrees > 0 || a.sorties > 0 || a.ajustements !== 0)
    : [];

  return (
    <>
      <div className="barre">
        <SelecteurPeriode
          periode={periode}
          onPeriode={setPeriode}
          du={du}
          au={au}
          onDu={setDu}
          onAu={setAu}
        />
        <label className="coche pousse">
          <input
            type="checkbox"
            checked={mouvementSeulement}
            onChange={(e) => setMouvementSeulement(e.target.checked)}
          />
          Seulement les produits avec mouvement
        </label>
      </div>

      {donnees && (
        <p className="muted">
          Période : du {dateFr(donnees.du)} au {dateFr(donnees.au)}
        </p>
      )}
      {periode === 'perso' && cle === null && <p className="muted">Choisissez les deux dates.</p>}
      {erreur && <div className="erreur">{erreur}</div>}

      <div className="tableau-conteneur">
        <table className="tableau">
          <thead>
            <tr>
              <th>Produit</th>
              <th className="nombre">Stock au début</th>
              <th className="nombre">Entrées</th>
              <th className="nombre">Sorties</th>
              <th className="nombre">Corrections</th>
              <th className="nombre">Stock à la fin</th>
            </tr>
          </thead>
          <tbody>
            {!donnees && !erreur && (
              <tr>
                <td colSpan="6" className="vide">
                  Chargement...
                </td>
              </tr>
            )}
            {donnees && lignes.length === 0 && (
              <tr>
                <td colSpan="6" className="vide">
                  Aucun mouvement sur cette période.
                </td>
              </tr>
            )}
            {lignes.map((a) => (
              <tr key={a.id_article}>
                <td>{a.designation}</td>
                <td className="nombre">{a.stock_debut}</td>
                <td className="nombre">
                  {a.entrees > 0 ? <span className="plus">+{a.entrees}</span> : 0}
                </td>
                <td className="nombre">
                  {a.sorties > 0 ? <span className="moins">−{a.sorties}</span> : 0}
                </td>
                <td className="nombre">
                  {a.ajustements > 0 && <span className="plus">+{a.ajustements}</span>}
                  {a.ajustements < 0 && <span className="moins">−{-a.ajustements}</span>}
                  {a.ajustements === 0 && 0}
                </td>
                <td className="nombre">
                  <strong>{a.stock_fin}</strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ------------------------------------------------------------
// Page
// ------------------------------------------------------------
export default function Inventaire() {
  const [onglet, setOnglet] = useState('stock');

  return (
    <div>
      <div className="entete">
        <h1>Inventaire</h1>
        <div className="onglets">
          <button className={onglet === 'stock' ? 'actif' : ''} onClick={() => setOnglet('stock')}>
            Inventaire du stock
          </button>
          <button
            className={onglet === 'mouvements' ? 'actif' : ''}
            onClick={() => setOnglet('mouvements')}
          >
            Mouvements par période
          </button>
        </div>
      </div>

      {onglet === 'stock' ? <InventaireStock /> : <Mouvements />}
    </div>
  );
}
