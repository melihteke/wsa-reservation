/** Base path the site is served from: "" on sail.mteke.com, "/sail" on melihteke.github.io/sail. */
export const BASE = import.meta.env.BASE_URL.replace(/\/+$/, "");

/** Prefix a root-relative path ("/logbook") with the deployment base path. */
export function url(path: string) {
  return `${BASE}${path.startsWith("/") ? path : `/${path}`}`;
}

/** Inverse of url(): strip the base from a pathname for route matching. */
export function stripBase(pathname: string) {
  return (BASE && pathname.startsWith(BASE) ? pathname.slice(BASE.length) : pathname) || "/";
}
