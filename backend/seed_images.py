import os
import time
import requests
from minio import Minio

# --- CONFIGURATION ---
ORTHANC_URL = "http://orthanc:8042/instances"
MINIO_URL = "minio:9000"
BUCKET_NAME = "biopsie"

BASE_DIR = "/app/images_initiales"
RADIO_DIR = os.path.join(BASE_DIR, "radiologie")
BIOPSIE_DIR = os.path.join(BASE_DIR, "biopsie")

# --- FONCTION POUR ORTHANC (Radiologie) ---
def upload_to_orthanc(filepath):
    print(f"📡 Envoi à Orthanc : {os.path.basename(filepath)}")
    with open(filepath, 'rb') as f:
        response = requests.post(ORTHANC_URL, data=f, auth=("orthanc", "orthanc"))
        if response.status_code == 200:
            print(f"✅ Succès Orthanc pour {os.path.basename(filepath)}")
        else:
            print(f"❌ Échec Orthanc ({response.status_code}) pour {os.path.basename(filepath)}")

# --- FONCTION POUR MINIO (Biopsie) ---
def upload_to_minio(filepath):
    print(f"📦 Envoi à MinIO : {os.path.basename(filepath)}")
    client = Minio(MINIO_URL, access_key="minioadmin", secret_key="minioadmin", secure=False)
    
    if not client.bucket_exists(BUCKET_NAME):
        client.make_bucket(BUCKET_NAME)
        print(f"🪣 Bucket '{BUCKET_NAME}' créé.")

    filename = os.path.basename(filepath)
    try:
        client.fput_object(BUCKET_NAME, filename, filepath)
        print(f"✅ Succès MinIO pour {filename}")
    except Exception as e:
        print(f"❌ Échec MinIO pour {filename} : {e}")

# --- SCRIPT PRINCIPAL ---
if __name__ == "__main__":
    print("⏳ Attente du démarrage des bases de données et services (15s)...")
    time.sleep(15)
    
    # 1. Traitement de la Radiologie
    if os.path.exists(RADIO_DIR):
        print("\n--- 🩻 INJECTION RADIOLOGIE ---")
        for filename in os.listdir(RADIO_DIR):
            filepath = os.path.join(RADIO_DIR, filename)
            if os.path.isfile(filepath):
                upload_to_orthanc(filepath)
    else:
        print(f"⚠️ Le dossier {RADIO_DIR} n'existe pas.")

    # 2. Traitement des Biopsies
    if os.path.exists(BIOPSIE_DIR):
        print("\n--- 🔬 INJECTION BIOPSIE ---")
        for filename in os.listdir(BIOPSIE_DIR):
            filepath = os.path.join(BIOPSIE_DIR, filename)
            if os.path.isfile(filepath):
                upload_to_minio(filepath)
    else:
        print(f"⚠️ Le dossier {BIOPSIE_DIR} n'existe pas.")
        
    print("\n🎉 Injection automatique terminée ! Les images sont prêtes.")