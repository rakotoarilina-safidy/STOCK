import { montant, compact } from '../format.js';
import './ui.css';

// donnees : [{ etiquette: '22/10', valeurs: [190000, 30000] }, ...]
// series  : [{ nom: 'Ventes', couleur: '#1d4ed8' }, { nom: 'Bénéfice', couleur: '#16a34a' }]
export default function Histogramme({ donnees, series }) {
  if (donnees.length === 0) {
    return <p className="muted">Aucune donnée sur cette période.</p>;
  }

  const max = Math.max(1, ...donnees.flatMap((d) => d.valeurs));
  const afficherValeurs = series.length === 1 && donnees.length <= 15;

  return (
    <div className="histo">
      {series.length > 1 && (
        <div className="histo-legende">
          {series.map((s) => (
            <span key={s.nom}>
              <i style={{ background: s.couleur }} />
              {s.nom}
            </span>
          ))}
        </div>
      )}

      <div className="histo-zone">
        {donnees.map((d) => (
          <div className="histo-col" key={d.etiquette}>
            <div className="histo-barres">
              {d.valeurs.map((v, i) => (
                <div
                  key={i}
                  className="histo-barre"
                  style={{
                    height: `${(Math.max(0, v) / max) * 100}%`,
                    background: series[i].couleur,
                  }}
                  title={`${d.etiquette} — ${series[i].nom} : ${montant(v)}`}
                >
                  {afficherValeurs && v > 0 && <span className="histo-valeur">{compact(v)}</span>}
                </div>
              ))}
            </div>
            <span className="histo-etiquette">{d.etiquette}</span>
          </div>
        ))}
      </div>
    </div>
  );
}