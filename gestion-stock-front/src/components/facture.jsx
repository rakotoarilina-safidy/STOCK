import { createPortal } from 'react-dom';
import { MAGASIN } from '../config-magasin.js';
import './Facture.css';

// Nombres avec espaces classiques (les espaces insécables fins s'impriment mal sur certains tickets)
const nombre = (n) =>
  new Intl.NumberFormat('fr-FR')
    .format(Math.round(Number(n) || 0))
    .replace(/[\u202f\u00a0]/g, ' ');

function Ticket({ facture }) {
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

      <div className="t-trait" />

      <table className="t-table">
        <thead>
          <tr>
            <th className="t-col-q">Quantité</th>
            <th>Désignation</th>
            <th className="t-col-n">PU</th>
            <th className="t-col-m">Montant</th>
          </tr>
        </thead>
        <tbody>
          {facture.lignes.map((l, i) => (
            <tr key={i}>
              <td className="t-col-q">{l.quantite_vendue}</td>
              <td>{l.designation}</td>
              <td className="t-col-n">{nombre(l.prix_unitaire_applique)}</td>
              <td className="t-col-m">{nombre(l.total_ligne)}</td>
            </tr>
          ))}
        </tbody>
      </table>

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
    </div>
  );
}

// Invisible à l'écran. Au moment d'imprimer, seule cette zone est imprimée :
// deux tickets identiques, chacun sur sa page (un pour le client, un pour le magasin).
export default function ZoneImpression({ facture }) {
  return createPortal(
    <div id="zone-impression">
      <Ticket facture={facture} />
      <Ticket facture={facture} />
    </div>,
    document.body
  );
}
