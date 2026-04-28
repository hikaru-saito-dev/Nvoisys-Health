/**
 * Product-spec flows (care mode, quick services, package demos/offers, coins,
 * medical records). All PocketBase writes are best-effort so older schemas
 * keep working. Create matching collections in PocketBase Admin when ready.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import {
  pb,
  formatPocketBaseClientError,
  getPbAppointmentsCollection,
  isPbAppointmentDoctorProfileRelation,
} from "./pocketbase";

export const CARE_MODE = {
  PACKAGE: "package_doctor",
  CASUAL: "casual",
  SKIP: "not_planning",
};

/** Package Doctor demos: professional or specialist tier only (RMP/clinic reserved for quick services). */
export function doctorTierEligibleForPackageMode(tier) {
  const t = String(tier || "").toLowerCase();
  return t === "professional" || t === "specialist";
}

/** Three fixed catalogue slots — only `total_amount_inr` is doctor-editable; rest is app-defined. */
export const DOCTOR_PACKAGE_SLOT_IDS = [1, 2, 3];

/**
 * App-controlled package copy & features (doctors cannot change these — only their fee).
 * Update this list when product adds/removes features per tier.
 */
export const FIXED_PACKAGE_DEFINITIONS = [
  {
    slot: 1,
    name: "Package 1 — Essential Care",
    total_period: "90 days",
    treatment_type: "Structured follow-up & remote support",
    description:
      "Entry-level packaged care with core monitoring and safety checks. Ideal for stable conditions with periodic doctor oversight.",
    features: [
      "Scheduled video or chat consults",
      "24/7 app-guided monitoring prompts",
      "AI medication interaction checks",
      "Care plan & dose reminders in-app",
    ],
  },
  {
    slot: 2,
    name: "Package 2 — Active Care",
    total_period: "120 days",
    treatment_type: "Ongoing condition management",
    description:
      "Step-up support for patients who need closer follow-up between visits, with richer monitoring and AI-assisted reviews.",
    features: [
      "Everything in Package 1",
      "More frequent touchpoints with your care team",
      "Enhanced 24/7 monitoring workflows",
      "Expanded AI med checks & adherence insights",
      "Priority messaging window",
    ],
  },
  {
    slot: 3,
    name: "Package 3 — Comprehensive Care",
    total_period: "180 days",
    treatment_type: "High-touch / complex care paths",
    description:
      "Full-feature packaged programme for complex or high-risk journeys. Feature set is defined by the app and updated centrally.",
    features: [
      "Everything in Package 2",
      "Maximum tier 24/7 monitoring pathways",
      "Full AI-assisted medication & symptom reviews",
      "Care coordination summaries for your records",
      "Highest-priority routing for package consults",
    ],
  },
];

function parsePackageTemplatesRaw(raw) {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    if (raw.skipped === true) return [];
    return [];
  }
  if (raw && typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && parsed.skipped === true) {
        return [];
      }
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

/** True when doctor chose Skip (stored as JSON object on `package_templates` or legacy PB flag). */
export function doctorProfilePackageSetupSkipped(record) {
  if (!record) return false;
  if (record.package_setup_skipped === true) return true;
  const raw = packageTemplatesRawFromRecord(record);
  if (raw && typeof raw === "object" && !Array.isArray(raw) && raw.skipped === true) return true;
  return false;
}

/** True when three fees are saved (`package_setup`) or derived complete from template array / legacy. */
export function doctorProfilePackageFeesReady(record) {
  if (!record) return false;
  if (record.package_setup === true) return true;
  const slots = normalizeDoctorPackageSlots(packageTemplatesRawFromRecord(record));
  return doctorPackagesSetupComplete(slots);
}

/** Raw JSON for package fee rows from `doctor_profile` (supports alternate field names). */
export function packageTemplatesRawFromRecord(record) {
  if (!record) return null;
  return (
    record.package_templates ??
    record.packages_template ??
    record.package_slots ??
    null
  );
}

const doctorPkgFeesKey = (userId) => `nvhs_doctor_pkg_fees_${userId || "anon"}`;
const doctorPkgSkipKey = (userId) => `nvhs_doctor_pkg_skip_${userId || "anon"}`;

export async function readLocalDoctorPackageFees(userId) {
  if (!userId) return null;
  try {
    const raw = await AsyncStorage.getItem(doctorPkgFeesKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export async function writeLocalDoctorPackageFees(userId, entries) {
  if (!userId) return;
  try {
    await AsyncStorage.setItem(doctorPkgFeesKey(userId), JSON.stringify(entries || []));
  } catch {
    // ignore
  }
}

export async function clearLocalDoctorPackageFees(userId) {
  if (!userId) return;
  try {
    await AsyncStorage.removeItem(doctorPkgFeesKey(userId));
  } catch {
    // ignore
  }
}

export async function readLocalPackageSetupSkip(userId) {
  if (!userId) return false;
  try {
    const v = await AsyncStorage.getItem(doctorPkgSkipKey(userId));
    return v === "1" || v === "true";
  } catch {
    return false;
  }
}

export async function writeLocalPackageSetupSkip(userId, skipped) {
  if (!userId) return;
  try {
    if (skipped) await AsyncStorage.setItem(doctorPkgSkipKey(userId), "1");
    else await AsyncStorage.removeItem(doctorPkgSkipKey(userId));
  } catch {
    // ignore
  }
}

/** Overlay locally stored `{ slot, total_amount_inr }[]` onto normalized slots (device fallback). */
export function mergeLocalFeesOntoSlots(slots, localFees) {
  if (!Array.isArray(slots) || !Array.isArray(localFees) || localFees.length === 0) {
    return slots;
  }
  return slots.map((s) => {
    const L = localFees.find((e) => Number(e?.slot) === Number(s.slot));
    if (L && L.total_amount_inr != null && String(L.total_amount_inr).trim() !== "") {
      return { ...s, total_amount_inr: String(L.total_amount_inr).trim() };
    }
    return s;
  });
}

/** Merge app-fixed catalogue with doctor-stored fees only (`slot` + `total_amount_inr`). */
export function normalizeDoctorPackageSlots(raw) {
  const arr = parsePackageTemplatesRaw(raw);
  return DOCTOR_PACKAGE_SLOT_IDS.map((slotNum) => {
    const fixed = FIXED_PACKAGE_DEFINITIONS[slotNum - 1] || {
      slot: slotNum,
      name: `Package ${slotNum}`,
      description: "",
      total_period: "",
      treatment_type: "",
      features: [],
    };
    const entry = arr.find((e) => Number(e?.slot) === slotNum);
    const feeRaw = entry?.total_amount_inr ?? entry?.amount_inr ?? "";
    return {
      ...fixed,
      slot: slotNum,
      total_amount_inr:
        feeRaw === undefined || feeRaw === null ? "" : String(feeRaw).trim(),
    };
  });
}

export function doctorPackagesSetupComplete(slots) {
  if (!Array.isArray(slots) || slots.length < 3) return false;
  return slots.every((s) => {
    const amt = Number(String(s.total_amount_inr || "").replace(/,/g, "").trim() || 0);
    return Number.isFinite(amt) && amt > 0;
  });
}

/**
 * Persists package fees for a doctor. Tries PocketBase first; if update is denied or fails and
 * `userId` is set, stores `{ slot, total_amount_inr }[]` on device so the app can unlock the dashboard.
 * @returns {{ record: object|null, localOnly: boolean }}
 */
export async function saveDoctorPackageTemplates(profileId, slots, userId = null) {
  if (!profileId) throw new Error("Missing doctor profile.");
  const normalized = normalizeDoctorPackageSlots(slots);
  const complete = doctorPackagesSetupComplete(normalized);
  const package_templates = normalized.map((s) => ({
    slot: s.slot,
    total_amount_inr: String(s.total_amount_inr || "").trim(),
  }));
  const attempts = [
    { package_templates, package_setup: complete, package_setup_skipped: false },
    { package_templates, package_setup: complete },
    { package_templates, packages_setup_complete: complete, package_setup_skipped: false },
    { package_templates, packages_setup_complete: complete },
    { package_templates },
    {
      packages_template: package_templates,
      package_setup: complete,
      package_setup_skipped: false,
    },
    { packages_template: package_templates, package_setup: complete },
    {
      packages_template: package_templates,
      packages_setup_complete: complete,
      package_setup_skipped: false,
    },
    { packages_template: package_templates, packages_setup_complete: complete },
    { packages_template: package_templates },
  ];
  let lastError = null;
  for (const body of attempts) {
    try {
      const record = await pb.collection("doctor_profile").update(profileId, body);
      if (userId) {
        await clearLocalDoctorPackageFees(userId);
        await writeLocalPackageSetupSkip(userId, false);
      }
      return { record, localOnly: false };
    } catch (error) {
      lastError = error;
    }
  }
  const msg =
    formatPocketBaseClientError(lastError) ||
    lastError?.message ||
    "Save failed. Add JSON fields `package_templates` or `packages_template` on doctor_profile and allow doctors to update their own row.";
  if (userId) {
    await writeLocalDoctorPackageFees(userId, package_templates);
    await writeLocalPackageSetupSkip(userId, false);
    return { record: null, localOnly: true };
  }
  throw new Error(msg);
}

/** Skip package fee setup (dashboard opens); syncs to PocketBase when rules allow. */
export async function persistPackageSetupSkip({ profileId, userId }) {
  if (userId) await writeLocalPackageSetupSkip(userId, true);
  if (!profileId) return { ok: true, localOnly: true };
  try {
    await pb.collection("doctor_profile").update(profileId, {
      package_setup: false,
      package_templates: { skipped: true },
      package_setup_skipped: true,
    });
    return { ok: true, localOnly: false };
  } catch {
    try {
      await pb.collection("doctor_profile").update(profileId, {
        package_setup: false,
        package_templates: { skipped: true },
      });
      return { ok: true, localOnly: false };
    } catch {
      return { ok: true, localOnly: true };
    }
  }
}

/** PDF example: ₹8000 total → ₹2000 platform (25%), ₹6000 doctor share as in-app coins after fulfilment. */
export function splitPackagePayment(amountInr) {
  const total = Number(amountInr);
  if (!Number.isFinite(total) || total <= 0) {
    return { platformFeeInr: 0, doctorCoins: 0 };
  }
  const platformFeeInr = Math.round(total * 0.25);
  const doctorCoins = Math.max(0, total - platformFeeInr);
  return { platformFeeInr, doctorCoins };
}

const careKey = (userId) => `nvhs_care_mode_${userId || "anon"}`;

export async function readLocalCareMode(userId) {
  try {
    const v = await AsyncStorage.getItem(careKey(userId));
    return String(v || "").trim();
  } catch {
    return "";
  }
}

export async function writeLocalCareMode(userId, mode) {
  try {
    await AsyncStorage.setItem(careKey(userId), String(mode || "").trim());
  } catch {
    // ignore
  }
}

export function effectiveCareMode(profile, localMode) {
  const fromLocal = String(localMode || "").trim();
  if (fromLocal) return fromLocal;
  return String(profile?.care_mode || "").trim();
}

export function needsCareOnboarding(profile, localMode) {
  return !effectiveCareMode(profile, localMode);
}

export async function persistPatientCareMode({ profileId, userId, mode }) {
  const value = String(mode || "").trim();
  if (!value) return;
  await writeLocalCareMode(userId, value);
  if (!profileId) return;
  try {
    await pb.collection("patient_profile").update(profileId, {
      care_mode: value,
    });
  } catch (error) {
    console.log(
      "persistPatientCareMode: server may lack care_mode field —",
      error?.message || error,
    );
  }
}

/** Clears local + server care_mode so onboarding shows again. */
export async function clearPatientCareMode({ profileId, userId }) {
  try {
    await AsyncStorage.removeItem(careKey(userId));
  } catch {
    // ignore
  }
  if (!profileId) return;
  try {
    await pb.collection("patient_profile").update(profileId, { care_mode: "" });
  } catch (error) {
    console.log("clearPatientCareMode:", error?.message);
  }
}

async function notifyLocal(title, body) {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title, body, sound: "default" },
      trigger: null,
    });
  } catch {
    // ignore
  }
}

