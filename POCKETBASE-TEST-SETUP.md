# PocketBase setup for **full testing** of Nvoisys Health (patient POV + packages)

This guide lists **what to configure in PocketBase** and **how to seed data** so you can exercise: **Quick Solve / Quick Counselling** (package-bound), **Basic / Gold / Premium** behaviour, **AI limits**, **Premium side-effect check**, **diet uploads**, **emergency assistant request**, **registration documents**, and **hospital directory**.

Use the **Admin UI** unless you prefer migrations. Collection names follow what the app expects (`UsersAuth`, etc.—adjust if your project renames them).

---

## 1. Preconditions

- **Auth collection** (e.g. `UsersAuth`) with `role`: `patient` | `doctor` | … as the app already uses.
- **`patient_profile`** linked to auth user (`user` relation).
- **`doctor_profile`** linked to auth user; doctor **approved** for directory/package flows where the app filters by status.
- **`coin_ledger`** (or equivalent) so **patients can spend coins** for Quick Solution / Quick Counselling (the app creates ledger lines with negative `delta`).
- **`package_offers`** with **`package_slot`** (1, 2, or 3) on offers you will mark **paid**—this drives **Basic / Gold / Premium** in the app.

---

## 2. Collections & fields to add or verify

### 2.1 `patient_profile`

| Field | Type | Purpose for testing |
|-------|------|----------------------|
| `care_mode` | text or select | Optional; values like `package_doctor`, `casual`, `not_planning`. |
| `preferred_quick_doctor` | relation → **auth users** | Optional; app sets after package pay (tries this name first). |
| `preferred_quick_provider` | relation → **auth users** | Fallback name if the first update fails. |
| `registration_document` | **file** | Optional; patient signup ID/insurance upload (app tries this first). |
| `id_document` | **file** | Optional; second try if `registration_document` is missing on schema. |

**API rules (minimum for tests):** authenticated **patient** can **read** and **update** their own row (`user = @request.auth.id`).

---

### 2.2 `package_offers`

Ensure you have (names may already exist):

| Field | Type | Testing |
|-------|------|---------|
| `patient` | relation → patient auth **or** `patient_profile` | Must resolve to the patient you log in as. |
| `doctor` | relation → doctor auth **or** `doctor_profile` | Package doctor. |
| `status` | text/select | Set to **`paid`** (or `active` / `started` if you use those—app treats them as active). |
| `package_slot` | **number** | **1 = Basic**, **2 = Gold**, **3 = Premium** (required to test tier differences). |
| `deal_started_at` / `created` | date | Used when sorting “latest” active package. |
| `amount_inr`, `platform_fee_inr`, `doctor_coins` | numbers | As your payment flow expects. |

**Rules:** patient can **list** own offers and **update** status when paying (match your existing payment stub / gateway flow).

---

### 2.3 `quick_solution_requests`

| Field | Type | Notes |
|-------|------|--------|
| `patient` | relation → auth user | |
| `notes` | text | App stores `[NVHS_DOCTOR:<doctorUserId>]\n…` prefix—field must be long enough. |
| `private_mode` | bool | |
| `patient_cost_coins` | number | `10` |
| `platform_fee_coins` | number | `5` |
| `provider_coins` | number | `5` |
| `status` | text | e.g. `queued` |
| `image` | file | optional |

**Rules:** **Patient:** create with `patient = @request.auth.id`. **Doctor:** list `status = "queued"` (app also filters by doctor id in `notes`).

---

### 2.4 `quick_counselling_requests`

| Field | Type | Notes |
|-------|------|--------|
| `patient` | relation | |
| `topic` | text | Prefixed with `[NVHS_DOCTOR:<id>]` |
| `patient_cost_coins` | `25` | |
| `platform_fee_coins` | `10` | |
| `provider_coins` | `15` | |
| `status` | text | `queued` |

Same rule pattern as quick solution.

---

### 2.5 `emergency_assistant_requests` (**new** collection for Premium SOS test)

| Field | Type | Required |
|-------|------|----------|
| `patient` | relation → auth user | yes |
| `notes` | text | yes |
| `status` | text | yes (app sends `pending`) |
| `requested_at` | date | yes |
| `package_doctor` | relation → auth user **or** text | optional (app sends doctor auth id string) |

**Rules:** authenticated **patient** may **create** with `patient = @request.auth.id`. **Admin** (or ops role) may **list all** and **update** `status` for manual testing.

---

### 2.6 `medical_records`

| Field | Type |
|-------|------|
| `patient` | relation → auth user |
| `title` | text |
| `file` | file |

Used for **diet** uploads (`[Diet log]` in title). Patient must **create**; doctors who should see them need **read** rules (or test as patient only first).

---

### 2.7 `coin_ledger` (if used for balance)

