export const PLANS = ["free", "pro"] as const;
export type Plan = (typeof PLANS)[number];

export type PlanLimits = {
  projects: number;
  messagesPerMonth: number;
  knowledgeFilesPerProject: number;
  customizeWidget: boolean;
};

// project.md §5. The server reads these; clients never decide what is allowed.
export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    projects: 1,
    messagesPerMonth: 100,
    knowledgeFilesPerProject: 3,
    customizeWidget: false,
  },
  pro: {
    projects: 5,
    messagesPerMonth: 2000,
    knowledgeFilesPerProject: 25,
    customizeWidget: true,
  },
};
