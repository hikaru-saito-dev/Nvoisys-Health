# Nvoisys Health - Implementation Roadmap

Based on the **Version 1.0 launch spec** and the current gaps captured in [`LAUNCH-FEATURES-AUDIT.md`](./LAUNCH-FEATURES-AUDIT.md).

**Non-negotiables for every step:**
- Keep the **current chat encryption** (`encryptChatText`, `encryptChatImagePayload`, `decryptChatText`, `decryptChatImagePayload`).
- Do **not break existing features** (patient book appt, wound reporting, doctor prescribe, pharmacy orders, telemedicine call, etc.).
- Each step is deployable on its own and does not depend on later steps to function.
- Schema changes are additive (new PB fields/collections). Existing rows stay valid.

---

## Priority summary (what ships when)

| Order | Step | Why now |
|------:|------|---------|
| 1 | **Complete patient profile fields** | Other features (AI side-effects, hospital/pharmacy by district, reminders) read these. Cheapest unlock. |
| 2 | **Appointment: reason + doctor approval queue + post-consultation chat retention** | Matches spec booking flow. Pure PB + UI; no external services. |
| 3 | **Doctor search by health concern + patient prescription viewer** | Small, high-visibility dashboard gaps. |
| 4 | **Nearby hospitals** (PocketBase-sourced directory) | Dashboard gap; needs patient district/state from Step 1. |
| 5 | **Pharmacy profile + “Find pharmacy” directory** | Needed before patients can meaningfully order medicines. |
| 6 | **Order medicines flow (patient → pharmacy)** | Transaction stays patient↔pharmacy (per spec). Uses encrypted chat + `orders` collection. |
| 7 | **Smart prescription: structured timing + schedule + reminders + adherence** | Builds on existing prescription form; local notifications only. |
| 8 | **Appointment payment** (after doctor approval) | Can ship as manual-mark first, then integrate a gateway. |
| 9 | **AI assistant in chat + side-effect check on prescriptions** | Depends on profile fields (Step 1) and a key/endpoint you provide. |

> **Already implemented (audited, nothing to do):** email verification before first access, doctor list with consultation fees, chat with doctors and pharmacies (encrypted), video + chat consultation UI, preferred date/time picker on booking, doctor prescription capture (medication name, dosage, frequency - see Step 7 for “timing” upgrade).

---

## Step 1 - Patient profile completeness

**Goal:** capture all fields the spec requires and make them available to downstream features.

**New PocketBase fields on `patient_profile`** (all optional so existing rows keep working):
- `age` (number)
- `weight_kg` (number)
- `height_cm` (number)
- `marital_status` (select: single, married, divorced, widowed, prefer_not_to_say)
- `district` (text)
- `state` (text)
- `smoking` (select: never, former, current, occasionally)
- `alcohol` (select: never, occasional, regular)
- `medical_conditions` (text, comma-separated)
- `allergies` (text, comma-separated) - used later by AI side-effect check

**App changes:**
- Add fields to the **patient signup form** (grouped into: Basics / Lifestyle / Location / Medical).
- Add same fields to **`PatientEditProfileScreen`**.
- Keep `primary_condition` working; also fold into `medical_conditions`.

**Exit criteria:** A new patient signup writes every new field; existing patient can edit each from the profile screen; refresh shows values everywhere consumed.

---

## Step 2 - Appointment: reason + doctor approval + post-consultation chat

**Goal:** match the spec - patient sends a **request** with a **reason**; doctor **approves / rejects**; only then can the patient pay / start; and the patient↔doctor chat **stays open after the consultation** is completed.

**PocketBase on `appointments`:**
- `reason` (text) - patient’s description of their issue.
- Update `status` select to include: `requested`, `approved`, `rejected`, `paid`, `completed`.
- `conversation` (rel → conversations, optional) - the shared patient↔doctor conversation, persisted across the appointment lifecycle.

