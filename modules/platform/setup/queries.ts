/** D1-backed academy identity for existing original source print form.
 * Source's full setup-status command/RPC still needs migration. This
 * print-only read intentionally does not assert setup completion.
 */
import { cache } from "react";
export const getAcademySetup = cache(async () => ({
  academyName: "Sohoj Academy",
  completed: false,
  ready: false,
  steps: [] as {id:string;title:string;href:string;done:boolean}[],
}));
