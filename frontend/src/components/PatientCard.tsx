import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import VisibilityIcon from '@mui/icons-material/Visibility'; 
import EditIcon from '@mui/icons-material/Edit'; 
import DescriptionIcon from '@mui/icons-material/Description';
import PersonIcon from '@mui/icons-material/Person';
import CalendarTodayIcon from '@mui/icons-material/CalendarToday';
import MedicalServicesIcon from '@mui/icons-material/MedicalServices';
import AssignmentIcon from '@mui/icons-material/Assignment';
import DeleteIcon from '@mui/icons-material/Delete';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import axios from 'axios';

import { deleteBiopsy, deletePatient, deleteRadiologyStudy } from '../services/api';

interface Biopsy {
  id: number;
  image_url: string; 
  status: string;
  date?: string; 
}

interface RadiologyStudy {
  id: number;
  orthanc_study_id: string;
  modality: string;
  description: string;
}

interface Patient {
  id: number;
  name: string;
  age: number;
  folder_id: string;
  birth_date?: string;
  biopsies: Biopsy[];
  radiology_studies?: RadiologyStudy[];
  motif?: string;
}

interface Extraction {
  id: number;
  filename: string;
  roi: { x: number; y: number; w: number; h: number }; 
  status?: string; 
  owner?: string;
}

