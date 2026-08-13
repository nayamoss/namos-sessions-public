type CrossFieldLimit = {
  label: string;
  fieldIds: string[];
  maxCombinedChars: number;
};

type ParticipantRole = { role: string; min?: number; max?: number };
type Participant = { role: string; answers: Record<string, string> };

// Public submissions use opaque browser keys while forms retain storage IDs. Resolve the
// configured IDs on the server so a client cannot bypass the live character counter.
export function assertCrossFieldLimits(
  limits: CrossFieldLimit[],
  fieldKeyById: Map<string, string>,
  answers: Record<string, string>,
) {
  for (const limit of limits) {
    const count = limit.fieldIds.reduce((total, fieldId) => {
      const key = fieldKeyById.get(fieldId);
      return total + (key ? answers[key]?.length ?? 0 : 0);
    }, 0);
    if (count > limit.maxCombinedChars) {
      throw new Error(`${limit.label} must be ${limit.maxCombinedChars.toLocaleString()} characters or fewer.`);
    }
  }
}

export function assertParticipantRoleBounds(roles: ParticipantRole[], participants: Participant[]) {
  const configuredRoles = new Map(roles.map((role) => [role.role, role]));
  for (const participant of participants) {
    if (!configuredRoles.has(participant.role)) throw new Error("The submission contains an unknown participant role.");
  }
  for (const role of roles) {
    const count = participants.filter((participant) => participant.role === role.role).length;
    if (role.min !== undefined && count < role.min) throw new Error(`Add at least ${role.min} ${role.role} participant${role.min === 1 ? "" : "s"}.`);
    if (role.max !== undefined && count > role.max) throw new Error(`Add no more than ${role.max} ${role.role} participant${role.max === 1 ? "" : "s"}.`);
  }
}
