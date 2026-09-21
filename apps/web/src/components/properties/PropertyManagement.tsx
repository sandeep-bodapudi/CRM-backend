import React, { useState, useEffect } from 'react';
import {
  Home,
  Building,
  MapPin,
  Compass,
  CheckCircle2,
  AlertCircle,
  X,
  Plus,
  Search,
  Filter,
  Eye,
  ImageIcon,
  ShieldCheck,
  Sparkles,
  FileCheck,
  Tag,
  Bed,
  Bath,
  Maximize2,
  DollarSign,
  UserCheck,
  Camera,
  CheckCheck,
  Lock,
  Star,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { API_BASE_URL } from '../../config';
import { Permissions } from '../../shared';
import { Roles } from '../../shared';
import { formatEmployeeLabel } from '../../utils/employeeLabel';
import { PropertyForm } from './PropertyForm';
import { CATEGORY_TAB_GROUPS, CategoryTabGroup, categoryTabGroupOf } from './propertyWizardShared';
import { CostSheet } from '../shared/CostSheet';
import { PropertyPricingRulesPanel } from './PropertyPricingRulesPanel';
import {
  overridePropertyPrice,
  recalculatePropertyPrice,
  PropertySalesStatus,
} from '../../api/properties';
import { PriceLine, PriceBasisCode } from '../../api/projectUnits';
import { PropertyImage, PropertyCategory } from '../../api/properties';
import { Edit, Building2 } from 'lucide-react';

import { resolveImageUrl } from '../../utils/imageUtils';
import { ProjectListItem, PropertyListItem, PmListItem, VerificationLogItem } from '../../types';
import { PropertyCard } from '../ui/PropertyCard';
import { handleApiError, toUserFacingError } from '../../utils/userFacingError';

// Shared with ProjectLayoutViewer.tsx's unit-status pins — one color scheme
// for property pipeline status across the app, matching getStatusBadge's colors below.
export const STATUS_CONFIG: Record<
  string,
  { dot: string; badge: string; text: string; label: string }
> = {
  PENDING_VERIFICATION: {
    dot: 'bg-amber-500',
    badge: 'bg-amber-50 border-amber-300',
    text: 'text-amber-800',
    label: 'Pending Verification',
  },
  PENDING_DM_POLISH: {
    dot: 'bg-navy-500',
    badge: 'bg-navy-50 border-navy-300',
    text: 'text-navy-800',
    label: 'Pending DM Polish',
  },
  PENDING_MD_APPROVAL: {
    dot: 'bg-purple-500',
    badge: 'bg-purple-50 border-purple-300',
    text: 'text-purple-800',
    label: 'Pending MD Approval',
  },
  LIVE: {
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-50 border-emerald-300',
    text: 'text-emerald-800',
    label: 'Live',
  },
  REJECTED: {
    dot: 'bg-rose-500',
    badge: 'bg-rose-50 border-rose-300',
    text: 'text-rose-800',
    label: 'Rejected',
  },
  LOCKED: {
    dot: 'bg-slate-500',
    badge: 'bg-slate-100 border-slate-300',
    text: 'text-slate-700',
    label: 'Locked',
  },
  BOOKED: {
    dot: 'bg-blue-500',
    badge: 'bg-blue-50 border-blue-300',
    text: 'text-blue-800',
    label: 'Booked',
  },
  SOLD: {
    dot: 'bg-slate-500',
    badge: 'bg-slate-100 border-slate-300',
    text: 'text-slate-700',
    label: 'Sold',
  },
  ARCHIVED: {
    dot: 'bg-slate-400',
    badge: 'bg-slate-50 border-slate-200',
    text: 'text-slate-500',
    label: 'Archived',
  },
};

interface Property {
  id: number;
  company_id: number;
  property_code: string;
  title: string;
  description?: string;
  brand_type: 'SONTHILLU' | 'RADHA_REAL_HOMES';
  category: PropertyCategory;
  area_sqft: number;
  location: string;
  address?: string;
  bedrooms?: number;
  bathrooms?: number;
  facing?: string;
  amenities?: string | null;
  possession_status?: 'READY_TO_MOVE' | 'UNDER_CONSTRUCTION' | null;
  listing_type?: 'NEW' | 'RESALE';
  view?: string | null;
  total_floors?: number | null;
  construction_year?: number | null;
  road_width_ft?: number | null;
  carpet_area_sqft?: number | null;
  built_up_area_sqft?: number | null;
  super_built_up_area_sqft?: number | null;
  ground_floor_area_sqft?: number | null;
  first_floor_area_sqft?: number | null;
  plot_area_sqyd?: number | null;
  plot_length_ft?: number | null;
  plot_width_ft?: number | null;
  is_corner?: boolean;
  is_park_facing?: boolean;
  is_road_facing?: boolean;
  is_main_road_facing?: boolean;
  is_premium_location?: boolean;
  // Category-specific spec tables (property details.md) — only the one
  // matching `category` is ever populated. Loosely typed since each shape
  // is genuinely different per property type; the details renderer below
  // just lists whichever non-empty fields are present.
  plot_details?: Record<string, any> | null;
  apartment_details?: Record<string, any> | null;
  villa_details?: Record<string, any> | null;
  house_details?: Record<string, any> | null;
  commercial_shop_details?: Record<string, any> | null;
  commercial_office_details?: Record<string, any> | null;
  farm_land_details?: Record<string, any> | null;
  status:
    | 'PENDING_VERIFICATION'
    | 'PENDING_DM_POLISH'
    | 'PENDING_MD_APPROVAL'
    | 'LIVE'
    | 'REJECTED'
    | 'LOCKED'
    | 'BOOKED'
    | 'SOLD'
    | 'ARCHIVED';
  rejection_reason?: string;
  seo_title?: string;
  seo_keywords?: string;
  location_confirmed_by_pm?: boolean;
  assigned_pm?: { id: number; employee_code: string; full_name: string; phone: string };
  project?: { id: number; name: string };
  _count?: { interested_leads: number };
  created_by?: { id: number; employee_code: string; full_name: string };
  created_at: string;
  verification_logs?: VerificationLogItem[];
  images?: PropertyImage[];
  // Rebuild Phase 5 — the pricing-engine output (services/pricing/engine.ts),
  // independent of the legacy `pricing` sub-record above.
  sales_status: PropertySalesStatus;
  price_basis?: PriceBasisCode;
  base_rate?: number | null;
  base_price: number;
  premiums_total: number;
  charges_total: number;
  taxes_total: number;
  discount_amount?: number;
  calculated_price: number;
  override_price: number | null;
  override_reason: string | null;
  overridden_by_id: number | null;
  overridden_at: string | null;
  final_price: number;
  slug: string | null;
  area_sqyd: number | null;
  price_lines?: PriceLine[];
  // § Phase 3 — an MD-approved LIVE property previously had no way to actually
  // become visible on the public site; this is the real gate the public
  // listing routes check (in addition to status).
  publications?: {
    id: number;
    company_id: number;
    is_published: boolean;
    published_at: string | null;
  }[];
}

// Turns "has_servant_room" into "Servant Room", "bhk" into "Bhk", etc. — used
// so the category-specific detail tables (7 different shapes, one per
// property type) can be listed generically without hand-writing a field list
// for each one.
const humanizeFieldName = (key: string): string =>
  key
    .replace(/^(is_|has_)/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());

/** Returns [label, displayValue][] for every populated field on a
 * category-specific details record — skips null/undefined/false/empty-string
 * so a telecaller only sees fields that actually have an answer. */
const listPopulatedDetailFields = (details?: Record<string, any> | null): [string, string][] => {
  if (!details) return [];
  const entries: [string, string][] = [];
  for (const [key, value] of Object.entries(details)) {
    if (
      key === 'id' ||
      key === 'property_id' ||
      value === null ||
      value === undefined ||
      value === ''
    )
      continue;
    if (typeof value === 'boolean') {
      if (value) entries.push([humanizeFieldName(key), 'Yes']);
      continue;
    }
    entries.push([humanizeFieldName(key), String(value)]);
  }
  return entries;
};

/** Picks whichever one of the 7 category-specific detail sub-records is
 * populated for this property (only the one matching `category` ever is). */
const getCategoryDetails = (property: Property): Record<string, any> | null =>
  property.plot_details ||
  property.apartment_details ||
  property.villa_details ||
  property.house_details ||
  property.commercial_shop_details ||
  property.commercial_office_details ||
  property.farm_land_details ||
  null;

const APPROVAL_STAGES = [
  { key: 'PENDING_VERIFICATION', label: '1. PM Verify', role: 'Project Manager' },
  { key: 'PENDING_DM_POLISH', label: '2. DM Polish', role: 'Digital Marketing' },
  { key: 'PENDING_MD_APPROVAL', label: '3. MD Approval', role: 'Managing Director' },
  { key: 'LIVE', label: '4. LIVE', role: 'Public' },
];

const PropertyPipelineStepper: React.FC<{ status: Property['status'] }> = ({ status }) => {
  if (status === 'REJECTED') {
    return (
      <div className="px-3 py-1 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 font-bold text-[11px] inline-flex items-center gap-1.5 my-1">
        <AlertCircle className="w-3.5 h-3.5" />
        <span>Property Rejected</span>
      </div>
    );
  }

  const currentIndex = APPROVAL_STAGES.findIndex((s) => s.key === status);

  return (
    <div className="w-full my-2 bg-slate-50 p-2 rounded-xl border border-slate-200">
      <div className="flex items-center justify-between text-[9px] font-extrabold uppercase tracking-wider text-slate-400 mb-1.5">
        <span>Approval Workflow</span>
        <span className="text-navy-800 font-bold">
          {status === 'LIVE' ? 'Approved & LIVE' : `Stage ${currentIndex + 1} of 3`}
        </span>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {APPROVAL_STAGES.map((stg, idx) => {
          const isCurrent = stg.key === status;
          const isPassed = status === 'LIVE' || (currentIndex >= 0 && idx < currentIndex);
          return (
            <div
              key={stg.key}
              className={`px-1 py-1 rounded-lg text-[9px] font-bold text-center leading-tight transition-all ${
                isCurrent
                  ? 'bg-amber-600 text-white shadow-sm ring-1 ring-amber-400'
                  : isPassed
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : 'bg-slate-200/70 text-slate-500'
              }`}
            >
              <div className="truncate">{stg.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const PropertyManagement: React.FC = () => {
  const { user, fetchWithAuth, activeRole } = useAuth();
  const { showToast, showError } = useToast();
  const [properties, setProperties] = useState<Property[]>([]);
  // Backend total for the current scope/filter, not just this fetch's array
  // length — a fetch capped by the backend's own max (100000) would
  // otherwise silently look complete in the "All Inventory (N)" header.
  const [propertiesTotal, setPropertiesTotal] = useState(0);
  // Render-side cap, independent of the fetch: rendering thousands of DOM
  // cards at once freezes the browser regardless of how much data the API
  // returned, now that the fetch itself can return up to 100000. "Load More"
  // reveals more of the already-fetched, filtered list; reset on filter
  // change below so it never shows "page 4" of a different result set.
  const PROPERTIES_PAGE_SIZE = 30;
  const [visiblePropertyCount, setVisiblePropertyCount] = useState(PROPERTIES_PAGE_SIZE);
  const [brandTab, setBrandTab] = useState<'ALL' | 'SONTHILLU' | 'RADHA_REAL_HOMES'>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);

  // Modals
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [dossierImageBusy, setDossierImageBusy] = useState(false);
  // Two-tap in-app confirm for image delete — window.confirm() is unreliable
  // in some embedded/installed-PWA contexts (silently auto-dismissed), which
  // made the delete button look completely broken.
  const [confirmDeleteImageId, setConfirmDeleteImageId] = useState<number | null>(null);
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);

  // Create Form State
  const [title, setTitle] = useState('');
  const [brandType, setBrandType] = useState<'SONTHILLU' | 'RADHA_REAL_HOMES'>('SONTHILLU');
  const [category, setCategory] = useState('VILLA');
  const [price, setPrice] = useState('18500000');
  const [areaSqft, setAreaSqft] = useState('2400');
  const [location, setLocation] = useState('Miyapur Main Road');
  const [address, setAddress] = useState('Plot 45, Sonthillu Luxury County, Miyapur, Hyderabad');
  const [bedrooms, setBedrooms] = useState('3');
  const [bathrooms, setBathrooms] = useState('3');
  const [facing, setFacing] = useState('EAST');
  const [description, setDescription] = useState('');
  const [amenities, setAmenities] = useState('');
  const [possessionStatus, setPossessionStatus] = useState('READY_TO_MOVE');
  const [assignedPmId, setAssignedPmId] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [pms, setPms] = useState<PmListItem[]>([]);
  const [viewMode, setViewMode] = useState<'ALL' | 'MY_PROPERTIES'>('ALL');

  // Action Inputs for Dossier
  const [actionNotes, setActionNotes] = useState('');
  const [seoTitle, setSeoTitle] = useState('');
  const [seoKeywords, setSeoKeywords] = useState('');
  const [dmExecutiveId, setDmExecutiveId] = useState('');
  const [dmExecutives, setDmExecutives] = useState<PmListItem[]>([]);

  const isPM = activeRole === Roles.PROJECT_MANAGER;
  const isDM = (
    [
      Roles.DIGITAL_LEAD_OPERATOR,
      Roles.DIGITAL_MARKETING_HEAD,
      Roles.DIGITAL_MARKETING_EXECUTIVE,
      Roles.MARKETING_DIRECTOR,
      Roles.MD,
      Roles.ADMIN,
    ] as string[]
  ).includes(activeRole);
  const isMD = ([Roles.MD, Roles.ADMIN] as string[]).includes(activeRole);

  const fetchProperties = async () => {
    setIsLoading(true);
    try {
      // Explicit high limit: the backend default (previously 20, now 2000)
      // silently truncated inventory for any company with more properties
      // than that — individual plots/units routinely exceed it. See the
      // "All Inventory (N)" header below, now sourced from backend `total`.
      const res = await fetchWithAuth(`${API_BASE_URL}/properties?limit=100000`);
      const data = await res.json();
      if (res.ok) {
        setProperties(data.properties || []);
        setPropertiesTotal(data.total ?? (data.properties || []).length);
      }
    } catch (e) {
      console.error('Fetch properties error:', e);
      showError(
        toUserFacingError({ message: e instanceof Error ? e.message : String(e), body: e }),
      );
    } finally {
      setIsLoading(false);
    }
  };

  const fetchPMs = async () => {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/employees`);
      const data = await res.json();
      if (res.ok && data.employees) {
        setPms(
          data.employees.filter((e: PmListItem) =>
            e.roles?.some((r: string) => r.includes(Roles.PROJECT_MANAGER)),
          ),
        );
        setDmExecutives(
          data.employees.filter((e: PmListItem) =>
            e.roles?.some((r: string) => r.toLowerCase().includes('digital marketing executive')),
          ),
        );
      }
    } catch (e) {}
  };

  useEffect(() => {
    fetchProperties();
    if (isMD || isPM || isDM) fetchPMs();
  }, []);

  useEffect(() => {
    setVisiblePropertyCount(PROPERTIES_PAGE_SIZE);
  }, [brandTab, statusFilter, searchQuery, viewMode]);

  const handleCreateProperty = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !price || !location) return;

    setIsSubmitting(true);
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/properties`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title,
          brand_type: brandType,
          category,
          price: parseFloat(price),
          area_sqft: parseFloat(areaSqft),
          location,
          address,
          bedrooms: bedrooms ? parseInt(bedrooms, 10) : null,
          bathrooms: bathrooms ? parseInt(bathrooms, 10) : null,
          facing,
          description,
          amenities,
          possession_status: possessionStatus,
          assigned_pm_id: assignedPmId ? parseInt(assignedPmId) : null,
          faqs: [], // Can be expanded in future
        }),
      });

      const data = await res.json();
      if (res.ok) {
        showToast(
          `Property ${data.property.property_code} submitted for PM On-Site Verification!`,
          'success',
        );
        setShowAddModal(false);
        setTitle('');
        setDescription('');
        setAmenities('');
        setAssignedPmId('');
        fetchProperties();
      } else {
        await handleApiError(res, showError, data);
      }
    } catch (err) {
      showError(
        toUserFacingError({ message: err instanceof Error ? err.message : String(err), body: err }),
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  // Pipeline Action Handlers
  const handlePMVerify = async (propertyId: number, approved: boolean) => {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/properties/${propertyId}/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved, notes: actionNotes || 'PM On-Site Check Executed' }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message, 'success');
        setActionNotes('');
        setSelectedProperty(null);
        fetchProperties();
      } else {
        await handleApiError(res, showError, data);
      }
    } catch (err) {
      showError(
        toUserFacingError({ message: err instanceof Error ? err.message : String(err), body: err }),
      );
    }
  };

  const handleDMPolish = async (propertyId: number) => {
    if (!dmExecutiveId) {
      showError({ message: 'Please select a Digital Marketing Executive to assign' });
      return;
    }
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/properties/${propertyId}/dm-polish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          digital_marketing_executive_id: parseInt(dmExecutiveId, 10),
          seo_title: seoTitle || selectedProperty?.title,
          seo_keywords: seoKeywords || 'luxury villa, miyapur real estate, hyderabad homes',
          notes: actionNotes || 'DM SEO Polish Assigned',
        }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message, 'success');
        setActionNotes('');
        setSeoTitle('');
        setSeoKeywords('');
        setDmExecutiveId('');
        setSelectedProperty(null);
        fetchProperties();
      } else {
        await handleApiError(res, showError, data);
      }
    } catch (err) {
      showError(
        toUserFacingError({ message: err instanceof Error ? err.message : String(err), body: err }),
      );
    }
  };

  const handleMDApprove = async (propertyId: number, approved: boolean) => {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/properties/${propertyId}/md-approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved, comments: actionNotes || 'MD Decision Executed' }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message, 'success');
        setActionNotes('');
        setSelectedProperty(null);
        fetchProperties();
      } else {
        await handleApiError(res, showError, data);
      }
    } catch (err) {
      showError(
        toUserFacingError({ message: err instanceof Error ? err.message : String(err), body: err }),
      );
    }
  };

  // These two backend actions existed with no UI trigger anywhere — a
  // rejected property was a permanent dead end (no way to resubmit) and DM
  // Head had no "already fine, skip polish" shortcut. Wired up here.
  const handleResubmit = async (propertyId: number) => {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/properties/${propertyId}/resubmit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: actionNotes || undefined }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message, 'success');
        setActionNotes('');
        setSelectedProperty(null);
        fetchProperties();
      } else {
        await handleApiError(res, showError, data);
      }
    } catch (err) {
      showError(
        toUserFacingError({ message: err instanceof Error ? err.message : String(err), body: err }),
      );
    }
  };

  const handleDmVerifyAsIs = async (propertyId: number) => {
    try {
      const res = await fetchWithAuth(`${API_BASE_URL}/properties/${propertyId}/dm-verify-as-is`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: actionNotes || 'Verified as-is, no SEO polish needed' }),
      });
      const data = await res.json();
      if (res.ok) {
        showToast(data.message, 'success');
        setActionNotes('');
        setSelectedProperty(null);
        fetchProperties();
      } else {
        await handleApiError(res, showError, data);
      }
    } catch (err) {
      showError(
        toUserFacingError({ message: err instanceof Error ? err.message : String(err), body: err }),
      );
    }
  };

  const needsMyVerificationCount = properties.filter(
    (prop) => prop.status === 'PENDING_VERIFICATION' && prop.assigned_pm?.id === user?.id,
  ).length;

  const filteredProperties = properties.filter((prop) => {
    const matchesBrand = brandTab === 'ALL' || prop.brand_type === brandTab;
    const matchesStatus = statusFilter === 'ALL' || prop.status === statusFilter;
    const matchesSearch =
      prop.property_code.toLowerCase().includes(searchQuery.toLowerCase()) ||
      prop.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      prop.location.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesViewMode =
      viewMode === 'ALL' ||
      (viewMode === 'MY_PROPERTIES' &&
        prop.assigned_pm?.id === user?.id &&
        prop.status === 'PENDING_VERIFICATION');

    return matchesBrand && matchesStatus && matchesSearch && matchesViewMode;
  });

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'PENDING_VERIFICATION':
        return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'PENDING_DM_POLISH':
        return 'bg-navy-100 text-navy-800 border-navy-300';
      case 'PENDING_MD_APPROVAL':
        return 'bg-purple-100 text-purple-800 border-purple-300';
      case 'LIVE':
        return 'bg-emerald-100 text-emerald-800 border-emerald-300';
      case 'REJECTED':
        return 'bg-rose-100 text-rose-800 border-rose-300';
      default:
        return 'bg-slate-100 text-slate-700 border-slate-300';
    }
  };

  return (
    <div className="space-y-6 relative">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-slate-900 via-navy-950 to-slate-900 rounded-3xl p-6 text-white shadow-xl flex flex-wrap items-center justify-between gap-4 border border-navy-700/30">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Building className="w-5 h-5 text-navy-400" />
            <h2 className="text-xl font-extrabold tracking-tight">
              Property Inventory & Verification
            </h2>
          </div>
          <p className="text-xs text-navy-200/80">
            Manage your properties, inventory and approval pipelines.
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-navy-500 hover:bg-navy-400 text-navy-950 font-extrabold text-xs rounded-xl shadow-lg transition-all flex items-center gap-1.5"
        >
          <Plus className="w-4 h-4" />
          <span>Add Property Listing</span>
        </button>
      </div>

      {isPM && (
        <div className="flex gap-2 bg-slate-100 p-1 rounded-2xl border border-slate-200 w-full md:w-auto">
          <button
            onClick={() => setViewMode('ALL')}
            className={`px-4 py-1.5 rounded-xl text-xs font-extrabold transition-all ${
              viewMode === 'ALL'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            All Properties
          </button>
          <button
            onClick={() => setViewMode('MY_PROPERTIES')}
            className={`px-4 py-1.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-1.5 ${
              viewMode === 'MY_PROPERTIES'
                ? 'bg-navy-700 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Needs Your Verification
            {needsMyVerificationCount > 0 && (
              <span className="bg-amber-400 text-navy-950 text-[10px] font-black px-1.5 py-0.5 rounded-full">
                {needsMyVerificationCount}
              </span>
            )}
          </button>
        </div>
      )}

      {/* Brand Separation Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap items-center gap-2 bg-slate-100 p-1 rounded-2xl border border-slate-200 w-full md:w-auto">
          <button
            onClick={() => setBrandTab('ALL')}
            className={`px-4 py-1.5 rounded-xl text-xs font-extrabold transition-all ${
              brandTab === 'ALL'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            All Inventory ({propertiesTotal})
          </button>

          <button
            onClick={() => setBrandTab('SONTHILLU')}
            className={`px-4 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all ${
              brandTab === 'SONTHILLU'
                ? 'bg-navy-700 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Home className="w-3.5 h-3.5 text-navy-300" />
            <span>Sonthillu (Residential)</span>
          </button>

          <button
            onClick={() => setBrandTab('RADHA_REAL_HOMES')}
            className={`px-4 py-1.5 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all ${
              brandTab === 'RADHA_REAL_HOMES'
                ? 'bg-slate-800 text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Building className="w-3.5 h-3.5 text-amber-300" />
            <span>Radha Real Homes</span>
          </button>
        </div>

        {/* Search & Filter */}
        <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 w-full md:w-auto">
          <div className="relative w-60">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
            <input
              type="text"
              placeholder="Search code, title, location..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-600"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="py-1.5 px-3 text-xs bg-white border border-slate-200 rounded-xl font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-navy-600"
          >
            <option value="ALL">All Stages</option>
            <option value="PENDING_VERIFICATION">1. PM Verification</option>
            <option value="PENDING_DM_POLISH">2. DM Polish</option>
            <option value="PENDING_MD_APPROVAL">3. MD Approval</option>
            <option value="LIVE">4. LIVE</option>
            <option value="REJECTED">REJECTED</option>
          </select>
        </div>
      </div>

      {/* Property Cards Grid (Housing.com Style) */}
      {isLoading ? (
        <div className="py-12 text-center text-xs text-slate-400">
          Loading property portfolio...
        </div>
      ) : filteredProperties.length === 0 ? (
        <div className="py-12 text-center text-xs text-slate-400">
          No properties found in selected view.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredProperties.slice(0, visiblePropertyCount).map((prop) => {
            const displayImage =
              (prop.images && prop.images.length > 0
                ? resolveImageUrl(
                    prop.images.find((i) => i.is_primary)?.image_url || prop.images[0].image_url,
                  )
                : '') || '';

            const actualInterestedLeads = prop._count?.interested_leads || 0;

            return (
              <PropertyCard
                key={prop.id}
                property={{
                  id: prop.id,
                  name: prop.title,
                  location: prop.location,
                  bhk: prop.bedrooms || 0,
                  sqft: prop.area_sqft,
                  price: `₹${((prop.final_price ?? 0) / 100000).toFixed(1)} L`,
                  imageUrl: displayImage,
                  interestedLeads: actualInterestedLeads,
                }}
                onClick={() => {
                  setSelectedProperty(prop);
                  setConfirmDeleteImageId(null);
                }}
                brandBadge={
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-extrabold border shadow-sm ${
                      prop.brand_type === 'SONTHILLU'
                        ? 'bg-navy-50 text-navy-800 border-navy-200'
                        : 'bg-slate-900 text-amber-300 border-slate-700'
                    }`}
                  >
                    {prop.brand_type === 'SONTHILLU' ? 'Sonthillu' : 'Radha Real Homes'}
                  </span>
                }
                statusBadge={
                  <span
                    className={`px-2 py-0.5 rounded text-[10px] font-bold border shadow-sm ${getStatusBadge(prop.status)}`}
                  >
                    {prop.status.replace(/_/g, ' ')}
                  </span>
                }
              />
            );
          })}
        </div>
      )}
      {!isLoading && filteredProperties.length > visiblePropertyCount && (
        <button
          onClick={() => setVisiblePropertyCount((c) => c + PROPERTIES_PAGE_SIZE)}
          className="w-full py-3 rounded-2xl border border-slate-200 bg-white text-navy-700 font-bold text-sm hover:bg-slate-50 transition-colors"
        >
          Load More ({filteredProperties.length - visiblePropertyCount} remaining)
        </button>
      )}

      {/* Add Property Wizard */}
      {showAddModal && (
        <PropertyForm
          mode="create"
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            fetchProperties();
          }}
        />
      )}

      {/* Property Dossier & Verification Pipeline Action Modal */}
      {selectedProperty && (
        <div className="fixed inset-0 z-50 bg-slate-900/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="w-full max-w-2xl bg-white rounded-3xl p-6 shadow-2xl border border-slate-100 relative max-h-[90vh] overflow-y-auto space-y-5">
            <div className="absolute top-4 right-4 flex items-center gap-1">
              <button
                onClick={() => setShowEditModal(true)}
                className="p-1 text-slate-400 hover:text-navy-700 rounded-full hover:bg-slate-100"
                title="Edit Property"
              >
                <Edit className="w-5 h-5" />
              </button>
              <button
                onClick={() => {
                  setSelectedProperty(null);
                  setConfirmDeleteImageId(null);
                }}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-navy-800 text-sm">
                {selectedProperty.property_code}
              </span>
              <span
                className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${getStatusBadge(selectedProperty.status)}`}
              >
                {selectedProperty.status.replace(/_/g, ' ')}
              </span>
            </div>

            <div>
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="font-extrabold text-slate-900 text-xl">
                    {selectedProperty.title}
                  </h3>
                  {selectedProperty.project && (
                    <div className="text-[11px] text-navy-700 bg-navy-50 px-2 py-0.5 rounded-full inline-block border border-navy-100 mt-1 mb-2">
                      <Building2 className="w-3.5 h-3.5 inline mr-1" />
                      {selectedProperty.project.name}
                    </div>
                  )}
                  <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    {selectedProperty.location} • ₹
                    {((selectedProperty.final_price ?? 0) / 100000).toFixed(1)} Lakhs
                  </p>
                </div>
                {user?.permissions?.includes(Permissions.PROPERTIES_UPDATE) && (
                  <button
                    onClick={() => setShowEditModal(true)}
                    className="p-2 text-navy-600 hover:text-navy-700 bg-navy-50 hover:bg-navy-100 rounded-xl transition-colors"
                    title="Edit Safe Details"
                  >
                    <Edit className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {/* Pipeline Stage Progress Bar */}
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
              <span className="text-[10px] font-bold uppercase text-slate-400">
                4-Stage Verification Workflow
              </span>
              <div className="grid grid-cols-4 gap-2 text-center text-[10px] font-bold">
                <div
                  className={`p-2 rounded-xl border ${selectedProperty.status === 'PENDING_VERIFICATION' ? 'bg-amber-100 text-amber-900 border-amber-300' : 'bg-white text-slate-400 border-slate-200'}`}
                >
                  1. PM On-Site
                </div>
                <div
                  className={`p-2 rounded-xl border ${selectedProperty.status === 'PENDING_DM_POLISH' ? 'bg-navy-100 text-navy-900 border-navy-300' : 'bg-white text-slate-400 border-slate-200'}`}
                >
                  2. DM Polish
                </div>
                <div
                  className={`p-2 rounded-xl border ${selectedProperty.status === 'PENDING_MD_APPROVAL' ? 'bg-purple-100 text-purple-900 border-purple-300' : 'bg-white text-slate-400 border-slate-200'}`}
                >
                  3. MD Approval
                </div>
                <div
                  className={`p-2 rounded-xl border ${selectedProperty.status === 'LIVE' ? 'bg-emerald-100 text-emerald-900 border-emerald-300' : 'bg-white text-slate-400 border-slate-200'}`}
                >
                  4. LIVE
                </div>
              </div>
            </div>

            {/* Action Bar based on current stage & user role */}
            <div className="p-4 bg-navy-50/60 rounded-2xl border border-navy-200/60 space-y-3">
              <h4 className="font-bold text-navy-900 text-xs uppercase flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-navy-700" />
                Pipeline Stage Action Bar
              </h4>

              {/* Stage 1 — Guided PM Verification Wizard */}
              {selectedProperty.status === 'PENDING_VERIFICATION' &&
                (() => {
                  const isMDOrAdmin = ([Roles.MD, Roles.ADMIN] as string[]).includes(activeRole);
                  const isAssignedPM = isPM && selectedProperty.assigned_pm?.id === user?.id;
                  const isUnassigned = !selectedProperty.assigned_pm;
                  const canVerify = isAssignedPM || (isMDOrAdmin && isUnassigned);

                  if (!canVerify) {
                    return (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl">
                        <p className="text-xs text-amber-800 font-bold mb-1">
                          Awaiting PM Verification
                        </p>
                        <p className="text-[11px] text-amber-700">
                          {selectedProperty.assigned_pm
                            ? `Currently being verified by PM: ${selectedProperty.assigned_pm.full_name}`
                            : 'Unassigned — MD must assign a PM.'}
                        </p>
                      </div>
                    );
                  }

                  const locConfirmed = !!selectedProperty.location_confirmed_by_pm;
                  const pmUploadedImages =
                    selectedProperty.images?.filter((img) => img.uploaded_by_id === user?.id) ?? [];
                  const hasPhotos = pmUploadedImages.length > 0;
                  const allReady = locConfirmed && hasPhotos;

                  const stepState = (done: boolean, locked: boolean) => {
                    if (done) return 'done';
                    if (locked) return 'locked';
                    return 'active';
                  };

                  const stepClasses = {
                    done: 'border-emerald-300 bg-emerald-50',
                    active: 'border-navy-300 bg-navy-50/60',
                    locked: 'border-slate-200 bg-slate-50 opacity-50',
                  };

                  const StepBadge: React.FC<{
                    num: number;
                    state: 'done' | 'active' | 'locked';
                  }> = ({ num, state }) => (
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[11px] font-extrabold ${
                        state === 'done'
                          ? 'bg-emerald-600 text-white'
                          : state === 'active'
                            ? 'bg-navy-700 text-white'
                            : 'bg-slate-300 text-slate-500'
                      }`}
                    >
                      {state === 'done' ? <CheckCheck className="w-3.5 h-3.5" /> : num}
                    </div>
                  );

                  const step1State = stepState(locConfirmed, false);
                  const step2State = stepState(hasPhotos, !locConfirmed);
                  const step3State = stepState(false, !allReady);

                  return (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 mb-1">
                        <ShieldCheck className="w-3.5 h-3.5 text-navy-700" />
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-navy-800">
                          PM On-Site Verification — Complete all 3 steps
                        </span>
                      </div>

                      {/* STEP 1 — Confirm Location */}
                      <div className={`rounded-xl border p-3 space-y-2 ${stepClasses[step1State]}`}>
                        <div className="flex items-center gap-2">
                          <StepBadge num={1} state={step1State} />
                          <div className="flex-1">
                            <p className="text-xs font-semibold text-slate-800">
                              Confirm Location On-Site
                            </p>
                            <p className="text-[10px] text-slate-500">
                              Physically verify that city, locality, and coordinates match the
                              property record.
                            </p>
                          </div>
                          {locConfirmed && (
                            <span className="text-[10px] text-emerald-700 font-bold">
                              Confirmed ✓
                            </span>
                          )}
                        </div>
                        {!locConfirmed && (
                          <button
                            onClick={async () => {
                              try {
                                const res = await fetchWithAuth(
                                  `${API_BASE_URL}/properties/${selectedProperty.id}/confirm-location`,
                                  { method: 'POST' },
                                );
                                const d = await res.json();
                                if (res.ok) {
                                  showToast('Location confirmed on-site', 'success');
                                  fetchProperties();
                                  setSelectedProperty((prev) =>
                                    prev ? { ...prev, location_confirmed_by_pm: true } : prev,
                                  );
                                } else {
                                  await handleApiError(res, showError, d);
                                }
                              } catch {
                                showError({ message: 'Network error' });
                              }
                            }}
                            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 bg-navy-700 hover:bg-navy-800 text-white text-xs font-bold rounded-lg"
                          >
                            <MapPin className="w-3.5 h-3.5" />I Have Verified the Location On-Site
                          </button>
                        )}
                      </div>

                      {/* STEP 2 — Upload Site Photos */}
                      <div className={`rounded-xl border p-3 space-y-2 ${stepClasses[step2State]}`}>
                        <div className="flex items-center gap-2">
                          <StepBadge num={2} state={step2State} />
                          <div className="flex-1">
                            <p className="text-xs font-semibold text-slate-800">
                              Upload Site Photos
                            </p>
                            <p className="text-[10px] text-slate-500">
                              {hasPhotos
                                ? `${pmUploadedImages.length} photo${pmUploadedImages.length > 1 ? 's' : ''} uploaded by you.`
                                : "At least 1 photo uploaded by you is required — seller photos don't count."}
                            </p>
                          </div>
                          {hasPhotos && (
                            <span className="text-[10px] text-emerald-700 font-bold">
                              {pmUploadedImages.length} ✓
                            </span>
                          )}
                        </div>
                        {step2State !== 'locked' && (
                          <div className="relative">
                            <input
                              type="file"
                              id={`pm-verify-img-${selectedProperty.id}`}
                              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                              accept="image/*"
                              onChange={async (e) => {
                                const file = e.target.files?.[0];
                                if (!file) return;
                                const formData = new FormData();
                                formData.append('image', file);
                                try {
                                  const res = await fetchWithAuth(
                                    `${API_BASE_URL}/properties/${selectedProperty.id}/images`,
                                    {
                                      method: 'POST',
                                      body: formData,
                                    },
                                  );
                                  if (res.ok) {
                                    showToast('Photo uploaded', 'success');
                                    fetchProperties();
                                    setSelectedProperty(null);
                                  } else {
                                    showError({ message: 'Upload failed' });
                                  }
                                } catch {
                                  showError({ message: 'Network error' });
                                }
                              }}
                            />
                            <label
                              htmlFor={`pm-verify-img-${selectedProperty.id}`}
                              className={`w-full flex items-center justify-center gap-1.5 px-3 py-2 border-2 border-dashed rounded-lg cursor-pointer text-xs font-bold transition-colors ${
                                hasPhotos
                                  ? 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                                  : 'border-navy-300 text-navy-700 hover:bg-navy-50'
                              }`}
                            >
                              <Camera className="w-3.5 h-3.5" />
                              {hasPhotos ? 'Upload Another Photo' : 'Upload Site Photo'}
                            </label>
                          </div>
                        )}
                      </div>

                      {/* STEP 3 — Verify or Reject */}
                      <div className={`rounded-xl border p-3 space-y-2 ${stepClasses[step3State]}`}>
                        <div className="flex items-center gap-2">
                          <StepBadge num={3} state={step3State} />
                          <div className="flex-1">
                            <p className="text-xs font-semibold text-slate-800">
                              Submit Verification Decision
                            </p>
                            <p className="text-[10px] text-slate-500">
                              {allReady
                                ? 'All pre-conditions met. Ready to verify.'
                                : 'Complete steps 1 and 2 first.'}
                            </p>
                          </div>
                          {!allReady && <Lock className="w-3.5 h-3.5 text-slate-400" />}
                        </div>
                        <textarea
                          rows={2}
                          placeholder="PM on-site inspection notes (optional for approval, required for rejection)..."
                          value={actionNotes}
                          onChange={(e) => setActionNotes(e.target.value)}
                          disabled={!allReady}
                          className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-navy-600 disabled:opacity-40 disabled:cursor-not-allowed"
                        />
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handlePMVerify(selectedProperty.id, true)}
                            disabled={!allReady}
                            className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 bg-emerald-700 hover:bg-emerald-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow"
                          >
                            <CheckCheck className="w-3.5 h-3.5" />
                            Approve — Pass Verification
                          </button>
                          <button
                            onClick={() => handlePMVerify(selectedProperty.id, false)}
                            className="px-4 py-2 bg-rose-100 hover:bg-rose-200 text-rose-800 font-bold text-xs rounded-xl border border-rose-300"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })()}

              {/* Stage 2 Action for DM Head — assign executive + provide SEO hints */}
              {selectedProperty.status === 'PENDING_DM_POLISH' && (
                <div className="space-y-2">
                  <p className="text-xs text-slate-600">
                    Digital Marketing Team SEO &amp; Listing Content Polish.
                  </p>

                  {/* DMH must pick the executive who will do the work */}
                  {user?.permissions?.includes(Permissions.PROPERTIES_DM_POLISH) && (
                    <div className="space-y-1">
                      <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                        Assign to Digital Marketing Executive *
                      </label>
                      <select
                        value={dmExecutiveId}
                        onChange={(e) => setDmExecutiveId(e.target.value)}
                        className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl focus:ring-1 focus:ring-navy-500"
                      >
                        <option value="" disabled className="text-slate-800 bg-white">
                          Select DM Executive...
                        </option>
                        {dmExecutives.map((dm) => (
                          <option key={dm.id} value={dm.id} className="text-slate-800 bg-white">
                            {formatEmployeeLabel(dm)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  <input
                    type="text"
                    placeholder="SEO Title Tag (e.g. Luxury 3BHK Villa Miyapur)"
                    value={seoTitle}
                    onChange={(e) => setSeoTitle(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl"
                  />
                  <input
                    type="text"
                    placeholder="SEO Keywords (comma separated)"
                    value={seoKeywords}
                    onChange={(e) => setSeoKeywords(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-xl"
                  />
                  {user?.permissions?.includes(Permissions.PROPERTIES_DM_POLISH) && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleDMPolish(selectedProperty.id)}
                        disabled={!dmExecutiveId}
                        className="px-4 py-2 bg-navy-700 hover:bg-navy-800 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold text-xs rounded-xl shadow flex items-center gap-1.5"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Assign &amp; Send to DM Polish</span>
                      </button>
                      <button
                        onClick={() => handleDmVerifyAsIs(selectedProperty.id)}
                        title="Listing content is already good — skip SEO polish and send straight to MD for approval"
                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl border border-slate-300"
                      >
                        Verify As-Is
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* REJECTED — this used to be a dead end with no way forward */}
              {selectedProperty.status === 'REJECTED' &&
                (() => {
                  const isCreator = selectedProperty.created_by?.id === user?.id;
                  const isMDOrAdmin = ([Roles.MD, Roles.ADMIN] as string[]).includes(activeRole);
                  const isUnassigned = !selectedProperty.assigned_pm;
                  const canResubmit = isCreator || (isMDOrAdmin && isUnassigned);

                  if (!canResubmit) {
                    return (
                      <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl">
                        <p className="text-xs text-rose-800 font-bold mb-1">Property Rejected</p>
                        <p className="text-[11px] text-rose-700">
                          This property was rejected and needs to be fixed and resubmitted by the
                          person who created it (
                          {selectedProperty.created_by?.full_name || 'System'}).
                        </p>
                        {selectedProperty.rejection_reason && (
                          <div className="mt-2 p-2 bg-white/50 border border-rose-100 rounded text-xs text-rose-800">
                            <span className="font-bold">Rejection reason: </span>
                            {selectedProperty.rejection_reason}
                          </div>
                        )}
                      </div>
                    );
                  }

                  return (
                    <div className="space-y-2">
                      {selectedProperty.rejection_reason && (
                        <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
                          <span className="font-bold">Rejection reason: </span>
                          {selectedProperty.rejection_reason}
                        </div>
                      )}
                      <p className="text-xs text-slate-600">
                        Fix the issue above, then resubmit this property for verification.
                      </p>
                      <textarea
                        rows={2}
                        placeholder="Notes for MD/PM about what was fixed (optional)..."
                        value={actionNotes}
                        onChange={(e) => setActionNotes(e.target.value)}
                        className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl"
                      />
                      <button
                        onClick={() => handleResubmit(selectedProperty.id)}
                        className="px-4 py-2 bg-navy-700 hover:bg-navy-800 text-white font-bold text-xs rounded-xl shadow"
                      >
                        Resubmit for Verification
                      </button>
                    </div>
                  );
                })()}

              {/* Stage 3 Action for MD */}
              {selectedProperty.status === 'PENDING_MD_APPROVAL' &&
                user?.permissions?.includes(Permissions.PROPERTIES_MD_APPROVE) && (
                  <div className="space-y-2">
                    <p className="text-xs text-slate-600">
                      Managing Director Final Review & Go-Live Decision.
                    </p>
                    <textarea
                      rows={2}
                      placeholder="Enter MD final review comments..."
                      value={actionNotes}
                      onChange={(e) => setActionNotes(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-xl"
                    />
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleMDApprove(selectedProperty.id, true)}
                        className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-extrabold text-xs rounded-xl shadow"
                      >
                        🚀 APPROVE & MAKE LIVE
                      </button>
                      <button
                        onClick={() => handleMDApprove(selectedProperty.id, false)}
                        className="px-4 py-2 bg-rose-100 hover:bg-rose-200 text-rose-800 font-bold text-xs rounded-xl border border-rose-300"
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                )}

              {selectedProperty.status === 'LIVE' && (
                <p className="text-xs font-bold text-emerald-800 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  This property is LIVE and visible on public CRM portal!
                </p>
              )}
            </div>

            {/* Full Property Details — everything a telecaller needs to
                explain this property to a customer on a call, laid out like
                a public listing page: overview, specs, amenities,
                category-specific facts, then the full pricing breakdown. */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                  Property Details
                </h4>
                {selectedProperty.sales_status && (
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border ${
                      selectedProperty.sales_status === 'AVAILABLE'
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : selectedProperty.sales_status === 'BOOKED' ||
                            selectedProperty.sales_status === 'SOLD'
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                    }`}
                  >
                    {selectedProperty.sales_status.replace(/_/g, ' ')}
                  </span>
                )}
              </div>

              <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-4">
                {selectedProperty.description && (
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                      Overview
                    </span>
                    <p className="text-xs text-slate-700 leading-relaxed">
                      {selectedProperty.description}
                    </p>
                  </div>
                )}

                {/* Address — full location, not just the short display name */}
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1">
                    Address
                  </span>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    {[selectedProperty.address, selectedProperty.location]
                      .filter(Boolean)
                      .join(', ') || '—'}
                  </p>
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1.5">
                    Specifications
                  </span>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                    <div>
                      <span className="text-slate-400 block">Category</span>
                      <span className="font-bold text-slate-800">
                        {selectedProperty.category?.replace(/_/g, ' ')}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block">Area</span>
                      <span className="font-bold text-slate-800">
                        {selectedProperty.area_sqft ? `${selectedProperty.area_sqft} sq.ft` : '—'}
                        {selectedProperty.plot_area_sqyd
                          ? ` (${selectedProperty.plot_area_sqyd} sq.yd)`
                          : ''}
                      </span>
                    </div>
                    {selectedProperty.carpet_area_sqft != null && (
                      <div>
                        <span className="text-slate-400 block">Carpet Area</span>
                        <span className="font-bold text-slate-800">
                          {selectedProperty.carpet_area_sqft} sq.ft
                        </span>
                      </div>
                    )}
                    {selectedProperty.built_up_area_sqft != null && (
                      <div>
                        <span className="text-slate-400 block">Built-up Area</span>
                        <span className="font-bold text-slate-800">
                          {selectedProperty.built_up_area_sqft} sq.ft
                        </span>
                      </div>
                    )}
                    {selectedProperty.super_built_up_area_sqft != null && (
                      <div>
                        <span className="text-slate-400 block">Super Built-up Area</span>
                        <span className="font-bold text-slate-800">
                          {selectedProperty.super_built_up_area_sqft} sq.ft
                        </span>
                      </div>
                    )}
                    {(selectedProperty.bedrooms != null || selectedProperty.bathrooms != null) && (
                      <div>
                        <span className="text-slate-400 block">Bed / Bath</span>
                        <span className="font-bold text-slate-800">
                          {selectedProperty.bedrooms ?? '—'} BHK /{' '}
                          {selectedProperty.bathrooms ?? '—'} Bath
                        </span>
                      </div>
                    )}
                    {selectedProperty.facing && (
                      <div>
                        <span className="text-slate-400 block">Facing</span>
                        <span className="font-bold text-slate-800">
                          {selectedProperty.facing.replace(/_/g, '-')}
                        </span>
                      </div>
                    )}
                    {selectedProperty.view && (
                      <div>
                        <span className="text-slate-400 block">View</span>
                        <span className="font-bold text-slate-800">{selectedProperty.view}</span>
                      </div>
                    )}
                    {selectedProperty.total_floors != null && (
                      <div>
                        <span className="text-slate-400 block">Total Floors</span>
                        <span className="font-bold text-slate-800">
                          {selectedProperty.total_floors}
                        </span>
                      </div>
                    )}
                    {selectedProperty.construction_year != null && (
                      <div>
                        <span className="text-slate-400 block">Built In</span>
                        <span className="font-bold text-slate-800">
                          {selectedProperty.construction_year}
                        </span>
                      </div>
                    )}
                    {selectedProperty.possession_status && (
                      <div>
                        <span className="text-slate-400 block">Possession</span>
                        <span className="font-bold text-slate-800">
                          {selectedProperty.possession_status.replace(/_/g, ' ')}
                        </span>
                      </div>
                    )}
                    {selectedProperty.listing_type && (
                      <div>
                        <span className="text-slate-400 block">Listing Type</span>
                        <span className="font-bold text-slate-800">
                          {selectedProperty.listing_type}
                        </span>
                      </div>
                    )}
                    {selectedProperty.road_width_ft != null && (
                      <div>
                        <span className="text-slate-400 block">Road Width</span>
                        <span className="font-bold text-slate-800">
                          {selectedProperty.road_width_ft} ft
                        </span>
                      </div>
                    )}
                    {selectedProperty._count != null && (
                      <div>
                        <span className="text-slate-400 block">Interested Leads</span>
                        <span className="font-bold text-slate-800">
                          {selectedProperty._count.interested_leads}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {(selectedProperty.is_corner ||
                  selectedProperty.is_park_facing ||
                  selectedProperty.is_road_facing ||
                  selectedProperty.is_main_road_facing ||
                  selectedProperty.is_premium_location) && (
                  <div className="flex flex-wrap gap-1.5">
                    {selectedProperty.is_corner && (
                      <span className="px-2 py-0.5 bg-navy-50 text-navy-700 border border-navy-200 rounded-full text-[10px] font-bold">
                        Corner
                      </span>
                    )}
                    {selectedProperty.is_park_facing && (
                      <span className="px-2 py-0.5 bg-navy-50 text-navy-700 border border-navy-200 rounded-full text-[10px] font-bold">
                        Park Facing
                      </span>
                    )}
                    {selectedProperty.is_road_facing && (
                      <span className="px-2 py-0.5 bg-navy-50 text-navy-700 border border-navy-200 rounded-full text-[10px] font-bold">
                        Road Facing
                      </span>
                    )}
                    {selectedProperty.is_main_road_facing && (
                      <span className="px-2 py-0.5 bg-navy-50 text-navy-700 border border-navy-200 rounded-full text-[10px] font-bold">
                        Main Road Facing
                      </span>
                    )}
                    {selectedProperty.is_premium_location && (
                      <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-[10px] font-bold">
                        Premium Location
                      </span>
                    )}
                  </div>
                )}

                {selectedProperty.amenities && (
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1.5">
                      Amenities
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {selectedProperty.amenities
                        .split(',')
                        .map((a) => a.trim())
                        .filter(Boolean)
                        .map((a) => (
                          <span
                            key={a}
                            className="px-2 py-0.5 bg-white border border-slate-200 rounded-full text-[10px] font-semibold text-slate-600"
                          >
                            {a}
                          </span>
                        ))}
                    </div>
                  </div>
                )}

                {listPopulatedDetailFields(getCategoryDetails(selectedProperty)).length > 0 && (
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1.5">
                      {selectedProperty.category?.replace(/_/g, ' ')} Details
                    </span>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-xs">
                      {listPopulatedDetailFields(getCategoryDetails(selectedProperty)).map(
                        ([label, value]) => (
                          <div key={label}>
                            <span className="text-slate-400 block">{label}</span>
                            <span className="font-bold text-slate-800">{value}</span>
                          </div>
                        ),
                      )}
                    </div>
                  </div>
                )}

                {/* Pricing breakdown — same base rate → premiums → charges →
                    taxes → discount → final price chain the pricing engine
                    itself computes (services/pricing/engine.ts), so a
                    telecaller can explain exactly how the number was reached. */}
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block mb-1.5">
                    Pricing Breakdown
                  </span>
                  <div className="bg-white rounded-xl border border-slate-200 p-3 space-y-1.5 text-xs">
                    {selectedProperty.base_rate != null && (
                      <div className="flex justify-between text-slate-500">
                        <span>
                          Base Rate{' '}
                          {selectedProperty.price_basis
                            ? `(${selectedProperty.price_basis.replace(/_/g, ' ')})`
                            : ''}
                        </span>
                        <span>₹{selectedProperty.base_rate.toLocaleString('en-IN')}</span>
                      </div>
                    )}
                    <div className="flex justify-between text-slate-500">
                      <span>Base Price</span>
                      <span>₹{(selectedProperty.base_price ?? 0).toLocaleString('en-IN')}</span>
                    </div>
                    {selectedProperty.premiums_total > 0 && (
                      <div className="flex justify-between text-slate-500">
                        <span>Premiums</span>
                        <span>+ ₹{selectedProperty.premiums_total.toLocaleString('en-IN')}</span>
                      </div>
                    )}
                    {selectedProperty.charges_total > 0 && (
                      <div className="flex justify-between text-slate-500">
                        <span>Charges</span>
                        <span>+ ₹{selectedProperty.charges_total.toLocaleString('en-IN')}</span>
                      </div>
                    )}
                    {selectedProperty.taxes_total > 0 && (
                      <div className="flex justify-between text-slate-500">
                        <span>Taxes</span>
                        <span>+ ₹{selectedProperty.taxes_total.toLocaleString('en-IN')}</span>
                      </div>
                    )}
                    {(selectedProperty.discount_amount ?? 0) > 0 && (
                      <div className="flex justify-between text-emerald-600">
                        <span>Discount</span>
                        <span>
                          − ₹{(selectedProperty.discount_amount ?? 0).toLocaleString('en-IN')}
                        </span>
                      </div>
                    )}
                    {selectedProperty.override_price != null && (
                      <div className="flex justify-between text-amber-600">
                        <span>
                          MD Override
                          {selectedProperty.override_reason
                            ? ` (${selectedProperty.override_reason})`
                            : ''}
                        </span>
                        <span>₹{selectedProperty.override_price.toLocaleString('en-IN')}</span>
                      </div>
                    )}
                    <div className="pt-1.5 mt-1 border-t border-slate-200 flex items-center justify-between">
                      <span className="text-[10px] text-slate-400 uppercase font-bold">
                        Final Price
                      </span>
                      <span className="font-extrabold text-navy-800 text-sm">
                        ₹{((selectedProperty.final_price ?? 0) / 100000).toFixed(2)} Lakhs
                      </span>
                    </div>
                    {selectedProperty.area_sqft > 0 && (
                      <div className="flex justify-between text-slate-400 text-[10px]">
                        <span>Price per sq.ft</span>
                        <span>
                          ₹
                          {Math.round(
                            (selectedProperty.final_price ?? 0) / selectedProperty.area_sqft,
                          ).toLocaleString('en-IN')}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Property Media / Images */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                  Property Images
                </h4>
                <div className="relative">
                  <input
                    type="file"
                    id={`upload-img-${selectedProperty.id}`}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
                    accept="image/*"
                    multiple
                    disabled={dossierImageBusy}
                    onChange={async (e) => {
                      const files = e.target.files;
                      if (!files || files.length === 0) return;
                      setDossierImageBusy(true);
                      try {
                        // Upload sequentially so one failure doesn't abort the
                        // rest, and images land in the order they were picked.
                        for (const file of Array.from(files)) {
                          const formData = new FormData();
                          formData.append('image', file);
                          try {
                            const res = await fetchWithAuth(
                              `${API_BASE_URL}/properties/${selectedProperty.id}/images`,
                              {
                                method: 'POST',
                                body: formData, // browser sets content-type multipart/form-data
                              },
                            );
                            if (res.ok) {
                              const data = await res.json();
                              setSelectedProperty((prev) =>
                                prev && prev.id === selectedProperty.id
                                  ? { ...prev, images: [...(prev.images || []), data.image] }
                                  : prev,
                              );
                            } else {
                              showError({ message: `Failed to upload ${file.name}` });
                            }
                          } catch (err) {
                            showError(
                              toUserFacingError({
                                message: err instanceof Error ? err.message : String(err),
                                body: err,
                              }),
                            );
                          }
                        }
                        showToast(
                          files.length > 1 ? 'Photos uploaded' : 'Photo uploaded',
                          'success',
                        );
                        fetchProperties();
                      } finally {
                        setDossierImageBusy(false);
                        e.target.value = '';
                      }
                    }}
                  />
                  <label
                    htmlFor={`upload-img-${selectedProperty.id}`}
                    className={`px-3 py-1.5 font-bold text-xs rounded-lg flex items-center gap-1 transition-colors ${dossierImageBusy ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-navy-50 hover:bg-navy-100 text-navy-700 cursor-pointer'}`}
                  >
                    <ImageIcon className="w-4 h-4" />
                    {dossierImageBusy ? 'Uploading...' : 'Upload Photos'}
                  </label>
                </div>
              </div>

              {selectedProperty.images && selectedProperty.images.length > 0 ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {selectedProperty.images.map((img: PropertyImage) => (
                    <div
                      key={img.id}
                      className="relative group rounded-xl overflow-hidden border border-slate-200 aspect-square"
                    >
                      <img
                        src={resolveImageUrl(img.image_url)}
                        alt="Property"
                        className="w-full h-full object-cover"
                      />
                      {img.is_primary && (
                        <div className="absolute top-2 left-2 bg-navy-600 text-white text-[10px] font-bold px-2 py-0.5 rounded shadow">
                          COVER
                        </div>
                      )}
                      {/* Always visible below md — hover never fires on touch,
                          which would otherwise hide these actions entirely on
                          phones/tablets. Desktop keeps the hover reveal. */}
                      <div className="absolute inset-0 bg-slate-900/50 opacity-100 md:opacity-0 md:group-hover:opacity-100 flex items-center justify-center gap-2 transition-opacity">
                        {!img.is_primary && (
                          <button
                            disabled={dossierImageBusy}
                            onClick={async () => {
                              setDossierImageBusy(true);
                              try {
                                const res = await fetchWithAuth(
                                  `${API_BASE_URL}/properties/${selectedProperty.id}/images/${img.id}`,
                                  {
                                    method: 'PUT',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ is_primary: true }),
                                  },
                                );
                                if (res.ok) {
                                  setSelectedProperty((prev) =>
                                    prev && prev.id === selectedProperty.id
                                      ? {
                                          ...prev,
                                          images: (prev.images || []).map((i) => ({
                                            ...i,
                                            is_primary: i.id === img.id,
                                          })),
                                        }
                                      : prev,
                                  );
                                  showToast('Cover photo updated', 'success');
                                  fetchProperties();
                                } else {
                                  showError({ message: 'Failed to set cover photo' });
                                }
                              } catch (err) {
                                showError(
                                  toUserFacingError({
                                    message: err instanceof Error ? err.message : String(err),
                                    body: err,
                                  }),
                                );
                              } finally {
                                setDossierImageBusy(false);
                              }
                            }}
                            className="p-1.5 bg-white text-amber-600 rounded-full hover:bg-amber-50 shadow disabled:opacity-50"
                            title="Set as cover"
                          >
                            <Star className="w-4 h-4" />
                          </button>
                        )}
                        {confirmDeleteImageId === img.id ? (
                          <button
                            disabled={dossierImageBusy}
                            onClick={async () => {
                              setDossierImageBusy(true);
                              try {
                                const res = await fetchWithAuth(
                                  `${API_BASE_URL}/properties/${selectedProperty.id}/images/${img.id}`,
                                  { method: 'DELETE' },
                                );
                                if (res.ok) {
                                  setSelectedProperty((prev) =>
                                    prev && prev.id === selectedProperty.id
                                      ? {
                                          ...prev,
                                          images: (prev.images || []).filter(
                                            (i) => i.id !== img.id,
                                          ),
                                        }
                                      : prev,
                                  );
                                  showToast('Image deleted', 'success');
                                  fetchProperties();
                                } else {
                                  showError({ message: 'Failed to delete image' });
                                }
                              } catch (err) {
                                showError(
                                  toUserFacingError({
                                    message: err instanceof Error ? err.message : String(err),
                                    body: err,
                                  }),
                                );
                              } finally {
                                setDossierImageBusy(false);
                                setConfirmDeleteImageId(null);
                              }
                            }}
                            className="px-2.5 py-1.5 bg-rose-600 text-white text-[11px] font-bold rounded-full hover:bg-rose-700 shadow disabled:opacity-50 whitespace-nowrap"
                            title="Click again to confirm delete"
                          >
                            Confirm Delete?
                          </button>
                        ) : (
                          <button
                            disabled={dossierImageBusy}
                            onClick={() => setConfirmDeleteImageId(img.id)}
                            className="p-1.5 bg-white text-rose-600 rounded-full hover:bg-rose-50 shadow disabled:opacity-50"
                            title="Delete"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-slate-500 italic bg-slate-50 p-4 rounded-xl text-center">
                  No images uploaded yet.
                </div>
              )}
            </div>

            {/* Audit & Verification History Log */}
            <div className="space-y-2">
              <h4 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                Verification History Log
              </h4>
              <div className="space-y-2 border-l-2 border-slate-200 pl-4 text-xs">
                {selectedProperty.verification_logs?.map((log: VerificationLogItem) => (
                  <div key={log.id} className="space-y-0.5">
                    <div className="font-bold text-slate-800 flex items-center justify-between">
                      <span>{log.actor?.full_name || log.actor?.employee_code}</span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {new Date(log.created_at || '').toLocaleTimeString([], {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <p className="text-slate-600 text-[11px]">{log.notes}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Property (same PropertyForm as Add, pre-filled — the fix for
          "Edit is a lesser form than Add", implementation plan section 8.2) */}
      {showEditModal && selectedProperty && (
        <PropertyForm
          mode="edit"
          property={selectedProperty}
          onClose={() => setShowEditModal(false)}
          onSuccess={() => {
            setShowEditModal(false);
            fetchProperties();
            setSelectedProperty(null);
          }}
        />
      )}
    </div>
  );
};
