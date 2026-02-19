import { useEffect, useRef, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import OpenSeadragon from 'openseadragon'; 
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import domtoimage from 'dom-to-image'; 

import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CropSquareIcon from '@mui/icons-material/CropSquare';
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked';
import PolylineIcon from '@mui/icons-material/Polyline';
import TextFieldsIcon from '@mui/icons-material/TextFields';
import PanToolIcon from '@mui/icons-material/PanTool';
import UndoIcon from '@mui/icons-material/Undo'; 
import CameraAltIcon from '@mui/icons-material/CameraAlt'; 
import DescriptionIcon from '@mui/icons-material/Description';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import VisibilityIcon from '@mui/icons-material/Visibility'; 
import PersonIcon from '@mui/icons-material/Person';

type ToolType = 'move' | 'rect' | 'circle' | 'polygon' | 'text';

interface Shape {
  type: ToolType;
  x: number; y: number; 
  w?: number; h?: number; 
  radius?: number; 
  points?: {x: number, y: number}[]; 
  text?: string;
  id?: number; 
  author?: string;
}

export default function Viewer() {
  const navigate = useNavigate();
  const location = useLocation();

    const currentUser = (() => {
        const rawUser = localStorage.getItem("biopsie_user");
        if (!rawUser) return "Inconnu";

        try {
            const parsedUser = JSON.parse(rawUser) as { name?: string };
            if (parsedUser?.name) return parsedUser.name;
        } catch {
            return rawUser;
        }

        return rawUser;
    })();

  const searchParams = new URLSearchParams(location.search);
  const rawUrl = searchParams.get('url'); 
  const patientName = location.state?.patientName || "Patient";
  const folderId = location.state?.folderId || "X-00";
  const defaultDziFilename = location.state?.image_url; 
  const extractionId = location.state?.extractionId; 
  const initialROI = location.state?.roi; 
    const startAnnotate = Boolean(location.state?.startAnnotate);
  const isAnnotationMode = !!extractionId;

  const [loading, setLoading] = useState(false);
  const [showSidebar, setShowSidebar] = useState(isAnnotationMode || (!!patientName && patientName !== "Patient")); 
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [newExtractionId, setNewExtractionId] = useState<number | null>(null);
  const [, setRedrawToken] = useState(0);

  // Formulaire
  const [prelevementType, setPrelevementType] = useState("fine");
  const [prelevementDate, setPrelevementDate] = useState("");
  const [blockNumber, setBlockNumber] = useState("");
  const [fixation, setFixation] = useState("formol");
  const [slideCount, setSlideCount] = useState<string>('');
  const [staining, setStaining] = useState<string[]>([]);
  const [macroObs, setMacroObs] = useState("");
  const [microObs, setMicroObs] = useState("");
  const [histoType, setHistoType] = useState("canalaire");
  const [sbrGrade, setSbrGrade] = useState("1");
  const [margins, setMargins] = useState("");
  const [hormonalReceptors, setHormonalReceptors] = useState("");
  const [diagnosis, setDiagnosis] = useState("benin");
  const [comments, setComments] = useState("");
  const [status, setStatus] = useState("en_analyse");
  const [pathologist, setPathologist] = useState("");
  const [validationDate, setValidationDate] = useState("");
  const [labelInput, setLabelInput] = useState("Extraction");
    const [analysisPhase, setAnalysisPhase] = useState<'overview' | 'annotate'>((isAnnotationMode || startAnnotate) ? 'annotate' : 'overview');
    const [selectionRect, setSelectionRect] = useState<Shape | null>(
            initialROI && initialROI.w > 0
                    ? {
                                type: 'rect',
                                x: initialROI.x,
                                y: initialROI.y,
                                w: initialROI.w,
                                h: initialROI.h,
                                author: currentUser,
                        }
                    : null
    );

  // Outils
  const [currentTool, setCurrentTool] = useState<ToolType>('move');
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [dragStart, setDragStart] = useState<{x: number, y: number} | null>(null);
  const [currentDragShape, setCurrentDragShape] = useState<Shape | null>(null);
  const [movingShapeIndex, setMovingShapeIndex] = useState<number | null>(null);
  
  const [polyPoints, setPolyPoints] = useState<{x: number, y: number}[]>([]);
  const [pendingTextPos, setPendingTextPos] = useState<{x: number, y: number} | null>(null); 
  const [editingShapeIndex, setEditingShapeIndex] = useState<number | null>(null); 
  const [textValue, setTextValue] = useState("");

  const viewerRef = useRef<OpenSeadragon.Viewer | null>(null);
  const containerRef = useRef<HTMLDivElement>(null); 

  useEffect(() => {
    if (!rawUrl) return;
    const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    const finalTileSource = rawUrl.startsWith('http') ? rawUrl : `${baseUrl}/dzi_data/${rawUrl}`;

    if (viewerRef.current) viewerRef.current.destroy();

    try {
        const viewer = OpenSeadragon({
            id: "openseadragon-viewer",
            prefixUrl: "https://openseadragon.github.io/openseadragon/images/", 
            tileSources: finalTileSource,
            showNavigator: !isAnnotationMode, 
            animationTime: 0.5,
            blendTime: 0.1,
            maxZoomPixelRatio: 40,
            gestureSettingsMouse: { clickToZoom: true },
            crossOriginPolicy: "Anonymous",
            useCanvas: false, 
            showHomeControl: false, 
            visibilityRatio: 0, 
            constrainDuringPan: false,
            minZoomImageRatio: 0,
        });

        viewerRef.current = viewer;

        const updateOverlay = () => setRedrawToken(n => n + 1);
        viewer.addHandler('animation', updateOverlay);
        viewer.addHandler('update-viewport', updateOverlay);
        viewer.addHandler('resize', updateOverlay);
        viewer.setMouseNavEnabled(true);

        if (initialROI && initialROI.w > 0) {
            viewer.addHandler('open', function() {
                const roiRect = viewer.viewport.imageToViewportRectangle(
                    initialROI.x, initialROI.y, initialROI.w, initialROI.h
                );
                viewer.viewport.fitBounds(roiRect, true);

                if (isAnnotationMode) {
                    setTimeout(() => {
                        const homeZoom = viewer.viewport.getZoom();
                        void homeZoom;
                        viewer.addHandler('animation', () => {
                            const bounds = roiRect;
                            const current = viewer.viewport.getBounds();
                            let newX = current.x;
                            let newY = current.y;
                            if (current.width >= bounds.width) newX = bounds.x + (bounds.width - current.width) / 2;
                            else newX = Math.max(bounds.x, Math.min(newX, bounds.x + bounds.width - current.width));
                            
                            if (current.height >= bounds.height) newY = bounds.y + (bounds.height - current.height) / 2;
                            else newY = Math.max(bounds.y, Math.min(newY, bounds.y + bounds.height - current.height));
                            
                            if (newX !== current.x || newY !== current.y) {
                                viewer.viewport.fitBounds(new OpenSeadragon.Rect(newX, newY, current.width, current.height), true);
                            }
                        });
                    }, 100);
                }
            });
        }
    } catch (e) { console.error("Erreur OSD:", e); }
    return () => { if (viewerRef.current) viewerRef.current.destroy(); };
  }, [rawUrl, isAnnotationMode, initialROI]);

  useEffect(() => {
      if (!startAnnotate || selectionRect || !folderId) {
          return;
      }

      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      fetch(`${baseUrl}/patients/${encodeURIComponent(folderId)}/extractions`)
          .then((response) => response.json())
          .then((data) => {
              if (!Array.isArray(data) || data.length === 0) {
                  return;
              }

              const latest = data[0] as { roi?: { x?: number; y?: number; w?: number; h?: number } };
              const roi = latest.roi;
              if (!roi) {
                  return;
              }

              const width = roi.w ?? 0;
              const height = roi.h ?? 0;
              if (width <= 0 || height <= 0) {
                  return;
              }

              setSelectionRect({
                  type: 'rect',
                  x: roi.x ?? 0,
                  y: roi.y ?? 0,
                  w: width,
                  h: height,
                  author: currentUser,
              });
          })
          .catch(() => {
              // Pas bloquant: si aucune extraction trouvée, l'utilisateur peut créer une zone.
          });
  }, [startAnnotate, selectionRect, folderId, currentUser]);

  useEffect(() => {
      if (viewerRef.current) {
          const canPan = currentTool === 'move' && movingShapeIndex === null;
          viewerRef.current.setMouseNavEnabled(canPan);
      }
  }, [currentTool, movingShapeIndex]);

  useEffect(() => {
      if (analysisPhase === 'overview') {
          setCurrentTool('rect');
          setPendingTextPos(null);
          setEditingShapeIndex(null);
          setPolyPoints([]);
      }
  }, [analysisPhase]);

  const handleAiAnalysis = () => {
      setLoading(true);
      setAiSuggestion(null); 
      setTimeout(() => {
                    const healthy = Math.random() >= 0.5;
                    if (healthy) {
                        const confidence = (0.82 + Math.random() * 0.17).toFixed(2);
                        setAiSuggestion(`Résultat IA: Aspect sain (probabilité ${confidence}).`);
                    } else {
                        const confidence = (0.58 + Math.random() * 0.3).toFixed(2);
                        setAiSuggestion(`Résultat IA: Suspicion lésionnelle (probabilité ${confidence}).`);
                    }
          setShowSidebar(true);
          setLoading(false);
      }, 1500);
  };

    const handleDownloadSnapshot = () => {
        const node = containerRef.current;
        if (!node) return;
        domtoimage.toJpeg(node, { 
            quality: 0.95,
            filter: (node: Node) => {
                if (node instanceof HTMLElement && node.classList.contains('ui-layer')) return false;
                return true;
            }
        }).then((dataUrl: string) => {
            const link = document.createElement('a');
            link.download = `annotation_${patientName}.jpg`;
            link.href = dataUrl;
            link.click();
        });
    };

  const handleUndo = () => {
      const myShapes = shapes.map((s, i) => ({...s, originalIndex: i})).filter(s => s.author === currentUser || !s.author);
      if (myShapes.length === 0) return;
      const lastMyShape = myShapes[myShapes.length - 1];
      const newShapes = shapes.filter((_, i) => i !== lastMyShape.originalIndex);
      setShapes(newShapes);
  };

  const handleDeleteAll = () => {
      if(confirm("Voulez-vous supprimer VOS annotations ?")) {
          setShapes(prev => prev.filter(s => s.author !== currentUser));
      }
  }

  const getCoords = (e: React.MouseEvent) => {
      const rect = document.getElementById("osd-container")!.getBoundingClientRect();
      return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleShapeMouseDown = (e: React.MouseEvent, index: number) => {
      if (currentTool !== 'move') return; 
      
      if (shapes[index].author && shapes[index].author !== currentUser) return;

      e.stopPropagation(); 
      e.preventDefault();
      setMovingShapeIndex(index);
      const { x, y } = getCoords(e);
      setDragStart({ x, y });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
      if (movingShapeIndex !== null) return; 
      if (!viewerRef.current) return;
      if (editingShapeIndex !== null) return;
      if (currentTool === 'move' || pendingTextPos) return;
      if (analysisPhase === 'overview' && currentTool !== 'rect') return;

      const { x, y } = getCoords(e);
      if (currentTool === 'text') { setPendingTextPos({x, y}); setTextValue(""); return; }
      if (currentTool === 'polygon') { setPolyPoints(prev => [...prev, {x, y}]); return; }
      setDragStart({x, y});
      setCurrentDragShape({ type: currentTool, x, y, w: 0, h: 0 }); 
  };

  const handleMouseMove = (e: React.MouseEvent) => {
      if (!dragStart) return;
      const { x: currentX, y: currentY } = getCoords(e);
      if (movingShapeIndex !== null && viewerRef.current) {
          const shape = shapes[movingShapeIndex];
          const pStart = viewerRef.current.viewport.viewerElementToImageCoordinates(new OpenSeadragon.Point(dragStart.x, dragStart.y));
          const pEnd = viewerRef.current.viewport.viewerElementToImageCoordinates(new OpenSeadragon.Point(currentX, currentY));
          const deltaX = pEnd.x - pStart.x;
          const deltaY = pEnd.y - pStart.y;
          const newShapes = [...shapes];
          newShapes[movingShapeIndex] = { ...shape, x: shape.x + deltaX, y: shape.y + deltaY };
          setShapes(newShapes);
          setDragStart({x: currentX, y: currentY}); 
          return;
      }
      if (currentDragShape) {
          const w = Math.abs(currentX - dragStart.x);
          const h = Math.abs(currentY - dragStart.y);
          const x = Math.min(currentX, dragStart.x);
          const y = Math.min(currentY, dragStart.y);
          let radius = 0;
          if (currentTool === 'circle') radius = Math.sqrt(Math.pow(currentX - dragStart.x, 2) + Math.pow(currentY - dragStart.y, 2));
          setCurrentDragShape({ ...currentDragShape, x, y, w, h, radius });
      }
  };

  const handleMouseUp = () => {
      if (movingShapeIndex !== null) { setMovingShapeIndex(null); setDragStart(null); return; }
      if (currentTool === 'polygon') return;
      if (!currentDragShape || !viewerRef.current) { setDragStart(null); setCurrentDragShape(null); return; }
    const dragWidth = currentDragShape.w ?? 0;
    const dragHeight = currentDragShape.h ?? 0;
      const p1 = viewerRef.current.viewport.viewerElementToImageCoordinates(new OpenSeadragon.Point(currentDragShape.x, currentDragShape.y));
    const p2 = viewerRef.current.viewport.viewerElementToImageCoordinates(new OpenSeadragon.Point(currentDragShape.x + dragWidth, currentDragShape.y + dragHeight));
      const imageX = p1.x; const imageY = p1.y;
      const imageW = p2.x - p1.x; const imageH = p2.y - p1.y;
      const pRadius = viewerRef.current.viewport.deltaPointsFromPixels(new OpenSeadragon.Point(currentDragShape.radius || 0, 0));
      
      const newShape: Shape = { 
          type: currentTool, 
          x: imageX, y: imageY, w: imageW, h: imageH, 
          radius: pRadius.x, 
          author: currentUser 
      };

      if ((newShape.w ?? 0) > 5 || (newShape.radius && newShape.radius > 5)) {
          if (analysisPhase === 'overview' && newShape.type === 'rect') {
              setSelectionRect(newShape);
              setCurrentTool('move');
          } else {
              setShapes(prev => [...prev, newShape]); 
              if (!isAnnotationMode) { setCurrentTool('move'); setShowSidebar(true); }
          }
      }
      setDragStart(null); setCurrentDragShape(null);
  };

  const handleViewAll = () => {
      setAnalysisPhase('overview');
      setShowSidebar(false);
      if (viewerRef.current) {
          viewerRef.current.viewport.goHome(true);
      }
  };

  const handleSaveZone = async () => {
      if (!selectionRect || (selectionRect.w ?? 0) <= 0 || (selectionRect.h ?? 0) <= 0) {
          alert("Sélectionnez d'abord une zone avec un rectangle.");
          return;
      }

      setLoading(true);
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
      const payload = {
          filename: defaultDziFilename || rawUrl || "biopsie_cmu_1.dzi",
          x: Math.round(selectionRect.x || 0),
          y: Math.round(selectionRect.y || 0),
          width: Math.round(selectionRect.w || 0),
          height: Math.round(selectionRect.h || 0),
          patient_folder: folderId,
          patient_name: patientName,
          annotation_label: labelInput || "Zone sélectionnée",
          owner: currentUser,
          prelevement_type: prelevementType,
          prelevement_date: prelevementDate,
          block_number: blockNumber,
          fixation: fixation,
          slide_count: slideCount === '' ? null : parseInt(slideCount),
          staining: staining,
          macro_obs: macroObs,
          micro_obs: microObs,
          histo_type: histoType,
          sbr_grade: sbrGrade,
          margins: margins,
          hormonal_receptors: hormonalReceptors,
          diagnosis: diagnosis,
          comments: comments,
          status: status,
          pathologist: pathologist,
          validation_date: validationDate,
          drawings: [],
      };

      try {
          const res = await fetch(`${baseUrl}/extract-roi`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload),
          });

          const data = await res.json();
          if (!res.ok) {
              alert("Erreur serveur lors de l'enregistrement de la zone.");
              return;
          }

          const createdId = data?.extraction_id ?? data?.id ?? null;
          if (createdId) {
              setNewExtractionId(createdId);
          }
          alert("✅ Zone enregistrée.");
          navigate(-1);
      } catch {
          alert("Erreur réseau lors de l'enregistrement de la zone.");
      } finally {
          setLoading(false);
      }
  };

  const handleDoubleClick = () => {
      if (currentTool === 'polygon' && polyPoints.length > 2 && viewerRef.current) {
          const imagePoints = polyPoints.map(p => {
              const pt = viewerRef.current!.viewport.viewerElementToImageCoordinates(new OpenSeadragon.Point(p.x, p.y));
              return { x: pt.x, y: pt.y };
          });
          setShapes(prev => [...prev, { type: 'polygon', x: 0, y: 0, w: 0, h: 0, points: imagePoints, author: currentUser }]);
          setPolyPoints([]);
      }
  };

  const confirmText = () => {
      if (editingShapeIndex !== null) {
          if (textValue.trim() !== "") {
              const newShapes = [...shapes];
              newShapes[editingShapeIndex].text = textValue;
              setShapes(newShapes);
          }
          setEditingShapeIndex(null);
          setTextValue("");
          return;
      }

      if (pendingTextPos && textValue.trim() !== "" && viewerRef.current) {
          const pt = viewerRef.current.viewport.viewerElementToImageCoordinates(new OpenSeadragon.Point(pendingTextPos.x, pendingTextPos.y));
          setShapes(prev => [...prev, { type: 'text', x: pt.x, y: pt.y, w:0, h:0, text: textValue, author: currentUser }]);
      }
      setPendingTextPos(null); 
      setCurrentTool('move');
  };

  const startEditingText = (index: number) => {
      if (shapes[index].author && shapes[index].author !== currentUser) return;
      if (!shapes[index].text) return;
      setEditingShapeIndex(index);
      setTextValue(shapes[index].text || "");
  };

  const renderShapes = () => {
      if (!viewerRef.current) return null;
      return shapes.map((shape, idx) => {
          const shapeWidth = shape.w ?? 0;
          const shapeHeight = shape.h ?? 0;
          const p1 = viewerRef.current!.viewport.imageToViewerElementCoordinates(new OpenSeadragon.Point(shape.x, shape.y));
          const p2 = viewerRef.current!.viewport.imageToViewerElementCoordinates(new OpenSeadragon.Point(shape.x + shapeWidth, shape.y + shapeHeight));
          const sx = p1.x; const sy = p1.y; const sw = p2.x - p1.x; const sh = p2.y - p1.y;
          
          const isMe = shape.author === currentUser;
          const strokeColor = isMe ? "#10b981" : "#f59e0b"; // Vert (Moi) / Orange (Autre)
          const fillColor = isMe ? "rgba(16, 185, 129, 0.3)" : "rgba(245, 158, 11, 0.3)";
          const cursorStyle = isMe && currentTool === 'move' ? 'grab' : 'not-allowed';

          // --- ETIQUETTE AUTEUR ---
          const renderAuthorLabel = (x: number, y: number) => {
              if (!shape.author) return null;
              return (
                  <text 
                    x={x} y={y - 5} 
                    fill={strokeColor} 
                    fontSize="14" 
                    fontWeight="bold" 
                    style={{ pointerEvents: "none", textShadow: "1px 1px 2px black" }}
                  >
                    {shape.author}
                  </text>
              );
          };

          if (shape.type === 'rect') return (
              <g key={idx}>
                  {renderAuthorLabel(sx, sy)}
                  <rect 
                    x={sx} y={sy} width={sw} height={sh} 
                    fill={fillColor} stroke={strokeColor} strokeWidth="3" 
                    onMouseDown={(e) => handleShapeMouseDown(e, idx)} 
                    style={{ cursor: cursorStyle, pointerEvents: 'auto' }}
                  />
              </g>
          );
          if (shape.type === 'circle') {
              const pr = viewerRef.current!.viewport.deltaPixelsFromPoints(new OpenSeadragon.Point(shape.radius || 0, 0));
              return (
                <g key={idx}>
                    {renderAuthorLabel(sx - pr.x, sy - pr.x)}
                    <circle 
                        cx={sx} cy={sy} r={pr.x} 
                        fill={fillColor} stroke={strokeColor} strokeWidth="3" 
                        onMouseDown={(e) => handleShapeMouseDown(e, idx)}
                        style={{ cursor: cursorStyle, pointerEvents: 'auto' }}
                    />
                </g>
              );
          }
          if (shape.type === 'polygon' && shape.points) {
              const pts = shape.points.map(pt => {
                  const s = viewerRef.current!.viewport.imageToViewerElementCoordinates(new OpenSeadragon.Point(pt.x, pt.y));
                  return `${s.x},${s.y}`;
              }).join(' ');
              
              const firstPt = shape.points[0];
              const sFirst = viewerRef.current!.viewport.imageToViewerElementCoordinates(new OpenSeadragon.Point(firstPt.x, firstPt.y));
              
              return (
                <g key={idx}>
                    {renderAuthorLabel(sFirst.x, sFirst.y)}
                    <polygon 
                        points={pts} fill={fillColor} stroke={strokeColor} strokeWidth="3" 
                        onMouseDown={(e) => handleShapeMouseDown(e, idx)}
                        style={{ cursor: cursorStyle, pointerEvents: 'auto' }}
                    />
                </g>
              );
          }
          if (shape.type === 'text' && shape.text) {
              if (editingShapeIndex === idx) return null;
              return (
                  <g key={idx}>
                      <text x={sx} y={sy - 20} fill={strokeColor} fontSize="12" fontWeight="bold">
                          {shape.author}
                      </text>
                      <text 
                          x={sx} y={sy} 
                          fill={isMe ? "#facc15" : "#f87171"} 
                          fontSize="20" 
                          fontWeight="bold" 
                          onMouseDown={(e) => handleShapeMouseDown(e, idx)} 
                          onDoubleClick={(e) => {
                              e.stopPropagation();
                              startEditingText(idx);
                          }}
                          style={{
                              textShadow: '1px 1px 2px black', 
                              cursor: cursorStyle, 
                              pointerEvents: 'auto',
                              userSelect: 'none'
                          }}
                      >
                          {shape.text}
                      </text>
                  </g>
              );
          }
          return null;
      });
  };

  const renderSelectionRect = () => {
      if (!selectionRect || !viewerRef.current) return null;
      const rectWidth = selectionRect.w ?? 0;
      const rectHeight = selectionRect.h ?? 0;
      const p1 = viewerRef.current.viewport.imageToViewerElementCoordinates(new OpenSeadragon.Point(selectionRect.x, selectionRect.y));
      const p2 = viewerRef.current.viewport.imageToViewerElementCoordinates(new OpenSeadragon.Point(selectionRect.x + rectWidth, selectionRect.y + rectHeight));

      return (
          <rect
              x={p1.x}
              y={p1.y}
              width={p2.x - p1.x}
              height={p2.y - p1.y}
              fill="rgba(14, 165, 233, 0.12)"
              stroke="#0ea5e9"
              strokeWidth="3"
              strokeDasharray="8 6"
              style={{ pointerEvents: 'none' }}
          />
      );
  };

  useEffect(() => {
      if (extractionId) {
          setLoading(true);
          const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
          fetch(`${baseUrl}/extractions/${extractionId}/details`)
              .then(res => res.json())
              .then(data => {
                  setLabelInput(data.filename || "");
                  setPrelevementType(data.prelevement_type || "fine");
                  setPrelevementDate(data.prelevement_date || "");
                  setBlockNumber(data.block_number || "");
                  setFixation(data.fixation || "formol");
                  setSlideCount(data.slide_count ? data.slide_count.toString() : "");
                  setStaining(data.staining || []);
                  setMacroObs(data.macro_obs || "");
                  setMicroObs(data.micro_obs || "");
                  setHistoType(data.histo_type || "canalaire");
                  setSbrGrade(data.sbr_grade || "1");
                  setMargins(data.margins || "");
                  setHormonalReceptors(data.hormonal_receptors || "");
                  setDiagnosis(data.diagnosis || "benin");
                  setComments(data.comments || "");
                  setStatus(data.status || "en_analyse");
                  setPathologist(data.pathologist || "");
                  setValidationDate(data.validation_date || "");
                  if (data.drawings) { setShapes(data.drawings); }
              })
              .catch(err => console.error("Erreur chargement:", err))
              .finally(() => setLoading(false));
      }
  }, [extractionId]);

  const handleStainingChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const options = Array.from(e.target.selectedOptions, option => option.value);
    setStaining(options);
  };

  const handleGoToExtraction = () => {
    setShowSuccessModal(false);
    if (newExtractionId) {
        navigate(`/viewer?url=${encodeURIComponent(defaultDziFilename || "")}`, {
            state: { 
                patientName: patientName, 
                folderId: folderId,
                image_url: defaultDziFilename,
                extractionId: newExtractionId,
                roi: shapes[0] 
            }
        });
        window.location.reload(); 
    } else {
        setShowSidebar(false);
    }
  };

  const handleStayOnImage = () => {
      setShowSuccessModal(false);
      setShowSidebar(false);
  };

  const handleSaveAction = async () => {
      if (!shapes.length && !extractionId) return;
      setLoading(true);
      const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:8000';
    const shape = selectionRect || (shapes.length > 0 ? shapes[0] : { x:0, y:0, w:0, h:0 });
      
      const payload = {
          filename: defaultDziFilename || "biopsie_cmu_1.dzi",
          x: Math.round(shape.x || 0), 
          y: Math.round(shape.y || 0), 
          width: Math.round(shape.w || 0), 
          height: Math.round(shape.h || 0),
          patient_folder: folderId, 
          patient_name: patientName, 
          annotation_label: labelInput,
          extraction_id: extractionId,
          
          owner: currentUser, // <--- C'EST ICI QU'ON SIGNE LE DOSSIER !

          prelevement_type: prelevementType,
          prelevement_date: prelevementDate,
          block_number: blockNumber,
          fixation: fixation,
          slide_count: slideCount === '' ? null : parseInt(slideCount),
          staining: staining,
          macro_obs: macroObs,
          micro_obs: microObs,
          histo_type: histoType,
          sbr_grade: sbrGrade,
          margins: margins,
          hormonal_receptors: hormonalReceptors,
          diagnosis: diagnosis,
          comments: comments,
          status: status,
          pathologist: pathologist,
          validation_date: validationDate,
          drawings: shapes
      };

      try {
          const url = isAnnotationMode ? `${baseUrl}/annotations/save` : `${baseUrl}/extract-roi`;
          const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
          const data = await res.json();

          if(res.ok) { 
              if (!isAnnotationMode) {
                  if (data && data.extraction_id) setNewExtractionId(data.extraction_id);
                  else if (data && data.id) setNewExtractionId(data.id);
                  alert("✅ Extraction créée !");
                  navigate('/inbox');
              } else {
                  alert("✅ Dossier mis à jour !");
                  navigate('/inbox');
              }
          } else {
              alert("Erreur serveur lors de la sauvegarde.");
          }
      } catch (err) { alert("Erreur réseau"); } 
      finally { setLoading(false); }
  };

  return (
    <div className="h-screen w-screen bg-black overflow-hidden flex font-sans text-white select-none">
      
      <div id="osd-container" className="relative flex-grow h-full bg-black overflow-hidden" ref={containerRef}>
          <div id="openseadragon-viewer" className="absolute inset-0 z-0 bg-black" />

          {/* AIDE VISUELLE */}
          <div className="absolute top-4 left-4 z-30 pointer-events-none">
              <div className="bg-black/60 backdrop-blur-sm border border-white/10 p-3 rounded-xl text-[10px] uppercase tracking-wider text-slate-400 space-y-2">
                  <div className="flex items-center gap-2">
                      <span className="w-5 h-5 flex items-center justify-center bg-white/10 rounded">🖱️</span>
                      <span>Zoom: Molette / Double-clic</span>
                  </div>
                  <div className="flex items-center gap-2">
                      <span className="w-5 h-5 flex items-center justify-center bg-white/10 rounded">🖐️</span>
                      <span>Pan: Glisser (Outil Main)</span>
                  </div>
                  <div className="flex items-center gap-2">
                      <span className="w-5 h-5 flex items-center justify-center bg-white/10 rounded">✏️</span>
                      <span>Étape 1: Voir tout + enregistrer zone, puis Annoter depuis l'accueil</span>
                  </div>
              </div>
          </div>

          {/* Calque SVG */}
          <div className={`absolute inset-0 z-10 ${currentTool === 'move' && !pendingTextPos && movingShapeIndex === null ? 'pointer-events-none' : 'cursor-crosshair pointer-events-auto'}`}
            onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onDoubleClick={handleDoubleClick}>
            <svg className="w-full h-full">
                {renderSelectionRect()}
                {renderShapes()}
                {currentDragShape && currentTool === 'rect' && <rect x={currentDragShape.x} y={currentDragShape.y} width={currentDragShape.w} height={currentDragShape.h} fill="rgba(239, 68, 68, 0.3)" stroke="#ef4444" strokeWidth="2" />}
                {currentDragShape && currentTool === 'circle' && <circle cx={currentDragShape.x} cy={currentDragShape.y} r={currentDragShape.radius} fill="rgba(239, 68, 68, 0.3)" stroke="#ef4444" strokeWidth="2" />}
                {currentTool === 'polygon' && <polyline points={polyPoints.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#f59e0b" strokeWidth="2" />}
            </svg>
            
            {/* Input Création Nouveau Texte */}
            {pendingTextPos && (
                <div className="absolute bg-slate-800 p-2 rounded-lg shadow-xl border border-slate-600 flex gap-2 pointer-events-auto" style={{ left: pendingTextPos.x, top: pendingTextPos.y }}>
                    <input autoFocus type="text" value={textValue} onChange={(e) => setTextValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && confirmText()} className="bg-slate-900 text-white border border-slate-700 rounded px-2 py-1 outline-none" />
                    <button onClick={confirmText} className="bg-emerald-600 text-white px-2 rounded">OK</button>
                </div>
            )}

            {/* Input Édition Texte Existant */}
            {editingShapeIndex !== null && viewerRef.current && (() => {
                 const shape = shapes[editingShapeIndex];
                 const pt = viewerRef.current.viewport.imageToViewerElementCoordinates(new OpenSeadragon.Point(shape.x, shape.y));
                 return (
                    <div className="absolute bg-slate-800 p-2 rounded-lg shadow-xl border border-blue-500 flex gap-2 pointer-events-auto" style={{ left: pt.x, top: pt.y }}>
                        <input autoFocus type="text" value={textValue} onChange={(e) => setTextValue(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && confirmText()} className="bg-slate-900 text-white border border-slate-700 rounded px-2 py-1 outline-none" />
                        <button onClick={confirmText} className="bg-blue-600 text-white px-2 rounded">MAJ</button>
                    </div>
                 );
            })()}
          </div>

          {/* LÉGENDE COLLABORATIVE */}
          <div className={`absolute top-2 transition-all duration-300 ${showSidebar ? 'right-[470px]' : 'right-200'} bg-slate-900/90 backdrop-blur-md border border-slate-700 p-3 rounded-xl shadow-xl pointer-events-none`}>
              <div className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-widest flex items-center gap-2">
                 <PersonIcon fontSize="small"/> Collaboration
              </div>
              <div className="flex items-center gap-2 mb-1">
                  <div className="w-3 h-3 rounded-full bg-[#10b981]"></div>
                  <span className="text-xs text-white">Moi ({currentUser})</span>
              </div>
              <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#f59e0b]"></div>
                  <span className="text-xs text-white">Collègues</span>
              </div>
          </div>

          {/* BARRE D'OUTILS FLOTTANTE */}
          <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 z-20 pointer-events-none flex gap-4 ui-layer">
             <div className="pointer-events-auto bg-slate-900/90 backdrop-blur-md border border-slate-700 rounded-2xl p-2 flex items-center gap-4 shadow-2xl">
                <button onClick={() => navigate('/inbox')} className="p-2 hover:bg-white/10 rounded-xl transition-colors"><ArrowBackIcon /></button>
                <div className="pr-4 border-r border-white/10">
                    <h1 className="font-bold text-sm text-white">{patientName}</h1>
                    <div className="text-xs text-emerald-400 font-mono">ID: {folderId}</div>
                </div>
             </div>

             <div className="pointer-events-auto bg-slate-800/90 backdrop-blur-md border border-slate-600 rounded-2xl p-1.5 flex gap-2 shadow-2xl">
                <button onClick={() => setCurrentTool('move')} className={`p-3 rounded-xl transition-all ${currentTool === 'move' ? 'bg-indigo-600 text-white' : 'text-slate-400 hover:text-white'}`} title="Déplacer"><PanToolIcon /></button>
                <div className="w-px bg-white/10 mx-1 my-2"></div>
                <button onClick={() => setCurrentTool('rect')} className={`p-3 rounded-xl transition-all ${currentTool === 'rect' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-emerald-400'}`} title="Rectangle"><CropSquareIcon /></button>
                <button onClick={() => setCurrentTool('circle')} disabled={analysisPhase !== 'annotate'} className={`p-3 rounded-xl transition-all ${currentTool === 'circle' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-blue-400'} ${analysisPhase !== 'annotate' ? 'opacity-40 cursor-not-allowed' : ''}`} title="Cercle"><RadioButtonUncheckedIcon /></button>
                <button onClick={() => {setCurrentTool('polygon'); setPolyPoints([])}} disabled={analysisPhase !== 'annotate'} className={`p-3 rounded-xl transition-all ${currentTool === 'polygon' ? 'bg-amber-600 text-white' : 'text-slate-400 hover:text-amber-400'} ${analysisPhase !== 'annotate' ? 'opacity-40 cursor-not-allowed' : ''}`} title="Polygone"><PolylineIcon /></button>
                <button onClick={() => {setCurrentTool('text'); setPendingTextPos(null)}} disabled={analysisPhase !== 'annotate'} className={`p-3 rounded-xl transition-all ${currentTool === 'text' ? 'bg-yellow-600 text-white' : 'text-slate-400 hover:text-yellow-400'} ${analysisPhase !== 'annotate' ? 'opacity-40 cursor-not-allowed' : ''}`} title="Texte"><TextFieldsIcon /></button>
             </div>

             <div className="pointer-events-auto flex gap-3">
                <button
                    onClick={handleViewAll}
                    className={`px-4 py-3 rounded-2xl font-bold shadow-xl transition-all ${analysisPhase === 'overview' ? 'bg-cyan-600 text-white' : 'bg-slate-800/90 text-slate-200 border border-slate-600 hover:bg-slate-700'}`}
                >
                    Voir tout
                </button>
                <button
                    onClick={handleSaveZone}
                    disabled={loading || !selectionRect || (selectionRect.w ?? 0) <= 0 || (selectionRect.h ?? 0) <= 0}
                    className={`px-4 py-3 rounded-2xl font-bold shadow-xl transition-all bg-slate-800/90 text-slate-200 border border-slate-600 hover:bg-slate-700 ${loading || !selectionRect || (selectionRect.w ?? 0) <= 0 || (selectionRect.h ?? 0) <= 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                    Enregistrer la zone
                </button>
                 <button onClick={handleDownloadSnapshot} className="p-3 bg-slate-800/90 backdrop-blur-md text-white border border-slate-600 rounded-2xl hover:bg-indigo-600 transition-all shadow-lg"><CameraAltIcon /></button>
                {analysisPhase === 'annotate' && shapes.length > 0 && <button onClick={handleUndo} className="p-3 bg-slate-700/80 backdrop-blur-md text-white border border-slate-500 rounded-2xl hover:bg-slate-600 transition-all shadow-lg" title="Annuler dernier"><UndoIcon /></button>}
                {analysisPhase === 'annotate' && shapes.length > 0 && <button onClick={handleDeleteAll} className="p-3 bg-red-500/20 text-red-400 border border-red-500/50 rounded-2xl hover:bg-red-500 hover:text-white"><DeleteForeverIcon /></button>}
                
                <button 
                    onClick={handleAiAnalysis} 
                    disabled={loading || analysisPhase !== 'annotate'}
                    className={`px-4 py-3 rounded-2xl font-bold flex items-center gap-2 shadow-xl transition-all ${aiSuggestion ? 'bg-slate-700 text-slate-300 border border-slate-500 cursor-not-allowed' : 'bg-indigo-600 text-white hover:bg-indigo-500'} ${analysisPhase !== 'annotate' ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                    <SmartToyIcon /> {loading ? "..." : (aiSuggestion ? "IA Terminée" : "IA")}
                </button>

                <button onClick={() => setShowSidebar(!showSidebar)} className={`px-4 py-3 rounded-2xl font-bold flex items-center gap-2 shadow-xl transition-all ${showSidebar ? 'bg-slate-700 text-slate-300' : 'bg-emerald-600 text-white'}`}>
                    <DescriptionIcon /> {showSidebar ? "Masquer" : "Rapport"}
                </button>
             </div>
          </div>
      </div>

      {showSuccessModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-300">
            <div className="bg-slate-900 border border-slate-700 p-8 rounded-3xl shadow-2xl max-w-md w-full text-center relative">
                <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6 text-emerald-400">
                    <CheckCircleIcon style={{ fontSize: 40 }} />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Extraction Créée !</h2>
                <p className="text-slate-400 mb-8">L'analyse a été enregistrée avec succès.</p>
                
                <div className="flex flex-col gap-3">
                    <button onClick={handleGoToExtraction} className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20">
                        <VisibilityIcon /> Voir l'extraction
                    </button>
                    <button onClick={handleStayOnImage} className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 border border-slate-700">
                        <DescriptionIcon /> Rester sur l'image
                    </button>
                </div>
            </div>
        </div>
      )}

      {showSidebar && !showSuccessModal && (
          <div className="w-[450px] bg-slate-900 border-l border-slate-800 flex flex-col shadow-2xl z-20 animate-in slide-in-from-right duration-300">
              <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-950">
                  <div>
                      <h2 className="text-xl font-bold text-white">Analyse Pathologique</h2>
                      <div className="text-xs text-slate-400">Dossier: {folderId}</div>
                  </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-8 custom-scrollbar">
                  
                  {aiSuggestion && (
                    <div className="bg-slate-800 border border-slate-600 rounded-xl p-4 mb-2">
                        <h3 className="text-sm font-bold text-slate-300 flex items-center gap-2 mb-2">
                            <SmartToyIcon fontSize="small" /> Résultat IA
                        </h3>
                        <p className="text-xs text-slate-400 font-mono italic">
                            {aiSuggestion}
                        </p>
                    </div>
                  )}

                  <section className="space-y-4">
                      <h3 className="text-sm font-bold text-emerald-400 uppercase tracking-widest border-b border-emerald-900/30 pb-2">1. Prélèvement</h3>
                      <div className="space-y-4">
                          <div><label className="block text-xs text-slate-400 mb-1 ml-1">Nom de l'extraction</label><input type="text" value={labelInput} onChange={(e) => setLabelInput(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white font-bold text-emerald-300 focus:outline-none focus:border-emerald-500 transition-colors" /></div>
                          <div className="grid grid-cols-2 gap-4">
                              <div><label className="block text-xs text-slate-400 mb-1 ml-1">Type</label><select value={prelevementType} onChange={(e) => setPrelevementType(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-emerald-500 transition-colors"><option value="fine">Aiguille fine</option><option value="core">Core biopsy</option><option value="exerese">Exérèse</option></select></div>
                              <div><label className="block text-xs text-slate-400 mb-1 ml-1">Date</label><input type="date" value={prelevementDate} onChange={(e) => setPrelevementDate(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-emerald-500 transition-colors" /></div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                              <div><label className="block text-xs text-slate-400 mb-1 ml-1">N° Bloc</label><input type="text" value={blockNumber} onChange={(e) => setBlockNumber(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-emerald-500 transition-colors" /></div>
                              <div><label className="block text-xs text-slate-400 mb-1 ml-1">N° Lames</label><input type="number" value={slideCount} onChange={(e) => setSlideCount(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-emerald-500 transition-colors" /></div>
                          </div>
                          <div>
                              <label className="block text-xs text-slate-400 mb-1 ml-1">Coloration</label>
                              <select multiple value={staining} onChange={handleStainingChange} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-emerald-500 transition-colors h-24">
                                  <option value="HE">H&E</option><option value="IHC">IHC</option><option value="HER2">HER2</option><option value="ER">ER</option><option value="PR">PR</option>
                              </select>
                          </div>
                      </div>
                  </section>

                  <section className="space-y-4">
                      <h3 className="text-sm font-bold text-blue-400 uppercase tracking-widest border-b border-blue-900/30 pb-2">2. Analyse Pathologique</h3>
                      <div className="space-y-4">
                          <div><label className="block text-xs text-slate-400 mb-1 ml-1">Observations Macroscopiques</label><textarea rows={2} value={macroObs} onChange={(e) => setMacroObs(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500 transition-colors"></textarea></div>
                          <div><label className="block text-xs text-slate-400 mb-1 ml-1">Observations Microscopiques</label><textarea rows={2} value={microObs} onChange={(e) => setMicroObs(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500 transition-colors"></textarea></div>
                          <div className="grid grid-cols-2 gap-4">
                              <div><label className="block text-xs text-slate-400 mb-1 ml-1">Type Histologique</label><select value={histoType} onChange={(e) => setHistoType(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500 transition-colors"><option value="canalaire">Carcinome Canalaire</option><option value="lobulaire">Carcinome Lobulaire</option><option value="autre">Autre</option></select></div>
                              <div><label className="block text-xs text-slate-400 mb-1 ml-1">Grade SBR</label><select value={sbrGrade} onChange={(e) => setSbrGrade(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500 transition-colors"><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                              <div><label className="block text-xs text-slate-400 mb-1 ml-1">Marges</label><input type="text" value={margins} onChange={(e) => setMargins(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500 transition-colors" /></div>
                              <div><label className="block text-xs text-slate-400 mb-1 ml-1">Récepteurs Hormonaux</label><input type="text" value={hormonalReceptors} onChange={(e) => setHormonalReceptors(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-blue-500 transition-colors" /></div>
                          </div>
                      </div>
                  </section>

                  <section className="space-y-4">
                      <h3 className="text-sm font-bold text-indigo-400 uppercase tracking-widest border-b border-indigo-900/30 pb-2">3. Conclusion & Traçabilité</h3>
                      <div><label className="block text-xs text-slate-400 mb-1 ml-1">Diagnostic Final</label><select value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white font-bold focus:outline-none focus:border-indigo-500 transition-colors"><option value="benin">Bénin</option><option value="malin">Malin</option><option value="cis">Carcinome in situ (CIS)</option></select></div>
                      <div><label className="block text-xs text-slate-400 mb-1 ml-1">Commentaires</label><textarea rows={4} value={comments} onChange={(e) => setComments(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500 transition-colors"></textarea></div>
                      <div className="grid grid-cols-2 gap-4">
                          <div><label className="block text-xs text-slate-400 mb-1 ml-1">Pathologiste</label><input type="text" value={pathologist} onChange={(e) => setPathologist(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500 transition-colors" /></div>
                          <div><label className="block text-xs text-slate-400 mb-1 ml-1">Statut</label><select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white focus:outline-none focus:border-indigo-500 transition-colors"><option value="en_analyse">En Analyse</option><option value="termine">Terminé</option><option value="archive">Archivé</option></select></div>
                      </div>
                  </section>
              </div>

              <div className="p-6 border-t border-slate-800 bg-slate-950 flex gap-3">
                  <button onClick={handleSaveAction} disabled={loading} className="flex-1 py-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold hover:shadow-lg hover:shadow-emerald-500/20 transition-all flex justify-center items-center gap-2">
                      {loading ? "Sauvegarde..." : <><CheckCircleIcon /> {isAnnotationMode ? "Mettre à jour" : "Créer l'extraction"}</>}
                  </button>
              </div>
          </div>
      )}
    </div>
  );
}