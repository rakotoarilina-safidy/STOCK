import { useEffect } from 'react';
import './ui.css';

export default function Modal({ titre, onFerme, large = false, children }) {
  // Échap ferme la fenêtre
  useEffect(() => {
    const touche = (e) => e.key === 'Escape' && onFerme();
    window.addEventListener('keydown', touche);
    return () => window.removeEventListener('keydown', touche);
  }, [onFerme]);

  return (
    <div className="modal-fond" onMouseDown={(e) => e.target === e.currentTarget && onFerme()}>
      <div className={large ? 'modal carte large' : 'modal carte'} role="dialog" aria-modal="true">
        <div className="modal-entete">
          <h2>{titre}</h2>
          <button className="lien-bouton" onClick={onFerme} aria-label="Fermer">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}