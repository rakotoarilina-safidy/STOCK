import { useState } from 'react';
import Modal from './Modal.jsx';

// Fenêtre de confirmation intégrée à l'application (remplace window.confirm).
// <Confirmation
//    titre="Supprimer l'article"
//    message="Voulez-vous vraiment supprimer « Riz » ?"
//    confirmer="Supprimer"
//    danger
//    onConfirmer={async () => { ... }}
//    onAnnuler={() => ... } />
export default function Confirmation({
  titre,
  message,
  confirmer = 'Confirmer',
  danger = false,
  onConfirmer,
  onAnnuler,
}) {
  const [occupe, setOccupe] = useState(false);

  async function valider() {
    setOccupe(true);
    try {
      await onConfirmer();
    } finally {
      setOccupe(false);
    }
  }

  return (
    <Modal titre={titre} onFerme={onAnnuler}>
      <p className="message-confirmation">{message}</p>
      <div className="modal-actions">
        {/* Le focus est sur « Annuler » : appuyer sur Entrée par erreur ne supprime rien */}
        <button className="btn btn-secondaire" onClick={onAnnuler} disabled={occupe} autoFocus>
          Annuler
        </button>
        <button
          className={danger ? 'btn btn-danger' : 'btn'}
          onClick={valider}
          disabled={occupe}
        >
          {occupe ? 'Patientez...' : confirmer}
        </button>
      </div>
    </Modal>
  );
}
