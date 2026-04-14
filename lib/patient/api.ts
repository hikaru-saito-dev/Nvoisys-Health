/**
 * Patient APIs — Dev 1 (@Kokoshiro): doctors, appointments, wound upload.
 *
 * PocketBase collections used:
 * - UsersAuth (doctors: role="doctor")
 * - doctor_profile (optional expand user; fields: user, specialty, department, bio, years_experience, rating)
 * - wounds (patient, description, severity, status, notes, hasPharmacy, doctor?, image?, conversation?)
 * - conversations, messages (wound pipeline — matches legacy App.js)
 * - appointments (patient, doctor, scheduled_at, slot_label, consult_type, status, notes) — create if missing on server
 */

import type { RecordModel } from 'pocketbase';
import { ClientResponseError } from 'pocketbase';

import { pb } from '@/pocketbase';

import type { AppointmentRecord, DoctorListItem, WoundSummary } from './types';

const DEFAULT_WOUND_MESSAGE = 'Wound report submitted. Doctor will review shortly.';

function readPocketBaseDataMessages(err: ClientResponseError): string | null {
  const data = err.response?.data as Record<string, { message?: string } | string> | undefined;
  if (!data || typeof data !== 'object') return null;
  const top = data.message;
  if (typeof top === 'string' && top.trim()) return top;
  const lines: string[] = [];
  for (const [key, val] of Object.entries(data)) {
    if (key === 'message') continue;
    if (val && typeof val === 'object' && typeof val.message === 'string') {
      lines.push(`${key}: ${val.message}`);
    }
  }
  return lines.length ? lines.join('\n') : null;
}

function getAuthRecord(): RecordModel | null {
  const store = pb.authStore as { record?: RecordModel | null; model: RecordModel | null };
  return store.record ?? store.model ?? null;
}

function uniqueIds(values: (string | null | undefined)[]) {
  return [...new Set(values.filter(Boolean) as string[])];
}

function buildConversationTitle(description: string) {
  const d = description?.trim() || 'Wound Case';
  return d.length > 40 ? `${d.slice(0, 40)}...` : d;
}

async function fetchUsersByRole(role: string): Promise<RecordModel[]> {
  try {
    return await pb.collection('UsersAuth').getFullList({
      requestKey: null,
      filter: `role="${role}"`,
    });
  } catch {
    return [];
  }
}

function mapUserToDoctor(u: RecordModel): DoctorListItem {
  return {
    id: u.id,
    name: (u.name as string) || 'Doctor',
    email: (u.email as string) || '',
    specialty: 'General',
    department: '',
    bio: '',
    profileId: undefined,
  };
}

function mapProfileToDoctor(p: RecordModel): DoctorListItem {
  const u = p.expand?.user as RecordModel | undefined;
  const userId = (p.user as string) || u?.id || '';
  return {
    id: userId,
    name: (u?.name as string) || 'Doctor',
    email: (u?.email as string) || '',
    specialty: (p.specialty as string) || (p.department as string) || 'General',
    department: (p.department as string) || '',
    bio: (p.bio as string) || '',
    experienceYears:
      typeof p.years_experience === 'number'
        ? (p.years_experience as number)
        : typeof p.experience_years === 'number'
          ? (p.experience_years as number)
          : undefined,
    rating: typeof p.rating === 'number' ? (p.rating as number) : undefined,
    profileId: p.id,
  };
}

function matchesCategory(d: DoctorListItem, category: string) {
  const c = category.trim().toLowerCase();
  if (!c || c === 'all') return true;
  const spec = d.specialty.trim().toLowerCase();
  const dept = d.department.trim().toLowerCase();
  return spec === c || dept === c || spec.includes(c) || dept.includes(c);
}

export async function fetchDoctors(params: {
  category?: string;
  search?: string;
}): Promise<DoctorListItem[]> {
  const category = params.category?.trim() ?? '';
  const search = params.search?.trim().toLowerCase();

  let fromProfiles: DoctorListItem[] | null = null;

  try {
    const records = await pb.collection('doctor_profile').getFullList({
      expand: 'user',
      requestKey: null,
    });
    fromProfiles = records.map(mapProfileToDoctor).filter((d) => d.id);
  } catch {
    fromProfiles = null;
  }

  if (fromProfiles !== null) {
    let rows = fromProfiles;
    if (category && category !== 'All') {
      rows = rows.filter((d) => matchesCategory(d, category));
    }
    if (search) {
      rows = rows.filter(
        (d) =>
          d.name.toLowerCase().includes(search) ||
          d.specialty.toLowerCase().includes(search) ||
          d.bio.toLowerCase().includes(search) ||
          d.email.toLowerCase().includes(search) ||
          d.department.toLowerCase().includes(search),
      );
    }
    return rows;
  }

  const doctors = await fetchUsersByRole('doctor');
  let rows = doctors.map(mapUserToDoctor);
  if (category && category !== 'All') {
    rows = rows.filter((d) => matchesCategory(d, category));
  }
  if (search) {
    rows = rows.filter(
      (d) => d.name.toLowerCase().includes(search) || d.email.toLowerCase().includes(search),
    );
  }
  return rows;
}

