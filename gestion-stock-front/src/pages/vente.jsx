import { useEffect, useMemo, useState } from 'react';
import { Search, ShoppingCart, Trash2, Minus, Plus, Printer } from 'lucide-react';
import { api } from '../api.js';
import ZoneImpression from '../components/Facture.jsx';
import { montant } from '../format.js';
import './Vente.css';

const arrondi = (n) => Math.round(n * 100) / 100;

// Nombre d'unités d'un lot de gros (1 si le produit n'en a pas de défini)
const lotDe = (a) => Math.max(1, Number(a.quantite_gros) || 1);
// « carton », « boîte », « pack »... selon le produit
const nomLot = (a) => (a.conditionnement || 'Lot').toLowerCase();

export default function Vente() {
  const [articles, setArticles] = useState([]);
  const [q, setQ] = useState('');
  const [categorie, setCategorie] = useState(''); // '' = Tous
  // Chaque ligne a son propre prix : en gros (case cochée) ou au détail
  const [panier, setPanier] = useState([]); // [{ id_article, quantite, en_gros }]
  const [recu, setRecu] = useState('');
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);
  const [facture, setFacture] = useState(null);

  function recharger() {
    return api('/articles')
      .then(setArticles)
      .catch((e) => setErreur(e.message));
  }

  useEffect(() => {
    let actif = true;
    api('/articles')
      .then((d) => actif && setArticles(d))
      .catch((e) => actif && setErreur(e.message));
    return () => {
      actif = false;
    };
  }, []);

  // Impression immédiate des deux factures dès que la vente est enregistrée
  useEffect(() => {
    if (facture) window.print();
  }, [facture]);

  const parId = useMemo(() => new Map(articles.map((a) => [a.id_article, a])), [articles]);
  const prixLigne = (l) => (l.en_gros ? l.art.prix_vente_gros : l.art.prix_vente_detail);
  // Une ligne en gros avance par lots complets (+6, -6...) ; au détail, d'une unité
  const pasDe = (l) => (l.en_gros ? lotDe(l.art) : 1);

  // Catégories présentes dans le catalogue, « Autres » en dernier
  const categories = useMemo(() => {
    const noms = [...new Set(articles.map((a) => a.categorie))];
    return noms.sort((a, b) => (a === 'Autres') - (b === 'Autres') || a.localeCompare(b, 'fr'));
  }, [articles]);

  const visibles = useMemo(() => {
    const terme = q.trim().toLowerCase();
    return articles.filter(
      (a) =>
        (!categorie || a.categorie === categorie) && a.designation.toLowerCase().includes(terme)
    );
  }, [articles, q, categorie]);

  const lignes = panier
    .map((l) => ({ ...l, art: parId.get(l.id_article) }))
    .filter((l) => l.art);

  const total = arrondi(lignes.reduce((s, l) => s + l.quantite * prixLigne(l), 0));
  const ligneSansPrix = lignes.find((l) => !(prixLigne(l) > 0));
  const nbArticles = lignes.reduce((s, l) => s + l.quantite, 0);

  const recuNum = Number(String(recu).replace(/\s/g, '').replace(',', '.'));
  const recuValide = recu.trim() !== '' && !isNaN(recuNum) && recuNum >= 0;
  const reste = arrondi(recuNum - total);
  const peutValider =
    lignes.length > 0 && !ligneSansPrix && recuValide && reste >= 0 && !envoi;

  function ajouter(a) {
    setErreur('');
    setPanier((p) => {
      const existant = p.find((l) => l.id_article === a.id_article);
      if (!existant) {
        // Un produit qui n'a qu'un prix de gros est ajouté directement en gros (un lot)
        const seulementGros = !(a.prix_vente_detail > 0) && a.prix_vente_gros > 0;
        return [
          {
            id_article: a.id_article,
            quantite: seulementGros ? Math.min(lotDe(a), a.quantite_stock) : 1,
            en_gros: seulementGros,
          },
          ...p,
        ];
      }
      // Produit déjà dans le panier : on ajoute une unité (ou un lot) et il remonte en haut
      const pas = existant.en_gros ? lotDe(a) : 1;
      const mis = { ...existant, quantite: Math.min(existant.quantite + pas, a.quantite_stock) };
      return [mis, ...p.filter((l) => l.id_article !== a.id_article)];
    });
  }

  function definirQuantite(a, valeur) {
    let v = parseInt(valeur, 10);
    if (isNaN(v) || v < 1) v = 1;
    if (v > a.quantite_stock) v = a.quantite_stock;
    setPanier((p) => p.map((l) => (l.id_article === a.id_article ? { ...l, quantite: v } : l)));
  }

  // Cocher « En gros » : la quantité devient celle d'un lot (modifiable ensuite)
  function basculerGros(id) {
    const art = parId.get(id);
    if (!art) return;
    const lot = lotDe(art);
    setPanier((p) =>
      p.map((l) => {
        if (l.id_article !== id) return l;
        if (!l.en_gros) {
          return { ...l, en_gros: true, quantite: Math.max(1, Math.min(lot, art.quantite_stock)) };
        }
        // Retour au détail : si la quantité était celle d'un lot, on revient à 1
        return { ...l, en_gros: false, quantite: l.quantite === lot ? 1 : l.quantite };
      })
    );
  }

  function retirer(id) {
    setPanier((p) => p.filter((l) => l.id_article !== id));
  }

  function viderPanier() {
    setPanier([]);
    setRecu('');
    setErreur('');
  }

  function toucheRecherche(e) {
    if (e.key === 'Enter' && visibles.length === 1) {
      const a = visibles[0];
      if (a.quantite_stock > 0) {
        ajouter(a);
        setQ('');
      }
    }
  }

  function toucheRecu(e) {
    if (e.key === 'Enter' && peutValider) valider();
  }

  async function valider() {
    setEnvoi(true);
    setErreur('');
    try {
      const f = await api('/ventes', {
        method: 'POST',
        body: {
          montant_recu: recuNum,
          lignes: panier.map(({ id_article, quantite, en_gros }) => ({
            id_article,
            quantite,
            en_gros,
          })),
        },
      });
      setFacture(f);
      setPanier([]);
      setRecu('');
      recharger();
    } catch (e) {
      setErreur(e.message);
      recharger(); // le stock a peut-être changé
    } finally {
      setEnvoi(false);
    }
  }

  // ---------- Vente enregistrée ----------
  if (facture) {
    return (
      <div className="confirmation-centre">
      <div className="carte confirmation">
        <h1>Vente enregistrée</h1>
        <p>
          Facture <strong>{facture.numero_facture}</strong>
        </p>

        <table className="mini-table">
          <tbody>
            {facture.lignes.map((l, i) => (
              <tr key={i}>
                <td>
                  {l.designation}
                  {l.type_prix === 'GROS' && <span className="etiquette">gros</span>}
                </td>
                <td className="droite">
                  {l.quantite_vendue} × {montant(l.prix_unitaire_applique)}
                </td>
                <td className="droite">{montant(l.total_ligne)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="recap">
          <div>
            <span>Total</span>
            <strong>{montant(facture.total)}</strong>
          </div>
          <div>
            <span>Reçu</span>
            <strong>{montant(facture.montant_recu)}</strong>
          </div>
          <div className="recap-monnaie">
            <span>Monnaie à rendre</span>
            <strong>{montant(facture.monnaie_rendue)}</strong>
          </div>
        </div>

        <div className="actions">
          <button className="btn" onClick={() => setFacture(null)} autoFocus>
            Nouvelle vente
          </button>
          <button className="btn btn-secondaire" onClick={() => window.print()}>
            <Printer size={17} />
            Réimprimer les 2 factures
          </button>
        </div>
        <ZoneImpression facture={facture} />
      </div>
      </div>
    );
  }

  // ---------- Caisse ----------
  return (
    <div className="vente">
      <section className="vente-catalogue">
        <div className="recherche-boite">
          <Search size={19} />
          <input
            className="recherche"
            placeholder="Rechercher un produit..."
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={toucheRecherche}
            autoFocus
          />
        </div>

        {categories.length > 0 && (
          <div className="categories" role="tablist" aria-label="Catégories">
            <button
              role="tab"
              aria-selected={categorie === ''}
              className={categorie === '' ? 'categorie-chip actif' : 'categorie-chip'}
              onClick={() => setCategorie('')}
            >
              Tous
            </button>
            {categories.map((c) => (
              <button
                key={c}
                role="tab"
                aria-selected={categorie === c}
                className={categorie === c ? 'categorie-chip actif' : 'categorie-chip'}
                onClick={() => setCategorie(c)}
              >
                {c}
              </button>
            ))}
          </div>
        )}

        <div className="liste-articles">
          {visibles.map((a) => {
            const rupture = a.quantite_stock <= 0;
            const sansPrix = !(a.prix_vente_detail > 0) && !(a.prix_vente_gros > 0);
            return (
              <button
                key={a.id_article}
                className="article"
                disabled={rupture || sansPrix}
                onClick={() => ajouter(a)}
              >
                <span className="article-nom">{a.designation}</span>
                {sansPrix ? (
                  <span className="article-stock bas">Prix non défini</span>
                ) : (
                  <span className="prix-doubles">
                    <span>
                      <small>Détail</small>
                      {a.prix_vente_detail > 0 ? montant(a.prix_vente_detail) : '—'}
                    </span>
                    <span className="gros">
                      <small>Gros</small>
                      {a.prix_vente_gros > 0 ? montant(a.prix_vente_gros) : '—'}
                      {a.prix_vente_gros > 0 && lotDe(a) > 1 && (
                        <span className="lot"> · {nomLot(a)} de {lotDe(a)}</span>
                      )}
                    </span>
                  </span>
                )}
                <span
                  className={
                    rupture || a.quantite_stock <= a.seuil_alerte
                      ? 'article-stock bas'
                      : 'article-stock'
                  }
                >
                  {rupture ? 'Rupture de stock' : `Stock : ${a.quantite_stock}`}
                </span>
              </button>
            );
          })}
          {visibles.length === 0 && <p className="muted">Aucun produit trouvé.</p>}
        </div>
      </section>

      <aside className="panier carte">
        <div className="panier-entete">
          <h2>
            <ShoppingCart size={19} />
            Panier
            {nbArticles > 0 && <span className="compteur">{nbArticles}</span>}
          </h2>
          {lignes.length > 0 && (
            <button className="lien-bouton" onClick={viderPanier}>
              Vider
            </button>
          )}
        </div>

        <div className="panier-lignes">
          {lignes.length === 0 && (
            <p className="muted">Cliquez sur un produit pour l’ajouter au panier.</p>
          )}
          {lignes.map((l) => {
            const prix = prixLigne(l);
            const aGros = l.art.prix_vente_gros > 0;
            const lot = lotDe(l.art);
            const pas = pasDe(l);
            return (
              <div className="ligne" key={l.id_article}>
                <div className="ligne-haut">
                  <span className="ligne-nom">{l.art.designation}</span>
                  <strong className="ligne-montant">{montant(l.quantite * prix)}</strong>
                  <button
                    className="icone-bouton"
                    onClick={() => retirer(l.id_article)}
                    aria-label="Retirer du panier"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>

                <div className="ligne-bas">
                  <div className="quantite">
                    <button
                      onClick={() => definirQuantite(l.art, l.quantite - pas)}
                      aria-label="Moins"
                      title={pas > 1 ? `Retirer un ${nomLot(l.art)} de ${pas}` : 'Retirer 1'}
                    >
                      <Minus size={13} />
                    </button>
                    <input
                      value={l.quantite}
                      onChange={(e) => definirQuantite(l.art, e.target.value)}
                      inputMode="numeric"
                    />
                    <button
                      onClick={() => definirQuantite(l.art, l.quantite + pas)}
                      disabled={l.quantite >= l.art.quantite_stock}
                      aria-label="Plus"
                      title={pas > 1 ? `Ajouter un ${nomLot(l.art)} de ${pas}` : 'Ajouter 1'}
                    >
                      <Plus size={13} />
                    </button>
                  </div>

                  <label
                    className={l.en_gros ? 'chip-gros actif' : 'chip-gros'}
                    title={aGros ? 'Cocher pour le prix de gros' : 'Pas de prix de gros pour ce produit'}
                  >
                    <input
                      type="checkbox"
                      checked={l.en_gros}
                      disabled={!aGros}
                      onChange={() => basculerGros(l.id_article)}
                    />
                    En gros
                  </label>

                  <span className="ligne-prix">
                    {prix > 0 ? `${montant(prix)} l’unité` : 'Prix non défini'}
                    {l.en_gros && lot > 1 && ` · ${nomLot(l.art)} de ${lot}`}
                    {l.en_gros && l.art.quantite_stock < lot && ` · stock inférieur à un ${nomLot(l.art)}`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        <div className="panier-total">
          <span>Total</span>
          <strong>{montant(total)}</strong>
        </div>

        <label className="recu">
          Argent donné par le client
          <input
            value={recu}
            onChange={(e) => setRecu(e.target.value)}
            onKeyDown={toucheRecu}
            inputMode="decimal"
            placeholder="0"
          />
        </label>
        <button
          className="lien-bouton"
          onClick={() => setRecu(String(total))}
          disabled={total === 0}
        >
          Montant exact
        </button>

        <div className={recuValide && reste < 0 ? 'monnaie manque' : 'monnaie'}>
          {!recuValide || lignes.length === 0 ? (
            <span className="muted">Monnaie à rendre : —</span>
          ) : reste >= 0 ? (
            <>
              <span>Monnaie à rendre</span>
              <strong>{montant(reste)}</strong>
            </>
          ) : (
            <>
              <span>Il manque</span>
              <strong>{montant(-reste)}</strong>
            </>
          )}
        </div>

        {ligneSansPrix && (
          <div className="erreur">
            « {ligneSansPrix.art.designation} » n’a pas de prix{' '}
            {ligneSansPrix.en_gros ? 'de gros' : 'de détail'}.
          </div>
        )}
        {erreur && <div className="erreur">{erreur}</div>}

        <button className="btn btn-valider" onClick={valider} disabled={!peutValider}>
          {envoi ? 'Enregistrement...' : 'Valider la vente'}
        </button>
      </aside>
    </div>
  );
}
