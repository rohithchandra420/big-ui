// models.ts
export interface Volunteer {
  id: string;        // unique id used as resource id in scheduler
  name: string;
  email?: string;
  // any other meta
}

export interface User {
  _id: string;
  name: string;
  email: string;
  role: 'GOD' | 'ADMIN' | 'TL' | 'VOL';
}

export type TaskStatus = 'pending'|'assigned'|'done'|'cancelled';

export interface Task {
  _id: string;
  title: string;
  description?: string;
  start: string; // ISO string
  end: string;   // ISO string
  assignedVolunteerIds: string[]; // multiple volunteers allowed
  status?: TaskStatus;
  createdBy?: string; // TL id
}