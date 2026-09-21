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
index.html      page complète (hero, réservation, soirée, footer, menu, dialog)
css/styles.css  tokens de marque + composants
js/app.js       logique de réservation + CONFIG
assets/img/     photos optionnelles (voir ci-dessous)
```

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
| `instagram`, `cocktailsMenuUrl`, `tapasMenuUrl` | liens optionnels, les entrées de menu s'affichent seulement s'ils sont renseignés |
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

## Fonctionnalités

- Choix de la date (bande défilante), du nombre de personnes, de la préférence terrasse / intérieur
- Créneaux horaires avec créneaux passés désactivés
- Coordonnées avec validation, demande spéciale pré-remplie depuis les boutons Anniversaire / Groupe / Événement privé
- Confirmation avec référence, ajout à l'agenda (.ics), modification et annulation
- Réservation en cours restaurée si le client rouvre la page
- Menu latéral, appel direct, itinéraire Google Maps
- Accessible : cibles ≥ 44 px, focus visible, `prefers-reduced-motion` respecté
