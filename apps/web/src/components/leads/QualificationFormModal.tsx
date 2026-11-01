import React, { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '../common/ui/Button';
import { InputField } from '../common/ui/InputField';
import { SelectField } from '../common/ui/SelectField';
import { LocationListInput } from '../common/ui/LocationListInput';
import { PROPERTY_TYPE_OPTIONS } from '../../constants/propertyTypes';
import { useToast } from '../../context/ToastContext';
import { toUserFacingError } from '../../utils/userFacingError';

export interface QualificationData {
  budget_min?: number;
  budget_max?: number;
  property_type_preference?: string;
  /** @deprecated superseded by preferred_locations (multi-select) */
  preferred_location?: string;
  preferred_locations?: string[];
}

interface QualificationFormModalProps {
  title?: string;
  initialData?: QualificationData;
  requireAllFields?: boolean;
  onSave: (data: QualificationData) => Promise<void>;
  onClose: () => void;
}

export const QualificationFormModal: React.FC<QualificationFormModalProps> = ({
  title = 'Lead Qualification',
  initialData,
  requireAllFields = false,
  onSave,
  onClose,
}) => {
  const seededInitialData: QualificationData = initialData
    ? {
        ...initialData,
        preferred_locations:
          initialData.preferred_locations && initialData.preferred_locations.length > 0
            ? initialData.preferred_locations
            : initialData.preferred_location
              ? [initialData.preferred_location]
              : [],
      }
    : {};
  const [formData, setFormData] = useState<QualificationData>(seededInitialData);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const { showToast } = useToast();

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (requireAllFields) {
      if (formData.budget_min == null) newErrors.budget_min = 'Min budget is required';
      if (formData.budget_max == null) newErrors.budget_max = 'Max budget is required';
      if (!formData.property_type_preference)
        newErrors.property_type_preference = 'Property type is required';
      if (!formData.preferred_locations || formData.preferred_locations.length === 0)
        newErrors.preferred_locations = 'At least one preferred location is required';
    }

    if (formData.budget_min != null && formData.budget_max != null) {
      if (formData.budget_max < formData.budget_min) {
        newErrors.budget_max = 'Max budget cannot be less than Min budget';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const propertyTypeOptions = [...PROPERTY_TYPE_OPTIONS];
  if (
    formData.property_type_preference &&
    !PROPERTY_TYPE_OPTIONS.find((pt) => pt.value === formData.property_type_preference)
  ) {
    propertyTypeOptions.push({
      value: formData.property_type_preference,
      label: formData.property_type_preference,
    });
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setIsSaving(true);
    try {
      await onSave(formData);
      onClose();
    } catch (err: any) {
      if (err.message !== 'SILENT') {
        const formatted = toUserFacingError({ message: err.message });
        showToast({ ...formatted, type: 'error' });
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h2 className="text-xl font-bold text-navy-900">{title}</h2>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 rounded-full hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          <form id="qualification-form" onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <InputField
                label="Min Budget (₹)"
                type="number"
                min={0}
                value={formData.budget_min ?? ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    budget_min: e.target.value === '' ? undefined : Number(e.target.value),
                  })
                }
                error={errors.budget_min}
              />
              <InputField
                label="Max Budget (₹)"
                type="number"
                min={0}
                value={formData.budget_max ?? ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    budget_max: e.target.value === '' ? undefined : Number(e.target.value),
                  })
                }
                error={errors.budget_max}
              />
            </div>

            <SelectField
              label="Property Type Preference"
              placeholder="Select property type..."
              value={formData.property_type_preference || ''}
              onChange={(e) =>
                setFormData({ ...formData, property_type_preference: e.target.value })
              }
              error={errors.property_type_preference}
              options={propertyTypeOptions}
            />

            <LocationListInput
              values={formData.preferred_locations || []}
              onChange={(locations) =>
                setFormData({
                  ...formData,
                  preferred_locations: locations,
                  preferred_location: locations[0],
                })
              }
              placeholder="e.g., Gachibowli, Hyderabad"
              error={errors.preferred_locations}
            />
          </form>
        </div>

        <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-end gap-3">
          <Button type="button" variant="secondary" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button type="submit" form="qualification-form" variant="primary" disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save & Confirm'}
          </Button>
        </div>
      </div>
    </div>
  );
};
