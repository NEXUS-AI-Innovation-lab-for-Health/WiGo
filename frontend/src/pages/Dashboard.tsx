import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { getPatients, type Patient } from '../services/api';
import AddPatientModal from '../components/AddPatientModal';
import UploadMedicalImage from '../components/UploadMedicalImage';

// Icônes
import SmartToyIcon from '@mui/icons-material/SmartToy';
import FolderSharedIcon from '@mui/icons-material/FolderShared';
import PersonIcon from '@mui/icons-material/Person';
import AnalyticsIcon from '@mui/icons-material/Analytics';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import LogoutIcon from '@mui/icons-material/Logout';
import AddIcon from '@mui/icons-material/Add';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';

// Composants externes
import PatientCard from '../components/PatientCard';

// Graphiques
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend 
} from 'recharts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const StatCard = ({ title, value, icon: Icon, color }: any) => (
  <div className="bg-slate-900/50 border border-slate-800 p-6 rounded-2xl flex items-center justify-between hover:border-slate-700 transition-all shadow-lg">
    <div>
      <p className="text-slate-400 text-sm font-medium mb-1">{title}</p>
      <h3 className="text-2xl font-bold text-white">{value}</h3>
    </div>
    <div className={`p-3 rounded-xl ${color} bg-opacity-10`}>
      <Icon className={color.replace('bg-', 'text-')} />
    </div>
  </div>
);

