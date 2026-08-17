import { useCallback, useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { ContentToolbar } from "@/components/shared/ContentToolbar";
import { DataGrid, type DataGridColumn } from "@/components/shared/DataGrid";
import { DetailPane } from "@/components/shared/DetailPane";
import { StatusBadge } from "@/components/ui/status-badge";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useRepo } from "@/data/repo";
import type { Organization, Organizer } from "@/data/types";

function InviteOrganizer({ organizationId, onClose, onSaved }: { organizationId: string; onClose: () => void; onSaved: () => Promise<void> }) {
  const repo = useRepo(); const [email, setEmail] = useState(""); const [role, setRole] = useState<Organizer["role"]>("admin"); const [busy, setBusy] = useState(false); const [error, setError] = useState<string>();
  const submit = async () => { setBusy(true); setError(undefined); try { await repo.organizers.add({ organizationId, email, role }); await onSaved(); onClose(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not invite team member."); } finally { setBusy(false); } };
  return <DetailPane title="Invite organization member" onClose={onClose}><p className="text-base text-muted-foreground">Organization roles can access every event in this organization. Use an event team for narrower access.</p>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="space-y-2"><Label htmlFor="org-email">Email</Label><Input id="org-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus /></div><div className="space-y-2"><Label>Role</Label><Select value={role} onValueChange={(value) => setRole(value as Organizer["role"])}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="admin">Admin</SelectItem><SelectItem value="owner">Owner</SelectItem></SelectContent></Select></div><div className="flex justify-end gap-2"><Button variant="ghost" onClick={onClose}>Cancel</Button><Button onClick={() => void submit()} disabled={busy || !email.trim()}>{busy ? "Inviting…" : "Invite"}</Button></div></DetailPane>;
}

export default function OrganizationSettings() {
  const repo = useRepo(); const [members, setMembers] = useState<Organizer[]>([]); const [mine, setMine] = useState<Organizer | null>(); const [organization, setOrganization] = useState<Organization | null>(null); const [loading, setLoading] = useState(true); const [error, setError] = useState<string>(); const [inviting, setInviting] = useState(false); const [remove, setRemove] = useState<Organizer>();
  const load = useCallback(async () => { setLoading(true); setError(undefined); try { const org = await repo.organizations.getMine(); setOrganization(org); if (!org) { setMembers([]); setMine(null); return; } const [rows, current] = await Promise.all([repo.organizers.list(org.id), repo.organizers.getMine()]); setMembers(rows); setMine(current); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not load organization settings."); } finally { setLoading(false); } }, [repo]);
  useEffect(() => { void load(); }, [load]); const confirmRemove = async () => { if (!remove) return; try { if (!organization) return; await repo.organizers.remove({ organizationId: organization.id, userId: remove.userId }); setRemove(undefined); await load(); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not remove team member."); } };
  const columns: DataGridColumn<Organizer>[] = [
    { key: "member", header: "Member", kind: "row-header", cell: (member) => <span className="font-medium text-foreground">{member.email}</span> },
    { key: "status", header: "Status", width: "9rem", cell: (member) => { const pending = member.userId.startsWith("pending:"); return <StatusBadge tone={pending ? "warning" : "success"}>{pending ? "Pending invite" : "Active"}</StatusBadge>; } },
    { key: "role", header: "Role", width: "7rem", cell: (member) => <span className="capitalize">{member.role}</span> },
    { key: "actions", header: "Actions", width: "8rem", align: "right", cell: (member) => mine?.role === "owner" && member.id !== mine.id ? <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" aria-label={`Remove ${member.email}`} onClick={() => setRemove(member)}>Remove</Button> : <span className="text-muted-foreground">—</span> },
  ];
  return <AppLayout title={organization ? `${organization.name} settings` : "Organization settings"} detail={inviting && organization ? <InviteOrganizer organizationId={organization.id} onClose={() => setInviting(false)} onSaved={load} /> : undefined}><div className="space-y-5"><ContentToolbar ariaLabel="Organization team controls" search={<h2 className="text-base font-semibold">Team</h2>} primaryAction={mine?.role === "owner" && organization ? <Button onClick={() => setInviting(true)}>Invite</Button> : undefined} />{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<DataGrid rows={members} columns={columns} empty="No organization members yet." loading={loading} skeletonRows={4} rowActivation="none" ariaLabel="Organization team members" minWidth={620} /></div><AlertDialog open={Boolean(remove)} onOpenChange={(open) => { if (!open) setRemove(undefined); }}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Remove organization access?</AlertDialogTitle><AlertDialogDescription>{remove?.email} will lose access to this organization's events unless they also belong to an event team.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel>Cancel</AlertDialogCancel><AlertDialogAction onClick={() => void confirmRemove()}>Remove access</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog></AppLayout>;
}
