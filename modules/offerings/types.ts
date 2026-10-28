export type PublicOfferingCard = {
  id: string; code: string; name: string; academic_year_name: string;
  branch_name: string; class_name: string; group_name: string | null;
  showcase_eyebrow: string | null; showcase_eyebrow_bn: string | null;
  showcase_title: string | null; showcase_title_bn: string | null;
  showcase_description: string | null; showcase_description_bn: string | null;
  showcase_icon: string | null;
  is_accepting_applications: boolean;
  application_state: "OPEN" | "UPCOMING" | "CLOSED";
  applications_open_on: string | null; applications_close_on: string | null;
  fee_plan: { billing_cycle: string; currency_code: string;
    components: { name: string; amount: number; charge_type: string; recurrence: string }[] } | null;
  public_schedule: string | null; public_schedule_bn: string | null;
  public_requirements: string | null; public_requirements_bn: string | null;
  admission_policy: string | null; admission_policy_bn: string | null;
  subjects: { name: string }[];
  active_batch_count: number; current_open_seats: number; current_total_seats: number;
};
