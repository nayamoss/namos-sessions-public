/** Whether a field can actually be answered by the person filling the form.
 *
 * A choice field draws its options from event configuration (Track from the event's
 * tracks, for example). If the organizer never created any, the field renders as an
 * empty dropdown — and if it is also marked required, the form can never be completed:
 * validation demands an answer the submitter has no way to give. That silently bricks
 * a published CFP, with no signal to the submitter or the organizer.
 *
 * Treating an optionless choice field as "not applicable" is the only behaviour that
 * keeps the form submittable. It deliberately does not weaken validation for fields
 * that DO have options — those stay required as configured.
 */
const choiceTypes = new Set(["dropdown", "multiselect", "select", "radio", "checkbox"]);

export function fieldAnswerable(field: { type: string; options?: string[] }) {
  if (!choiceTypes.has(field.type)) return true;
  return (field.options?.length ?? 0) > 0;
}

/** A field only blocks submission when it is both required and actually answerable. */
export function fieldBlocksSubmission(
  field: { type: string; required: boolean; options?: string[] },
  value: string | undefined,
) {
  if (!field.required || !fieldAnswerable(field)) return false;
  return !value?.trim();
}
