import { useNavigate, useLocation } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdf";
import BrushIcon from "@mui/icons-material/Brush";
import DescriptionIcon from "@mui/icons-material/Description";

// --- ICÔNES POUR LA BARRE D'OUTILS ---
import ContrastIcon from "@mui/icons-material/Contrast";
import OpenWithIcon from "@mui/icons-material/OpenWith";
import StraightenIcon from "@mui/icons-material/Straighten";
import CropSquareIcon from "@mui/icons-material/CropSquare";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import TextFormatIcon from "@mui/icons-material/TextFormat";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutline";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import PersonIcon from "@mui/icons-material/Person";

// --- IMPORTATION DU MOTEUR CORNERSTONE (Natif) ---
import cornerstone from "cornerstone-core";
import cornerstoneMath from "cornerstone-math";
// @ts-ignore
import cornerstoneTools from "cornerstone-tools";
import dicomParser from "dicom-parser";
import cornerstoneWADOImageLoader from "cornerstone-wado-image-loader";
// @ts-ignore
import Hammer from "hammerjs";
import jsPDF from "jspdf";

// Initialisation globale
let isConfigured = false;
function configureCornerstone() {
  if (isConfigured) return;
  cornerstoneTools.external.cornerstone = cornerstone;
  cornerstoneTools.external.Hammer = Hammer;
  cornerstoneTools.external.cornerstoneMath = cornerstoneMath;
  cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
  cornerstoneWADOImageLoader.external.dicomParser = dicomParser;
  cornerstoneWADOImageLoader.configure({ useWebWorkers: false });
  cornerstoneTools.init({ showSVGCursors: true });
  isConfigured = true;
}

// 🌟 L'Extracteur d'identité robuste
function getConnectedUser() {
  let doctorName = "Inconnu";
  try {
    const possibleKeys = ["user", "auth", "session", "profile", "username", "biopsie_user"];
    for (const key of possibleKeys) {
      const val = localStorage.getItem(key) || sessionStorage.getItem(key);
      if (val) {
        try {
          const parsed = JSON.parse(val);
          doctorName = parsed.username || parsed.name || parsed.email || parsed.user?.username || parsed.user?.name || "Inconnu";
          if (doctorName !== "Inconnu") break;
        } catch (e) {
          doctorName = val;
          break;
        }
      }
    }
  } catch (e) {
    console.error("Erreur lecture identité:", e);
  }
  
  if (doctorName !== "Inconnu" && !doctorName.toLowerCase().startsWith("dr")) {
    return `Dr. ${doctorName}`;
  }
  return doctorName === "Inconnu" ? "Dr. Inconnu" : doctorName;
}

interface RadiologyViewerProps {
  currentUser?: {
    name: string;
    profession: string;
  };
}

