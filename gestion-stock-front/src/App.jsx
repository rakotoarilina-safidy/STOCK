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
import Parametres from './pages/Parametres.jsx';

// Bloque l'accès si l'utilisateur n'est pas connecté
function Protege({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

// Après la connexion : le caissier arrive directement sur la caisse,
// la responsable sur l'accueil.
function Depart() {
  const { user } = useAuth();
  return <Navigate to={user.role === 'RESPONSABLE' ? '/accueil' : '/vente'} replace />;
}

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
          <Route path="/fournisseurs" element={<Fournisseurs />} />
          <Route path="/stock" element={<Stock />} />
          <Route path="/vente" element={<Vente />} />
          <Route path="/factures" element={<Factures />} />
          <Route path="/bilan" element={<Bilan />} />
          <Route path="/historique" element={<Historique />} />
          <Route path="/parametres" element={<Parametres />} />
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}