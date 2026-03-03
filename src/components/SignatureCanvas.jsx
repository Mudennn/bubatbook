import { useRef, useState, useEffect, useCallback } from 'react';
import { Eraser, Undo2 } from 'lucide-react';

export default function SignatureCanvas({ onSignatureChange, width = 400, height = 180 }) {
  const canvasRef = useRef(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasSignature, setHasSignature] = useState(false);
  const [history, setHistory] = useState([]);

  // Resize canvas to container
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const container = canvas.parentElement;
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.min(rect.width, width);
    canvas.width = w * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#111';
  }, [width, height]);

  const getPos = useCallback((e) => {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  }, []);

  const saveHistory = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setHistory(prev => [...prev, canvas.toDataURL()]);
  }, []);

  const startDrawing = useCallback((e) => {
    e.preventDefault();
    saveHistory();
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    setIsDrawing(true);
  }, [getPos, saveHistory]);

  const draw = useCallback((e) => {
    e.preventDefault();
    if (!isDrawing) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const pos = getPos(e);
    ctx.lineTo(pos.x, pos.y);
    ctx.stroke();
  }, [isDrawing, getPos]);

  const stopDrawing = useCallback((e) => {
    if (e) e.preventDefault();
    if (!isDrawing) return;
    setIsDrawing(false);
    setHasSignature(true);
    const canvas = canvasRef.current;
    if (canvas && onSignatureChange) {
      onSignatureChange(canvas.toDataURL('image/png'));
    }
  }, [isDrawing, onSignatureChange]);

  function handleClear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
    setHasSignature(false);
    setHistory([]);
    if (onSignatureChange) onSignatureChange(null);
  }

  function handleUndo() {
    if (history.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const prev = history[history.length - 1];
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const img = new Image();
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width / dpr, canvas.height / dpr);
      ctx.drawImage(img, 0, 0, canvas.width / dpr, canvas.height / dpr);
      setHistory(h => h.slice(0, -1));
      // Check if canvas is blank
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const isBlank = !imageData.data.some((ch, i) => i % 4 === 3 && ch !== 0);
      setHasSignature(!isBlank);
      if (onSignatureChange) {
        onSignatureChange(isBlank ? null : canvas.toDataURL('image/png'));
      }
    };
    img.src = prev;
  }

  return (
    <div className="w-full">
      <div className="relative border-2 border-dashed border-white/20 rounded-xl bg-white overflow-hidden">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="cursor-crosshair touch-none w-full"
        />
        {!hasSignature && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <p className="text-slate-300 text-sm select-none">Draw your signature here</p>
          </div>
        )}
      </div>
      <div className="flex gap-2 mt-2">
        <button
          type="button"
          onClick={handleUndo}
          disabled={history.length === 0}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Undo2 className="w-3.5 h-3.5" /> Undo
        </button>
        <button
          type="button"
          onClick={handleClear}
          disabled={!hasSignature}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Eraser className="w-3.5 h-3.5" /> Clear
        </button>
      </div>
    </div>
  );
}
