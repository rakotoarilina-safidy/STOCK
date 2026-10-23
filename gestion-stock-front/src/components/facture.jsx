import { createPortal } from 'react-dom';
import { MAGASIN } from '../config-magasin.js';
import './Facture.css';

// Nombres avec espaces classiques (les espaces insécables fins s'impriment mal sur certains tickets)
const nombre = (n) =>
  new Intl.NumberFormat('fr-FR')
    .format(Math.round(Number(n) || 0))
    .replace(/[\u202f\u00a0]/g, ' ');

function Ticket({ facture, exemplaire }) {
  const date = new Date(facture.date_facture || facture.date_vente);

  return (
    <div className="ticket">
      <div className="t-centre t-gras t-grand">{MAGASIN.nom}</div>
      {MAGASIN.adresse && <div className="t-centre">{MAGASIN.adresse}</div>}
      {MAGASIN.telephone && <div className="t-centre">Tél : {MAGASIN.telephone}</div>}

      <div className="t-trait" />

      <div className="t-centre t-gras">FACTURE {facture.numero_facture}</div>
      <div className="t-centre">
        {date.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' })}
      </div>
      <div className="t-ligne">
        <span>Caissier</span>
        <span>{facture.caissier}</span>
      </div>
      <div className="t-ligne">
        <span>Vente</span>
        <span>{facture.type_vente === 'GROS' ? 'Gros' : 'Détail'}</span>
      </div>

      <div className="t-trait" />

      {facture.lignes.map((l, i) => (
        <div className="t-article" key={i}>
          <div>{l.designation}</div>
          <div className="t-ligne">
            <span>
              {l.quantite_vendue} x {nombre(l.prix_unitaire_applique)}
            </span>
            <span>{nombre(l.total_ligne)}</span>
          </div>
        </div>
      ))}

      <div className="t-trait" />

      <div className="t-ligne t-gras t-grand">
        <span>TOTAL</span>
        <span>{nombre(facture.total)} Ar</span>
      </div>
      <div className="t-ligne">
        <span>Reçu</span>
        <span>{nombre(facture.montant_recu)} Ar</span>
      </div>
      <div className="t-ligne t-gras">
        <span>Monnaie rendue</span>
        <span>{nombre(facture.monnaie_rendue)} Ar</span>
      </div>

      <div className="t-trait" />

      <div className="t-centre">Merci de votre visite !</div>
      <div className="t-centre t-petit">— {exemplaire} —</div>
    </div>
  );
}

// Invisible à l'écran. Au moment d'imprimer, seule cette zone est imprimée :
// deux tickets identiques, chacun sur sa page (client puis magasin).
export default function ZoneImpression({ facture }) {
  return createPortal(
    <div id="zone-impression">
      <Ticket facture={facture} exemplaire="Exemplaire client" />
      <Ticket facture={facture} exemplaire="Exemplaire magasin" />
    </div>,
    document.body
  );
}