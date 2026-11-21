# Android APK & Google Play Store Guide (Capacitor — 100% Offline Bundle)

This project is configured with **Capacitor** (`com.foresttreatmentmap.app`) so all web assets, survey grid math, PDF/KMZ exporters, and offline storage are bundled directly inside the Android `.apk` / `.aab` file.

---

## Option A: Build Signed `.aab` / `.apk` Locally with Android Studio (Recommended for Play Store)

### Prerequisites
- **Node.js 20+**
- **Android Studio** (includes JDK 21 & Android SDK)

### 1. Build & Sync Web Code into Android
```bash
npm install
npm run android:sync
```

### 2. Open in Android Studio
```bash
npm run android:open
```
Wait for Gradle sync to finish in Android Studio.

### 3. Generate a Play Store Signed `.aab` (or Shareable `.apk`)
1. In Android Studio, click **Build → Generate Signed App Bundle / APK...**
2. Choose **Android App Bundle** (for Google Play Store) or **APK** (for direct WhatsApp install).
3. Click **Create new...** to create a signing keystore (`.jks` file).
   - **Important:** Back up your `.jks` keystore file and passwords safely! Google Play requires the same upload key for future updates.
4. Select **release** build variant and click **Create**.
5. Your Play Store file will be generated at:
   `android/app/release/app-release.aab`

---

## Option B: Build a Test `.apk` Without Android Studio (GitHub Actions)
1. Push this project to a GitHub repository.
2. Open the **Actions** tab → **Build Android APK & Play Store AAB** → **Run workflow**.
3. Download the compiled `.apk` artifact from the completed run and install it directly on your Android phone.

---

## Google Play Console Submission Checklist
1. **Developer Account**: Register at https://play.google.com/console ($25 one-time fee).
2. **Privacy Policy URL**: Host `public/privacy-policy.html` on any public HTTPS page (e.g. GitHub Pages, Netlify, Vercel, or Cloud Run) and paste that URL into Play Console → **App content → Privacy policy**.
3. **Data Safety**:
   - Location (Precise GPS): Used strictly on-device for forestry boundary walks and survey points; **not** collected, transmitted, or shared with third parties.
   - No user accounts, no ads, no third-party tracking.
4. **Permissions Included in `AndroidManifest.xml`**:
   - `ACCESS_FINE_LOCATION` & `ACCESS_COARSE_LOCATION` (field GNSS)
   - `WAKE_LOCK` (keeps screen awake during boundary walks)
   - `INTERNET` & `ACCESS_NETWORK_STATE` (optional satellite/topo tile downloads)
5. **Upload `.aab`**: Upload `app-release.aab` to **Closed testing** (12 testers for 14 days for personal Play accounts) or **Production**.