// --- Medical records (collection: medical_records) ---
export async function fetchMedicalRecordsForPatient(patientUserId) {
  if (!patientUserId) return [];
  try {
    const rows = await pb.collection("medical_records").getFullList({
      requestKey: null,
      sort: "-created",
      filter: `patient="${patientUserId}"`,
    });
    return rows || [];
  } catch (error) {
    console.log("fetchMedicalRecordsForPatient:", error?.message);
    return [];
  }
}

export async function uploadMedicalRecord({ patientUserId, title, filePart }) {
  if (!patientUserId) throw new Error("Not signed in.");
  const form = new FormData();
  form.append("patient", patientUserId);
  form.append("title", String(title || "Record").trim() || "Record");
  if (filePart?.uri) {
    form.append("file", filePart);
  }
  try {
    const created = await pb.collection("medical_records").create(form);
    return created;
  } catch (error) {
    const msg = formatPocketBaseClientError(error) || error?.message;
    throw new Error(
      msg ||
        "Upload failed. Add collection `medical_records` in PocketBase (patient relation, title text, file file).",
    );
  }
}

// --- Package demo meetings (uses existing `appointments` collection) ---
// Negotiation state is stored in `reason` after marker ---NVHS_MEETING_WORKFLOW--- (same as legacy
// description encoding). Rows are normal appointments with consultation_type + status; only rows
// whose reason contains the marker are listed as package demo meetings.

export const PACKAGE_MEETING_STATUS = {
  AWAITING_DOCTOR: "awaiting_doctor",
  DOCTOR_PROPOSED_SLOTS: "doctor_proposed_slots",
  AWAITING_DOCTOR_AFTER_PATIENT_PICK: "awaiting_doctor_after_patient_pick",
  CONFIRMED: "confirmed",
};

/** `dateStr` YYYY-MM-DD, `timeStr` HH:MM (24h) → ISO or null */
export function combineDateAndTimeToIso(dateStr, timeStr) {
  const d = String(dateStr || "").trim();
  const t = String(timeStr || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return null;
  const tm = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!tm) return null;
  const hh = String(tm[1]).padStart(2, "0");
  const mm = tm[2];
  const local = new Date(`${d}T${hh}:${mm}:00`);
  return Number.isFinite(local.getTime()) ? local.toISOString() : null;
}

export function packageMeetingStatusLabel(status) {
  switch (status) {
    case PACKAGE_MEETING_STATUS.AWAITING_DOCTOR:
      return "Waiting for doctor";
    case PACKAGE_MEETING_STATUS.DOCTOR_PROPOSED_SLOTS:
      return "Doctor suggested other times";
    case PACKAGE_MEETING_STATUS.AWAITING_DOCTOR_AFTER_PATIENT_PICK:
      return "Waiting for doctor to confirm your time";
    case PACKAGE_MEETING_STATUS.CONFIRMED:
      return "Confirmed";
    default:
      return status || "—";
  }
}

/**
 * Doctor home buckets (product spec PDF + meeting negotiation):
 * - pending: patient booked; doctor has not completed first accept/reschedule step.
 * - discussing: reschedule / alternate-slot negotiation in progress.
 * - confirmed_demo: demo time confirmed — doctor should use “Send package options” after the call.
 * - closed: declined / cancelled (terminal).
 */
export function packageMeetingDoctorListBucket(meeting) {
  if (!meeting) return "closed";
  const pb = String(meeting.appointment_status || "").toLowerCase();
  if (pb === "declined" || pb === "cancelled" || pb === "canceled") return "closed";
  const st = String(meeting.status || "");
  if (st === PACKAGE_MEETING_STATUS.CONFIRMED) return "confirmed_demo";
  if (st === PACKAGE_MEETING_STATUS.AWAITING_DOCTOR) return "pending";
  if (
    st === PACKAGE_MEETING_STATUS.DOCTOR_PROPOSED_SLOTS ||
    st === PACKAGE_MEETING_STATUS.AWAITING_DOCTOR_AFTER_PATIENT_PICK
  ) {
    return "discussing";
  }
  if (pb === "approved" || pb === "scheduled") return "confirmed_demo";
  return "pending";
}

/** Terminal rows only (declined / cancelled). */
export function packageMeetingClosedLabel(meeting) {
  const pb = String(meeting?.appointment_status || "").toLowerCase();
  if (pb === "declined") return "Declined";
  if (pb === "cancelled" || pb === "canceled") return "Cancelled";
  return "Closed";
}

const PKG_MEETINGS_LOCAL_KEY = "nvhs_package_meetings_local_v1";

function isPocketBaseMissingResourceError(error) {
  const status = error?.status ?? error?.response?.status ?? error?.data?.status;
  const msg = `${formatPocketBaseClientError(error) || ""} ${error?.message || ""} ${error?.url || ""}`.toLowerCase();
  return (
    status === 404 ||
    /the requested resource wasn't found|requested resource wasn't found|not found\.|unknown collection|missing collection/i.test(
      msg,
    )
  );
}

