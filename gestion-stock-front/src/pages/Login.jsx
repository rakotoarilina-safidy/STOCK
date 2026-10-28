import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { User, Lock, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../auth-context.js';
import { MAGASIN } from '../config-magasin.js';
import logo from '../assets/logo.svg';

// Bande d'auvent de marché, rappel du logo
function Auvent() {
  return (
    <svg className="auvent" aria-hidden="true">
      <defs>
        <pattern id="festons" width="88" height="40" patternUnits="userSpaceOnUse">
          <path d="M0 0H44V16A22 22 0 0 1 0 16Z" fill="#f2a900" />
          <path d="M44 0H88V16A22 22 0 0 1 44 16Z" fill="#fff6dc" />
        </pattern>
      </defs>
      <rect width="100%" height="40" fill="url(#festons)" />
    </svg>
  );
}

export default function Login() {
  const { user, login } = useAuth();
  const [username, setUsername] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [voir, setVoir] = useState(false);
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(false);

  if (user) return <Navigate to="/" replace />;

  async function soumettre(e) {
    e.preventDefault();
    setErreur('');
    setChargement(true);
    try {
      await login(username.trim(), motDePasse);
    } catch (err) {
      setErreur(err.message);
    } finally {
      setChargement(false);
    }
  }

  return (
    <div className="login-page">
      <section className="login-visuel">
        <Auvent />
        <div className="login-visuel-corps">
          <div className="login-marque">
            <img src={logo} alt="" />
            <span>{MAGASIN.nom}</span>
          </div>

          <div className="login-message">
            <h1>Gestion des ventes et du stock</h1>
            <p>Connectez-vous pour continuer.</p>
          </div>

          <small>
            © {new Date().getFullYear()} {MAGASIN.nom}
          </small>
        </div>
      </section>

      <section className="login-zone">
        <form className="login-form" onSubmit={soumettre}>
          <img className="login-logo-mobile" src={logo} alt="" />
          <h2>Connexion</h2>

          <label>
            Identifiant
            <div className="champ-icone">
              <User size={18} />
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                autoComplete="username"
              />
            </div>
          </label>

          <label>
            Mot de passe
            <div className="champ-icone">
              <Lock size={18} />
              <input
                type={voir ? 'text' : 'password'}
                value={motDePasse}
                onChange={(e) => setMotDePasse(e.target.value)}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="oeil"
                onClick={() => setVoir((v) => !v)}
                aria-label={voir ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
              >
                {voir ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>

          {erreur && <div className="erreur">{erreur}</div>}

          <button type="submit" className="btn" disabled={chargement || !username || !motDePasse}>
            {chargement ? 'Connexion...' : 'Se connecter'}
          </button>
        </form>
      </section>
    </div>
  );
}
