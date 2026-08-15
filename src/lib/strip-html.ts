/**
 * Strips HTML tags to plain text.
 *
 * A single `replace(/<[^>]*>/g, "")` pass is not enough: it is incomplete
 * multi-character sanitization (CodeQL js/incomplete-multi-character-sanitization).
 * Removing the inner tag from `<scr<script>ipt>` re-forms `<script` in the
 * output, so one pass can *create* the very markup it is meant to remove.
 * Repeat until the string stops changing.
 *
 * This is for producing readable plain text, not for sanitizing HTML that will
 * be injected as markup — render the result as a text node.
 */
export function stripHtmlTags(input: string): string {
  let output = input;
  let previous: string;
  do {
    previous = output;
    output = output.replace(/<[^>]*>/g, "");
  } while (output !== previous);
  return output;
}
