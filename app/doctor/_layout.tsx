import { Stack } from 'expo-router';

import { PatientTheme } from '@/constants/patient-theme';

export default function DoctorStackLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerBackTitle: 'Back',
        headerTintColor: PatientTheme.brand,
        headerStyle: { backgroundColor: PatientTheme.bg },
        headerTitleStyle: { fontWeight: '800', fontSize: 17, color: PatientTheme.text },
        headerShadowVisible: false,
      }}
    />
  );
}