const PatientCard = ({ patient, onDeleted }: { patient: Patient; onDeleted?: () => void }) => {
  const navigate = useNavigate();
  const [extractions, setExtractions] = useState<Extraction[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [hasExtractions, setHasExtractions] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<{
    titre: string;
    message: string;
    libelle: string;
    action: () => Promise<void>;
  } | null>(null);

  const doctorName = localStorage.getItem("biopsie_user") || "Dr. Non assigné";

  // Aucune donnée clinique n'est inventée : on n'affiche que ce que la base
  // contient réellement, et « Non renseigné » sinon.
  const motifConsultation = patient.motif || "Non renseigné";
  const birthDate = patient.birth_date
    ? new Date(patient.birth_date).toLocaleDateString("fr-FR")
    : "Non renseignée";

  useEffect(() => {
    if (!patient.folder_id) return;

    const checkExisting = async () => {
        try {
            const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8002';
            const res = await fetch(`${apiUrl}/patients/${patient.folder_id}/extractions`);
            const data = await res.json();
            if (data && data.length > 0) {
                setHasExtractions(true);
                setExtractions(data); 
            } else {
                setHasExtractions(false);
            }
        } catch (e) { console.error("Erreur check extractions", e); }
    };
    checkExisting();
  }, [patient.folder_id]);

  const handleAnnotateClick = async () => {
    if (extractions.length > 0) {
        setShowModal(true);
    } else {
        openViewer(); 
    }
  };

  const supprimerExtraction = (id: number) =>
    demanderConfirmation(
      "Supprimer ce dossier d'analyse ?",
      'Son image extraite, ses annotations et son avancement seront perdus.',
      'Supprimer',
      () => executerSuppressionExtraction(id),
    );

  const executerSuppressionExtraction = async (id: number) => {
    try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8002';
        const res = await fetch(`${apiUrl}/extractions/${id}?username=${encodeURIComponent(doctorName)}`, {
            method: 'DELETE'
        });
        
        if (res.ok) {
            const newExtractions = extractions.filter(ex => ex.id !== id);
            setExtractions(newExtractions);
            if (newExtractions.length === 0) setHasExtractions(false); 
        } else {
            const err = await res.json();
            setErreur(typeof err.detail === 'string' ? err.detail : 'Suppression refusée.');
        }
    } catch { setErreur('Serveur injoignable.'); }
  };

  const openViewer = (extractionData?: Extraction) => {
    const mainImageUrl = (patient.biopsies && patient.biopsies.length > 0) 
        ? patient.biopsies[0].image_url 
        : "biopsie_cmu_1.dzi";

    navigate(`/viewer?url=${encodeURIComponent(mainImageUrl)}`, {
        state: { 
            patientName: patient.name, 
            folderId: patient.folder_id,
            image_url: mainImageUrl,
            roi: extractionData ? extractionData.roi : null,
            extractionId: extractionData ? extractionData.id : null,
        }
    });
  };

  const mainBiopsyUrl = (patient.biopsies && patient.biopsies.length > 0) 
      ? patient.biopsies[0].image_url 
      : "";

  /** Message d'erreur lisible, quelle que soit la forme de la réponse. */
  const messageErreur = (cause: unknown, repli: string): string =>
    axios.isAxiosError(cause) && typeof cause.response?.data?.detail === 'string'
      ? cause.response.data.detail
      : repli;

  /**
   * Les confirmations passent par une modale de l'application, et non par
   * `window.confirm`.
   *
   * Le dialogue natif est supprimé par le navigateur dès que l'utilisateur
   * coche « Empêcher cette page de créer des boîtes de dialogue
   * supplémentaires ». `confirm()` renvoie alors `false` immédiatement : le
   * clic ne produisait plus rien, sans le moindre message, et aucune requête
   * n'atteignait le serveur.
   */
  const demanderConfirmation = (
    titre: string,
    message: string,
    libelle: string,
    action: () => Promise<void>,
  ) => {
    setErreur(null);
    setConfirmation({ titre, message, libelle, action });
  };

  const executerConfirmation = async () => {
    if (!confirmation || busy) return;
    setBusy(true);
    try {
      // La modale reste affichée pendant toute l'opération : c'est le seul
      // retour visuel dont dispose l'utilisateur, et certaines suppressions
      // demandent plusieurs secondes.
      await confirmation.action();
      setConfirmation(null);
    } finally {
      setBusy(false);
    }
  };

  const supprimerDossier = () =>
    demanderConfirmation(
      'Supprimer ce dossier patient ?',
      `Le dossier de ${patient.name} sera définitivement supprimé : sa lame, ses ` +
        'extractions, ses annotations et son avancement. Les études DICOM restent ' +
        'dans Orthanc.',
      'Supprimer définitivement',
      async () => {
        try {
          setDeleting(true);
          const rapport = await deletePatient(patient.id);
          if (rapport.warnings?.length) {
            setErreur(`Supprimé, avec réserves : ${rapport.warnings.join(' · ')}`);
          }
          onDeleted?.();
        } catch (cause) {
          setDeleting(false);
          setErreur(messageErreur(cause, 'Vérifiez que le backend répond.'));
        }
      },
    );

  const supprimerLame = () => {
    const biopsy = patient.biopsies?.[0];
    if (!biopsy) return;
    demanderConfirmation(
      'Supprimer la lame ?',
      "Son image et ses tuiles seront effacées. Les extractions déjà réalisées sont " +
        'conservées. Vous pourrez ensuite importer une autre lame.',
      'Supprimer la lame',
      async () => {
        try {
          const rapport = await deleteBiopsy(biopsy.id);
          if (rapport.warnings?.length) {
            setErreur(`Supprimée, avec réserves : ${rapport.warnings.join(' · ')}`);
          }
          onDeleted?.();
        } catch (cause) {
          setErreur(messageErreur(cause, 'Vérifiez que le backend répond.'));
        }
      },
    );
  };

  const supprimerRadiologie = () => {
    const study = patient.radiology_studies?.[0];
    if (!study) return;
    demanderConfirmation(
      "Détacher l'examen radiologique ?",
      "L'étude reste dans Orthanc : elle pourra être réimportée, sur ce dossier ou " +
        'sur un autre.',
      'Détacher',
      async () => {
        try {
          await deleteRadiologyStudy(study.id);
          onDeleted?.();
        } catch (cause) {
          setErreur(messageErreur(cause, 'Vérifiez que le backend répond.'));
        }
      },
    );
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:border-cyan-500/50 transition-all duration-300 shadow-lg flex flex-col gap-4 relative overflow-hidden group">
      
      {/* Halo decoratif. `pointer-events-none` est indispensable : etant
          positionne en absolu, il est peint AU-DESSUS de l'en-tete et
          interceptait les clics sur le bouton de suppression. */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-3xl group-hover:bg-cyan-500/10 transition-all pointer-events-none"></div>

      {/* HEADER */}
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-slate-800 flex items-center justify-center text-slate-300 ring-2 ring-slate-700">
                <PersonIcon fontSize="medium" />
            </div>
            <div>
                <h3 className="text-lg font-bold text-white group-hover:text-cyan-400 transition-colors">{patient.name}</h3>
                <span className="text-xs font-mono bg-slate-800 text-slate-400 px-2 py-1 rounded border border-slate-700">ID: {patient.folder_id}</span>
            </div>
        </div>

        <button
          type="button"
          onClick={supprimerDossier}
          disabled={deleting}
          style={{ position: 'relative', zIndex: 10 }}
          title={`Supprimer le dossier de ${patient.name}`}
          aria-label={`Supprimer le dossier de ${patient.name}`}
          className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <DeleteOutlineIcon fontSize="small" />
        </button>
      </div>
      
      {erreur && (
        <div className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 flex items-start gap-2">
          <p className="text-xs text-red-200 flex-1">{erreur}</p>
          <button
            type="button"
            onClick={() => setErreur(null)}
            className="text-xs text-red-200 hover:text-white"
            aria-label="Masquer le message"
          >
            ✕
          </button>
        </div>
      )}

      {/* INFO MÉDICALES */}
      <div className="bg-slate-950/50 rounded-xl p-4 border border-slate-800 space-y-3">
          <div className="flex justify-between items-center text-sm">
             <div className="flex items-center gap-2 text-slate-400"><MedicalServicesIcon fontSize="small" /><span>Médecin</span></div>
             <span className="font-semibold text-slate-200">{doctorName}</span>
          </div>
          <div className="flex justify-between items-center text-sm border-t border-slate-800 pt-3">
             <div className="flex items-center gap-2 text-slate-400"><AssignmentIcon fontSize="small" /><span>Motif</span></div>
             <span className="font-semibold text-cyan-400 text-right text-xs truncate max-w-[150px]" title={motifConsultation}>{motifConsultation}</span>
          </div>
          <div className="flex justify-between items-center text-sm border-t border-slate-800 pt-3">
             <div className="flex items-center gap-2 text-slate-400"><CalendarTodayIcon fontSize="small" /><span>Naissance</span></div>
             <span className="text-slate-200 font-mono text-xs">{birthDate}</span>
          </div>
          <div className="flex justify-between items-center text-sm border-t border-slate-800 pt-3">
             <div className="flex items-center gap-2 text-slate-400"><AssignmentIcon fontSize="small" /><span>Âge</span></div>
             <span className="text-slate-200 font-mono text-xs">{patient.age} ans</span>
          </div>
      </div>

      {/* IMAGERIE RATTACHÉE — chaque élément peut être retiré du dossier */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <button
            onClick={() => mainBiopsyUrl && openViewer()}
            disabled={!mainBiopsyUrl}
            title={mainBiopsyUrl ? 'Ouvrir la lame' : 'Aucune lame importée'}
            className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-colors border border-slate-700 shadow-lg disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <VisibilityIcon fontSize="small" /> Biopsie
          </button>
          {patient.biopsies && patient.biopsies.length > 0 && (
            <button
              type="button"
              onClick={supprimerLame}
              disabled={busy}
              title="Supprimer la lame de ce dossier"
              aria-label="Supprimer la lame"
              className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 border border-slate-800 transition-colors disabled:opacity-40"
            >
              <DeleteOutlineIcon fontSize="small" />
            </button>
          )}
        </div>

        {patient.radiology_studies && patient.radiology_studies.length > 0 && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(`/radiology?patient=${patient.folder_id}&study=${patient.radiology_studies![0].orthanc_study_id}`)}
              className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-cyan-400 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-colors border border-slate-700 shadow-lg"
            >
              Radio
            </button>
            <button
              type="button"
              onClick={supprimerRadiologie}
              disabled={busy}
              title="Détacher cet examen du dossier"
              aria-label="Détacher l'examen radiologique"
              className="p-2 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 border border-slate-800 transition-colors disabled:opacity-40"
            >
              <DeleteOutlineIcon fontSize="small" />
            </button>
          </div>
        )}
      </div>

      {/* ACTIONS */}
      <div className="flex gap-3 mt-auto">

        {hasExtractions && (
            <button onClick={handleAnnotateClick} className="flex-1 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all shadow-lg shadow-cyan-900/20">
                <EditIcon fontSize="small"/> Dossiers
            </button>
        )}
      </div>

      {/* MODAL LISTE DES DOSSIERS */}
      {showModal && (
        <div className="fixed inset-0 bg-black/80 flex justify-center items-center z-50 p-4 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm overflow-hidden shadow-2xl animate-in fade-in zoom-in duration-200">
            <div className="bg-slate-800 p-4 border-b border-slate-700">
                <h4 className="font-bold text-white">Choisir le dossier</h4>
                <p className="text-xs text-slate-400">Patient: {patient.name}</p>
            </div>
            
            <ul className="max-h-60 overflow-y-auto p-2">
              {extractions.map((file, index) => (
                <li key={index} className="mb-2 bg-slate-950 rounded-xl border border-slate-800 hover:border-cyan-500/50 transition-all flex items-center justify-between p-2 pl-3 group">
                    <div className="flex items-center gap-3 cursor-pointer flex-grow" onClick={() => openViewer(file)}>
                        <div className="p-2 bg-slate-800 rounded-lg text-cyan-400 group-hover:text-white transition-colors">
                            <DescriptionIcon fontSize="small" />
                        </div>
                        <div className="flex flex-col">
                            <span className="text-sm text-slate-300 group-hover:text-white font-bold">{file.filename}</span>
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded text-slate-400 border border-slate-700">
                                    {file.owner || "Inconnu"}
                                </span>
                                <span className="text-[10px] text-slate-500">#{file.id}</span>
                            </div>
                        </div>
                    </div>

                    {file.owner === doctorName && (
                        <button 
                            onClick={(e) => { e.stopPropagation(); supprimerExtraction(file.id); }} 
                            className="p-2 hover:bg-red-500/20 text-slate-600 hover:text-red-500 rounded-lg transition-colors ml-2"
                            title="Supprimer mon dossier"
                        >
                            <DeleteIcon fontSize="small" />
                        </button>
                    )}
                </li>
              ))}
            </ul>
            
            <div className="p-4 bg-slate-800 border-t border-slate-700 flex gap-2">
                <button onClick={() => openViewer()} className="flex-1 py-2 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-400 hover:text-white rounded-lg transition-colors font-medium text-sm">+ Nouveau</button>
                <button onClick={() => setShowModal(false)} className="flex-1 py-2 bg-red-500/10 hover:bg-red-500 text-red-500 hover:text-white rounded-lg transition-colors font-medium text-sm">Fermer</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmation applicative — voir `demanderConfirmation` : le dialogue
          natif du navigateur peut être désactivé par l'utilisateur, ce qui
          rendait les suppressions silencieusement inopérantes. */}
      {confirmation && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-full max-w-sm rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
            <h4 className="text-lg font-bold text-white">{confirmation.titre}</h4>
            <p className="mt-3 text-sm text-slate-300">{confirmation.message}</p>
            {busy && (
              <p className="mt-3 flex items-center gap-2 text-xs text-cyan-300">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-cyan-400 border-t-transparent" />
                Opération en cours, veuillez patienter…
              </p>
            )}
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmation(null)}
                disabled={busy}
                className="flex-1 rounded-lg bg-slate-800 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={executerConfirmation}
                disabled={busy}
                autoFocus
                className="flex-1 rounded-lg bg-red-600 py-2 text-sm font-bold text-white hover:bg-red-500 disabled:opacity-50"
              >
                {busy ? 'Suppression…' : confirmation.libelle}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PatientCard;