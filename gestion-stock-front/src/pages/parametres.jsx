import { useEffect, useState } from 'react';
import { api, adresseServeur } from '../api.js';
import { useAuth } from '../auth-context.js';
import Modal from '../components/Modal.jsx';
import Confirmation from '../components/Confirmation.jsx';
import { dateFr, dateHeureFr } from '../format.js';
import '../components/ui.css';

const ROLES = { RESPONSABLE: 'Responsable', CAISSIER: 'Caissier' };

// ------------------------------------------------------------
// Mon compte : nom et mot de passe (pour tout le monde)
// ------------------------------------------------------------
function FormulaireNom() {
  const { user, majUtilisateur } = useAuth();
  const [nom, setNom] = useState(user.nom);
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');
  const [envoi, setEnvoi] = useState(false);

  async function soumettre(e) {
    e.preventDefault();
    setErreur('');
    setSucces('');
    if (!nom.trim()) return setErreur('Le nom est requis');
    setEnvoi(true);
    try {
      await api('/utilisateurs/moi', { method: 'PUT', body: { nom: nom.trim() } });
      majUtilisateur({ nom: nom.trim() });
      setSucces('Vos informations ont été mises à jour.');
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <form className="carte section" onSubmit={soumettre}>
      <h2>Mes informations</h2>
      <label>
        Nom affiché
        <input value={nom} onChange={(e) => setNom(e.target.value)} />
      </label>
      <p className="aide">
        Identifiant : <strong>{user.username}</strong> · Rôle : <strong>{ROLES[user.role]}</strong>
      </p>
      {erreur && <div className="erreur">{erreur}</div>}
      {succes && <div className="succes">{succes}</div>}
      <button type="submit" className="btn" disabled={envoi}>
        {envoi ? 'Enregistrement...' : 'Enregistrer'}
      </button>
    </form>
  );
}

function FormulaireMonMotDePasse() {
  const [ancien, setAncien] = useState('');
  const [nouveau, setNouveau] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [erreur, setErreur] = useState('');
  const [succes, setSucces] = useState('');
  const [envoi, setEnvoi] = useState(false);

  async function soumettre(e) {
    e.preventDefault();
    setErreur('');
    setSucces('');
    if (!ancien) return setErreur('Saisissez votre mot de passe actuel');
    if (nouveau.length < 6) return setErreur('Le nouveau mot de passe doit avoir 6 caractères minimum');
    if (nouveau !== confirmation) return setErreur('Les deux nouveaux mots de passe ne correspondent pas');
    setEnvoi(true);
    try {
      await api('/utilisateurs/moi/mot-de-passe', {
        method: 'PATCH',
        body: { ancien, nouveau },
      });
      setAncien('');
      setNouveau('');
      setConfirmation('');
      setSucces('Votre mot de passe a été modifié.');
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnvoi(false);
    }
  }

  return (
    <form className="carte section" onSubmit={soumettre}>
      <h2>Changer mon mot de passe</h2>
      <label>
        Mot de passe actuel
        <input
          type="password"
          value={ancien}
          onChange={(e) => setAncien(e.target.value)}
          autoComplete="current-password"
        />
      </label>
      <label>
        Nouveau mot de passe
        <input
          type="password"
          value={nouveau}
          onChange={(e) => setNouveau(e.target.value)}
          autoComplete="new-password"
        />
      </label>
      <label>
        Confirmer le nouveau mot de passe
        <input
          type="password"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          autoComplete="new-password"
        />
      </label>
      {erreur && <div className="erreur">{erreur}</div>}
      {succes && <div className="succes">{succes}</div>}
      <button type="submit" className="btn" disabled={envoi}>
        {envoi ? 'Enregistrement...' : 'Changer le mot de passe'}
      </button>
    </form>
  );
}

// ------------------------------------------------------------
// Gestion des utilisateurs (responsable)
// ------------------------------------------------------------
function FormulaireUtilisateur({ utilisateur, estMoi, onFerme, onEnregistre }) {
  const [form, setForm] = useState(() => ({
    username: utilisateur ? utilisateur.username : '',
    nom: utilisateur ? utilisateur.nom : '',
    role: utilisateur ? utilisateur.role : 'CAISSIER',
    mot_de_passe: '',
  }));
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);

  const maj = (champ) => (e) => setForm((f) => ({ ...f, [champ]: e.target.value }));

  async function soumettre(e) {
    e.preventDefault();
    setErreur('');
    if (!form.username.trim() || !form.nom.trim()) {
      return setErreur('L’identifiant et le nom sont requis');
    }
    if (!utilisateur && form.mot_de_passe.length < 6) {
      return setErreur('Le mot de passe doit avoir 6 caractères minimum');
    }

    setEnvoi(true);
    try {
      if (utilisateur) {
        await api(`/utilisateurs/${utilisateur.id_utilisateur}`, {
          method: 'PUT',
          body: { username: form.username.trim(), nom: form.nom.trim(), role: form.role },
        });
      } else {
        await api('/utilisateurs', {
          method: 'POST',
          body: {
            username: form.username.trim(),
            nom: form.nom.trim(),
            role: form.role,
            mot_de_passe: form.mot_de_passe,
          },
        });
      }
      onEnregistre({ username: form.username.trim(), nom: form.nom.trim() });
    } catch (err) {
      setErreur(err.message);
      setEnvoi(false);
    }
  }

  return (
    <form onSubmit={soumettre}>
      <label>
        Nom complet
        <input value={form.nom} onChange={maj('nom')} autoFocus />
      </label>
      <label>
        Identifiant de connexion
        <input value={form.username} onChange={maj('username')} autoComplete="off" />
      </label>
      {!utilisateur && (
        <label>
          Mot de passe
          <input
            type="password"
            value={form.mot_de_passe}
            onChange={maj('mot_de_passe')}
            autoComplete="new-password"
          />
        </label>
      )}
      <label>
        Rôle
        <select value={form.role} onChange={maj('role')} disabled={estMoi}>
          <option value="CAISSIER">Caissier — voit tout sauf les bénéfices</option>
          <option value="RESPONSABLE">Responsable — voit aussi les bénéfices et gère les comptes</option>
        </select>
      </label>
      {estMoi && <p className="aide">Vous ne pouvez pas changer votre propre rôle.</p>}

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

function FormulaireMotDePasseAutre({ utilisateur, onFerme, onEnregistre }) {
  const [nouveau, setNouveau] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);

  async function soumettre(e) {
    e.preventDefault();
    setErreur('');
    if (nouveau.length < 6) return setErreur('Le mot de passe doit avoir 6 caractères minimum');
    if (nouveau !== confirmation) return setErreur('Les deux mots de passe ne correspondent pas');
    setEnvoi(true);
    try {
      await api(`/utilisateurs/${utilisateur.id_utilisateur}/mot-de-passe`, {
        method: 'PATCH',
        body: { mot_de_passe: nouveau },
      });
      onEnregistre();
    } catch (err) {
      setErreur(err.message);
      setEnvoi(false);
    }
  }

  return (
    <form onSubmit={soumettre}>
      <p className="aide">
        Compte : <strong>{utilisateur.nom}</strong> ({utilisateur.username})
      </p>
      <label>
        Nouveau mot de passe
        <input
          type="password"
          value={nouveau}
          onChange={(e) => setNouveau(e.target.value)}
          autoComplete="new-password"
          autoFocus
        />
      </label>
      <label>
        Confirmer le mot de passe
        <input
          type="password"
          value={confirmation}
          onChange={(e) => setConfirmation(e.target.value)}
          autoComplete="new-password"
        />
      </label>
      {erreur && <div className="erreur">{erreur}</div>}
      <div className="modal-actions">
        <button type="button" className="btn btn-secondaire" onClick={onFerme}>
          Annuler
        </button>
        <button type="submit" className="btn" disabled={envoi}>
          {envoi ? 'Enregistrement...' : 'Changer le mot de passe'}
        </button>
      </div>
    </form>
  );
}

function Utilisateurs() {
  const { user, majUtilisateur } = useAuth();
  const [liste, setListe] = useState(null);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');
  const [version, setVersion] = useState(0);
  const [edition, setEdition] = useState(null); // { utilisateur } (null = nouveau compte)
  const [motDePasse, setMotDePasse] = useState(null); // utilisateur dont on change le mot de passe
  const [aDesactiver, setADesactiver] = useState(null);

  useEffect(() => {
    let actif = true;
    api('/utilisateurs')
      .then((d) => actif && setListe(d))
      .catch((e) => actif && setErreur(e.message));
    return () => {
      actif = false;
    };
  }, [version]);

  const recharger = () => setVersion((v) => v + 1);

  async function changerStatut(u, actif) {
    setErreur('');
    setMessage('');
    try {
      await api(`/utilisateurs/${u.id_utilisateur}/actif`, { method: 'PATCH', body: { actif } });
      setMessage(`Le compte de ${u.nom} a été ${actif ? 'réactivé' : 'désactivé'}.`);
      recharger();
    } catch (e) {
      setErreur(e.message);
    }
    setADesactiver(null);
  }

  return (
    <div className="carte section">
      <div className="entete">
        <h2>Utilisateurs</h2>
        <button
          className="btn"
          onClick={() => {
            setMessage('');
            setEdition({ utilisateur: null });
          }}
        >
          + Nouvel utilisateur
        </button>
      </div>
      <p className="aide">
        Un compte désactivé ne peut plus se connecter, mais ses ventes passées sont conservées.
      </p>

      {message && <div className="succes">{message}</div>}
      {erreur && <div className="erreur">{erreur}</div>}

      <div className="tableau-conteneur">
        <table className="tableau">
          <thead>
            <tr>
              <th>Nom</th>
              <th>Identifiant</th>
              <th>Rôle</th>
              <th>Statut</th>
              <th>Créé le</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {!liste && !erreur && (
              <tr>
                <td colSpan="6" className="vide">
                  Chargement...
                </td>
              </tr>
            )}
            {liste &&
              liste.map((u) => {
                const estMoi = u.id_utilisateur === user.id;
                return (
                  <tr key={u.id_utilisateur} className={u.actif ? '' : 'inactif'}>
                    <td>
                      <strong>{u.nom}</strong>
                      {estMoi && <span className="etiquette">vous</span>}
                    </td>
                    <td>{u.username}</td>
                    <td>{ROLES[u.role]}</td>
                    <td>{u.actif ? 'Actif' : 'Désactivé'}</td>
                    <td>{dateFr(u.date_creation)}</td>
                    <td>
                      <div className="actions-ligne">
                        <button
                          className="lien-bouton"
                          onClick={() => {
                            setMessage('');
                            setEdition({ utilisateur: u });
                          }}
                        >
                          Modifier
                        </button>
                        <button
                          className="lien-bouton"
                          onClick={() => {
                            setMessage('');
                            setMotDePasse(u);
                          }}
                        >
                          Mot de passe
                        </button>
                        {u.actif ? (
                          !estMoi && (
                            <button className="lien-bouton rouge" onClick={() => setADesactiver(u)}>
                              Désactiver
                            </button>
                          )
                        ) : (
                          <button className="lien-bouton" onClick={() => changerStatut(u, true)}>
                            Réactiver
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>

      {edition && (
        <Modal
          titre={edition.utilisateur ? 'Modifier le compte' : 'Nouvel utilisateur'}
          onFerme={() => setEdition(null)}
        >
          <FormulaireUtilisateur
            utilisateur={edition.utilisateur}
            estMoi={!!edition.utilisateur && edition.utilisateur.id_utilisateur === user.id}
            onFerme={() => setEdition(null)}
            onEnregistre={(champs) => {
              if (edition.utilisateur && edition.utilisateur.id_utilisateur === user.id) {
                majUtilisateur(champs);
              }
              setMessage(edition.utilisateur ? 'Le compte a été modifié.' : 'Le compte a été créé.');
              setEdition(null);
              recharger();
            }}
          />
        </Modal>
      )}

      {motDePasse && (
        <Modal titre="Changer le mot de passe" onFerme={() => setMotDePasse(null)}>
          <FormulaireMotDePasseAutre
            utilisateur={motDePasse}
            onFerme={() => setMotDePasse(null)}
            onEnregistre={() => {
              setMessage(`Le mot de passe de ${motDePasse.nom} a été modifié.`);
              setMotDePasse(null);
            }}
          />
        </Modal>
      )}

      {aDesactiver && (
        <Confirmation
          titre="Désactiver le compte"
          message={`Voulez-vous vraiment désactiver le compte de « ${aDesactiver.nom} » ? Cette personne ne pourra plus se connecter. Vous pourrez le réactiver à tout moment.`}
          confirmer="Désactiver"
          danger
          onConfirmer={() => changerStatut(aDesactiver, false)}
          onAnnuler={() => setADesactiver(null)}
        />
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Sauvegardes de la base de données (responsable)
// ------------------------------------------------------------
function tailleLisible(octets) {
  if (octets >= 1024 * 1024) return `${(octets / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
  return `${Math.max(1, Math.round(octets / 1024))} Ko`;
}

function Sauvegardes() {
  const [donnees, setDonnees] = useState(null);
  const [erreur, setErreur] = useState('');
  const [message, setMessage] = useState('');
  const [version, setVersion] = useState(0);
  const [envoi, setEnvoi] = useState(false);

  useEffect(() => {
    let actif = true;
    api('/sauvegardes')
      .then((d) => actif && setDonnees(d))
      .catch((e) => actif && setErreur(e.message));
    return () => {
      actif = false;
    };
  }, [version]);

  async function sauvegarderMaintenant() {
    setEnvoi(true);
    setErreur('');
    setMessage('');
    try {
      const r = await api('/sauvegardes', { method: 'POST' });
      setMessage(
        r.copie && r.copie.startsWith('échec')
          ? `Sauvegarde créée, mais la copie externe a échoué (${r.copie}). Vérifiez que la clé USB ou le disque est branché.`
          : 'Sauvegarde créée avec succès.'
      );
      setVersion((v) => v + 1);
    } catch (e) {
      setErreur(e.message);
    } finally {
      setEnvoi(false);
    }
  }

  async function telecharger(nom) {
    setErreur('');
    try {
      const res = await fetch(
        `${adresseServeur()}/api/sauvegardes/${encodeURIComponent(nom)}/telecharger`,
        { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } }
      );
      if (!res.ok) throw new Error('Téléchargement impossible');
      const url = URL.createObjectURL(await res.blob());
      const lien = document.createElement('a');
      lien.href = url;
      lien.download = nom;
      lien.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setErreur(e.message);
    }
  }

  const derniere = donnees && donnees.sauvegardes[0];
  const echec = donnees && donnees.etat.derniere && !donnees.etat.derniere.ok;

  return (
    <div className="carte section">
      <div className="entete">
        <h2>Sauvegardes de la base de données</h2>
        <button className="btn" onClick={sauvegarderMaintenant} disabled={envoi}>
          {envoi ? 'Sauvegarde en cours...' : 'Sauvegarder maintenant'}
        </button>
      </div>

      {message && <div className="succes">{message}</div>}
      {erreur && <div className="erreur">{erreur}</div>}
      {echec && (
        <div className="erreur">
          La dernière sauvegarde automatique a échoué : {donnees.etat.derniere.message}
        </div>
      )}

      {donnees && !donnees.etat.dossier_copie && (
        <div className="avertissement">
          Aucune copie externe n’est configurée. Si ce PC tombe en panne, les sauvegardes seraient
          perdues avec lui. Branchez une clé USB ou un disque externe et indiquez son dossier dans
          le fichier de configuration du serveur (BACKUP_COPIE_DIR).
        </div>
      )}

      {donnees && (
        <>
          <p className="aide">
            {derniere
              ? `Dernière sauvegarde : ${dateHeureFr(derniere.date)}. `
              : 'Aucune sauvegarde pour le moment. '}
            Une sauvegarde est faite automatiquement au démarrage puis toutes les{' '}
            {donnees.etat.intervalle_heures} heures. Les sauvegardes récentes sont gardées 7 jours,
            puis une par jour pendant 3 mois.
          </p>
          <p className="aide">
            Dossier : <strong>{donnees.etat.dossier}</strong>
            {donnees.etat.dossier_copie && (
              <>
                <br />
                Copie externe : <strong>{donnees.etat.dossier_copie}</strong>
              </>
            )}
          </p>

          <div className="tableau-conteneur">
            <table className="tableau">
              <thead>
                <tr>
                  <th>Date et heure</th>
                  <th className="nombre">Taille</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {donnees.sauvegardes.length === 0 && (
                  <tr>
                    <td colSpan="3" className="vide">
                      Aucune sauvegarde.
                    </td>
                  </tr>
                )}
                {donnees.sauvegardes.slice(0, 15).map((s) => (
                  <tr key={s.nom}>
                    <td>{dateHeureFr(s.date)}</td>
                    <td className="nombre">{tailleLisible(s.taille)}</td>
                    <td>
                      <div className="actions-ligne">
                        <button className="lien-bouton" onClick={() => telecharger(s.nom)}>
                          Télécharger
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {donnees.sauvegardes.length > 15 && (
            <p className="aide">
              {donnees.sauvegardes.length} sauvegardes au total (les 15 plus récentes sont affichées).
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Connexion d'un deuxième PC (responsable)
// ------------------------------------------------------------
function Reseau() {
  const [info, setInfo] = useState(null);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    let actif = true;
    api('/reseau')
      .then((d) => actif && setInfo(d))
      .catch((e) => actif && setErreur(e.message));
    return () => {
      actif = false;
    };
  }, []);

  return (
    <div className="carte section">
      <h2>Utiliser un deuxième PC</h2>
      <p className="aide">
        Ce PC est le <strong>PC principal</strong> : il contient toutes les données. Le deuxième PC
        n’a rien à installer, il se connecte à celui-ci et voit le même stock en direct.
      </p>

      {erreur && <div className="erreur">{erreur}</div>}

      {info && (
        <>
          {info.adresses.length === 0 ? (
            <div className="avertissement">
              Ce PC n’est connecté à aucun réseau. Branchez-le au routeur du magasin (câble ou
              Wi-Fi) pour qu’un deuxième PC puisse s’y connecter.
            </div>
          ) : (
            <>
              <p>Sur le deuxième PC, ouvrez le navigateur et tapez l’adresse :</p>
              <ul className="liste-adresses">
                {info.adresses.map((a) => (
                  <li key={a}>
                    <code>
                      http://{a}:{info.port}
                    </code>
                  </li>
                ))}
              </ul>
              <p className="aide">Nom de ce PC : {info.nom_pc}</p>
            </>
          )}

          {!info.interface_servie && (
            <div className="avertissement">
              L’interface n’est pas encore préparée pour le deuxième PC. Dans le dossier du front,
              lancez la commande <code>npm run build</code>.
            </div>
          )}

          <p className="aide">
            À savoir : ce PC principal doit être allumé, avec le serveur démarré, pour que le
            deuxième PC fonctionne. Les deux PC doivent être sur le même réseau du magasin.
          </p>
        </>
      )}
    </div>
  );
}

// ------------------------------------------------------------
// Page
// ------------------------------------------------------------
export default function Parametres() {
  const { user } = useAuth();

  return (
    <div>
      <div className="entete">
        <h1>Paramètres</h1>
      </div>

      <div className="deux-colonnes">
        <FormulaireNom />
        <FormulaireMonMotDePasse />
      </div>

      {user.role === 'RESPONSABLE' && (
        <>
          <Utilisateurs />
          <Sauvegardes />
          <Reseau />
        </>
      )}
    </div>
  );
}