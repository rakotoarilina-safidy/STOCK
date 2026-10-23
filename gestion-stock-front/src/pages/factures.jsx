import { useEffect, useMemo, useState } from 'react';
import { api } from '../api.js';
import Modal from '../components/Modal.jsx';
import SelecteurPeriode from '../components/SelecteurPeriode.jsx';
import ZoneImpression from '../components/Facture.jsx';
import { montant, dateHeureFr } from '../format.js';
import { requetePeriode } from '../requete-periode.js';
import '../components/ui.css';

const typeVente = (t) => (t === 'GROS' ? 'Gros' : 'Détail');

// ------------------------------------------------------------
// Détail d'une facture + réimpression des deux exemplaires
// ------------------------------------------------------------
function DetailFacture({ id, onFerme }) {
  const [f, setF] = useState(null);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    let actif = true;
    api(`/ventes/${id}`)
      .then((x) => actif && setF(x))
      .catch((e) => actif && setErreur(e.message));
    return () => {
      actif = false;
    };
  }, [id]);

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
                    <td>{l.designation}</td>
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

          <ZoneImpression facture={f} />
        </>
      )}

      <div className="modal-actions">
        <button className="btn btn-secondaire" onClick={onFerme}>
          Fermer
        </button>
        {f && (
          <button className="btn" onClick={() => window.print()}>
            Imprimer les 2 factures
          </button>
        )}
      </div>
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

      {detail && <DetailFacture id={detail} onFerme={() => setDetail(null)} />}
    </div>
  );
}