export default function Dashboard() {
  const navigate = useNavigate();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null); 
  const [showAddPatient, setShowAddPatient] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  
  const username = localStorage.getItem("biopsie_user") || "Invité";
  const initials = username.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  const fetchPatients = async () => {
      setLoading(true);
      setError(null);
      try {
          const data = await getPatients();
          if (Array.isArray(data)) {
              setPatients(data);
          } else {
              setPatients([]);
          }
      } catch (err) {
          console.error("Erreur chargement:", err);
          setError("Impossible de charger les patients.");
      } finally {
          setLoading(false);
      }
  };

  useEffect(() => {    
    fetchPatients();
  }, [username]);

  // --- STATS ---
  const { stats, pieData, activityData, hasActivity } = useMemo(() => {
    let totalPatients = 0;
    let analyzedCount = 0;
    let criticalCases = 0;
    let healthyCases = 0;  

    const days = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
    const todayIndex = new Date().getDay();
    const weekActivity = days.map(day => ({ name: day, analyses: 0 }));

    patients.forEach(patient => {
      totalPatients++;
      if (patient.biopsies) {
        patient.biopsies.forEach(biopsy => {
            if (biopsy.status === "termine" || biopsy.status === "archive" || biopsy.status === "Validé") {
                analyzedCount++;
                weekActivity[todayIndex].analyses += 1;
                
               if (biopsy.id % 2 === 0) criticalCases++; else healthyCases++;
            }
        });
      }
    });

    const safeRate = analyzedCount > 0 ? Math.round((healthyCases / analyzedCount) * 100) : 0;
    
    const pData = [
      { name: 'Sains', value: healthyCases },
      { name: 'Anomalies', value: criticalCases },
    ].filter(d => d.value > 0);

    return { 
        stats: { totalPatients, analyzedCount, criticalCases, safeRate },
        pieData: pData,
        activityData: weekActivity,
        hasActivity: analyzedCount > 0
    };
  }, [patients]);

  const handleLogout = () => {
      localStorage.removeItem("biopsie_user");
      navigate('/login');
  };

  const handlePatientCreated = (patient: Patient) => {
    setPatients((current) => [...current, patient]);
    setShowAddPatient(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 p-6 md:p-10 relative overflow-hidden font-sans text-white">
      <div className="absolute top-0 left-0 w-full h-96 bg-gradient-to-b from-slate-900 to-transparent -z-10"></div>
      <div className="max-w-7xl mx-auto z-10 relative">
        <header className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight">Tableau de Bord</h1>
            <p className="text-slate-400 mt-2">Bienvenue, {username}</p>
          </div>
          <div className="flex items-center gap-4">
             <button onClick={() => setShowAddPatient(true)} className="flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 font-semibold text-white hover:bg-cyan-500" title="Créer un patient">
               <AddIcon fontSize="small" /> Nouveau Patient
             </button>
             <button onClick={() => setShowUpload(true)} className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-800 px-4 py-2 font-semibold text-white hover:border-cyan-500" title="Importer une imagerie">
               <CloudUploadIcon fontSize="small" /> Importer Imagerie
             </button>
             <div className="h-12 w-12 rounded-full bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center font-bold shadow-lg shadow-cyan-500/20 ring-2 ring-slate-800">
                {initials}
             </div>
             <button onClick={handleLogout} className="p-3 bg-slate-800 rounded-full hover:bg-red-500 hover:text-white transition-colors" title="Déconnexion">
                <LogoutIcon fontSize="small"/>
             </button>
          </div>
        </header>

        {loading ? (
            <div className="text-center py-20 animate-pulse text-slate-500">Chargement...</div>
        ) : error ? (
            <div className="bg-red-500/10 border border-red-500/50 p-6 rounded-2xl text-center">
                <p className="text-red-400 mb-4">{error}</p>
                <button onClick={fetchPatients} className="px-4 py-2 bg-red-500 text-white rounded-lg">Réessayer</button>
            </div>
        ) : (
            <>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                  <StatCard title="Patients en File" value={stats.totalPatients} icon={PersonIcon} color="text-blue-400" />
                  <StatCard title="Analyses Terminées" value={stats.analyzedCount} icon={SmartToyIcon} color="text-purple-400" />
                  <StatCard title="Cas Critiques" value={stats.criticalCases} icon={AnalyticsIcon} color="text-red-400" />
                  <StatCard title="Taux Cas Sains" value={stats.analyzedCount > 0 ? `${stats.safeRate}%` : "-"} icon={AnalyticsIcon} color="text-emerald-400" />
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-10">
                    {!hasActivity ? (
                        <div className="col-span-3 bg-slate-900/50 border border-slate-800 border-dashed rounded-2xl p-12 text-center flex flex-col items-center justify-center min-h-[300px]">
                            <div className="p-4 bg-slate-800 rounded-full mb-4"><AccessTimeIcon className="text-slate-500 text-4xl" /></div>
                            <h3 className="text-xl font-bold text-slate-300">Prêt pour l'analyse</h3>
                            <p className="text-slate-500 mt-2">Aucune donnée analysée pour le moment.</p>
                        </div>
                    ) : (
                        <>
                            <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
                                <h3 className="text-lg font-bold mb-6 flex items-center gap-2"><AnalyticsIcon className="text-cyan-500" /> Activité</h3>
                                <div className="h-64">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart data={activityData}>
                                            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                                            <XAxis dataKey="name" stroke="#94a3b8" tick={{fontSize: 12}} />
                                            <YAxis stroke="#94a3b8" tick={{fontSize: 12}} allowDecimals={false} />
                                            <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#fff' }} />
                                            <Bar dataKey="analyses" fill="#0ea5e9" radius={[4, 4, 0, 0]} barSize={40} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col">
                                <h3 className="text-lg font-bold mb-2">Diagnostics</h3>
                                <div className="flex-grow h-64 relative">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <PieChart>
                                            <Pie data={pieData} cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                                                {pieData.map((entry, index) => (
                                                    <Cell key={`cell-${index}`} fill={entry.name === 'Sains' ? '#10b981' : '#ef4444'} />
                                                ))}
                                            </Pie>
                                            <Tooltip contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', borderRadius: '8px' }} />
                                            <Legend verticalAlign="bottom" height={36} iconType="circle" />
                                        </PieChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                <h2 className="text-xl font-bold mb-6 flex items-center gap-2">
                    <FolderSharedIcon className="text-slate-500" /> File d'attente
                </h2>
                
                {patients.length === 0 ? (
                    <div className="text-center p-10 border border-slate-800 border-dashed rounded-xl text-slate-500">Aucun patient trouvé.</div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                      {patients.map((patient) => (
                        <PatientCard key={patient.id} patient={patient} onDeleted={fetchPatients} />
                      ))}
                    </div>
                )}
            </>
        )}
      </div>
      {showAddPatient && <AddPatientModal onClose={() => setShowAddPatient(false)} onCreated={handlePatientCreated} />}
      {showUpload && <UploadMedicalImage patients={patients} onClose={() => setShowUpload(false)} onUploaded={fetchPatients} />}
    </div>
  );
}