Allow **patient** to **create** rows for their own `user` (or your backend rule), otherwise Quick requests will fail with “not enough coins.”

**Test tip:** seed a positive `delta` for the test patient (e.g. +500) with reason `trial` or reuse your existing top-up flow.

---

### 2.8 `hospitals` (directory)

Fields the app typically maps: **`name`**, **`address`**, **`district`**, **`state`**, **`phone`**, specialties (text or JSON—match your `fetchHospitals` mapping).

Seed at least:

- One row matching the **test patient’s `district` and `state`** on `patient_profile`.
- One row in **another** district/state to test filters.

**Rules:** authenticated users who open the directory need **read** access.

---

### 2.9 `appointments` (optional but useful)

To test **consultation minutes** (Basic/Gold weekly cap) realistically:

- Add **`duration_minutes`** (number) if you want exact minutes; otherwise the app assumes **45** per **completed** visit.
- Create rows: **patient** = test user, **doctor** = package doctor, **`status`** such that the app normalizes to **`completed`** (e.g. PB `done` / `finished` maps to completed in app—verify your status strings).

---

## 3. Test users (recommended)

1. **Doctor A** — `doctor_profile.status = approved`, **package fees** set (all 3 slots) so patients can get offers; tier eligible for package mode if your app filters (`professional` / `specialist`).
2. **Patient P** — complete **`patient_profile`** including **`district`** and **`state`** (for hospital filter tests).
3. **Admin** (optional) — to read `emergency_assistant_requests` in Admin UI.

---

## 4. End-to-end test order (minimal)

### Step A — Coins

- Ensure **Patient P** has **enough coin balance** (ledger + balance rules).

### Step B — Paid package with slot (drives Basic / Gold / Premium)

1. Create **`package_offers`** for **Patient P** + **Doctor A** with **`package_slot = 1`** (Basic), **`status = paid`**, and `deal_started_at` set.
2. Log in as **Patient P**, pull to refresh / reopen app → **Home** should show **Quick Solve / Quick Counselling** (no longer “locked”).
3. Repeat with **`package_slot = 2`** (Gold) and **`3`** (Premium) on a **newer** paid offer (app picks **latest** active offer by `created` sort) to test tier changes.

### Step C — Quick Solve

- Open **Quick Solve** → **AI** question (uses Health Assistant path; **Basic**: after **25** messages in a day, next should hit limit message).
- Submit **doctor review (10 coins)** → row in **`quick_solution_requests`**, **`notes`** contains `[NVHS_DOCTOR:<Doctor A auth id>]`.

### Step D — Quick Counselling

- Submit counselling → **`quick_counselling_requests`**, **`topic`** prefixed.
- Log in as **Doctor A** → quick queue should show **only** requests tagged to that doctor (plus any legacy untagged queued rows).

### Step E — Premium-only

- With **`package_slot = 3`**: run **prescription side-effect check** as patient → should call **AI** path; with slot 1/2 → **no AI** API merge (rule-based only).
- **Emergency SOS** → **Request personal assistant** → row in **`emergency_assistant_requests`**.
- **Diet monitoring** tile → upload → **`medical_records`** with title starting **`[Diet log]`**.

### Step F — Registration document

- On **signup**, pick ID image → after verify/login, check **`patient_profile`** for **`registration_document`** or **`id_document`** file.

### Step G — Hospitals

- Open **Nearby Hospitals** → default filter should prefer **district/state**; search should match **`hospitals`** rows.

---

## 5. Common failures when testing

| Symptom | Likely PocketBase cause |
|---------|-------------------------|
| Quick buttons stay “locked” | No **`package_offers`** row with **`paid`/`active`/`started`** for this patient, or missing **`package_slot`**. |
| Quick submit fails | **`quick_*` rules**, missing field, or **insufficient coins** / **`coin_ledger`** create denied. |
| Doctor sees no quick rows | **`list` rule** on `quick_*` for doctor role, or **wrong auth user id** vs tag in `notes`/`topic`. |
| Premium SOS does nothing in PB | **`emergency_assistant_requests`** missing or **create rule** blocks patient. |
| Diet upload fails | **`medical_records`** missing `file`/`patient` or create rule. |
| ID doc not saved | **`patient_profile`** missing **`registration_document`** / **`id_document`** file field or update denied. |

---

## 6. Optional: PocketBase **test hooks**

- Use **Admin → Logs** to see **403** on failed creates.
- Temporarily set **API rules** to **super open** on a **dev** instance only; tighten before production.

---

When your schema uses **different relation targets** (`patient_profile` vs `UsersAuth` on `package_offers.patient`), keep the same **logical** patient–doctor pairing; the app already tries multiple id shapes in several list helpers—if something still fails, compare the **filter** in Admin API logs with the **id** stored in `notes` after `[NVHS_DOCTOR:…]`.