export default function RadiologyViewer({ 
  currentUser 
}: RadiologyViewerProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const searchParams = new URLSearchParams(location.search);
  const patientId = searchParams.get("patient") || "Inconnu";
  const studyId = searchParams.get("study");

  const storedName = localStorage.getItem("biopsie_user") || "Inconnu";
  const formattedName = (storedName !== "Inconnu" && !storedName.toLowerCase().startsWith("dr")) 
    ? `Dr. ${storedName}` 
    : storedName;

  const finalUser = {
    name: currentUser?.name && currentUser.name !== "Dr. Inconnu" ? currentUser.name : (formattedName === "Inconnu" ? "Dr. Inconnu" : formattedName),
    profession: currentUser?.profession || "Médecin"
  };

  const [report, setReport] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [savedSource, setSavedSource] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTool, setActiveTool] = useState("Wwwc");
  const [lastModifiedBy, setLastModifiedBy] = useState<string | null>(null);

  const viewerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!studyId || !viewerRef.current) return;
    configureCornerstone();

    const element = viewerRef.current;

    const loadDataAndDicom = async () => {
      try {
        const dbRes = await fetch(
          `http://localhost:8002/radiology/${studyId}/report`,
        );
        const dbData = await dbRes.json();
        
        if (dbData.report) setReport(dbData.report);
        if (dbData.lastModifiedBy) setLastModifiedBy(dbData.lastModifiedBy);

        const response = await fetch(`/orthanc/studies/${studyId}/instances`);
        if (!response.ok) throw new Error("Erreur de connexion API Orthanc");

        const instances = await response.json();
        if (!instances || instances.length === 0)
          throw new Error("Aucune image trouvée.");

        const firstInstanceId = instances[0].ID;
        const dicomUrl = `wadouri:${window.location.origin}/orthanc/instances/${firstInstanceId}/file`;

        cornerstone.enable(element);

        // CHARGEMENT DES OUTILS
        const toolsToLoad = [
          cornerstoneTools.WwwcTool,
          cornerstoneTools.ZoomTool,
          cornerstoneTools.PanTool,
          cornerstoneTools.ZoomMouseWheelTool,
          cornerstoneTools.LengthTool,
          cornerstoneTools.RectangleRoiTool,
          cornerstoneTools.EllipticalRoiTool,
          cornerstoneTools.EraserTool,
        ];

        toolsToLoad.forEach((ToolClass) => {
          try {
            cornerstoneTools.addToolForElement(element, ToolClass);
          } catch (e) {
            /* ignore */
          }
        });

        const arrowConfig = {
          getTextCallback: (
            doneChangingTextCallback: (text: string) => void,
          ) => {
            setTimeout(() => {
              const text = window.prompt("Entrez votre annotation :");
              if (text !== null && text.trim() !== "")
                doneChangingTextCallback(text);
            }, 10);
          },
          changeTextCallback: (
            data: any,
            eventData: any,
            doneChangingTextCallback: (text: string) => void,
          ) => {
            setTimeout(() => {
              const text = window.prompt("Modifier le texte :", data.text);
              if (text !== null && text.trim() !== "")
                doneChangingTextCallback(text);
            }, 10);
          },
        };
        try {
          cornerstoneTools.addToolForElement(
            element,
            cornerstoneTools.ArrowAnnotateTool,
            { configuration: arrowConfig },
          );
        } catch (e) {}

        // Affichage de l'image DICOM
        const image = await cornerstone.loadImage(dicomUrl);
        cornerstone.displayImage(element, image);

        cornerstoneTools.setToolActiveForElement(element, "ZoomMouseWheel", {
          mouseButtonMask: 0,
        });
        cornerstoneTools.setToolActiveForElement(element, activeTool, {
          mouseButtonMask: 1,
        });

        // Restauration robuste
        if (
          dbData.annotations &&
          dbData.annotations.length > 5 &&
          dbData.annotations !== "{}"
        ) {
          try {
            const parsedState = JSON.parse(dbData.annotations);
            cornerstoneTools.globalImageIdSpecificToolStateManager.toolState = parsedState;

            setTimeout(() => {
              if (viewerRef.current) {
                cornerstone.updateImage(viewerRef.current);
              }
            }, 100);
          } catch (e) {
            console.error("Erreur restauration des dessins", e);
          }
        }

        setIsLoading(false);
      } catch (error) {
        console.error("Erreur de chargement :", error);
        setIsLoading(false);
      }
    };

    loadDataAndDicom();

    return () => {
      try {
        cornerstone.disable(element);
      } catch (e) {}
    };
  }, [studyId]);

  const handleSaveData = async (source: "annotations" | "texte") => {
    if (!studyId) return;
    setIsSaving(true);

    let annotationsStr = "{}";

    try {
      const rawState = cornerstoneTools.globalImageIdSpecificToolStateManager.toolState;
      if (rawState) {
        annotationsStr = JSON.stringify(rawState);
      }
    } catch (err) {
      console.error("Erreur d'extraction des dessins :", err);
    }

    const doctorSignature = `${finalUser.name} (${finalUser.profession})`;

    try {
      const res = await fetch(
        `http://localhost:8002/radiology/${studyId}/report`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            report: report, 
            annotations: annotationsStr,
            lastModifiedBy: doctorSignature
          }),
        },
      );

      if (res.ok) {
        setSavedSource(source);
        setLastModifiedBy(doctorSignature);
        setTimeout(() => setSavedSource(null), 3000);
      } else {
        console.error("Le serveur a renvoyé une erreur lors de la sauvegarde.");
      }
    } catch (err) {
      console.error("Erreur réseau :", err);
    } finally {
      setIsSaving(false);
    }
  };

  // 🌟 SUPPRESSION TOTALE CORRIGÉE (Efface visuellement l'écran en forçant chaque outil)
  const handleClearAll = async () => {
    if (!viewerRef.current || !studyId) return;

    const isConfirmed = window.confirm(
      "Êtes-vous sûr de vouloir supprimer TOUTES les annotations ? Cette action est irréversible.",
    );
    if (!isConfirmed) return;

    const element = viewerRef.current;
    setIsSaving(true);

    try {
      // 1. On force le nettoyage visuel outil par outil (API Cornerstone officielle)
      const toolsToClear = [
        "Length",
        "RectangleRoi",
        "EllipticalRoi",
        "ArrowAnnotate",
      ];
      toolsToClear.forEach((tool) => {
        cornerstoneTools.clearToolState(element, tool);
      });

      // 2. On redessine l'image (le canvas redevient vide)
      cornerstone.updateImage(element);

      // 3. On sauvegarde ce vide absolu dans la base de données
      const doctorSignature = `${finalUser.name} (${finalUser.profession})`;

      const res = await fetch(
        `http://localhost:8002/radiology/${studyId}/report`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ 
            report: report, 
            annotations: "{}",
            lastModifiedBy: doctorSignature
          }),
        },
      );

      if (res.ok) {
        setSavedSource("annotations");
        setLastModifiedBy(doctorSignature);
        setTimeout(() => setSavedSource(null), 3000);
      }
    } catch (e) {
      console.error("Erreur lors de la suppression totale", e);
    } finally {
      setIsSaving(false);
    }
  };

  const changeTool = (toolName: string) => {
    if (!viewerRef.current) return;
    const element = viewerRef.current;

    const allTools = [
      "Wwwc",
      "Zoom",
      "Pan",
      "Length",
      "RectangleRoi",
      "EllipticalRoi",
      "ArrowAnnotate",
      "Eraser",
    ];
    allTools.forEach((t) => {
      try {
        cornerstoneTools.setToolPassiveForElement(element, t);
      } catch (e) {}
    });

    cornerstoneTools.setToolActiveForElement(element, toolName, {
      mouseButtonMask: 1,
    });
    setActiveTool(toolName);
  };

  const handleExportPDF = () => {
    const doc = new jsPDF();
    doc.setFontSize(22);
    doc.setTextColor(15, 23, 42);
    doc.text("Compte-Rendu Radiologique", 20, 20);
    doc.setFontSize(12);
    doc.setTextColor(100, 116, 139);
    doc.text(`Patient ID : ${patientId}`, 20, 30);
    doc.text(`Date de l'export : ${new Date().toLocaleDateString("fr-FR")}`, 20, 37);
    
    doc.text(`Dernière mise à jour par : ${lastModifiedBy || finalUser.name}`, 20, 44);

    doc.setDrawColor(203, 213, 225);
    doc.line(20, 49, 190, 49);
    doc.setFontSize(14);
    doc.setTextColor(15, 23, 42);
    doc.text("Observations cliniques :", 20, 62);
    doc.setFontSize(11);
    doc.setTextColor(51, 65, 85);
    const splitText = doc.splitTextToSize(
      report || "Aucune observation saisie.",
      170,
    );
    doc.text(splitText, 20, 72);
    doc.setFontSize(9);
    doc.setTextColor(148, 163, 184);
    doc.text("Document généré par le DPI Wigo / OncoCollab.", 20, 280);
    doc.save(`Compte_Rendu_${patientId}.pdf`);
  };

  return (
    <div className="h-screen w-screen bg-black flex flex-col font-sans text-white overflow-hidden">
      
      <div className="bg-slate-950 border-b border-slate-800 p-3 flex justify-between items-center z-20 shadow-xl">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate("/dashboard")}
            className="p-2 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
          >
            <ArrowBackIcon />
          </button>
          <div>
            <h1 className="font-bold text-white flex items-center gap-2">
              DPI - Imagerie Radiologique
            </h1>
            <p className="text-xs text-cyan-500 font-mono">
              Patient ID: {patientId}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 bg-slate-900 border border-slate-800 px-4 py-2 rounded-xl">
          <div className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center text-indigo-400">
            <PersonIcon fontSize="small" />
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-white leading-tight">{finalUser.name}</p>
            <p className="text-xs text-slate-400 leading-tight">{finalUser.profession}</p>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        <div className="flex-1 flex flex-col relative bg-black border-r border-slate-800">
          <div className="flex flex-wrap gap-2 bg-slate-900 p-2 border-b border-slate-800 shadow-inner justify-center z-10">
            <button
              onClick={() => changeTool("Wwwc")}
              className={`px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors ${activeTool === "Wwwc" ? "bg-cyan-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}
            >
              <ContrastIcon fontSize="small" /> Contraste
            </button>
            <button
              onClick={() => changeTool("Pan")}
              className={`px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors ${activeTool === "Pan" ? "bg-cyan-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}
            >
              <OpenWithIcon fontSize="small" /> Déplacer
            </button>

            <div className="w-px h-6 bg-slate-700 mx-1 self-center"></div>

            <button
              onClick={() => changeTool("Length")}
              className={`px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors ${activeTool === "Length" ? "bg-emerald-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}
            >
              <StraightenIcon fontSize="small" /> Mesurer
            </button>
            <button
              onClick={() => changeTool("RectangleRoi")}
              className={`px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors ${activeTool === "RectangleRoi" ? "bg-emerald-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}
            >
              <CropSquareIcon fontSize="small" /> Rect.
            </button>
            <button
              onClick={() => changeTool("EllipticalRoi")}
              className={`px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors ${activeTool === "EllipticalRoi" ? "bg-emerald-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}
            >
              <RadioButtonUncheckedIcon fontSize="small" /> Cercle
            </button>
            <button
              onClick={() => changeTool("ArrowAnnotate")}
              className={`px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors ${activeTool === "ArrowAnnotate" ? "bg-purple-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"}`}
            >
              <TextFormatIcon fontSize="small" /> Texte
            </button>

            <div className="w-px h-6 bg-slate-700 mx-1 self-center"></div>

            <button
              onClick={() => changeTool("Eraser")}
              className={`px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors ${activeTool === "Eraser" ? "bg-red-600 text-white" : "text-red-400 hover:bg-red-900/40 hover:text-red-300"}`}
            >
              <DeleteOutlineIcon fontSize="small" /> Gomme
            </button>
            <button
              onClick={handleClearAll}
              className="px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-2 transition-colors text-red-400 hover:bg-red-600 hover:text-white"
            >
              <DeleteSweepIcon fontSize="small" /> Tout effacer
            </button>
          </div>

          <div className="flex-1 relative flex items-center justify-center">
            {isLoading && (
              <div className="absolute text-slate-400 font-mono animate-pulse z-20">
                Chargement DICOM...
              </div>
            )}
            <div
              ref={viewerRef}
              className="w-full h-full cursor-crosshair"
              onContextMenu={(e) => e.preventDefault()}
            />
          </div>
        </div>

        <div className="w-[380px] bg-slate-900 flex flex-col p-5 shadow-2xl z-10">
          <div className="flex flex-col mb-4 border-b border-slate-700 pb-4">
            <h2 className="text-lg font-bold text-white mb-2">Dossier Médical</h2>
            
            <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 flex items-start gap-3">
              <div className="mt-0.5 text-emerald-500">
                <CheckCircleIcon fontSize="small" />
              </div>
              <div>
                <p className="text-xs text-slate-400 uppercase tracking-wider font-bold mb-1">Dernière modification</p>
                <p className="text-sm text-white font-medium">
                  {lastModifiedBy ? lastModifiedBy : "Aucun historique"}
                </p>
              </div>
            </div>
          </div>

          <textarea
            value={report}
            onChange={(e) => setReport(e.target.value)}
            placeholder="Tapez vos observations cliniques ici..."
            className="flex-1 w-full bg-slate-800/80 border border-slate-700 rounded-xl p-4 text-sm text-slate-200 focus:outline-none focus:border-cyan-500 resize-none custom-scrollbar shadow-inner leading-relaxed mb-4"
          />

          <div className="flex flex-col gap-3">
            <button
              onClick={() => handleSaveData("annotations")}
              disabled={isSaving}
              className={`py-3 rounded-xl font-bold flex justify-center items-center gap-2 transition-all shadow-lg ${savedSource === "annotations" ? "bg-emerald-600 text-white" : "bg-slate-800 hover:bg-cyan-600 border border-slate-700 hover:border-cyan-500 text-white"}`}
            >
              {savedSource === "annotations" ? (
                <>
                  <CheckCircleIcon fontSize="small" /> Sauvegardées
                </>
              ) : (
                <>
                  <BrushIcon fontSize="small" /> Sauvegarder Dessins
                </>
              )}
            </button>

            <button
              onClick={() => handleSaveData("texte")}
              disabled={isSaving}
              className={`py-3 rounded-xl font-bold flex justify-center items-center gap-2 transition-all shadow-lg ${savedSource === "texte" ? "bg-emerald-600 text-white" : "bg-slate-800 hover:bg-cyan-600 border border-slate-700 hover:border-cyan-500 text-white"}`}
            >
              {savedSource === "texte" ? (
                <>
                  <CheckCircleIcon fontSize="small" /> Enregistré
                </>
              ) : (
                <>
                  <DescriptionIcon fontSize="small" /> Sauvegarder Texte
                </>
              )}
            </button>

            <button
              onClick={handleExportPDF}
              className="py-3 mt-2 rounded-xl font-bold flex justify-center items-center gap-2 transition-all shadow-lg bg-red-600/10 hover:bg-red-600 text-red-500 hover:text-white border border-red-900/50"
            >
              <PictureAsPdfIcon fontSize="small" /> Exporter en PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}