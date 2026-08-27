import { useState } from 'react';
import type { ChangeEvent, DragEvent } from 'react';
import CloseIcon from '@mui/icons-material/Close';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { uploadMedicalImage, type Patient } from '../services/api';

interface UploadMedicalImageProps {
  patients: Patient[];
  onClose: () => void;
  onUploaded: () => void;
}

export default function UploadMedicalImage({ patients, onClose, onUploaded }: UploadMedicalImageProps) {
  const [patientId, setPatientId] = useState('');
  const [type, setType] = useState<'biopsy' | 'radiology'>('biopsy');
  const [file, setFile] = useState<File | null>(null);
  const [progress, setProgress] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  const chooseFile = (candidate?: File) => {
    if (!candidate) return;
    const valid = type === 'biopsy' ? /\.(svs|tif|tiff)$/i.test(candidate.name) : /\.dcm$/i.test(candidate.name);
    if (!valid) {
      setError(type === 'biopsy' ? 'Choisissez un fichier .svs, .tif ou .tiff.' : 'Choisissez un fichier .dcm.');
      return;
    }
    setError(null);
    setFile(candidate);
  };

  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    chooseFile(event.dataTransfer.files[0]);
  };

  const submit = async () => {
    if (!patientId || !file) {
      setError('Sélectionnez un patient et un fichier.');
      return;
    }
    setSending(true);
    setProgress(0);
    setError(null);
    try {
      await uploadMedicalImage(Number(patientId), type, file, setProgress);
      onUploaded();
      onClose();
    } catch {
      setError("L'envoi a échoué. Vérifiez le service concerné.");
    } finally {
      setSending(false);
    }
  };

  const onInput = (event: ChangeEvent<HTMLInputElement>) => chooseFile(event.target.files?.[0]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <div className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xl font-bold text-white"><CloudUploadIcon className="text-cyan-400" /> Importer une imagerie</h2>
          <button onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white" title="Fermer"><CloseIcon /></button>
        </div>
        <label className="mb-4 block text-sm text-slate-300">Patient<select required value={patientId} onChange={(event) => setPatientId(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white"><option value="">Sélectionner...</option>{patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.name}</option>)}</select></label>
        <div className="mb-4 grid grid-cols-2 gap-2 rounded-lg bg-slate-950 p-1">
          <button onClick={() => { setType('biopsy'); setFile(null); }} className={`rounded-md p-2 text-sm ${type === 'biopsy' ? 'bg-cyan-600 text-white' : 'text-slate-400'}`}>Biopsie WSI</button>
          <button onClick={() => { setType('radiology'); setFile(null); }} className={`rounded-md p-2 text-sm ${type === 'radiology' ? 'bg-cyan-600 text-white' : 'text-slate-400'}`}>Radiologie DICOM</button>
        </div>
        <div onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={drop} className={`rounded-xl border-2 border-dashed p-8 text-center ${dragging ? 'border-cyan-400 bg-cyan-400/10' : 'border-slate-700 bg-slate-950'}`}>
          <CloudUploadIcon className="mb-2 text-4xl text-slate-500" />
          <p className="text-sm text-slate-300">{file ? file.name : 'Glissez votre fichier ici'}</p>
          <label className="mt-3 inline-block cursor-pointer rounded-lg bg-slate-800 px-4 py-2 text-sm text-white hover:bg-slate-700">Parcourir<input type="file" accept={type === 'biopsy' ? '.svs,.tif,.tiff' : '.dcm'} onChange={onInput} className="hidden" /></label>
        </div>
        {sending && <div className="mt-5"><div className="mb-1 flex justify-between text-xs text-slate-400"><span>Envoi en cours</span><span>{progress}%</span></div><div className="h-2 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-cyan-500 transition-all" style={{ width: `${progress}%` }} /></div></div>}
        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
        <div className="mt-6 flex justify-end gap-3"><button onClick={onClose} className="rounded-lg bg-slate-800 px-4 py-2 text-slate-300">Annuler</button><button onClick={submit} disabled={sending} className="rounded-lg bg-cyan-600 px-4 py-2 font-semibold text-white disabled:opacity-50">{sending ? 'Envoi...' : 'Importer'}</button></div>
      </div>
    </div>
  );
}