async function readLocalPackageMeetings() {
  try {
    const raw = await AsyncStorage.getItem(PKG_MEETINGS_LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeLocalPackageMeetings(rows) {
  await AsyncStorage.setItem(PKG_MEETINGS_LOCAL_KEY, JSON.stringify(rows || []));
}

async function upsertLocalMeeting(meeting) {
  const all = await readLocalPackageMeetings();
  const idx = all.findIndex((m) => m.id === meeting.id);
  const next = { ...meeting, updated_at: new Date().toISOString() };
  if (idx === -1) {
    all.unshift(next);
  } else {
    all[idx] = { ...all[idx], ...next };
  }
  await writeLocalPackageMeetings(all);
  return all[idx === -1 ? 0 : idx];
}

async function withLocalMeeting(meetingId, updater) {
  await cancelPackageMeetingReminder(meetingId);
  const all = await readLocalPackageMeetings();
  const idx = all.findIndex((m) => m.id === meetingId);
  if (idx === -1) throw new Error("Meeting not found.");
  const updated = updater({ ...all[idx] });
  const merged = { ...updated, updated_at: new Date().toISOString(), localOnly: true };
  all[idx] = merged;
  await writeLocalPackageMeetings(all);
  await schedulePackageMeetingThirtyMinReminder(merged);
  return merged;
}

async function mergeMeetingsForUser(pbMeetings, { patientUserId, doctorUserId }) {
  const stored = await readLocalPackageMeetings();
  const filtered = stored.filter((m) => {
    if (patientUserId && m.patient_user_id !== patientUserId) return false;
    if (doctorUserId && m.doctor_user_id !== doctorUserId) return false;
    return true;
  });
  const taggedPb = (pbMeetings || []).map((m) => ({ ...m, localOnly: false }));
  const taggedLocal = filtered.map((m) => ({ ...m, localOnly: true }));
  return [...taggedPb, ...taggedLocal].sort((a, b) =>
    String(b.updated_at || "").localeCompare(String(a.updated_at || "")),
  );
}

const MEETING_WF_MARKER = "\n\n---NVHS_MEETING_WORKFLOW---\n";

function expandRelId(val) {
  if (val && typeof val === "object" && val.id) return val.id;
  return val || "";
}

function buildWorkflowPayload({
  patientDescription,
  status,
  proposed_at,
  messages,
  doctor_alternate_slots,
  patient_selected_slot,
  confirmed_at,
  patientAuthUserId,
  doctorAuthUserId,
}) {
  return {
    v: 1,
    kind: "package_meeting",
    patient_description: String(patientDescription || "").trim(),
    status: status || PACKAGE_MEETING_STATUS.AWAITING_DOCTOR,
    proposed_at: proposed_at || "",
    messages: Array.isArray(messages) ? messages : [],
    doctor_alternate_slots: Array.isArray(doctor_alternate_slots) ? doctor_alternate_slots : [],
    patient_selected_slot: patient_selected_slot || null,
    confirmed_at: confirmed_at || null,
    patient_auth_user_id: String(patientAuthUserId || "").trim(),
    doctor_auth_user_id: String(doctorAuthUserId || "").trim(),
  };
}

function appointmentReasonField(row) {
  return row?.reason ?? row?.description ?? "";
}

function pbAppointmentStatusForWorkflow(workflow) {
  if (workflow?.status === PACKAGE_MEETING_STATUS.CONFIRMED) return "approved";
  return "requested";
}

function appointmentsColl() {
  return getPbAppointmentsCollection();
}

async function resolveDoctorProfileIdForUser(doctorUserId) {
  if (!doctorUserId) return null;
  try {
    const p = await pb.collection("doctor_profile").getFirstListItem(`user="${doctorUserId}"`, {
      requestKey: null,
    });
    return p?.id || null;
  } catch {
    return null;
  }
}

async function doctorIdsForAppointmentCreate(doctorUserId, doctorProfileId) {
  const profileId =
    doctorProfileId || (await resolveDoctorProfileIdForUser(doctorUserId)) || null;
  const ordered = isPbAppointmentDoctorProfileRelation()
    ? [profileId, doctorUserId]
    : [doctorUserId, profileId];
  return [...new Set(ordered.filter(Boolean))];
}

async function pbListPackageAppointmentRowsForPatient(patientUserId) {
  try {
    const rows = await pb.collection(appointmentsColl()).getFullList({
      requestKey: null,
      sort: "-created",
      filter: `patient="${patientUserId}"`,
    });
    return rows.filter((r) => String(appointmentReasonField(r)).includes("NVHS_MEETING_WORKFLOW"));
  } catch {
    return [];
  }
}

async function pbListPackageAppointmentRowsForDoctor(doctorFilterId) {
  if (!doctorFilterId) return [];
  try {
    const rows = await pb.collection(appointmentsColl()).getFullList({
      requestKey: null,
      sort: "-created",
      filter: `doctor="${doctorFilterId}"`,
    });
    return rows.filter((r) => String(appointmentReasonField(r)).includes("NVHS_MEETING_WORKFLOW"));
  } catch {
    return [];
  }
}

/** Merge rows whether `appointments.doctor` points at users or doctor_profile (no app.json guess). */
async function pbListPackageAppointmentRowsForDoctorMerged(doctorUserId) {
  if (!doctorUserId) return [];
  const profileId = await resolveDoctorProfileIdForUser(doctorUserId);
  const keys = [...new Set([doctorUserId, profileId].filter(Boolean))];
  const byId = new Map();
  for (const key of keys) {
    const rows = await pbListPackageAppointmentRowsForDoctor(key);
    for (const r of rows) byId.set(r.id, r);
  }
  return Array.from(byId.values());
}

function encodeMeetingDescription(workflow) {
  const desc = String(workflow.patient_description || "").trim();
  const { patient_description: _pd, ...rest } = workflow;
  return `${desc}${MEETING_WF_MARKER}${JSON.stringify(rest)}`;
}

function decodeWorkflowFromDescription(full, fallback = {}) {
  const raw = String(full || "");
  const rowStatus = String(fallback.status || "").trim();
  const scheduledAt = fallback.scheduled_at || "";
  const idx = raw.indexOf(MEETING_WF_MARKER);
  if (idx === -1) {
    const legacyConfirmed =
      String(rowStatus || "").toLowerCase() === "scheduled" && scheduledAt;
    return {
      patient_description: raw.trim(),
      workflow: buildWorkflowPayload({
        patientDescription: raw.trim(),
        status: legacyConfirmed
          ? PACKAGE_MEETING_STATUS.CONFIRMED
          : rowStatus || PACKAGE_MEETING_STATUS.AWAITING_DOCTOR,
        proposed_at: scheduledAt,
        messages: [],
        confirmed_at: legacyConfirmed ? scheduledAt : null,
      }),
    };
  }
  const patient_description = raw.slice(0, idx).trim();
  let parsed = null;
  try {
    parsed = JSON.parse(raw.slice(idx + MEETING_WF_MARKER.length));
  } catch {
    parsed = null;
  }
  if (!parsed || typeof parsed !== "object") {
    return {
      patient_description,
      workflow: buildWorkflowPayload({
        patientDescription: patient_description,
        proposed_at: scheduledAt,
      }),
    };
  }
  const merged = {
    ...buildWorkflowPayload({ patientDescription: patient_description }),
    ...parsed,
    patient_description,
  };
  return { patient_description, workflow: merged };
}

export function decodePackageMeetingFromPbRow(row) {
  if (!row) return null;
  const reasonText = appointmentReasonField(row);
  const fromJson = row.workflow_json ?? row.meeting_workflow;
  let workflow;
  if (fromJson && typeof fromJson === "object") {
    const headDesc = String(reasonText).split(MEETING_WF_MARKER)[0].trim();
    workflow = {
      ...buildWorkflowPayload({
        patientDescription: fromJson.patient_description ?? headDesc,
      }),
      ...fromJson,
      patient_description: String(fromJson.patient_description ?? "").trim() || headDesc,
    };
  } else {
    const dec = decodeWorkflowFromDescription(reasonText, {
      scheduled_at: row.scheduled_at,
      status: row.status,
    });
    workflow = dec.workflow;
    workflow.patient_description = dec.patient_description;
    if (!workflow.proposed_at && row.scheduled_at) {
      workflow.proposed_at = row.scheduled_at;
    }
  }
  const patient_user_id =
    String(workflow.patient_auth_user_id || "").trim() || expandRelId(row.patient);
  const doctor_user_id =
    String(workflow.doctor_auth_user_id || "").trim() || expandRelId(row.doctor);
  return {
    id: row.id,
    patient_user_id,
    doctor_user_id,
    description: workflow.patient_description || "",
    proposed_at: workflow.proposed_at || row.scheduled_at || "",
    status: workflow.status || String(row.status || "").trim() || PACKAGE_MEETING_STATUS.AWAITING_DOCTOR,
    messages: workflow.messages || [],
    doctor_alternate_slots: workflow.doctor_alternate_slots || [],
    patient_selected_slot: workflow.patient_selected_slot || null,
    confirmed_at: workflow.confirmed_at || null,
    scheduled_at: row.scheduled_at || null,
    call_kind: row.consultation_type || row.call_kind || "video",
    updated_at: row.updated || row.created || new Date().toISOString(),
    appointment_status: String(row.status || "").trim().toLowerCase() || null,
  };
}

async function ensureNotifyPermission() {
  try {
    const existing = await Notifications.getPermissionsAsync();
    if (existing.granted) return true;
    const asked = await Notifications.requestPermissionsAsync();
    return !!asked.granted;
  } catch {
    return false;
  }
}

export async function cancelPackageMeetingReminder(meetingId) {
  if (!meetingId) return;
  const id = `pkg-meeting-${meetingId}-tm30`;
  try {
    await Notifications.cancelScheduledNotificationAsync(id);
  } catch {
    // ignore
  }
}

export async function schedulePackageMeetingThirtyMinReminder(meeting) {
  if (!meeting?.id || meeting.status !== PACKAGE_MEETING_STATUS.CONFIRMED) return;
  const when = meeting.confirmed_at || meeting.scheduled_at;
  if (!when) return;
  const start = new Date(when);
  if (!Number.isFinite(start.getTime())) return;
  const fire = new Date(start.getTime() - 30 * 60 * 1000);
  if (fire.getTime() <= Date.now()) return;
  const ok = await ensureNotifyPermission();
  if (!ok) return;
  const nid = `pkg-meeting-${meeting.id}-tm30`;
  try {
    await Notifications.cancelScheduledNotificationAsync(nid).catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier: nid,
      content: {
        title: "Package meeting in 30 minutes",
        body: `Session at ${start.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}.`,
      },
      trigger: { type: "date", date: fire },
    });
  } catch (e) {
    console.log("schedulePackageMeetingThirtyMinReminder:", e?.message || e);
  }
}

export async function listPackageMeetingsForPatient(patientUserId) {
  if (!patientUserId) return [];
  const rows = await pbListPackageAppointmentRowsForPatient(patientUserId);
  const out = rows.map(decodePackageMeetingFromPbRow).filter(Boolean);
  const merged = await mergeMeetingsForUser(out, { patientUserId, doctorUserId: null });
  await Promise.all(merged.map((m) => schedulePackageMeetingThirtyMinReminder(m)));
  return merged;
}

export async function listPackageMeetingsForDoctor(doctorUserId) {
  if (!doctorUserId) return [];
  const rows = await pbListPackageAppointmentRowsForDoctorMerged(doctorUserId);
  const out = rows.map(decodePackageMeetingFromPbRow).filter(Boolean);
  const merged = await mergeMeetingsForUser(out, { patientUserId: null, doctorUserId });
  await Promise.all(merged.map((m) => schedulePackageMeetingThirtyMinReminder(m)));
  return merged;
}

function pushMessage(workflow, role, text) {
  const msg = {
    at: new Date().toISOString(),
    role,
    text: String(text || "").trim(),
  };
  if (!msg.text) return workflow;
  return {
    ...workflow,
    messages: [...(workflow.messages || []), msg],
  };
}

async function pbUpdateMeetingRow(rowId, bodyAttempts) {
  let last = null;
  for (const body of bodyAttempts) {
    try {
      return await pb.collection(appointmentsColl()).update(rowId, body);
    } catch (e) {
      last = e;
    }
  }
  throw last || new Error("Update failed");
}

async function persistMeetingRow(rowId, workflow, displayScheduledAt, consultType = "video") {
  const encoded = encodeMeetingDescription(workflow);
  const pbSt = pbAppointmentStatusForWorkflow(workflow);
  const attempts = [
    {
      scheduled_at: displayScheduledAt,
      status: pbSt,
      reason: encoded,
      consultation_type: consultType,
      workflow_json: workflow,
    },
    {
      scheduled_at: displayScheduledAt,
      status: pbSt,
      reason: encoded,
      consultation_type: consultType,
    },
    {
      scheduled_at: displayScheduledAt,
      status: "approved",
      reason: encoded,
      consultation_type: consultType,
    },
    {
      scheduled_at: displayScheduledAt,
      status: "scheduled",
      reason: encoded,
      consultation_type: consultType,
    },
    {
      scheduled_at: displayScheduledAt,
      status: "requested",
      reason: encoded,
      consultation_type: consultType,
    },
    { scheduled_at: displayScheduledAt, status: "requested", reason: encoded },
  ];
  const row = await pbUpdateMeetingRow(rowId, attempts);
  const meeting = decodePackageMeetingFromPbRow(row);
  await schedulePackageMeetingThirtyMinReminder(meeting);
  return meeting;
}

/**
 * Patient: proposed time + description → doctor must accept or propose ≥3 alternate slots.
 * Uses the same **`appointments`** collection as regular booking (`getPbAppointmentsCollection()`).
 */
export async function createPackageMeetingRequest({
  patientUserId,
  doctorUserId,
  doctorProfileId,
  proposedAtIso,
  description,
  callKind = "video",
}) {
  if (!patientUserId || !doctorUserId) throw new Error("Missing patient or doctor.");
  if (!proposedAtIso) throw new Error("Pick a meeting date and time.");
  const desc = String(description || "").trim();
  if (!desc) throw new Error("Enter a short description (reason, billing context, etc.).");
  const proposed = new Date(proposedAtIso);
  if (!Number.isFinite(proposed.getTime())) throw new Error("Invalid date/time.");
  let workflow = buildWorkflowPayload({
    patientDescription: desc,
    status: PACKAGE_MEETING_STATUS.AWAITING_DOCTOR,
    proposed_at: proposed.toISOString(),
    messages: [],
    patientAuthUserId: patientUserId,
    doctorAuthUserId: doctorUserId,
  });
  workflow = pushMessage(
    workflow,
    "patient",
    `Requested demo meeting at ${proposed.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}.`,
  );
  const encoded = encodeMeetingDescription(workflow);
  const consult = String(callKind || "video").trim() || "video";
  const doctorCandidates = await doctorIdsForAppointmentCreate(doctorUserId, doctorProfileId);
  if (!doctorCandidates.length) {
    throw new Error(
      isPbAppointmentDoctorProfileRelation()
        ? "Doctor profile id missing — cannot book (doctor relation is doctor_profile)."
        : "Doctor id missing — cannot book.",
    );
  }
  const coll = appointmentsColl();
  const variantSets = (doctorRecordId) => [
    {
      patient: patientUserId,
      doctor: doctorRecordId,
      scheduled_at: proposed.toISOString(),
      consultation_type: consult,
      status: "requested",
      reason: encoded,
      workflow_json: workflow,
    },
    {
      patient: patientUserId,
      doctor: doctorRecordId,
      scheduled_at: proposed.toISOString(),
      consultation_type: consult,
      status: "requested",
      reason: encoded,
    },
    {
      patient: patientUserId,
      doctor: doctorRecordId,
      scheduled_at: proposed.toISOString(),
      consultation_type: consult,
      status: "pending",
      reason: encoded,
    },
    {
      patient: patientUserId,
      doctor: doctorRecordId,
      scheduled_at: proposed.toISOString(),
      consultation_type: consult,
      status: "scheduled",
      reason: encoded,
    },
    {
      patient: patientUserId,
      doctor: doctorRecordId,
      scheduled_at: proposed.toISOString(),
      status: "requested",
      reason: encoded,
    },
    {
      patient: patientUserId,
      doctor: doctorRecordId,
      scheduled_at: proposed.toISOString(),
      reason: encoded,
    },
  ];
  let lastErr = null;
  outer: for (const docId of doctorCandidates) {
    for (const payload of variantSets(docId)) {
      try {
        const row = await pb.collection(coll).create(payload);
        await notifyLocal(
          "Meeting request sent",
          "Your doctor will accept the time or suggest other slots.",
        );
        return { ...decodePackageMeetingFromPbRow(row), localOnly: false };
      } catch (e) {
        lastErr = e;
        const httpStatus = e?.status ?? e?.response?.status;
        if (httpStatus === 403) {
          throw new Error(
            formatPocketBaseClientError(e) ||
              "Permission denied creating appointment — check PocketBase API rules.",
          );
        }
        if (httpStatus === 404) break outer;
        continue;
      }
    }
  }
  if (lastErr && isPocketBaseMissingResourceError(lastErr)) {
    const id = `local_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    const meeting = {
      id,
      patient_user_id: patientUserId,
      doctor_user_id: doctorUserId,
      description: desc,
      proposed_at: proposed.toISOString(),
      status: PACKAGE_MEETING_STATUS.AWAITING_DOCTOR,
      messages: workflow.messages,
      doctor_alternate_slots: [],
      patient_selected_slot: null,
      confirmed_at: null,
      scheduled_at: proposed.toISOString(),
      call_kind: consult,
      updated_at: new Date().toISOString(),
      localOnly: true,
    };
    await upsertLocalMeeting(meeting);
    await notifyLocal(
      "Meeting saved on device",
      "Could not reach PocketBase appointments — stored on this device only.",
    );
    return meeting;
  }
  const hint =
    formatPocketBaseClientError(lastErr) ||
    lastErr?.message ||
    `Could not create appointment in "${coll}". Check patient/doctor relations, scheduled_at, status options, consultation_type, and long text reason.`;
  throw new Error(hint);
}

/** @deprecated Use createPackageMeetingRequest with time + description */
export async function createPackageDemoBooking({
  patientUserId,
  doctorUserId,
  scheduledAtIso,
  callKind = "video",
}) {
  return createPackageMeetingRequest({
    patientUserId,
    doctorUserId,
    proposedAtIso: scheduledAtIso,
    description: "Package demo session (quick book).",
    callKind,
  });
}

export async function listPackageDemoBookings(patientUserId) {
  return listPackageMeetingsForPatient(patientUserId);
}

export async function doctorAcceptPackageMeetingInitial(meetingId) {
  if (!meetingId) throw new Error("Missing meeting.");
  if (String(meetingId).startsWith("local_")) {
    return withLocalMeeting(meetingId, (m) => {
      if (m.status !== PACKAGE_MEETING_STATUS.AWAITING_DOCTOR) {
        throw new Error("This meeting is not waiting for your first response.");
      }
      const msgs = [
        ...(m.messages || []),
        {
          at: new Date().toISOString(),
          role: "doctor",
          text: "Accepted your proposed time. See you at the meeting.",
        },
      ];
      return {
        ...m,
        status: PACKAGE_MEETING_STATUS.CONFIRMED,
        confirmed_at: m.proposed_at,
        messages: msgs,
      };
    });
  }
  const row = await pb.collection(appointmentsColl()).getOne(meetingId, { requestKey: null });
  const m = decodePackageMeetingFromPbRow(row);
  if (m.status !== PACKAGE_MEETING_STATUS.AWAITING_DOCTOR) {
    throw new Error("This meeting is not waiting for your first response.");
  }
  const wf = decodeWorkflowFromDescription(appointmentReasonField(row), {
    scheduled_at: row.scheduled_at,
    status: row.status,
  }).workflow;
  const proposed = m.proposed_at || row.scheduled_at;
  let next = {
    ...wf,
    status: PACKAGE_MEETING_STATUS.CONFIRMED,
    confirmed_at: proposed,
    proposed_at: proposed,
  };
  next = pushMessage(next, "doctor", "Accepted your proposed time. See you at the meeting.");
  await cancelPackageMeetingReminder(meetingId);
  return persistMeetingRow(meetingId, next, proposed, row.consultation_type || "video");
}

export async function doctorProposePackageMeetingReschedule(meetingId, alternateIsoSlots) {
  if (!meetingId) throw new Error("Missing meeting.");
  const slots = (alternateIsoSlots || [])
    .map((s) => String(s || "").trim())
    .filter(Boolean);
  const normalized = slots
    .map((s) => {
      const d = new Date(s);
      return Number.isFinite(d.getTime()) ? d.toISOString() : null;
    })
    .filter(Boolean);
  if (normalized.length < 3) {
    throw new Error("Choose at least three valid alternate date/times for the patient.");
  }
  if (String(meetingId).startsWith("local_")) {
    return withLocalMeeting(meetingId, (m) => {
      if (
        m.status !== PACKAGE_MEETING_STATUS.AWAITING_DOCTOR &&
        m.status !== PACKAGE_MEETING_STATUS.AWAITING_DOCTOR_AFTER_PATIENT_PICK &&
        m.status !== PACKAGE_MEETING_STATUS.DOCTOR_PROPOSED_SLOTS
      ) {
        throw new Error("Reschedule is not available for this meeting state.");
      }
      const msgs = [
        ...(m.messages || []),
        {
          at: new Date().toISOString(),
          role: "doctor",
          text: `Suggested times: ${normalized.map((x) => new Date(x).toLocaleString()).join(" · ")}`,
        },
      ];
      return {
        ...m,
        status: PACKAGE_MEETING_STATUS.DOCTOR_PROPOSED_SLOTS,
        doctor_alternate_slots: normalized,
        patient_selected_slot: null,
        confirmed_at: null,
        messages: msgs,
      };
    });
  }
  const row = await pb.collection(appointmentsColl()).getOne(meetingId, { requestKey: null });
  const m = decodePackageMeetingFromPbRow(row);
  if (
    m.status !== PACKAGE_MEETING_STATUS.AWAITING_DOCTOR &&
    m.status !== PACKAGE_MEETING_STATUS.AWAITING_DOCTOR_AFTER_PATIENT_PICK &&
    m.status !== PACKAGE_MEETING_STATUS.DOCTOR_PROPOSED_SLOTS
  ) {
    throw new Error("Reschedule is not available for this meeting state.");
  }
  const wf = decodeWorkflowFromDescription(appointmentReasonField(row), {
    scheduled_at: row.scheduled_at,
    status: row.status,
  }).workflow;
  let next = {
    ...wf,
    status: PACKAGE_MEETING_STATUS.DOCTOR_PROPOSED_SLOTS,
    doctor_alternate_slots: normalized,
    patient_selected_slot: null,
    confirmed_at: null,
  };
  next = pushMessage(
    next,
    "doctor",
    `Suggested times: ${normalized.map((x) => new Date(x).toLocaleString()).join(" · ")}`,
  );
  await cancelPackageMeetingReminder(meetingId);
  return persistMeetingRow(meetingId, next, normalized[0], row.consultation_type || "video");
}

export async function patientChooseRescheduleSlot(meetingId, chosenIso) {
  if (!meetingId || !chosenIso) throw new Error("Pick one of the doctor’s times.");
  const pick = new Date(chosenIso);
  if (!Number.isFinite(pick.getTime())) throw new Error("Invalid time.");
  if (String(meetingId).startsWith("local_")) {
    return withLocalMeeting(meetingId, (m) => {
      if (m.status !== PACKAGE_MEETING_STATUS.DOCTOR_PROPOSED_SLOTS) {
        throw new Error("The doctor has not proposed alternate slots yet.");
      }
      const allowed = (m.doctor_alternate_slots || []).some(
        (s) => Math.abs(new Date(s).getTime() - pick.getTime()) < 2000,
      );
      if (!allowed) {
        throw new Error("Pick one of the listed slots from your doctor.");
      }
      const msgs = [
        ...(m.messages || []),
        {
          at: new Date().toISOString(),
          role: "patient",
          text: `Selected ${pick.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} — please confirm.`,
        },
      ];
      return {
        ...m,
        status: PACKAGE_MEETING_STATUS.AWAITING_DOCTOR_AFTER_PATIENT_PICK,
        patient_selected_slot: pick.toISOString(),
        confirmed_at: null,
        messages: msgs,
      };
    });
  }
  const row = await pb.collection(appointmentsColl()).getOne(meetingId, { requestKey: null });
  const m = decodePackageMeetingFromPbRow(row);
  if (m.status !== PACKAGE_MEETING_STATUS.DOCTOR_PROPOSED_SLOTS) {
    throw new Error("The doctor has not proposed alternate slots yet.");
  }
  const allowed = (m.doctor_alternate_slots || []).some(
    (s) => Math.abs(new Date(s).getTime() - pick.getTime()) < 2000,
  );
  if (!allowed) {
    throw new Error("Pick one of the listed slots from your doctor.");
  }
  const wf = decodeWorkflowFromDescription(appointmentReasonField(row), {
    scheduled_at: row.scheduled_at,
    status: row.status,
  }).workflow;
  let next = {
    ...wf,
    status: PACKAGE_MEETING_STATUS.AWAITING_DOCTOR_AFTER_PATIENT_PICK,
    patient_selected_slot: pick.toISOString(),
    confirmed_at: null,
  };
  next = pushMessage(
    next,
    "patient",
    `Selected ${pick.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })} — please confirm.`,
  );
  await cancelPackageMeetingReminder(meetingId);
  return persistMeetingRow(meetingId, next, pick.toISOString(), row.consultation_type || "video");
}

export async function doctorConfirmPatientRescheduleChoice(meetingId) {
  if (!meetingId) throw new Error("Missing meeting.");
  if (String(meetingId).startsWith("local_")) {
    return withLocalMeeting(meetingId, (m) => {
      if (m.status !== PACKAGE_MEETING_STATUS.AWAITING_DOCTOR_AFTER_PATIENT_PICK || !m.patient_selected_slot) {
        throw new Error("Nothing to confirm yet.");
      }
      const when = m.patient_selected_slot;
      const msgs = [
        ...(m.messages || []),
        { at: new Date().toISOString(), role: "doctor", text: "Confirmed. Meeting is booked." },
      ];
      return {
        ...m,
        status: PACKAGE_MEETING_STATUS.CONFIRMED,
        confirmed_at: when,
        messages: msgs,
      };
    });
  }
  const row = await pb.collection(appointmentsColl()).getOne(meetingId, { requestKey: null });
  const m = decodePackageMeetingFromPbRow(row);
  if (m.status !== PACKAGE_MEETING_STATUS.AWAITING_DOCTOR_AFTER_PATIENT_PICK || !m.patient_selected_slot) {
    throw new Error("Nothing to confirm yet.");
  }
  const wf = decodeWorkflowFromDescription(appointmentReasonField(row), {
    scheduled_at: row.scheduled_at,
    status: row.status,
  }).workflow;
  const when = m.patient_selected_slot;
  let next = {
    ...wf,
    status: PACKAGE_MEETING_STATUS.CONFIRMED,
    confirmed_at: when,
  };
  next = pushMessage(next, "doctor", "Confirmed. Meeting is booked.");
  await cancelPackageMeetingReminder(meetingId);
  return persistMeetingRow(meetingId, next, when, row.consultation_type || "video");
}

// --- Package offers (collection: package_offers) ---
export async function doctorSendPackageOffer({
  patientUserId,
  doctorUserId,
  title = "Care package",
  amountInr = 8000,
  platformFeeInr = 2000,
  doctorCoins = 6000,
  sessions = 6,
  validityDays = 90,
  notes = "",
  package_slot = null,
  treatment_type = "",
  total_period = "",
  description_for_patient = "",
}) {
  const payload = {
    patient: patientUserId,
    doctor: doctorUserId,
    title,
    amount_inr: amountInr,
    platform_fee_inr: platformFeeInr,
    doctor_coins: doctorCoins,
    sessions,
    validity_days: validityDays,
    notes: String(notes || ""),
    status: "sent",
  };
  if (package_slot != null) payload.package_slot = package_slot;
  if (treatment_type) payload.treatment_type = treatment_type;
  if (total_period) payload.total_period = total_period;
  if (description_for_patient) payload.description = description_for_patient;
  try {
    const row = await pb.collection("package_offers").create(payload);
    await notifyLocal(
      "Package options received",
      `${title} — review and pay when ready.`,
    );
    return row;
  } catch (error) {
    const msg = formatPocketBaseClientError(error) || error?.message;
    throw new Error(
      msg ||
        "Could not send offer. Add `package_offers` in PocketBase with patient, doctor, title, amount_inr, platform_fee_inr, doctor_coins, sessions, validity_days, notes, status.",
    );
  }
}

/** Send offer using one of the doctor’s three configured catalogue slots (after optional edits). */
export async function doctorSendPackageOfferFromSlot({
  patientUserId,
  doctorUserId,
  slot,
  packageSlotIndex,
}) {
  const amountInr = Number(
    String(slot?.total_amount_inr ?? "").replace(/,/g, "").trim() || 0,
  );
  if (!amountInr) throw new Error("Package amount must be greater than zero.");
  const { platformFeeInr, doctorCoins } = splitPackagePayment(amountInr);
  const title = String(slot?.name || `Package ${packageSlotIndex}`).trim();
  const desc = String(slot?.description || "").trim();
  const treatment = String(slot?.treatment_type || "").trim();
  const period = String(slot?.total_period || "").trim();
  const notes = [
    desc,
    treatment ? `Treatment type: ${treatment}` : "",
    period ? `Total period: ${period}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");
  return doctorSendPackageOffer({
    patientUserId,
    doctorUserId,
    title,
    amountInr,
    platformFeeInr,
    doctorCoins,
    sessions: 6,
    validityDays: 90,
    notes,
    package_slot: packageSlotIndex,
    treatment_type: treatment,
    total_period: period,
    description_for_patient: desc,
  });
}

