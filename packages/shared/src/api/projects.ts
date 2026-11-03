// Owner routes: projects (project.md §8, §6.3).
import { z } from "zod";
import type { Project } from "../models";
import { projectNameSchema } from "./common";

// GET /api/projects
export type ListProjectsResponse = { projects: Project[] };

// POST /api/projects
export const createProjectBody = z.strictObject({
  name: projectNameSchema,
});
export type CreateProjectBody = z.infer<typeof createProjectBody>;
export type CreateProjectResponse = { project: Project };

// PATCH /api/projects/:id (params: idParams). Only the name can change.
export const updateProjectBody = z.strictObject({
  name: projectNameSchema,
});
export type UpdateProjectBody = z.infer<typeof updateProjectBody>;
export type UpdateProjectResponse = { project: Project };

// DELETE /api/projects/:id (params: idParams) → DeletedResponse
