import { useState } from 'react';
import type { FormEvent } from 'react';
import CloseIcon from '@mui/icons-material/Close';
import PersonAddIcon from '@mui/icons-material/PersonAdd';
import { createPatient, type Patient } from '../services/api';

interface AddPatientModalProps {
  onClose: () => void;
  onCreated: (patient: Patient) => void;
}

export default function AddPatientModal({ onClose, onCreated }: AddPatientModalProps) {
  const [form, setForm] = useState({ name: '', age: '', birth_date: '', family_history: '', medical_history: '' });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = (field: keyof typeof form, value: string) => setForm((current) => ({ ...current, [field]: value }));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const patient = await createPatient({
        name: form.name,
        age: Number(form.age),
        birth_date: form.birth_date || undefined,
        family_history: form.family_history || undefined,
        medical_history: form.medical_history || undefined,
      });
      onCreated(patient);
    } catch {
      setError('Impossible de créer le patient.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
      <form onSubmit={submit} className="w-full max-w-lg rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-xl font-bold text-white"><PersonAddIcon className="text-cyan-400" /> Nouveau patient</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white" title="Fermer"><CloseIcon /></button>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="sm:col-span-2">Nom complet<input required value={form.name} onChange={(event) => update('name', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white" /></label>
          <label>Âge<input required min="0" max="150" type="number" value={form.age} onChange={(event) => update('age', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white" /></label>
          <label>Date de naissance<input type="date" value={form.birth_date} onChange={(event) => update('birth_date', event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white" /></label>
          <label>Antécédents familiaux<textarea value={form.family_history} onChange={(event) => update('family_history', event.target.value)} className="mt-1 min-h-20 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white" /></label>
          <label>Historique médical<textarea value={form.medical_history} onChange={(event) => update('medical_history', event.target.value)} className="mt-1 min-h-20 w-full rounded-lg border border-slate-700 bg-slate-950 p-3 text-white" /></label>
        </div>
        {error && <p className="mt-4 text-sm text-red-400">{error}</p>}
        <div className="mt-6 flex justify-end gap-3">
          <button type="button" onClick={onClose} className="rounded-lg bg-slate-800 px-4 py-2 text-slate-300">Annuler</button>
          <button disabled={saving} className="rounded-lg bg-cyan-600 px-4 py-2 font-semibold text-white disabled:opacity-50">{saving ? 'Création...' : 'Créer le patient'}</button>
        </div>
      </form>
    </div>
  );
}