export async function listPackageOffersForPatient(patientUserId) {
  if (!patientUserId) return [];
  try {
    return await pb.collection("package_offers").getFullList({
      requestKey: null,
      sort: "-created",
      filter: `patient="${patientUserId}"`,
    });
  } catch {
    return [];
  }
}

/**
 * Stub payment: marks offer paid and appends coin ledger rows (doctor coins pending).
 * Full gateway can replace the middle section later.
 */
export async function patientPayPackageOfferStub(offerId, doctorUserId) {
  if (!offerId) throw new Error("Missing offer.");
  const paidPayload = {
    status: "paid",
    deal_started_at: new Date().toISOString(),
  };
  try {
    await pb.collection("package_offers").update(offerId, paidPayload);
  } catch (error) {
    try {
      await pb.collection("package_offers").update(offerId, { status: "paid" });
    } catch (e2) {
      const msg = formatPocketBaseClientError(error) || formatPocketBaseClientError(e2);
      throw new Error(msg || "Payment update failed.");
    }
  }
  const ts = new Date().toISOString();
  const lines = [
    {
      user: doctorUserId,
      delta: 0,
      reason: "package_payment_received_company_holds_full_amount",
      ref_collection: "package_offers",
      ref_id: offerId,
      meta: ts,
    },
    {
      user: doctorUserId,
      delta: 0,
      reason: "doctor_coins_pending_until_package_fulfilled",
      ref_collection: "package_offers",
      ref_id: offerId,
      meta: ts,
    },
  ];
  for (const line of lines) {
    try {
      await pb.collection("coin_ledger").create(line);
    } catch {
      // collection optional
    }
  }
  await notifyLocal(
    "Payment successful",
    "Your package deal is now active. The doctor will deliver sessions per the agreed plan.",
  );
  return true;
}

