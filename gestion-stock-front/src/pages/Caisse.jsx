import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Plus, Minus, Lock, Unlock } from 'lucide-react';
import { api } from '../api.js';
import Modal from '../components/Modal.jsx';
import Confirmation from '../components/Confirmation.jsx';
import OuvertureCaisse from '../components/OuvertureCaisse.jsx';
import SelecteurPeriode from '../components/SelecteurPeriode.jsx';
import { montant, dateFr, dateHeureFr } from '../format.js';
import { requetePeriode } from '../requete-periode.js';
import '../components/ui.css';

const enNombre = (v) => Number(String(v).replace(/\s/g, '').replace(',', '.'));
const arrondi = (n) => Math.round(n * 100) / 100;
const deuxChiffres = (n) => String(n).padStart(2, '0');

const heure = (valeur) =>
  new Date(valeur).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

function aujourdhuiCle() {
  const j = new Date();
  return `${j.getFullYear()}-${deuxChiffres(j.getMonth() + 1)}-${deuxChiffres(j.getDate())}`;
}

// ------------------------------------------------------------
// Entrée ou sortie d'argent
// ------------------------------------------------------------
const MOTIFS = {
  SORTIE: ['Paiement fournisseur', 'Dépense du magasin', 'Transport', 'Autre'],
  ENTREE: ['Apport d’argent', 'Remboursement reçu', 'Autre'],
};

function FormulaireMouvement({ type, onFerme, onFait }) {
  const [valeur, setValeur] = useState('');
  const [motif, setMotif] = useState('');
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);

  async function soumettre(e) {
    e.preventDefault();
    setErreur('');
    const m = enNombre(valeur);
    if (valeur.trim() === '' || isNaN(m) || m <= 0) return setErreur('Saisissez un montant supérieur à 0');
    if (!motif.trim()) return setErreur('Indiquez le motif');
    setEnvoi(true);
    try {
      await api('/caisse/mouvements', { method: 'POST', body: { type, montant: m, motif: motif.trim() } });
      onFait();
    } catch (err) {
      setErreur(err.message);
      setEnvoi(false);
    }
  }

  return (
    <form onSubmit={soumettre}>
      <label>
        Montant (Ar)
        <input value={valeur} onChange={(e) => setValeur(e.target.value)} inputMode="decimal" autoFocus />
      </label>
      <label>
        Motif
        <input
          value={motif}
          onChange={(e) => setMotif(e.target.value)}
          placeholder="Ex. : paiement du livreur"
          maxLength={150}
        />
      </label>
      <div className="puces">
        {MOTIFS[type].map((m) => (
          <button type="button" key={m} className="puce" onClick={() => setMotif(m)}>
            {m}
          </button>
        ))}
      </div>
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
// Clôture du soir : on compte seulement les petits billets qui restent dans la caisse
// ------------------------------------------------------------
function FormulaireCloture({ journee, onFerme, onFait }) {
  const [reste, setReste] = useState('');
  const [note, setNote] = useState('');
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);

  const r = enNombre(reste);
  const valide = reste.trim() !== '' && !isNaN(r) && r >= 0;

  async function soumettre(e) {
    e.preventDefault();
    setErreur('');
    if (!valide) return setErreur('Saisissez le montant qui reste dans la caisse');
    setEnvoi(true);
    try {
      await api('/caisse/cloturer', { method: 'POST', body: { reste_caisse: r, note } });
      onFait();
    } catch (err) {
      setErreur(err.message);
      setEnvoi(false);
    }
  }

  return (
    <form onSubmit={soumettre}>
      <p className="message-confirmation">
        Mettez les gros billets de côté, puis comptez les petits billets qui restent dans la caisse.
      </p>

      <div className="compte-ligne">
        <span>Argent attendu dans la caisse aujourd’hui</span>
        <strong>{montant(journee.attendu_actuel)}</strong>
      </div>

      <label className="espace-haut">
        Petits billets restant dans la caisse (Ar)
        <input
          value={reste}
          onChange={(e) => setReste(e.target.value)}
          inputMode="decimal"
          placeholder="0"
          autoFocus
        />
        <span className="indice">
          Ce montant vous sera redemandé demain matin comme « reste d’hier ».
        </span>
      </label>

      <label>
        Remarque (facultatif)
        <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={255} />
      </label>

      {erreur && <div className="erreur">{erreur}</div>}
      <div className="modal-actions">
        <button type="button" className="btn btn-secondaire" onClick={onFerme}>
          Annuler
        </button>
        <button type="submit" className="btn" disabled={envoi || !valide}>
          {envoi ? 'Enregistrement...' : 'Clôturer la journée'}
        </button>
      </div>
    </form>
  );
}

