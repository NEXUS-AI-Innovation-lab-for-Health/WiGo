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

interface Biopsy {
  id: number;
  image_url: string; 
  status: string;
  date?: string; 
}

interface Patient {
  id: number;
  name: string;
  age: number;
  folder_id: string;
  birth_date?: string;
  biopsies: Biopsy[];
  motif?: string;
}

interface Extraction {
  id: number;
  filename: string;
  roi: { x: number; y: number; w: number; h: number }; 
  status?: string; 
  owner?: string;
}

const PatientCard = ({ patient }: { patient: Patient }) => {
  if (!patient) {
      return null;
  }

  const navigate = useNavigate();
  const [extractions, setExtractions] = useState<Extraction[]>([]);
  const [showModal, setShowModal] = useState(false);

  const doctorName = localStorage.getItem("biopsie_user") || "Dr. Non assigné";

  const getDates = () => {
    const today = new Date();
    const dateMax = today.toLocaleDateString('fr-FR');
    const past = new Date();
    past.setDate(today.getDate() - (Math.floor(Math.random() * 10) + 2)); 
    const dateMin = past.toLocaleDateString('fr-FR');
    return { min: dateMin, max: dateMax };
  };
  const { min, max } = getDates();
  const getMotif = () => {
      const motifs = [ "Masse palpable (QSE)", "Microcalcifications ACR4", "Suivi Oncologique" ];
      const safeId = patient.id || 0; 
      return patient.motif || motifs[safeId % motifs.length];
  };
  const motifConsultation = getMotif();

  useEffect(() => {
    if (!patient.folder_id) return;

    const checkExisting = async () => {
        try {
            const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
            const res = await fetch(`${apiUrl}/patients/${patient.folder_id}/extractions`);
            const data = await res.json();
            if (data && data.length > 0) {
                setExtractions(data); 
            } else {
              setExtractions([]);
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

  const handleDeleteExtraction = async (id: number) => {
    if (!confirm("Confirmer la suppression définitive ?")) return;

    try {
        const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
        const res = await fetch(`${apiUrl}/extractions/${id}?username=${encodeURIComponent(doctorName)}`, {
            method: 'DELETE'
        });
        
        if (res.ok) {
            const newExtractions = extractions.filter(ex => ex.id !== id);
            setExtractions(newExtractions);
        } else {
            const err = await res.json();
            alert("Erreur: " + err.detail);
        }
    } catch (err) { alert("Erreur réseau"); }
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

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:border-cyan-500/50 transition-all duration-300 shadow-lg flex flex-col gap-4 relative overflow-hidden group">
      
      <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-3xl group-hover:bg-cyan-500/10 transition-all"></div>

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
      </div>
      
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
             <div className="flex items-center gap-2 text-slate-400"><CalendarTodayIcon fontSize="small" /><span>Suivi</span></div>
             <div className="text-right">
                <div className="text-slate-200 font-mono text-xs">{min}</div>
                <div className="text-slate-500 text-[10px] text-center leading-none">au</div>
                <div className="text-slate-200 font-mono text-xs">{max}</div>
             </div>
          </div>
      </div>

      {/* ACTIONS */}
      <div className="flex gap-3 mt-auto">
        <button onClick={() => mainBiopsyUrl && openViewer()} className="flex-1 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-colors">
          <VisibilityIcon fontSize="small"/> Voir
        </button>

        <button
          onClick={handleAnnotateClick}
          disabled={extractions.length === 0}
          className={`flex-1 py-2 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all ${
            extractions.length > 0
              ? 'bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg shadow-cyan-900/20'
              : 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
          }`}
          title={extractions.length > 0 ? 'Annoter une zone enregistrée' : 'Sélectionnez et enregistrez une zone avec le bouton Voir'}
        >
          <EditIcon fontSize="small"/> Annoter
        </button>
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
                            onClick={(e) => { e.stopPropagation(); handleDeleteExtraction(file.id); }} 
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
    </div>
  );
};

export default PatientCard;