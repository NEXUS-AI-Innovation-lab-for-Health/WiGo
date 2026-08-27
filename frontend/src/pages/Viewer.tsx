import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import OpenSeadragon from "openseadragon";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import domtoimage from "dom-to-image";

import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import DeleteForeverIcon from "@mui/icons-material/DeleteForever";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import CropSquareIcon from "@mui/icons-material/CropSquare";
import RadioButtonUncheckedIcon from "@mui/icons-material/RadioButtonUnchecked";
import PolylineIcon from "@mui/icons-material/Polyline";
import TextFieldsIcon from "@mui/icons-material/TextFields";
import PanToolIcon from "@mui/icons-material/PanTool";
import UndoIcon from "@mui/icons-material/Undo";
import CameraAltIcon from "@mui/icons-material/CameraAlt";
import DescriptionIcon from "@mui/icons-material/Description";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import VisibilityIcon from "@mui/icons-material/Visibility";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOff";
import ZoomInIcon from "@mui/icons-material/ZoomIn";
import ZoomOutIcon from "@mui/icons-material/ZoomOut";
import PersonIcon from "@mui/icons-material/Person";

import OlgaFormPanel from "../features/workflow/components/OlgaFormPanel";
import WorkflowStepper from "../features/workflow/components/WorkflowStepper";
import { STEP_COUNT } from "../features/workflow/steps";
import { useOlgaForm } from "../features/workflow/useOlgaForm";
import { useWorkflow } from "../features/workflow/useWorkflow";

type ToolType = "move" | "rect" | "circle" | "polygon" | "text";

interface Shape {
  type: ToolType;
  x: number;
  y: number;
  w?: number;
  h?: number;
  radius?: number;
  points?: { x: number; y: number }[];
  text?: string;
  textOffsetX?: number;
  textOffsetY?: number;
  id?: number;
  author?: string;
}

interface InstanSegResult {
  suggestion: string;
  cell_count: number;
  contour_points?: { color: string; points: { x: number; y: number }[] }[];
  [key: string]: unknown;
}

type InstanSegContour = {
  color?: string;
  points: { x: number; y: number }[];
};