export async function listCoinLedgerForUser(userId) {
  if (!userId) return [];
  try {
    return await pb.collection("coin_ledger").getFullList({
      requestKey: null,
      sort: "-created",
      filter: `user="${userId}"`,
    });
  } catch {
    return [];
  }
}

export async function doctorWithdrawCoinsStub(doctorUserId, coins) {
  const n = Number(coins);
  if (!doctorUserId || !Number.isFinite(n) || n < 1) {
    throw new Error("Invalid withdrawal.");
  }
  try {
    await pb.collection("coin_ledger").create({
      user: doctorUserId,
      delta: -n,
      reason: "withdrawal_to_bank_stub",
      meta: new Date().toISOString(),
    });
    await notifyLocal("Withdrawal", `${n} coins processed (stub).`);
    return true;
  } catch (error) {
    const msg = formatPocketBaseClientError(error) || error?.message;
    throw new Error(
      msg ||
        "Withdrawal failed. Add `coin_ledger` (user, delta number, reason text, meta).",
    );
  }
}

// --- Quick Solution (10 coins) / Quick Counselling (25 coins) ---
export async function createQuickSolutionRequest({
  patientUserId,
  notes,
  privateMode,
  imagePart,
}) {
  const base = {
    patient: patientUserId,
    notes: String(notes || ""),
    private_mode: Boolean(privateMode),
    patient_cost_coins: 10,
    platform_fee_coins: 5,
    provider_coins: 5,
    status: "queued",
  };
  try {
    let row;
    if (imagePart?.uri) {
      const form = new FormData();
      form.append("patient", patientUserId);
      form.append("notes", base.notes);
      form.append("private_mode", privateMode ? "true" : "false");
      form.append("patient_cost_coins", "10");
      form.append("platform_fee_coins", "5");
      form.append("provider_coins", "5");
      form.append("status", "queued");
      form.append("image", imagePart);
      row = await pb.collection("quick_solution_requests").create(form);
    } else {
      row = await pb.collection("quick_solution_requests").create(base);
    }
    await notifyLocal(
      "Quick Solution submitted",
      privateMode
        ? "Private mode: your identity is hidden from the clinic side."
        : "A verified clinic will review your snap shortly.",
    );
    return row;
  } catch (error) {
    const msg = formatPocketBaseClientError(error) || error?.message;
    throw new Error(
      msg ||
        "Could not submit. Add `quick_solution_requests` (patient, notes, private_mode, image file, coin splits, status).",
    );
  }
}

