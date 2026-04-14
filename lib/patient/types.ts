/**
 * Patient domain types — Dev 1 patient flow (@Kokoshiro).
 * Align PocketBase collection fields with your backend schema.
 */

export type DoctorListItem = {
  id: string;
  name: string;
  email: string;
  specialty: string;
  department: string;
  bio: string;
  experienceYears?: number;
  rating?: number;
  profileId?: string;
};

export type AppointmentRecord = {
  id: string;
  scheduledAt: string;
  slotLabel: string;
  consultType: string;
  status: string;
  notes?: string;
  doctorName?: string;
  raw: unknown;
};

export type WoundSummary = {
  id: string;
  description: string;
  status: string;
  created: string;
  imageUrl?: string | null;
};
