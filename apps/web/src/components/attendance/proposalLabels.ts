// Human-readable names for AttendanceProposal.type codes.
const LABELS: Record<string, string> = {
  LATE_CHECKIN: 'Late arrival',
  LEAVE: 'Leave',
  FIELD_WORK: 'Field work',
  WORK_FROM_HOME: 'Work from home',
  EARLY_CHECKOUT: 'Early logout',
};

export const proposalTypeLabel = (type: string): string =>
  LABELS[type] ||
  type
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase());
