import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import Modal from '../components/Modal.jsx';
import Confirmation from '../components/Confirmation.jsx';
import { montant, dateFr } from '../format.js';
import '../components/ui.css';

const enNombre = (v) => Number(String(v).replace(/\s/g, '').replace(',', '.'));

// ------------------------------------------------------------
// Formulaire fournisseur (ajout / modification)
// ------------------------------------------------------------
function FormulaireFournisseur({ fournisseur, onFerme, onEnregistre }) {
  const [nom, setNom] = useState(fournisseur ? fournisseur.nom_fournisseur : '');
  const [telephone, setTelephone] = useState(fournisseur?.telephone || '');
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);

  async function soumettre(e) {
    e.preventDefault();
    if (!nom.trim()) return setErreur('Le nom du fournisseur est requis');
    setEnvoi(true);
    setErreur('');
    try {
      const corps = { nom_fournisseur: nom.trim(), telephone: telephone.trim() };
      if (fournisseur) {
        await api(`/fournisseurs/${fournisseur.id_fournisseur}`, { method: 'PUT', body: corps });
      } else {
        await api('/fournisseurs', { method: 'POST', body: corps });
      }
      onEnregistre();
    } catch (err) {
      setErreur(err.message);
      setEnvoi(false);
    }
  }

  return (
    <form onSubmit={soumettre}>
      <label>
        Nom du fournisseur
        <input value={nom} onChange={(e) => setNom(e.target.value)} autoFocus />
      </label>
      <label>
        Téléphone
        <input value={telephone} onChange={(e) => setTelephone(e.target.value)} />
      </label>
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
// Formulaire de nouvelle livraison (approvisionnement)
// ------------------------------------------------------------
// livraison : si fournie, le formulaire modifie cette livraison au lieu d'en créer une
function FormulaireLivraison({ livraison, onFerme, onEnregistre }) {
  const [fournisseurs, setFournisseurs] = useState([]);
  const [articles, setArticles] = useState([]);
  const [idFournisseur, setIdFournisseur] = useState(() => {
    if (!livraison) return '';
    return livraison.nom_fournisseur.toLowerCase() === 'autres' ? 'AUTRES' : String(livraison.id_fournisseur);
  });
  const [date, setDate] = useState(livraison ? livraison.date_approvisionnement : '');
  const [lignes, setLignes] = useState(() =>
    livraison
      ? livraison.lignes.map((l) => ({
          id_article: l.id_article,
          designation: l.designation,
          quantite: String(l.quantite_achetee),
          prix: String(l.prix_achat_unitaire),
        }))
      : []
  );
  const [q, setQ] = useState('');
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    let actif = true;
    Promise.all([api('/fournisseurs'), api('/articles')])
      .then(([f, a]) => {
        if (!actif) return;
        setFournisseurs(f);
        setArticles(a);
      })
      .catch((e) => actif && setErreur(e.message));
    return () => {
      actif = false;
    };
  }, []);

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

  function ajouter(a) {
    setLignes((ls) => [
      ...ls,
      {
        id_article: a.id_article,
        designation: a.designation,
        quantite: '',
        prix: String(a.prix_achat),
      },
    ]);
    setQ('');
  }

  const majLigne = (id, champ, valeur) =>
    setLignes((ls) => ls.map((l) => (l.id_article === id ? { ...l, [champ]: valeur } : l)));
  const retirer = (id) => setLignes((ls) => ls.filter((l) => l.id_article !== id));

  function toucheRecherche(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault(); // évite d'envoyer le formulaire par erreur
    if (propositions.length === 1) ajouter(propositions[0]);
  }

  const total = lignes.reduce((s, l) => s + (Number(l.quantite) || 0) * (enNombre(l.prix) || 0), 0);

  async function soumettre(e) {
    e.preventDefault();
    setErreur('');
    if (!idFournisseur) return setErreur('Choisissez un fournisseur');
    if (lignes.length === 0) return setErreur('Ajoutez au moins un article');
    for (const l of lignes) {
      const qte = Number(l.quantite);
      const prix = enNombre(l.prix);
      if (!Number.isInteger(qte) || qte <= 0) {
        return setErreur(`Quantité invalide pour « ${l.designation} »`);
      }
      if (l.prix.trim() === '' || isNaN(prix) || prix < 0) {
        return setErreur(`Prix d’achat invalide pour « ${l.designation} »`);
      }
    }

    setEnvoi(true);
    try {
      const r = await api(livraison ? `/achats/${livraison.id_achat}` : '/achats', {
        method: livraison ? 'PUT' : 'POST',
        body: {
          id_fournisseur: idFournisseur === 'AUTRES' ? 'AUTRES' : Number(idFournisseur),
          date_approvisionnement: date || undefined,
          lignes: lignes.map((l) => ({
            id_article: l.id_article,
            quantite: Number(l.quantite),
            prix_achat_unitaire: enNombre(l.prix),
          })),
        },
      });
      onEnregistre(r.id_achat);
    } catch (err) {
      setErreur(err.message);
      setEnvoi(false);
    }
  }

  return (
    <form onSubmit={soumettre}>
      <div className="grille-champs">
        <label>
          Fournisseur
          <select value={idFournisseur} onChange={(e) => setIdFournisseur(e.target.value)}>
            <option value="">— Choisir —</option>
            {fournisseurs
              .filter((f) => f.nom_fournisseur.toLowerCase() !== 'autres')
              .map((f) => (
                <option key={f.id_fournisseur} value={f.id_fournisseur}>
                  {f.nom_fournisseur}
                </option>
              ))}
            <option value="AUTRES">Autres (fournisseur sans nom)</option>
          </select>
        </label>
        <label>
          Date de livraison
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
      </div>
      <p className="aide">Sans date choisie, la livraison est enregistrée à la date d’aujourd’hui. Choisissez « Autres » pour un vendeur sans nom (petit fournisseur).</p>

      <div className="recherche-article">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={toucheRecherche}
          placeholder="Rechercher un article à ajouter..."
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
        {q.trim() && propositions.length === 0 && (
          <p className="aide">
            Aucun article trouvé. S’il est nouveau, créez-le d’abord dans la page Stock.
          </p>
        )}
      </div>

      <div className="tableau-conteneur">
        <table className="tableau">
          <thead>
            <tr>
              <th>Article</th>
              <th className="nombre">Quantité reçue</th>
              <th className="nombre">Prix d’achat unitaire</th>
              <th className="nombre">Total</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {lignes.length === 0 && (
              <tr>
                <td colSpan="5" className="vide">
                  Aucun article ajouté.
                </td>
              </tr>
            )}
            {lignes.map((l) => (
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
                <td className="nombre">
                  <input
                    className="champ-table"
                    value={l.prix}
                    onChange={(e) => majLigne(l.id_article, 'prix', e.target.value)}
                    inputMode="decimal"
                  />
                </td>
                <td className="nombre">
                  {montant((Number(l.quantite) || 0) * (enNombre(l.prix) || 0))}
                </td>
                <td>
                  <button
                    type="button"
                    className="lien-bouton rouge"
                    onClick={() => retirer(l.id_article)}
                    aria-label="Retirer"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="total-livraison">
        <span>Total de la livraison</span>
        <strong>{montant(total)}</strong>
      </div>
      <p className="aide">
        Le stock de chaque article augmente de la quantité reçue, et son prix d’achat devient le
        prix saisi ici.
      </p>

      {erreur && <div className="erreur">{erreur}</div>}

      <div className="modal-actions">
        <button type="button" className="btn btn-secondaire" onClick={onFerme}>
          Annuler
        </button>
        <button type="submit" className="btn" disabled={envoi}>
          {envoi ? 'Enregistrement...' : livraison ? 'Enregistrer les modifications' : 'Enregistrer la livraison'}
        </button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------
// Détail d'une livraison
// ------------------------------------------------------------
function DetailLivraison({ id, onFerme, onChange }) {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState('');
  const [version, setVersion] = useState(0);
  const [modification, setModification] = useState(false);
  const [suppression, setSuppression] = useState(false);

  useEffect(() => {
    let actif = true;
    api(`/achats/${id}`)
      .then((x) => actif && setD(x))
      .catch((e) => actif && setErreur(e.message));
    return () => {
      actif = false;
    };
  }, [id, version]);

  const total = d ? d.lignes.reduce((s, l) => s + Number(l.total_ligne), 0) : 0;

  async function supprimer() {
    setErreur('');
    try {
      await api(`/achats/${id}`, { method: 'DELETE' });
      onChange();
      onFerme();
    } catch (e) {
      setErreur(e.message);
    }
    setSuppression(false);
  }

  return (
    <Modal titre={`Livraison n° ${id}`} onFerme={onFerme} large>
      {erreur && <div className="erreur">{erreur}</div>}
      {!d && !erreur && <p className="muted">Chargement...</p>}
      {d && (
        <>
          <p>
            {dateFr(d.date_approvisionnement)} — <strong>{d.nom_fournisseur}</strong>
            <br />
            <span className="muted">Enregistrée par {d.utilisateur}</span>
          </p>
          <div className="tableau-conteneur">
            <table className="tableau">
              <thead>
                <tr>
                  <th>Article</th>
                  <th className="nombre">Quantité</th>
                  <th className="nombre">Prix d’achat unitaire</th>
                  <th className="nombre">Total</th>
                </tr>
              </thead>
              <tbody>
                {d.lignes.map((l, i) => (
                  <tr key={i}>
                    <td>{l.designation}</td>
                    <td className="nombre">{l.quantite_achetee}</td>
                    <td className="nombre">{montant(l.prix_achat_unitaire)}</td>
                    <td className="nombre">{montant(l.total_ligne)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="total-livraison">
            <span>Total</span>
            <strong>{montant(total)}</strong>
          </div>
        </>
      )}
      <div className="modal-actions">
        <button className="btn btn-secondaire" onClick={onFerme}>
          Fermer
        </button>
        {d && (
          <>
            <button className="btn btn-secondaire" onClick={() => setSuppression(true)}>
              Supprimer
            </button>
            <button className="btn" onClick={() => setModification(true)}>
              Modifier
            </button>
          </>
        )}
      </div>

      {modification && d && (
        <Modal titre={`Modifier la livraison n° ${id}`} onFerme={() => setModification(false)} large>
          <FormulaireLivraison
            livraison={{ ...d, id_achat: id }}
            onFerme={() => setModification(false)}
            onEnregistre={() => {
              setModification(false);
              setVersion((v) => v + 1);
              onChange();
            }}
          />
        </Modal>
      )}

      {suppression && (
        <Confirmation
          titre="Supprimer la livraison"
          message={`Voulez-vous vraiment supprimer la livraison n° ${id} ? Les quantités reçues seront retirées du stock.`}
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
// Onglet 1 : liste des fournisseurs
// ------------------------------------------------------------
function ListeFournisseurs({ version, onChange, onVoirLivraisons }) {
  const [liste, setListe] = useState(null);
  const [erreur, setErreur] = useState('');
  const [q, setQ] = useState('');
  const [edition, setEdition] = useState(null); // null ou { fournisseur }
  const [aSupprimer, setASupprimer] = useState(null);

  useEffect(() => {
    let actif = true;
    api('/fournisseurs')
      .then((d) => actif && setListe(d))
      .catch((e) => actif && setErreur(e.message));
    return () => {
      actif = false;
    };
  }, [version]);

  const visibles = useMemo(() => {
    if (!liste) return [];
    const terme = q.trim().toLowerCase();
    return liste.filter((f) => f.nom_fournisseur.toLowerCase().includes(terme));
  }, [liste, q]);

  async function supprimer(f) {
    setErreur('');
    try {
      await api(`/fournisseurs/${f.id_fournisseur}`, { method: 'DELETE' });
      onChange();
    } catch (e) {
      setErreur(e.message);
    }
    setASupprimer(null);
  }

  return (
    <>
      <div className="barre">
        <input
          className="recherche-liste"
          placeholder="Rechercher un fournisseur..."
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button
          className="btn btn-secondaire pousse"
          onClick={() => setEdition({ fournisseur: null })}
        >
          + Nouveau fournisseur
        </button>
      </div>

      {erreur && <div className="erreur">{erreur}</div>}

      <div className="tableau-conteneur">
        <table className="tableau">
          <thead>
            <tr>
              <th>Fournisseur</th>
              <th>Téléphone</th>
              <th className="nombre">Livraisons</th>
              <th className="nombre">Dernière livraison</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {!liste && !erreur && (
              <tr>
                <td colSpan="5" className="vide">
                  Chargement...
                </td>
              </tr>
            )}
            {liste && visibles.length === 0 && (
              <tr>
                <td colSpan="5" className="vide">
                  Aucun fournisseur.
                </td>
              </tr>
            )}
            {visibles.map((f) => (
              <tr key={f.id_fournisseur}>
                <td>
                  <strong>{f.nom_fournisseur}</strong>
                </td>
                <td>{f.telephone || '—'}</td>
                <td className="nombre">{f.nb_livraisons}</td>
                <td className="nombre">
                  {f.derniere_livraison ? dateFr(f.derniere_livraison) : '—'}
                </td>
                <td>
                  <div className="actions-ligne">
                    <button
                      className="lien-bouton"
                      onClick={() => onVoirLivraisons(f.id_fournisseur)}
                    >
                      Livraisons
                    </button>
                    <button className="lien-bouton" onClick={() => setEdition({ fournisseur: f })}>
                      Modifier
                    </button>
                    <button className="lien-bouton rouge" onClick={() => setASupprimer(f)}>
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
          titre={edition.fournisseur ? 'Modifier le fournisseur' : 'Nouveau fournisseur'}
          onFerme={() => setEdition(null)}
        >
          <FormulaireFournisseur
            fournisseur={edition.fournisseur}
            onFerme={() => setEdition(null)}
            onEnregistre={() => {
              setEdition(null);
              onChange();
            }}
          />
        </Modal>
      )}

      {aSupprimer && (
        <Confirmation
          titre="Supprimer le fournisseur"
          message={`Voulez-vous vraiment supprimer « ${aSupprimer.nom_fournisseur} » ? Cette action est définitive.`}
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
// Onglet 2 : historique des livraisons
// ------------------------------------------------------------
const PERIODES = [
  ['jour', 'Aujourd’hui'],
  ['semaine', 'Cette semaine'],
  ['mois', 'Ce mois'],
  ['annee', 'Cette année'],
  ['tout', 'Tout'],
  ['perso', 'Dates précises'],
];

function construireRequete(periode, du, au, idFournisseur) {
  const p = new URLSearchParams();
  if (periode === 'perso') {
    if (!du || !au) return null; // dates incomplètes
    p.set('du', du);
    p.set('au', au);
  } else if (periode !== 'tout') {
    p.set('periode', periode);
  }
  if (idFournisseur) p.set('id_fournisseur', idFournisseur);
  return p.toString();
}

function Livraisons({ version, fournisseurInitial, onChange }) {
  const [periode, setPeriode] = useState('mois');
  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  const [idFournisseur, setIdFournisseur] = useState(fournisseurInitial || '');
  const [fournisseurs, setFournisseurs] = useState([]);
  const [liste, setListe] = useState(null);
  const [erreur, setErreur] = useState('');
  const [detail, setDetail] = useState(null);

  useEffect(() => {
    let actif = true;
    api('/fournisseurs')
      .then((f) => actif && setFournisseurs(f))
      .catch(() => {});
    return () => {
      actif = false;
    };
  }, [version]);

  const cle = construireRequete(periode, du, au, idFournisseur);

  useEffect(() => {
    if (cle === null) return;
    let actif = true;
    api(`/achats${cle ? `?${cle}` : ''}`)
      .then((d) => {
        if (!actif) return;
        setErreur('');
        setListe(d);
      })
      .catch((e) => actif && setErreur(e.message));
    return () => {
      actif = false;
    };
  }, [cle, version]);

  const total = liste ? liste.reduce((s, l) => s + Number(l.montant_total || 0), 0) : 0;

  return (
    <>
      <div className="barre">
        <div className="onglets">
          {PERIODES.map(([c, libelle]) => (
            <button key={c} className={periode === c ? 'actif' : ''} onClick={() => setPeriode(c)}>
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

        <select
          className="filtre-select pousse"
          value={idFournisseur}
          onChange={(e) => setIdFournisseur(e.target.value)}
        >
          <option value="">Tous les fournisseurs</option>
          {fournisseurs.map((f) => (
            <option key={f.id_fournisseur} value={f.id_fournisseur}>
              {f.nom_fournisseur}
            </option>
          ))}
        </select>
      </div>

      {periode === 'perso' && cle === null && <p className="muted">Choisissez les deux dates.</p>}

      {liste && (
        <div className="stats">
          <div className="stat carte">
            <span className="muted">Livraisons</span>
            <strong>{liste.length}</strong>
          </div>
          <div className="stat carte">
            <span className="muted">Total des achats</span>
            <strong>{montant(total)}</strong>
          </div>
        </div>
      )}

      {erreur && <div className="erreur">{erreur}</div>}

      <div className="tableau-conteneur">
        <table className="tableau">
          <thead>
            <tr>
              <th>Date</th>
              <th>Fournisseur</th>
              <th className="nombre">Montant</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {!liste && !erreur && (
              <tr>
                <td colSpan="4" className="vide">
                  Chargement...
                </td>
              </tr>
            )}
            {liste && liste.length === 0 && (
              <tr>
                <td colSpan="4" className="vide">
                  Aucune livraison sur cette période.
                </td>
              </tr>
            )}
            {liste &&
              liste.map((l) => (
                <tr key={l.id_achat}>
                  <td>{dateFr(l.date_approvisionnement)}</td>
                  <td>{l.nom_fournisseur}</td>
                  <td className="nombre">{montant(l.montant_total)}</td>
                  <td>
                    <div className="actions-ligne">
                      <button className="lien-bouton" onClick={() => setDetail(l.id_achat)}>
                        Détail
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {detail && <DetailLivraison id={detail} onFerme={() => setDetail(null)} onChange={onChange} />}
    </>
  );
}

// ------------------------------------------------------------
// Page
// ------------------------------------------------------------
export default function Fournisseurs({ onglet }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [version, setVersion] = useState(0);
  const [livraison, setLivraison] = useState(false);
  const [message, setMessage] = useState('');

  const changer = () => setVersion((v) => v + 1);
  // Fournisseur choisi depuis la liste (bouton « Livraisons » d'une ligne)
  const filtre = location.state?.fournisseur ? String(location.state.fournisseur) : '';

  return (
    <div>
      <div className="entete">
        <h1>Fournisseurs</h1>
        <div className="onglets">
          <button
            className={onglet === 'fournisseurs' ? 'actif' : ''}
            onClick={() => navigate('/fournisseurs')}
          >
            Fournisseurs
          </button>
          <button
            className={onglet === 'livraisons' ? 'actif' : ''}
            onClick={() => navigate('/fournisseurs/livraisons')}
          >
            Livraisons
          </button>
        </div>
        <button
          className="btn"
          onClick={() => {
            setMessage('');
            setLivraison(true);
          }}
        >
          + Nouvelle livraison
        </button>
      </div>

      {message && <div className="succes">{message}</div>}

      {onglet === 'fournisseurs' ? (
        <ListeFournisseurs
          version={version}
          onChange={changer}
          onVoirLivraisons={(id) =>
            navigate('/fournisseurs/livraisons', { state: { fournisseur: id } })
          }
        />
      ) : (
        <Livraisons key={filtre} version={version} fournisseurInitial={filtre} onChange={changer} />
      )}

      {livraison && (
        <Modal titre="Nouvelle livraison" onFerme={() => setLivraison(false)} large>
          <FormulaireLivraison
            onFerme={() => setLivraison(false)}
            onEnregistre={(id) => {
              setLivraison(false);
              setMessage(`Livraison n° ${id} enregistrée : le stock a été mis à jour.`);
              changer();
            }}
          />
        </Modal>
      )}
    </div>
  );
}
