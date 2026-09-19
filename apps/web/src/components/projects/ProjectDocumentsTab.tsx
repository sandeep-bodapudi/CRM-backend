import React, { useEffect, useRef, useState } from 'react';
import { Upload, Trash2, Loader2, FileText, Download } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { resolveImageUrl } from '../../utils/imageUtils';
import {
  listProjectDocuments,
  uploadProjectDocument,
  deleteProjectDocument,
  ProjectDocument,
  ProjectDocumentKind,
} from '../../api/projectMedia';

const KIND_LABELS: { value: ProjectDocumentKind; label: string }[] = [
  { value: 'RERA', label: 'RERA Certificate' },
  { value: 'APPROVAL', label: 'Approval / Sanction' },
  { value: 'LEGAL', label: 'Legal Document' },
  { value: 'OTHER', label: 'Other' },
];

export const ProjectDocumentsTab: React.FC<{ projectId: number }> = ({ projectId }) => {
  const { fetchWithAuth } = useAuth();
  const { showToast, showError } = useToast();
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadKind, setUploadKind] = useState<ProjectDocumentKind>('OTHER');
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = () => {
    setLoading(true);
    listProjectDocuments(fetchWithAuth, projectId)
      .then((r) => setDocuments(r.documents))
      .catch(() => showError({ message: 'Failed to load documents' }))
      .finally(() => setLoading(false));
  };

  useEffect(load, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadProjectDocument(fetchWithAuth, projectId, file, uploadKind, file.name);
      showToast({ message: 'Document uploaded successfully', type: 'success' });
      load();
    } catch (err: any) {
      showError({ message: err?.message || 'Failed to upload document' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (doc: ProjectDocument) => {
    if (!window.confirm('Delete this document?')) return;
    setDeletingId(doc.id);
    try {
      await deleteProjectDocument(fetchWithAuth, projectId, doc.id);
      showToast({ message: 'Document deleted', type: 'success' });
      load();
    } catch (err: any) {
      showError({ message: err?.message || 'Failed to delete document' });
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="py-16 flex justify-center">
        <Loader2 className="animate-spin text-navy-400" size={28} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-3 bg-slate-50 border border-slate-200 rounded-2xl p-4">
        <select
          value={uploadKind}
          onChange={(e) => setUploadKind(e.target.value as ProjectDocumentKind)}
          className="p-2.5 border border-slate-200 rounded-xl text-sm bg-white"
        >
          {KIND_LABELS.map((k) => (
            <option key={k.value} value={k.value}>
              {k.label}
            </option>
          ))}
        </select>
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 px-4 py-2.5 bg-navy-600 text-white rounded-xl text-sm font-bold hover:bg-navy-700 disabled:opacity-50"
        >
          {uploading ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
          Upload Document
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
          className="hidden"
          onChange={handleFileSelect}
        />
      </div>

      {documents.length === 0 ? (
        <div className="py-16 text-center text-slate-400">
          <FileText size={32} className="mx-auto mb-2 opacity-40" />
          <p className="font-bold text-slate-500">No documents uploaded yet</p>
          <p className="text-xs mt-1">
            Upload RERA certificates, approvals, or legal documents above.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100 bg-white border border-slate-200 rounded-2xl overflow-hidden">
          {documents.map((doc) => (
            <div key={doc.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-9 h-9 rounded-lg bg-navy-50 text-navy-600 flex items-center justify-center flex-shrink-0">
                  <FileText size={16} />
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-700 truncate">
                    {doc.title || 'Untitled document'}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    {KIND_LABELS.find((k) => k.value === doc.kind)?.label} ·{' '}
                    {new Date(doc.created_at).toLocaleDateString('en-IN')}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <a
                  href={resolveImageUrl(doc.url)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="p-2 text-slate-400 hover:text-navy-600 rounded-lg hover:bg-slate-50"
                >
                  <Download size={16} />
                </a>
                <button
                  onClick={() => handleDelete(doc)}
                  disabled={deletingId === doc.id}
                  className="p-2 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-slate-50 disabled:opacity-50"
                >
                  {deletingId === doc.id ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <Trash2 size={16} />
                  )}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
