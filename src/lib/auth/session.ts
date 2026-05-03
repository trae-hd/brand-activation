import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/options";
import type { Session } from "next-auth";

export async function getSession(): Promise<Session | null> {
  return getServerSession(authOptions);
}