export const DOCTOR_CATEGORIES = ['All', 'General', 'Cardiology', 'Dermatology', 'Orthopedics', 'Pediatrics', 'ENT'] as const;

export async function getDoctorDetail(userId: string): Promise<DoctorListItem | null> {
  try {
    const profile = await pb.collection('doctor_profile').getFirstListItem(`user="${userId}"`, {
      expand: 'user',
    });
    return mapProfileToDoctor(profile);
  } catch {
    try {
      const u = await pb.collection('UsersAuth').getOne(userId);
      if (u.role !== 'doctor') return null;
      return mapUserToDoctor(u);
    } catch {
      return null;
    }
  }
}

export type CreateAppointmentInput = {
  doctorUserId: string;
  scheduledAt: string;
  slotLabel: string;
  consultType: string;
  notes?: string;
};

/**
 * Turns PocketBase API errors into text the booking UI can show.
 * 404 usually means the `appointments` collection is missing or the URL is wrong.
 */
export function formatAppointmentBookingError(error: unknown): string {
  if (!(error instanceof ClientResponseError)) {
    return error instanceof Error ? error.message : 'Booking failed.';
  }
  const fromData = readPocketBaseDataMessages(error);
  if (fromData) return fromData;
  if (error.status === 404) {
    return (
      'The server could not find the "appointments" collection (HTTP 404). ' +
      'In PocketBase Admin, create a collection named exactly `appointments` with relation fields `patient` and `doctor` ' +
      '(both pointing at your users/auth collection), plus text fields `scheduled_at`, `slot_label`, `consult_type`, `status`, and `notes`. ' +
      'Then set create rules so patients can insert their own rows.'
    );
  }
  if (error.status === 403) {
    return (
      'Creating an appointment was forbidden (HTTP 403). Update PocketBase API rules on the `appointments` collection ' +
      'so authenticated patients can create records (and relate to the chosen doctor).'
    );
  }
  return error.message || 'Booking failed.';
}

export async function createAppointment(input: CreateAppointmentInput) {
  const patient = getAuthRecord();
  if (!patient?.id) {
    throw new Error('Sign in as a patient to book an appointment.');
  }
  return pb.collection('appointments').create({
    patient: patient.id,
    doctor: input.doctorUserId,
    scheduled_at: input.scheduledAt,
    slot_label: input.slotLabel,
    consult_type: input.consultType,
    status: 'pending',
    notes: input.notes?.trim() || '',
  });
}

export async function fetchPatientAppointments(): Promise<AppointmentRecord[]> {
  const patient = getAuthRecord();
  if (!patient?.id) return [];
  try {
    const rows = await pb.collection('appointments').getFullList({
      filter: `patient="${patient.id}"`,
      sort: '-scheduled_at',
      expand: 'doctor',
      requestKey: null,
    });
    return rows.map((r: RecordModel) => ({
      id: r.id,
      scheduledAt: String(r.scheduled_at ?? (r as { scheduledAt?: string }).scheduledAt ?? ''),
      slotLabel: String(r.slot_label ?? (r as { slotLabel?: string }).slotLabel ?? ''),
      consultType: String(r.consult_type ?? (r as { consultType?: string }).consultType ?? 'Video'),
      status: String(r.status || 'pending'),
      notes: (r.notes as string) || '',
      doctorName: (r.expand?.doctor as RecordModel | undefined)?.name as string | undefined,
      raw: r,
    }));
  } catch {
    return [];
  }
}

export async function fetchPatientWounds(): Promise<WoundSummary[]> {
  const patient = getAuthRecord();
  if (!patient?.id) return [];
  try {
    const rows = await pb.collection('wounds').getFullList({
      filter: `patient="${patient.id}"`,
      sort: '-created',
      requestKey: null,
    });
    return rows.map((r) => ({
      id: r.id,
      description: String(r.description || ''),
      status: String(r.status || 'review_pending'),
      created: String(r.created || ''),
      imageUrl: r.image ? pb.files.getUrl(r, r.image as string) : null,
    }));
  } catch {
    return [];
  }
}

