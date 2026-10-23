import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import Modal from '../components/Modal.jsx';
import Confirmation from '../components/Confirmation.jsx';
import { montant, dateFr } from '../format.js';
import '../components/ui.css';

const enNombre = (v) => Number(String(v).replace(/\s/g, '').replace(',', '.'));

// ------------------------------------------------------------
// Formulaire d'ajout / modification d'un article
// ------------------------------------------------------------
function FormulaireArticle({ article, onFerme, onEnregistre }) {
  const [form, setForm] = useState(() => ({
    designation: article ? article.designation : '',
    prix_achat: article ? String(article.prix_achat) : '',
    prix_vente_detail: article ? String(article.prix_vente_detail) : '',
    prix_vente_gros: article ? String(article.prix_vente_gros) : '',
    seuil_alerte: article ? String(article.seuil_alerte) : '',
  }));
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);

  const maj = (champ) => (e) => setForm((f) => ({ ...f, [champ]: e.target.value }));

  async function soumettre(e) {
    e.preventDefault();
    setErreur('');

    if (!form.designation.trim()) return setErreur('La désignation est requise');

    const lire = (v) => (String(v).trim() === '' ? 0 : enNombre(v));
    const corps = {
      designation: form.designation.trim(),
      prix_achat: lire(form.prix_achat),
      prix_vente_detail: lire(form.prix_vente_detail),
      prix_vente_gros: lire(form.prix_vente_gros),
      seuil_alerte: lire(form.seuil_alerte),
    };
    const nombres = [
      corps.prix_achat,
      corps.prix_vente_detail,
      corps.prix_vente_gros,
      corps.seuil_alerte,
    ];
    if (nombres.some((n) => isNaN(n) || n < 0)) {
      return setErreur('Les prix et le seuil doivent être des nombres positifs');
    }
    if (!Number.isInteger(corps.seuil_alerte)) {
      return setErreur('Le seuil d’alerte doit être un nombre entier');
    }

    setEnvoi(true);
    try {
      if (article) {
        await api(`/articles/${article.id_article}`, { method: 'PUT', body: corps });
      } else {
        await api('/articles', { method: 'POST', body: corps });
      }
      onEnregistre();
    } catch (err) {
      setErreur(err.message);
      setEnvoi(false);
    }
  }

  return (
    <form onSubmit={soumettre}>
      <div className="grille-champs">
        <label className="large">
          Désignation
          <input value={form.designation} onChange={maj('designation')} autoFocus />
        </label>
        <label>
          Prix d’achat (Ar)
          <input value={form.prix_achat} onChange={maj('prix_achat')} inputMode="decimal" />
        </label>
        <label>
          Seuil d’alerte (stock bas)
          <input value={form.seuil_alerte} onChange={maj('seuil_alerte')} inputMode="numeric" />
        </label>
        <label>
          Prix de vente détail (Ar)
          <input
            value={form.prix_vente_detail}
            onChange={maj('prix_vente_detail')}
            inputMode="decimal"
          />
        </label>
        <label>
          Prix de vente gros (Ar)
          <input
            value={form.prix_vente_gros}
            onChange={maj('prix_vente_gros')}
            inputMode="decimal"
          />
        </label>
      </div>

      <p className="aide">
        La quantité en stock ne se modifie pas ici : elle augmente avec les livraisons et diminue
        avec les ventes.
      </p>

      {erreur && <div className="erreur">{erreur}</div>}

      <div className="modal-actions">
        <button type="button" className="btn btn-secondaire" onClick={onFerme}>
          Annuler
        </button>
        <button type="submit" className="btn" disabled={envoi}>
          {envoi ? 'Enregistrement...' : 'Enregistrer'}
        </button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------
// Onglet 1 : stock actuel
// ------------------------------------------------------------
function StockActuel() {
  const [donnees, setDonnees] = useState(null);
  const [version, setVersion] = useState(0);
  const [erreur, setErreur] = useState('');
  const [q, setQ] = useState('');
  const [basSeulement, setBasSeulement] = useState(false);
  const [aSupprimer, setASupprimer] = useState(null); // article en attente de confirmation
  const [edition, setEdition] = useState(null); // null, ou { article } (article = null pour un nouvel article)

  useEffect(() => {
    let actif = true;
    api('/inventaire/stock')
      .then((d) => actif && setDonnees(d))
      .catch((e) => actif && setErreur(e.message));
    return () => {
      actif = false;
    };
  }, [version]);

  const recharger = () => setVersion((v) => v + 1);

  const visibles = useMemo(() => {
    if (!donnees) return [];
    const terme = q.trim().toLowerCase();
    return donnees.articles.filter(
      (a) =>
        a.designation.toLowerCase().includes(terme) && (!basSeulement || a.en_alerte)
    );
  }, [donnees, q, basSeulement]);

  async function supprimer(a) {
    setErreur('');
    try {
      await api(`/articles/${a.id_article}`, { method: 'DELETE' });
      recharger();
    } catch (e) {
      setErreur(e.message);
    }
    setASupprimer(null);
  }

  const nbAlerte = donnees ? donnees.articles.filter((a) => a.en_alerte).length : 0;

  return (
    <>
      {donnees && (
        <div className="stats">
          <div className="stat carte">
            <span className="muted">Articles</span>
            <strong>{donnees.totaux.nb_articles}</strong>
          </div>
          <div className="stat carte">
            <span className="muted">Valeur du stock (prix d’achat)</span>
            <strong>{montant(donnees.totaux.valeur_achat)}</strong>
          </div>
          <div className="stat carte">
            <span className="muted">Valeur du stock (prix de vente détail)</span>
            <strong>{montant(donnees.totaux.valeur_vente_detail)}</strong>
          </div>
          <div className={nbAlerte > 0 ? 'stat carte alerte' : 'stat carte'}>
            <span className="muted">Articles en stock bas</span>
            <strong>{nbAlerte}</strong>
          </div>
        </div>
      )}

      <div className="barre">
        <input
          className="recherche-liste"
          placeholder="Rechercher un article..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <label className="coche">
          <input
            type="checkbox"
            checked={basSeulement}
            onChange={(e) => setBasSeulement(e.target.checked)}
          />
          Stock bas seulement
        </label>
        <button className="btn pousse" onClick={() => setEdition({ article: null })}>
          + Nouvel article
        </button>
      </div>

      {erreur && <div className="erreur">{erreur}</div>}

      <div className="tableau-conteneur">
        <table className="tableau">
          <thead>
            <tr>
              <th>Désignation</th>
              <th className="nombre">Stock</th>
              <th className="nombre">Seuil</th>
              <th className="nombre">Prix d’achat</th>
              <th className="nombre">Prix détail</th>
              <th className="nombre">Prix gros</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {!donnees && !erreur && (
              <tr>
                <td colSpan="7" className="vide">
                  Chargement...
                </td>
              </tr>
            )}
            {donnees && visibles.length === 0 && (
              <tr>
                <td colSpan="7" className="vide">
                  Aucun article.
                </td>
              </tr>
            )}
            {visibles.map((a) => (
              <tr key={a.id_article} className={a.en_alerte ? 'alerte' : ''}>
                <td>{a.designation}</td>
                <td className="nombre">
                  <strong>{a.quantite_stock}</strong>
                  {a.quantite_stock <= 0 ? (
                    <span className="badge">Rupture</span>
                  ) : (
                    a.en_alerte && <span className="badge">Bas</span>
                  )}
                </td>
                <td className="nombre">{a.seuil_alerte}</td>
                <td className="nombre">{montant(a.prix_achat)}</td>
                <td className="nombre">{montant(a.prix_vente_detail)}</td>
                <td className="nombre">{montant(a.prix_vente_gros)}</td>
                <td>
                  <div className="actions-ligne">
                    <button className="lien-bouton" onClick={() => setEdition({ article: a })}>
                      Modifier
                    </button>
                    <button className="lien-bouton rouge" onClick={() => setASupprimer(a)}>
                      Supprimer
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {edition && (
        <Modal
          titre={edition.article ? 'Modifier l’article' : 'Nouvel article'}
          onFerme={() => setEdition(null)}
        >
          <FormulaireArticle
            article={edition.article}
            onFerme={() => setEdition(null)}
            onEnregistre={() => {
              setEdition(null);
              recharger();
            }}
          />
        </Modal>
      )}

      {aSupprimer && (
        <Confirmation
          titre="Supprimer l’article"
          message={`Voulez-vous vraiment supprimer « ${aSupprimer.designation} » ? Cette action est définitive.`}
          confirmer="Supprimer"
          danger
          onConfirmer={() => supprimer(aSupprimer)}
          onAnnuler={() => setASupprimer(null)}
        />
      )}
    </>
  );
}

// ------------------------------------------------------------
// Onglet 2 : inventaire par période (début, entrées, sorties, fin)
// ------------------------------------------------------------
const PERIODES = [
  ['jour', 'Aujourd’hui'],
  ['semaine', 'Cette semaine'],
  ['mois', 'Ce mois'],
  ['annee', 'Cette année'],
  ['perso', 'Dates précises'],
];

function Inventaire() {
  const [periode, setPeriode] = useState('jour');
  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState('');
  const [mouvementSeulement, setMouvementSeulement] = useState(false);

  let params = `?periode=${periode}`;
  if (periode === 'perso') params = du && au ? `?du=${du}&au=${au}` : null;

  useEffect(() => {
    if (params === null) return;
    let actif = true;
    api(`/inventaire/mouvements${params}`)
      .then((d) => {
        if (!actif) return;
        setErreur('');
        setDonnees(d);
      })
      .catch((e) => actif && setErreur(e.message));
    return () => {
      actif = false;
    };
  }, [params]);

  const lignes = donnees
    ? donnees.articles.filter((a) => !mouvementSeulement || a.entrees > 0 || a.sorties > 0)
    : [];

  return (
    <>
      <div className="barre">
        <div className="onglets">
          {PERIODES.map(([cle, libelle]) => (
            <button
              key={cle}
              className={periode === cle ? 'actif' : ''}
              onClick={() => setPeriode(cle)}
            >
              {libelle}
            </button>
          ))}
        </div>

        {periode === 'perso' && (
          <>
            <input type="date" value={du} onChange={(e) => setDu(e.target.value)} />
            <span className="muted">au</span>
            <input type="date" value={au} onChange={(e) => setAu(e.target.value)} />
          </>
        )}

        <label className="coche pousse">
          <input
            type="checkbox"
            checked={mouvementSeulement}
            onChange={(e) => setMouvementSeulement(e.target.checked)}
          />
          Seulement les articles avec mouvement
        </label>
      </div>

      {donnees && (
        <p className="muted">
          Période : du {dateFr(donnees.du)} au {dateFr(donnees.au)}
        </p>
      )}
      {periode === 'perso' && params === null && (
        <p className="muted">Choisissez les deux dates.</p>
      )}
      {erreur && <div className="erreur">{erreur}</div>}

      <div className="tableau-conteneur">
        <table className="tableau">
          <thead>
            <tr>
              <th>Désignation</th>
              <th className="nombre">Stock au début</th>
              <th className="nombre">Entrées</th>
              <th className="nombre">Sorties</th>
              <th className="nombre">Stock à la fin</th>
            </tr>
          </thead>
          <tbody>
            {!donnees && !erreur && (
              <tr>
                <td colSpan="5" className="vide">
                  Chargement...
                </td>
              </tr>
            )}
            {donnees && lignes.length === 0 && (
              <tr>
                <td colSpan="5" className="vide">
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
export default function Stock() {
  const [onglet, setOnglet] = useState('stock');

  return (
    <div>
      <div className="entete">
        <h1>Stock</h1>
        <div className="onglets">
          <button className={onglet === 'stock' ? 'actif' : ''} onClick={() => setOnglet('stock')}>
            Stock actuel
          </button>
          <button
            className={onglet === 'inventaire' ? 'actif' : ''}
            onClick={() => setOnglet('inventaire')}
          >
            Inventaire par période
          </button>
        </div>
      </div>

      {onglet === 'stock' ? <StockActuel /> : <Inventaire />}
    </div>
  );
}