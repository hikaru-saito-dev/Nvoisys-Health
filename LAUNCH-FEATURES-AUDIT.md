# Nvoisys Health App (Version 1.0) — Launch Features vs Codebase Audit

This document compares the **Version 1.0 launch feature list** against the **Nvoisys-Health** implementation (primarily `App.js` and `pocketbase.js`).  

**Status legend:** **Implemented** · **Partial** · **Not implemented**

---

## Scope

- Main app logic lives in **`App.js`** (monolithic React Native app).
- Other files under `app/` (Expo Router tabs) appear to be a **separate skeleton** and are **not** the primary product surface audited here.

---

## Patient — registration & profile

| Launch spec | Status | Notes |
|-------------|--------|--------|
| **Age** | **Partial** | Signup collects condition, gender, name, email, password (and optional avatar). **No numeric age** in the live signup path. **`RegisterScreen` includes DOB** but is **not wired** into the current `REG` / `signUpWithEmail` flow, so DOB is effectively unused for account creation. |
| **Lifestyle (smoking, alcohol, etc.)** | **Not implemented** | Not in signup or `PatientEditProfileScreen` (name, phone, condition, gender, avatar only). |
| **Name, weight, height** | **Partial** | **Name** yes. **Weight / height** not in signup or edit profile flows reviewed. |
| **Marital status** | **Not implemented** | |
| **Medical conditions (e.g. diabetes)** | **Implemented** | `patientCondition` → `primary_condition` at signup; editable later. |
| **Location (district/state)** | **Not implemented** | In reviewed profile flows. |
| **Email verification before access** | **Implemented** | PocketBase: `requestVerification`, `verified` check, signup messaging (`pocketbase.js`). |
| **Phone OTP / “Verify Phone” UI** | **Partial** | `OTPScreen` exists; active path uses **email/password signup**, not OTP in the traced auth flow. |

---

## Patient — dashboard & core features

| Launch spec | Status | Notes |
|-------------|--------|--------|
| **View nearby hospitals** | **Not implemented** | “Nearby Hospitals” UI shows a **static empty** state. **No** map, hospital list, or backend integration in code reviewed. **Hospital** quick tile routes like **Find doctor**, not a hospital directory. |
| **Access prescriptions** | **Partial** | Prescriptions load from PocketBase and surface in UI; depth depends on PB data and screens. |
| **Chat with doctors and pharmacies** | **Partial** | Directory + conversations + **encrypted** text/images. Pharmacy as a **contactable role**. Not a full marketplace/catalog experience. |
| **Book appointments with doctors** | **Partial** | Find doctor: list/search/specialty, **health-focus filter**, **fees** on profile, **date + time + consult type**, `createAppointment`. |
| **Search doctors by health concern** | **Partial** | Search by name/specialty + optional filter via `primary_condition`; not a dedicated taxonomy beyond text/specialty. |

---

## Appointment & consultation (launch spec)

| Launch spec | Status | Notes |
|-------------|--------|--------|
| **Preferred date & time** | **Implemented** | `AppointmentBookingScreen`. |
| **Description of issue for booking** | **Not implemented** | Booking is date/time + consultation type; **no** free-text “reason for visit” tied to appointment in reviewed code. |
| **Booking request → doctor approves** | **Not implemented** | No in-app **doctor approval queue** for bookings; record uses server `status` (e.g. scheduled-style). |
| **Patient pays consultation fee after approval** | **Not implemented** | No payment gateway or fee capture flow found. |
| **Video call** | **Partial** | WebRTC-style **CallScreen** / telemedicine; depends on signaling/hosting. |
| **Chat consultation** | **Partial** | Async **chat** exists; not necessarily a formal “consultation session” entity tied to the appointment. |
| **Chat remains after consultation** | **Partial** | Ongoing conversations supported; **not** explicitly tied to post-paid consultation lifecycle. |

---

## AI-powered assistance (launch spec)

