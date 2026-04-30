export const DEFAULT_WORKSPACE_ID = "default-workspace";

export function getWorkspaceId(req) {
  return req?.workspaceId || req?.user?.workspaceId || DEFAULT_WORKSPACE_ID;
}

export function workspaceFilter(req, extra = {}) {
  return {
    ...extra,
    workspaceId: getWorkspaceId(req)
  };
}

export function workspaceUpdate(req, update = {}) {
  return {
    ...update,
    workspaceId: getWorkspaceId(req)
  };
}
