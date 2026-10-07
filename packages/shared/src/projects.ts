import { z } from "zod";

export const idParamSchema = z.object({ id: z.uuid() });
export type IdParam = z.infer<typeof idParamSchema>;

export const projectSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  publicKey: z.string(),
  messagesUsed: z.number().int(),
  periodStart: z.iso.datetime(),
  createdAt: z.iso.datetime(),
});
export type Project = z.infer<typeof projectSchema>;

const projectName = z.string().trim().min(1).max(60);

// GET /api/projects
export const listProjectsResponseSchema = z.object({ projects: z.array(projectSchema) });
export type ListProjectsResponse = z.infer<typeof listProjectsResponseSchema>;

// POST /api/projects
export const createProjectRequestSchema = z.object({ name: projectName });
export type CreateProjectRequest = z.infer<typeof createProjectRequestSchema>;
export const createProjectResponseSchema = z.object({ project: projectSchema });
export type CreateProjectResponse = z.infer<typeof createProjectResponseSchema>;

// PATCH /api/projects/:id
export const updateProjectRequestSchema = z.object({ name: projectName });
export type UpdateProjectRequest = z.infer<typeof updateProjectRequestSchema>;
export const updateProjectResponseSchema = createProjectResponseSchema;
export type UpdateProjectResponse = CreateProjectResponse;

// Shared by every DELETE route.
export const deleteResponseSchema = z.object({ ok: z.literal(true) });
export type DeleteResponse = z.infer<typeof deleteResponseSchema>;

// DELETE /api/projects/:id
export const deleteProjectResponseSchema = deleteResponseSchema;
export type DeleteProjectResponse = DeleteResponse;
