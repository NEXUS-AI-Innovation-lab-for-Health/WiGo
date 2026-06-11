import time
import os
import shutil
import pyvips
import numpy as np
from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import List, Optional, Any, Dict
from minio import Minio
from minio.error import S3Error
import requests

# --- IMPORT DU CLIENT INSTANSEG ---
from instanseg_client import InstanSegClient

import models
import database

# --- INIT BDD ---
try:
    models.Base.metadata.create_all(bind=database.engine)
    print("✅ Base de données connectée.")
except Exception as e:
    print(f"❌ ERREUR FATALE BDD : {e}")

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DZI_FOLDER = "/app/dzi_data"
os.makedirs(DZI_FOLDER, exist_ok=True)
app.mount("/dzi_data", StaticFiles(directory=DZI_FOLDER), name="dzi_data")

# --- CONFIGURATION MINIO ---
MINIO_HOST = "minio:9000"
ACCESS_KEY = "minioadmin"
SECRET_KEY = "minioadmin"
BUCKET_NAME = "biopsie"

minio_client = Minio(
    MINIO_HOST, access_key=ACCESS_KEY, secret_key=SECRET_KEY, secure=False
)

# --- INITIALISATION DU CLIENT INSTANSEG ---
print("🤖 Initialisation du client InstanSeg...")
instanseg_client = InstanSegClient(base_url="http://instanseg:7000")
print("✅ Client InstanSeg prêt !")


# --- SCHEMAS ---
class BiopsySchema(BaseModel):
    id: int
    image_url: Optional[str] = None
    status: str

    class Config:
        from_attributes = True


class RadiologySchema(BaseModel):
    id: int
    orthanc_study_id: str
    modality: str
    description: str
    date: str

    class Config:
        from_attributes = True


class PatientSchema(BaseModel):
    id: int
    name: str
    age: int
    folder_id: str
    birth_date: Optional[str] = None
    family_history: Optional[str] = None
    medical_history: Optional[str] = None
    biopsies: List[BiopsySchema] = []
    radiology_studies: List[RadiologySchema] = []

    class Config:
        from_attributes = True


class DrawingSchema(BaseModel):
    type: str
    x: float
    y: float
    w: Optional[float] = 0
    h: Optional[float] = 0
    radius: Optional[float] = 0
    text: Optional[str] = ""
    points: Optional[List[Dict[str, float]]] = []
    author: Optional[str] = "Inconnu"


class AnalysisPayload(BaseModel):
    filename: str
    x: int
    y: int
    width: int
    height: int
    patient_folder: str
    patient_name: str
    annotation_label: str
    extraction_id: Optional[int] = None
    owner: Optional[str] = "Inconnu"
    birth_date: Optional[str] = ""
    family_history: Optional[str] = ""
    medical_history: Optional[str] = ""
    prelevement_type: Optional[str] = ""
    prelevement_date: Optional[str] = ""
    block_number: Optional[str] = ""
    fixation: Optional[str] = ""
    slide_count: Optional[Any] = None
    staining: Optional[List[str]] = []
    macro_obs: Optional[str] = ""
    micro_obs: Optional[str] = ""
    histo_type: Optional[str] = ""
    sbr_grade: Optional[str] = ""
    margins: Optional[str] = ""
    hormonal_receptors: Optional[str] = ""
    diagnosis: Optional[str] = ""
    comments: Optional[str] = ""
    status: Optional[str] = ""
    pathologist: Optional[str] = ""
    validation_date: Optional[str] = ""
    drawings: List[DrawingSchema] = []


# --- SCHEMAS POUR LE RAPPORT ---
class ReportPayload(BaseModel):
    report: str
    annotations: Optional[str] = ""


