import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import { useAuth } from '../auth-context.js';
import Modal from '../components/Modal.jsx';
import Confirmation from '../components/Confirmation.jsx';
import { montant, dateHeureFr } from '../format.js';
import '../components/ui.css';

const enNombre = (v) => Number(String(v).replace(/\s/g, '').replace(',', '.'));
const NOUVELLE = '__nouvelle__';
const AUTRE = '__autre__';
const CONDITIONNEMENTS = ['Carton', 'Boîte', 'Pack', 'Sac', 'Paquet'];

// Champ de prix avec « Ar » à droite
function ChampPrix({ libelle, valeur, onChange }) {
  return (
    <label>
      {libelle}
      <div className="champ-suffixe">
        <input value={valeur} onChange={onChange} inputMode="decimal" placeholder="0" />
        <span>Ar</span>
      </div>
    </label>
  );
}

// ------------------------------------------------------------
// Formulaire d'ajout / modification d'un produit
// ------------------------------------------------------------
function FormulaireArticle({ article, onFerme, onEnregistre }) {
  const conditionnementInitial = article ? article.conditionnement : 'Carton';

  const [form, setForm] = useState(() => ({
    designation: article ? article.designation : '',
    prix_achat: article ? String(article.prix_achat) : '',
    prix_vente_detail: article ? String(article.prix_vente_detail) : '',
    prix_vente_gros: article ? String(article.prix_vente_gros) : '',
    quantite_gros: article ? String(article.quantite_gros) : '1',
    seuil_alerte: article ? String(article.seuil_alerte) : '',
  }));
  const [categories, setCategories] = useState([]);
  const [choix, setChoix] = useState(article ? article.categorie : 'Autres');
  const [nouvelle, setNouvelle] = useState('');
  const [cond, setCond] = useState(
    CONDITIONNEMENTS.includes(conditionnementInitial) ? conditionnementInitial : AUTRE
  );
  const [condAutre, setCondAutre] = useState(
    CONDITIONNEMENTS.includes(conditionnementInitial) ? '' : conditionnementInitial
  );
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    let actif = true;
    api('/categories')
      .then((d) => actif && setCategories(d))
      .catch(() => {});
    return () => {
      actif = false;
    };
  }, []);

  const noms = categories.map((c) => c.nom_categorie);
  if (choix !== NOUVELLE && !noms.includes(choix)) noms.push(choix);

  const maj = (champ) => (e) => setForm((f) => ({ ...f, [champ]: e.target.value }));

  async function soumettre(e) {
    e.preventDefault();
    setErreur('');

    if (!form.designation.trim()) return setErreur('La désignation est requise');

    const categorie = choix === NOUVELLE ? nouvelle.trim() : choix;
    if (!categorie) return setErreur('Écrivez le nom de la nouvelle catégorie');

    const conditionnement = cond === AUTRE ? condAutre.trim() : cond;
    if (!conditionnement) return setErreur('Précisez le conditionnement (carton, boîte...)');

    const lire = (v, defaut = 0) => (String(v).trim() === '' ? defaut : enNombre(v));
    const corps = {
      designation: form.designation.trim(),
      categorie,
      prix_achat: lire(form.prix_achat),
      prix_vente_detail: lire(form.prix_vente_detail),
      prix_vente_gros: lire(form.prix_vente_gros),
      quantite_gros: lire(form.quantite_gros, 1),
      conditionnement,
      seuil_alerte: lire(form.seuil_alerte),
    };

    const prix = [corps.prix_achat, corps.prix_vente_detail, corps.prix_vente_gros];
    if (prix.some((n) => isNaN(n) || n < 0)) return setErreur('Les prix doivent être des nombres positifs');
    if (!Number.isInteger(corps.seuil_alerte) || corps.seuil_alerte < 0) {
      return setErreur('Le seuil d’alerte doit être un nombre entier');
    }
    if (!Number.isInteger(corps.quantite_gros) || corps.quantite_gros < 1) {
      return setErreur('Le nombre d’unités en gros doit être un entier supérieur ou égal à 1');
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
      <div className="form-section-titre">Le produit</div>
      <div className="grille-champs">
        <label className="large">
          Désignation
          <input value={form.designation} onChange={maj('designation')} autoFocus />
        </label>

        <label className={choix === NOUVELLE ? '' : 'large'}>
          Catégorie
          <select value={choix} onChange={(e) => setChoix(e.target.value)}>
            {noms.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
            <option value={NOUVELLE}>+ Nouvelle catégorie...</option>
          </select>
        </label>
        {choix === NOUVELLE && (
          <label>
            Nom de la nouvelle catégorie
            <input
              value={nouvelle}
              onChange={(e) => setNouvelle(e.target.value)}
              placeholder="Ex. : Hygiène"
              maxLength={60}
              autoFocus
            />
          </label>
        )}
      </div>

      <div className="form-section-titre">Prix, pour une unité</div>
      <div className="grille-3">
        <ChampPrix libelle="Prix d’achat" valeur={form.prix_achat} onChange={maj('prix_achat')} />
        <ChampPrix
          libelle="Vente au détail"
          valeur={form.prix_vente_detail}
          onChange={maj('prix_vente_detail')}
        />
        <ChampPrix
          libelle="Vente en gros"
          valeur={form.prix_vente_gros}
          onChange={maj('prix_vente_gros')}
        />
      </div>

      <div className="form-section-titre">Vente en gros</div>
      <div className="grille-champs">
        <label>
          Nombre d’unités en gros
          <input
            value={form.quantite_gros}
            onChange={maj('quantite_gros')}
            inputMode="numeric"
          />
          <span className="indice">Ex. : 6 bouteilles dans un pack</span>
        </label>
        <label>
          Conditionnement
          <select value={cond} onChange={(e) => setCond(e.target.value)}>
            {CONDITIONNEMENTS.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
            <option value={AUTRE}>Autre (écrire)...</option>
          </select>
        </label>
        {cond === AUTRE && (
          <label className="large">
            Écrivez le conditionnement
            <input
              value={condAutre}
              onChange={(e) => setCondAutre(e.target.value)}
              placeholder="Ex. : Casier, sachet, bidon..."
              maxLength={40}
              autoFocus
            />
          </label>
        )}
      </div>

      <div className="form-section-titre">Alerte de stock</div>
      <label style={{ maxWidth: 260 }}>
        Seuil d’alerte
        <input value={form.seuil_alerte} onChange={maj('seuil_alerte')} inputMode="numeric" placeholder="0" />
        <span className="indice">Le produit est signalé « stock bas » à partir de ce nombre.</span>
      </label>

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
// Correction du stock (responsable)
// ------------------------------------------------------------
const MOTIFS_CORRECTION = ['Erreur de comptage', 'Casse ou perte', 'Produit périmé', 'Vol', 'Autre'];

function FormulaireAjustement({ article, onFerme, onEnregistre }) {
  const [valeur, setValeur] = useState(String(article.quantite_stock));
  const [motif, setMotif] = useState('');
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);

  const q = Number(valeur);
  const valide = valeur.trim() !== '' && Number.isInteger(q) && q >= 0;
  const difference = valide ? q - article.quantite_stock : 0;

  async function soumettre(e) {
    e.preventDefault();
    setErreur('');
    if (!valide) return setErreur('Saisissez un nombre entier positif ou nul');
    if (difference === 0) return setErreur('Le stock saisi est identique au stock actuel');
    if (!motif.trim()) return setErreur('Indiquez le motif de la correction');
    setEnvoi(true);
    try {
      await api('/stock/ajuster', {
        method: 'POST',
        body: { id_article: article.id_article, nouvelle_quantite: q, motif: motif.trim() },
      });
      onEnregistre();
    } catch (err) {
      setErreur(err.message);
      setEnvoi(false);
    }
  }

  return (
    <form onSubmit={soumettre}>
      <div className="compte-ligne">
        <span>{article.designation}</span>
        <span>
          Stock actuel : <strong>{article.quantite_stock}</strong>
        </span>
      </div>

      <label className="espace-haut">
        Stock réel (après comptage)
        <input
          value={valeur}
          onChange={(e) => setValeur(e.target.value)}
          inputMode="numeric"
          autoFocus
          onFocus={(e) => e.target.select()}
        />
        {valide && difference !== 0 && (
          <span className={difference > 0 ? 'indice indice-plus' : 'indice indice-moins'}>
            {difference > 0
              ? `Il y a ${difference} de plus que prévu dans le logiciel`
              : `Il manque ${-difference} par rapport au logiciel`}
          </span>
        )}
      </label>

      <label>
        Motif de la correction
        <input
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
          maxLength={150}
          placeholder="Ex. : erreur de comptage"
        />
      </label>
      <div className="puces">
        {MOTIFS_CORRECTION.map((m) => (
          <button type="button" key={m} className="puce" onClick={() => setMotif(m)}>
            {m}
          </button>
        ))}
      </div>

      <p className="aide">Chaque correction est enregistrée dans l’historique, avec la date et son auteur.</p>

      {erreur && <div className="erreur">{erreur}</div>}
      <div className="modal-actions">
        <button type="button" className="btn btn-secondaire" onClick={onFerme}>
          Annuler
        </button>
        <button type="submit" className="btn" disabled={envoi}>
          {envoi ? 'Enregistrement...' : 'Corriger le stock'}
        </button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------
// Page
// ------------------------------------------------------------
export default function Stock() {
  const { user } = useAuth();
  const admin = user.role === 'RESPONSABLE';

  const [articles, setArticles] = useState(null);
  const [ajustements, setAjustements] = useState([]);
  const [version, setVersion] = useState(0);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');
  const [q, setQ] = useState('');
  const [basSeulement, setBasSeulement] = useState(false);
  const [edition, setEdition] = useState(null); // null, ou { article } (null = nouveau produit)
  const [correction, setCorrection] = useState(null); // produit dont on corrige le stock
  const [aSupprimer, setASupprimer] = useState(null);

  useEffect(() => {
    let actif = true;
    api('/articles')
      .then((d) => actif && setArticles(d))
      .catch((e) => actif && setErreur(e.message));
    return () => {
      actif = false;
    };
  }, [version]);

  useEffect(() => {
    if (!admin) return;
    let actif = true;
    api('/stock/ajustements?limite=10')
      .then((d) => actif && setAjustements(d))
      .catch(() => {});
    return () => {
      actif = false;
    };
  }, [admin, version]);

  const recharger = () => setVersion((v) => v + 1);
  const enAlerte = (a) => a.quantite_stock <= a.seuil_alerte;

  const visibles = useMemo(() => {
    if (!articles) return [];
    const terme = q.trim().toLowerCase();
    return articles.filter(
      (a) => a.designation.toLowerCase().includes(terme) && (!basSeulement || enAlerte(a))
    );
  }, [articles, q, basSeulement]);

  const nbAlerte = articles ? articles.filter(enAlerte).length : 0;

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

  const nbColonnes = 8;

  return (
    <div>
      <div className="entete">
        <h1>Stock</h1>
        <button
          className="btn"
          onClick={() => {
            setMessage('');
            setEdition({ article: null });
          }}
        >
          + Nouveau produit
        </button>
      </div>

      {articles && (
        <div className="stats">
          <div className="stat carte">
            <span className="muted">Produits</span>
            <strong>{articles.length}</strong>
          </div>
          <div className={nbAlerte > 0 ? 'stat carte alerte' : 'stat carte'}>
            <span className="muted">Produits en stock bas</span>
            <strong>{nbAlerte}</strong>
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
            checked={basSeulement}
            onChange={(e) => setBasSeulement(e.target.checked)}
          />
          Stock bas seulement
        </label>
      </div>

      {message && <div className="succes">{message}</div>}
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
              <th className="nombre">En gros</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {!articles && !erreur && (
              <tr>
                <td colSpan={nbColonnes} className="vide">
                  Chargement...
                </td>
              </tr>
            )}
            {articles && visibles.length === 0 && (
              <tr>
                <td colSpan={nbColonnes} className="vide">
                  Aucun produit.
                </td>
              </tr>
            )}
            {visibles.map((a) => (
              <tr key={a.id_article} className={enAlerte(a) ? 'alerte' : ''}>
                <td>{a.designation}</td>
                <td className="nombre">
                  <strong>{a.quantite_stock}</strong>
                  {a.quantite_stock <= 0 ? (
                    <span className="badge">Rupture</span>
                  ) : (
                    enAlerte(a) && <span className="badge">Bas</span>
                  )}
                </td>
                <td className="nombre">{a.seuil_alerte}</td>
                <td className="nombre">{montant(a.prix_achat)}</td>
                <td className="nombre">{montant(a.prix_vente_detail)}</td>
                <td className="nombre">{montant(a.prix_vente_gros)}</td>
                <td className="nombre">
                  {a.quantite_gros} <span className="muted">/ {a.conditionnement.toLowerCase()}</span>
                </td>
                <td>
                  <div className="actions-ligne">
                    {admin && (
                      <button
                        className="lien-bouton"
                        onClick={() => {
                          setMessage('');
                          setCorrection(a);
                        }}
                      >
                        Corriger le stock
                      </button>
                    )}
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

      {admin && (
        <div className="carte section espace-haut">
          <h2>Dernières corrections de stock</h2>
          <div className="tableau-conteneur">
            <table className="tableau">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Produit</th>
                  <th className="nombre">Avant</th>
                  <th className="nombre">Après</th>
                  <th>Motif</th>
                  <th>Par</th>
                </tr>
              </thead>
              <tbody>
                {ajustements.length === 0 && (
                  <tr>
                    <td colSpan="6" className="vide">
                      Aucune correction de stock pour le moment.
                    </td>
                  </tr>
                )}
                {ajustements.map((s) => (
                  <tr key={s.id_ajustement}>
                    <td>{dateHeureFr(s.date_ajustement)}</td>
                    <td>{s.designation}</td>
                    <td className="nombre">{s.quantite_avant}</td>
                    <td className="nombre">
                      <strong>{s.quantite_apres}</strong>{' '}
                      <span className={s.difference > 0 ? 'plus' : 'moins'}>
                        ({s.difference > 0 ? '+' : '−'}
                        {Math.abs(s.difference)})
                      </span>
                    </td>
                    <td>{s.motif}</td>
                    <td>{s.utilisateur}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {edition && (
        <Modal
          titre={edition.article ? 'Modifier le produit' : 'Nouveau produit'}
          onFerme={() => setEdition(null)}
          large
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

      {correction && (
        <Modal titre="Corriger le stock" onFerme={() => setCorrection(null)}>
          <FormulaireAjustement
            article={correction}
            onFerme={() => setCorrection(null)}
            onEnregistre={() => {
              setMessage(`Le stock de « ${correction.designation} » a été corrigé.`);
              setCorrection(null);
              recharger();
            }}
          />
        </Modal>
      )}

      {aSupprimer && (
        <Confirmation
          titre="Supprimer le produit"
          message={`Voulez-vous vraiment supprimer « ${aSupprimer.designation} » ? Cette action est définitive.`}
          confirmer="Supprimer"
          danger
          onConfirmer={() => supprimer(aSupprimer)}
          onAnnuler={() => setASupprimer(null)}
        />
      )}
    </div>
  );
}