export async function createQuickCounsellingRequest({ patientUserId, topic }) {
  try {
    const row = await pb.collection("quick_counselling_requests").create({
      patient: patientUserId,
      topic: String(topic || "").trim() || "General",
      patient_cost_coins: 25,
      platform_fee_coins: 10,
      provider_coins: 15,
      status: "queued",
    });
    await notifyLocal(
      "Quick Counselling",
      "An RMP doctor will connect shortly.",
    );
    return row;
  } catch (error) {
    const msg = formatPocketBaseClientError(error) || error?.message;
    throw new Error(
      msg ||
        "Could not start counselling. Add `quick_counselling_requests` in PocketBase.",
    );
  }
}

export async function listQuickSolutionRequests(patientUserId) {
  if (!patientUserId) return [];
  try {
    return await pb.collection("quick_solution_requests").getFullList({
      requestKey: null,
      sort: "-created",
      filter: `patient="${patientUserId}"`,
    });
  } catch {
    return [];
  }
}

export async function listQuickCounsellingRequests(patientUserId) {
  if (!patientUserId) return [];
  try {
    return await pb.collection("quick_counselling_requests").getFullList({
      requestKey: null,
      sort: "-created",
      filter: `patient="${patientUserId}"`,
    });
  } catch {
    return [];
  }
}