| Launch spec | Status | Notes |
|-------------|--------|--------|
| **AI assistant in chat from account creation** | **Not implemented** | Chat is human-to-human (`messages` + crypto). No LLM pipeline in repo reviewed. |
| **AI health Q&A anytime** | **Not implemented** | |
| **AI checks prescription side effects vs patient profile** | **Not implemented** | Prescriptions stored/displayed; no automated checker. |

*Onboarding/marketing may mention “AI”; that is not implemented product behavior in code.*

---

## Smart prescription system (launch spec)

| Launch spec | Status | Notes |
|-------------|--------|--------|
| **Doctor: medication name, dosage, frequency, timing** | **Partial / implemented (doctor UI)** | `PrescriptionModal`: condition + structured lines (name, dosage, when to take, duration); persisted via PocketBase / orders / wound updates. |
| **Auto medication schedule from prescription** | **Not implemented** | No engine building timed doses from prescription lines. |
| **Reminders for each dose** | **Not implemented** | No push/local notification schedule from prescription data. |
| **Track taken / missed doses** | **Not implemented** (real data) | `MedicationTrackerScreen`: `todayMeds = []`, `adherenceRate` hard-coded `0`, `weekData` **static** — UI shell/demo, not wired to prescriptions or persistence. |
| **Monthly adherence report** | **Not implemented** | |

---

## Pharmacy integration (launch spec)

| Launch spec | Status | Notes |
|-------------|--------|--------|
| **Find nearby pharmacies (geo)** | **Not implemented** | Directory can filter **Pharmacies** and start chat; no map/distance/nearby search. |
| **Pharmacy profile: location, products, hours, closing days** | **Not implemented** | `PharmacyRegisterScreen` is basic business fields; no rich storefront profile in reviewed code. |
| **Chat with pharmacies** | **Partial** | Same directory/chat model as doctors. |
| **Order medicines** | **Partial** | Orders tied to **wounds / prescriptions / pharmacy** in the clinical path; **not** full e-commerce storefront + checkout. |
| **Pricing & delivery patient↔pharmacy; app non-intervention** | **Partial by omission** | No in-app payment/delivery contracts; policy is **not** codified—simply **out of scope** of current implementation. |

---

## Doctor & pharmacy (roles)

| Area | Status | Notes |
|------|--------|--------|
| **Doctor signup / admin approval** | **Partial** | `doctor_profile` created with `status: pending`; app **gates** doctor data until **approved** — aligns with **moderation**, not patient **appointment approval**. |
| **Doctor prescribing** | **Implemented** (subset of vision) | Modal, lines, PB, orders, wound status — **not** the full schedule/reminder/adherence stack. |
| **Pharmacy operations** | **Partial** | Orders, status, chat — **not** full public discovery + catalog from spec. |

---

## Summary matrix

| Bucket | Mostly implemented | Partially implemented | Not implemented |
|--------|--------------------|----------------------|-----------------|
| **Patient onboarding** | Email verification; identity + condition | Gender; optional avatar; condition-based doctor hints | Age (as spec), lifestyle, weight/height, marital status, structured location; OTP vs email path |
| **Dashboard** | Book flow; telemedicine entry; prescriptions (data-dependent) | Chat; “hospitals” section | Real nearby hospitals; hospital directory |
| **Appointments** | Slot pick + create record | Doctor list / fees / search | Issue text; doctor approval; payment |
| **Consultation** | Video/audio UI | Ongoing chat | Formal consult + payment lifecycle |
| **AI** | — | Marketing copy only | All AI items in spec |
| **Smart medications** | Doctor structured prescription capture | — | Schedule, reminders, real adherence, monthly report |
| **Pharmacy** | Chat + order-related integrated flows | Directory “pharmacy” role | Nearby search, rich profiles, catalog, hours |

---

## Document history

- Generated from a static review of **Nvoisys-Health** `App.js` / `pocketbase.js` against the internal **Version 1.0 launch** feature description.
- Update this file when major features ship or when audit scope expands (e.g. include Expo Router app or admin).
