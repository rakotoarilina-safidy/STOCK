import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import Modal from '../components/Modal.jsx';
import Confirmation from '../components/Confirmation.jsx';
import SelecteurPeriode from '../components/SelecteurPeriode.jsx';
import ZoneImpression from '../components/Facture.jsx';
import { montant, dateHeureFr } from '../format.js';
import { requetePeriode } from '../requete-periode.js';
import '../components/ui.css';

const typeVente = (t) => ({ GROS: 'Gros', MIXTE: 'Mixte' })[t] || 'Détail';

// ------------------------------------------------------------
// Modification d'une vente (le client change d'avis)
// ------------------------------------------------------------
const enNombre = (v) => Number(String(v).replace(/\s/g, '').replace(',', '.'));
const arrondi = (n) => Math.round(n * 100) / 100;

function FormulaireModificationVente({ facture, onFerme, onFait }) {
  const [articles, setArticles] = useState([]);
  const [lignes, setLignes] = useState(() =>
    facture.lignes.map((l) => ({
      id_article: l.id_article,
      designation: l.designation,
      quantite: String(l.quantite_vendue),
      en_gros: l.type_prix === 'GROS',
      prixOrigine: l.prix_unitaire_applique,
      typeOrigine: l.type_prix,
    }))
  );
  const [recu, setRecu] = useState(String(facture.montant_recu));
  const [q, setQ] = useState('');
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    let actif = true;
    api('/articles')
      .then((d) => actif && setArticles(d))
      .catch((e) => actif && setErreur(e.message));
    return () => {
      actif = false;
    };
  }, []);

  const parId = useMemo(() => new Map(articles.map((a) => [a.id_article, a])), [articles]);

  // Le stock disponible pour cette vente = stock actuel + ce que la vente avait déjà pris
  const dejaPris = (id) =>
    facture.lignes.filter((l) => l.id_article === id).reduce((s, l) => s + l.quantite_vendue, 0);
  const disponible = (id) => (parId.has(id) ? parId.get(id).quantite_stock + dejaPris(id) : 0);

  // Une ligne qui existait déjà garde son prix d'origine (comme le serveur)
  const prixLigne = (l) => {
    const type = l.en_gros ? 'GROS' : 'DETAIL';
    if (l.prixOrigine !== undefined && l.typeOrigine === type) return l.prixOrigine;
    const art = parId.get(l.id_article);
    if (!art) return 0;
    return l.en_gros ? art.prix_vente_gros : art.prix_vente_detail;
  };

  const total = arrondi(lignes.reduce((s, l) => s + (Number(l.quantite) || 0) * prixLigne(l), 0));
  const recuNum = enNombre(recu);
  const recuValide = recu.trim() !== '' && !isNaN(recuNum) && recuNum >= 0;
  const reste = arrondi(recuNum - total);

  const propositions = useMemo(() => {
    const terme = q.trim().toLowerCase();
    if (!terme) return [];
    return articles
      .filter(
        (a) =>
          a.designation.toLowerCase().includes(terme) &&
          !lignes.some((l) => l.id_article === a.id_article)
      )
      .slice(0, 6);
  }, [q, articles, lignes]);

  const majLigne = (id, champ, valeur) =>
    setLignes((ls) => ls.map((l) => (l.id_article === id ? { ...l, [champ]: valeur } : l)));

  function ajouter(a) {
    setLignes((ls) => [
      { id_article: a.id_article, designation: a.designation, quantite: '1', en_gros: false },
      ...ls,
    ]);
    setQ('');
  }

  function toucheRecherche(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (propositions.length === 1) ajouter(propositions[0]);
  }

  async function soumettre(e) {
    e.preventDefault();
    setErreur('');
    if (lignes.length === 0) return setErreur('La vente doit contenir au moins un produit (sinon, supprimez-la)');
    for (const l of lignes) {
      const qte = Number(l.quantite);
      if (!Number.isInteger(qte) || qte <= 0) return setErreur(`Quantité invalide pour « ${l.designation} »`);
      if (qte > disponible(l.id_article)) {
        return setErreur(`Stock insuffisant pour « ${l.designation} » : ${disponible(l.id_article)} disponible(s)`);
      }
      if (!(prixLigne(l) > 0)) return setErreur(`Pas de prix ${l.en_gros ? 'de gros' : 'de détail'} pour « ${l.designation} »`);
    }
    if (!recuValide || reste < 0) return setErreur('L’argent donné par le client ne couvre pas le total');

    setEnvoi(true);
    try {
      await api(`/ventes/${facture.id_vente}`, {
        method: 'PUT',
        body: {
          montant_recu: recuNum,
          lignes: lignes.map((l) => ({
            id_article: l.id_article,
            quantite: Number(l.quantite),
            en_gros: l.en_gros,
          })),
        },
      });
      onFait();
    } catch (err) {
      setErreur(err.message);
      setEnvoi(false);
    }
  }

  return (
    <form onSubmit={soumettre}>
      <div className="recherche-article">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={toucheRecherche}
          placeholder="Ajouter un produit..."
        />
        {propositions.length > 0 && (
          <div className="propositions">
            {propositions.map((a) => (
              <button type="button" key={a.id_article} onClick={() => ajouter(a)}>
                {a.designation}
                <span className="muted"> — stock : {a.quantite_stock}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="tableau-conteneur">
        <table className="tableau">
          <thead>
            <tr>
              <th>Produit</th>
              <th className="nombre">Quantité</th>
              <th>En gros</th>
              <th className="nombre">Prix unitaire</th>
              <th className="nombre">Total</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lignes.length === 0 && (
              <tr>
                <td colSpan="6" className="vide">
                  Aucun produit.
                </td>
              </tr>
            )}
            {lignes.map((l) => {
              const art = parId.get(l.id_article);
              const aGros = art ? art.prix_vente_gros > 0 : l.en_gros;
              return (
                <tr key={l.id_article}>
                  <td>{l.designation}</td>
                  <td className="nombre">
                    <input
                      className="champ-table"
                      value={l.quantite}
                      onChange={(e) => majLigne(l.id_article, 'quantite', e.target.value)}
                      inputMode="numeric"
                    />
                  </td>
                  <td>
                    <input
                      type="checkbox"
                      checked={l.en_gros}
                      disabled={!aGros}
                      onChange={() => majLigne(l.id_article, 'en_gros', !l.en_gros)}
                    />
                  </td>
                  <td className="nombre">{montant(prixLigne(l))}</td>
                  <td className="nombre">{montant((Number(l.quantite) || 0) * prixLigne(l))}</td>
                  <td>
                    <button
                      type="button"
                      className="lien-bouton rouge"
                      onClick={() => setLignes((ls) => ls.filter((x) => x.id_article !== l.id_article))}
                      aria-label="Retirer"
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="total-livraison">
        <span>Total</span>
        <strong>{montant(total)}</strong>
      </div>

      <label className="espace-haut">
        Argent donné par le client (Ar)
        <input value={recu} onChange={(e) => setRecu(e.target.value)} inputMode="decimal" />
        {recuValide && (
          <span className={reste >= 0 ? 'indice indice-plus' : 'indice indice-moins'}>
            {reste >= 0 ? `Monnaie à rendre : ${montant(reste)}` : `Il manque ${montant(-reste)}`}
          </span>
        )}
      </label>

      <p className="aide">
        Le stock est remis à jour : les anciennes quantités reviennent en stock, les nouvelles en sortent.
        Le numéro de facture reste le même.
      </p>

      {erreur && <div className="erreur">{erreur}</div>}
      <div className="modal-actions">
        <button type="button" className="btn btn-secondaire" onClick={onFerme}>
          Annuler
        </button>
        <button type="submit" className="btn" disabled={envoi}>
          {envoi ? 'Enregistrement...' : 'Enregistrer les modifications'}
        </button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------
// Détail d'une facture + réimpression, modification et suppression
// ------------------------------------------------------------
function DetailFacture({ id, onFerme, onChange }) {
  const [f, setF] = useState(null);
  const [erreur, setErreur] = useState('');
  const [version, setVersion] = useState(0);
  const [modification, setModification] = useState(false);
  const [suppression, setSuppression] = useState(false);

  useEffect(() => {
    let actif = true;
    api(`/ventes/${id}`)
      .then((x) => actif && setF(x))
      .catch((e) => actif && setErreur(e.message));
    return () => {
      actif = false;
    };
  }, [id, version]);

  // Seules les ventes du jour peuvent être modifiées ou supprimées
  const duJour = f && new Date(f.date_vente).toDateString() === new Date().toDateString();

  async function supprimer() {
    setErreur('');
    try {
      await api(`/ventes/${id}`, { method: 'DELETE' });
      onChange();
      onFerme();
    } catch (e) {
      setErreur(e.message);
    }
    setSuppression(false);
  }

  return (
    <Modal titre={f ? `Facture ${f.numero_facture}` : 'Facture'} onFerme={onFerme} large>
      {erreur && <div className="erreur">{erreur}</div>}
      {!f && !erreur && <p className="muted">Chargement...</p>}

      {f && (
        <>
          <p>
            {dateHeureFr(f.date_facture || f.date_vente)} — vente {typeVente(f.type_vente).toLowerCase()}
            <br />
            <span className="muted">Caissier : {f.caissier}</span>
          </p>

          <div className="tableau-conteneur">
            <table className="tableau">
              <thead>
                <tr>
                  <th>Article</th>
                  <th className="nombre">Quantité</th>
                  <th className="nombre">Prix unitaire</th>
                  <th className="nombre">Total</th>
                </tr>
              </thead>
              <tbody>
                {f.lignes.map((l, i) => (
                  <tr key={i}>
                    <td>
                      {l.designation}
                      {l.type_prix === 'GROS' && <span className="etiquette">gros</span>}
                    </td>
                    <td className="nombre">{l.quantite_vendue}</td>
                    <td className="nombre">{montant(l.prix_unitaire_applique)}</td>
                    <td className="nombre">{montant(l.total_ligne)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="resume-facture">
            <div className="gros">
              <span>Total</span>
              <span>{montant(f.total)}</span>
            </div>
            <div>
              <span>Argent reçu</span>
              <span>{montant(f.montant_recu)}</span>
            </div>
            <div>
              <span>Monnaie rendue</span>
              <span>{montant(f.monnaie_rendue)}</span>
            </div>
          </div>

          {!duJour && (
            <p className="aide">Seules les ventes d’aujourd’hui peuvent être modifiées ou supprimées.</p>
          )}

          <ZoneImpression facture={f} />
        </>
      )}

      <div className="modal-actions">
        <button className="btn btn-secondaire" onClick={onFerme}>
          Fermer
        </button>
        {f && duJour && (
          <>
            <button className="btn btn-secondaire" onClick={() => setSuppression(true)}>
              Supprimer
            </button>
            <button className="btn btn-secondaire" onClick={() => setModification(true)}>
              Modifier
            </button>
          </>
        )}
        {f && (
          <button className="btn" onClick={() => window.print()}>
            Imprimer les 2 factures
          </button>
        )}
      </div>

      {modification && f && (
        <Modal titre={`Modifier la vente ${f.numero_facture}`} onFerme={() => setModification(false)} large>
          <FormulaireModificationVente
            facture={f}
            onFerme={() => setModification(false)}
            onFait={() => {
              setModification(false);
              setVersion((v) => v + 1);
              onChange();
            }}
          />
        </Modal>
      )}

      {suppression && f && (
        <Confirmation
          titre="Supprimer la vente"
          message={`Voulez-vous vraiment supprimer la vente ${f.numero_facture} ? Le client annule : les produits reviennent en stock et la vente disparaît des comptes.`}
          confirmer="Supprimer"
          danger
          onConfirmer={supprimer}
          onAnnuler={() => setSuppression(false)}
        />
      )}
    </Modal>
  );
}

// ------------------------------------------------------------
// Page
// ------------------------------------------------------------
export default function Factures() {
  const [periode, setPeriode] = useState('jour');
  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState('');
  const [q, setQ] = useState('');
  const [detail, setDetail] = useState(null);
  const [version, setVersion] = useState(0);

  const cle = requetePeriode(periode, du, au);

  useEffect(() => {
    if (cle === null) return;
    let actif = true;
    api(`/ventes?${cle}`)
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

  const visibles = useMemo(() => {
    if (!donnees) return [];
    const terme = q.trim().toLowerCase();
    return donnees.ventes.filter((v) => v.numero_facture.toLowerCase().includes(terme));
  }, [donnees, q]);

  return (
    <div>
      <div className="entete">
        <h1>Factures</h1>
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
          placeholder="Rechercher un numéro de facture..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {periode === 'perso' && cle === null && <p className="muted">Choisissez les deux dates.</p>}

      {donnees && (
        <div className="stats">
          <div className="stat carte">
            <span className="muted">Factures</span>
            <strong>{donnees.ventes.length}</strong>
          </div>
          <div className="stat carte">
            <span className="muted">Total des ventes</span>
            <strong>{montant(donnees.total_periode)}</strong>
          </div>
        </div>
      )}

      {erreur && <div className="erreur">{erreur}</div>}

      <div className="tableau-conteneur">
        <table className="tableau">
          <thead>
            <tr>
              <th>N° facture</th>
              <th>Date et heure</th>
              <th>Type</th>
              <th>Caissier</th>
              <th className="nombre">Montant</th>
              <th />
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
                  Aucune facture sur cette période.
                </td>
              </tr>
            )}
            {visibles.map((v) => (
              <tr key={v.id_vente}>
                <td>
                  <strong>{v.numero_facture}</strong>
                </td>
                <td>{dateHeureFr(v.date_vente)}</td>
                <td>{typeVente(v.type_vente)}</td>
                <td>{v.caissier}</td>
                <td className="nombre">{montant(v.montant_total)}</td>
                <td>
                  <div className="actions-ligne">
                    <button className="lien-bouton" onClick={() => setDetail(v.id_vente)}>
                      Voir / Réimprimer
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {detail && (
        <DetailFacture
          id={detail}
          onFerme={() => setDetail(null)}
          onChange={() => setVersion((v) => v + 1)}
        />
      )}
    </div>
  );
}