**App changes:**
- **Patient booking** screen: add a mandatory **Reason for visit** text input. Create with `status = "requested"`.
- **Doctor dashboard**: add an **“Appointment Requests”** section (pending list) with **Approve / Reject** actions and optional reply note.
- **Patient appointments**: show badges for `requested / approved / rejected / paid / completed`. Hide call/chat-consultation actions until `approved` (and `paid` if Step 8 is enabled).
- **Chat remains after consultation**: when an appointment moves to `completed`, the existing encrypted patient↔doctor conversation is **not closed**; it stays accessible from both sides’ chat lists. A small system message marks the end of the formal session.

**Exit criteria:** Full round-trip: patient books → doctor sees request → approves → patient sees approved → consultation happens → marked completed → chat still opens on both sides; nothing existing regresses.

---

## Step 3 - Doctor search by health concern + patient prescription viewer

**Goal:** two small, high-visibility gaps from the audit, grouped because they’re cheap and independent of any new collection.

### 3a. Doctor search by health concern

**PocketBase on `doctor_profile`:**
- `concerns` (JSON array of lowercase tags, e.g. `["diabetes", "hypertension", "dermatology"]`).

**App changes:**
- In **`FindDoctorScreen`**, add a horizontal **concern chip bar** (diabetes, hypertension, cardiology, dermatology, pediatrics, etc.). Selecting a chip filters doctors whose `concerns` includes that tag (fallback: match against existing `specialty` / `primary_condition` text).
- Keep the existing free-text search and specialty filter working unchanged.

### 3b. Patient prescription viewer

**App changes (no schema change):**
- **`PatientPrescriptionsScreen`**: list all prescriptions for the current patient (sorted newest first), tap → detail showing medication lines (name, dosage, frequency, timing, duration), prescribing doctor, date, and related wound (if any).
- Wire the dashboard **“Prescriptions”** quick tile to this screen.
- Deep-link: tapping a prescription reference from within chat opens the same detail.

**Exit criteria:** Concern chips filter the doctor list; patient can open a dedicated Prescriptions screen and see every prescription they’ve received with structured details.

---

## Step 4 - Nearby hospitals

**Goal:** turn the empty “Nearby Hospitals” widget and the “Hospital” quick tile into a real directory.

**New PocketBase collection `hospitals`:**
- `name` (text), `address` (text), `district` (text), `state` (text), `phone` (text), `specialties` (text), `image` (file).

**App changes:**
- New **`HospitalDirectoryScreen`**: search by text; filter by patient’s **`district`/`state`** (from Step 1) with a toggle for “All”.
- Replace dashboard empty state with the first N matches for the patient’s location.
- Wire the **Hospital** quick-tile to open this screen (it currently routes like Book Appt).

**Exit criteria:** Admin can add hospital rows; patient sees them; list respects profile district/state by default.

---

## Step 5 - Pharmacy profile + directory

**Goal:** richer pharmacy profile required by the spec (products, hours, closing days, location), and a way for patients to browse pharmacies.

**PocketBase on `pharmacy_profile`:** add
- `address` (text), `district` (text), `state` (text)
- `opening_hours` (JSON: `{ mon: "09:00-21:00", tue: "…", … }`)
- `closing_days` (JSON: `["sun"]` or similar)
- `products` (JSON list of `{ name, price, notes }`)
- `phone` (text)

**App changes:**
- **Pharmacy onboarding / edit profile**: fields for address/district/state, opening hours editor, closing days selector, products editor.
- **Patient `PharmacyDirectoryScreen`**: list of pharmacies (filter by district/state), tap into **`PharmacyDetailScreen`** showing profile + products + hours.
- From `PharmacyDetailScreen`, existing **chat** button opens the usual **encrypted** conversation.

**Exit criteria:** Pharmacy can fill out profile; patient can browse pharmacies and view details.

---

## Step 6 - Order medicines

**Goal:** let patients place medicine orders with a specific pharmacy. Per spec, **the app does not handle money or delivery** - the chat is the channel for both.

