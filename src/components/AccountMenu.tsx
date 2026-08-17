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
import { useRepo, useOptionalRepo } from "@/data/repo";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ProfileSettingsDialog } from "@/components/ProfileSettingsDialog";
import { resetAnalytics, setAnalyticsIdentity, track } from "@/lib/analytics";

/** Groups are separated by whitespace only — never a rule or divider. */
const contentClass = cardSurfaceClasses("default", "bg-muted p-1.5 shadow-none");
const itemClass = "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm";
const triggerFocusClass = "outline-none focus-visible:bg-accent/60";

type AccountMenuViewProps = {
  collapsed: boolean;
  context: "admin" | "portal";
  userName: string;
  userInitials: string;
  avatarUrl?: string;
  signOut?: ReactNode;
  onOpenProfileSettings?: () => void;
  profileSettings?: ReactNode;
};

function UserAvatar({ avatarUrl, userInitials, className }: { avatarUrl?: string; userInitials: string; className: string }) {
  if (!avatarUrl) {
    return (
      <div className={cardSurfaceClasses("default", `${className} flex items-center justify-center bg-muted text-[13px] font-medium text-muted-foreground`)}>
        {userInitials}
      </div>
    );
  }
  return (
    <Avatar className={className}>
      <AvatarImage src={avatarUrl} alt="" />
      <AvatarFallback className="text-[13px] font-medium">{userInitials}</AvatarFallback>
    </Avatar>
  );
}

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

