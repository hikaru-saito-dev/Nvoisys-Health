import { Stack } from 'expo-router';

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function DoctorStackLayout() {
  const scheme = useColorScheme() ?? 'light';
  const c = Colors[scheme];

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerBackTitle: 'Back',
        headerTintColor: c.tint,
        headerStyle: { backgroundColor: c.background },
        headerTitleStyle: { fontWeight: '800', fontSize: 17, color: c.text },
        headerShadowVisible: false,
      }}
    />
  );
}
