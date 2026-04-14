/**
 * Shared visual tokens for patient flows (Nvoisys Health).
 */
export const PatientTheme = {
  bg: '#f1f4f9',
  bgElevated: '#ffffff',
  text: '#0c1222',
  textSecondary: '#5c6578',
  textMuted: '#8b95a8',
  border: '#e4e9f2',
  borderFocus: '#c5cee0',
  brand: '#3949ab',
  brandDark: '#2e3a8f',
  brandMuted: '#e8eaf6',
  success: '#0d9488',
  successMuted: '#ccfbf1',
  danger: '#c62828',
  dangerMuted: '#ffebee',
  radiusSm: 10,
  radiusMd: 14,
  radiusLg: 20,
  radiusFull: 999,
  shadowCard: {
    shadowColor: '#0c1222',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.07,
    shadowRadius: 12,
    elevation: 3,
  },
  shadowSoft: {
    shadowColor: '#0c1222',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 1,
  },
} as const;
