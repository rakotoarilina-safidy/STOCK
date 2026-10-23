import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth-context.js';

export default function Login() {
  const { user, login } = useAuth();
  const [username, setUsername] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
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
      <form className="carte login-carte" onSubmit={soumettre}>
        <h1>Gestion de stock</h1>
        <p className="muted">Connectez-vous pour continuer</p>

        <label>
          Identifiant
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoFocus
            autoComplete="username"
          />
        </label>

        <label>
          Mot de passe
          <input
            type="password"
            value={motDePasse}
            onChange={(e) => setMotDePasse(e.target.value)}
            autoComplete="current-password"
          />
        </label>

        {erreur && <div className="erreur">{erreur}</div>}

        <button type="submit" className="btn" disabled={chargement || !username || !motDePasse}>
          {chargement ? 'Connexion...' : 'Se connecter'}
        </button>
      </form>
    </div>
  );
}