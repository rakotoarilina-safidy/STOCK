import { useEffect, useState } from 'react';
import { Link, useOutletContext } from 'react-router-dom';
import { Wallet } from 'lucide-react';
import { api } from '../api.js';
import { montant } from '../format.js';
import './ui.css';

// Résumé de la caisse du jour pour la page d'accueil
export default function CarteCaisse() {
  const { versionCaisse } = useOutletContext();
  const [etat, setEtat] = useState(null);

  useEffect(() => {
    let actif = true;
    api('/caisse/aujourdhui')
      .then((d) => actif && setEtat(d))
      .catch(() => {});
    return () => {
      actif = false;
    };
  }, [versionCaisse]);

  if (!etat) return null;
  const j = etat.journee;

  return (
    <div className="carte section">
      <div className="entete">
        <h2 className="titre-icone">
          <Wallet size={18} />
          Caisse du jour
        </h2>
        <Link to="/caisse" className="lien-simple">
          Voir le détail
        </Link>
      </div>

      {!j ? (
        <p className="muted">La caisse d’aujourd’hui n’est pas encore ouverte.</p>
      ) : (
        <div className="caisse-resume">
          <div>
            <span className="muted">À l’ouverture</span>
            <strong>{montant(j.fonds_ouverture)}</strong>
          </div>
          <div>
            <span className="muted">Ventes encaissées</span>
            <strong>{montant(j.ventes)}</strong>
          </div>
          <div className="attendu">
            <span className="muted">Argent attendu en caisse</span>
            <strong>{montant(j.attendu_actuel)}</strong>
          </div>
          <div>
            <span className="muted">Journée</span>
            <strong>{j.statut === 'CLOTUREE' ? 'Clôturée' : 'En cours'}</strong>
          </div>
        </div>
      )}
    </div>
  );
}