# --- CREATION DES 3 PATIENTS ---
@app.post("/seed")
def seed_database(db: Session = Depends(database.get_db)):
    try:
        models.Base.metadata.drop_all(bind=database.engine)
        models.Base.metadata.create_all(bind=database.engine)

        # 🌟 1. On interroge Orthanc pour récupérer les vrais ID de CE serveur
        print("🔍 Récupération des études depuis Orthanc...")
        orthanc_url = "http://orthanc:8042" # Utilise le nom du conteneur Docker !
        
        try:
            # On demande la liste de toutes les études
            response = requests.get(f"{orthanc_url}/studies", auth=("orthanc", "orthanc"))
            if response.status_code == 200:
                orthanc_studies = response.json()
            else:
                orthanc_studies = []
                print(f"⚠️ Impossible de lire Orthanc (Code: {response.status_code})")
        except Exception as e:
            print(f"⚠️ Erreur de connexion à Orthanc: {e}")
            orthanc_studies = []

        # 🌟 2. On crée nos patients de base (pour la partie Biopsie)
        patients_data = [
            {
                "name": "Jean Dupont",
                "age": 65,
                "folder": "CMU-1",
                "birth": "1958-05-12",
                "family": "Non",
                "med": "Hypertension",
                "dzi_filename": "biopsie_cmu_1.dzi",
            },
            {
                "name": "Marie Curie",
                "age": 58,
                "folder": "CASE-InstanSeg-HE",
                "birth": "1965-11-07",
                "family": "Oui",
                "med": "Suivi annuel",
                "dzi_filename": "biopsie_cmu_2.dzi",
            },
            {
                "name": "Paul Martin",
                "age": 42,
                "folder": "CMU-2",
                "birth": "1982-02-23",
                "family": "Non",
                "med": "RAS",
                "dzi_filename": "biopsie_cmu_3.dzi",
            },
        ]

        # On sauvegarde les patients créés pour pouvoir leur lier des radios ensuite
        created_patients = []
        
        for p in patients_data:
            patient = models.Patient(
                name=p["name"],
                age=p["age"],
                folder_id=p["folder"],
                birth_date=p["birth"],
                family_history=p["family"],
                medical_history=p["med"],
            )
            db.add(patient)
            db.commit()
            db.refresh(patient)
            created_patients.append(patient)

            biopsy = models.Biopsy(
                patient_id=patient.id, image_url=p["dzi_filename"], status="Non analysé"
            )
            db.add(biopsy)
            db.commit()

        # 🌟 3. On associe dynamiquement les radios d'Orthanc aux patients
        print(f"📸 {len(orthanc_studies)} études trouvées dans Orthanc.")
        
        for index, study_id in enumerate(orthanc_studies):
            # On répartit les radios sur nos 3 patients (s'il y a plus de 3 radios, ça boucle)
            target_patient = created_patients[index % len(created_patients)]
            
            # On va chercher les détails de l'étude dans Orthanc (pour la modalité)
            study_details_url = f"{orthanc_url}/studies/{study_id}"
            try:
                details_res = requests.get(study_details_url, auth=("orthanc", "orthanc"))
                if details_res.status_code == 200:
                    details = details_res.json()
                    # On extrait la modalité si elle existe (CT, MR, CR...)
                    modality = details.get("PatientMainDicomTags", {}).get("Modality", "Inconnue")
                    study_desc = details.get("MainDicomTags", {}).get("StudyDescription", "Examen Radiologique")
                else:
                    modality = "Inconnue"
                    study_desc = "Examen Radiologique"
            except:
                modality = "Inconnue"
                study_desc = "Examen Radiologique"

            radio = models.RadiologyStudy(
                patient_id=target_patient.id,
                orthanc_study_id=study_id, 
                modality=modality,
                description=study_desc,
                date="2026-06-11",
            )
            db.add(radio)
            print(f"🔗 Lié: Patient {target_patient.name} <-> Radio {study_id}")

        db.commit()
        return {"message": f"Succès ! BDD Réinitialisée avec {len(orthanc_studies)} études liées."}
    
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))


# COMPTE-RENDU RADIOLOGIQUE
@app.get("/radiology/{study_id}/report")
def get_radiology_report(study_id: str, db: Session = Depends(database.get_db)):
    radio = (
        db.query(models.RadiologyStudy)
        .filter(models.RadiologyStudy.orthanc_study_id == study_id)
        .first()
    )
    if not radio:
        raise HTTPException(status_code=404, detail="Radio introuvable")
    return {"report": radio.report or "", "annotations": radio.annotations or ""}


@app.post("/radiology/{study_id}/report")
def save_radiology_report(
    study_id: str, payload: ReportPayload, db: Session = Depends(database.get_db)
):
    radio = (
        db.query(models.RadiologyStudy)
        .filter(models.RadiologyStudy.orthanc_study_id == study_id)
        .first()
    )
    if not radio:
        raise HTTPException(status_code=404, detail="Radio introuvable")
    radio.report = payload.report
    radio.annotations = payload.annotations
    db.commit()
    return {"message": "Compte-rendu et annotations sauvegardés !"}