/**
 * Queued Quick Solution rows for clinic/RMP dashboards.
 * PocketBase: allow authenticated staff/doctors to list `status="queued"` (and expand `patient` if you want names).
 * Errors propagate so the UI can show 403 / rule failures instead of looking like an empty queue.
 */
export async function listQueuedQuickSolutionRequestsForProvider() {
  try {
    return await pb.collection("quick_solution_requests").getFullList({
      requestKey: null,
      sort: "-created",
      filter: `status="queued"`,
      expand: "patient",
    });
  } catch (e1) {
    try {
      return await pb.collection("quick_solution_requests").getFullList({
        requestKey: null,
        sort: "-created",
        filter: `status="queued"`,
      });
    } catch (e2) {
      const msg =
        formatPocketBaseClientError(e2) ||
        formatPocketBaseClientError(e1) ||
        e2?.message ||
        e1?.message ||
        "List failed";
      throw new Error(msg);
    }
  }
}

/**
 * Queued Quick Counselling rows for RMP dashboards.
 * PocketBase: same list rules as quick_solution_requests for your role.
 */
export async function listQueuedQuickCounsellingRequestsForProvider() {
  try {
    return await pb.collection("quick_counselling_requests").getFullList({
      requestKey: null,
      sort: "-created",
      filter: `status="queued"`,
      expand: "patient",
    });
  } catch (e1) {
    try {
      return await pb.collection("quick_counselling_requests").getFullList({
        requestKey: null,
        sort: "-created",
        filter: `status="queued"`,
      });
    } catch (e2) {
      const msg =
        formatPocketBaseClientError(e2) ||
        formatPocketBaseClientError(e1) ||
        e2?.message ||
        e1?.message ||
        "List failed";
      throw new Error(msg);
    }
  }
}

// --- Quick Solution / Counselling tracking & doctor help offers ---
//
// Status lifecycle (`quick_solution_requests` & `quick_counselling_requests`):
//   "queued"    — initial state set on submit; visible in doctor queues and the patient tracking list.
//   "closed"    — patient picked a doctor and closed the request from their tracking list (still in DB).
//   "cancelled" — patient withdrew the request from their tracking list (still in DB).
//
// Doctor "help" offers are stored in an optional collection `quick_help_offers`. Add it in
// PocketBase Admin to enable the "(Doctor) wants to help you" alert + arrow button on the
// patient tracking list. If the collection is missing the rest of the flow still works:
// the doctor's first chat message and the conversation itself are persisted normally, the
// patient just won't see the highlighted alert pointer for it.
//
// Suggested `quick_help_offers` schema (all optional except marked):
//   request_id     text   (required)  — id of the quick_solution_requests / quick_counselling_requests row
//   request_kind   select (required)  — values: solution, counselling
//   doctor         relation UsersAuth (required)
//   patient        relation UsersAuth (required)
//   conversation   relation conversations (required)
//   first_message  text                — plain text preview of the doctor's offer message
//   status         select              — active, closed, cancelled (default: active)
//
// Suggested API rules:
//   list:   doctor = @request.auth.id || patient = @request.auth.id
//   view:   doctor = @request.auth.id || patient = @request.auth.id
//   create: doctor = @request.auth.id
//   update: doctor = @request.auth.id || patient = @request.auth.id
//   delete: (admin only)
export const QUICK_REQUEST_STATUS = {
  QUEUED: "queued",
  CLOSED: "closed",
  CANCELLED: "cancelled",
};

const QUICK_REQUEST_COLLECTION = {
  solution: "quick_solution_requests",
  counselling: "quick_counselling_requests",
};

function quickRequestCollectionName(kind) {
  return QUICK_REQUEST_COLLECTION[kind] || QUICK_REQUEST_COLLECTION.solution;
}

/** Doctor records a help offer + first chat message for a queued quick request. */
export async function recordQuickHelpOffer({
  requestId,
  requestKind,
  doctorUserId,
  patientUserId,
  conversationId,
  firstMessage,
}) {
  if (!requestId || !doctorUserId || !patientUserId || !conversationId) {
    return { record: null, skipped: true };
  }
  const kind = requestKind === "counselling" ? "counselling" : "solution";
  const trimmed = String(firstMessage || "").trim();
  const baseAttempts = [
    {
      request_id: requestId,
      request_kind: kind,
      doctor: doctorUserId,
      patient: patientUserId,
      conversation: conversationId,
      first_message: trimmed,
      status: "active",
    },
    {
      request_id: requestId,
      request_kind: kind,
      doctor: doctorUserId,
      patient: patientUserId,
      conversation: conversationId,
      first_message: trimmed,
    },
    {
      request_id: requestId,
      request_kind: kind,
      doctor: doctorUserId,
      patient: patientUserId,
      conversation: conversationId,
    },
  ];
  let lastError = null;
  for (const body of baseAttempts) {
    try {
      const record = await pb.collection("quick_help_offers").create(body);
      return { record, skipped: false };
    } catch (error) {
      lastError = error;
      if (isPocketBaseMissingResourceError(error)) break;
    }
  }
  console.log(
    "recordQuickHelpOffer: could not persist offer (collection rules or schema?). Error:",
    lastError?.message,
  );
  return { record: null, skipped: true, error: lastError };
}

/** Doctor-facing list: queued offers this doctor already made (used to flag "already offered"). */
export async function listQuickHelpOffersByDoctor(doctorUserId) {
  if (!doctorUserId) return [];
  try {
    return await pb.collection("quick_help_offers").getFullList({
      requestKey: null,
      sort: "-created",
      filter: `doctor="${doctorUserId}"`,
    });
  } catch {
    return [];
  }
}

/**
 * Fallback for the doctor side mirroring `listInferredQuickHelpOffersForPatient`.
 * For each queued request in `requests` (must carry `{ id, kind, created, patient }`),
 * we infer "this doctor already offered help" if a 1:1 conversation exists with that
 * patient and this doctor has sent a message in it AFTER request.created.
 */