export type SubmitWoundInput = {
  description: string;
  imageUri?: string | null;
  /** If set, conversation includes this doctor; otherwise all doctors (legacy behaviour). */
  doctorUserId?: string | null;
};

export type SubmitWoundReportResult = {
  woundId: string;
  conversationId: string | null;
  /** False when the wound row was saved but conversation / thread setup failed. */
  threadStarted: boolean;
};

/** PocketBase errors when creating the wound row (before the conversation pipeline). */
export function formatWoundSubmitError(error: unknown): string {
  if (!(error instanceof ClientResponseError)) {
    return error instanceof Error ? error.message : 'Submit failed.';
  }
  const fromData = readPocketBaseDataMessages(error);
  if (fromData) return fromData;
  if (error.status === 404) {
    return (
      'The server could not save to the "wounds" collection (HTTP 404). ' +
      'Confirm the collection exists and your account is allowed to create records.'
    );
  }
  if (error.status === 403) {
    return 'Saving this wound report was forbidden (HTTP 403). Check PocketBase API rules for the `wounds` collection.';
  }
  return error.message || 'Submit failed.';
}

export async function submitWoundReport(input: SubmitWoundInput): Promise<SubmitWoundReportResult> {
  const patient = getAuthRecord();
  if (!patient?.id) {
    throw new Error('Sign in to submit a wound report.');
  }

  const formData = new FormData();
  formData.append('patient', patient.id);
  formData.append('description', input.description?.trim() || '');
  formData.append('severity', 'moderate');
  formData.append('status', 'review_pending');
  formData.append('notes', '');
  formData.append('hasPharmacy', 'false');
  if (input.doctorUserId) {
    formData.append('doctor', input.doctorUserId);
  }

  if (input.imageUri) {
    const uri = input.imageUri;
    const name = uri.split('/').pop()?.split('?')[0] || 'wound.jpg';
    const ext = name.split('.').pop()?.toLowerCase();
    const type = ext === 'png' ? 'image/png' : 'image/jpeg';
    // React Native FormData file part
    formData.append('image', { uri, name, type } as never);
  }

  const woundRecord = await pb.collection('wounds').create(formData);

  let doctorUsers: RecordModel[];
  if (input.doctorUserId) {
    try {
      doctorUsers = [await pb.collection('UsersAuth').getOne(input.doctorUserId)];
    } catch {
      doctorUsers = await fetchUsersByRole('doctor');
    }
  } else {
    doctorUsers = await fetchUsersByRole('doctor');
  }

  const members = uniqueIds([patient.id, ...doctorUsers.map((u) => u.id)]);

  let rollbackConversationId: string | null = null;
  try {
    const conv = await pb.collection('conversations').create({
      title: buildConversationTitle(woundRecord.description as string),
      linkedWound: woundRecord.id,
      members,
      lastMessageAt: new Date().toISOString(),
    });
    rollbackConversationId = conv.id;

    await pb.collection('wounds').update(woundRecord.id, {
      conversation: conv.id,
    });

    try {
      await pb.collection('messages').create({
        conversation: conv.id,
        kind: 'system',
        text: DEFAULT_WOUND_MESSAGE,
      });
    } catch {
      /* Wound + conversation are usable without the welcome message. */
    }

    return { woundId: woundRecord.id, conversationId: conv.id, threadStarted: true };
  } catch {
    if (rollbackConversationId) {
      try {
        await pb.collection('conversations').delete(rollbackConversationId);
      } catch {
        /* ignore rollback failure */
      }
    }
    return { woundId: woundRecord.id, conversationId: null, threadStarted: false };
  }
}

/**
 * Deletes a wound owned by the signed-in patient. Best-effort removal of linked messages and conversation.
 */
export async function deletePatientWound(woundId: string): Promise<void> {
  const patient = getAuthRecord();
  if (!patient?.id) {
    throw new Error('Sign in to delete a wound report.');
  }
  const wound = await pb.collection('wounds').getOne(woundId);
  if ((wound.patient as string) !== patient.id) {
    throw new Error('You can only delete your own wound reports.');
  }
  const convId = typeof wound.conversation === 'string' ? wound.conversation : null;
  if (convId) {
    try {
      const msgs = await pb.collection('messages').getFullList({
        filter: `conversation="${convId}"`,
        requestKey: null,
      });
      for (const m of msgs) {
        try {
          await pb.collection('messages').delete(m.id);
        } catch {
          /* continue */
        }
      }
    } catch {
      /* ignore */
    }
    try {
      await pb.collection('conversations').delete(convId);
    } catch {
      /* ignore */
    }
  }
  await pb.collection('wounds').delete(woundId);
}
