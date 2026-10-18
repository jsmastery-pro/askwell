export const PLANS = ["free", "pro"] as const;
export type Plan = (typeof PLANS)[number];

export type PlanLimits = {
  projects: number;
  messagesPerMonth: number;
  /** Knowledge sources per project: uploaded files and pasted text together. */
  knowledgeSourcesPerProject: number;
  customizeWidget: boolean;
};

// project.md §5. The server reads these; clients never decide what is allowed.
export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    projects: 1,
    messagesPerMonth: 100,
    knowledgeSourcesPerProject: 3,
    customizeWidget: false,
  },
  pro: {
    projects: 5,
    messagesPerMonth: 2000,
    knowledgeSourcesPerProject: 25,
    customizeWidget: true,
  },
};
