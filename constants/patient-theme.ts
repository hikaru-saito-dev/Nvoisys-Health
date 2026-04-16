/**
 * Patient-flow surface tokens aligned with `constants/theme` (main template).
 */

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export type PatientUiTokens = {
  bg: string;
  bgElevated: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  border: string;
  borderFocus: string;
  brand: string;
  brandDark: string;
  brandMuted: string;
  success: string;
  successMuted: string;
  danger: string;
  dangerMuted: string;
  radiusSm: number;
  radiusMd: number;
  radiusLg: number;
  radiusFull: number;
  shadowCard: {
    shadowColor: string;
    shadowOffset: { width: number; height: number };
    shadowOpacity: number;
    shadowRadius: number;
    elevation: number;
  };
  shadowSoft: {
    shadowColor: string;
    shadowOffset: { width: number; height: number };
    shadowOpacity: number;
    shadowRadius: number;
    elevation: number;
  };
};

const radii = {
  radiusSm: 10,
  radiusMd: 14,
  radiusLg: 20,
  radiusFull: 999,
} as const;

const shadows = {
  shadowCard: {
    shadowColor: '#11181C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  shadowSoft: {
    shadowColor: '#11181C',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
} as const;

function buildPatientUi(scheme: 'light' | 'dark'): PatientUiTokens {
  const c = Colors[scheme];
  return {
    bg: c.background,
    bgElevated: scheme === 'light' ? '#ffffff' : '#1e2326',
    text: c.text,
    textSecondary: c.icon,
    textMuted: scheme === 'light' ? '#687076' : '#9BA1A6',
    border: scheme === 'light' ? '#e4e9f2' : '#2c3238',
    borderFocus: scheme === 'light' ? '#c5cee0' : '#4a5568',
    brand: c.tint,
    brandDark: scheme === 'light' ? '#086278' : '#ECEDEE',
    brandMuted: scheme === 'light' ? '#e3f4f8' : '#1d3d47',
    success: '#0d9488',
    successMuted: '#ccfbf1',
    danger: '#c62828',
    dangerMuted: '#ffebee',
    ...radii,
    ...shadows,
  };
}

/** Use in patient screens so surfaces track the same palette as the main template. */
export function usePatientUi(): PatientUiTokens {
  const scheme = useColorScheme() ?? 'light';
  return buildPatientUi(scheme);
}
