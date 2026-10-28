// Adresse du serveur :
//  1. celle enregistrée sur ce PC (réglage manuel), sinon
//  2. en version installée (construite) : la même que la page, car c'est le serveur
//     lui-même qui envoie l'interface, sinon
//  3. en développement : celle du fichier .env, ou localhost.
export function adresseServeur() {
  const enregistree = localStorage.getItem('api_url');
  if (enregistree) return enregistree;
  if (!import.meta.env.DEV) return window.location.origin;
  return import.meta.env.VITE_API_URL || 'http://localhost:3000';
}

export async function api(chemin, { method = 'GET', body } = {}) {
  const token = localStorage.getItem('token');

  let res;
  try {
    res = await fetch(`${adresseServeur()}/api${chemin}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Impossible de joindre le serveur. Vérifiez qu\u2019il est démarré.');
  }

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    // Session expirée : retour à l'écran de connexion
    if (res.status === 401 && token) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      window.location.href = '/login';
    }
    throw new Error(data.message || 'Une erreur est survenue');
  }
  return data;
}