**PocketBase on `orders` (extend existing):**
- Ensure `pharmacy` (relation → UsersAuth or pharmacy_profile) is present.
- Ensure `items` supports a list of `{ name, qty, notes }`.
- `status` values: `pending`, `confirmed`, `out_for_delivery`, `fulfilled`, `cancelled`.

**App changes:**
- **Patient: New Order** from **`PharmacyDetailScreen`**:
  1. Pick items (from pharmacy `products` or free-text add).
  2. Optional note / address.
  3. Creates `orders` row + starts (or reuses) an **encrypted** patient↔pharmacy conversation with a **system message** summarizing the order.
- **Patient: My Orders** tab: history + status.
- **Pharmacy: Orders** list: update status (already partially present); status changes post a **system message** to the shared conversation.

**Exit criteria:** Patient can order; pharmacy sees the order and can progress status; chat stays encrypted; no money is handled by the app.

---

## Step 7 - Smart prescription: structured timing + schedule + reminders + adherence

**Goal:** make the doctor’s prescription capture structured enough to drive real dose timing, then turn each prescription into scheduled doses, reminders, and adherence tracking.

### 7a. Structured timing on the prescription form

The spec explicitly requires **“Timing (before/after meals, specific times of day)”**. Today the prescription modal captures `when to take` as free text.

**PocketBase on `prescriptions.items` (per-line JSON):** each line becomes:
- `medicine_name` (text)
- `dosage` (text, e.g. `500mg`)
- `frequency` (select: `once_daily`, `twice_daily`, `thrice_daily`, `four_times_daily`, `as_needed`)
- `meal_timing` (select: `before_meal`, `after_meal`, `with_meal`, `no_preference`)
- `times_of_day` (JSON array of `HH:mm`, e.g. `["08:00", "20:00"]`)
- `duration_days` (number)
- `notes` (text, optional)

**Doctor UI (`PrescriptionModal`):**
- Replace the free-text “when to take” with: a **Frequency** dropdown, a **Meal timing** dropdown, and **Time-of-day chips/pickers** (auto-seeded from frequency but editable).
- Old free-text values stay readable (backfill not required); new prescriptions write the structured shape.

### 7b. Schedule + reminders + adherence

**New PocketBase collection `medication_schedule`:**
- `patient` (rel), `prescription` (rel), `wound` (rel, optional)
- `medicine_name` (text), `dosage` (text)
- `due_at` (date), `taken_at` (date, optional)
- `meal_timing` (select, same as above)
- `status` (select: `pending`, `taken`, `missed`)

**App changes:**
- On `prescribeForWound` success, expand each line into schedule rows for `duration_days` days using `times_of_day`.
- Add **`expo-notifications`**: request permission once; schedule one local notification per dose with body like *“Take Amoxicillin 500mg - after meal”*.
- Rewire **`MedicationTrackerScreen`**:
  - Today’s doses list, mark `taken`, auto-mark `missed` once overdue.
  - Real adherence % (7-day and 30-day).
  - Monthly adherence report (last 30 days) - taken / missed / pending counts + per-medicine breakdown.

**Exit criteria:** Doctor can capture structured timing; prescribing creates schedule entries; device fires reminders at the right local time with the right meal hint; patient’s tracker shows real numbers; missed doses appear correctly; monthly report is accurate.

---

## Step 8 - Appointment payment

**Goal:** the paid step between doctor approval and consultation.

**Baseline first:**
- After `approved`, show a **“Pay fee”** button to the patient; clicking it sets `status = paid` and posts a system message. Good enough to test the flow end-to-end without a gateway.

**Then enable a real provider** (one of):
- **Stripe Checkout link per doctor fee** (deep-link + return URL).
- **Cashfree** checkout (India).

Keys / URLs live in `app.json` → `extra`, already the convention in the project. Webhooks / success callbacks update `status` to `paid`.

**Exit criteria:** Patient can pay (real or stub); consultation actions unlock only when `paid`.

---

## Step 9 - AI assistant + side-effect check

**Goal:** match the AI sections of the spec, carefully, without breaking encryption.