export default function Viewer() {
  const navigate = useNavigate();
  const location = useLocation();

  const currentUser = localStorage.getItem("biopsie_user") || "Inconnu";

  const searchParams = new URLSearchParams(location.search);
  const rawUrl = searchParams.get("url");
  const patientName = location.state?.patientName || "Patient";
  const folderId = location.state?.folderId || "X-00";
  const defaultDziFilename = location.state?.image_url;
  const extractionId = location.state?.extractionId;
  const initialROI = location.state?.roi;
  const isAnnotationMode = !!extractionId;

  const [loading, setLoading] = useState(false);
  const [showSidebar, setShowSidebar] = useState(isAnnotationMode);
  const [aiSuggestion, setAiSuggestion] = useState<string | null>(null);
  const [aiContours, setAiContours] = useState<InstanSegContour[]>([]);
  const [showAiPoints, setShowAiPoints] = useState(true);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [newExtractionId, setNewExtractionId] = useState<number | null>(null);
  const [, setRedrawToken] = useState(0);

  const [showTexts, setShowTexts] = useState(true);

  // --- ÉTAT DU WORKFLOW ---
  // L'avancement vient du serveur : rouvrir une extraction reprend là où le
  // travail s'était arrêté au lieu de repartir de l'étape 1.
  const workflow = useWorkflow(extractionId ?? null, currentUser);
  const currentStep = workflow.currentIndex;
  const isWorkflowFinished = workflow.isComplete;

  // Saisie en cours uniquement. Les valeurs déjà enregistrées viennent du
  // serveur : aucune valeur clinique n'est plus inventée par défaut.
  const [formData, setFormData] = useState<Record<string, unknown>>({});

  /** Valeurs affichées : état serveur, recouvert par la saisie en cours. */
  const formValues: Record<string, unknown> = {
    ...workflow.mergedData,
    ...formData,
  };

  const [labelInput, setLabelInput] = useState("Extraction");
  const [selectedShapeIndex, setSelectedShapeIndex] = useState<number | null>(null);

  // Outils
  const [currentTool, setCurrentTool] = useState<ToolType>("move");
  const [shapes, setShapes] = useState<Shape[]>([]);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [currentDragShape, setCurrentDragShape] = useState<Shape | null>(null);
  const [movingShapeIndex, setMovingShapeIndex] = useState<number | null>(null);
  const [movingTextIndex, setMovingTextIndex] = useState<number | null>(null);

  const [polyPoints, setPolyPoints] = useState<{ x: number; y: number }[]>([]);
  const [pendingTextPos, setPendingTextPos] = useState<{ x: number; y: number } | null>(null);
  const [editingShapeIndex, setEditingShapeIndex] = useState<number | null>(null);
  const [textValue, setTextValue] = useState("");

  const viewerRef = useRef<OpenSeadragon.Viewer | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // --- FORMULAIRE OLGA DE L'ÉTAPE COURANTE ---
  // Le hook gère le chargement, l'annulation des requêtes obsolètes et le
  // repli sur l'instantané JSON Schema si OLGA est indisponible.
  const olgaForm = useOlgaForm(currentStep, isAnnotationMode);

  /** Écrit une valeur de formulaire sans capturer un `formData` périmé. */
  const handleFieldChange = (key: string, value: unknown) => {
    setFormData((previous) => ({ ...previous, [key]: value }));
  };

  useEffect(() => {
    if (!rawUrl) return;
    const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:8002";
    const finalTileSource = rawUrl.startsWith("http")
      ? rawUrl
      : `${baseUrl}/dzi_data/${rawUrl}`;

    if (viewerRef.current) viewerRef.current.destroy();

    try {
      const viewer = OpenSeadragon({
        id: "openseadragon-viewer",
        prefixUrl: "https://openseadragon.github.io/openseadragon/images/",
        tileSources: finalTileSource,
        showNavigator: !isAnnotationMode,
        animationTime: 0.5,
        blendTime: 0.1,
        maxZoomPixelRatio: 10,
        gestureSettingsMouse: { clickToZoom: false },
        crossOriginPolicy: "Anonymous",
        showHomeControl: false,
        visibilityRatio: 0,
        constrainDuringPan: false,
        minZoomImageRatio: 0,
      });

      viewerRef.current = viewer;

      const updateOverlay = () => setRedrawToken((n) => n + 1);
      viewer.addHandler("animation", updateOverlay);
      viewer.addHandler("update-viewport", updateOverlay);
      viewer.addHandler("resize", updateOverlay);
      viewer.setMouseNavEnabled(true);

      if (initialROI && initialROI.w > 0) {
        viewer.addHandler("open", function () {
          const roiRect = viewer.viewport.imageToViewportRectangle(
            initialROI.x,
            initialROI.y,
            initialROI.w,
            initialROI.h,
          );
          viewer.viewport.fitBounds(roiRect, true);

          if (isAnnotationMode) {
            setTimeout(() => {
              const homeZoom = viewer.viewport.getZoom();
              const minZoom = homeZoom;
              const maxZoom = Math.max(2.5, homeZoom * 8);

              // `minZoomLevel` / `maxZoomLevel` sont documentées comme options
              // du constructeur ; OpenSeadragon les lit aussi sur le viewport,
              // mais ses types ne les déclarent pas.
              const zoomBounds = viewer.viewport as OpenSeadragon.Viewport & {
                minZoomLevel: number;
                maxZoomLevel: number;
              };
              zoomBounds.minZoomLevel = minZoom;
              zoomBounds.maxZoomLevel = maxZoom;

              viewer.addHandler("animation", () => {
                const bounds = roiRect;
                const current = viewer.viewport.getBounds();
                let newX = current.x;
                let newY = current.y;
                if (current.width >= bounds.width)
                  newX = bounds.x + (bounds.width - current.width) / 2;
                else
                  newX = Math.max(
                    bounds.x,
                    Math.min(newX, bounds.x + bounds.width - current.width),
                  );

                if (current.height >= bounds.height)
                  newY = bounds.y + (bounds.height - current.height) / 2;
                else
                  newY = Math.max(
                    bounds.y,
                    Math.min(newY, bounds.y + bounds.height - current.height),
                  );

                if (newX !== current.x || newY !== current.y) {
                  viewer.viewport.fitBounds(
                    new OpenSeadragon.Rect(
                      newX,
                      newY,
                      current.width,
                      current.height,
                    ),
                    true,
                  );
                }
              });
            }, 100);
          }
        });
      }
    } catch (e) {
      console.error("Erreur OSD:", e);
    }
    return () => {
      if (viewerRef.current) viewerRef.current.destroy();
    };
  }, [rawUrl, isAnnotationMode, initialROI]);

  useEffect(() => {
    if (viewerRef.current) {
      const canPan =
        currentTool === "move" &&
        movingShapeIndex === null &&
        movingTextIndex === null;
      viewerRef.current.setMouseNavEnabled(canPan);
    }
  }, [currentTool, movingShapeIndex, movingTextIndex]);

  const getShapeBounds = (shape: Shape) => {
    let minX = shape.x,
      maxX = shape.x,
      minY = shape.y,
      maxY = shape.y;
    if (shape.type === "rect") {
      maxX = shape.x + (shape.w || 0);
      maxY = shape.y + (shape.h || 0);
    } else if (shape.type === "circle") {
      minX = shape.x - (shape.radius || 0);
      maxX = shape.x + (shape.radius || 0);
      minY = shape.y - (shape.radius || 0);
      maxY = shape.y + (shape.radius || 0);
    } else if (
      shape.type === "polygon" &&
      shape.points &&
      shape.points.length > 0
    ) {
      minX = shape.points[0].x;
      maxX = shape.points[0].x;
      minY = shape.points[0].y;
      maxY = shape.points[0].y;
      shape.points.forEach((p) => {
        if (p.x < minX) minX = p.x;
        if (p.x > maxX) maxX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.y > maxY) maxY = p.y;
      });
    }
    const cx = minX + (maxX - minX) / 2;
    const cy = minY + (maxY - minY) / 2;
    return { minX, maxX, minY, maxY, cx, cy };
  };

  const handleAiAnalysis = async () => {
    let targetShapeIndex = shapes.length > 0 ? shapes.length - 1 : -1;
    if (selectedShapeIndex !== null && selectedShapeIndex < shapes.length) {
      targetShapeIndex = selectedShapeIndex;
    }

    const shape =
      targetShapeIndex >= 0
        ? shapes[targetShapeIndex]
        : { type: "rect" as ToolType, x: 5000, y: 5000, w: 1000, h: 1000 };

    const { minX, minY, maxX, maxY } = getShapeBounds(shape);
    const cropX = Math.round(minX);
    const cropY = Math.round(minY);
    const cropW = Math.round(
      shape.type === "rect" ? shape.w || 1000 : maxX - minX,
    );
    const cropH = Math.round(
      shape.type === "rect" ? shape.h || 1000 : maxY - minY,
    );

    if (cropW > 1500 || cropH > 1500) {
      setAiSuggestion(
        "❌ La zone est trop vaste. L'IA requiert un patch plus petit (max 1500x1500px).",
      );
      setShowSidebar(true);
      return;
    }

    setLoading(true);
    setAiSuggestion(`L'IA InstanSeg analyse la zone sélectionnée...`);
    setAiContours([]);
    setShowSidebar(true);

    const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:8002";

    const payload = {
      filename: defaultDziFilename || "biopsie_cmu_1.dzi",
      x: cropX,
      y: cropY,
      width: cropW,
      height: cropH,
      patient_folder: folderId,
      patient_name: patientName,
      annotation_label: labelInput,
      extraction_id: extractionId,
    };

    try {
      const response = await fetch(`${baseUrl}/analyze-ai`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const data = (await response.json()) as InstanSegResult;
        setAiSuggestion(data.suggestion);

        const contours = (data.contour_points || [])
          .filter(
            (blob) => Array.isArray(blob.points) && blob.points.length > 2,
          )
          .map((blob) => ({
            color: blob.color || "#10b981",
            points: (blob.points || []).map((p) => ({
              x: p.x + cropX,
              y: p.y + cropY,
            })),
          }));

        setAiContours(contours);
      } else {
        setAiSuggestion(
          "❌ L'IA a rencontré une erreur (la zone est peut-être trop vaste pour la mémoire).",
        );
        setAiContours([]);
      }
    } catch {
      setAiSuggestion(
        "❌ Erreur de connexion avec le serveur d'Intelligence Artificielle.",
      );
      setAiContours([]);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadSnapshot = () => {
    const node = containerRef.current;
    if (!node) return;
    domtoimage
      .toJpeg(node, {
        quality: 0.95,
        filter: (node: Node) => {
          if (
            node instanceof HTMLElement &&
            node.classList.contains("ui-layer")
          )
            return false;
          return true;
        },
      })
      .then((dataUrl: string) => {
        const link = document.createElement("a");
        link.download = `annotation_${patientName}.jpg`;
        link.href = dataUrl;
        link.click();
      });
  };

  const handleUndo = () => {
    const myShapes = shapes
      .map((s, i) => ({ ...s, originalIndex: i }))
      .filter((s) => s.author === currentUser || !s.author);
    if (myShapes.length === 0) return;
    const lastMyShape = myShapes[myShapes.length - 1];
    const newShapes = shapes.filter((_, i) => i !== lastMyShape.originalIndex);
    setShapes(newShapes);
  };

  const handleDeleteAll = () => {
    if (confirm("Voulez-vous supprimer VOS annotations ?")) {
      setShapes((prev) => prev.filter((s) => s.author !== currentUser));
      setSelectedShapeIndex(null);
      setAiContours([]);
    }
  };

  const handleZoomBy = (factor: number) => {
    if (!viewerRef.current) return;
    const viewport = viewerRef.current.viewport;
    const center = viewport.getCenter();
    viewport.zoomBy(factor, center);
    viewport.applyConstraints();
  };

  const handleZoomIn = () => handleZoomBy(1.15);
  const handleZoomOut = () => handleZoomBy(0.85);

  const getCoords = (e: React.MouseEvent) => {
    const rect = document
      .getElementById("osd-container")!
      .getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const handleTextMouseDown = (e: React.MouseEvent, index: number) => {
    if (currentTool !== "move") return;
    if (shapes[index].author && shapes[index].author !== currentUser) return;
    e.stopPropagation();
    e.preventDefault();
    setMovingTextIndex(index);
    const { x, y } = getCoords(e);
    setDragStart({ x, y });
  };

  const handleShapeMouseDown = (e: React.MouseEvent, index: number) => {
    setSelectedShapeIndex(index);

    if (currentTool === "text") {
      e.stopPropagation();
      e.preventDefault();
      const { x, y } = getCoords(e);
      setPendingTextPos({ x, y });
      setTextValue("");
      return;
    }

    if (currentTool !== "move") return;
    if (shapes[index].author && shapes[index].author !== currentUser) return;

    if (shapes[index].type !== "text") {
      return;
    }

    e.stopPropagation();
    e.preventDefault();
    setMovingShapeIndex(index);
    const { x, y } = getCoords(e);
    setDragStart({ x, y });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (movingShapeIndex !== null || movingTextIndex !== null) return;
    if (!viewerRef.current) return;
    if (editingShapeIndex !== null) return;

    if (currentTool === "move" && !pendingTextPos) {
      setSelectedShapeIndex(null);
      return;
    }

    const { x, y } = getCoords(e);

    if (currentTool === "text") {
      setPendingTextPos({ x, y });
      setTextValue("");
      return;
    }

    if (currentTool === "polygon") {
      setPolyPoints((prev) => [...prev, { x, y }]);
      return;
    }

    setDragStart({ x, y });
    setCurrentDragShape({ type: currentTool, x, y, w: 0, h: 0 });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragStart) return;
    const { x: currentX, y: currentY } = getCoords(e);

    if (movingTextIndex !== null && viewerRef.current) {
      const shape = shapes[movingTextIndex];
      const pStart = viewerRef.current.viewport.viewerElementToImageCoordinates(
        new OpenSeadragon.Point(dragStart.x, dragStart.y),
      );
      const pEnd = viewerRef.current.viewport.viewerElementToImageCoordinates(
        new OpenSeadragon.Point(currentX, currentY),
      );
      const deltaX = pEnd.x - pStart.x;
      const deltaY = pEnd.y - pStart.y;

      let newOffsetX = (shape.textOffsetX || 0) + deltaX;
      let newOffsetY = (shape.textOffsetY || 0) + deltaY;

      const { minX, maxX, minY, maxY, cx, cy } = getShapeBounds(shape);
      const padding = 0.05;
      const pMinX = minX - padding;
      const pMaxX = maxX + padding;
      const pMinY = minY - padding;
      const pMaxY = maxY + padding;

      let absoluteTextX = cx + newOffsetX;
      let absoluteTextY = cy + newOffsetY;

      if (
        absoluteTextX > pMinX &&
        absoluteTextX < pMaxX &&
        absoluteTextY > pMinY &&
        absoluteTextY < pMaxY
      ) {
        const distLeft = absoluteTextX - pMinX;
        const distRight = pMaxX - absoluteTextX;
        const distTop = absoluteTextY - pMinY;
        const distBottom = pMaxY - absoluteTextY;

        const minDist = Math.min(distLeft, distRight, distTop, distBottom);

        if (minDist === distLeft) absoluteTextX = pMinX;
        else if (minDist === distRight) absoluteTextX = pMaxX;
        else if (minDist === distTop) absoluteTextY = pMinY;
        else if (minDist === distBottom) absoluteTextY = pMaxY;

        newOffsetX = absoluteTextX - cx;
        newOffsetY = absoluteTextY - cy;
      }

      const newShapes = [...shapes];
      newShapes[movingTextIndex] = {
        ...shape,
        textOffsetX: newOffsetX,
        textOffsetY: newOffsetY,
      };
      setShapes(newShapes);
      setDragStart({ x: currentX, y: currentY });
      return;
    }

    if (movingShapeIndex !== null && viewerRef.current) {
      const shape = shapes[movingShapeIndex];

      if (shape.type === "text") {
        const pStart =
          viewerRef.current.viewport.viewerElementToImageCoordinates(
            new OpenSeadragon.Point(dragStart.x, dragStart.y),
          );
        const pEnd = viewerRef.current.viewport.viewerElementToImageCoordinates(
          new OpenSeadragon.Point(currentX, currentY),
        );
        const deltaX = pEnd.x - pStart.x;
        const deltaY = pEnd.y - pStart.y;

        const currentW = shape.w != null && shape.w !== 0 ? shape.w : shape.x;
        const currentH = shape.h != null && shape.h !== 0 ? shape.h : shape.y;

        const newShapes = [...shapes];
        newShapes[movingShapeIndex] = {
          ...shape,
          w: currentW + deltaX,
          h: currentH + deltaY,
        };
        setShapes(newShapes);
        setDragStart({ x: currentX, y: currentY });
      }
      return;
    }

    if (currentDragShape) {
      const w = Math.abs(currentX - dragStart.x);
      const h = Math.abs(currentY - dragStart.y);
      const x = Math.min(currentX, dragStart.x);
      const y = Math.min(currentY, dragStart.y);
      let radius = 0;
      if (currentTool === "circle")
        radius = Math.sqrt(
          Math.pow(currentX - dragStart.x, 2) +
            Math.pow(currentY - dragStart.y, 2),
        );
      setCurrentDragShape({ ...currentDragShape, x, y, w, h, radius });
    }
  };

  const handleMouseUp = () => {
    if (movingShapeIndex !== null) {
      setMovingShapeIndex(null);
      setDragStart(null);
      return;
    }
    if (movingTextIndex !== null) {
      setMovingTextIndex(null);
      setDragStart(null);
      return;
    }

    if (currentTool === "polygon") return;
    if (!currentDragShape || !viewerRef.current) {
      setDragStart(null);
      setCurrentDragShape(null);
      return;
    }
    const p1 = viewerRef.current.viewport.viewerElementToImageCoordinates(
      new OpenSeadragon.Point(currentDragShape.x, currentDragShape.y),
    );
    const eligibleW = currentDragShape.w ?? 0;
    const eligibleH = currentDragShape.h ?? 0;
    const p2 = viewerRef.current.viewport.viewerElementToImageCoordinates(
      new OpenSeadragon.Point(
        currentDragShape.x + eligibleW,
        currentDragShape.y + eligibleH,
      ),
    );

    const newShape: Shape = {
      type: currentTool,
      x: p1.x,
      y: p1.y,
      w: p2.x - p1.x,
      h: p2.y - p1.y,
      radius: viewerRef.current.viewport.deltaPointsFromPixels(
        new OpenSeadragon.Point(currentDragShape.radius || 0, 0),
      ).x,
      author: currentUser,
    };

    if (
      (newShape.w && newShape.w > 5) ||
      (newShape.radius && newShape.radius > 5)
    ) {
      setShapes((prev) => {
        const next = [...prev, newShape];
        setSelectedShapeIndex(next.length - 1);
        return next;
      });
      if (!isAnnotationMode) {
        setCurrentTool("move");
        setShowSidebar(true);
      }
    }
    setDragStart(null);
    setCurrentDragShape(null);
  };

  const handleDoubleClick = () => {
    if (
      currentTool === "polygon" &&
      polyPoints.length > 2 &&
      viewerRef.current
    ) {
      const imagePoints = polyPoints.map((p) => {
        const pt = viewerRef.current!.viewport.viewerElementToImageCoordinates(
          new OpenSeadragon.Point(p.x, p.y),
        );
        return { x: pt.x, y: pt.y };
      });
      setShapes((prev) => {
        const next = [
          ...prev,
          {
            type: "polygon" as ToolType,
            x: 0,
            y: 0,
            w: 0,
            h: 0,
            points: imagePoints,
            author: currentUser,
          },
        ];
        setSelectedShapeIndex(next.length - 1);
        return next;
      });
      setPolyPoints([]);
    }
  };

  const confirmText = () => {
    if (editingShapeIndex !== null) {
      const newShapes = [...shapes];
      if (textValue.trim() !== "") {
        newShapes[editingShapeIndex].text = textValue;
        if (newShapes[editingShapeIndex].textOffsetX === undefined) {
          const { minY, cy } = getShapeBounds(newShapes[editingShapeIndex]);
          newShapes[editingShapeIndex].textOffsetX = 0;
          newShapes[editingShapeIndex].textOffsetY = minY - cy - 0.05;
        }
      } else {
        if (newShapes[editingShapeIndex].type === "text") {
          newShapes.splice(editingShapeIndex, 1);
        }
      }
      setShapes(newShapes);
      setEditingShapeIndex(null);
      setTextValue("");
      setCurrentTool("move");
      return;
    }

    if (pendingTextPos && textValue.trim() !== "" && viewerRef.current) {
      const ptAnchor =
        viewerRef.current.viewport.viewerElementToImageCoordinates(
          new OpenSeadragon.Point(pendingTextPos.x, pendingTextPos.y),
        );

      const ptText = viewerRef.current.viewport.viewerElementToImageCoordinates(
        new OpenSeadragon.Point(pendingTextPos.x + 60, pendingTextPos.y - 60),
      );

      setShapes((prev) => [
        ...prev,
        {
          type: "text",
          x: ptAnchor.x,
          y: ptAnchor.y,
          w: ptText.x,
          h: ptText.y,
          text: textValue,
          author: currentUser,
        },
      ]);
    }
    setPendingTextPos(null);
    setCurrentTool("move");
  };

  const startEditingText = (index: number) => {
    if (shapes[index].author && shapes[index].author !== currentUser) return;
    setEditingShapeIndex(index);
    setTextValue(shapes[index].text || "");
  };

  const renderShapesBackground = () => {
    if (!viewerRef.current) return null;
    return shapes.map((shape, idx) => {
      if (shape.type === "text") return null;

      const p1 = viewerRef.current!.viewport.imageToViewerElementCoordinates(
        new OpenSeadragon.Point(shape.x, shape.y),
      );
      const p2 = viewerRef.current!.viewport.imageToViewerElementCoordinates(
        new OpenSeadragon.Point(
          shape.x + (shape.w || 0),
          shape.y + (shape.h || 0),
        ),
      );
      const sx = p1.x,
        sy = p1.y,
        sw = p2.x - p1.x,
        sh = p2.y - p1.y;

      const isMe = shape.author === currentUser;
      const strokeColor = isMe ? "#10b981" : "#f59e0b";
      const fillColor = isMe
        ? "rgba(16, 185, 129, 0.3)"
        : "rgba(245, 158, 11, 0.3)";

      const cursorStyleShape = currentTool === "text" ? "crosshair" : "default";

      const isSelected = idx === selectedShapeIndex;
      const strokeW = isSelected ? "5" : "3";

      if (shape.type === "rect") {
        return (
          <rect
            key={`bg-${idx}`}
            x={sx}
            y={sy}
            width={sw}
            height={sh}
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth={strokeW}
            strokeDasharray={isSelected ? "8" : "0"}
            onMouseDown={(e) => handleShapeMouseDown(e, idx)}
            style={{ cursor: cursorStyleShape, pointerEvents: "auto" }}
          />
        );
      }
      if (shape.type === "circle") {
        const pr = viewerRef.current!.viewport.deltaPixelsFromPoints(
          new OpenSeadragon.Point(shape.radius || 0, 0),
        );
        return (
          <circle
            key={`bg-${idx}`}
            cx={sx}
            cy={sy}
            r={pr.x}
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth={strokeW}
            strokeDasharray={isSelected ? "8" : "0"}
            onMouseDown={(e) => handleShapeMouseDown(e, idx)}
            style={{ cursor: cursorStyleShape, pointerEvents: "auto" }}
          />
        );
      }
      if (shape.type === "polygon" && shape.points) {
        const pts = shape.points
          .map((pt) => {
            const s =
              viewerRef.current!.viewport.imageToViewerElementCoordinates(
                new OpenSeadragon.Point(pt.x, pt.y),
              );
            return `${s.x},${s.y}`;
          })
          .join(" ");
        return (
          <polygon
            key={`bg-${idx}`}
            points={pts}
            fill={fillColor}
            stroke={strokeColor}
            strokeWidth={strokeW}
            strokeDasharray={isSelected ? "8" : "0"}
            onMouseDown={(e) => handleShapeMouseDown(e, idx)}
            style={{ cursor: cursorStyleShape, pointerEvents: "auto" }}
          />
        );
      }
      return null;
    });
  };

  const renderAiPoints = () => {
    if (!viewerRef.current || aiContours.length === 0 || !showAiPoints)
      return null;

    return aiContours.map((contour, idx) => {
      try {
        const pts = contour.points
          .map((pt) => {
            const s =
              viewerRef.current!.viewport.imageToViewerElementCoordinates(
                new OpenSeadragon.Point(pt.x, pt.y),
              );
            return `${s.x},${s.y}`;
          })
          .join(" ");

        return (
          <polygon
            key={`ia-contour-${idx}`}
            points={pts}
            fill={
              contour.color ? `${contour.color}33` : "rgba(16, 185, 129, 0.2)"
            }
            stroke={contour.color || "#10b981"}
            strokeWidth="1"
            style={{
              pointerEvents: "none",
              filter: "drop-shadow(0 0 3px rgba(0,0,0,0.5))",
            }}
          />
        );
      } catch {
        // Contour illisible : on ignore ce blob plutôt que de casser le calque.
        return null;
      }
    });
  };

  const renderTextOverlays = () => {
    if (!viewerRef.current) return null;
    return shapes.map((shape, idx) => {
      const isMe = shape.author === currentUser;
      const strokeColor = isMe ? "#10b981" : "#f59e0b";
      const textColor = isMe ? "#facc15" : "#f87171";

      if (shape.type === "text") {
        if (editingShapeIndex === idx || !showTexts || !shape.text) return null;

        const pAnchor =
          viewerRef.current!.viewport.imageToViewerElementCoordinates(
            new OpenSeadragon.Point(shape.x, shape.y),
          );
        const isTextMoved =
          shape.w != null &&
          shape.h != null &&
          (shape.w !== 0 || shape.h !== 0);
        const tX = isTextMoved ? shape.w! : shape.x;
        const tY = isTextMoved ? shape.h! : shape.y;
        const pText =
          viewerRef.current!.viewport.imageToViewerElementCoordinates(
            new OpenSeadragon.Point(tX, tY),
          );

        const textWidth = shape.text.length * 10 + 24;

        return (
          <g key={`fg-${idx}`}>
            <line
              x1={pAnchor.x}
              y1={pAnchor.y}
              x2={pText.x}
              y2={pText.y}
              stroke={strokeColor}
              strokeWidth="2"
              strokeDasharray="4"
              style={{ pointerEvents: "none", opacity: 0.8 }}
            />
            <circle cx={pAnchor.x} cy={pAnchor.y} r="4" fill={strokeColor} />

            <text
              x={pText.x}
              y={pText.y - 20}
              fill={strokeColor}
              fontSize="12"
              fontWeight="bold"
              textAnchor="middle"
              style={{ pointerEvents: "none", textShadow: "1px 1px 2px black" }}
            >
              {shape.author}
            </text>

            <rect
              x={pText.x - textWidth / 2}
              y={pText.y - 13}
              width={textWidth}
              height="26"
              fill="rgba(15, 23, 42, 0.8)"
              rx="6"
              style={{ pointerEvents: "none" }}
            />

            <text
              x={pText.x}
              y={pText.y}
              fill={textColor}
              fontSize="16"
              fontWeight="bold"
              textAnchor="middle"
              alignmentBaseline="middle"
              onMouseDown={(e) => handleShapeMouseDown(e, idx)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                startEditingText(idx);
              }}
              style={{
                textShadow: "2px 2px 4px black",
                cursor: isMe && currentTool === "move" ? "grab" : "crosshair",
                pointerEvents: "auto",
                userSelect: "none",
              }}
            >
              {shape.text}
            </text>
          </g>
        );
      } else {
        const p1 = viewerRef.current!.viewport.imageToViewerElementCoordinates(
          new OpenSeadragon.Point(shape.x, shape.y),
        );
        let authorX = p1.x,
          authorY = p1.y;
        if (shape.type === "circle") {
          const pr = viewerRef.current!.viewport.deltaPixelsFromPoints(
            new OpenSeadragon.Point(shape.radius || 0, 0),
          );
          authorX -= pr.x;
          authorY -= pr.x;
        } else if (
          shape.type === "polygon" &&
          shape.points &&
          shape.points.length > 0
        ) {
          const sFirst =
            viewerRef.current!.viewport.imageToViewerElementCoordinates(
              new OpenSeadragon.Point(shape.points[0].x, shape.points[0].y),
            );
          authorX = sFirst.x;
          authorY = sFirst.y;
        }

        const authorNode =
          shape.author && showTexts ? (
            <text
              x={authorX}
              y={authorY - 5}
              fill={strokeColor}
              fontSize="14"
              fontWeight="bold"
              style={{ pointerEvents: "none", textShadow: "1px 1px 2px black" }}
            >
              {shape.author}
            </text>
          ) : null;

        let attachedNode = null;
        if (showTexts && shape.text && editingShapeIndex !== idx) {
          const { cx, cy, minY } = getShapeBounds(shape);

          let offsetX = shape.textOffsetX;
          let offsetY = shape.textOffsetY;

          if (offsetX === undefined || offsetY === undefined) {
            offsetX = 0;
            offsetY = minY - cy - 0.05;
          }

          const textImgX = cx + offsetX;
          const textImgY = cy + offsetY;

          const ptCenterScreen =
            viewerRef.current!.viewport.imageToViewerElementCoordinates(
              new OpenSeadragon.Point(cx, cy),
            );
          const ptTextScreen =
            viewerRef.current!.viewport.imageToViewerElementCoordinates(
              new OpenSeadragon.Point(textImgX, textImgY),
            );

          const textWidth = shape.text.length * 9 + 20;

          attachedNode = (
            <g>
              <line
                x1={ptCenterScreen.x}
                y1={ptCenterScreen.y}
                x2={ptTextScreen.x}
                y2={ptTextScreen.y}
                stroke={textColor}
                strokeWidth="2"
                strokeDasharray="6,4"
                style={{ pointerEvents: "none", opacity: 0.8 }}
              />
              <rect
                x={ptTextScreen.x - textWidth / 2}
                y={ptTextScreen.y - 15}
                width={textWidth}
                height="30"
                fill="rgba(15, 23, 42, 0.7)"
                rx="6"
                style={{ pointerEvents: "none" }}
              />
              <text
                x={ptTextScreen.x}
                y={ptTextScreen.y}
                fill={textColor}
                fontSize="16"
                fontWeight="bold"
                textAnchor="middle"
                alignmentBaseline="middle"
                onMouseDown={(e) => handleTextMouseDown(e, idx)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  startEditingText(idx);
                }}
                style={{
                  cursor: isMe && currentTool === "move" ? "grab" : "pointer",
                  pointerEvents: "auto",
                  userSelect: "none",
                }}
              >
                {shape.text}
              </text>
            </g>
          );
        }

        if (authorNode || attachedNode) {
          return (
            <g key={`fg-${idx}`}>
              {authorNode}
              {attachedNode}
            </g>
          );
        }
        return null;
      }
    });
  };

  useEffect(() => {
    if (extractionId) {
      setLoading(true);
      const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:8002";
      fetch(`${baseUrl}/extractions/${extractionId}/details`)
        .then((res) => res.json())
        .then((data) => {
          if (data.drawings) {
            setShapes(data.drawings);
          }
          if (data) {
            // Les valeurs du formulaire viennent désormais du moteur de
            // workflow ; on ne garde ici que le libellé de l'extraction.
            setLabelInput(data.annotation_label || data.name || data.filename || "Extraction");
          }
        })
        .catch((err) => console.error("Erreur chargement:", err))
        .finally(() => setLoading(false));
    }
  }, [extractionId]);

  const handleGoToExtraction = () => {
    setShowSuccessModal(false);
    if (newExtractionId) {
      navigate(`/viewer?url=${encodeURIComponent(defaultDziFilename || "")}`, {
        state: {
          patientName: patientName,
          folderId: folderId,
          image_url: defaultDziFilename,
          extractionId: newExtractionId,
          roi: shapes[0],
        },
      });
    } else {
      setShowSidebar(false);
    }
  };

  const handleStayOnImage = () => {
    setShowSuccessModal(false);
    setShowSidebar(false);
  };

  // --- NAVIGATION DU WORKFLOW ---
  // « Suivant » persiste l'étape puis laisse le serveur décider de la
  // transition : si elle est refusée, l'interface ne bouge pas.
  const handleNextWorkflowStep = async () => {
    const fields = olgaForm.schema?.["x-order"] ?? [];
    const stepData = Object.fromEntries(
      fields.map((field) => [field, formValues[field] ?? ""]),
    );
    const saved = await workflow.saveCurrentStep(stepData, true);
    if (saved) setFormData({});
  };

  const handlePrevWorkflowStep = () => {
    void workflow.goBack();
  };

  const handleSaveAction = async () => {
    if (!shapes.length && !extractionId) return;
    setLoading(true);
    const baseUrl = import.meta.env.VITE_API_URL || "http://localhost:8002";
    const shape = shapes.length > 0 ? shapes[0] : { x: 0, y: 0, w: 0, h: 0 };

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
      owner: currentUser,
      drawings: shapes,
      prelevement_type: formValues.prelevementType || "",
      prelevement_date: formValues.prelevementDate || null,
      block_number: formValues.blockNumber || "",
      fixation: formValues.fixation || "",
      slide_count: formValues.slideCount
        ? parseInt(String(formValues.slideCount), 10)
        : null,
      staining: Array.isArray(formValues.staining)
        ? formValues.staining
        : formValues.staining
          ? [formValues.staining]
          : [],
      macro_obs: formValues.macroObs || "",
      micro_obs: formValues.microObs || "",
      histo_type: formValues.histoType || "",
      sbr_grade: formValues.sbrGrade || "",
      margins: formValues.margins || "",
      hormonal_receptors: formValues.hormonalReceptors || "",
      diagnosis: formValues.diagnosis || "",
      comments: formValues.comments || "",
      status: formValues.status || "en_analyse",
      pathologist: formValues.pathologist || "",
      validation_date: formValues.validationDate || null,
    };

    try {
      const url = isAnnotationMode
        ? `${baseUrl}/annotations/save`
        : `${baseUrl}/extract-roi`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();

      if (res.ok) {
        if (!isAnnotationMode) {
          if (data && data.extraction_id)
            setNewExtractionId(data.extraction_id);
          else if (data && data.id) setNewExtractionId(data.id);
          setShowSuccessModal(true);
        } else {
          alert("✅ Dossier mis à jour !");
          navigate("/dashboard");
        }
      } else {
        // Le backend renvoie `{ detail }` : l'afficher évite un « Erreur
        // serveur » opaque qui n'indique ni la cause ni la marche à suivre.
        const detail =
          typeof data?.detail === "string"
            ? data.detail
            : typeof data?.detail?.message === "string"
              ? data.detail.message
              : `Le serveur a répondu ${res.status}.`;
        alert(`Échec de l'enregistrement : ${detail}`);
      }
    } catch (error) {
      alert(
        `Serveur injoignable : ${error instanceof Error ? error.message : "vérifiez que le backend tourne sur le port 8002."}`,
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-screen w-screen bg-black overflow-hidden flex font-sans text-white select-none">
      <div
        id="osd-container"
        className="relative flex-grow h-full bg-black overflow-hidden"
        ref={containerRef}
      >
        <div
          id="openseadragon-viewer"
          className="absolute inset-0 z-0 bg-black"
        />

        {/* Calque SVG */}
        <div
          className={`absolute inset-0 z-10 ${currentTool === "move" && !pendingTextPos && movingShapeIndex === null && movingTextIndex === null ? "pointer-events-none" : "cursor-crosshair pointer-events-auto"}`}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onDoubleClick={handleDoubleClick}
        >
          <svg className="w-full h-full">
            {renderShapesBackground()}
            {renderAiPoints()}
            {renderTextOverlays()}

            {/* Formes en cours de dessin */}
            {currentDragShape && currentTool === "rect" && (
              <rect
                x={currentDragShape.x}
                y={currentDragShape.y}
                width={currentDragShape.w}
                height={currentDragShape.h}
                fill="rgba(239, 68, 68, 0.3)"
                stroke="#ef4444"
                strokeWidth="2"
              />
            )}
            {currentDragShape && currentTool === "circle" && (
              <circle
                cx={currentDragShape.x}
                cy={currentDragShape.y}
                r={currentDragShape.radius}
                fill="rgba(239, 68, 68, 0.3)"
                stroke="#ef4444"
                strokeWidth="2"
              />
            )}
            {currentTool === "polygon" && (
              <polyline
                points={polyPoints.map((p) => `${p.x},${p.y}`).join(" ")}
                fill="none"
                stroke="#f59e0b"
                strokeWidth="2"
              />
            )}
          </svg>

          {/* Input Création Nouveau Texte */}
          {pendingTextPos && (
            <div
              className="absolute bg-slate-800 p-2 rounded-lg shadow-xl border border-slate-600 flex gap-2 pointer-events-auto z-50"
              style={{ left: pendingTextPos.x, top: pendingTextPos.y }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              <input
                autoFocus
                type="text"
                value={textValue}
                onChange={(e) => setTextValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && confirmText()}
                className="bg-slate-900 text-white border border-slate-700 rounded px-2 py-1 outline-none"
              />
              <button
                onClick={confirmText}
                className="bg-emerald-600 text-white px-2 rounded"
              >
                {" "}
                OK{" "}
              </button>
            </div>
          )}

          {/* Input Édition Texte Existant */}
          {editingShapeIndex !== null &&
            viewerRef.current &&
            (() => {
              const shape = shapes[editingShapeIndex];
              let pt;

              if (shape.type === "text") {
                pt = viewerRef.current.viewport.imageToViewerElementCoordinates(
                  new OpenSeadragon.Point(shape.x, shape.y),
                );
              } else {
                const { cx, cy, minY } = getShapeBounds(shape);
                const offsetX =
                  shape.textOffsetX !== undefined ? shape.textOffsetX : 0;
                const offsetY =
                  shape.textOffsetY !== undefined
                    ? shape.textOffsetY
                    : minY - cy - 0.05;
                pt = viewerRef.current.viewport.imageToViewerElementCoordinates(
                  new OpenSeadragon.Point(cx + offsetX, cy + offsetY),
                );
              }

              return (
                <div
                  className="absolute bg-slate-800 p-2 rounded-lg shadow-xl border border-blue-500 flex gap-2 pointer-events-auto z-50"
                  style={{ left: pt.x - 50, top: pt.y - 20 }}
                  onMouseDown={(e) => e.stopPropagation()}
                >
                  <input
                    autoFocus
                    type="text"
                    value={textValue}
                    onChange={(e) => setTextValue(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && confirmText()}
                    className="bg-slate-900 text-white border border-slate-700 rounded px-2 py-1 outline-none"
                  />
                  <button
                    onClick={confirmText}
                    className="bg-blue-600 text-white px-2 rounded"
                  >
                    {" "}
                    MAJ{" "}
                  </button>
                </div>
              );
            })()}
        </div>

        {/* LÉGENDE COLLABORATIVE */}
        <div
          className={`absolute top-4 transition-all duration-300 ${showSidebar ? "right-[470px]" : "right-4"} bg-slate-900/90 backdrop-blur-md border border-slate-700 p-3 rounded-xl shadow-xl pointer-events-none z-20`}
        >
          <div className="text-xs font-bold text-slate-400 mb-2 uppercase tracking-widest flex items-center gap-2">
            <PersonIcon fontSize="small" /> Collaboration
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
            <button
              onClick={() => navigate("/dashboard")}
              className="p-2 hover:bg-white/10 rounded-xl transition-colors"
            >
              {" "}
              <ArrowBackIcon />{" "}
            </button>
            <div className="pr-4 border-r border-white/10">
              <h1 className="font-bold text-sm text-white">{patientName}</h1>
              <div className="text-xs text-emerald-400 font-mono">
                {" "}
                ID: {folderId}{" "}
              </div>
            </div>
          </div>

          <div className="pointer-events-auto bg-slate-800/90 backdrop-blur-md border border-slate-600 rounded-2xl p-1.5 flex gap-2 shadow-2xl">
            <button
              onClick={() => setCurrentTool("move")}
              className={`p-3 rounded-xl transition-all ${currentTool === "move" ? "bg-indigo-600 text-white" : "text-slate-400 hover:text-white"}`}
              title="Déplacer"
            >
              {" "}
              <PanToolIcon />{" "}
            </button>
            <button
              onClick={handleZoomIn}
              className="p-3 rounded-xl transition-all text-slate-400 hover:text-white"
              title="Zoom +"
            >
              {" "}
              <ZoomInIcon />{" "}
            </button>
            <button
              onClick={handleZoomOut}
              className="p-3 rounded-xl transition-all text-slate-400 hover:text-white"
              title="Zoom -"
            >
              {" "}
              <ZoomOutIcon />{" "}
            </button>
            <div className="w-px bg-white/10 mx-1 my-2"></div>
            <button
              onClick={() => setCurrentTool("rect")}
              className={`p-3 rounded-xl transition-all ${currentTool === "rect" ? "bg-emerald-600 text-white" : "text-slate-400 hover:text-emerald-400"}`}
              title="Rectangle"
            >
              {" "}
              <CropSquareIcon />{" "}
            </button>
            {isAnnotationMode && (
              <>
                <button
                  onClick={() => setCurrentTool("circle")}
                  className={`p-3 rounded-xl transition-all ${currentTool === "circle" ? "bg-blue-600 text-white" : "text-slate-400 hover:text-blue-400"}`}
                  title="Cercle"
                >
                  {" "}
                  <RadioButtonUncheckedIcon />{" "}
                </button>
                <button
                  onClick={() => {
                    setCurrentTool("polygon");
                    setPolyPoints([]);
                  }}
                  className={`p-3 rounded-xl transition-all ${currentTool === "polygon" ? "bg-amber-600 text-white" : "text-slate-400 hover:text-amber-400"}`}
                  title="Polygone"
                >
                  {" "}
                  <PolylineIcon />{" "}
                </button>
                <button
                  onClick={() => {
                    setCurrentTool("text");
                    setPendingTextPos(null);
                  }}
                  className={`p-3 rounded-xl transition-all ${currentTool === "text" ? "bg-yellow-600 text-white" : "text-slate-400 hover:text-yellow-400"}`}
                  title="Texte isolé"
                >
                  {" "}
                  <TextFieldsIcon />{" "}
                </button>
                <div className="w-px bg-white/10 mx-1 my-2"></div>
                <button
                  onClick={() => setShowTexts(!showTexts)}
                  className={`p-3 rounded-xl transition-all ${!showTexts ? "bg-red-500/20 text-red-400" : "text-slate-400 hover:text-white"}`}
                  title="Masquer les textes"
                >
                  {" "}
                  {showTexts ? <VisibilityIcon /> : <VisibilityOffIcon />}{" "}
                </button>
              </>
            )}
          </div>

          <div className="pointer-events-auto flex gap-3">
            <button
              onClick={handleDownloadSnapshot}
              className="p-3 bg-slate-800/90 backdrop-blur-md text-white border border-slate-600 rounded-2xl hover:bg-indigo-600 transition-all shadow-lg"
            >
              {" "}
              <CameraAltIcon />{" "}
            </button>
            {shapes.length > 0 && (
              <button
                onClick={handleUndo}
                className="p-3 bg-slate-700/80 backdrop-blur-md text-white border border-slate-500 rounded-2xl hover:bg-slate-600 transition-all shadow-lg"
                title="Annuler dernier"
              >
                {" "}
                <UndoIcon />{" "}
              </button>
            )}
            {shapes.length > 0 && (
              <button
                onClick={handleDeleteAll}
                className="p-3 bg-red-500/20 text-red-400 border border-red-500/50 rounded-2xl hover:bg-red-500 hover:text-white"
              >
                {" "}
                <DeleteForeverIcon />{" "}
              </button>
            )}

            {isAnnotationMode && (
              <>
                <button
                  onClick={handleAiAnalysis}
                  disabled={loading}
                  className={`px-4 py-3 rounded-2xl font-bold flex items-center gap-2 shadow-xl transition-all ${loading ? "bg-slate-600 text-slate-300 cursor-not-allowed" : "bg-indigo-600 text-white hover:bg-indigo-500"}`}
                  title="Lance ou relance l'analyse InstanSeg"
                >
                  <SmartToyIcon />{" "}
                  {loading
                    ? "Analyse..."
                    : aiSuggestion
                      ? "Relancer IA"
                      : "Lancer IA"}
                </button>
                {aiSuggestion && (
                  <button
                    onClick={() => setShowAiPoints(!showAiPoints)}
                    className={`p-3 rounded-2xl border transition-all shadow-lg ${showAiPoints ? "bg-slate-800/90 text-cyan-400 border-slate-600 hover:bg-slate-700" : "bg-slate-700/50 text-slate-400 border-slate-600 hover:bg-slate-600"}`}
                    title={
                      showAiPoints ? "Cacher points IA" : "Afficher points IA"
                    }
                  >
                    {showAiPoints ? <VisibilityIcon /> : <VisibilityOffIcon />}
                  </button>
                )}
              </>
            )}

            <button
              onClick={() => setShowSidebar(!showSidebar)}
              className={`px-4 py-3 rounded-2xl font-bold flex items-center gap-2 shadow-xl transition-all ${showSidebar ? "bg-slate-700 text-slate-300" : "bg-emerald-600 text-white"}`}
            >
              <DescriptionIcon /> {showSidebar ? "Masquer" : "Rapport"}
            </button>
          </div>
        </div>
      </div>

      {showSuccessModal && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <div className="bg-slate-900 border border-slate-700 p-8 rounded-3xl shadow-2xl max-w-md w-full text-center relative">
            <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-6 text-emerald-400">
              {" "}
              <CheckCircleIcon style={{ fontSize: 40 }} />{" "}
            </div>
            <h2 className="text-2xl font-bold text-white mb-2">
              {" "}
              Extraction Créée !{" "}
            </h2>
            <p className="text-slate-400 mb-8">
              {" "}
              L'analyse a été enregistrée avec succès.{" "}
            </p>

            <div className="flex flex-col gap-3">
              <button
                onClick={handleGoToExtraction}
                className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/20"
              >
                {" "}
                <VisibilityIcon /> Voir l'extraction{" "}
              </button>
              <button
                onClick={handleStayOnImage}
                className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-bold rounded-xl transition-all flex items-center justify-center gap-2 border border-slate-700"
              >
                {" "}
                <DescriptionIcon /> Rester sur l'image{" "}
              </button>
            </div>
          </div>
        </div>
      )}

      {showSidebar && !showSuccessModal && (
        <div className="w-[450px] bg-slate-900 border-l border-slate-800 flex flex-col shadow-2xl z-20 animate-in slide-in-from-right duration-300">
          <div className="p-6 border-b border-slate-800 flex justify-between items-center bg-slate-950">
            <div>
              <h2 className="text-xl font-bold text-white">
                {isAnnotationMode ? "Analyse Pathologique" : "Nouvelle Extraction"}
              </h2>
              <div className="text-xs text-slate-400">Dossier: {folderId}</div>
            </div>
          </div>

          {/* RENDU SÉPARÉ : Création vs Annotation */}
          {!isAnnotationMode ? (
            // 🔴 MODE CRÉATION (Pas de formulaire OLGA ici !)
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              <div className="mb-6 pb-4 border-b border-slate-800">
                <label className="block text-xs font-bold text-emerald-400 uppercase tracking-widest mb-2 ml-1">
                  Nom de l'extraction
                </label>
                <input
                  type="text"
                  value={labelInput}
                  onChange={(e) => setLabelInput(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white font-bold text-emerald-300 focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
              <p className="text-slate-400 text-sm text-center mt-10">
                Dessinez une zone sur l'image puis cliquez sur "Créer l'extraction" pour démarrer l'analyse.
              </p>
            </div>
          ) : (
            // 🟢 MODE ANNOTATION (Formulaire OLGA + IA)
            <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
              {aiSuggestion && (
                <div className="bg-slate-800 border-2 border-emerald-500/50 shadow-lg shadow-emerald-500/20 rounded-xl p-4 mb-6 animate-in fade-in zoom-in duration-300">
                  <h3 className="text-sm font-bold text-emerald-400 flex items-center gap-2 mb-3 uppercase tracking-wider">
                    <SmartToyIcon fontSize="small" /> Analyse IA InstanSeg
                  </h3>
                  <div className="text-sm text-emerald-50 font-mono bg-slate-950 p-4 rounded-lg border border-slate-700 whitespace-pre-wrap leading-relaxed">
                    {aiSuggestion}
                  </div>
                </div>
              )}

              <div className="mb-6 pb-4 border-b border-slate-800">
                <label className="block text-xs font-bold text-emerald-400 uppercase tracking-widest mb-2 ml-1">
                  Nom de l'extraction
                </label>
                <input
                  type="text"
                  value={labelInput}
                  onChange={(e) => setLabelInput(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 text-white font-bold text-emerald-300 focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              {/* Avancement du dossier, tel que le serveur le connaît */}
              {workflow.state && (
                <WorkflowStepper
                  state={workflow.state}
                  onSelect={workflow.goToStep}
                  disabled={workflow.status === "saving"}
                />
              )}

              {workflow.error && (
                <div className="mb-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 flex items-start gap-2">
                  <p className="text-xs text-red-200 flex-1">{workflow.error}</p>
                  <button
                    type="button"
                    onClick={workflow.clearError}
                    className="text-xs text-red-200 hover:text-white"
                    aria-label="Masquer le message"
                  >
                    ✕
                  </button>
                </div>
              )}

              {/* Dossier validé : information, et non écran bloquant — le
                  formulaire de l'étape courante reste modifiable. */}
              {isWorkflowFinished && (
                <div className="mb-4 flex items-start gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3">
                  <CheckCircleIcon className="text-emerald-400" fontSize="small" />
                  <p className="text-xs text-emerald-200">
                    Les quatre étapes sont validées. Vous pouvez encore corriger
                    une étape en la sélectionnant ci-dessus, puis mettre à jour
                    le dossier.
                  </p>
                </div>
              )}

              <OlgaFormPanel
                {...olgaForm}
                values={formValues}
                onChange={handleFieldChange}
                disabled={loading || workflow.status === "saving"}
              />
            </div>
          )}

          {/* FOOTER AVEC BOUTONS (Différent selon le mode) */}
          <div className="p-6 border-t border-slate-800 bg-slate-950 flex gap-3">
            {!isAnnotationMode ? (
              // Bouton unique pour créer l'extraction
              <button
                onClick={handleSaveAction}
                disabled={loading}
                className="flex-1 py-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold hover:shadow-lg hover:shadow-emerald-500/20 transition-all flex justify-center items-center gap-2"
              >
                {loading ? "Création..." : "Créer l'extraction"}
              </button>
            ) : (
              // Boutons du workflow : l'étape reste enregistrable même une
              // fois le dossier validé, pour permettre une correction.
              <>
                {workflow.canGoBack && (
                  <button
                    onClick={handlePrevWorkflowStep}
                    disabled={workflow.status === "saving"}
                    className="py-4 px-6 rounded-xl bg-slate-800 text-white font-bold hover:bg-slate-700 transition-all flex justify-center items-center disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Retour
                  </button>
                )}

                <button
                  onClick={handleNextWorkflowStep}
                  disabled={workflow.status === "saving" || !olgaForm.schema}
                  className="flex-1 py-4 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold hover:shadow-lg hover:shadow-blue-500/20 transition-all flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {workflow.status === "saving"
                    ? "Enregistrement…"
                    : currentStep + 1 < STEP_COUNT
                      ? `Valider et continuer (${currentStep + 1}/${STEP_COUNT})`
                      : `Valider l'étape ${STEP_COUNT}/${STEP_COUNT}`}
                </button>

                {isWorkflowFinished && (
                  <button
                    onClick={handleSaveAction}
                    disabled={loading}
                    className="flex-1 py-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white font-bold hover:shadow-lg hover:shadow-emerald-500/20 transition-all flex justify-center items-center gap-2 disabled:opacity-50"
                  >
                    {loading ? "Sauvegarde..." : "Mettre à jour l'analyse"}
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}