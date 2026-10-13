"use client";

import type { User } from "@supabase/supabase-js";
import { getSupabaseClient } from "./supabaseClient";

export interface StoredRoomPlan {
  [key: string]: unknown;
  id: string;
  room: { name: string; type: string; length: string; width: string };
  existing: Array<{ [key: string]: unknown; id: string; name: string; category: string; length: string; width: string; status: "existing" | "planned" }>;
  planned: Array<{ [key: string]: unknown; id: string; name: string; category: string; length: string; width: string; status: "existing" | "planned" }>;
  door: { enabled: boolean; wall: string; distance: string; width?: number; swingDirection?: "inward"; hinge?: "start"; autoPlaced?: boolean; warning?: string };
  window: { enabled: boolean; wall: string; distance: string };
  createdAt?: string;
  updatedAt?: string;
}

export interface RoomPlanRow {
  id: string;
  owner_id: string;
  room_name: string;
  room_type: string;
  room_length: number;
  room_width: number;
  room_features: Record<string, unknown>;
  existing_furniture: StoredRoomPlan["existing"];
  planned_furniture: StoredRoomPlan["planned"];
  door_details: StoredRoomPlan["door"];
  window_details: StoredRoomPlan["window"];
  generated_layout: Record<string, unknown>;
  plan_data: StoredRoomPlan;
  created_at: string;
  updated_at: string;
}

export function planFromRow(row: RoomPlanRow): StoredRoomPlan {
  return {
    ...row.plan_data,
    ...(Object.keys(row.room_features ?? {}).length ? { roomFeatures: row.room_features } : {}),
    id: row.id,
    room: {
      ...row.plan_data?.room,
      name: row.room_name,
      type: row.room_type,
      length: String(row.room_length),
      width: String(row.room_width),
    },
    existing: row.existing_furniture ?? row.plan_data?.existing ?? [],
    planned: row.planned_furniture ?? row.plan_data?.planned ?? [],
    door: row.door_details ?? row.plan_data?.door ?? { enabled: false, wall: "", distance: "" },
    window: row.window_details ?? row.plan_data?.window,
    generatedLayout: row.generated_layout ?? row.plan_data?.generatedLayout,
    createdAt: row.plan_data?.createdAt ?? row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowFromPlan(plan: StoredRoomPlan, user: User): Omit<RoomPlanRow, "created_at" | "updated_at"> {
  const otherRoomFields = { ...plan.room };
  delete (otherRoomFields as Partial<StoredRoomPlan["room"]>).name;
  delete (otherRoomFields as Partial<StoredRoomPlan["room"]>).type;
  delete (otherRoomFields as Partial<StoredRoomPlan["room"]>).length;
  delete (otherRoomFields as Partial<StoredRoomPlan["room"]>).width;
  const storedFeatures = plan.roomFeatures ?? plan.features ?? otherRoomFields;
  const roomFeatures = storedFeatures && typeof storedFeatures === "object" && !Array.isArray(storedFeatures)
    ? storedFeatures as Record<string, unknown>
    : {};
  return {
    id: plan.id,
    owner_id: user.id,
    room_name: plan.room.name,
    room_type: plan.room.type,
    room_length: Number.parseFloat(plan.room.length),
    room_width: Number.parseFloat(plan.room.width),
    room_features: roomFeatures,
    existing_furniture: plan.existing ?? [],
    planned_furniture: plan.planned ?? [],
    door_details: plan.door,
    window_details: plan.window,
    generated_layout: (plan.generatedLayout as Record<string, unknown>) ?? {},
    plan_data: plan,
  };
}

async function requireUser() {
  const client = getSupabaseClient();
  const { data, error } = await client.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("Sign in to access your saved room plans.");
  return { client, user: data.user };
}

export async function loadRoomPlans(): Promise<StoredRoomPlan[]> {
  const { client, user } = await requireUser();
  const { data, error } = await client.from("room_plans").select("*").eq("owner_id", user.id).order("updated_at", { ascending: false });
  if (error) throw error;
  return (data as RoomPlanRow[]).map(planFromRow);
}

export async function loadRoomPlan(id: string): Promise<StoredRoomPlan | null> {
  const { client, user } = await requireUser();
  const { data, error } = await client.from("room_plans").select("*").eq("owner_id", user.id).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? planFromRow(data as RoomPlanRow) : null;
}

export async function saveRoomPlan(plan: StoredRoomPlan): Promise<StoredRoomPlan> {
  const { client, user } = await requireUser();
  const record = rowFromPlan(plan, user);
  const { data, error } = await client.from("room_plans").upsert(record, { onConflict: "id" }).select("*").single();
  if (error) throw error;
  return planFromRow(data as RoomPlanRow);
}

export async function deleteRoomPlan(id: string): Promise<void> {
  const { client, user } = await requireUser();
  const { error } = await client.from("room_plans").delete().eq("owner_id", user.id).eq("id", id);
  if (error) throw error;
}

export async function importLocalRoomPlans(plans: StoredRoomPlan[]) {
  const { client, user } = await requireUser();
  const { data: current, error: readError } = await client.from("room_plans").select("id").eq("owner_id", user.id);
  if (readError) throw readError;
  const currentIds = new Set((current ?? []).map(row => row.id as string));
  const seenIds = new Set<string>();
  const candidates = plans.filter(plan => {
    if (!plan?.id || !plan.room) return false;
    const importId = `local-${user.id}-${plan.id}`;
    if (currentIds.has(importId) || seenIds.has(importId)) return false;
    seenIds.add(importId);
    return true;
  });
  let imported = 0;
  for (let offset = 0; offset < candidates.length; offset += 50) {
    const batch = candidates.slice(offset, offset + 50).map(plan => rowFromPlan({ ...plan, id: `local-${user.id}-${plan.id}`, sourceLocalId: plan.id }, user));
    const { data, error } = await client.from("room_plans").insert(batch).select("id");
    if (error) throw error;
    imported += data?.length ?? 0;
  }
  return { imported, alreadyPresent: plans.length - candidates.length };
}
