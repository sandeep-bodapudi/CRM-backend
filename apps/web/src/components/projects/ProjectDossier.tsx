import React, { useState, useEffect, useCallback } from 'react';
import {
  Building2,
  X,
  MapPin,
  Calendar,
  Layout,
  Edit,
  CheckCircle2,
  ShieldCheck,
  Home,
  Plus,
  Image as ImageIcon,
  UploadCloud,
  Star,
  Trash2,
  Info,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { API_BASE_URL } from '../../config';
import { Permissions } from '../../shared';
import { useToast } from '../../context/ToastContext';
import { ProjectDossierData, PropertyListItem, ProjectFormData } from '../../types';
import { handleApiError, toUserFacingError } from '../../utils/userFacingError';
import { BulkUnitWizard } from './BulkUnitWizard';
import { ProjectLayoutViewer } from './ProjectLayoutViewer';
import { ProjectLayoutEditor } from './ProjectLayoutEditor';

interface ProjectDossierProps {
  projectId: number;
  onClose: () => void;
  onEdit?: (project: ProjectFormData) => void;
}

interface LayoutImage {
  id: number;
  image_url: string;
  title: string | null;
  is_primary: boolean;
  regions: {
    id: number;
    property_id: number;
    x: number;
    y: number;
    property: {
      id: number;
      property_code: string;
      title: string;
      status: string;
      final_price: number;
      category: string;
    };
  }[];
}

type Tab = 'overview' | 'units' | 'layout';

export const ProjectDossier: React.FC<ProjectDossierProps> = ({ projectId, onClose, onEdit }) => {
  const { fetchWithAuth, user } = useAuth();
  const { showToast, showError } = useToast();
  const [project, setProject] = useState<ProjectDossierData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [properties, setProperties] = useState<PropertyListItem[]>([]);
  const [layoutImages, setLayoutImages] = useState<LayoutImage[]>([]);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [showBulkUnitWizard, setShowBulkUnitWizard] = useState(false);
  const [isUploadingLayout, setIsUploadingLayout] = useState(false);
  const [selectedLayoutImageId, setSelectedLayoutImageId] = useState<number | null>(null);
  const [showLayoutEditor, setShowLayoutEditor] = useState(false);

  const canEdit = user?.permissions?.includes(Permissions.PROJECTS_UPDATE);

  const fetchProjectDetails = useCallback(async () => {
    setIsLoading(true);
    try {
      const [projRes, propRes, layoutRes] = await Promise.all([
        fetchWithAuth(`${API_BASE_URL}/projects/${projectId}`),
        fetchWithAuth(`${API_BASE_URL}/properties?project_id=${projectId}`),
        fetchWithAuth(`${API_BASE_URL}/projects/${projectId}/layout-images`),
      ]);

      if (projRes.ok) {
        const pData = await projRes.json();
        setProject(pData.project);
      }

      if (propRes.ok) {
        const prData = await propRes.json();
        setProperties(prData.properties || []);
      }

      if (layoutRes.ok) {
        const lData = await layoutRes.json();
        setLayoutImages(lData.images || []);
      }
    } catch (e) {
      showError(
        toUserFacingError({ message: e instanceof Error ? e.message : String(e), body: e }),
      );
    } finally {
      setIsLoading(false);
    }
  }, [projectId, fetchWithAuth]);

  useEffect(() => {
    fetchProjectDetails();
  }, [fetchProjectDetails]);

  const handleUploadLayoutImage = async (file: File) => {
    setIsUploadingLayout(true);
    try {
      const fd = new FormData();
      fd.append('image', file);
      fd.append('title', file.name.replace(/\.[^.]+$/, ''));
      const res = await fetchWithAuth(`${API_BASE_URL}/projects/${projectId}/layout-images`, {
        method: 'POST',
        body: fd,
      });
      if (!res.ok) {
        await handleApiError(res, showError);
        return;
      }
      showToast('Layout image uploaded', 'success');
      await fetchProjectDetails();
    } catch (e) {
      showError(
        toUserFacingError({ message: e instanceof Error ? e.message : String(e), body: e }),
      );
    } finally {
      setIsUploadingLayout(false);
    }
  };

  const handleDeleteLayoutImage = async (imageId: number) => {
    try {
      const res = await fetchWithAuth(
        `${API_BASE_URL}/projects/${projectId}/layout-images/${imageId}`,
        { method: 'DELETE' },
      );
      if (!res.ok) {
        await handleApiError(res, showError);
        return;
      }
      showToast('Layout image removed', 'success');
      await fetchProjectDetails();
    } catch (e) {
      showError(
        toUserFacingError({ message: e instanceof Error ? e.message : String(e), body: e }),
      );
    }
  };

  if (isLoading) {
    return (
      <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="w-full max-w-4xl bg-white rounded-3xl shadow-2xl p-10 flex flex-col items-center justify-center">
          <div className="w-8 h-8 border-4 border-navy-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-slate-500 font-bold mt-4">Loading Project Details...</p>
        </div>
      </div>
    );
  }

  if (!project) return null;

  const TABS: { id: Tab; label: string; icon: React.ElementType }[] = [
    { id: 'overview', label: 'Overview', icon: ShieldCheck },
    { id: 'units', label: `Units (${properties.length})`, icon: Home },
    {
      id: 'layout',
      label: `Layout${layoutImages.length > 0 ? ` (${layoutImages.length})` : ''}`,
      icon: ImageIcon,
    },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-sm flex items-center justify-center p-4 md:p-6">
      <div className="w-full h-full md:h-[90vh] max-w-6xl bg-slate-50 md:rounded-3xl shadow-2xl flex flex-col relative overflow-hidden animate-scaleUp">
        {/* Header Banner */}
        <div className="bg-gradient-to-r from-slate-900 via-navy-950 to-slate-900 p-6 text-white flex items-start justify-between relative shrink-0">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold border bg-navy-900/50 text-navy-300 border-navy-700`}
              >
                {project.status}
              </span>
              <span className="font-mono text-navy-200 text-xs px-2 py-0.5 bg-black/20 rounded">
                PRJ-{project.id}
              </span>
            </div>
            <h2 className="text-2xl font-black tracking-tight">{project.name}</h2>
            <p className="text-sm text-navy-100/80 flex items-center gap-1.5 mt-1">
              <MapPin className="w-4 h-4 text-navy-400" />
              {project.location}
            </p>
          </div>

          <div className="flex items-center gap-3">
            {canEdit && onEdit && (
              <button
                onClick={() => onEdit(project)}
                className="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl border border-white/20 transition-colors flex items-center gap-1.5"
              >
                <Edit className="w-3.5 h-3.5" /> Edit Project
              </button>
            )}
            <button
              onClick={onClose}
              className="p-2 bg-white/10 hover:bg-white/20 text-white rounded-full transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Bar */}
        <div className="flex items-center gap-1 px-6 border-b border-slate-200 bg-white shrink-0">
          {TABS.map((tab) => {
            const TabIcon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-3 text-xs font-bold border-b-2 transition-colors ${
                  isActive
                    ? 'border-navy-600 text-navy-700'
                    : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                <TabIcon className="w-3.5 h-3.5" /> {tab.label}
              </button>
            );
          })}
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
          {activeTab === 'overview' && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fadeIn">
              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm col-span-1 space-y-4">
                <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider border-b border-slate-100 pb-2 flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-navy-600" /> Key Information
                </h3>

                <div className="space-y-3 text-sm">
                  <div>
                    <span className="text-slate-400 text-xs block mb-0.5">Assigned PM</span>
                    <span className="font-bold text-slate-700">
                      {project.assigned_pm
                        ? `${project.assigned_pm.full_name} (${project.assigned_pm.employee_code})`
                        : 'Unassigned'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-xs block mb-0.5">Total Area</span>
                    <span className="font-bold text-slate-700 flex items-center gap-1.5">
                      <Layout className="w-4 h-4 text-slate-400" />{' '}
                      {project.total_area || 'Not Specified'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-xs block mb-0.5">Launch Date</span>
                    <span className="font-bold text-slate-700 flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-slate-400" />
                      {project.launch_date
                        ? new Date(project.launch_date).toLocaleDateString('en-IN')
                        : 'TBA'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 text-xs block mb-0.5">Inventory Units</span>
                    <span className="font-bold text-slate-700 flex items-center gap-1.5">
                      <Home className="w-4 h-4 text-slate-400" /> {properties.length} Properties
                      Linked
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm col-span-1 md:col-span-2">
                <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider border-b border-slate-100 pb-2 mb-3">
                  Project Overview
                </h3>
                <p className="text-slate-600 text-sm whitespace-pre-wrap leading-relaxed">
                  {project.description || 'No description provided.'}
                </p>
              </div>
            </div>
          )}

          {activeTab === 'units' && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm animate-fadeIn">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-navy-600" /> Units ({properties.length})
                </h3>
                {canEdit && (
                  <button
                    onClick={() => setShowBulkUnitWizard(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-navy-700 hover:bg-navy-800 text-white text-xs font-bold rounded-xl transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Units
                  </button>
                )}
              </div>

              {properties.length === 0 ? (
                <div className="text-center py-10 text-slate-400 text-sm">
                  No units are currently linked to this project.
                  {canEdit
                    ? ' Click "Add Units" to add plots, flats, or villas — individually or in bulk.'
                    : ''}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {properties.map((prop) => (
                    <div
                      key={prop.id}
                      className="border border-slate-200 rounded-xl p-4 hover:shadow-md transition-shadow"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className="font-mono text-xs font-bold text-navy-800 bg-navy-50 px-2 py-0.5 rounded border border-navy-200">
                          {prop.property_code}
                        </span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                          {(prop.status || 'UNKNOWN').replace(/_/g, ' ')}
                        </span>
                      </div>
                      <h4 className="font-bold text-slate-800 text-sm line-clamp-1">
                        {prop.title}
                      </h4>
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
                        <MapPin className="w-3 h-3 text-slate-400" /> {prop.location}
                      </p>
                      <div className="mt-3 pt-3 border-t border-slate-100 flex justify-between items-center text-xs">
                        <span className="font-semibold text-slate-700">
                          ₹ {((prop.final_price ?? 0) / 100000).toFixed(1)} L
                        </span>
                        <span className="text-slate-500">{prop.area_sqft} sqft</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'layout' && (
            <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm animate-fadeIn">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4">
                <h3 className="font-bold text-slate-800 text-sm uppercase tracking-wider flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-navy-600" /> Layout / Site Plan
                </h3>
                {canEdit && (
                  <label className="flex items-center gap-1.5 px-3 py-1.5 bg-navy-700 hover:bg-navy-800 text-white text-xs font-bold rounded-xl transition-colors cursor-pointer">
                    <UploadCloud className="w-3.5 h-3.5" />{' '}
                    {isUploadingLayout ? 'Uploading...' : 'Upload Layout Image'}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={isUploadingLayout}
                      onChange={(e) => {
                        if (e.target.files?.[0]) handleUploadLayoutImage(e.target.files[0]);
                        e.target.value = '';
                      }}
                    />
                  </label>
                )}
              </div>

              {layoutImages.length === 0 ? (
                <div className="text-center py-12 text-slate-400 text-sm">
                  <ImageIcon className="w-10 h-10 mx-auto mb-3 text-slate-300" />
                  <p className="font-semibold text-slate-500">No layout image uploaded yet.</p>
                  {canEdit && (
                    <p className="mt-1">
                      Upload a master plan or site layout to start mapping units onto it.
                    </p>
                  )}
                </div>
              ) : (
                <>
                  {(() => {
                    const selected =
                      layoutImages.find((i) => i.id === selectedLayoutImageId) ||
                      layoutImages.find((i) => i.is_primary) ||
                      layoutImages[0];
                    return (
                      <ProjectLayoutViewer
                        imageUrl={selected.image_url}
                        title={selected.title}
                        regions={selected.regions}
                        onManageUnit={() => setActiveTab('units')}
                      />
                    );
                  })()}

                  {layoutImages.length > 1 && (
                    <div className="mt-4 grid grid-cols-3 sm:grid-cols-4 gap-3">
                      {layoutImages.map((img) => {
                        const isSelected =
                          (selectedLayoutImageId ??
                            (layoutImages.find((i) => i.is_primary)?.id || layoutImages[0].id)) ===
                          img.id;
                        return (
                          <button
                            key={img.id}
                            onClick={() => setSelectedLayoutImageId(img.id)}
                            className={`relative rounded-lg overflow-hidden border-2 transition-all ${isSelected ? 'border-navy-600' : 'border-slate-200 hover:border-navy-300'}`}
                          >
                            <img
                              src={img.image_url}
                              alt={img.title || 'Layout image'}
                              className="w-full h-16 object-cover bg-slate-100"
                            />
                            {img.is_primary && (
                              <span className="absolute top-1 left-1 bg-amber-500 text-white p-0.5 rounded-full">
                                <Star className="w-2.5 h-2.5" />
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {canEdit &&
                    (() => {
                      const selected =
                        layoutImages.find((i) => i.id === selectedLayoutImageId) ||
                        layoutImages.find((i) => i.is_primary) ||
                        layoutImages[0];
                      return (
                        <div className="mt-4 flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs">
                          <span className="text-slate-500">
                            {selected.title || 'Untitled'} — {selected.regions.length} unit
                            {selected.regions.length !== 1 ? 's' : ''} mapped
                          </span>
                          <div className="flex items-center gap-4">
                            <button
                              onClick={() => setShowLayoutEditor(true)}
                              className="flex items-center gap-1 text-navy-700 hover:text-navy-800 font-bold"
                            >
                              <Edit className="w-3.5 h-3.5" /> Edit Pins
                            </button>
                            <button
                              onClick={() => handleDeleteLayoutImage(selected.id)}
                              className="flex items-center gap-1 text-rose-600 hover:text-rose-700 font-bold"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Delete this image
                            </button>
                          </div>
                        </div>
                      );
                    })()}
                </>
              )}

              {layoutImages.length === 0 && (
                <div className="mt-4 p-3 bg-navy-50 border border-navy-100 rounded-xl flex items-start gap-2 text-xs text-navy-700">
                  <Info className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span>
                    Once a layout image is uploaded, use "Edit Pins" to map units onto it — click to
                    place a pin, then assign it to a unit.
                  </span>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {showBulkUnitWizard && (
        <BulkUnitWizard
          preselectedProjectId={projectId}
          onClose={() => setShowBulkUnitWizard(false)}
          onSuccess={() => {
            setShowBulkUnitWizard(false);
            fetchProjectDetails();
          }}
        />
      )}

      {showLayoutEditor &&
        (() => {
          const selected =
            layoutImages.find((i) => i.id === selectedLayoutImageId) ||
            layoutImages.find((i) => i.is_primary) ||
            layoutImages[0];
          return (
            <ProjectLayoutEditor
              projectId={projectId}
              imageId={selected.id}
              imageUrl={selected.image_url}
              units={properties}
              existingRegions={selected.regions}
              onClose={() => setShowLayoutEditor(false)}
              onSaved={() => {
                setShowLayoutEditor(false);
                fetchProjectDetails();
              }}
            />
          );
        })()}
    </div>
  );
};
