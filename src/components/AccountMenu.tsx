import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { SignOutButton, useUser } from "@clerk/clerk-react";
import { ArrowLeft, ChevronDown, LogOut, Settings2, UserRound, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { isClerkEnabled } from "@/data/backend";
import { ThemeToggleMenuItem } from "@/components/ThemeMenuItems";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useOptionalCurrentEvent } from "@/components/EventContext";
import { useRepo } from "@/data/repo";

/** Groups are separated by whitespace only — never a rule or divider. */
const contentClass = "rounded-lg bg-muted p-1.5 shadow-none";
const itemClass = "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm";
const triggerFocusClass = "outline-none focus-visible:bg-accent/60";

type AccountMenuViewProps = {
  collapsed: boolean;
  context: "admin" | "portal";
  userName: string;
  userInitials: string;
  signOut?: ReactNode;
};

function AdminModeMenuItem({ eventSlug }: { eventSlug?: string }) {
  const repo = useRepo();
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    let active = true;
    void repo.organizers.hasAdminAccess()
      .then((value) => { if (active) setAllowed(value); })
      .catch(() => { if (active) setAllowed(false); });
    return () => { active = false; };
  }, [repo]);
  if (!allowed) return null;
  return (
    <DropdownMenuItem asChild>
      <Link to={eventSlug ? `/events/${eventSlug}/program/forms` : "/events"} className={itemClass}>
        <ArrowLeft className="h-4 w-4 shrink-0" />
        Back to admin mode
      </Link>
    </DropdownMenuItem>
  );
}

function MenuLinks({ context, eventSlug }: { context: "admin" | "portal"; eventSlug?: string }) {
  if (context === "portal") {
    return (
      <>
        <DropdownMenuItem asChild>
          <Link to="/portal/profile" className={itemClass}>
            <UserRound className="h-4 w-4 shrink-0" />
            Speaker profile
          </Link>
        </DropdownMenuItem>
        <AdminModeMenuItem eventSlug={eventSlug} />
      </>
    );
  }

  return (
    <>
      <DropdownMenuItem asChild>
        <Link to={eventSlug ? `/events/${eventSlug}/settings/event` : "/events"} className={itemClass}>
          <Settings2 className="h-4 w-4 shrink-0" />
          Event settings
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <Link to="/portal" className={itemClass}>
          <Users className="h-4 w-4 shrink-0" />
          Speaker portal
        </Link>
      </DropdownMenuItem>
    </>
  );
}

function AccountMenuView({ collapsed, context, userName, userInitials, signOut }: AccountMenuViewProps) {
  const [accountOpen, setAccountOpen] = useState(false);
  const eventSlug = useOptionalCurrentEvent()?.event.slug;

  if (collapsed) {
    return (
      <div className="pb-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn(
                "mx-auto flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-[13px] font-medium text-muted-foreground transition-colors hover:bg-accent",
                triggerFocusClass
              )}
              title={userName}
              aria-label="Account menu"
            >
              {userInitials}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="right" sideOffset={8} className={cn("w-52", contentClass)}>
            <div className="flex items-center gap-2.5 px-2.5 pb-2 pt-1.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-[13px] font-medium text-muted-foreground">
                {userInitials}
              </div>
              <p className="min-w-0 flex-1 truncate text-sm font-medium">{userName}</p>
            </div>
            <MenuLinks context={context} eventSlug={eventSlug} />
            <div className="pt-1.5">
              <ThemeToggleMenuItem />
              {signOut}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  }

  return (
    <div className="px-2 pb-2">
      <DropdownMenu open={accountOpen} onOpenChange={setAccountOpen}>
        <DropdownMenuTrigger asChild>
          <button
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left transition-colors hover:bg-accent/50",
              triggerFocusClass
            )}
            aria-label="Account menu"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-[13px] font-medium text-muted-foreground">
              {userInitials}
            </div>
            <p className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">{userName}</p>
            <ChevronDown className={cn("h-4 w-4 shrink-0 text-muted-foreground transition-transform", accountOpen && "rotate-180")} />
          </button>
        </DropdownMenuTrigger>
        {/* Match the trigger's width so the menu never spills outside the sidebar card. */}
        <DropdownMenuContent
          align="start"
          side="top"
          sideOffset={8}
          className={cn("w-[var(--radix-dropdown-menu-trigger-width)]", contentClass)}
        >
          <MenuLinks context={context} eventSlug={eventSlug} />
          <div className="pt-1.5">
            <ThemeToggleMenuItem />
            {signOut}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

function ClerkAccountMenu({ collapsed, context }: { collapsed: boolean; context: "admin" | "portal" }) {
  const { user } = useUser();
  // SECURITY: never render the email address itself, only its first letter as a fallback initial.
  const userInitials = user?.firstName?.[0]?.toUpperCase() || user?.emailAddresses?.[0]?.emailAddress?.[0]?.toUpperCase() || "U";
  const userName = user?.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : "User";

  return (
    <AccountMenuView
      collapsed={collapsed}
      context={context}
      userName={userName}
      userInitials={userInitials}
      signOut={
        <SignOutButton>
          <DropdownMenuItem className={cn(itemClass, "text-destructive focus:text-destructive")}>
            <LogOut className="h-4 w-4 shrink-0" />
            Sign out
          </DropdownMenuItem>
        </SignOutButton>
      }
    />
  );
}

export function AccountMenu({ collapsed, context = "admin" }: { collapsed: boolean; context?: "admin" | "portal" }) {
  // Clerk hooks throw outside <ClerkProvider>, which is only mounted for the Airtable backend.
  if (isClerkEnabled()) return <ClerkAccountMenu collapsed={collapsed} context={context} />;
  return <AccountMenuView collapsed={collapsed} context={context} userName="Demo user" userInitials="D" />;
}
