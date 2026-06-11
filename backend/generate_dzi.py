import os
import shutil
import pyvips

# --- CONFIGURATION ---
OUTPUT_DIR = "dzi_data"

# Liste des images à convertir (Fichier source, Nom de base de sortie)
IMAGES_TO_PROCESS = [
    ("images_initiales/biopsie/CMU-1.svs", "biopsie_cmu_1"),
    ("images_initiales/biopsie/HE_example.tif", "biopsie_cmu_2"),          
    ("images_initiales/biopsie/CMU-2.svs", "biopsie_cmu_3") 
]

def clean_directory(directory):
    """
    Vide le contenu du dossier MAIS protège les dossiers d'extractions.
    """
    if not os.path.exists(directory):
        os.makedirs(directory, exist_ok=True)
        return

    print(f"🧹 Nettoyage intelligent de {directory}...")
    for filename in os.listdir(directory):
        # --- PROTECTION ---
        if filename in ["CMU-1", "CMU-2", "CASE-InstanSeg-HE"]:
            print(f"🛡️  Dossier protégé conservé : {filename}")
            continue

        file_path = os.path.join(directory, filename)
        try:
            if os.path.isfile(file_path) or os.path.islink(file_path):
                os.unlink(file_path)
            elif os.path.isdir(file_path):
                shutil.rmtree(file_path)
        except Exception as e:
            print(f"⚠️ Impossible de supprimer {file_path}. Raison: {e}")

def generate_all_dzi():
    print("--- DÉBUT DU TRAITEMENT ---")
    clean_directory(OUTPUT_DIR)

    for source_file, output_name in IMAGES_TO_PROCESS:
        if not os.path.exists(source_file):
            print(f"⚠️ Fichier source introuvable, on le saute : {source_file}")
            continue

        output_path = os.path.join(OUTPUT_DIR, output_name)
        print(f"🚀 Conversion de {source_file} avec PyVips...")
        
        try:
            image = pyvips.Image.new_from_file(source_file, access="sequential")
            image.dzsave(output_path, tile_size=256, overlap=1)
            print(f"✅ {output_name}.dzi généré avec succès !")
        except Exception as e:
            print(f"❌ Erreur PyVips sur {source_file}: {e}")

if __name__ == "__main__":
    generate_all_dzi()