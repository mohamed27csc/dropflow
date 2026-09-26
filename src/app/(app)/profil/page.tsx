import type { Metadata } from "next";
import { ProfileView } from "./profile-view";

export const metadata: Metadata = { title: "Mon Profil" };

export default function Page() {
  return <ProfileView />;
}
