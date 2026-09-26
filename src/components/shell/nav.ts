import { BarChart3, FileText, ImagePlus, LayoutDashboard, MessageSquare, Package, Receipt, Settings, Shirt, Trophy, Type, User, Zap, type LucideIcon } from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; badge?: "New" | "Pro" };
export type NavGroup = { label?: string; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    items: [
      { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
      { href: "/ventes", label: "Ventes", icon: Receipt, badge: "New" },
      { href: "/analytics", label: "Analytics", icon: BarChart3 },
      { href: "/classements", label: "Classements", icon: Trophy, badge: "New" },
    ],
  },
  {
    label: "Outils",
    items: [
      { href: "/sniper", label: "Product Sniper", icon: Zap, badge: "Pro" },
      { href: "/printful", label: "Printful", icon: ImagePlus, badge: "New" },
      { href: "/vinted", label: "Vinted", icon: Shirt, badge: "New" },
      { href: "/listings", label: "Mes Listings", icon: Package },
      { href: "/messages", label: "Messages", icon: MessageSquare, badge: "New" },
      { href: "/title-builder", label: "Title Builder", icon: Type },
      { href: "/description-builder", label: "Description Builder", icon: FileText },
    ],
  },
  {
    label: "Compte",
    items: [
      { href: "/profil", label: "Mon Profil", icon: User },
      { href: "/parametres", label: "Paramètres", icon: Settings },
    ],
  },
];