// ------------------------------------------------------------
// Onglet 1 : caisse du jour
// ------------------------------------------------------------
function CaisseDuJour() {
  const { versionCaisse, rafraichirCaisse } = useOutletContext();
  const [etat, setEtat] = useState(null);
  const [mouvements, setMouvements] = useState([]);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');
  const [ouverture, setOuverture] = useState(false);
  const [mouvement, setMouvement] = useState(null); // 'ENTREE' ou 'SORTIE'
  const [cloture, setCloture] = useState(false);
  const [aSupprimer, setASupprimer] = useState(null);
  const [rouvrir, setRouvrir] = useState(false);

  useEffect(() => {
    let actif = true;
    Promise.all([api('/caisse/aujourdhui'), api('/caisse/mouvements')])
      .then(([e, m]) => {
        if (!actif) return;
        setErreur('');
        setEtat(e);
        setMouvements(m);
      })
      .catch((e) => actif && setErreur(e.message));
    return () => {
      actif = false;
    };
  }, [versionCaisse]);

  const j = etat ? etat.journee : null;
  const ouverte = j && j.statut === 'OUVERTE';
  const cloturee = j && j.statut === 'CLOTUREE';

  async function supprimerMouvement(m) {
    setErreur('');
    try {
      await api(`/caisse/mouvements/${m.id_mouvement}`, { method: 'DELETE' });
      rafraichirCaisse();
    } catch (e) {
      setErreur(e.message);
    }
    setASupprimer(null);
  }

  async function rouvrirJournee() {
    setErreur('');
    try {
      await api('/caisse/rouvrir', { method: 'POST' });
      setMessage('La journée a été rouverte.');
      rafraichirCaisse();
    } catch (e) {
      setErreur(e.message);
    }
    setRouvrir(false);
  }

  const dateLongue = etat
    ? new Date(`${etat.date}T00:00:00`).toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : '';

  return (
    <>
      {etat && <p className="muted date-longue">{dateLongue}</p>}
      {erreur && <div className="erreur">{erreur}</div>}
      {message && <div className="succes">{message}</div>}
      {!etat && !erreur && <p className="muted">Chargement...</p>}

      {etat && !j && (
        <div className="carte section">
          <h2>La caisse d’aujourd’hui n’est pas encore ouverte</h2>
          <p className="aide">
            Au premier lancement de la journée, on compte le reste d’hier dans la caisse. Cela
            permet de repérer tout de suite un manque ou un surplus.
          </p>
          <button className="btn" onClick={() => setOuverture(true)}>
            <Unlock size={17} />
            Ouvrir la caisse
          </button>
        </div>
      )}

      {j && (
        <>
          <div className="carte section compte-caisse">
            <h2>Compte de caisse</h2>
            <div className="compte-ligne">
              <span>Argent à l’ouverture</span>
              <strong>{montant(j.fonds_ouverture)}</strong>
            </div>
            <div className="compte-ligne">
              <span>
                + Argent reçu des clients <small>({j.nb_ventes} vente{j.nb_ventes > 1 ? 's' : ''})</small>
              </span>
              <strong>{montant(j.argent_recu)}</strong>
            </div>
            <div className="compte-ligne">
              <span>− Monnaie rendue aux clients</span>
              <strong>{montant(j.monnaie_rendue)}</strong>
            </div>
            {j.entrees > 0 && (
              <div className="compte-ligne">
                <span>+ Autres entrées d’argent</span>
                <strong>{montant(j.entrees)}</strong>
              </div>
            )}
            {j.sorties > 0 && (
              <div className="compte-ligne">
                <span>− Sorties d’argent</span>
                <strong>{montant(j.sorties)}</strong>
              </div>
            )}
            <div className="compte-total">
              <span>Argent attendu dans la caisse</span>
              <strong>{montant(j.attendu_actuel)}</strong>
            </div>

            <p className="aide">
              {j.attendu_ouverture !== null && (
                <>
                  Reste d’hier : {montant(j.attendu_ouverture)}.{' '}
                </>
              )}
              Ouverte par {j.ouvert_par} à {heure(j.date_ouverture)}.
              {j.note_ouverture && ` Remarque : ${j.note_ouverture}`}
            </p>
          </div>

          {ouverte && (
            <div className="barre">
              <button className="btn btn-secondaire" onClick={() => setMouvement('ENTREE')}>
                <Plus size={17} />
                Entrée d’argent
              </button>
              <button className="btn btn-secondaire" onClick={() => setMouvement('SORTIE')}>
                <Minus size={17} />
                Sortie d’argent
              </button>
              <button className="btn pousse" onClick={() => setCloture(true)}>
                <Lock size={17} />
                Clôturer la journée
              </button>
            </div>
          )}

          {cloturee && (
            <div className="carte section">
              <div className="entete">
                <h2>Journée clôturée</h2>
                <button className="btn btn-secondaire" onClick={() => setRouvrir(true)}>
                  Rouvrir la journée
                </button>
              </div>
              <div className="compte-ligne">
                <span>Argent attendu dans la caisse</span>
                <strong>{montant(j.attendu_cloture)}</strong>
              </div>
              <div className="compte-total">
                <span>Reste dans la caisse pour demain</span>
                <strong>{montant(j.fonds_reportes)}</strong>
              </div>
              <p className="aide">
                Clôturée par {j.cloture_par} à {heure(j.date_cloture)}.
                {j.note_cloture && ` Remarque : ${j.note_cloture}`}
              </p>
            </div>
          )}

          <div className="carte section">
            <h2>Entrées et sorties d’argent</h2>
            <div className="tableau-conteneur">
              <table className="tableau">
                <thead>
                  <tr>
                    <th>Heure</th>
                    <th>Motif</th>
                    <th>Par</th>
                    <th className="nombre">Montant</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {mouvements.length === 0 && (
                    <tr>
                      <td colSpan="5" className="vide">
                        Aucune entrée ni sortie d’argent aujourd’hui.
                      </td>
                    </tr>
                  )}
                  {mouvements.map((m) => (
                    <tr key={m.id_mouvement}>
                      <td>{heure(m.date_mouvement)}</td>
                      <td>{m.motif}</td>
                      <td>{m.utilisateur}</td>
                      <td className="nombre">
                        {m.type_mouvement === 'ENTREE' ? (
                          <span className="plus">+ {montant(m.montant)}</span>
                        ) : (
                          <span className="moins">− {montant(m.montant)}</span>
                        )}
                      </td>
                      <td>
                        {ouverte && (
                          <div className="actions-ligne">
                            <button className="lien-bouton rouge" onClick={() => setASupprimer(m)}>
                              Supprimer
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {ouverture && etat && (
        <OuvertureCaisse
          veille={etat.veille}
          onOuverte={() => {
            setOuverture(false);
            rafraichirCaisse();
          }}
          onFermer={() => setOuverture(false)}
        />
      )}

      {mouvement && (
        <Modal
          titre={mouvement === 'ENTREE' ? 'Entrée d’argent' : 'Sortie d’argent'}
          onFerme={() => setMouvement(null)}
        >
          <FormulaireMouvement
            type={mouvement}
            onFerme={() => setMouvement(null)}
            onFait={() => {
              setMouvement(null);
              rafraichirCaisse();
            }}
          />
        </Modal>
      )}

      {cloture && j && (
        <Modal titre="Clôture de la journée" onFerme={() => setCloture(false)}>
          <FormulaireCloture
            journee={j}
            onFerme={() => setCloture(false)}
            onFait={() => {
              setCloture(false);
              setMessage('La journée est clôturée. Le reste de la caisse sera demandé demain matin.');
              rafraichirCaisse();
            }}
          />
        </Modal>
      )}

      {aSupprimer && (
        <Confirmation
          titre="Supprimer le mouvement"
          message={`Voulez-vous vraiment supprimer « ${aSupprimer.motif} » (${montant(aSupprimer.montant)}) ?`}
          confirmer="Supprimer"
          danger
          onConfirmer={() => supprimerMouvement(aSupprimer)}
          onAnnuler={() => setASupprimer(null)}
        />
      )}

      {rouvrir && (
        <Confirmation
          titre="Rouvrir la journée"
          message="La clôture d’aujourd’hui sera annulée et la caisse pourra de nouveau être modifiée puis clôturée."
          confirmer="Rouvrir"
          onConfirmer={rouvrirJournee}
          onAnnuler={() => setRouvrir(false)}
        />
      )}
    </>
  );
}

// ------------------------------------------------------------
// Onglet 2 : historique de caisse
// ------------------------------------------------------------
function HistoriqueCaisse() {
  const { versionCaisse } = useOutletContext();
  const [periode, setPeriode] = useState('mois');
  const [du, setDu] = useState('');
  const [au, setAu] = useState('');
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState('');

  const cle = requetePeriode(periode, du, au);

  useEffect(() => {
    if (cle === null) return;
    let actif = true;
    api(`/caisse/historique?${cle}`)
      .then((d) => {
        if (!actif) return;
        setErreur('');
        setDonnees(d);
      })
      .catch((e) => actif && setErreur(e.message));
    return () => {
      actif = false;
    };
  }, [cle, versionCaisse]);

  const auj = aujourdhuiCle();

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
      </div>
      {periode === 'perso' && cle === null && <p className="muted">Choisissez les deux dates.</p>}

      {donnees && (
        <div className="stats">
          <div className="stat carte">
            <span className="muted">Jours de caisse</span>
            <strong>{donnees.totaux.nb_jours}</strong>
          </div>
          <div className="stat carte">
            <span className="muted">Ventes encaissées</span>
            <strong>{montant(donnees.totaux.ventes)}</strong>
          </div>
        </div>
      )}

      {erreur && <div className="erreur">{erreur}</div>}

      <div className="tableau-conteneur">
        <table className="tableau">
          <thead>
            <tr>
              <th>Date</th>
              <th className="nombre">Reste d’hier</th>
              <th className="nombre">À l’ouverture</th>
              <th className="nombre">Ventes</th>
              <th className="nombre">Attendu le soir</th>
              <th className="nombre">Reste pour demain</th>
              <th>Journée</th>
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
            {donnees && donnees.journees.length === 0 && (
              <tr>
                <td colSpan="7" className="vide">
                  Aucune journée de caisse sur cette période.
                </td>
              </tr>
            )}
            {donnees &&
              donnees.journees.map((j) => {
                const cloturee = j.statut === 'CLOTUREE';
                return (
                  <tr key={j.id_journee}>
                    <td>
                      <strong>{dateFr(j.date_journee)}</strong>
                    </td>
                    <td className="nombre">
                      {j.attendu_ouverture !== null ? montant(j.attendu_ouverture) : '—'}
                    </td>
                    <td className="nombre">{montant(j.fonds_ouverture)}</td>
                    <td className="nombre">{montant(j.ventes)}</td>
                    <td className="nombre">
                      {montant(cloturee ? j.attendu_cloture : j.attendu_actuel)}
                    </td>
                    <td className="nombre">{cloturee ? montant(j.fonds_reportes) : '—'}</td>
                    <td>
                      {cloturee ? (
                        <span className="ecart-pastille ecart-juste">Clôturée</span>
                      ) : (
                        <span className="muted">
                          {j.date_journee === auj ? 'En cours' : 'Non clôturée'}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
      {donnees && donnees.journees.some((j) => j.date_ouverture) && (
        <p className="aide">
          Dernière ouverture enregistrée le {dateHeureFr(donnees.journees[0].date_ouverture)}.
        </p>
      )}
    </>
  );
}

// ------------------------------------------------------------
// Page
// ------------------------------------------------------------
export default function Caisse({ onglet }) {
  const navigate = useNavigate();

  return (
    <div>
      <div className="entete">
        <h1>Caisse</h1>
        <div className="onglets">
          <button className={onglet === 'jour' ? 'actif' : ''} onClick={() => navigate('/caisse')}>
            Caisse du jour
          </button>
          <button
            className={onglet === 'historique' ? 'actif' : ''}
            onClick={() => navigate('/caisse/historique')}
          >
            Historique
          </button>
        </div>
      </div>

      {onglet === 'jour' ? <CaisseDuJour /> : <HistoriqueCaisse />}
    </div>
  );
}
