import { Link, useLocation } from "wouter";
import { useAuth } from "../lib/AuthContext";
import { cn } from "../lib/utils";
import { FolderKanban, Images, Building2, Settings, LogOut, Sparkles, LayoutTemplate, Newspaper } from "lucide-react";

const NAV = [
  { to: "/projects", label: "Projects", icon: FolderKanban },
  { to: "/templates", label: "Templates", icon: LayoutTemplate },
  { to: "/magazines", label: "Magazines", icon: Newspaper },
  { to: "/brands", label: "Brands & Products", icon: Building2 },
  { to: "/image-bank", label: "Image Bank", icon: Images },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { email, logout } = useAuth();
  const [location] = useLocation();
  return (
    <div className="min-h-screen flex bg-background">
      <aside className="w-64 border-r bg-card flex flex-col">
        <div className="px-5 py-5 border-b">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="size-4 text-primary" />
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Acentecom</div>
          </div>
          <div className="font-semibold leading-tight">Advertorials Generator</div>
        </div>
        <nav className="flex-1 py-3 px-2 space-y-1">
          {NAV.map((item) => {
            const active = location === item.to || location.startsWith(item.to + "/");
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                href={item.to}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors",
                  active
                    ? "bg-primary text-primary-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted",
                )}
                data-testid={`nav-${item.label.replace(/\s+/g, "-").toLowerCase()}`}
              >
                <Icon className="size-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t px-5 py-3 text-xs text-muted-foreground">
          <div className="truncate" title={email || ""}>{email}</div>
          <button
            onClick={() => void logout()}
            className="mt-2 inline-flex items-center gap-1 text-muted-foreground hover:text-foreground"
          >
            <LogOut className="size-3" /> Sign out
          </button>
          <div className="mt-3 pt-3 border-t text-[10px] uppercase tracking-wider opacity-60">
            Internal Acentecom tool
          </div>
        </div>
      </aside>
      <main className="flex-1 min-w-0 overflow-auto">{children}</main>
    </div>
  );
}
