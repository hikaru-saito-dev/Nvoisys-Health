# Nvoisys Health - Remaining work (full project update)

Use this checklist with [`IMPLEMENTATION-ROADMAP.md`](./IMPLEMENTATION-ROADMAP.md) and [`LAUNCH-FEATURES-AUDIT.md`](./LAUNCH-FEATURES-AUDIT.md).

**Last app update:** Code items in **§1** below are **implemented in the repo** (`App.js`, `pocketbase.js`). What follows is **operations / configuration** and optional production hardening.

---

## 1. Code (highest priority - roadmap exit criteria)

### 1.1 Patient prescription detail - AI side-effect warnings (Step 9) - **DONE**

Implemented in **`App.js`** → **`PrescriptionScreen`**: debounced `runSideEffectCheck` per prescription using `patientProfile`; amber banner mirrors **`PrescriptionModal`**.

### 1.2 Doctor profile - edit `concerns` tags (Step 3a) - **DONE**

Implemented in **`App.js`** → **`DoctorProfileScreen`**: loads `doctor_profile`, toggles **`CONCERN_CHIP_OPTIONS`**, custom tag + **Save concerns** → `pb.collection("doctor_profile").update({ concerns })`.

### 1.3 Stricter patient registration (Step 1 vs client wording) - **DONE**

**`validatePatientHealthProfileComplete`** in **`App.js`** requires: age, weight, height, marital status, district, state, smoking, alcohol, medical conditions (allergies remain optional). Used on **patient signup** and **`PatientEditProfileScreen`** save.

### 1.4 Order status naming vs roadmap (Step 6) - **DONE**

Canonical chain: **`pending` → `confirmed` → `out_for_delivery` → `fulfilled`**, plus **`cancelled`**. **`normalizeOrderStatus`** maps legacy **`packed` / `dispatched` / `delivered`** to the new values. **Pharmacy dashboard** “Accept & Ship” now sets **`confirmed`**. **`PharmacyOrdersScreen`** UI treats **`fulfilled`** (and legacy **`delivered`**) as completed.

**Admin:** Update PocketBase `orders.status` select options to include the new values (see **`pocketbase.js`** comment after `getPbAppointmentsCollection`).

---

## 2. Configuration - `app.json` / EAS / env

### 2.1 AI assistant + side-effect API (Step 9)

| Key | Location | Notes |
|-----|----------|--------|
| `extra.aiBaseUrl` | **`app.json`** | Set when your backend is ready |
| `extra.aiApiKey` | **`app.json`** | Do not commit production secrets |

### 2.2 Appointment payment - beyond stub (Step 8)

| Key | Location | Notes |
|-----|----------|--------|
| `extra.paymentMode` | **`app.json`** | `"stub"` works for QA; use `"cashfree"` for live Cashfree checkout |
| `extra.stripePublishableKey` / `extra.cashfreeReturnUrl` | **`app.json`** | Used when payment mode is enabled in code |

### 2.3 Chat encryption key (existing feature)

| Key | Typical setup |
|-----|----------------|
| `EXPO_PUBLIC_CHAT_ENCRYPTION_KEY_B64` | See **`chatCrypto.js`** - inject at build time for production. |

---

## 3. PocketBase Admin (schema + data)

Verify **on your server** (see also comments in **`pocketbase.js`**):

| Area | Check |
|------|--------|
| **Step 1** | `patient_profile`: launch fields exist; rules match required signup if you enforce server-side too. |
| **Step 2** | `appointments`: `reason`, full status set, `conversation`. |
| **Step 3a** | `doctor_profile`: JSON **`concerns`**. |
| **Step 4** | **`hospitals`** collection + seed data. |
| **Step 5** | `pharmacy_profile`: extended fields. |
| **Step 6** | **`orders.status`** select = `pending`, `confirmed`, `out_for_delivery`, `fulfilled`, `cancelled` (legacy values optional for old rows). |
| **Step 7b** | **`medication_schedule`**. |
| **Step 9** | `conversations.kind` allows **`assistant`**. |

---

## 4. QA checklist (before telling the client “complete”)

- [ ] New patient signup + edit profile: all Step 1 fields persist and reload.
- [ ] Book appointment with reason → doctor approve/reject → patient pay (stub or real) → consult → complete → **chat still open** + system message.
- [ ] Find doctor: concern chips + text search; doctor saves **concerns** on Doctor Profile.
- [ ] Hospitals directory: shows data when `hospitals` exists and filters by district/state.
- [ ] Pharmacy: profile, directory, detail, chat, **place order**, **My medicine orders**, pharmacy advances status (**Confirmed → Out for delivery → Fulfilled**), system messages in chat.
- [ ] Prescribe with structured timing → **medication_schedule** → notifications → **Medication tracker** + monthly report.
- [ ] Health Assistant + **side-effect banners** on doctor prescribe **and** patient **Prescriptions** screen (with real API when configured).

---

## 5. Related files (quick reference)

| File | Role |
|------|------|
| `App.js` | UI, prescriptions, orders, appointments, assistant, validation |
| `pocketbase.js` | Auth, profiles, PB docs for schema |
| `app.json` | `extra`: payments, AI, PB flags |
| `chatCrypto.js` | Chat encryption |

---

*Code-complete for §1; finish §2–§3 for production.*