# --- ROUTE HEALTH CHECK ---
@app.get("/health")
async def health_check():
    """Vérifie la santé de tous les services"""
    try:
        instanseg_health = await instanseg_client.health()
        return {
            "status": "ok",
            "backend": "connected",
            "instanseg": instanseg_health,
            "database": "connected",
        }
    except Exception as e:
        return {
            "status": "degraded",
            "backend": "connected",
            "instanseg": {"error": str(e), "status": "disconnected"},
            "database": "connected",
        }, 503


# --- ROUTE IA : ANALYSE INSTANSEG ---
@app.post("/analyze-ai")
async def analyze_image_with_ai(data: AnalysisPayload):
    # 🎯 Trouver la BONNE image source selon le patient !
    if data.patient_folder == "CMU-1":
        source_name = "CMU-1.svs"
    elif data.patient_folder == "CASE-InstanSeg-HE":
        source_name = "HE_example.tif"
    elif data.patient_folder == "CMU-2": 
        source_name = "CMU-2.svs"
    else:
        source_name = "CMU-1.svs"  # Fallback

    source_path = f"/app/images_initiales/biopsie/{source_name}"
    if not os.path.exists(source_path):
        raise HTTPException(
            status_code=404, detail=f"Image source introuvable: {source_name}"
        )

    try:
        image = pyvips.Image.new_from_file(source_path, access="sequential")
        safe_x = max(0, min(data.x, image.width))
        safe_y = max(0, min(data.y, image.height))
        safe_w = min(data.width, image.width - safe_x)
        safe_h = min(data.height, image.height - safe_y)

        if safe_w > 1500 or safe_h > 1500:
            return {
                "suggestion": "❌ Zone trop vaste. L'IA requiert un patch plus petit (zoom maximum). Dessinez un rectangle plus petit (max 1500x1500px).",
                "cell_count": 0,
                "contour_points": [],
            }

        print(f"📐 Extraction région {safe_w}x{safe_h}px...")
        region = image.extract_area(safe_x, safe_y, safe_w, safe_h)

        png_data = region.write_to_buffer(".png")

        print(f"🧠 Analyse InstanSeg en cours ({safe_w}x{safe_h} pixels)...")
        try:
            segment_result = await instanseg_client.segment(
                file_bytes=png_data, model="brightfield_nuclei", target="nuclei"
            )
        except Exception as e:
            print(f"❌ Erreur InstanSeg : {e}")
            raise HTTPException(
                status_code=503, detail=f"Service InstanSeg indisponible : {str(e)}"
            )

        contour_points = []
        try:
            print(f"📍 Appel segment_points (mode centroids)...")
            contour_points = await instanseg_client.segment_points(
                file_bytes=png_data,
                model="brightfield_nuclei",
                target="nuclei",
                mode="centroids",
            )
            print(f"📍 Contours reçus : {len(contour_points)} entités")
        except Exception as e:
            print(f"⚠️ Impossible de récupérer les contours InstanSeg : {e}")
            contour_points = []

        instances = segment_result.instances
        cell_count = segment_result.instance_count

        if cell_count > 0:
            cell_areas = [inst.area_px for inst in instances]
            avg_size = int(np.mean(cell_areas))
            max_size = int(np.max(cell_areas))

            pleomorphism = "Faible (Noyaux réguliers)"
            if max_size > avg_size * 3:
                pleomorphism = "Élevé (Atypies cytonucléaires marquées)"
            elif max_size > avg_size * 2:
                pleomorphism = "Modéré"

            area_pixels = safe_w * safe_h
            density = round((cell_count / area_pixels) * 1000000)

            result_message = (
                f"🔬 Bilan InstanSeg :\n"
                f"• Noyaux détectés : {cell_count}\n"
                f"• Densité : {density} cellules / Mpx\n"
                f"• Taille moyenne : {avg_size} px²\n"
                f"• Pléomorphisme : {pleomorphism}\n"
                f"• Temps traitement : {segment_result.processing_time_s}s"
            )
        else:
            result_message = "🔬 Bilan InstanSeg : Aucune structure nucléaire détectée dans cette zone."

        print(
            f"✅ Résultat IA : {cell_count} cellules, {len(contour_points)} points générés."
        )

        contour_points_dict = []
        for blob in contour_points:
            try:
                contour_points_dict.append(
                    blob.dict()
                    if hasattr(blob, "dict")
                    else {
                        "color": getattr(blob, "color", "#00ff00"),
                        "points": [
                            {"x": p.x, "y": p.y} if hasattr(p, "x") else p
                            for p in getattr(blob, "points", [])
                        ],
                    }
                )
            except Exception as e:
                print(f"⚠️ Erreur sérialisation blob : {e}")

        return {
            "suggestion": result_message,
            "cell_count": cell_count,
            "contour_points": contour_points_dict,
        }

    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ Erreur IA : {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/patients", response_model=List[PatientSchema])
def get_patients(db: Session = Depends(database.get_db)):
    return db.query(models.Patient).all()


@app.post("/extract-roi")
def extract_roi(data: AnalysisPayload, db: Session = Depends(database.get_db)):
    patient = (
        db.query(models.Patient)
        .filter(models.Patient.folder_id == data.patient_folder)
        .first()
    )
    if not patient:
        patient = models.Patient(
            name=data.patient_name, age=0, folder_id=data.patient_folder
        )
        db.add(patient)
        db.commit()
        db.refresh(patient)

    if data.birth_date:
        patient.birth_date = data.birth_date
    if data.family_history:
        patient.family_history = data.family_history
    if data.medical_history:
        patient.medical_history = data.medical_history
    db.commit()

    safe_folder = "".join(
        c for c in data.patient_folder if c.isalnum() or c in (" ", "-", "_")
    ).strip()
    patient_dir = os.path.join(DZI_FOLDER, safe_folder, "extractions")
    os.makedirs(patient_dir, exist_ok=True)
    filename_str = f"extraction_{int(time.time())}.svs"
    output_path = os.path.join(patient_dir, filename_str)

    # 🎯 CORRECTION : Trouver la BONNE image source selon le patient !
    if data.patient_folder == "CMU-1":
        source_minio_name = "CMU-1.svs"
    elif data.patient_folder == "CASE-InstanSeg-HE":
        source_minio_name = "HE_example.tif"
    elif data.patient_folder == "CMU-2":  # 🌟 Changé !
        source_minio_name = "CMU-2.svs"
    else:
        source_minio_name = "CMU-1.svs"

    source_path = f"/app/images_initiales/biopsie/{source_minio_name}"

    if not os.path.exists(source_path):
        print(f"📥 L'image source n'est pas en local. Téléchargement depuis MinIO...")
        try:
            minio_client.fget_object(BUCKET_NAME, source_minio_name, source_path)
        except Exception as e:
            raise HTTPException(
                status_code=500, detail="Impossible de trouver l'image source sur MinIO"
            )

    if os.path.exists(source_path):
        try:
            image = pyvips.Image.new_from_file(source_path, access="sequential")
            safe_x = max(0, min(data.x, image.width))
            safe_y = max(0, min(data.y, image.height))
            region = image.extract_area(safe_x, safe_y, data.width, data.height)
            region.tiffsave(
                output_path,
                compression="jpeg",
                Q=90,
                tile=True,
                pyramid=True,
                bigtiff=True,
            )

            try:
                minio_object_name = f"{safe_folder}/extractions/{filename_str}"
                minio_client.fput_object(
                    bucket_name=BUCKET_NAME,
                    object_name=minio_object_name,
                    file_path=output_path,
                )
                if os.path.exists(output_path):
                    os.remove(output_path)
            except Exception as minio_err:
                print(f"❌ Erreur MinIO : {minio_err}")

        except Exception as e:
            print(f"⚠️ Erreur PyVips: {e}")

    sc = data.slide_count if isinstance(data.slide_count, int) else None

    new_ext = models.Extraction(
        patient_id=patient.id,
        label=data.annotation_label,
        dzi_url=f"{safe_folder}/extractions/{filename_str}",
        x=data.x,
        y=data.y,
        w=data.width,
        h=data.height,
        owner=data.owner,
        prelevement_type=data.prelevement_type,
        prelevement_date=data.prelevement_date,
        block_number=data.block_number,
        fixation=data.fixation,
        slide_count=sc,
        staining=data.staining,
        macro_obs=data.macro_obs,
        micro_obs=data.micro_obs,
        histo_type=data.histo_type,
        sbr_grade=data.sbr_grade,
        margins=data.margins,
        hormonal_receptors=data.hormonal_receptors,
        diagnosis=data.diagnosis,
        comments=data.comments,
        status=data.status,
        pathologist=data.pathologist,
        validation_date=data.validation_date,
    )
    db.add(new_ext)
    db.commit()
    db.refresh(new_ext)

    return {
        "message": "Dossier créé avec succès",
        "id": new_ext.id,
        "extraction_id": new_ext.id,
    }


@app.post("/annotations/save")
def update_analysis(data: AnalysisPayload, db: Session = Depends(database.get_db)):
    if not data.extraction_id:
        raise HTTPException(status_code=400, detail="ID manquant")
    ext = (
        db.query(models.Extraction)
        .filter(models.Extraction.id == data.extraction_id)
        .first()
    )
    if not ext:
        raise HTTPException(status_code=404, detail="Introuvable")
    sc = data.slide_count if isinstance(data.slide_count, int) else None
    ext.prelevement_type = data.prelevement_type
    ext.prelevement_date = data.prelevement_date
    ext.block_number = data.block_number
    ext.fixation = data.fixation
    ext.slide_count = sc
    ext.staining = data.staining
    ext.macro_obs = data.macro_obs
    ext.micro_obs = data.micro_obs
    ext.histo_type = data.histo_type
    ext.sbr_grade = data.sbr_grade
    ext.margins = data.margins
    ext.hormonal_receptors = data.hormonal_receptors
    ext.diagnosis = data.diagnosis
    ext.comments = data.comments
    ext.status = data.status
    ext.pathologist = data.pathologist
    ext.validation_date = data.validation_date
    db.query(models.Drawing).filter(models.Drawing.extraction_id == ext.id).delete()
    for d in data.drawings:
        new_draw = models.Drawing(
            extraction_id=ext.id,
            type=d.type,
            x=d.x,
            y=d.y,
            w=d.w,
            h=d.h,
            radius=d.radius,
            text=d.text,
            points=d.points,
            author=d.author,
        )
        db.add(new_draw)
    db.commit()
    return {"message": "Mis à jour"}


@app.get("/patients/{folder_id}/extractions")
def get_extractions(folder_id: str, db: Session = Depends(database.get_db)):
    patient = (
        db.query(models.Patient).filter(models.Patient.folder_id == folder_id).first()
    )
    if not patient:
        return []
    results = []
    for e in patient.extractions:
        results.append(
            {
                "id": e.id,
                "filename": e.label,
                "url": f"http://localhost:8002/dzi_data/{e.dzi_url}",
                "roi": {"x": e.x, "y": e.y, "w": e.w, "h": e.h},
                "diagnosis": e.diagnosis,
                "status": e.status,
                "owner": e.owner,
            }
        )
    return results


@app.get("/extractions/{extraction_id}/details")
def get_details(extraction_id: int, db: Session = Depends(database.get_db)):
    ext = (
        db.query(models.Extraction)
        .filter(models.Extraction.id == extraction_id)
        .first()
    )
    if not ext:
        raise HTTPException(status_code=404, detail="Non trouvé")
    return {
        "id": ext.id,
        "filename": ext.label,
        "prelevement_type": ext.prelevement_type,
        "prelevement_date": ext.prelevement_date,
        "block_number": ext.block_number,
        "fixation": ext.fixation,
        "slide_count": ext.slide_count,
        "staining": ext.staining,
        "macro_obs": ext.macro_obs,
        "micro_obs": ext.micro_obs,
        "histo_type": ext.histo_type,
        "sbr_grade": ext.sbr_grade,
        "margins": ext.margins,
        "hormonal_receptors": ext.hormonal_receptors,
        "diagnosis": ext.diagnosis,
        "comments": ext.comments,
        "status": ext.status,
        "pathologist": ext.pathologist,
        "validation_date": ext.validation_date,
        "drawings": [
            {
                "type": d.type,
                "x": d.x,
                "y": d.y,
                "w": d.w,
                "h": d.h,
                "radius": d.radius,
                "text": d.text,
                "points": d.points,
                "author": d.author,
            }
            for d in ext.drawings
        ],
    }


@app.delete("/extractions/{extraction_id}")
def delete_extraction(
    extraction_id: int, username: str, db: Session = Depends(database.get_db)
):
    ext = (
        db.query(models.Extraction)
        .filter(models.Extraction.id == extraction_id)
        .first()
    )
    if not ext:
        raise HTTPException(status_code=404)
    if ext.owner != username:
        raise HTTPException(status_code=403)
    try:
        minio_client.remove_object(BUCKET_NAME, ext.dzi_url)
    except Exception:
        pass
    try:
        file_path = os.path.join(DZI_FOLDER, ext.dzi_url)
        if os.path.exists(file_path):
            os.remove(file_path)
            files_dir = file_path.replace(".svs", "_files").replace(".dzi", "_files")
            if os.path.exists(files_dir):
                shutil.rmtree(files_dir)
    except:
        pass
    db.delete(ext)
    db.commit()
    return {"message": "Supprimé"}
