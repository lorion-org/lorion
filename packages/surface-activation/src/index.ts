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
