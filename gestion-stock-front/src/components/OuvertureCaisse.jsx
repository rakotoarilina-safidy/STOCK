import { useState } from 'react';
import { Wallet } from 'lucide-react';
import { api } from '../api.js';
import Modal from './Modal.jsx';
import { montant } from '../format.js';

const enNombre = (v) => Number(String(v).replace(/\s/g, '').replace(',', '.'));

const jourLong = () =>
  new Date().toLocaleDateString('fr-FR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

// veille : { existe, cloturee, reste } renvoyé par /caisse/aujourdhui
// onFermer : si absent, la fenêtre est obligatoire (impossible de la fermer sans saisir le montant)
//
// Le reste d'hier et l'argent à l'ouverture sont deux informations séparées :
// on ne les compare pas, la journée part de l'argent saisi ici.
export default function OuvertureCaisse({ veille, onOuverte, onFermer }) {
  const [valeur, setValeur] = useState('');
  const [note, setNote] = useState('');
  const [erreur, setErreur] = useState('');
  const [envoi, setEnvoi] = useState(false);

  const compte = enNombre(valeur);
  const valide = valeur.trim() !== '' && !isNaN(compte) && compte >= 0;
  const resteHier = veille ? veille.reste : null;

  async function envoyer(e) {
    e.preventDefault();
    if (!valide) return;
    setEnvoi(true);
    setErreur('');
    try {
      const etat = await api('/caisse/ouvrir', {
        method: 'POST',
        body: { argent_ouverture: compte, note },
      });
      onOuverte(etat);
    } catch (err) {
      setErreur(err.message);
      setEnvoi(false);
    }
  }

  return (
    <Modal titre="Ouverture de la caisse" onFerme={onFermer || (() => {})} fermable={!!onFermer}>
      <p className="jour-long">
        <Wallet size={17} /> {jourLong()}
      </p>

      <form onSubmit={envoyer}>
        {resteHier !== null && (
          <div className="compte-ligne">
            <span>Reste d’hier</span>
            <strong>{montant(resteHier)}</strong>
          </div>
        )}

        <label className="espace-haut">
          Argent dans la caisse à l’ouverture (Ar)
          <input
            value={valeur}
            onChange={(e) => setValeur(e.target.value)}
            inputMode="decimal"
            placeholder="0"
            autoFocus
          />
        </label>

        <label>
          Remarque (facultatif)
          <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={255} />
        </label>

        {erreur && <div className="erreur">{erreur}</div>}
        <div className="modal-actions">
          {onFermer && (
            <button type="button" className="btn btn-secondaire" onClick={onFermer}>
              Plus tard
            </button>
          )}
          <button type="submit" className="btn" disabled={!valide || envoi}>
            {envoi ? 'Enregistrement...' : 'Ouvrir la caisse'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
