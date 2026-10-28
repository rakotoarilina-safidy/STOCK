import './ui.css';

const PERIODES = [
  ['jour', 'Aujourd’hui'],
  ['semaine', 'Cette semaine'],
  ['mois', 'Ce mois'],
  ['annee', 'Cette année'],
  ['perso', 'Dates précises'],
];

// À placer dans une <div className="barre">
export default function SelecteurPeriode({ periode, onPeriode, du, au, onDu, onAu }) {
  return (
    <>
      <div className="onglets">
        {PERIODES.map(([cle, libelle]) => (
          <button
            key={cle}
            className={periode === cle ? 'actif' : ''}
            onClick={() => onPeriode(cle)}
          >
            {libelle}
          </button>
        ))}
      </div>

      {periode === 'perso' && (
        <>
          <input type="date" value={du} onChange={(e) => onDu(e.target.value)} />
          <span className="muted">au</span>
          <input type="date" value={au} onChange={(e) => onAu(e.target.value)} />
        </>
      )}
    </>
  );
}
