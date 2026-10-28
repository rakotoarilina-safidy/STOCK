import { useEffect } from 'react';
import './ui.css';

// fermable = false : la fenêtre ne se ferme ni avec Échap ni en cliquant à côté
// (utilisé pour l'ouverture obligatoire de la caisse).
export default function Modal({ titre, onFerme, large = false, fermable = true, children }) {
  useEffect(() => {
    if (!fermable) return;
    const touche = (e) => e.key === 'Escape' && onFerme();
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, [onFerme, fermable]);

  return (
    <div
      className="modal-fond"
      onMouseDown={(e) => fermable && e.target === e.currentTarget && onFerme()}
    >
      <div className={large ? 'modal carte large' : 'modal carte'} role="dialog" aria-modal="true">
        <div className="modal-entete">
          <h2>{titre}</h2>
          {fermable && (
            <button className="lien-bouton" onClick={onFerme} aria-label="Fermer">
              ✕
            </button>
          )}
        </div>
        <div className="modal-corps">{children}</div>
      </div>
    </div>
  );
}
