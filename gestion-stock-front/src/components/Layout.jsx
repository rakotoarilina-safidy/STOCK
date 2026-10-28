import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Truck,
  Receipt,
  TrendingUp,
  Settings,
  Wallet,
  ClipboardList,
  ChevronDown,
  LogOut,
} from 'lucide-react';
import { api } from '../api.js';
import { useAuth } from '../auth-context.js';
import { MAGASIN } from '../config-magasin.js';
import OuvertureCaisse from './OuvertureCaisse.jsx';
import logo from '../assets/logo.svg';

const CAISSE = {
  libelle: 'Caisse',
  icone: Wallet,
  enfants: [
    { chemin: '/caisse', libelle: 'Caisse du jour' },
    { chemin: '/caisse/historique', libelle: 'Historique de caisse' },
  ],
};

// Deux espaces distincts :
//  - la responsable ne fait pas de vente : état financier, stock, inventaire, bilan, paramètres ;
//  - le caissier gère les ventes, le stock, les livraisons et la caisse (sans les bénéfices).
function menuPour(role) {
  if (role === 'RESPONSABLE') {
    return [
      { chemin: '/accueil', libelle: 'État financier', icone: LayoutDashboard },
      { chemin: '/stock', libelle: 'Stock', icone: Package },
      { chemin: '/inventaire', libelle: 'Inventaire', icone: ClipboardList },
      { chemin: '/bilan', libelle: 'Bilan financier', icone: TrendingUp },
      {
        libelle: 'Paramètres',
        icone: Settings,
        enfants: [
          { chemin: '/parametres/compte', libelle: 'Mon compte' },
          { chemin: '/parametres/utilisateurs', libelle: 'Utilisateurs' },
          { chemin: '/parametres/sauvegardes', libelle: 'Sauvegardes' },
          { chemin: '/parametres/reseau', libelle: 'Deuxième PC' },
        ],
      },
    ];
  }

  return [
    { chemin: '/accueil', libelle: 'Accueil', icone: LayoutDashboard },
    { chemin: '/vente', libelle: 'Vente', icone: ShoppingCart },
    CAISSE,
    { chemin: '/stock', libelle: 'Stock', icone: Package },
    {
      libelle: 'Fournisseurs',
      icone: Truck,
      enfants: [
        { chemin: '/fournisseurs', libelle: 'Liste des fournisseurs' },
        { chemin: '/fournisseurs/livraisons', libelle: 'Livraisons' },
      ],
    },
    {
      libelle: 'Ventes',
      icone: Receipt,
      enfants: [
        { chemin: '/factures', libelle: 'Factures' },
        { chemin: '/historique', libelle: 'Historique' },
      ],
    },
    { chemin: '/bilan', libelle: 'Statistiques', icone: TrendingUp },
    {
      libelle: 'Paramètres',
      icone: Settings,
      enfants: [{ chemin: '/parametres/compte', libelle: 'Mon compte' }],
    },
  ];
}

const contient = (pathname, chemin) => pathname === chemin || pathname.startsWith(`${chemin}/`);

export default function Layout() {
  const { user, logout } = useAuth();
  const { pathname } = useLocation();
  const menu = menuPour(user.role);
  const estCaissier = user.role === 'CAISSIER';

  // Les groupes qui contiennent la page affichée sont ouverts au départ
  const [ouverts, setOuverts] = useState(
    () =>
      new Set(
        menu
          .filter((m) => m.enfants && m.enfants.some((e) => contient(pathname, e.chemin)))
          .map((m) => m.libelle)
      )
  );

  // ---------- Caisse du jour ----------
  // Au premier lancement de chaque journée, le caissier doit compter le reste d'hier.
  const [caisse, setCaisse] = useState(null);
  const [versionCaisse, setVersionCaisse] = useState(0);

  useEffect(() => {
    if (!estCaissier) return;
    let actif = true;
    const verifier = () =>
      api('/caisse/aujourdhui')
        .then((d) => actif && setCaisse(d))
        .catch(() => {});
    verifier();
    // Si le logiciel reste ouvert après minuit, on redemande le lendemain
    const minuterie = setInterval(verifier, 10 * 60 * 1000);
    return () => {
      actif = false;
      clearInterval(minuterie);
    };
  }, [estCaissier, versionCaisse]);

  const ouvertureRequise = estCaissier && caisse && !caisse.journee;

  function basculer(libelle) {
    setOuverts((precedent) => {
      const suivant = new Set(precedent);
      if (suivant.has(libelle)) suivant.delete(libelle);
      else suivant.add(libelle);
      return suivant;
    });
  }

  const initiales = user.nom
    .split(' ')
    .filter(Boolean)
    .map((mot) => mot[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="app">
      <aside className="menu">
        <div className="menu-marque">
          <img src={logo} alt="" />
          <div>
            <strong>{MAGASIN.nom}</strong>
            <span>Gestion de stock</span>
          </div>
        </div>

        <nav className="menu-nav">
          {menu.map((m) => {
            const Icone = m.icone;

            if (!m.enfants) {
              return (
                <NavLink
                  key={m.chemin}
                  to={m.chemin}
                  className={({ isActive }) => (isActive ? 'lien actif' : 'lien')}
                >
                  <Icone size={19} />
                  <span>{m.libelle}</span>
                </NavLink>
              );
            }

            const ouvert = ouverts.has(m.libelle);
            const groupeActif = m.enfants.some((e) => contient(pathname, e.chemin));

            return (
              <div key={m.libelle}>
                <button
                  className={groupeActif ? 'lien actif-groupe' : 'lien'}
                  onClick={() => basculer(m.libelle)}
                  aria-expanded={ouvert}
                >
                  <Icone size={19} />
                  <span>{m.libelle}</span>
                  <ChevronDown size={16} className={ouvert ? 'chevron ouvert' : 'chevron'} />
                </button>
                <div className={ouvert ? 'sous-menu ouvert' : 'sous-menu'}>
                  <div className="sous-menu-contenu">
                    {m.enfants.map((e) => (
                      <NavLink
                        key={e.chemin}
                        to={e.chemin}
                        end
                        className={({ isActive }) => (isActive ? 'sous-lien actif' : 'sous-lien')}
                      >
                        {e.libelle}
                      </NavLink>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </nav>

        <div className="menu-bas">
          <div className="avatar">{initiales}</div>
          <div className="menu-user">
            <strong>{user.nom}</strong>
            <span>{user.role === 'RESPONSABLE' ? 'Responsable' : 'Caissier'}</span>
          </div>
          <button
            className="deconnexion"
            onClick={logout}
            title="Se déconnecter"
            aria-label="Se déconnecter"
          >
            <LogOut size={19} />
          </button>
        </div>
      </aside>

      <main className="contenu">
        <Outlet context={{ versionCaisse, rafraichirCaisse: () => setVersionCaisse((v) => v + 1) }} />
      </main>

      {ouvertureRequise && (
        <OuvertureCaisse
          veille={caisse.veille}
          onOuverte={(etat) => {
            setCaisse(etat);
            setVersionCaisse((v) => v + 1);
          }}
        />
      )}
    </div>
  );
}
