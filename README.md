# 🔬 WiGo / OncoCollab - Plateforme Multimodale d'Imagerie Médicale & IA

**WiGo** est une solution avancée de **Dossier Patient Informatisé (DPI) et de Pathologie Numérique**. Elle permet la visualisation centralisée, l'annotation collaborative et l'analyse par Intelligence Artificielle d'images médicales complexes, allant de la radiologie classique (DICOM) aux biopsies haute résolution (Whole Slide Imaging).

Conçue pour s'intégrer dans des workflows médicaux comme OncoCollab, elle assure la transition fluide entre le stockage froid (MinIO / Orthanc) et la visualisation web instantanée grâce à une architecture microservices robuste et automatisée.

---

## 🚀 Fonctionnalités Clés

### 1. Imagerie Multimodale (Radiologie & Biopsie)

* **Module Radiologie (PACS) :** Intégration native avec un serveur **Orthanc** pour le stockage et la distribution des fichiers DICOM. Visualisation performante via **Cornerstone.js** (Contraste, Pan, Zoom, Mesures, Export PDF).
* **Module Biopsie (WSI) :** Affichage fluide d'images gigapixels au format Deep Zoom (DZI) sans temps de chargement via **OpenSeadragon**. Support natif des fichiers scanners standards (.svs, .tif).

### 2. Analyse par Intelligence Artificielle (InstanSeg)

* **Segmentation Cellulaire :** Intégration d'un microservice IA dédié (**InstanSeg** / PyTorch) permettant la détection et la segmentation des noyaux cellulaires en temps réel.
* **Bilan Automatique :** Calcul instantané de la densité cellulaire, de la surface moyenne et évaluation du pléomorphisme nucléaire sur les zones d'intérêt (ROI) sélectionnées par le médecin.

### 3. Collaboration Médicale Sécurisée

* **Gestion des Rôles et Annotations :**
* **Mes annotations (Vert) :** Modifiables et supprimables.
* **Annotations Confrères (Orange) :** Lecture seule, affichage du nom et de la profession de l'auteur.


* **Sécurité des Données :** Impossible de supprimer ou d'altérer le compte-rendu ou le diagnostic d'un autre médecin.

### 4. Dashboard Analytique

* **Vue Unifiée :** Liste des patients intégrant dynamiquement leurs historiques de biopsies et leurs études radiologiques.
* **Statistiques en temps réel :** Graphiques de répartition des cas et suivi de l'activité.

---

## 🏗️ Architecture Technique et Flux de Données

WiGo repose sur un pipeline entièrement automatisé ("Plug & Play") géré par Docker.

### 1. Le Stockage Froid et l'Auto-Injection (`image_seeder`)

* Les images brutes sont placées dans le dossier local `images_initiales/`.
* Au lancement de Docker, le script `seed_images.py` s'active : il route automatiquement les fichiers DICOM vers le serveur **Orthanc** et les fichiers WSI (SVS/TIF) vers le bucket **MinIO**.

### 2. La Synchronisation (`/seed`)

* La route API `POST /seed` interroge le serveur Orthanc pour récupérer ses identifiants internes dynamiques et lie automatiquement les études radiologiques et les biopsies aux dossiers patients dans **PostgreSQL**.

### 3. Le Traitement à la volée (Biopsies)

* **Le Convertisseur :** Le backend télécharge les fichiers depuis MinIO et utilise **PyVips** pour découper l'image en milliers de tuiles `.jpeg`.
* **Le Visualiseur :** OpenSeadragon requête uniquement les tuiles correspondant à la zone visionnée (Deep Zoom).

---

## 🛠️ Stack Technologique

| Couche | Technologies |
| --- | --- |
| **Frontend** | React 18, TypeScript, Vite, TailwindCSS, **Cornerstone.js**, **OpenSeadragon** |
| **Backend** | Python 3.10, FastAPI (Port 8002), SQLAlchemy, Pydantic |
| **Intelligence Artificielle** | **InstanSeg** (PyTorch, Port 7000) |
| **PACS (Radiologie)** | **Orthanc** (Port 8042) |
| **Stockage Objet (Biopsie)** | **MinIO** (Compatible Amazon S3, Port 9000) |
| **Base de Données** | **PostgreSQL 15** |
| **Infra & DevOps** | Docker, Docker Compose |

---

## 📦 Installation & Démarrage

### Prérequis

* **Docker & Docker Compose :** Installé et en cours d'exécution.
* **Ressources système :** Au moins 8GB RAM et de l'espace disque libre pour la conversion d'images et les modèles IA.

### 1. Préparation des Images

Avant de lancer le projet, placez vos images de test dans l'arborescence suivante à la racine du projet :

