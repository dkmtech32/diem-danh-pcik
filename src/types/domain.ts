// Domain types matching the database schema

export type SessionStatus = 'open' | 'finalized' | 'closed';
export type RsvpStatus = 'join' | 'maybe' | 'skip';
export type RsvpSource = 'button' | 'reaction' | 'admin';
export type PaymentStatus = 'unpaid' | 'paid';
export type GroupMemberRole = 'admin' | 'member';

export interface Group {
  id: number;
  telegram_chat_id: string;
  telegram_chat_title: string | null;
  created_at: string;
  updated_at: string;
}

export interface Member {
  id: number;
  telegram_user_id: string;
  username: string | null;
  first_name: string | null;
  last_name: string | null;
  display_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface GroupMember {
  id: number;
  group_id: number;
  member_id: number;
  role: GroupMemberRole;
  created_at: string;
}

export interface Session {
  id: number;
  group_id: number;
  title: string;
  scheduled_at: string | null;
  location: string | null;
  estimated_cost: number | null;
  actual_cost: number | null;
  status: SessionStatus;
  created_by_member_id: number;
  telegram_message_id: string | null;
  finalized_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface SessionRsvp {
  id: number;
  session_id: number;
  member_id: number;
  rsvp_status: RsvpStatus;
  source: RsvpSource;
  created_at: string;
  updated_at: string;
}

export interface SessionPlayer {
  id: number;
  session_id: number;
  member_id: number;
  created_at: string;
}

export interface SessionSplit {
  id: number;
  session_id: number;
  member_id: number;
  amount_due: number;
  amount_paid: number;
  payment_status: PaymentStatus;
  paid_at: string | null;
  created_at: string;
  updated_at: string;
}

// Extended types for joins
export interface RsvpWithMember extends SessionRsvp {
  display_name: string | null;
  first_name: string | null;
  username: string | null;
}

export interface PlayerWithMember extends SessionPlayer {
  display_name: string | null;
  first_name: string | null;
  username: string | null;
  telegram_user_id: string;
}

export interface SplitWithMember extends SessionSplit {
  display_name: string | null;
  first_name: string | null;
  username: string | null;
  telegram_user_id: string;
}