**Design:**
- Introduce a **special conversation kind** `assistant` (not a human peer chat). Encryption is not applied to AI replies, and it is visually labeled. Human↔human chats remain **fully encrypted**, unchanged.
- New screen entry **“Health Assistant”** available from the chat list as a pinned item, created at signup.
- Use a configurable endpoint: `app.json` → `extra.aiBaseUrl`, `extra.aiApiKey`. If missing, the assistant replies with a friendly stub.

**Side-effect check:**
- On prescribe, call the same endpoint with:
  - `items` (medicines),
  - patient fields from **Step 1** (age, conditions, allergies, lifestyle),
- Show **warnings** in:
  - Doctor’s **`PrescriptionModal`** before the final send (so the doctor sees the risk).
  - Patient’s prescription detail view (so they can ask questions).

**Exit criteria:** Assistant thread works with or without a real API key; side-effect banner appears when risks are returned; encryption for human chats is unchanged.

---

## Delivery rules I will follow

- **One step per PR/change**, each independently verifiable.
- Additive **PocketBase schema notes** in every step (field name, type, required/optional), so you can update Admin without guessing.
- Existing screens and data stay valid - nothing removed.
- Where a Step needs a key/URL (payments, AI), the feature falls back to a safe stub if the config is missing.

---

## Client spec → step coverage map

Every bullet from the Version 1.0 launch spec, mapped to where it lives in this roadmap (or to “already implemented”).

### Patient registration
| Spec bullet | Where |
|---|---|
| Age | Step 1 |
| Lifestyle (smoking, alcohol) | Step 1 |
| Name | Already implemented |
| Weight | Step 1 |
| Height | Step 1 |
| Marital status | Step 1 |
| Medical conditions (e.g. diabetes) | Step 1 |
| Location (district/state) | Step 1 |
| Email verification after signup | Already implemented |

### Dashboard
| Spec bullet | Where |
|---|---|
| View nearby hospitals | Step 4 |
| Access prescriptions | Step 3b (patient prescription viewer) |
| Chat with doctors | Already implemented (encrypted) |
| Chat with pharmacies | Already implemented (encrypted) |
| Book appointments with doctors | Step 2 |
| Search doctors by health concern (e.g. diabetes) | Step 3a |
| Doctor profile shows consultation fees | Already implemented |

### Appointment & consultation
| Spec bullet | Where |
|---|---|
| Preferred date & time | Already implemented |
| Description of issue (reason) | Step 2 |
| Booking request sent to doctor | Step 2 |
| Doctor approval | Step 2 |
| Patient pays consultation fee after approval | Step 8 |
| Video call consultation | Already implemented |
| Chat consultation | Already implemented |
| Chat remains after consultation | Step 2 (explicit retention rule) |

### AI-powered assistance
| Spec bullet | Where |
|---|---|
| AI assistant in chat from account creation | Step 9 |
| Ask health questions any time | Step 9 |
| AI checks prescription side-effects vs profile | Step 9 |

### Smart prescription system
| Spec bullet | Where |
|---|---|
| Medication name | Already implemented (kept in Step 7a) |
| Dosage | Already implemented (kept in Step 7a) |
| Frequency | Step 7a (upgraded to structured select) |
| Timing: before/after meals, specific times of day | Step 7a |
| Auto medication schedule | Step 7b |
| Reminders for each dose | Step 7b |
| Track taken / missed doses | Step 7b |
| Monthly adherence report | Step 7b |

### Pharmacy integration
| Spec bullet | Where |
|---|---|
| Find nearby pharmacies | Step 5 |
| Pharmacy profile: location | Step 5 |
| Pharmacy profile: available products | Step 5 |
| Pharmacy profile: operating hours & closing days | Step 5 |
| Chat with pharmacies | Already implemented |
| Order medicines | Step 6 |
| Pricing & delivery handled patient↔pharmacy, app does not intervene | Step 6 (explicit) |

---

## Next action

Confirm (or reorder) this priority. Once confirmed, I’ll start with **Step 1 (patient profile fields)** and only move to the next step after you verify it.
