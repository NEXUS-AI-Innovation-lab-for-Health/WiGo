# WiGo — Plateforme de dossier patient et d'imagerie médicale

WiGo réunit dans un même dossier patient deux mondes d'imagerie qui ne se
parlent habituellement pas : la **radiologie DICOM** et la **biopsie
numérisée**. S'y ajoutent une aide au diagnostic par segmentation de noyaux
et un compte rendu anatomopathologique guidé par un protocole en quatre
étapes que l'application fait respecter.

> **Projet d'étude.** L'authentification n'est pas implémentée : la
> plateforme ne doit pas héberger de données de patients réels.
> Voir [Sécurité — état réel](#sécurité--état-réel).

---

## Sommaire

- [Fonctionnalités](#fonctionnalités)
- [Architecture](#architecture)
- [Démarrage rapide](#démarrage-rapide)
- [Workflow OLGA](#workflow-olga)
- [Base de données et migrations](#base-de-données-et-migrations)
- [Développement au quotidien](#développement-au-quotidien)
- [API](#api)
- [Structure du dépôt](#structure-du-dépôt)
- [Sécurité — état réel](#sécurité--état-réel)
- [Dépannage](#dépannage)

---

## Fonctionnalités

### Radiologie — imagerie DICOM

Import d'un fichier `.dcm` depuis l'interface : le backend le relaie à
**Orthanc**, qui l'indexe, puis lit les métadonnées réelles (modalité au
niveau de la série, date et description au niveau de l'étude). Rien n'est
saisi à la main.

La visionneuse **Cornerstone.js** offre huit outils : fenêtrage, déplacement,
zoom, mesure de distance, régions rectangulaire et elliptique, annotation
fléchée et gomme. Le compte rendu se saisit en regard de l'image, avec les
annotations, et s'exporte en PDF.

### Biopsie — lames numérisées

Une lame pèse de 100 Mo à plusieurs gigaoctets : impossible à charger dans un
navigateur. À l'import, WiGo range le fichier source dans **MinIO** puis
génère une **pyramide de tuiles DZI** avec PyVips, servie à la demande selon
le niveau de zoom par **OpenSeadragon**.

> La conversion est **automatique**, aussi bien à l'import depuis l'interface
> qu'au premier démarrage de la pile. Aucune commande à lancer.

Annotation collaborative sur un calque SVG : rectangles, cercles, polygones et
libellés. Chaque tracé porte son auteur — vert pour les vôtres, orange pour
ceux des collègues. Une région encadrée devient une **extraction** : elle est
découpée en TIFF pyramidal et constitue un dossier d'analyse autonome.

### Aide au diagnostic

Le service **InstanSeg** (modèle spécialisé en histologie) segmente les noyaux
de la région sélectionnée, bornée à 1500 × 1500 pixels. Il restitue les
contours, superposés à la lame, ainsi que trois indicateurs : densité
cellulaire, taille moyenne des noyaux et indice de pléomorphisme.

Ces valeurs sont une **aide à la lecture**. Le diagnostic reste posé par le
praticien, qui seul valide l'étape correspondante.

### Compte rendu protocolaire

Quatre étapes ordonnées — Prélèvement, Préparation, Microscopie, Diagnostic —
dont les formulaires proviennent d'**OLGA**, un service externe. Le moteur
d'étapes vit côté serveur et garantit que :

- une étape ne peut être validée que si toutes celles qui la précèdent le sont ;
- la progression avance d'un cran à la fois, sans saut possible ;
- chaque validation enregistre son auteur et son horodatage ;
- une saisie partielle peut être conservée en brouillon sans franchir l'étape ;
- rouvrir un dossier le repositionne sur l'étape atteinte.

---

## Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│  Frontend  React 19 · TypeScript · Vite · Tailwind          :5173     │
│  Cornerstone.js (DICOM)          OpenSeadragon (lames)               │
└────────────────────────────────┬─────────────────────────────────────┘
                                 │ REST
┌────────────────────────────────▼─────────────────────────────────────┐
│  Backend  FastAPI · SQLAlchemy 2 · Pydantic 2 · Alembic     :8002     │
│  Moteur de workflow isolé (routeur / service / schémas)              │
└──┬──────────┬───────────┬────────────┬──────────────────┬────────────┘
   │          │           │            │                  │
┌──▼─────┐ ┌──▼─────┐ ┌───▼──────┐ ┌───▼────────┐ ┌───────▼──────────┐
│Postgres│ │ MinIO  │ │ Orthanc  │ │ Tuiles DZI │ │ InstanSeg        │
│ :5432  │ │ :9000  │ │  :8042   │ │ (disque)   │ │ :7000  (PyTorch) │
└────────┘ └────────┘ └──────────┘ └────────────┘ └──────────────────┘

                    ┌──────────────────────────────┐
                    │ OLGA  :9091  (service externe)│
                    │ définition des formulaires    │
                    └──────────────────────────────┘
```

Sept conteneurs : `postgres`, `minio`, `orthanc`, `backend`, `instanseg`,
`frontend`, `image_seeder`.

### Choix structurants

| Décision | Raison |
|---|---|
| Le moteur d'étapes vit chez WiGo, pas chez OLGA | Les données de santé restent dans la base de l'établissement et gardent leur lien au dossier patient. |
| OLGA ne fournit que la définition des formulaires | Son format propriétaire est traduit en JSON Schema par une couche anti-corruption unique. |
| Le suivi du workflow occupe deux tables dédiées | Les données de chaque étape sont en JSONB : un champ ajouté côté OLGA est conservé même sans colonne correspondante. |
| InstanSeg est un service séparé | Évite d'embarquer PyTorch dans l'API métier — image du backend réduite de 15 Go à 1,7 Go. |

---

## Démarrage rapide

### Prérequis

- Docker Desktop (Compose v2)
- 8 Go de RAM, et de l'espace disque pour les tuiles et les modèles

### Lancement

```bash
git clone <url-du-depot>
cd Projet6
docker compose up -d --build
```

Au premier démarrage, le service `image_seeder` détecte que la base est vide,
injecte les images présentes dans `backend/images_initiales/`, **génère les
tuiles DZI**, et crée les dossiers patients correspondants. Rejoué sur une
base déjà peuplée, il ne fait rien.

### Accès

| Service | URL | Identifiants |
|---|---|---|
| Application | http://localhost:5173 | aucun (voir Sécurité) |
| API + Swagger | http://localhost:8002/docs | — |
| Console MinIO | http://localhost:9001 | `minioadmin` / `minioadmin` |
| Orthanc | http://localhost:8042 | `orthanc` / `orthanc` |

### Ajouter vos propres images

Les lames volumineuses ne sont pas versionnées (`.gitignore`). Un clone frais
démarre avec une lame de démonstration et trois examens DICOM. Pour en
ajouter, **avant** le premier démarrage :

```text
backend/images_initiales/
├── biopsie/       # .svs, .tif, .tiff
└── radiologie/    # .dcm
```

Une fois la base peuplée, passez plutôt par l'interface : **Importer une
image**. Le tuilage se fait de la même façon.

---

## Workflow OLGA

Les quatre formulaires du parcours sont hébergés par **OLGA**, consulté
directement sur le port **9091**. WiGo lit la définition des champs, et rien
de plus.

```bash
# Stack OLGA, dans son propre dépôt
docker pull kirito140/olga-backend:latest
docker compose up -d
```

Le registre des étapes — identifiant de chaque formulaire OLGA — vit dans
[`frontend/src/features/workflow/steps.ts`](frontend/src/features/workflow/steps.ts).
C'est le seul endroit à modifier si un formulaire est recréé côté OLGA.

### Traduction en JSON Schema

[`olga/olgaAdapter.ts`](frontend/src/features/workflow/olga/olgaAdapter.ts) est
le **seul fichier du dépôt qui connaît le format d'OLGA**. Il traduit chaque
formulaire en JSON Schema, extrait le code technique du libellé
(`"canalaire (Carcinome canalaire)"` → valeur `canalaire`), et signale à
l'écran les types de champs qu'il ne sait pas rendre au lieu de les masquer.

### Si OLGA est indisponible

Les schémas convertis sont enregistrés dans le dépôt sous forme d'instantanés
versionnés. L'application les sert, l'indique par un bandeau, et **la saisie
reste possible**.

```bash
cd frontend && npm run olga:schemas   # régénère les instantanés
```

Le script réutilise exactement l'adaptateur de l'application : aucune logique
de conversion n'est dupliquée.

---

## Base de données et migrations

Sept tables métier, gérées par **Alembic**, appliqué automatiquement au
démarrage du backend.

```
patients ──┬── biopsies              lame numérisée, chemin des tuiles
           ├── radiology_studies     étude DICOM, compte rendu
           └── extractions ──┬── drawings          annotations géométriques
                             └── workflow_states ── workflow_step_states
                                                    données JSONB par étape,
                                                    validation et auteur
```

> La création automatique des tables (`create_all`) n'est plus utilisée : elle
> créait les tables absentes mais **n'ajoutait jamais de colonne** à une table
> existante, ce qui cassait silencieusement les bases déjà déployées.

Après toute modification de `backend/models.py` :

```bash
docker exec p6_backend sh -c 'cd /app && alembic revision --autogenerate -m "description"'
docker compose restart backend      # applique la migration
docker exec p6_backend sh -c 'cd /app && alembic current'
```

Pour tester une migration sans toucher aux données de travail, `ALEMBIC_URL`
permet de viser une base jetable.

---

## Développement au quotidien

Le code est monté en volume : les modifications sont prises en compte à chaud
côté frontend, et au redémarrage du conteneur côté backend.

```bash
docker compose logs -f backend      # journaux
docker compose restart backend      # après modification Python

cd frontend
npm run lint                        # analyse statique
npm run build                       # compilation de production (type-check inclus)
npm run olga:schemas                # régénère les instantanés de formulaires
```

### Conventions

- **Configuration par l'environnement.** Les valeurs en dur ne servent que de
  repli pour un lancement hors conteneur. `DATABASE_URL`, `VITE_API_URL` et
  `VITE_OLGA_API_URL` priment.
- **Aucune donnée inventée.** Une valeur absente s'affiche « non renseigné »,
  jamais une valeur plausible générée. Sur un dossier patient, une donnée
  fabriquée est indiscernable d'une donnée réelle.
- **Les erreurs se voient.** Pas de `catch` vide, pas de message générique :
  le détail renvoyé par le serveur est affiché à l'utilisateur.
- **Le nouveau code va dans les modules dédiés** (`backend/workflow/`,
  `frontend/src/features/`), pas dans les fichiers historiques.

### Variables d'environnement

| Variable | Service | Rôle |
|---|---|---|
| `DATABASE_URL` | backend | Connexion PostgreSQL |
| `MINIO_ACCESS_KEY` / `MINIO_SECRET_KEY` | backend | Stockage objet |
| `VITE_API_URL` | frontend | Adresse de l'API |
| `VITE_OLGA_API_URL` | frontend | Service de formulaires |
| `SEED_BASE_DIR` / `DZI_FOLDER` | seeder | Chemins, utiles pour les tests |
| `ALEMBIC_URL` | migrations | Cible une base autre que celle de travail |

---

## API

Documentation interactive : **http://localhost:8002/docs**

### Patients et images

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/patients` | Liste des dossiers |
| `POST` | `/patients` | Création |
| `DELETE` | `/patients/{id}` | Suppression du dossier et de ses fichiers |
| `POST` | `/patients/{id}/upload-biopsy` | Import d'une lame + tuilage DZI |
| `POST` | `/patients/{id}/upload-radiology` | Import DICOM vers Orthanc |

### Analyse et annotations

| Méthode | Route | Rôle |
|---|---|---|
| `POST` | `/analyze-ai` | Segmentation des noyaux d'une région |
| `POST` | `/extract-roi` | Création d'une extraction |
| `POST` | `/annotations/save` | Enregistrement des annotations |
| `GET` | `/patients/{folder_id}/extractions` | Extractions d'un dossier |
| `GET` | `/extractions/{id}/details` | Détail d'une extraction |
| `DELETE` | `/extractions/{id}` | Suppression |

### Workflow

| Méthode | Route | Rôle |
|---|---|---|
| `GET` | `/extractions/{id}/workflow` | Avancement complet |
| `PUT` | `/extractions/{id}/workflow/steps/{step}` | Enregistre une étape |
| `POST` | `/extractions/{id}/workflow/goto` | Revient sur une étape atteinte |

Refus explicites : `409` si la transition est interdite, `422` si un champ
obligatoire manque, `404` si l'étape est inconnue.

### Divers

`GET /health` interroge réellement chaque dépendance et renvoie `503` avec
l'erreur exacte si l'une d'elles est indisponible.

---

## Structure du dépôt

```
backend/
├── main.py                 API historique (patients, images, IA, extractions)
├── models.py               Modèles SQLAlchemy
├── database.py             Connexion, session
├── instanseg_client.py     Client HTTP du service d'IA
├── seed_images.py          Injection initiale (base vide uniquement)
├── workflow/               Moteur d'étapes — structure cible
│   ├── router.py           Routes HTTP
│   ├── service.py          Machine à états, règles de transition
│   ├── schemas.py          Contrats Pydantic
│   └── constants.py        Étapes et projection vers les colonnes
├── alembic/                Migrations
└── images_initiales/       Images de démonstration

frontend/src/
├── pages/                  Dashboard, Viewer (biopsie), RadiologyViewer, Login
├── components/             Carte patient, modales
├── services/api.ts         Client HTTP
├── features/workflow/      Module workflow — structure cible
│   ├── steps.ts            Registre des quatre étapes
│   ├── useWorkflow.ts      État serveur du parcours
│   ├── useOlgaForm.ts      Chargement du formulaire courant
│   ├── workflowApi.ts      Client du moteur d'étapes
│   ├── olga/               Frontière OLGA : client, adaptateur, types
│   ├── schemas/            Instantanés JSON Schema versionnés
│   └── components/         Frise d'avancement, rendu de formulaire
└── scripts/                Régénération des instantanés

instanseg/                  Micro-service de segmentation
docker-compose.yml          Orchestration des sept conteneurs
```

---

## Sécurité — état réel

Cette section décrit l'état du projet, pas un objectif.

| Point | État |
|---|---|
| Authentification | **Absente.** L'identité vient du stockage local du navigateur et n'est vérifiée par aucun service. |
| Signature des validations | **Falsifiable.** La traçabilité n'a donc pas de valeur médico-légale. |
| Contrôle d'accès par rôle | Absent. Un technicien peut valider l'étape de diagnostic. |
| Accès aux images | Les tuiles sont servies sans contrôle. |
| CORS | Ouvert à toutes les origines. |
| Identifiants des services | Valeurs par défaut, en clair dans le `docker-compose.yml`. |
| Chiffrement | Aucun : les services communiquent en clair sur le réseau conteneurisé. |

**Conséquence : ne pas déposer de données de patients réels.**

Prochaine étape prévue : authentification par jeton, rôles (technicien,
pathologiste, radiologue), et contrôle d'accès sur les tuiles.

---

## Dépannage

**« Aucun patient trouvé » ou échec de requête**
Vérifiez que `VITE_API_URL` pointe sur `http://localhost:8002` et que le
backend répond : `curl http://localhost:8002/health`.

**Bandeau « Le service de formulaires OLGA est injoignable »**
La stack OLGA n'est pas démarrée. L'application reste utilisable : les
formulaires sont servis depuis les instantanés versionnés.

**Écran noir en radiologie**
L'étude n'est pas dans Orthanc, ou son identifiant ne correspond pas à celui
enregistré. Vérifiez sur http://localhost:8042.

**« Lame source introuvable dans MinIO »**
Le message liste les emplacements essayés. Vérifiez que l'objet existe :
console MinIO, bucket `biopsie`.

**Le seeder n'injecte rien**
Il ne s'exécute que sur une base vide — c'est voulu, pour éviter les doublons
et le retuilage à chaque démarrage. Ses journaux : `docker logs p6_image_seeder`.

**Le backend démarre mais `/health` renvoie 503**
La réponse contient l'erreur exacte du service en cause.

---

## Licence

Aucune licence n'est encore associée à ce dépôt.
