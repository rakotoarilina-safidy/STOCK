import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import ZoneImpression from '../components/Facture.jsx';
import './Vente.css';

const montant = (n) =>
  `${new Intl.NumberFormat('fr-FR').format(Math.round(Number(n) || 0))} Ar`;
const arrondi = (n) => Math.round(n * 100) / 100;

export default function Vente() {
  const [articles, setArticles] = useState([]);
  const [q, setQ] = useState('');
  const [type, setType] = useState('DETAIL'); // DETAIL ou GROS
  const [panier, setPanier] = useState([]); // [{ id_article, quantite }]
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

  // Impression automatique des deux factures dès que la vente est enregistrée
  useEffect(() => {
    if (!facture) return;
    const minuterie = setTimeout(() => window.print(), 400);
    return () => clearTimeout(minuterie);
  }, [facture]);

  const parId = useMemo(() => new Map(articles.map((a) => [a.id_article, a])), [articles]);
  const prixDe = (a) => (type === 'GROS' ? a.prix_vente_gros : a.prix_vente_detail);

  const visibles = useMemo(() => {
    const terme = q.trim().toLowerCase();
    return articles.filter((a) => a.designation.toLowerCase().includes(terme));
  }, [articles, q]);

  const lignes = panier
    .map((l) => ({ ...l, art: parId.get(l.id_article) }))
    .filter((l) => l.art);

  const total = arrondi(lignes.reduce((s, l) => s + l.quantite * prixDe(l.art), 0));
  const sansPrix = lignes.some((l) => !(prixDe(l.art) > 0));

  const recuNum = Number(String(recu).replace(/\s/g, '').replace(',', '.'));
  const recuValide = recu.trim() !== '' && !isNaN(recuNum) && recuNum >= 0;
  const reste = arrondi(recuNum - total);
  const peutValider = lignes.length > 0 && !sansPrix && recuValide && reste >= 0 && !envoi;

  function ajouter(a) {
    setErreur('');
    setPanier((p) => {
      const existant = p.find((l) => l.id_article === a.id_article);
      if (!existant) return [...p, { id_article: a.id_article, quantite: 1 }];
      if (existant.quantite >= a.quantite_stock) return p;
      return p.map((l) =>
        l.id_article === a.id_article ? { ...l, quantite: l.quantite + 1 } : l
      );
    });
  }

  function changerQuantite(a, valeur) {
    let v = parseInt(valeur, 10);
    if (isNaN(v) || v < 1) v = 1;
    if (v > a.quantite_stock) v = a.quantite_stock;
    setPanier((p) => p.map((l) => (l.id_article === a.id_article ? { ...l, quantite: v } : l)));
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
      if (a.quantite_stock > 0 && prixDe(a) > 0) {
        ajouter(a);
        setQ('');
      }
    }
  }

  async function valider() {
    setEnvoi(true);
    setErreur('');
    try {
      const f = await api('/ventes', {
        method: 'POST',
        body: {
          type_vente: type,
          montant_recu: recuNum,
          lignes: panier.map(({ id_article, quantite }) => ({ id_article, quantite })),
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
      <div className="carte confirmation">
        <h1>Vente enregistrée</h1>
        <p>
          Facture <strong>{facture.numero_facture}</strong>
        </p>

        <table className="mini-table">
          <tbody>
            {facture.lignes.map((l, i) => (
              <tr key={i}>
                <td>{l.designation}</td>
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

        <p className="muted">
          Les deux factures (client et magasin) sont envoyées à l’imprimante.
        </p>
        <div className="actions">
          <button className="btn" onClick={() => setFacture(null)} autoFocus>
            Nouvelle vente
          </button>
          <button className="btn btn-secondaire" onClick={() => window.print()}>
            Réimprimer les 2 factures
          </button>
        </div>
        <ZoneImpression facture={facture} />
      </div>
    );
  }

  // ---------- Caisse ----------
  return (
    <div className="vente">
      <section className="vente-catalogue">
        <input
          className="recherche"
          placeholder="Rechercher un produit..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={toucheRecherche}
          autoFocus
        />

        <div className="liste-articles">
          {visibles.map((a) => {
            const prix = prixDe(a);
            const rupture = a.quantite_stock <= 0;
            const pasDePrix = !(prix > 0);
            return (
              <button
                key={a.id_article}
                className="article"
                disabled={rupture || pasDePrix}
                onClick={() => ajouter(a)}
              >
                <span className="article-nom">{a.designation}</span>
                <span className="article-prix">
                  {pasDePrix ? 'Prix non défini' : montant(prix)}
                </span>
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
          <h2>Panier</h2>
          {lignes.length > 0 && (
            <button className="lien-bouton" onClick={viderPanier}>
              Vider
            </button>
          )}
        </div>

        <div className="type-vente">
          <button className={type === 'DETAIL' ? 'actif' : ''} onClick={() => setType('DETAIL')}>
            Détail
          </button>
          <button className={type === 'GROS' ? 'actif' : ''} onClick={() => setType('GROS')}>
            Gros
          </button>
        </div>

        <div className="panier-lignes">
          {lignes.length === 0 && (
            <p className="muted">Cliquez sur un produit pour l’ajouter au panier.</p>
          )}
          {lignes.map((l) => {
            const prix = prixDe(l.art);
            return (
              <div className="ligne" key={l.id_article}>
                <div className="ligne-haut">
                  <span className="ligne-nom">{l.art.designation}</span>
                  <button
                    className="lien-bouton rouge"
                    onClick={() => retirer(l.id_article)}
                    aria-label="Retirer"
                  >
                    ✕
                  </button>
                </div>
                <div className="ligne-bas">
                  <div className="quantite">
                    <button onClick={() => changerQuantite(l.art, l.quantite - 1)}>−</button>
                    <input
                      value={l.quantite}
                      onChange={(e) => changerQuantite(l.art, e.target.value)}
                      inputMode="numeric"
                    />
                    <button
                      onClick={() => changerQuantite(l.art, l.quantite + 1)}
                      disabled={l.quantite >= l.art.quantite_stock}
                    >
                      +
                    </button>
                  </div>
                  <span className="muted">
                    {prix > 0 ? `× ${montant(prix)}` : 'Prix non défini'}
                  </span>
                  <strong>{montant(l.quantite * prix)}</strong>
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

        {sansPrix && (
          <div className="erreur">
            Un produit du panier n’a pas de prix {type === 'GROS' ? 'de gros' : 'de détail'}.
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