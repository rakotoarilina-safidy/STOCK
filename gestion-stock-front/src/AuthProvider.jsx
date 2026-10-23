import { useState } from 'react';
import { AuthContext } from './auth-context.js';
import { api } from './api.js';

function utilisateurStocke() {
  try {
    return JSON.parse(localStorage.getItem('user'));
  } catch {
    return null;
  }
}

export default function AuthProvider({ children }) {
  const [user, setUser] = useState(utilisateurStocke);

  async function login(username, mot_de_passe) {
    const data = await api('/auth/login', {
      method: 'POST',
      body: { username, mot_de_passe },
    });
    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(data.user));
    setUser(data.user);
  }

  // Met à jour l'utilisateur affiché (ex. après un changement de nom)
  function majUtilisateur(partiel) {
    const nouveau = { ...user, ...partiel };
    localStorage.setItem('user', JSON.stringify(nouveau));
    setUser(nouveau);
  }

  function logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, login, logout, majUtilisateur }}>
      {children}
    </AuthContext.Provider>
  );
}