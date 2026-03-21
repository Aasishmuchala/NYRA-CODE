/**
 * Full-window drag-and-drop overlay
 * Drop files anywhere → passes them to onFiles callback
 */
import React, { useEffect, useRef, useState } from 'react';
import { Upload } from 'lucide-react';
export const DragDropOverlay = ({ onFiles }) => {
    const [dragging, setDragging] = useState(false);
    const counter = useRef(0);
    useEffect(() => {
        const onDragEnter = (e) => {
            e.preventDefault();
            counter.current++;
            if (e.dataTransfer?.items && e.dataTransfer.items.length > 0)
                setDragging(true);
        };
        const onDragLeave = () => {
            counter.current--;
            if (counter.current === 0)
                setDragging(false);
        };
        const onDragOver = (e) => e.preventDefault();
        const onDrop = async (e) => {
            e.preventDefault();
            counter.current = 0;
            setDragging(false);
            const files = Array.from(e.dataTransfer?.files ?? []);
            const results = [];
            for (const file of files) {
                const buf = await file.arrayBuffer();
                const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
                results.push({ name: file.name, mimeType: file.type || 'application/octet-stream', content: b64 });
            }
            if (results.length > 0)
                onFiles(results);
        };
        window.addEventListener('dragenter', onDragEnter);
        window.addEventListener('dragleave', onDragLeave);
        window.addEventListener('dragover', onDragOver);
        window.addEventListener('drop', onDrop);
        return () => {
            window.removeEventListener('dragenter', onDragEnter);
            window.removeEventListener('dragleave', onDragLeave);
            window.removeEventListener('dragover', onDragOver);
            window.removeEventListener('drop', onDrop);
        };
    }, [onFiles]);
    if (!dragging)
        return null;
    return (<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm pointer-events-none">
      <div className="flex flex-col items-center gap-4 border-2 border-dashed border-terra-400 rounded-3xl px-20 py-16">
        <div className="w-16 h-16 rounded-full bg-terra-400/20 flex items-center justify-center">
          <Upload size={28} className="text-terra-400"/>
        </div>
        <p className="text-white text-lg font-medium">Drop files to attach</p>
        <p className="text-white/40 text-sm">Images, PDFs, code files, documents</p>
      </div>
    </div>);
};
