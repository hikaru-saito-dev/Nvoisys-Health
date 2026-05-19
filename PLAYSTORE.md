# Google Play Store (AAB)

## Build the App Bundle

1. Install dependencies (once per machine):

   ```bash
   npm install
   ```

2. Log in to Expo (once):

   ```bash
   npx eas login
   ```

   EAS CLI must be **18.7+** (installed via `npm install` in this project).

3. Build production AAB (Google Play format):

   ```bash
   npm run build:playstore
   ```

   Or:

   ```bash
   npx eas build -p android --profile production
   ```

4. When the build finishes, open the link in the terminal or go to [expo.dev](https://expo.dev) → your project → Builds → download the **`.aab`** file.

5. Send the **`.aab`** to your client for upload in **Google Play Console → Release → Create release**.

**Package name** must be `com.nvoisys.health` (set in `app.json`). If Play Console rejects the bundle for `com.anonymous.myapp`, rebuild after updating the package and upload the new AAB.

## EAS environment variables (cloud builds)

`.env` is not uploaded to EAS. In [expo.dev](https://expo.dev) → Project → **Environment variables**, add for the **production** profile:

- `EXPO_PUBLIC_AI_API_KEY`
- `EXPO_PUBLIC_AI_BASE_URL` (optional if set in app.json)
- `EXPO_PUBLIC_AI_MODEL` (optional)
- `EXPO_PUBLIC_AI_PREDICT_URL` (optional)

## Profiles

| Command | Output | Use |
|---------|--------|-----|
| `npm run build:playstore` | `.aab` | Google Play Store |
| `npm run build:preview` | `.apk` | Internal testing |

## First production build

EAS will ask to create an Android **upload keystore**. Choose **Let EAS manage credentials** unless your client already has a keystore for this app.