```text
images_initiales/
├── radiologie/     # Placez ici vos fichiers DICOM (.dcm)
└── biopsie/        # Placez ici vos fichiers WSI (.svs, .tif)

```

### 2. Lancement

Lancez la construction et le démarrage de l'ensemble des microservices :

```bash
docker compose up --build

```

*Patientez environ 15 secondes après le démarrage des bases de données pour laisser le script `image_seeder` distribuer vos images dans MinIO et Orthanc.*

### 3. Initialisation de la Base de Données (Seed)

Une fois les images injectées, peuplez la base de données PostgreSQL pour lier les images aux patients :

* **Via Swagger :** Allez sur [http://localhost:8002/docs](http://localhost:8002/docs)
* Cherchez la route **`POST /seed`**, cliquez sur "Try it out" puis "Execute".

### 4. Accès

* **Frontend (App) :** [http://localhost:5173](http://localhost:5173)
* **Backend (Swagger API) :** [http://localhost:8002/docs](http://localhost:8002/docs)
* **MinIO (Console) :** [http://localhost:9001](http://localhost:9001) *(User/Pass: minioadmin)*
* **Orthanc (PACS) :** [http://localhost:8042](http://localhost:8042)

---

## 📖 Guide du Médecin (Démo)

1. **Connexion :** Entrez un nom d'utilisateur (ex: "Dr. House") et votre spécialité.
2. **Dashboard :** Visualisez la liste des patients. Cliquez sur une étude radiologique ou une biopsie.
3. **Radiologie :**
* Utilisez les outils de la barre supérieure (Contraste, Mesures, Gomme).
* Rédigez votre compte-rendu.
* Exportez le tout en PDF.


4. **Biopsie & IA :**
* Naviguez dans la lame virtuelle.
* Sélectionnez "Nouvelle Extraction".
* Dessinez un rectangle sur une zone suspecte (max 1500x1500px) et cliquez sur "Générer Rapport IA".
* InstanSeg analysera la zone et détourera les noyaux cellulaires en fournissant un bilan clinique.



---

## 📂 Structure des Dossiers

```text
Projet6/
├── backend/
│   ├── dzi_data/           # Volume partagé contenant les tuiles générées (DZI)
│   ├── main.py             # API FastAPI (Routes & Logique)
│   ├── seed_images.py      # Script auto-injection MinIO & Orthanc
│   ├── generate_dzi.py     # Script ETL (PyVips -> DZI)
│   ├── models.py           # Schémas de Base de données (SQLAlchemy)
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── components/     # Composants React (PatientCard, etc.)
│   │   ├── pages/          # Vues principales (RadiologyViewer, Viewer Biopsie...)
│   │   └── services/       # Appels API (Axios/Fetch)
│   └── Dockerfile
├── instanseg/              # Microservice IA (PyTorch)
├── images_initiales/       # Dossier source pour l'injection automatique
│   ├── biopsie/
│   └── radiologie/
└── docker-compose.yml      # Orchestration des 7 conteneurs

```

---

## 🔧 Troubleshooting

### Problèmes Courants

* **"Aucun patient trouvé" ou "Failed to fetch" :** Vérifiez que le port de l'API dans le frontend (`api.ts` ou `import.meta.env.VITE_API_URL`) pointe bien sur `http://localhost:8002` et non 8000.
* **Erreur d'accès aux dossiers images_initiales :** Assurez-vous d'avoir bien créé les dossiers `biopsie` et `radiologie` comme indiqué à l'étape 1, même s'ils sont vides.
* **L'IA ne répond pas (Port 7000) :** InstanSeg télécharge ses modèles PyTorch au premier lancement, ce qui peut prendre quelques minutes selon votre connexion. Vérifiez les logs avec `docker compose logs instanseg`.
* **Écran noir en Radiologie :** Vérifiez que le script `/seed` a bien été exécuté après l'injection des fichiers DICOM, afin que l'ID Orthanc corresponde à l'ID en base de données.

---

## 🔒 Sécurité et Conformité

**⚠️ Important :** WiGo est une plateforme de démonstration technique. Elle n'est pas destinée à un usage médical réel sans validation réglementaire.

* **Confidentialité :** En production, chiffrez les communications (HTTPS) et isolez le serveur Orthanc derrière un reverse proxy.
* **Orthanc "Insecure setup" :** Le message d'avertissement d'Orthanc au lancement est normal en environnement de développement local (authentification basique activée sans utilisateurs déclarés complexes).
* **RGPD :** Implémentez l'anonymisation des tags DICOM avant l'envoi en production.

---

## 📄 Licence

Ce projet est sous licence MIT. Voir le fichier `LICENSE` pour plus de détails.