import { useState } from "react";
import { Move } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Room } from "@/data/types";
import { eventDateTime, eventDateTimeToEpoch } from "@/lib/event-time";

export function AgendaMoveControl({ id, title, roomId: initialRoom, startTime, rooms, timeZone, onMove }: { id: string; title: string; roomId: string; startTime: number; rooms: Room[]; timeZone: string; onMove: (id: string, roomId: string, startTime: number) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [roomId, setRoomId] = useState(initialRoom);
  const local = eventDateTime(startTime, timeZone);
  const [time, setTime] = useState(local.time);
  const [moving, setMoving] = useState(false);
  const [error, setError] = useState<string>();
  return <Popover open={open} onOpenChange={setOpen}><PopoverTrigger asChild><Button type="button" variant="ghost" size="sm" aria-label={`Move: ${title}, currently scheduled at ${local.time}`}><Move className="mr-1 h-3.5 w-3.5" />Move</Button></PopoverTrigger><PopoverContent align="end" className="space-y-4"><div><p className="font-medium">Move session</p><p className="text-xs text-muted-foreground">Keyboard and touch alternative to dragging.</p></div><div className="space-y-2"><Label>Room</Label><Select value={roomId} onValueChange={setRoomId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{rooms.map((room) => <SelectItem key={room.id} value={room.id}>{room.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor={`move-time-${id}`}>Start time</Label><Input id={`move-time-${id}`} type="time" step={900} value={time} onChange={(event) => setTime(event.target.value)} /></div>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<Button type="button" variant="accent" size="sm" disabled={moving} onClick={async () => { const target = eventDateTimeToEpoch(local.date, time, timeZone); if (target === undefined) return setError(`Choose a valid ${timeZone} time.`); setError(undefined); setMoving(true); try { await onMove(id, roomId, target); setOpen(false); } catch (cause) { setError(cause instanceof Error ? cause.message : "Could not move the session."); } finally { setMoving(false); } }}>{moving ? "Moving…" : "Move session"}</Button></PopoverContent></Popover>;
}
