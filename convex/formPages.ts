/** Compatibility helpers for the additive form-pages migration. */
export type LegacySection = {
  id: string;
  key: "abstract" | "participant" | "portal";
  title: string;
  pageHeading: string;
  description?: string;
  fieldIds: string[];
};

export type FormPage = {
  id: string;
  kind: "system" | "custom";
  systemRole?: "account" | "participant" | "review";
  label: string;
  pageHeading: string;
  description?: string;
  fieldIds: string[];
};

type FormLike = { _id?: string; kind?: string; collectParticipants?: boolean; sections?: LegacySection[]; pages?: FormPage[] };

export function derivePages(form: FormLike): FormPage[] {
  if (form.pages?.length) return form.pages;
  const sections = form.sections ?? [];
  const id = form._id ? String(form._id) : "form";
  const portal = sections.find((section) => section.key === "portal");
  if (portal) return [{
    id: portal.id,
    kind: "custom",
    label: portal.title,
    pageHeading: portal.pageHeading,
    ...(portal.description ? { description: portal.description } : {}),
    fieldIds: portal.fieldIds,
  }];
  const abstract = sections.find((section) => section.key === "abstract");
  const participant = sections.find((section) => section.key === "participant");
  const customPage: FormPage = abstract
    ? { id: abstract.id, kind: "custom", label: abstract.title, pageHeading: abstract.pageHeading, ...(abstract.description ? { description: abstract.description } : {}), fieldIds: abstract.fieldIds }
    : { id: `${id}-proposal`, kind: "custom", label: "Proposal details", pageHeading: "Your proposal", fieldIds: [] };
  return [
    { id: `${id}-account`, kind: "system", systemRole: "account", label: "Account", pageHeading: "Your details", fieldIds: [] },
    customPage,
    ...(form.collectParticipants ? [{
      id: `${id}-participant`,
      kind: "system" as const,
      systemRole: "participant" as const,
      label: participant?.title ?? "Participant information",
      pageHeading: participant?.pageHeading ?? "Participant information",
      ...(participant?.description ? { description: participant.description } : {}),
      fieldIds: participant?.fieldIds ?? [],
    }] : []),
    { id: `${id}-review`, kind: "system", systemRole: "review", label: "Review", pageHeading: "Review", fieldIds: [] },
  ];
}

/** Old read paths only understand abstract/participant/portal sections. */
export function deriveSections(pages: FormPage[], formKind?: string): LegacySection[] {
  const custom = pages.filter((page) => page.kind === "custom");
  if (formKind === "contact" || formKind === "group" || formKind === "submission_task") {
    return custom.map((page) => ({ id: page.id, key: "portal", title: page.label, pageHeading: page.pageHeading, ...(page.description ? { description: page.description } : {}), fieldIds: page.fieldIds }));
  }
  const participant = pages.find((page) => page.systemRole === "participant");
  return [
    ...custom.map((page, index) => ({ id: page.id, key: "abstract" as const, title: page.label, pageHeading: page.pageHeading, ...(page.description ? { description: page.description } : {}), fieldIds: page.fieldIds })),
    ...(participant ? [{ id: participant.id, key: "participant" as const, title: participant.label, pageHeading: participant.pageHeading, ...(participant.description ? { description: participant.description } : {}), fieldIds: participant.fieldIds }] : []),
  ];
}

export function assertValidPages(pages: FormPage[], formKind: string, collectParticipants: boolean) {
  if (!pages.length) throw new Error("A form needs at least one page.");
  if (new Set(pages.map((page) => page.label.trim().toLowerCase())).size !== pages.length) throw new Error("Page labels must be unique.");
  const portal = formKind === "contact" || formKind === "group" || formKind === "submission_task";
  if (portal) {
    if (pages.some((page) => page.kind !== "custom")) throw new Error("Portal forms can only contain custom pages.");
    return;
  }
  const account = pages[0];
  const review = pages.at(-1);
  if (account?.kind !== "system" || account.systemRole !== "account") throw new Error("The Account page must remain first.");
  if (review?.kind !== "system" || review.systemRole !== "review") throw new Error("The Review page must remain last.");
  if (!pages.some((page) => page.kind === "custom")) throw new Error("A CFP needs at least one custom page.");
  const participant = pages.find((page) => page.systemRole === "participant");
  if (Boolean(collectParticipants) !== Boolean(participant)) throw new Error("The participant page must match participant collection.");
  if (participant && pages.indexOf(participant) !== pages.length - 2) throw new Error("The participant page must remain before Review.");
  if (pages.filter((page) => page.systemRole === "account").length !== 1 || pages.filter((page) => page.systemRole === "review").length !== 1 || pages.filter((page) => page.systemRole === "participant").length > 1) throw new Error("System pages cannot be duplicated.");
}
