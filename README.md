# Una Más — Réservation

Expérience mobile de réservation pour Una Más, cocktails & food au Port de Carnon.

Page unique, statique (HTML / CSS / JS), sans build ni dépendance. Tout se passe au même endroit : accueil, réservation en 3 étapes, confirmation, demandes spéciales, infos pratiques.

## Lancer

Ouvrir `index.html` dans un navigateur, ou servir le dossier :

```
npx serve .
```

Déployable tel quel sur Vercel, Netlify, GitHub Pages ou n'importe quel hébergement statique.

## Structure

```
index.html          page client (hero, carte, réservation, soirée, footer, menu)
admin/index.html    tableau de bord du gérant (login, planning, réservations, clients, activité)
css/styles.css      tokens de marque + composants partagés
css/admin.css       styles du tableau de bord (importe styles.css)
js/app.js           logique de réservation client + CONFIG
js/menu.js          données de la carte
js/admin-data.js    couche de données du tableau de bord (Store) + ADMIN_CONFIG
js/admin.js         interface du tableau de bord
assets/img/         logo, photos, cartes
```

Deux adresses pour un seul déploiement : la racine pour les clients, `/admin` pour le gérant.

## Tableau de bord gérant (`/admin`)

- **Planning** : grille heures × jours, au choix jour, 3 jours ou semaine (choix mémorisé). Chaque colonne affiche le nombre de réservations, les couverts et une jauge de remplissage. Chaque réservation est une pastille colorée par statut. Un tap sur une pastille ouvre la fiche, un tap sur une case vide crée une réservation pré-remplie à cette date et cette heure.
- **Réservations** : recherche (nom, téléphone, référence), filtres période et statut, fiche complète modifiable, création manuelle pour les réservations téléphoniques.
- **Clients** : fiches agrégées par téléphone (visites, couverts, no-show, à venir, historique), tags et notes internes du gérant, tag « Habitué » automatique à partir de 3 visites.
- **Activité** : volontairement réduit à trois chiffres (couverts servis, réservations, taux de no-show, comparés à la période précédente) et un graphique des couverts par jour, sur 7 ou 30 jours.

### Mode démo et bascule vers Supabase

Sans base connectée, `js/admin-data.js` génère un jeu de démonstration fictif (déterministe) stocké dans le navigateur, et le login propose « Entrer en mode démo ». Une réservation faite sur la page client dans le même navigateur remonte dans le tableau de bord.

Toute l'interface passe par l'objet `Store` (`all`, `byDate`, `range`, `upsert`, `setStatus`, `customers`, `saveCustomer`, `occupancy`). Pour brancher Supabase : renseigner `ADMIN_CONFIG.supabase`, réimplémenter ces fonctions avec `supabase-js` (tables `reservations` et `customers`, RLS activée) et activer la connexion e-mail / mot de passe dans le formulaire de login. L'interface ne change pas.

`ADMIN_CONFIG.capacity` (couverts simultanés par zone) et `slots` pilotent la jauge d'occupation. À ajuster avec le gérant.

## Configuration

Tout se règle dans l'objet `CONFIG` en haut de `js/app.js` :

| Clé | Rôle |
| --- | --- |
| `endpoint` | URL qui reçoit la réservation en POST JSON (Formspree, Make, n8n, Supabase…). Vide = mode démo, la réservation n'est gardée que sur le téléphone du client. |
| `slots` | créneaux proposés, par défaut 18:00 → 23:30 toutes les 30 min |
| `closedWeekdays` | jours de fermeture, `0` = dimanche … `6` = samedi |
| `blockedSlots` | créneaux fermés pour une date donnée |
| `daysAhead` | nombre de jours ouverts à la réservation |
| `minGuests` / `maxGuests` | taille de table, au-delà le client est renvoyé vers la demande spéciale |
| `leadMinutes` | délai minimal avant un créneau le jour même |
| `instagram` | lien Instagram affiché dans le menu et le footer |
| `phone`, `phoneIntl`, `address` | coordonnées affichées et utilisées dans l'agenda |

### Payload envoyé à `endpoint`

```json
{
  "ref": "UM-XXXXXXX",
  "date": "2026-06-28",
  "time": "20:00",
  "guests": 2,
  "pref": "Terrasse",
  "firstName": "…", "lastName": "…", "phone": "…", "email": "…", "note": "…",
  "createdAt": "2026-06-20T10:00:00.000Z",
  "restaurant": "Una Más"
}
```

## Identité

- Police unique : Manrope (Google Fonts)
- Vert sauge du logo `#77926E` comme seul accent, fond blanc, footer et menu vert foncé
- Logo : `assets/img/logo.png` est un masque alpha, embarqué en data URI dans `css/styles.css` (`--logo`) et recoloré en CSS. Pour le remplacer par le fichier source du restaurant, régénérer la data URI ou pointer `--logo` vers le fichier.

## Photos

Les photos actuelles sont extraites de captures du site unamas.fr (basse résolution). Les remplacer par les originaux, mêmes noms :

- `assets/img/hero.jpg` — terrasse (4:3, ≥ 1200 px de large)
- `assets/img/terrasse.jpg` — carte « Terrasse » à l'étape horaire (16:8)
- `assets/img/soiree.jpg` — section « Une soirée à votre image » (4:3)

## La carte

Section « La carte » sous le hero, accessible aussi depuis le menu latéral et sous le formulaire. Ouvre un panneau à trois onglets (Cocktails, Tapas, Boissons) rendu en texte natif, avec lien vers l'image originale.

- Données : `js/menu.js`, transcrites des cartes publiées sur unamas.fr. Modifier ce fichier pour changer un prix ou un plat.
- Images originales : `assets/img/carte-cocktails.jpg`, `carte-tapas.jpg`, `carte-boissons.jpg`.
- Un item a soit `price` (prix unique) soit `prices` (plusieurs colonnes définies par `cols` sur la section, `null` pour une case vide).

## Fonctionnalités

- Choix de la date (bande défilante), du nombre de personnes, de la préférence terrasse / intérieur
- Créneaux horaires avec créneaux passés désactivés
- Coordonnées avec validation, demande spéciale pré-remplie depuis les boutons Anniversaire / Groupe / Événement privé
- Confirmation avec référence, ajout à l'agenda (.ics), modification et annulation
- Réservation en cours restaurée si le client rouvre la page
- Menu latéral, appel direct, itinéraire Google Maps
- Accessible : cibles ≥ 44 px, focus visible, `prefers-reduced-motion` respecté