function MenuLinks({ context, eventSlug, onOpenProfileSettings }: { context: "admin" | "portal"; eventSlug?: string; onOpenProfileSettings?: () => void }) {
  const profileSettings = onOpenProfileSettings ? (
    <DropdownMenuItem onSelect={onOpenProfileSettings} className={itemClass}>
      <UserRound className="h-4 w-4 shrink-0" />
      Profile settings
    </DropdownMenuItem>
  ) : null;

  if (context === "portal") {
    return (
      <>
        {profileSettings}
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
      {profileSettings}
      <DropdownMenuItem asChild>
        <Link to={eventSlug ? `/events/${eventSlug}/settings/event` : "/events"} className={itemClass}>
          <Settings2 className="h-4 w-4 shrink-0" />
          Event settings
        </Link>
      </DropdownMenuItem>
      <DropdownMenuItem asChild>
        <Link to="/portal" className={itemClass} onClick={() => track("cta_converted", { destination: "portal" })}>
          <Users className="h-4 w-4 shrink-0" />
          Speaker portal
        </Link>
      </DropdownMenuItem>
    </>
  );
}

function AccountMenuView({ collapsed, context, userName, userInitials, avatarUrl, signOut, onOpenProfileSettings, profileSettings }: AccountMenuViewProps) {
  const [accountOpen, setAccountOpen] = useState(false);
  const eventSlug = useOptionalCurrentEvent()?.event.slug;

  if (collapsed) {
    return (
      <div className="pb-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className={cn("mx-auto block h-8 w-8 rounded-full transition-opacity hover:opacity-80", triggerFocusClass)}
              title={userName}
              aria-label="Account menu"
            >
              <UserAvatar avatarUrl={avatarUrl} userInitials={userInitials} className="h-8 w-8" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" side="right" sideOffset={8} className={cn("w-52", contentClass)}>
            <div className="flex items-center gap-2.5 px-2.5 pb-2 pt-1.5">
              <UserAvatar avatarUrl={avatarUrl} userInitials={userInitials} className="h-8 w-8 shrink-0" />
              <p className="min-w-0 flex-1 truncate text-sm font-medium">{userName}</p>
            </div>
            <MenuLinks context={context} eventSlug={eventSlug} onOpenProfileSettings={onOpenProfileSettings} />
            <div className="pt-1.5">
              <ThemeToggleMenuItem />
              {signOut}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
        {profileSettings}
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
            <UserAvatar avatarUrl={avatarUrl} userInitials={userInitials} className="h-8 w-8 shrink-0" />
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
          <MenuLinks context={context} eventSlug={eventSlug} onOpenProfileSettings={onOpenProfileSettings} />
          <div className="pt-1.5">
            <ThemeToggleMenuItem />
            {signOut}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
      {profileSettings}
    </div>
  );
}

function ClerkAccountMenu({ collapsed, context }: { collapsed: boolean; context: "admin" | "portal" }) {
  const { user } = useUser();
  // Optional: some pages/tests render chrome without a RepoProvider — degrade to Clerk's
  // firstName instead of throwing.
  const repo = useOptionalRepo();
  // The name set in onboarding lives on the userProfiles row, not Clerk's user record — this
  // Clerk instance has first/last name collection disabled, so `user.firstName` is never
  // populated by our own onboarding flow (only by an OAuth provider, if used).
  const [profileDisplayName, setProfileDisplayName] = useState<string>();
  const [signupRole, setSignupRole] = useState<"solo" | "team">();
  const [profileSettingsOpen, setProfileSettingsOpen] = useState(false);
  useEffect(() => {
    if (!repo) return;
    let active = true;
    // Optional chain, not just a try/catch around the call: some test fixtures provide a
    // partial mock Repository without a `profiles` key at all.
    void repo.profiles?.getMine()
      .then((profile) => { if (active) { setProfileDisplayName(profile?.displayName); setSignupRole(profile?.signupRole); } })
      .catch(() => { if (active) { setProfileDisplayName(undefined); setSignupRole(undefined); } });
    return () => { active = false; };
  }, [repo]);

  // Only pair Clerk's lastName with Clerk's own firstName — profileDisplayName is a free-text
  // field from onboarding's "Your name" input, nothing stops someone typing a full name into
  // it, and appending Clerk's lastName on top of that would duplicate/garble the name.
  const userName = profileDisplayName || (user?.firstName ? `${user.firstName} ${user.lastName || ""}`.trim() : "User");
  // SECURITY: never render the email address itself, only its first letter as a fallback initial.
  const userInitials = userName !== "User" ? userName[0]?.toUpperCase() : (user?.emailAddresses?.[0]?.emailAddress?.[0]?.toUpperCase() || "U");
  // Clerk always returns an imageUrl — a generated placeholder when no photo was ever set.
  // `hasImage` is the actual signal for whether the user chose one.
  const avatarUrl = user?.hasImage ? user.imageUrl : undefined;

  useEffect(() => {
    if (user?.id) setAnalyticsIdentity(user.id, { role: context === "portal" ? "speaker" : "organizer", ...(signupRole ? { signupRole } : {}) });
  }, [context, signupRole, user?.id]);

  async function saveProfileName(displayName: string) {
    if (!repo?.profiles) throw new Error("Profile settings are unavailable right now.");
    await repo.profiles.save({ displayName });
    setProfileDisplayName(displayName);
  }

  async function uploadProfilePhoto(file: File) {
    if (!user) throw new Error("You need to be signed in to update your photo.");
    await user.setProfileImage({ file });
  }

  return (
    <AccountMenuView
      collapsed={collapsed}
      context={context}
      userName={userName}
      userInitials={userInitials}
      avatarUrl={avatarUrl}
      onOpenProfileSettings={() => setProfileSettingsOpen(true)}
      profileSettings={
        <ProfileSettingsDialog
          open={profileSettingsOpen}
          onOpenChange={setProfileSettingsOpen}
          displayName={userName}
          avatarUrl={avatarUrl}
          onSaveName={saveProfileName}
          onUploadPhoto={uploadProfilePhoto}
        />
      }
      signOut={
        <SignOutButton>
          <DropdownMenuItem onSelect={resetAnalytics} className={cn(itemClass, "text-destructive focus:text-destructive")}>
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
import { cardSurfaceClasses } from "@/components/ui/card";
