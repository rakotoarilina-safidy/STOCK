import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './auth-context.js';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Vente from './pages/Vente.jsx';
import Stock from './pages/Stock.jsx';
import Fournisseurs from './pages/Fournisseurs.jsx';
import Factures from './pages/Factures.jsx';
import Historique from './pages/Historique.jsx';
import Accueil from './pages/Accueil.jsx';
import Bilan from './pages/Bilan.jsx';
import Caisse from './pages/Caisse.jsx';
import Inventaire from './pages/Inventaire.jsx';
import Parametres from './pages/Parametres.jsx';

// Bloque l'accès si l'utilisateur n'est pas connecté,
// ou si son rôle n'a pas le droit d'ouvrir cette page.
function Protege({ roles, children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/" replace />;
  return children;
}

// Après la connexion : le caissier arrive directement sur la caisse,
// la responsable sur l'état financier.
function Depart() {
  const { user } = useAuth();
  return <Navigate to={user.role === 'RESPONSABLE' ? '/accueil' : '/vente'} replace />;
}

const CAISSIER = ['CAISSIER'];
const RESPONSABLE = ['RESPONSABLE'];

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          element={
            <Protege>
              <Layout />
            </Protege>
          }
        >
          <Route path="/" element={<Depart />} />
          <Route path="/accueil" element={<Accueil />} />

          {/* Vente : côté caissier uniquement */}
          <Route
            path="/vente"
            element={
              <Protege roles={CAISSIER}>
                <Vente />
              </Protege>
            }
          />

          {/* Inventaire : côté responsable uniquement */}
          <Route
            path="/inventaire"
            element={
              <Protege roles={RESPONSABLE}>
                <Inventaire />
              </Protege>
            }
          />

          {/* Caisse : côté caissier uniquement */}
          <Route
            path="/caisse"
            element={
              <Protege roles={CAISSIER}>
                <Caisse onglet="jour" />
              </Protege>
            }
          />
          <Route
            path="/caisse/historique"
            element={
              <Protege roles={CAISSIER}>
                <Caisse onglet="historique" />
              </Protege>
            }
          />

          <Route path="/stock" element={<Stock />} />
          <Route path="/fournisseurs" element={<Fournisseurs onglet="fournisseurs" />} />
          <Route path="/fournisseurs/livraisons" element={<Fournisseurs onglet="livraisons" />} />

          <Route path="/factures" element={<Factures />} />
          <Route path="/historique" element={<Historique />} />
          <Route path="/bilan" element={<Bilan />} />

          <Route path="/parametres" element={<Navigate to="/parametres/compte" replace />} />
          <Route path="/parametres/:section" element={<Parametres />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
