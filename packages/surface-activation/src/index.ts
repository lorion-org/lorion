// Surface activation: a framework-free, file-layout convention for deciding which
// module (and which exported symbol) provides a given "surface" of a capability,
// and the import specifier to reach it. Pure — no filesystem, no framework. The
// same seam is shared by build-time hosts (which code-generate static imports) and
// runtime hosts (which dynamically import), so the addressing rule lives in exactly
// one place.

export interface SurfaceActivation {
  exportSubpath: string;
  exportName: string;
}

export interface SurfaceConvention {
  // True when the capability provides this surface (a file-layout marker).
  marker: (directory: string) => boolean;
  // Derives the exported symbol name from the capability id.
  exportName: (id: string) => string;
  // The package export subpath the symbol is imported from (for example `./web`).
  exportSubpath: string;
}

export type ActivationResolver = (
  surface: string,
  capability: { directory: string; id: string },
) => SurfaceActivation | undefined;

// Builds an activation resolver from per-surface conventions. A host declares how a
// surface is detected (marker) and named (exportName); the descriptor carries no
// surface config.
export function conventionActivation(
  surfaces: Record<string, SurfaceConvention>,
): ActivationResolver {
  return (surface, capability) => {
    const convention = surfaces[surface];
    if (!convention || !convention.marker(capability.directory)) return undefined;
    return {
      exportSubpath: convention.exportSubpath,
      exportName: convention.exportName(capability.id),
    };
  };
}

export interface FileSurfaceConventionOptions {
  // Relative marker files; the surface exists when the capability ships any of them
  // (for example `['src/web.ts']`, or several accepted layouts). An empty list means
  // the surface never activates — pass at least one marker.
  files: readonly string[];
  // Export subpath the symbol is imported from (for example `./web`).
  exportSubpath: string;
  // Suffix appended to the camelCased id to form the export name
  // (`'WebPlugin'` turns `auth-oidc` into `authOidcWebPlugin`). Defaults to `''`.
  exportSuffix?: string;
  // Existence check for a marker path, injected by the host. Kept out of this module
  // so the package stays I/O-free — a Node host passes `existsSync`.
  exists: (path: string) => boolean;
  // Joins a capability directory with a relative marker file. Defaults to a POSIX
  // join (`${directory}/${file}`), which Node's fs accepts on every platform; pass
  // `node:path`'s `join` for native separators.
  join?: (directory: string, file: string) => string;
}

// Converts a kebab-case id to a camelCase identifier fragment (`auth-oidc` ->
// `authOidc`). The shared naming rule so every host derives export names the same
// way. Hyphen runs are collapsed and the following character is uppercased
// (letters and digits alike), and leading/trailing hyphens are dropped, so
// non-strict ids (`auth-2fa`, `foo--bar`, `foo-`) still yield a valid identifier
// fragment. An id that starts with a digit cannot be a valid identifier on its own —
// constrain ids at the descriptor level if that matters.
function camelCaseId(id: string): string {
  return id
    .replace(/^-+|-+$/g, '')
    .replace(/-+([a-z0-9])/gi, (_match, char: string) => char.toUpperCase());
}

// A ready-made `SurfaceConvention` for the common file-layout case: the surface is
// present when one of `files` exists, and its export is `camelCase(id) + exportSuffix`
// from `exportSubpath`. Hand the result to `conventionActivation`. This is the whole
// marker/naming boilerplate a host would otherwise repeat per surface; the raw
// `SurfaceConvention` object stays available for anything this preset does not cover.
export function fileSurfaceConvention(options: FileSurfaceConventionOptions): SurfaceConvention {
  const { files, exportSubpath, exportSuffix = '', exists } = options;
  const join = options.join ?? ((directory, file) => `${directory}/${file}`);
  return {
    marker: (directory) => files.some((file) => exists(join(directory, file))),
    exportName: (id) => `${camelCaseId(id)}${exportSuffix}`,
    exportSubpath,
  };
}

// The import specifier for a capability's surface module: the package name joined
// with the export subpath, with a leading `.` dropped (`./web` becomes `/web`). One
// rule, shared by every host style.
export function capabilitySpecifier(packageName: string, exportSubpath: string): string {
  return `${packageName}${exportSubpath.replace(/^\./, '')}`;
}

// The minimal capability shape surface addressing needs: an id, its on-disk
// directory, and the package name the specifier is built from.
export interface SurfaceCapability {
  id: string;
  directory: string;
  packageName: string;
}

export interface CapabilitySurfaceModule<T extends SurfaceCapability = SurfaceCapability> {
  capability: T;
  specifier: string;
  exportName: string;
}

// For each active capability that provides the surface, the module specifier and
// export name to import. The seam shared by both host styles: a runtime loop feeds
// each specifier to a dynamic import, while a build-time host code-generates static
// imports from the same list.
export function resolveSurfaceModules<T extends SurfaceCapability>(
  active: readonly T[],
  surface: string,
  activation: ActivationResolver,
): CapabilitySurfaceModule<T>[] {
  return active.flatMap((capability) => {
    const entry = activation(surface, { directory: capability.directory, id: capability.id });
    if (!entry) return [];
    return [
      {
        capability,
        specifier: capabilitySpecifier(capability.packageName, entry.exportSubpath),
        exportName: entry.exportName,
      },
    ];
  });
}