export async function listInferredOffersByDoctor(doctorUserId, requests) {
  if (!doctorUserId || !Array.isArray(requests) || !requests.length) return [];

  let conversations = [];
  try {
    conversations = await pb.collection("conversations").getFullList({
      requestKey: null,
      sort: "-updated,-created",
      filter: `members~"${doctorUserId}"`,
    });
  } catch (e) {
    console.log("listInferredOffersByDoctor conversations:", e?.message);
    return [];
  }

  const convByPeer = new Map();
  for (const c of conversations) {
    if (c?.linkedWound) continue;
    const members = Array.isArray(c?.members) ? c.members : [];
    if (members.length !== 2) continue;
    const peerId = members.find((id) => id !== doctorUserId);
    if (!peerId) continue;
    if (!convByPeer.has(peerId)) convByPeer.set(peerId, c);
  }
  if (!convByPeer.size) return [];

  const offers = [];
  for (const req of requests) {
    const requestCreated = String(req?.created || "");
    if (!requestCreated || !req?.id || !req?.kind) continue;
    const patientId =
      (typeof req?.patient === "string" ? req.patient : null) ||
      req?.patient?.id ||
      req?.expand?.patient?.id ||
      "";
    if (!patientId) continue;
    const conv = convByPeer.get(patientId);
    if (!conv) continue;
    let firstMsg = null;
    try {
      const page = await pb.collection("messages").getList(1, 1, {
        requestKey: null,
        sort: "created",
        filter:
          `conversation="${conv.id}" && sender="${doctorUserId}" && created > "${requestCreated}"`,
      });
      firstMsg = page?.items?.[0] || null;
    } catch {
      firstMsg = null;
    }
    if (!firstMsg) continue;
    offers.push({
      id: `inferred:${conv.id}:${req.kind}:${req.id}`,
      synthesized: true,
      request_id: req.id,
      request_kind: req.kind,
      doctor: doctorUserId,
      patient: patientId,
      conversation: conv.id,
      first_message: "",
      created: firstMsg.created,
    });
  }
  return offers;
}

/** Patient-facing list: offers for the patient's active requests. */
export async function listQuickHelpOffersForPatient(patientUserId) {
  if (!patientUserId) return [];
  try {
    return await pb.collection("quick_help_offers").getFullList({
      requestKey: null,
      sort: "-created",
      filter: `patient="${patientUserId}"`,
      expand: "doctor",
    });
  } catch (e1) {
    try {
      return await pb.collection("quick_help_offers").getFullList({
        requestKey: null,
        sort: "-created",
        filter: `patient="${patientUserId}"`,
      });
    } catch {
      return [];
    }
  }
}

/**
 * Fallback when the optional `quick_help_offers` collection is missing or its
 * API rules block reads. By spec, the doctor always creates/reuses a direct
 * 1:1 conversation and sends a chat message when they offer help. We scan the
 * patient's conversations + messages and synthesize offer rows that look
 * identical to what `listQuickHelpOffersForPatient` returns, so the rest of
 * the UI renders unchanged.
 *
 * Each `requests` entry must carry `{ id, kind, created }`.
 */
export async function listInferredQuickHelpOffersForPatient(
  patientUserId,
  requests,
) {
  if (!patientUserId || !Array.isArray(requests) || !requests.length) return [];

  let conversations = [];
  try {
    conversations = await pb.collection("conversations").getFullList({
      requestKey: null,
      sort: "-updated,-created",
      filter: `members~"${patientUserId}"`,
      expand: "members",
    });
  } catch (e) {
    console.log(
      "listInferredQuickHelpOffersForPatient conversations:",
      e?.message,
    );
    return [];
  }

  const doctorConvs = [];
  for (const c of conversations) {
    if (c?.linkedWound) continue;
    const members = Array.isArray(c?.members) ? c.members : [];
    if (members.length !== 2) continue;
    const peerId = members.find((id) => id !== patientUserId);
    if (!peerId) continue;
    const peerExpanded =
      (c?.expand?.members || []).find((m) => m?.id === peerId) || null;
    const role = String(peerExpanded?.role || "").toLowerCase();
    if (role && role !== "doctor") continue;
    doctorConvs.push({ conversation: c, peerId, peer: peerExpanded });
  }
  if (!doctorConvs.length) return [];

  const offers = [];
  for (const req of requests) {
    const requestCreated = String(req?.created || "");
    if (!requestCreated || !req?.id || !req?.kind) continue;
    for (const dc of doctorConvs) {
      let firstMsg = null;
      try {
        const page = await pb.collection("messages").getList(1, 1, {
          requestKey: null,
          sort: "created",
          filter:
            `conversation="${dc.conversation.id}" && sender="${dc.peerId}" && created > "${requestCreated}"`,
        });
        firstMsg = page?.items?.[0] || null;
      } catch {
        firstMsg = null;
      }
      if (!firstMsg) continue;
      offers.push({
        id: `inferred:${dc.conversation.id}:${req.kind}:${req.id}`,
        synthesized: true,
        request_id: req.id,
        request_kind: req.kind,
        doctor: dc.peerId,
        patient: patientUserId,
        conversation: dc.conversation.id,
        first_message: "",
        created: firstMsg.created,
        expand: dc.peer ? { doctor: dc.peer } : undefined,
      });
    }
  }
  return offers;
}

/** Patient tracking list: their queued requests + grouped doctor offers. */
export async function listActiveQuickRequestsForPatient(patientUserId) {
  if (!patientUserId) return { items: [], offersMissing: false };
  const filterActive = `patient="${patientUserId}" && status="queued"`;
  let solutions = [];
  let counselling = [];
  try {
    solutions = await pb.collection("quick_solution_requests").getFullList({
      requestKey: null,
      sort: "-created",
      filter: filterActive,
    });
  } catch (e) {
    console.log(
      "listActiveQuickRequestsForPatient solutions:",
      e?.message,
    );
  }
  try {
    counselling = await pb.collection("quick_counselling_requests").getFullList({
      requestKey: null,
      sort: "-created",
      filter: filterActive,
    });
  } catch (e) {
    console.log(
      "listActiveQuickRequestsForPatient counselling:",
      e?.message,
    );
  }

  const tagged = [
    ...solutions.map((row) => ({ ...row, kind: "solution" })),
    ...counselling.map((row) => ({ ...row, kind: "counselling" })),
  ];

  // 1) Real offers (when the optional `quick_help_offers` collection exists
  //    and its rules allow this patient to read).
  const realOffers = await listQuickHelpOffersForPatient(patientUserId);
  // 2) Inferred offers — works without `quick_help_offers` at all by reading
  //    `conversations` + `messages` the patient can already see.
  const inferredOffers = await listInferredQuickHelpOffersForPatient(
    patientUserId,
    tagged,
  );

  // Merge: dedup by (request_kind, request_id, conversation_id). Real offers
  // win because they're added first.
  const offersPerRequest = new Map();
  const consume = (offer) => {
    const reqKey = `${offer.request_kind || "solution"}::${offer.request_id || ""}`;
    if (!offersPerRequest.has(reqKey)) offersPerRequest.set(reqKey, new Map());
    const convMap = offersPerRequest.get(reqKey);
    const convId =
      typeof offer.conversation === "string"
        ? offer.conversation
        : offer.conversation?.id || "";
    if (!convId) return;
    if (!convMap.has(convId)) convMap.set(convId, offer);
  };
  for (const o of realOffers) consume(o);
  for (const o of inferredOffers) consume(o);

  const items = tagged
    .map((row) => {
      const reqKey = `${row.kind}::${row.id}`;
      const convMap = offersPerRequest.get(reqKey);
      return { ...row, offers: convMap ? Array.from(convMap.values()) : [] };
    })
    .sort((a, b) => String(b.created || "").localeCompare(String(a.created || "")));

  return { items };
}

/** Patient closes a quick request (after picking a doctor). Status becomes "closed". */
export async function closeQuickRequest({ id, kind }) {
  if (!id) throw new Error("Missing request id.");
  const collection = quickRequestCollectionName(kind);
  return await pb.collection(collection).update(id, {
    status: QUICK_REQUEST_STATUS.CLOSED,
  });
}

/** Patient cancels a quick request (no longer needs help). Status becomes "cancelled". */
export async function cancelQuickRequest({ id, kind }) {
  if (!id) throw new Error("Missing request id.");
  const collection = quickRequestCollectionName(kind);
  return await pb.collection(collection).update(id, {
    status: QUICK_REQUEST_STATUS.CANCELLED,
  });
}

export async function requestPackageDoctorChange({
  patientUserId,
  notes,
  currentDoctorUserId,
}) {
  try {
    return await pb.collection("package_doctor_change_requests").create({
      patient: patientUserId,
      notes: String(notes || "").trim(),
      current_doctor: currentDoctorUserId || "",
      status: "pending",
    });
  } catch (error) {
    const msg = formatPocketBaseClientError(error) || error?.message;
    throw new Error(
      msg ||
        "Request failed. Add `package_doctor_change_requests` (patient, notes, current_doctor, status). No refund policy applies — see app copy.",
    );
  }
}

export async function persistPreferredQuickProvider(patientProfileId, doctorUserId) {
  if (!patientProfileId) return;
  try {
    await pb.collection("patient_profile").update(patientProfileId, {
      preferred_quick_doctor: doctorUserId,
    });
  } catch {
    try {
      await pb.collection("patient_profile").update(patientProfileId, {
        preferred_quick_provider: doctorUserId,
      });
    } catch (e2) {
      console.log("persistPreferredQuickProvider skipped:", e2?.message);
    }
  }
}
