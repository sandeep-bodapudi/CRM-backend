import type {
  UnitType,
  ChargeCategory,
  ChargeCalcMethod,
  PriceBasisCode,
} from '../../api/projectUnits';

// One place that says what each kind of unit is sold on, so every project
// screen (wizard, pricing rules, sample calculator, Add Unit, Generate Units)
// shows a plot's fields for a plot and a flat's fields for a flat — never both.
// Owner's decisions 2026-11-02: plots per Sq.Yd of plot area, flats on super
// built-up Sq.Ft, no GST on plot sales.

export const ALL_UNIT_TYPES: UnitType[] = ['PLOT', 'FLAT', 'VILLA', 'HOUSE', 'COMMERCIAL', 'OTHER'];

export const UNIT_TYPE_LABEL: Record<UnitType, string> = {
  PLOT: 'Plot',
  FLAT: 'Flat',
  VILLA: 'Villa',
  HOUSE: 'House',
  COMMERCIAL: 'Commercial',
  OTHER: 'Other',
};

/** Which unit types a project of this type sells. Unknown/mixed types allow all. */
const UNIT_TYPES_BY_PROJECT_TYPE: Record<string, UnitType[]> = {
  PLOTTED: ['PLOT'],
  AGRICULTURAL_LAND: ['PLOT'],
  APARTMENT: ['FLAT'],
  VILLA: ['VILLA'],
  ROW_HOUSE: ['VILLA'],
  INDEPENDENT_HOUSE: ['HOUSE'],
  FARM_HOUSE: ['VILLA', 'PLOT'],
  COMMERCIAL_SHOP: ['COMMERCIAL'],
  COMMERCIAL_OFFICE: ['COMMERCIAL'],
  COMMERCIAL: ['COMMERCIAL'],
  MIXED_RESIDENTIAL: ['FLAT', 'VILLA'],
  MIXED_USE: ['FLAT', 'COMMERCIAL'],
};

export function unitTypesForProject(projectType?: string | null): UnitType[] {
  return (projectType && UNIT_TYPES_BY_PROJECT_TYPE[projectType]) || ALL_UNIT_TYPES;
}

/** The area each unit type is priced on. Plot and flat are fixed (server enforces it too). */
export const PRICE_BASIS_BY_UNIT_TYPE: Record<UnitType, PriceBasisCode> = {
  PLOT: 'PLOT_AREA',
  FLAT: 'SUPER_BUILT_UP',
  VILLA: 'BUILT_UP',
  HOUSE: 'BUILT_UP',
  COMMERCIAL: 'SUPER_BUILT_UP',
  OTHER: 'LUMPSUM',
};

export const AREA_UNIT_BY_UNIT_TYPE: Record<UnitType, 'SQYD' | 'SQFT'> = {
  PLOT: 'SQYD',
  FLAT: 'SQFT',
  VILLA: 'SQFT',
  HOUSE: 'SQFT',
  COMMERCIAL: 'SQFT',
  OTHER: 'SQFT',
};

export const PRICE_BASIS_TEXT: Record<UnitType, string> = {
  PLOT: 'per Sq.Yd of plot area',
  FLAT: 'per Sq.Ft of super built-up area',
  VILLA: 'per Sq.Ft of built-up area',
  HOUSE: 'per Sq.Ft of built-up area',
  COMMERCIAL: 'per Sq.Ft of super built-up area',
  OTHER: 'as a lump sum',
};

/** Pricing-rule categories that make sense for the unit type. */
const ALL_CATEGORIES: ChargeCategory[] = [
  'FACING',
  'FLOOR',
  'CORNER',
  'ROAD',
  'PARK',
  'VIEW',
  'BHK',
  'PARKING',
  'INFRA',
  'MAINTENANCE',
  'LEGAL',
  'CLUB',
  'TAX',
  'OTHER',
];
const CATEGORIES_BY_UNIT_TYPE: Partial<Record<UnitType, ChargeCategory[]>> = {
  // No floors, views, BHK or parking on a plot, and no GST on plot sales.
  PLOT: ['FACING', 'CORNER', 'ROAD', 'PARK', 'INFRA', 'MAINTENANCE', 'LEGAL', 'CLUB', 'OTHER'],
  FLAT: [
    'FACING',
    'FLOOR',
    'CORNER',
    'VIEW',
    'BHK',
    'PARKING',
    'INFRA',
    'MAINTENANCE',
    'LEGAL',
    'CLUB',
    'TAX',
    'OTHER',
  ],
};

export function ruleCategoriesFor(unitType: UnitType): ChargeCategory[] {
  return CATEGORIES_BY_UNIT_TYPE[unitType] || ALL_CATEGORIES;
}

/** Rate methods per unit type: Sq.Yd for plots, Sq.Ft (and parking qty) for flats. */
const METHODS_BY_UNIT_TYPE: Partial<Record<UnitType, ChargeCalcMethod[]>> = {
  PLOT: ['PER_SQYD', 'FIXED', 'PERCENT_OF_BASE'],
  FLAT: ['PER_SQFT', 'FIXED', 'PERCENT_OF_BASE', 'QTY_X_RATE'],
};

export function calcMethodsFor(unitType: UnitType): ChargeCalcMethod[] {
  return (
    METHODS_BY_UNIT_TYPE[unitType] || [
      'PER_SQFT',
      'PER_SQYD',
      'FIXED',
      'PERCENT_OF_BASE',
      'QTY_X_RATE',
    ]
  );
}

/** Plot sales carry no GST (owner, 2026-11-02), so a plot rule can't be a tax. */
export function allowsTax(unitType: UnitType): boolean {
  return unitType !== 'PLOT';
}

/** Does this project sell any unit of a type that has floors/towers? */
export function hasBuildings(types: UnitType[]): boolean {
  return types.some((t) => t === 'FLAT' || t === 'COMMERCIAL');
}
