import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth-context.js';

// Même menu pour les deux rôles : seul le contenu des pages change
// (la responsable voit en plus les bénéfices et la gestion des comptes).
function menuPour(role) {
  return [
    ['/accueil', 'Accueil'],
    ['/fournisseurs', 'Fournisseurs'],
    ['/stock', 'Stock'],
    ['/vente', 'Vente'],
    ['/factures', 'Factures'],
    ['/bilan', role === 'RESPONSABLE' ? 'Bilan financier' : 'Statistiques'],
    ['/historique', 'Historique'],
    ['/parametres', 'Paramètres'],
  ];
}

export default function Layout() {
  const { user, logout } = useAuth();

  return (
    <div className="app">
      <aside className="menu">
        <div className="menu-titre">Gestion de stock</div>
        <nav>
          {menuPour(user.role).map(([chemin, libelle]) => (
            <NavLink
              key={chemin}
              to={chemin}
              className={({ isActive }) => (isActive ? 'lien actif' : 'lien')}
            >
              {libelle}
            </NavLink>
          ))}
        </nav>
        <div className="menu-bas">
          <div className="menu-user">
            <strong>{user.nom}</strong>
            <span className="muted">
              {user.role === 'RESPONSABLE' ? 'Responsable' : 'Caissier'}
            </span>
          </div>
          <button className="btn btn-clair" onClick={logout}>
            Déconnexion
          </button>
        </div>
      </aside>

      <main className="contenu">
        <Outlet />
      </main>
    </div>
  );
}