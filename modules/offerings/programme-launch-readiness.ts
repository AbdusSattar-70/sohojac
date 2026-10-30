import type { OfferingOverview } from "./queries";
import type { AdmissionWorkspace } from "@/modules/admissions/schema";

type Offering = OfferingOverview["offerings"][number];
type Batch = AdmissionWorkspace["batches"][number];

/**
 * Read-only launch readiness. Price readiness comes from the canonical
 * batchOfferingReadySql query, never a client-side guess from stale fee rows.
 * No permissions, mutations, amounts or student identities are handled here.
 */
export type LaunchStage = "PROGRAMME" | "FEES" | "BATCHES" | "WEBSITE" | "REVIEW";

export type ProgrammeLaunchReadiness = {
  stage: LaunchStage;
  feeReady: boolean;
  activeBatchCount: number;
  openSeats: number;
  websiteVisible: boolean;
  applicationsOpen: boolean;
  publishReady: boolean;
  blockers: string[];
  completed: readonly [boolean, boolean, boolean, boolean];
};

export function getProgrammeLaunchReadiness(
  offering: Offering,
  batches: readonly Batch[],
  feeReady: boolean,
  businessDate: string,
): ProgrammeLaunchReadiness {
  const activeBatches = batches.filter(
    (batch) => batch.offeringId === offering.id && batch.isActive,
  );
  const openSeats = activeBatches.reduce(
    (total, batch) => total + Math.max(0, batch.capacity - batch.occupied),
    0,
  );
  const active = offering.status === "ACTIVE";
  const websiteVisible = active && offering.is_website_visible;
  const withinWindow =
    (!offering.applications_open_on || offering.applications_open_on.slice(0, 10) <= businessDate) &&
    (!offering.applications_close_on || offering.applications_close_on.slice(0, 10) >= businessDate);
  const applicationsOpen =
    websiteVisible && offering.is_accepting_applications && withinWindow;
  const blockers: string[] = [];
  if (offering.status === "RETIRED") {
    blockers.push("This programme is retired. Reactivate it in the advanced register before continuing.");
  }
  if (!feeReady) blockers.push("Publish an effective standard Fee Plan.");
  if (activeBatches.length === 0) blockers.push("Create and activate a teaching batch.");
  else if (openSeats === 0) blockers.push("There are no available seats. Add a batch or increase capacity within the 12-seat policy.");
  if (!websiteVisible) blockers.push("Publish the programme's website card.");
  if (!applicationsOpen) {
    blockers.push(offering.is_accepting_applications && !withinWindow
      ? "Applications are outside the configured intake dates."
      : "Open applications when the programme is ready to accept students.");
  }
  const publishReady =
    active && feeReady && openSeats > 0 && websiteVisible && applicationsOpen;
  const stage: LaunchStage = offering.status === "RETIRED"
    ? "PROGRAMME"
    : !feeReady
      ? "FEES"
      : openSeats === 0
        ? "BATCHES"
        : !applicationsOpen
          ? "WEBSITE"
          : "REVIEW";
  return {
    stage, feeReady, activeBatchCount: activeBatches.length, openSeats,
    websiteVisible, applicationsOpen, publishReady, blockers,
    completed: [true, feeReady, openSeats > 0, websiteVisible && applicationsOpen],
  };
}
